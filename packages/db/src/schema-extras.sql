-- ============================================================
-- SCHEMA EXTRAS — objets SQL non représentables dans le schéma
-- TypeScript (drizzle) : fonctions, vues, triggers, RLS,
-- contraintes métier, soft-delete, séquences.
--
-- Ces objets vivaient dans les migrations SQL manuelles
-- (packages/db/drizzle/0006..0033) qui n'ont jamais été appliquées
-- par drizzle-kit migrate (base créée par push). Ils sont recréés
-- à CHAQUE installation propre par seed-install, juste après la
-- migration du schéma (drizzle-clean).
--
-- IDEMPOTENT : peut être exécuté plusieurs fois.
-- ============================================================

-- ------------------------------------------------------------------
-- 0011_phase2_stock_engine.sql — contraintes, append-only, vue stock
-- ------------------------------------------------------------------

-- CHECK quantite >= 0 sur stocks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_stocks_quantite_non_negative') THEN
    ALTER TABLE stocks ADD CONSTRAINT ck_stocks_quantite_non_negative CHECK (quantite >= 0);
  END IF;
END $$;

-- CHECK quantite > 0 sur mouvements_stock
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mouvements_stock_quantite_positive') THEN
    ALTER TABLE mouvements_stock ADD CONSTRAINT ck_mouvements_stock_quantite_positive CHECK (quantite > 0);
  END IF;
END $$;

-- CHECK sens IN ('E','S') sur mouvements_stock
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mouvements_stock_sens') THEN
    ALTER TABLE mouvements_stock ADD CONSTRAINT ck_mouvements_stock_sens CHECK (sens IN ('E','S'));
  END IF;
END $$;

-- Fonction trigger append-only — empêche UPDATE et DELETE sur mouvements_stock
CREATE OR REPLACE FUNCTION fn_append_only_mouvements_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Mouvements_stock est append-only: interdiction de modifier';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Mouvements_stock est append-only: interdiction de supprimer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_append_only_mouvements_stock ON mouvements_stock;
CREATE TRIGGER trg_append_only_mouvements_stock
  BEFORE UPDATE OR DELETE ON mouvements_stock
  FOR EACH ROW EXECUTE FUNCTION fn_append_only_mouvements_stock();

-- Vue v_stock_total_base — stock total par produit/agence en équivalent unité de base
CREATE OR REPLACE VIEW v_stock_total_base AS
SELECT
  su.produit_id,
  su.agence_id,
  SUM(COALESCE(pu.facteur_vers_base, 1) * su.quantite) AS total_base,
  COUNT(DISTINCT su.unite_id) AS nb_unites
FROM stocks_unites su
LEFT JOIN produit_unites pu ON pu.produit_id = su.produit_id AND pu.unite_id = su.unite_id
GROUP BY su.produit_id, su.agence_id;

CREATE INDEX IF NOT EXISTS idx_stocks_unites_produit_agence_unite
  ON stocks_unites(produit_id, agence_id, unite_id);

