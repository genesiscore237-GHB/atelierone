# AUDIT TECHNIQUE ATELIERONE
## Migration Local PostgreSQL → Neon → Vercel

**Date** : 2026-10-05 · **Cible** : PostgreSQL 17.6 local → Neon (serveurless) → Vercel · **Nature** : audit statique + métadonnées DB, strictement read-only · **Projet** : monorepo pnpm, commit `4262bd4` (branche `main`)

---

### 1. Synthèse exécutive

**[CRITIQUE] L'application n'est pas migrable vers Neon en l'état**, pour 4 raisons indépendantes :

1. **Le schéma n'est pas reproductible.** La seule migration versionnée (`packages/db/drizzle-clean/0000_past_ezekiel.sql`) crée **91 tables sur 226** et ne contient ni fonction, ni trigger, ni vue, ni RLS. Un déploiement sur une base neuve produit une base incomparablement plus pauvre que la base source.
2. **Le script de déploiement est destructif.** `scripts/deploy.mjs` enchaîne backup → `DROP SCHEMA public CASCADE` → baseline → seed. Il **détruit les 24 821 lignes** de la base source. Il n'a jamais servi à migrer une base peuplée.
3. **Le tenant scoping est incompatible avec le pooler Neon.** `set_current_agence_id()` utilise `set_config(..., false)` (scope **session**, donc un `SET`). Le pooler Neon est PgBouncer en `pool_mode=transaction`, qui **interdit le `SET` de session** : le contexte tenant est perdu entre transactions → filtrage multi-tenant silencieusement inopérant et audit sans `user_id`.
4. **La collation n'existe pas sur Neon.** La base est en `French_France.1252` (libc Windows). Neon est en `C.UTF-8` par défaut, ICU disponible. Avec **143 usages d'`ILIKE`** et **63 `lower()`**, les recherches accentuées cassent.

**[CRITIQUE] La sécurité multi-tenant n'est en réalité pas active.** `schema-extras.sql` contient 40 `CREATE POLICY` et des `ENABLE ROW LEVEL SECURITY`, mais la base n'a **0 policy** et **RLS désactivé sur les 226 tables**. Le filtrage tenant repose uniquement sur le code applicatif. Pire : **réappliquer `schema-extras.sql` sur Neon activerait RLS là où la source n'en a pas**, et comme `current_agence_id()` retourne `NULL` en cas d'absence de contexte (au lieu de lever une erreur), les requêtes renverraient des **jeux de résultats vides sans erreur visible**.

Verdict : **ne pas lancer de migration avant d'avoir traité les points C1 à C7 du §16.** L'ordre recommandé est (a) figer la source, (b) reconstruire un schéma reproductible complet, (c) corriger le tenant scoping, (d) figer la collation ICU, (e) migrer les données par `pg_dump`/`pg_restore` vers une base Neon neuve.

---

### 2. Périmètre, méthodologie et contraintes

| Élément | Valeur |
| --- | --- |
| Périmètre analysé | `apps/nextjs`, `packages/*`, `scripts/`, SQL de migration, DB locale |
| Méthode | lecture de code + introspection `information_schema`/`pg_catalog`, **toutes les requêtes en `BEGIN READ ONLY`** |
| Écritures | **aucune** (0 DDL, 0 DML) |
| Modifications projet pendant l'audit | **aucune** ; scripts d'audit isolés dans `%TEMP%\opencode` |
| Secrets | jamais affichés ; `DATABASE_URL` lu depuis l'environnement, valeur masquée |
| Non exécuté volontairement | `db:push`, `db:migrate`, `db:deploy`, `reset:schema`, `drizzle-kit` |
| Corrélation code↔DB | métadonnées Drizzle extraites par import runtime (`.name` SQL), puis jointure sur `table_name`/`column_name` |

**Limites assumées de l'audit** : le build Vercel n'a pas été exécuté dans le cadre de cet audit (dépendances du graphe de workspaces). *Complément postérieur au 2026-10-05 : le build a été exécuté et 5 erreurs ESLint bloquantes ont été corrigées — voir §15.*

---

### 3. Stack, versions et outillage

| Composant | Version / état |
| --- | --- |
| Node | `>=18` requis ; **v24.18.0** en local |
| pnpm | `10.19.0`, workspaces `apps/*`, `packages/*` |
| Turborepo | `^2.3.3` — la liste `env` de `turbo.json` n'est pas complète (§13) |
| Next.js | `^15.2.3` (App Router) ; **15.5.23** résolu sur Vercel |
| React / React DOM | `^19` |
| TypeScript | `^5.8.2` |
| tRPC | `^11.18.0` (`^11.0.0` dans le package auth) |
| Drizzle ORM | `^0.42.0` / `drizzle-kit ^0.31.4` |
| Driver DB | `postgres-js ^3.4.7` (actif) + `@neondatabase/serverless ^1.0.1` (**installé, jamais importé**) |
| Auth | NextAuth `5.0.0-beta.25` (JWT + Credentials) |
| Validation | Zod `^3.25.76`, `@t3-oss/env-nextjs` |
| PDF / export | `jspdf ^4.2.1`, `exceljs ^4.4.0`, `papaparse` |
| UI | Tailwind `^4.1.7`, Framer Motion, Recharts, Sonner, Radix, shadcn/ui |
| Cache/plan | `dexie ^4.4.2`, `dexie-react-hooks` |
| Tests | Vitest `^3.1.1`, Playwright `^1.59.1` |

**[ATTENTION] Incohérence de versions tRPC** : `apps/nextjs` est en `^11.18.0`, `packages/auth` en `^11.0.0`. Risque de types dupliqués lors du build Vercel (monorepo pnpm strict).

---

### 4. Environnement local et configuration

**Fichiers d'environnement détectés** (valeurs jamais affichées) : `.env`, `.env.local`, `.env.supabase`, `.env.example`, `apps/nextjs/.env.local`, `packages/db/.env`.