-- ------------------------------------------------------------------
-- 0012_phase3_transfer_workflow.sql — read models quotidiens
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_read_models(p_agence_id integer DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_date date := CURRENT_DATE;
BEGIN
  INSERT INTO faits_ventes_quotidiens (agence_id, date, total_ventes, montant_total, montant_paye, remise_total, nombre_produits, calcule_le)
  SELECT
    v.agence_id,
    v_date,
    COUNT(DISTINCT v.id),
    COALESCE(SUM(CAST(v.montant_total AS numeric)), 0),
    COALESCE(SUM(CAST(v.montant_paye AS numeric)), 0),
    COALESCE(SUM(CAST(v.remise AS numeric)), 0),
    COALESCE(SUM(vl.quantite), 0),
    now()
  FROM ventes v
  LEFT JOIN ventes_lignes vl ON vl.vente_id = v.id
  WHERE v.statut = 'termine'
    AND CAST(v.createdAt AS date) = v_date
    AND (p_agence_id IS NULL OR v.agence_id = p_agence_id)
  GROUP BY v.agence_id
  ON CONFLICT (agence_id, date)
  DO UPDATE SET
    total_ventes = EXCLUDED.total_ventes,
    montant_total = EXCLUDED.montant_total,
    montant_paye = EXCLUDED.montant_paye,
    remise_total = EXCLUDED.remise_total,
    nombre_produits = EXCLUDED.nombre_produits,
    calcule_le = now();

  INSERT INTO faits_stock_quotidiens (agence_id, date, total_produits, valeur_stock, produits_rupture, alerte_stock, calcule_le)
  SELECT
    s.agence_id,
    v_date,
    COUNT(DISTINCT s.produit_id),
    COALESCE(SUM(CAST(s.quantite AS numeric) * CAST(p.prix_vente AS numeric)), 0),
    COUNT(DISTINCT CASE WHEN s.quantite = 0 THEN s.produit_id END),
    COUNT(DISTINCT CASE WHEN s.quantite < p.seuil_alerte THEN s.produit_id END),
    now()
  FROM stocks s
  JOIN produits p ON p.id = s.produit_id
  WHERE (p_agence_id IS NULL OR s.agence_id = p_agence_id)
  GROUP BY s.agence_id
  ON CONFLICT (agence_id, date)
  DO UPDATE SET
    total_produits = EXCLUDED.total_produits,
    valeur_stock = EXCLUDED.valeur_stock,
    produits_rupture = EXCLUDED.produits_rupture,
    alerte_stock = EXCLUDED.alerte_stock,
    calcule_le = now();

  INSERT INTO faits_caisse_quotidiens (agence_id, date, total_entrees, total_sorties, operations_count, calcule_le)
  SELECT
    c.agence_id,
    v_date,
    COALESCE(SUM(CASE WHEN mc.type = 'entree' THEN CAST(mc.montant AS numeric) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN mc.type = 'sortie' THEN CAST(mc.montant AS numeric) ELSE 0 END), 0),
    COUNT(mc.id),
    now()
  FROM mouvements_caisse mc
  JOIN caisses c ON c.id = mc.caisse_id
  WHERE CAST(mc.createdAt AS date) = v_date
    AND (p_agence_id IS NULL OR c.agence_id = p_agence_id)
  GROUP BY c.agence_id
  ON CONFLICT (agence_id, date)
  DO UPDATE SET
    total_entrees = EXCLUDED.total_entrees,
    total_sorties = EXCLUDED.total_sorties,
    operations_count = EXCLUDED.operations_count,
    calcule_le = now();
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_ventes_created_at_statut ON ventes(created_at, statut);
CREATE INDEX IF NOT EXISTS idx_mouvements_caisse_created_at ON mouvements_caisse(created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faits_ventes_quotidiens_agence_id_date_key') THEN
    ALTER TABLE faits_ventes_quotidiens ADD CONSTRAINT faits_ventes_quotidiens_agence_id_date_key UNIQUE (agence_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faits_stock_quotidiens_agence_id_date_key') THEN
    ALTER TABLE faits_stock_quotidiens ADD CONSTRAINT faits_stock_quotidiens_agence_id_date_key UNIQUE (agence_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faits_caisse_quotidiens_agence_id_date_key') THEN
    ALTER TABLE faits_caisse_quotidiens ADD CONSTRAINT faits_caisse_quotidiens_agence_id_date_key UNIQUE (agence_id, date);
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 0016_apply_rls_policies.sql — fonctions de contexte + RLS
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_current_agence_id(agence_id integer)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_agence_id', agence_id::text, false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.current_agence_id()
RETURNS integer AS $$
BEGIN
  RETURN current_setting('app.current_agence_id')::integer;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.belongs_to_agence(row_agence_id integer)
RETURNS boolean AS $$
BEGIN
  RETURN row_agence_id = public.current_agence_id();
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'achats', 'achats_lignes', 'alertes_stock', 'bons_reception',
    'caisses', 'clients', 'depenses', 'dettes_fournisseurs',
    'emplacements', 'employes',
    'faits_caisse_quotidiens', 'faits_stock_quotidiens', 'faits_ventes_quotidiens',
    'fournisseurs', 'inventaires', 'inventaires_sessions',
    'lignes_bon_reception', 'lignes_retour', 'listes_scolaires',
    'mouvements_caisse', 'mouvements_stock',
    'postes_vente', 'rachats', 'rachats_lignes',
    'sessions_caisse', 'stocks', 'stocks_unites',
    'transferts_stock',
    'utilisateurs', 'ventes', 'ventes_lignes'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

      CASE tbl
        WHEN 'achats', 'alertes_stock', 'bons_reception',
             'caisses', 'depenses', 'dettes_fournisseurs',
             'emplacements', 'employes',
             'faits_caisse_quotidiens', 'faits_stock_quotidiens', 'faits_ventes_quotidiens',
             'inventaires', 'inventaires_sessions',
             'mouvements_stock', 'postes_vente', 'rachats',
             'stocks', 'stocks_unites', 'utilisateurs', 'ventes'
        THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (belongs_to_agence(agence_id));', tbl);

        WHEN 'clients', 'fournisseurs', 'listes_scolaires' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (agence_id IS NULL OR belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (agence_id IS NULL OR belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (agence_id IS NULL OR belongs_to_agence(agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (belongs_to_agence(agence_id));', tbl);

        WHEN 'transferts_stock' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (belongs_to_agence(depuis_agence_id) OR belongs_to_agence(vers_agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (belongs_to_agence(depuis_agence_id) OR belongs_to_agence(vers_agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (belongs_to_agence(depuis_agence_id) OR belongs_to_agence(vers_agence_id));', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (belongs_to_agence(depuis_agence_id) OR belongs_to_agence(vers_agence_id));', tbl);

        WHEN 'mouvements_caisse', 'sessions_caisse' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM caisses WHERE caisses.id = %I.caisse_id AND belongs_to_agence(caisses.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM caisses WHERE caisses.id = %I.caisse_id AND belongs_to_agence(caisses.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM caisses WHERE caisses.id = %I.caisse_id AND belongs_to_agence(caisses.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM caisses WHERE caisses.id = %I.caisse_id AND belongs_to_agence(caisses.agence_id)));', tbl, tbl);

        WHEN 'ventes_lignes' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM ventes WHERE ventes.id = %I.vente_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM ventes WHERE ventes.id = %I.vente_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM ventes WHERE ventes.id = %I.vente_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM ventes WHERE ventes.id = %I.vente_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);

        WHEN 'achats_lignes' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM achats WHERE achats.id = %I.achat_id AND belongs_to_agence(achats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM achats WHERE achats.id = %I.achat_id AND belongs_to_agence(achats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM achats WHERE achats.id = %I.achat_id AND belongs_to_agence(achats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM achats WHERE achats.id = %I.achat_id AND belongs_to_agence(achats.agence_id)));', tbl, tbl);

        WHEN 'rachats_lignes' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM rachats WHERE rachats.id = %I.rachat_id AND belongs_to_agence(rachats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM rachats WHERE rachats.id = %I.rachat_id AND belongs_to_agence(rachats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM rachats WHERE rachats.id = %I.rachat_id AND belongs_to_agence(rachats.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM rachats WHERE rachats.id = %I.rachat_id AND belongs_to_agence(rachats.agence_id)));', tbl, tbl);

        WHEN 'lignes_retour' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM retours JOIN ventes ON ventes.id = retours.vente_id WHERE retours.id = %I.retour_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM retours JOIN ventes ON ventes.id = retours.vente_id WHERE retours.id = %I.retour_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM retours JOIN ventes ON ventes.id = retours.vente_id WHERE retours.id = %I.retour_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM retours JOIN ventes ON ventes.id = retours.vente_id WHERE retours.id = %I.retour_id AND belongs_to_agence(ventes.agence_id)));', tbl, tbl);

        WHEN 'lignes_bon_reception' THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM bons_reception WHERE bons_reception.id = %I.bon_reception_id AND belongs_to_agence(bons_reception.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM bons_reception WHERE bons_reception.id = %I.bon_reception_id AND belongs_to_agence(bons_reception.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM bons_reception WHERE bons_reception.id = %I.bon_reception_id AND belongs_to_agence(bons_reception.agence_id)));', tbl, tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM bons_reception WHERE bons_reception.id = %I.bon_reception_id AND belongs_to_agence(bons_reception.agence_id)));', tbl, tbl);

        ELSE
          RAISE NOTICE 'No policy rule defined for table %', tbl;
      END CASE;
    ELSE
      RAISE NOTICE 'Table % does not exist yet, skipping RLS', tbl;
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- 0018_soft_delete.sql — colonnes deleted_at / deleted_by
-- ------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'achats', 'achats_lignes', 'alertes_stock', 'bons_reception',
    'caisses', 'clients', 'comptes', 'depenses', 'dettes_fournisseurs',
    'ecritures_journal', 'editeurs', 'emplacements', 'employes',
    'faits_caisse_quotidiens', 'faits_stock_quotidiens', 'faits_ventes_quotidiens',
    'fournisseurs', 'inventaires', 'inventaires_sessions',
    'lignes_bon_reception', 'lignes_ecriture_journal', 'lignes_retour',
    'listes_scolaires', 'lots',
    'mouvements_caisse', 'mouvements_stock',
    'paiements', 'postes_vente', 'produits',
    'rachats', 'rachats_lignes', 'remboursements_dettes', 'remboursements_fournisseurs',
    'retours', 'sessions_caisse', 'stocks', 'stocks_unites',
    'transferts_stock', 'utilisateurs', 'ventes', 'ventes_lignes'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      BEGIN
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;', tbl);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES utilisateurs(id);', tbl);
      END;
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- 0019_audit_logging.sql — audit automatique + contexte utilisateur
-- ------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'id'
    AND (is_identity = 'YES' OR column_default LIKE '%nextval%')
  ) THEN
    ALTER TABLE audit_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id INTEGER;
  v_action TEXT;
  v_entity_type TEXT;
  v_entity_id INTEGER;
  v_details JSONB;
BEGIN
  BEGIN
    v_user_id := current_setting('app.current_user_id')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_entity_type := TG_TABLE_NAME;
  v_details := '{}'::JSONB;

  -- entity_id est INTEGER dans audit_logs : les tables à identifiant UUID
  -- (editeurs, inventaires_sessions…) ne peuvent pas y être reportées → NULL.
  v_entity_id := NULL;
  BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      v_entity_id := NEW.id::integer;
    ELSE
      v_entity_id := OLD.id::integer;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_entity_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_details := jsonb_build_object('new', row_to_json(NEW)::JSONB);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_entity_id := NEW.id;
    v_details := jsonb_build_object(
      'old', row_to_json(OLD)::JSONB,
      'new', row_to_json(NEW)::JSONB,
      'changed_fields', (
        SELECT jsonb_agg(key)
        FROM jsonb_each(row_to_json(NEW)::JSONB) n
        JOIN jsonb_each(row_to_json(OLD)::JSONB) o USING (key)
        WHERE n.value IS DISTINCT FROM o.value
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_details := jsonb_build_object('old', row_to_json(OLD)::JSONB);
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_user_id, v_action, v_entity_type, v_entity_id, v_details::TEXT);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_current_user_id(user_id integer)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_id::text, false);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'achats', 'bons_reception', 'caisses', 'clients', 'comptes',
    'depenses', 'dettes_fournisseurs', 'ecritures_journal', 'editeurs',
    'employes', 'fournisseurs', 'inventaires', 'inventaires_sessions',
    'listes_scolaires', 'mouvements_caisse', 'mouvements_stock',
    'paiements', 'postes_vente', 'produits', 'rachats', 'retours',
    'sessions_caisse', 'stocks', 'transferts_stock', 'utilisateurs', 'ventes'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_insert ON %I;', tbl);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_update ON %I;', tbl);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_delete ON %I;', tbl);
      EXECUTE format('CREATE TRIGGER trg_audit_insert AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION log_audit_event();', tbl);
      EXECUTE format('CREATE TRIGGER trg_audit_update AFTER UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION log_audit_event();', tbl);
      EXECUTE format('CREATE TRIGGER trg_audit_delete AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_audit_event();', tbl);
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- 0020_generalized_archive.sql — archivage générique
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS archives (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER NOT NULL,
  agence_id INTEGER REFERENCES agences(id),
  snapshot JSONB NOT NULL,
  archived_by INTEGER REFERENCES utilisateurs(id),
  reason TEXT,
  created_at TIMESTAMP DEFAULT now(),
  restored_at TIMESTAMP,
  restored_by INTEGER REFERENCES utilisateurs(id)
);

CREATE INDEX IF NOT EXISTS idx_archives_entity ON archives(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_archives_agence ON archives(agence_id);
CREATE INDEX IF NOT EXISTS idx_archives_created ON archives(created_at DESC);

ALTER TABLE archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON archives;
DROP POLICY IF EXISTS tenant_isolation_insert ON archives;
DROP POLICY IF EXISTS tenant_isolation_update ON archives;
DROP POLICY IF EXISTS tenant_isolation_delete ON archives;

CREATE POLICY tenant_isolation_select ON archives FOR SELECT USING (belongs_to_agence(agence_id));
CREATE POLICY tenant_isolation_insert ON archives FOR INSERT WITH CHECK (belongs_to_agence(agence_id));
CREATE POLICY tenant_isolation_update ON archives FOR UPDATE USING (belongs_to_agence(agence_id));
CREATE POLICY tenant_isolation_delete ON archives FOR DELETE USING (belongs_to_agence(agence_id));

CREATE OR REPLACE FUNCTION public.archive_row(
  p_table_name TEXT,
  p_row_id INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_snapshot JSONB;
  v_agence_id INTEGER;
  v_user_id INTEGER;
  v_archive_id BIGINT;
  v_row_exists BOOLEAN;
BEGIN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND deleted_at IS NULL)', p_table_name)
    INTO v_row_exists USING p_row_id;

  IF NOT v_row_exists THEN
    RAISE EXCEPTION 'Row not found or already deleted in % with id %', p_table_name, p_row_id;
  END IF;

  EXECUTE format('SELECT row_to_json(%I)::JSONB FROM %I WHERE id = $1', p_table_name, p_table_name)
    INTO v_snapshot USING p_row_id;

  BEGIN
    v_agence_id := (v_snapshot->>'agence_id')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_agence_id := NULL;
  END;

  BEGIN
    v_user_id := current_setting('app.current_user_id')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  INSERT INTO archives (entity_type, entity_id, agence_id, snapshot, archived_by, reason)
  VALUES (p_table_name, p_row_id, v_agence_id, v_snapshot, v_user_id, p_reason)
  RETURNING id INTO v_archive_id;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $1 WHERE id = $2', p_table_name)
    USING v_user_id, p_row_id;

  RETURN v_archive_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.restore_row(p_archive_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_record RECORD;
  v_user_id INTEGER;
BEGIN
  SELECT * INTO v_record FROM archives WHERE id = p_archive_id AND restored_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive % not found or already restored', p_archive_id;
  END IF;

  BEGIN
    v_user_id := current_setting('app.current_user_id')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  EXECUTE format('UPDATE %I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', v_record.entity_type)
    USING v_record.entity_id;

  UPDATE archives SET restored_at = now(), restored_by = v_user_id WHERE id = p_archive_id;

  RETURN v_record.entity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------
-- Séquences de génération de code-barres internes (état d'origine)
-- ------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS seq_lip_barcode START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_lip_ag001_barcode START WITH 1 INCREMENT BY 1;