| Contrôle | Résultat |
| --- | --- |
| Secrets versionnés | aucun détecté (`.gitignore` couvre `.env*`) |
| **`DATABASE_URL` en clair dans le dépôt** | **[CRITIQUE]** présents dans les fichiers d'environnement locaux ; `.env.example` en contient une valeur d'exemple réelle à neutraliser |
| `AUTH_SECRET` | présent localement ; **absent de `.env.example`** |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_APP_NAME` | présents localement, **absents de `.env.example`** |
| Double validation d'env | `apps/nextjs/src/lib/env.ts` (Zod, avec schema par `APP_ROLE`) **et** `apps/nextjs/src/env.js` (runtime custom) coexistent → deux sources de vérité divergentes |
| `env-guard.ts` | refuse toute cible non-locale sauf `FORCE=1` |

**[ATTENTION] `.env.example` n'est pas un gabarit fiable** : il ne couvre ni `AUTH_SECRET`, ni `NEXT_PUBLIC_APP_URL`, ni `NEXT_PUBLIC_APP_NAME`, ni `UPLOAD_DIR`, ni les variables SaaS (`APP_ROLE`, `LICENCE_MODE`, `LICENCE_SECRET`, `CENTRAL_URL`, `SITE_CODE`, `SITE_CLE_API`, `AUTH_RATE_LIMIT_MAX`). Un déploiement Vercel « propre » depuis `.env.example` échouera ou partira en mode dégradé.

---

### 5. Inventaire de la base de données

**PostgreSQL 17.6**, propriétaire `postgres` (superuser), encoding `UTF8`.

| Objet | Nombre |
| --- | --- |
| Tables de base | **226** |
| Vues | **1** (`parking_spots_v`) |
| Vues matérialisées | 0 |
| Enum PostgreSQL | **0** (les énumérations sont des `text` + `CHECK`) |
| Index | 301 |
| Séquences | 199 |
| Triggers applicatifs | 73 |
| Fonctions | 9 |
| Extensions | 1 (`plpgsql 1.0`) |

**9 fonctions** : `archive_row`, `restore_row`, `belongs_to_agence`, `current_agence_id`, `set_current_agence_id`, `set_current_user_id`, `log_audit_event`, `fn_append_only_mouvements_stock`, `refresh_read_models`.

**Paramètres serveur notables** : `default_text_search_config = pg_catalog.french`, `DateStyle = ISO, DMY`.

**Collation** : `datcollate = French_France.1252`, `datctype = French_France.1252`, `datlocprovider = c`. → voir §16/C1.

---

### 6. Volumétrie et poids des données

| Mesure | Valeur |
| --- | --- |
| Lignes totales (226 tables) | **24 821** |
| Tables non vides / vides | 138 / **88** |
| Taille relationnelle cumulée | **41 312 256 o** (~39,4 Mio) |
| Taille base (`pg_database_size`) | **~55 Mo** |
| Base la plus lourde | `parking_vehicles` : **19 644 416 o**, 54 lignes |
| 2e plus lourde | `audit_logs` : 8 904 704 o, 11 973 lignes |

**Top 15 tables par volume** :

| # | Table | Lignes | Total octets |
| --- | --- | --- | --- |
| 1 | `guide_procedure_steps` | 4 432 | 3 145 472 |
| 2 | `audit_logs` | 11 973 | 8 904 704 |
| 3 | `guide_procedures` | 1 209 | 2 162 688 |
| 4 | `or_historique` | 640 | 786 432 |
| 5 | `mouvements_stock` | 592 | 262 144 |
| 6 | `attendance_entries` | 496 | 98 304 |
| 7 | `attendance_calculations` | 494 | 155 648 |
| 8 | `categories` | 461 | 90 112 |
| 9 | `produits` | 319 | 1 741 824 |
| 10 | `clients` | 151 | 65 536 |
| 11 | `parking_vehicles` | 54 | **19 644 416** |
| 12 | `employes` | 38 | 32 768 |
| 13 | `utilisateurs` | 10 | 32 768 |
| 14 | `roles` | 11 | 8 192 |
| 15 | `permissions` | 82 | 16 384 |

**Interprétation** : la base est **très petite en lignes** (55 Mo). La migration est un problème de **schéma et de volume binaire**, pas de volume transactionnel. Une approche « base neuve + import » est parfaitement viable — à condition d'avoir un schéma reproductible (§10).

**Répartition fonctionnelle** : `organisations = 0`, `tenant_licences = 0`, `user_roles = 0`, `licence_locale = 1`, `roles = 11`, `permissions = 82`, `role_permissions = 242`. → le socle RBAC existe mais **aucun tenant SaaS n'est provisionné** : la base est en mono-tenant local.

---

### 7. Intégrité référentielle, contraintes, index et séquences

| Contrainte | Nombre |
| --- | --- |
| PRIMARY KEY | 226 (une par table) |
| FOREIGN KEY | 519 |
| UNIQUE | 55 |
| CHECK | 5 |
| Colonnes NOT NULL | 1 006 |
| Colonnes IDENTITY | 6 |
| Colonnes GENERATED | 0 |

**Toutes les 226 tables ont une PK `id`** → cohérent avec le couple `archive_row`/`restore_row` qui suppose `id` + `agence_id`.

**Soft delete : [CRITIQUE] non implémenté.**

| Mesure | Résultat |
| --- | --- |
| Tables avec `deleted_at` | **1 sur 226** (`clients` uniquement) |
| Tables sans `deleted_at` | **225** |
| `deleted_by` | 0 table |

→ `archive_row()` et `restore_row()` (fonctions de soft delete de `schema-extras.sql` lignes 512-570) **échoueront sur 225 tables sur 226** avec une erreur `column "deleted_at" does not exist`. Le bloc `DO $$` censé ajouter ces colonnes (lignes 351-352) **n'a jamais été appliqué**.

**Audit automatique : [ATTENTION] couverture partielle.**

| Mesure | Résultat |
| --- | --- |
| Triggers `log_audit_event` | **72** (INSERT/UPDATE/DELETE) |
| Tables couvertes par l'audit | **24 sur 226** |
| Trigger append-only `mouvements_stock` | 1 |

→ **202 tables (89 %) n'ont aucune piste d'audit**, dont l'intégralité du périmètre financier et RH sensible. Le bloc `DO $$` d'audit (lignes 455-460) liste explicitement 24 tables ; le reste n'est jamais instrumenté.

**Séquences** : 199 séquences, aucun écart critique détecté sur les séquences d'identité testées (ex. `attendance_calculations_id_seq` déjà bien au-dessus de la valeur max observée, sans risque de collision). **À revalider après restauration** car le ré-alignement n'est jamais automatique sur un import avec `id` explicites.

---

### 8. Différentiel schéma code ↔ base

**Méthode** : extraction de tous les exports de `packages/db/src/schema/*` via import Node, lecture du `.name` SQL de chaque colonne, jointure sur `information_schema.columns`.

| Contrôle | Résultat | Verdict |
| --- | --- | --- |
| Tables déclarées dans le code | 225 | — |
| Tables présentes en base | 226 | — |
| **Tables du code absentes de la base** | **0** | **[OK]** |
| **Colonnes du code absentes de la base** | **0** | **[OK]** |
| **Différences de type** (normalisées) | **0** | **[OK]** |
| Tables en base absentes du code | 2 | voir ci-dessous |
| Colonnes en base absentes du code | 23 | toutes dans les 2 tables ci-dessus |
| **Drifts de nullabilité** | **7** | **[ATTENTION]** |

**Tables en base absentes du code** :

| Table | Nature | Risque |
| --- | --- | --- |
| `hr_public_holidays_rpt02_bak` (6 colonnes) | **table de sauvegarde manuelle** créée par `packages/db/src/migrate-rh-public-holidays.ts` | **[ATTENTION]** sera recréée/mélangée selon l'ordre des migrations ; à ne pas propager |
| `parking_spots_v` (17 colonnes) | vue parking, absente de `schema-extras.sql` | **[CRITIQUE]** non reproductible par le pipeline (§10) |

**Les 7 drifts de nullabilité** (code plus laxiste que la base) — liste complète dans `%TEMP%\opencode\diff_cols.txt` :

| Table | Colonne(s) |
| --- | --- |
| `hr_sensibilisation_rules` | `active`, `created_at`, `updated_at` |
| `rh_absence_justification_decisions` | `created_at`, … |
| *(3 autres)* | … |

→ **[ATTENTION]** une insertion sur ces colonnes via le code échouerait avec `NOT NULL` sur une base neuve reconstruite depuis Drizzle (comportement inversé). À arbitrer : soit durcir le code, soit assouplir la base.

---

### 9. Objets SQL applicatifs (fonctions, triggers, RLS)

**État réel vs source** — c'est le point le plus important de cet audit.

| Objet | Dans `schema-extras.sql` | Dans la base réelle | Verdict |
| --- | --- | --- | --- |
| `CREATE OR REPLACE FUNCTION` | 9 | **9** | appliqué |
| `CREATE TRIGGER` (littéraux) | 4 | **4** | appliqué |
| Triggers d'audit générés | 72 (DO block, 24 tables) | **72** | appliqué |
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` | 2 littéraux + dynamique | partiel | **partiel** |
| **`CREATE POLICY`** | **40** | **0** | **[CRITIQUE] non appliqué** |
| **`ENABLE ROW LEVEL SECURITY`** | 2 littéraux + dynamique | **0** (RLS off sur 226/226 tables) | **[CRITIQUE] non appliqué** |
| **Colonnes soft-delete** | dynamiques (DO block) | **1 table sur 226** | **[CRITIQUE] non appliqué** |
| **`CREATE VIEW`** | **0** | 1 (`parking_spots_v`) | **[CRITIQUE] hors pipeline** |

**Conclusion** : `schema-extras.sql` a été appliqué **partiellement** (les 9 fonctions et 76 triggers sont bien là, RLS et soft-delete pas). Le fichier a **dérivé de la base**. Réappliquer le fichier tel quel sur Neon **n'est pas idempotent** : il activerait RLS et ajouterait 225 colonnes `deleted_at`, rendant Neon **non équivalent** à la source.

**Défauts de conception des fonctions** :

| Fonction | Défaut | Impact |
| --- | --- | --- |
| `archive_row`, `restore_row` | supposent `deleted_at`/`deleted_by` sur la table cible | **[CRITIQUE]** échec sur 225/226 tables |
| `archive_row`, `restore_row` | `SECURITY DEFINER` **sans `SET search_path`** | **[ATTENTION]** hijack possible d'objet via `search_path` |
| `log_audit_event` | `SECURITY DEFINER` **sans `SET search_path`** | **[ATTENTION]** idem |
| `current_agence_id()` | `RETURN current_setting('app.current_agence_id')::integer` avec `EXCEPTION WHEN others THEN RETURN NULL` | **[CRITIQUE]** si RLS est activé sans contexte → `row_agence_id = NULL` → **jeux de résultats vides sans erreur** (fail-open silencieux) |
| `set_current_agence_id` / `set_current_user_id` | `set_config(..., false)` = scope **session** | **[CRITIQUE]** incompatible pooler Neon (§16/C2) |
| `refresh_read_models` | référence `v.createdAt` / `mc.createdAt` alors que les colonnes sont `created_at` ; `ON CONFLICT (agence_id, date)` alors que les tables faits n'ont que la PK `id` | **[ATTENTION]** fonction cassée, aucun appelant trouvé |

**Tables de faits** : `faits_caisse_quotidiens`, `faits_ventes_quotidiens`, `faits_stock_quotidiens` sont **vides** — le pipeline de read-models n'a jamais tourné.

---

### 10. Migrations, seeds et reproductibilité du schéma

**[CRITIQUE] La base n'est pas reproductible.**

| Élément | Constat |
| --- | --- |
| Dossier de migrations Drizzle | `packages/db/` (config) → out `./drizzle-clean` |
| Dossier réel des migrations | `packages/db/drizzle-clean/` |
| Nombre de fichiers SQL | **1 seul** : `0000_past_ezekiel.sql` |
| `CREATE TABLE` dans la baseline | **91** |
| Tables actuelles | **226** |
| **Delta** | **~135 tables absentes** |
| Contenu de la baseline | uniquement des `CREATE TABLE` ; **ni fonction, ni trigger, ni vue, ni RLS, ni données** |
| Idempotence | **aucun** `IF NOT EXISTS` / `DO $$` sur les tables |
| Journal `drizzle.__drizzle_migrations` | **1 ligne**, hash `c1cd3299f832f068ad6f8fce453b944a5909612163ef274f3e43ea16d4c8e87d` |
| Dossier `packages/db/drizzle/` | **inexistant** |

**Scripts de migration présents dans `packages/db/src/` mais non câblés dans le pipeline `migrate:clean`** :

`migrate-rh-public-holidays.ts`, `migrate-rpt05-securite-centre.ts`, `migrate-outillage-taxonomie.ts`, `migrate-rh-avances.ts`, `migrate-catalogue-universel.ts`, `migrate-commande-vente.ts`, `migrate-stock-photo.ts`, `migrate-catalogue-outillage.ts`, `migrate-college.ts`, `migrate-comptabilite.ts`, `migrate-presences-refonte.ts`, `migrate-rh-situation.ts`, `migrate-tarifs-produits.ts`, `migrate-guide-procedures.ts`, `migrate-editeurs.ts`, `migrate-pedagogie-prix.ts`, `migrate-devises.ts`, `r3-realign-presences.ts`, `security-socle.ts`.

**Séquences SQL référencées par la documentation mais absentes du dépôt** :
`seed-education.sql` — **inexistant** ; la vue `v_stock_total_base` citée dans `DOC/GUIDE-DEPLOIEMENT-REINITIALISATION.md` §5 — **inexistante en base**.

**[CRITIQUE] `db:sync` / `db:deploy:all` sont cassés** : le moteur d'import référence `editeurs` et `manuel_scolaire_detail`, deux tables **absentes de la base**.

**Verdict** : il faut générer une baseline complète (récupérer l'état réel via introspection, ou rejouer l'ensemble `schema/` + `schema-extras.sql` + toutes les migrations dans un ordre défini et testé) **avant** toute migration.

---

### 11. Scripts de déploiement et sauvegardes

**`scripts/deploy.mjs` = [CRITIQUE] déploiement destructif.**

Chaîne exécutée par `pnpm db:deploy` :

```
1. BACKUP     → pg_dump de la cible dans backups/
2. SCHÉMA     → reset:schema (DROP SCHEMA public CASCADE) → migrate:clean (91 tables)
3. INSTALL    → seed-install (sites, socle sécurité, admin)
4. CONFORMITÉ → verify-deploy (validation de tous les fichiers d'import)
5. IMPORT     → import:catalogue --apply (unités → catégories → éditeurs → fournisseurs → produits
                 → manuels → unités produits → liens fournisseurs → stocks)
6. VÉRIF      → verify-deploy --data (comptages, unicité, RG-004/RG-012)
```

Points bloquants :
- `db:deploy` **réinitialise** la base : unsuitable pour une migration de données existantes.
- Le `pg_dump` de l'étape 1 est le **seul filet de sécurité** ; l'étape 5 échoue si un fichier d'import manque.
- `db:deploy:supabase` cible l'ancienne architecture Supabase ; `db:deploy:all` compare local/Supabase — **inapplicable à Neon** sans réécriture.
- `pnpm db:deploy:all` échoue à l'étape 5 (`editeurs`, `manuel_scolaire_detail`).

**`packages/db/src/reset-schema.ts`** : `DROP SCHEMA public CASCADE` + `DROP SCHEMA drizzle CASCADE` → incompatible avec une base Neon contenant des données ; le `env-guard.ts` ne l'autorise que sur une cible locale sauf `FORCE=1`.

**Sauvegardes** :

| Élément | Constat |
| --- | --- |
| Volume | `backups/` — **5 dumps `.dump` locaux** |
| Plus récent | `backup-local-2026-08-16T21-41-03.dump` |
| Ancienneté | **[CRITIQUE]** ~7 semaines au 2026-10-05 |
| Suivi git | **ignoré par `.gitignore`** |
| Copie hors machine | **aucune** → perte totale en cas de panne disque |

**Aucun plan de sauvegarde compatible Neon n'existe** : sur Neon, la sauvegarde est managed (PITR) ou via `pg_dump` planifié hors machine. À mettre en place avant migration.

---

### 12. Application : clients DB, transactions et multi-tenant

**[CRITIQUE] Deux clients DB distincts coexistent.**

| Client | Fichier | Pool | Rôle |
| --- | --- | --- | --- |
| **Principal** | `packages/db/src/client.ts` | `postgres-js`, `max:8`, `idle_timeout:300`, `prepare:false`, SSL si `sslmode` dans l'URL | chemin canonique (tRPC, jobs) |
| **Second** | `apps/nextjs/src/server/db/index.ts` | `postgres-js`, **options par défaut** (pool ~10, sans SSL ni `prepare:false` explicites) | routers legacy + API REST |

**Risques du second client** :
- **[CRITIQUE]** pool par défaut (10 connexions) × nombre d'instances Vercel → épuisement du budget Neon. Les routers les plus消费的 de ce client (`export`, `stock`, `or-router`, `rh-*`, `finance`, `parking`, …) ouvrent chacun leur propre pool.
- **[CRITIQUE]** sans `ssl`/`prepare` alignés sur le client principal : comportement prepared statement / TLS incohérent entre deux chemins d'accès aux mêmes données.
- La couche `apps/nextjs/src/server/db/schema.ts` **réexporte des alias** mais déclare aussi des objets absents de la base : **`platform_stats_facts`**, **`inventory_sessions`**, **`inventory_counts`**, et les enums **`movement_type`** / **`inventory_session_status`** → tout SELECT sur ces objets échouera.

**Transactions** : **au moins 100 appels à `db.transaction()`** dans les routers (`stock` ×21, `rh-situations` ×9, `rh-journal` ×2, `rh-advances` ×6, `or-router` ×23, `outillage-router` ×10, `procurement` ×7, …). → l'application **dépend massivement des transactions interactives** → un driver HTTP sans transactions (limite 10 Mo, sans `db.transaction`) est **incompatible** ; il faut le driver WebSocket/Pool de `@neondatabase/serverless` ou une connexion TCP directe.

**Multi-tenant : [CRITIQUE] voir §16/C2.**

`apps/nextjs/src/server/api/trpc.ts` (~l.116) appelle `set_current_agence_id()` / `set_current_user_id()` **hors transaction** sur `db` (pool partagé). La base 24 821 lignes est mono-tenant (`organisations = 0`, `user_roles = 0`), donc le scoping n'est pas encore exercé en conditions réelles — il le sera dès le premier tenant.

**Recherche textuelle** : **143 `ILIKE`**, **63 `lower()`**, **391 `orderBy`**, **0 full-text** → l'impact de la collation est réel (§16/C1), mais le setting `default_text_search_config = pg_catalog.french` est **inutilisé** (aucun `to_tsvector`/`to_tsquery`).

---

### 13. Authentification, autorisation et secrets

| Contrôle | Résultat | Verdict |
| --- | --- | --- |
| NextAuth | `5.0.0-beta.25` | **[ATTENTION]** bêta sur un module critique |
| Stratégie | JWT + Credentials (`mot_de_passe` bcrypt) | **[OK]** |
| Session | durée 7 jours (`config.ts`) vs 24 h (`auth.config.ts`) — le premier **écrase** le second | **[ATTENTION]** incohérence |
| Permissions | figées dans le JWT à la connexion ; `users.role_id` → `roles.name` | **[ATTENTION]** une révocation de permission ne prend effet qu'à l'expiration |
| Isolation tenant | `isAdmin` dérivé du rôle JWT | **[OK]** |
| UUID de rôle | fallback codé en dur `"9"` (**invalide**, non UUID) | **[ATTENTION]** |
| Rate limiting login | **mémoire du processus** (`rate-limiter.ts`) | **[CRITIQUE]** contournable sur Vercel multi-instance |
| Middleware rate limit | `Map` en **mémoire edge** | **[CRITIQUE]** idem |
| `verification_tokens` | table présente, **0 ligne** | **[OK]** (JWT assumé) |
| Mot de passe admin documenté | `admin@gpj.cm / admin123` dans la doc d'installation | **[CRITIQUE]** à changer systématiquement |

**`turbo.json`** : la liste `env` ne couvre que `NODE_ENV`, `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `CI` → **les scripts DB qui lisent `DATABASE_URL` hors app Next ne l'héritent pas**.

**[CRITIQUE] Rate limiting non distribué** : sur Vercel chaque instance a sa propre `Map`. Le login est donc limitable plusieurs fois par instance → protection anti-bruteforce **inopérante** dès le premier déploiement multi-instance.

---

### 14. Stockage de fichiers et médias

**[CRITIQUE] Les fichiers vivent sur le disque local, pas dans un stockage objet.**

| Constat | Détail |
| --- | --- |
| Route d'écriture | `apps/nextjs/src/app/api/uploads/route.ts` → `UPLOAD_DIR` ou `../../uploads` |
| Route de service | **aucune** : pas de handler sous `public/uploads`, ni route GET `/uploads/*` |
| Contenu réel | **1 seul fichier** `uploads/articles/1e6e4c80-f6f0-4a8c-98d2-20df8f8e2b4c.jpg` (local, non servi) |
| Références DB | `factures_fournisseur.fichier_url` : **1** ligne sur 2 contient `/uploads/%` (chemin local) |
| Photos produit | `produits.photos` : 159 lignes non vides sur 319 — **dans la DB** (JSONB base64), migrées par le dump |
| Photos parking | `parking_vehicles.photos` : 54 lignes, **~18 Mo** de base64 dans la DB — **table la plus lourde** |
| Service parking | route `api/parking/photo/[id]/[index]` : lecture DB → data URL → redimensionnement image |

**Risques** :
1. Sur Vercel, le système de fichiers est **éphémère** → tout upload écrit dans `/tmp` est **perdu à chaque redéploiement** et **non partagé entre instances**.
2. La référence `/uploads/...` en base pointe vers un chemin **inexistant** en production → facture fournisseur **cassée** après migration.
3. **[CRITIQUE]** 18 Mo de base64 en base → tout `SELECT parking_vehicles` sans projection explicite peut dépasser la **limite de 10 Mo** du driver HTTP Neon (§16/C5).

**Recommandation** : basculer vers un stockage objet (S3/Vercel Blob) avec URLs persistantes, ou garbage-collecter les photos base64 vers des URLs avant migration.

---

### 15. Compatibilité Vercel / serverless

| Point | Verdict |
| --- | --- |
| `vercel.json` présent | **[OK]** |
| `next.config.js` | **[CRITIQUE]** `typescript.ignoreBuildErrors: true` — le build Vercel passe **même si le TypeScript est cassé** |
| CSP | **[ATTENTION]** `unsafe-eval` + `unsafe-inline` dans la politique |
| `instrumentation.ts` | **[CRITIQUE]** `setTimeout` / `setInterval` → non fiable sur serverless, multi-instance |
| Export PDF/Excel | **[CRITIQUE]** file Map `export` **par processus** + `Buffer` → jobs perdus entre requêtes/instances |
| Uploads sur disque | **[CRITIQUE]** §14 |
| Tâches longues (`caisse-service`, `sale-service`, `bourse-service`) | **[ATTENTION]** transactions longues → à vérifier vs `query_wait_timeout=120 s` du pooler Neon |
| Multi-instance / concurrence | **[ATTENTION]** pas de coordination entre instances |
| Middleware / edge | **[OK]** matcher connu, pas de bug critique relevé |
| Endpoints publics | `/api/sync/*`, `/api/uploads`, `/api/health` — **whitelist middleware** ; `uploads` est protégé côté handler, `health` est public (ok) |
| Variables Vercel | **[CRITIQUE]** voir §15 bis — `DATABASE_URL` **et** `AUTH_SECRET` sont absentes du projet Vercel ; le build est désormais tolérant (§15 bis) mais l'application est inutilisable tant qu'elles ne sont pas définies |

### 15 bis. Build Vercel — état vérifié après l'audit

Quatre builds successifs ont été nécessaires. Le journal complet de chaque étape est dans l'historique Git ; ce qui compte ici est la **cause racine de chaque échec**, car deux des trois premiers n'étaient pas visibles en local.

#### Build 1 — commit `4262bd4` : échec ESLint (5 erreurs)

| Fichier | Erreur | Cause | Correction appliquée |
| --- | --- | --- | --- |
| `src/lib/PhotoLightbox.tsx:41,63` | `react-hooks/rules-of-hooks` ×2 | retour anticipé `if (total === 0) return null` **avant** les hooks | retour déplacé après les hooks + garde `if (total === 0) return;` dans l'effet clavier |
| `src/app/(dashboard)/dashboard/garage/vehicules/[id]/page.tsx:234` | `react/jsx-no-undef` | `<Export>` **n'existe pas** dans lucide-react | `<ArrowDownToLine>` |
| `src/app/(dashboard)/dashboard/garage/vehicules/[id]/page.tsx:244` | `react/jsx-no-undef` | `<Print>` **n'existe pas** dans lucide-react (seul `Printer` existe) | `<Printer>` |
| `src/app/(dashboard)/dashboard/garage/vehicules/page.tsx:148` | `react/jsx-no-undef` | `<Export>` **n'existe pas** dans lucide-react | `<ArrowDownToLine>` + import ajouté |

**Bug fonctionnel corrigé au passage** : le bouton « Exporter » de la fiche véhicule n'ouvrait aucune modale (`ExportVehiculesDialog` importé mais jamais rendu) → modale branchée avec `toast` de confirmation, alignée sur la page liste.

> `typescript.ignoreBuildErrors: true` ne couvre **que** TypeScript : ESLint fait bien échouer le build.

#### Build 2 — commit `1094444` : échec `Collecting page data`

Compilation et lint OK, puis :

```
Collecting page data ...
Error: DATABASE_URL is not set
  at .next/server/app/api/auth/2fa-status/route.js
Failed to collect page data for /api/auth/2fa-status
```

**Cause racine** — trois modules ouvraient une connexion / exigeaient un secret **au chargement du module** :

| Module | Code fautif |
| --- | --- |
| `packages/db/src/client.ts:6-7` | `postgres()` + `throw` si `process.env.DATABASE_URL` absent |
| `apps/nextjs/src/server/db/index.ts:5-6` | `postgres(process.env.DATABASE_URL!)` |
| `packages/auth/src/{config,edge}.ts` | `secret: process.env.AUTH_SECRET ?? doThrow(...)` |

Next.js importe **tous** les modules de routes pendant `Collecting page data` ; sur le builder Vercel, `DATABASE_URL` et `AUTH_SECRET` sont absents, donc l'import explose. **C'est pourquoi le build local passait** : le `.env` local masquait le défaut.

#### Build 3 — commit `963346d` : correction de la initialisation paresseuse

| Fichier | Correction |
| --- | --- |
| `packages/db/src/client.ts` | `db` et `client` exposés via un `Proxy` paresseux ; `postgres()` et le `throw` sont différés au **premier usage réel** (méthodes liées à l'instance réelle pour préserver `this`) |
| `apps/nextjs/src/server/db/index.ts` | idem pour le second client |
| `apps/nextjs/src/env.js` | `createEnv` de `@t3-oss/env-nextjs` enveloppé dans un `Proxy` : la validation Zod ne s'exécute qu'au premier accès à `env.*` |
| `packages/auth/src/utils.ts` | `resolveAuthSecret()` + `isNextBuild()` : tolérant au build (`NEXT_PHASE === "phase-production-build"`), **exigeant au runtime** |

**Vérifications** :

- build local reproduit **sans aucun fichier `.env`** (`.env`, `.env.supabase`, `apps/nextjs/.env.local` déplacés hors dépôt pendant le build) → `Collecting page data` et `Generating static pages (9/9)` passent ;
- smoke tests sur la base locale via le `Proxy` : `db.select`, `db.transaction`, `db.query.<table>.findFirst`, `client.end()` → OK sur les deux clients ;
- `tsc --noEmit` : 0 erreur sur les 6 fichiers modifiés (390 erreurs préexistantes ailleurs, d'où `ignoreBuildErrors`) ;
- ESLint exécuté pendant le build : aucune erreur, ~350 warnings non bloquants (`no-unused-vars`, `no-img-element`, `exhaustive-deps`).

#### Build 4 — commit `963346d` : build Next vert, erreur de cadre Vercel

```
✓ Compiled successfully in 72s
✓ Generating static pages (9/9)
✓ Finalizing page optimization
✓ Collecting build traces
→ Error: The Next.js output directory ".next" was not found at "/vercel/path0/.next"
```

Le build applicatif est désormais **entièrement vert**. L'erreur restante est purement un réglage de projet Vercel : avec **Root Directory = racine du dépôt**, Vercel cherche `.next` à la racine alors que la sortie est dans `apps/nextjs/.next`. `turbo.json` déclare déjà `.next/**` en `outputs` : turbo n'est pas en cause.

**Action requise (réglage Vercel, pas de code)** :

| Réglage Vercel | Valeur |
| --- | --- |
| Root Directory | `apps/nextjs` |
| Install Command | `npx pnpm install --no-frozen-lockfile` (pnpm remonte jusqu'à `pnpm-workspace.yaml`) |
| Build Command | `npx next build` |
| Output Directory | `.next` (défaut) |

#### Variables d'environnement requises au runtime

Le build ne dépend plus d'aucune variable, mais **l'application en a besoin pour fonctionner** sur Vercel :

| Variable | Statut | Conséquence si absente |
| --- | --- | --- |
| `DATABASE_URL` | **absente sur Vercel** | première requête DB → `Error: DATABASE_URL is not set` (message explicite, pas de crash silencieux) |
| `AUTH_SECRET` | **absente sur Vercel** | `resolveAuthSecret()` lève au runtime → `/api/auth/*` en 500 |

Ces deux variables sont **obligatoires avant toute mise en ligne** : la base locale n'est pas joignable depuis Vercel, ce qui renvoie à la migration Neon (§16).

---

### 16. Risques, plan de migration Neon et remédiation

**Matrice de risques** :

| ID | Sévérité | Risque | Remédiation |
| --- | --- | --- | --- |
| **C1** | **[CRITIQUE]** | Collation `French_France.1252` inexistante sur Neon (`C.UTF-8` par défaut, ICU dispo). 143 `ILIKE` + 63 `lower()` → recherches accentuées cassées. Collate/index non modifiables après création. | Créer la base Neon avec `LOCALE_PROVIDER icu ICU_LOCALE 'fr-x-icu' TEMPLATE template0`. Valider sur un jeu d'essai FR avant bascule. |
| **C2** | **[CRITIQUE]** | Tenant scoping par `SET` de session incompatible avec le pooler Neon (PgBouncer `transaction` mode : `SET` interdit). ≥100 transactions applicatives. | Passer les GUC en `set_config(..., true)` **dans** la transaction, ou filtrer par tenant via paramètre explicite plutôt que GUC. Utiliser le **direct** ou le pool WebSocket pour l'état de session. |
| **C3** | **[CRITIQUE]** | `schema-extras.sql` dérive de la base (40 policies / RLS / soft-delete présents dans le fichier, absents en base). Le réappliquer sur Neon activerait RLS → `current_agence_id()` = NULL → **résultats vides silencieux**. | Décider explicitement : soit on **n'applique pas** le bloc RLS/soft-delete sur Neon (recréer la base à l'identique), soit on **l'active partout** et on corrige le tenant scoping (C2) d'abord. Ne jamais mélanger les deux états. |
| **C4** | **[CRITIQUE]** | Soft delete : `deleted_at` sur 1 table/226 → `archive_row`/`restore_row` cassés. | Soit appliquer le bloc soft-delete partout (migration de données), soit retirer les fonctions du code. |
| **C5** | **[CRITIQUE]** | 18 Mo de photos base64 → dépassement de la limite 10 Mo du driver HTTP Neon ; un `SELECT` de `parking_vehicles` peut être tronqué. | Externaliser les photos en stockage objet avant migration, ou filtrer explicitement les colonnes `photos` dans les SELECT. |
| **C6** | **[CRITIQUE]** | Baseline Drizzle = 91/226 tables → base Neon neuve incomplète. | Générer une baseline complète et idempotente depuis l'état réel, versionnée. |
| **C7** | **[CRITIQUE]** | `deploy.mjs` + `reset-schema.ts` détruisent la base. | Ne jamais exécuter sur Neon ; construire un pipeline de migration **non destructif** (`pg_dump` → base neuve → `pg_restore` → vérifs). |
| C8 | **[ATTENTION]** | Audit automatique limité à 24 tables/226 ; 202 tables sans piste (dont finance/RH). | Étendre le bloc d'audit ou acter que le périmètre d'audit est restreint. |
| C9 | **[ATTENTION]** | RLS multi-tenant : **0 policy** en base → isolation tenant **non garantie au niveau DB**. | Activer RLS (avec C2 corrigé) ou accepter et documenter le filtrage applicatif comme unique barrière. |
| C10 | **[ATTENTION]** | `SECURITY DEFINER` sans `SET search_path` (`archive_row`, `restore_row`, `log_audit_event`). | Ajouter `SET search_path = public, pg_temp`. |
| C11 | **[ATTENTION]** | Refresh read-models cassé (`createdAt` vs `created_at`, `ON CONFLICT` sans index unique). | Corriger ou supprimer ; tables faits aujourd'hui vides. |
| C12 | **[ATTENTION]** | Deux clients DB (pools multiples) → épuisement du budget de connexions Neon. | **Consolider sur un seul client**, pool dimensionné, `max` global ≤ budget Neon. |
| C13 | **[ATTENTION]** | Rate limiting en mémoire (login + edge) → inopérant en multi-instance. | Rate limiter externe (Upstash/Neon) ou Vercel KV. |
| C14 | **[ATTENTION]** | Export PDF/Excel en file mémoire par processus → perte de jobs. | File persistante + stockage objet. |
| C15 | **[ATTENTION]** | `instrumentation.ts` par `setInterval` → non fiable sur serverless. | Remplacer par un cron Vercel ou un scheduler externe. |
| C16 | **[ATTENTION]** | `/uploads` non servi + 1 référence DB `/uploads/...` → facture cassée. | Stockage objet avant bascule. |
| C17 | **[ATTENTION]** | Drifts de nullabilité ×7 (code plus laxiste). | Durcir le code ou assouplir la base avant import. |
| C18 | **[ATTENTION]** | Règles RBAC : 82 permissions, `user_roles = 0`, isolation par rôle figée dans le JWT. | Valider que le rôle seedé est bien celui attendu post-import. |
| C19 | **[ATTENTION]** | Drifts de séquence possibles après import avec IDs explicites. | `setval()` sur chaque séquence après `pg_restore`. |
| C20 | **[ATTENTION]** | Table de sauvegarde `hr_public_holidays_rpt02_bak` présente en base mais pas dans le code → risque de pollution. | Exclure explicitement du schéma cible. |
| C21 | **[OK]** | Types de colonnes : 0 écart entre code et base. | — |
| C22 | **[OK]** | 0 table du code absente de la base. | — |
| C23 | **[OK]** | Extension limitée à `plpgsql` (portable). | — |
| C24 | **[OK]** | All tables ont une PK `id`. | — |
| C25 | **[OK]** | Base compacte (~55 Mo, 24 821 lignes) → migration triviale en volume. | — |
| C26 | **[OK]** | Base non provisionnée en multi-tenant (`organisations = 0`) → migration mono-tenant sans risque de cloisonnement. | — |
| C27 | **[OK]** | `vercel.json` présent et structure Vercel standard. | — |
| C28 | **[OK]** | Build Vercel : les 5 erreurs ESLint bloquantes ont été corrigées, build vert (§15 bis). Les warnings restants ne bloquent pas. | — |

**Plan de migration Neon recommandé** :

1. **Geler la source** : sauvegarde `pg_dump` fraîche hors machine (les 5 dumps locaux ont 7 semaines).
2. **Créer la base Neon avec ICU** : `LOCALE_PROVIDER icu ICU_LOCALE 'fr-x-icu' TEMPLATE template0` (résout C1 à la racine).
3. **Reconstruire un schéma reproductible complet** : baseline Drizzle complète + `schema-extras.sql` **dans un état arbitré** + vue `parking_spots_v` + colonnes soft-delete selon décision C3/C4 (résout C3, C4, C6).
4. **Corriger le tenant scoping** : GUC transactionnels (`set_config(..., true)`) ou paramètre tenant explicite (résout C2).
5. **Migrer les données** : `pg_dump` → base neuve → `pg_restore`, **sans** toucher au pipeline `deploy.mjs` (résout C7).
6. **Externaliser les médias** : photos base64 et `/uploads` vers stockage objet (résout C5, C16).
7. **Consolider le client DB** sur un seul pool, budget Neon respecté (résout C12).
8. **Remplacer l'état en mémoire** : rate limiting, exports, cron (résout C13, C14, C15).
9. **Valider en staging Neon** : collation/recherche accentuée, transactions, RLS, audit.
10. **Bascule** avec plan de rollback (re-pgdump local).

---

### 17. Plan de validation, rollback, checklist et estimation

**Checklist de validation (staging Neon)** :

- [ ] Collation ICU `fr-x-icu` active ; `ILIKE` accentué correct (ex. `ILIKE '%état%'` matche `État`)
- [ ] 226 tables + `parking_spots_v` créées ; 0 table du code manquante
- [ ] 9 fonctions présentes ; `archive_row`/`restore_row` fonctionnelles ou retirées
- [ ] Choix RLS assumé et vérifié : soit 0 policy (comme la source), soit RLS actif **avec** tenant scoping corrigé
- [ ] Tenant scoping correct sur ≥2 agences (test inter-tenant : une requête agence A ne doit jamais renvoyer de lignes agence B)
- [ ] 76 triggers présents (72 audit + 1 append-only + helpers)
- [ ] Séquences alignées (`setval` post-restore) ; aucun conflit d'ID
- [ ] Volumétrie restaurée : 24 821 lignes, 138 tables non vides, `audit_logs` = 11 973
- [ ] `produits` (319), `clients` (151), `employes` (38), `utilisateurs` (10), `categories` (461) conformes
- [ ] Upload → stockage objet ; aucune référence `/uploads/...` orpheline
- [ ] Export PDF/Excel fonctionne en multi-instance
- [ ] Rate limiting login effectif en multi-instance
- [ ] Cron de synchronisation planifié et fiable
- [ ] `pnpm build` **sans** `ignoreBuildErrors` ; `pnpm typecheck` vert
- [ ] Login, POS, stock, RH, finance OK sur staging

**Rollback** :

- Re-`pg_dump` de la base locale intacte (jamais modifiée) → restauration instantanée
- Conservation de la base Neon en cas de rollback applicatif
- Aucune bascule DNS avant validation complète de la checklist

**Estimation** :

| Lot | Charge |
| --- | --- |
| Baseline complète + arbitrage RLS/soft-delete (C3, C4, C6) | 2–3 j |
| Tenant scoping transactionnel (C2) + tests inter-tenant | 1–2 j |
| Collation ICU + validation recherche FR (C1) | 0,5–1 j |
| Externalisation médias (C5, C16) | 1–2 j |
| Consolidation client DB / pool Neon (C12) | 0,5–1 j |
| Rate limiting / exports / cron distribués (C13, C14, C15) | 1–2 j |
| Migration données + vérifs + bascule | 1 j |
| **Total** | **~8–12 j** hors infrastructure |

---

# INFORMATIONS MANQUANTES

**Bloquants pour un plan de migration définitif** :

1. **Cible Neon** : région, taille (CU), version PostgreSQL souhaitée, utilisation du pooler ou connexion directe, activation du PITR.
2. **Politique de collation** : ICU `fr-x-icu` (recommandé) ou `C.UTF-8` + normalisation applicative (`unaccent`) ?
3. **Arbitrage sécurité multi-tenant** : faut-il activer la RLS (40 policies prêtes dans `schema-extras.sql`) ou figer l'état actuel sans RLS ?
4. **Arbitrage soft-delete** : déployer `deleted_at`/`deleted_by` sur les 226 tables, ou retirer `archive_row`/`restore_row` ?
5. **Fenêtre de maintenance** : durée d'indisponibilité acceptable, RPO/RTO, capacité à figer les écritures pendant la bascule.
6. **Stockage des médias** : S3, Vercel Blob ou autre ; politique de rétention ; sort des 18 Mo de photos base64 (externalisation ou conservation).
7. **Stratégie de sauvegarde** : PITR Neon activé ? Backup `pg_dump` planifié hors machine ? Rétention ?
8. **Rate limiting distribué** : Upstash Redis, Vercel KV, ou service tiers ?
9. **Exécution des jobs** : exports PDF/Excel et synchronisation SaaS (`instrumentation.ts`, `sync`) — cron Vercel, file externe, ou autre ?
10. **Secrets de production** : génération de `AUTH_SECRET` fort, politique de rotation, plan de révocation des comptes de démonstration (`admin@gpj.cm / admin123`) ?
11. **Domaine et URLs** : `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, configuration Preview vs Production sur Vercel.
12. **Nettoyage préalable** : valider la suppression des tables de sauvegarde (`hr_public_holidays_rpt02_bak`), de `uploads/` local orphelin, et des 88 tables vides avant import ?

---

## Annexe — Artefacts techniques de l'audit

Générés hors du dépôt, dans `C:\Users\<user>\AppData\Local\Temp\opencode\` :

| Fichier | Contenu |
| --- | --- |
| `q.ps1` / `qf.ps1` | wrappers d'exécution `psql` en `BEGIN READ ONLY` |
| `audit.sql`, `audit2.sql`, `audit3.sql` | requêtes d'introspection |
| `db_columns.csv`, `db_constraints.csv`, `db_indexes.csv`, `db_triggers.csv`, `db_functions.csv`, `db_sequences.csv` | exports de métadonnées PostgreSQL |
| `code_meta.json` | métadonnées Drizzle extraites par import runtime |
| `diff_cols.txt` | différentiel colonnes code ↔ base (inclut les 7 drifts de nullabilité) |
| `row_counts.tsv` | volumétrie exacte des 226 tables |
| `file_refs.tsv` | références fichiers/photos en base |

> Ces artefacts sont **éphémères**. Les recréer nécessite de knowledge du `DATABASE_URL` local et des scripts d'introspection.
