# Harmonisation du véhicule — cahier des charges & planning

> **Source de vérité unique** du plan de transformation. Tenu à jour à chaque jalon
> (fin de lot, décision produit, blocage). Toute session de travail doit consulter
> ce document en premier et le mettre à jour en sortie.
>
> Dernière mise à jour : **2026-10-14 — Lots 0-4 livrés ; migrations appliquées ; points ouverts §6 clos**.

---

## 1. Contexte & problèmes constatés

Le garage GPJ fait cohabiter deux « vérités » véhicules qui se contredisent :

| Problème | Impact |
|---|---|
| `parking_vehicles` est un **second registre** de véhicules (immat, marque, modèle en doublon de `vehicules`) | Identités divergentes, doublons, recherche incohérente |
| **11 statuts parking** vs `vehicules.statutImmobilisation` (atelier) — jamais synchronisés | Fiche véhicule et carte parking donnent des réponses différentes |
| Cycle OR contournable : `or.update` écrit `statut` directement ; sortie exceptionnelle non verrouillée ; `LIVRE → ferme_definitif` abusif | Données atelier faussées, risque client |
| Numérotation OR/FAC/BC en `count(*)+1` | Collisions de numéros (numéros uniques en base) |
| Bugs bloquants : `getSanteGarage` (500), fiche parking (site/zone/spot « — »), export serveur (`agenceId` manquant) | Modules inutilisables |
| Pilotage (cockpit, KPI, fiche 360°) bâti sur ces données contradictoires | Chiffres non fiables pour le dirigeant |

**Principe directeur** : sécuriser et unifier la donnée véhicule AVANT de construire
le pilotage. Un seul endroit de création véhicule, propagation vers les vues.

---

## 2. Décisions actées (arbitrages — ne pas rouvrir sans besoin)

| # | Décision | Choix | Raison |
|---|---|---|---|
| D1 | **Site 2** | 2ᵉ site **physique du même garage** : 1 agence, 2 `parking_sites` (GPJ-S1/GPJ-S2). Transfert = mouvement **intra-agence**. | Conforme aux seeds ; le cas « 2ᵉ entité » (SITE-2 agence, inter-agences) est hors périmètre. |
| D2 | **Statuts parking (Lot 1)** | **Projection synchronisée** : les 11 statuts restent le vocabulaire de l'UI parking ; `statut_immobilisation` est projeté via mapping P2I/I2P à chaque écriture d'un véhicule lié. Aucun statut supprimé, zéro refonte UI. | Validation utilisateur (2026-10-13). |
| D3 | **Pas d'invention** | Mapping sans équivalent exact ⇒ `null` ⇒ **aucune écriture** de l'autre table. Véhicule sans immat ⇒ `vehiculeId = null` (aucun canonique fabriqué). | Principe du registre GPJ (données verbatim). |
| D4 | **Séquences OR/FAC/BC** | **Globales** (pas scopées agence) : `numero`/`reference` sont `unique()` globaux. Verrou advisory (namespace, année) — FAC=0, OR=1, BC=2 ; `MAX` + garde regex (jamais `count+1`). | Le comptage par agence était un bug (agence 2 → collision immédiate). |
| D5 | **Base locale conservée** | Pas de seed destructif ; le serveur prod (`next start`, port 3000) n'est **jamais** redémarré pour les tests. | |
| D6 | **Ctx superadmin forgé** | Tests : `role: "superadmin"` forge bypasse `requirePermissionProcedure` (aucun middleware ne relit le rôle en base). Le ctx doit porter **l'id réel** du profil fixture (FK `cree_par`, `audit_logs`, `parking_movements.user_id`). | |
| D7 | **Migrations** | `pnpm db:generate` → SQL **append-only** dans `packages/db/drizzle/` ; data-migrations = scripts `tsx` (`requireLocalOrForced`, `postgres(..., {ssl:false, prepare:false, max:1})`). Test DB : reset complet + `drizzle-kit migrate` via `pnpm db:test-setup`. | |
| D8 | **Tests** | `pnpm test` = vitest contre `atelierone_erp_test` (URL forcée par `vitest.config.ts`). Patterns : `vi.mock("@atelierone/auth", () => ({}))`, `router.createCaller(ctx)` ctx forgé, fixtures SQL namespace unique + cleanup `afterAll` ordonné (FK). | |

**D9 — Forme du workflow de transfert (Lot 2) — ✅ actée le 2026-10-13 : option (a)** :
- **(a) Workflow 2 phases recommandé** : table `parking_transfers` dédiée (états `EN_ATTENTE → EN_TRANSIT → RECU / ANNULE`, acteurs `expediePar`/`recuPar`, motifs) sur le modèle `transferts_stock` ; `parking_movements.type = TRANSFERT` reste le journal immuable écrit à la réception. Séparation expédition/réception = 2 permissions (`parking.transfert.creer`, `parking.transfert.recevoir`).
- **(b) Transfert immédiat** : une seule action `transferer` (statut `A_TRANSFERER` + détachement spot source) ; liste des transferts en cours = véhicules `A_TRANSFERER` ; journal `TRANSFERT` écrit à l'expédition. Une seule permission `parking.transfert.creer`.

---

## 3. Plan de lots

| Lot | Intitulé | Effort | État |
|---|---|---|---|
| **Lot 0** | Sécuriser le cycle OR (correctifs P0, verrous numérotation) | 3-5 j | ✅ **2026-10-13** |
| **Lot 1** | Vérité unique « véhicule » (FK + dé-dup + projection statuts) | 1-2 sem | ✅ **2026-10-13** |
| **Lot 2** | Transferts & sites — transfert intra-agence Site 1 ↔ Site 2 (D1) | 1 sem | ✅ **2026-10-13** |
| **Lot 3** | Pilotage — dashboard direction, KPI historisés, créances, objectifs | 1-2 sem | ✅ **2026-10-14** |
| **Lot 4** | Qualité — tests e2e du cycle complet, nettoyage orphelins | continu | ✅ **2026-10-14** |
| **Lot 5** | Stock & Catalogue — audit, dégonflage, moteur de stock unique, réparation données | 1 sem | ✅ **2026-10-19** (A-E + invariant + push prod alignée ; Lot 1 stock étapes 0-4 : plan `DOC/MODULES/module_stock_outillage/05`) |

> Histoire : la mouture v1 (Lot 2 « Cockpit », Lot 3 « Fiche 360° ») a été révisée
> le 13/10 en la version ci-dessus. Les éléments cockpit/fiche 360° sont repris
> dans le Lot 3 (voir §3.4 — périmètre à figer en T3.0).

---

### 3.1 Lot 0 — Sécuriser le cycle OR ✅ (2026-10-13)

| Tâche | Contenu | Livrable |
|---|---|---|
| T0.1 | Retirer `statut` de l'input `or.update` (interdire l'écriture hors endpoints métier) | `or-router.ts` |
| T0.2 | Sortie exceptionnelle : statut ∈ {PRET_A_LIVRER, CONTROLE_QUALITE} + motif + **permission `or.valider`** | `or-router.ts` `restituerVehicule` |
| T0.3 | `LIVRE` terminal (plus de transition) ; `fermerDefinitivement` refuse un OR `ANNULE` | `atelier-service.ts`, `or-router.ts` |
| T0.4 | 3 bugs : `getSanteGarage` (`createdAt`), fiche parking (jointures sites/zones/spots/agences), export (`agenceId`) | 3 fichiers |
| T0.5 | Verrous de numérotation : `verrouillerSequence`/`prochaineSequence` (advisory + MAX), `create` en transaction | `facturation-service.ts`, `or-router.ts`, `contrats-router.ts` |

**Recettes** : `or-lot0.integration.test.ts` (5 tests : statut inchangé en BDD, sortie exceptionnelle refusée ×2, ANNULE refusé, concurrence numéros) + `atelier-service.test.ts` (26/26).

### 3.2 Lot 1 — Vérité unique « véhicule » ✅ (2026-10-13)

| Tâche | Contenu | Livrable |
|---|---|---|
| T1.1 | `parking_vehicles.vehiculeId` FK → `vehicules.id` (nullable, `on delete set null`) + index | `schema/parking.ts` |
| T1.2 | Migration DDL | `drizzle/0001_known_microbe.sql` |
| T1.3 | Backfill idempotent : (1) appariement par immat normalisée, (2) création des canons manquants (projection P2I), (3) re-liaison. Invoqué par `pnpm db:test-setup` (4c) | `packages/db/src/migrate-parking-vehicules.ts` |
| T1.4 | Service : mappings P2I/I2P, `projeterImmoDepuisParking` / `projeterParkingDepuisImmo`, `trouverOuCreerCanonique`, sync identité | `apps/nextjs/src/server/lib/parking-vehicule-service.ts` |
| T1.5 | Points d'écriture branchés : `garage.create` (lien+canonique), `garage.update` (réliation+identité+projection), `vehicules.update` (identité→parking), `vehicules.changerStatut` + 4 écritures `statutImmobilisation` d'`or-router` → projection | 3 routers |
| T1.6 | Tests d'intégration | `garage-lot1.integration.test.ts` (8 tests) |

**Mapping P2I (parking → immobilisation)** — tenu à jour **en parallèle** du CASE SQL du backfill :

| Parking | statut_immobilisation |
|---|---|
| EN_PARKING | en_reception |
| EN_ATTENTE_DEVIS | attente_validation_client |
| EN_ATTENTE_DIAGNOSTIC | en_diagnostic |
| EN_ATTENTE_PIECE | attente_piece_locale |
| EN_TRAVAUX | en_reparation |
| TERMINE_A_RECUPERER | terminee_client_non_venu |
| SORTI | sorti |
| EN_VENTE, ACCIDENTE, A_TRANSFERER, DONNEES_INCOMPLETES | **null** (aucune écriture) |

**Mapping I2P (immobilisation → parking)** : en_reception→EN_PARKING, en_diagnostic→EN_ATTENTE_DIAGNOSTIC, en_reparation→EN_TRAVAUX, attente_validation_client→EN_ATTENTE_DEVIS, attente_piece_locale|piece_commandee_import→EN_ATTENTE_PIECE, terminee_attente_paiement|terminee_client_non_venu→TERMINE_A_RECUPERER, sorti→SORTI, transfere_site2|abandonne_contentieux|inconnu→**null**.

**Résultat backfill (base de test)** : 35/47 lignes liées, 35 canons créés, 12 sans immat restées NULL (par conception). Identité propagée uniquement si renseignée (jamais d'effacement silencieux).

### 3.3 Lot 2 — Transferts & sites ✅ (2026-10-13)

Périmètre (D1) : workflow de transfert **intra-agence** entre les 2 sites GPJ-S1 ↔ GPJ-S2, CRUD complet, pages Espace & Sites branchées.

**Audit T2.0 — état des lieux** (`fichier:ligne`) :
- *Réutilisable* : `ParkingMovementType` inclut déjà `"TRANSFERT"` (`packages/db/src/schema/parking.ts:170`) + colonnes `siteOrigineId`/`siteDestinationId` (ibid. :184-187), écrites par `place` (`garage-router.ts:1246,1250`) ; statut véhicule `A_TRANSFERER` (:108) ; alerte `TRANSFERT_A_ETUDIER` (:200) ; seuil `seuilTransfertJours` (:242) ; pattern transaction `place` (libère spot + insert mouvement, `garage-router.ts:1213-1258`) ; seeds **S1 = 19 zones/80 spots, S2 = 5 zones/24 spots** (`seed-garage.ts:52-90,222-239`) ; sélecteur de site sur la carte (`carte/page.tsx:142-166`) ; template migration permission (`migrate-permission-export-vehicules.ts:15-79`) ; pattern workflow 2 acteurs `transferts_stock` (`expediePar`/`recuPar`, `schema/transferts_stock.ts:8-29`).
- *Manquements* : **aucun endpoint n'écrit `"TRANSFERT"`** (jamais de `garage.transferer`) ; **aucune permission dédiée** (seules `parking.consulter/vehicule.creer/vehicule.modifier/vehicule.exporter/alertes.gerer`, `security-socle.ts:57-61`) ; **aucune page Espaces/Sites** (nav garage = Dashboard/Carte/Véhicules/Alertes/Configuration, `GarageNav.tsx:8-12`) ; aucune liste d'historique des transferts ; `usePlacementDrag.ts` = code mort (`zoneId: 0`) — ne pas réutiliser ; `module-permissions.ts:61-62` incomplet (manque `parking.vehicule.exporter`).
- *Vigilance* : `parking_movements` est **insert-only** (journal immuable) → le multi-états exige une table d'entité dédiée (D9) ; `place` ne vérifie **pas** la cohérence site et ne calcule les collisions que dans la zone cible (`garage-router.ts:1059-1098`) → ne pas abuser de `place` pour un cross-site ; panneau « À placer » exclut les véhicules `siteId = NULL` (`garage-router.ts:344,446`) ; **ne pas confondre** les 2 *agences* SITE-1/SITE-2 (`seed-install.ts:31-64`) avec les 2 *parking_sites* GPJ-S1/GPJ-S2 (même agence).

**D9 — actée le 2026-10-13** : option (a) workflow 2 phases (voir §2). Table `parking_transfers` livrée (T2.1).

| Tâche | Contenu | Critère d'acceptation |
|---|---|---|
| T2.0 ✅ | Audit des existants | Ce rapport (ci-dessus) |
| T2.1 ✅ | Table `parking_transfers` (D9a : `EN_ATTENTE → EN_TRANSIT → RECU/ANNULE`, `statutPrecedent`, acteurs `cree/expedie/recu/annulePar`, motifs) ; migrations `0002_wet_toro.sql` (DDL) + `0003_rapid_avengers.sql` (`statut_precedent`) ; exports schema | `db:test-setup` vert ; journal drizzle 4 entrées |
| T2.2 ✅ | RBAC : `parking.transfert.creer` (chef_atelier + secretaire), `parking.transfert.recevoir` (chef_atelier), `parking.site.gerer` (chef_atelier) — socle + matrice `security-socle.ts` + listes `module-permissions.ts` (complété : `parking.vehicule.exporter`) | Test FORBIDDEN sans permission (T2.5 #5) ; UI masque les actions |
| T2.3 ✅ | Endpoints tRPC : `transferts` (liste + recherche ilike + filtres), `transfertCreer` (gardes : site requis, ≠source, dest active, 1 seul transfert ouvert), `transfertExpedier` (libère spot, `A_TRANSFERER`, capture `statutPrecedent`/zone/pos), `transfertRecevoir` (journal `TRANSFERT`, véhicule → dest, projection Lot 1), `transfertAnnuler` (restaure état si transit), `espaces`, `siteModifier` (refus de désactiver le dernier site actif) | 13 tests d'intégration verts |
| T2.4 ✅ | UI : `garage/transferts` (liste recherche/filtres, création via picker véhicule, Expédier/Réceptionner/Annuler confirmés, permissions sincères, `invalidate()` + `toast()`) + `garage/espaces` (cartes sites + détail zones/spots via `garage.plan`, modification site) ; onglets nav GarageNav | Pages branchées, UX rule §AGENTS respectée |
| T2.5 ✅ | `garage-lot2.integration.test.ts` : 13/13 (workflow complet S1→S2, refus états/permissions, annulation + restauration, RBAC, recherche, siteModifier) ; suite **47 fichiers / 855 tests** verts ; lint 0 ; typecheck = 348 erreurs préexistantes (**0 dans les fichiers Lot 2**) ; graphify (7913 nœuds) | Tout vert |

### 3.4 Lot 3 — Pilotage ✅ (2026-10-14)

**Audit T3.0 (2026-10-14) — état des lieux** (`fichier:ligne`) :
- *Existant* : `/dashboard` = page bento sans KPI ; `/dashboard/pilotage` = hub de navigation sans KPI ; `/dashboard/admin` = KPIs commerciaux (modèle composants `admin/_components/{KpiCards,SalesChart,...}`) ; `/dashboard/atelier/performance` = `PerformanceQualite.tsx` (457 l., 7 tabs, patterns `PERIODES`, `statutKpiColor`) ; `atelierKpiRouter` (santé garage, diagnostics, facturation) ; `or.getDashboard` (`or-router.ts:2294`) ; `garage.overview` (`garage-router.ts:203`) ; `finance.getDebts` (`finance.ts:243`, retour **tableau**) ; `chargeTechnicien` (`atelier-service.ts:273`, capacité 5) ; `scoreSante` (`kpi-service.ts`).
- *Bugs confirmés* : `getSanteGarage` renvoyait pas de `score` ; `getDiagnostics` forçait `renvoye: false` ; `jourStr` crashait sur NULL ; `getFacturation` marge = 0 si `coutUnitaire` null ; `kpi_cibles` sans seed → tous SANS_DATA ; 2 consumers lisaient `d.ors` au lieu de `d.parc` (`ChercherAvantCommander.tsx:34`, `Outillage.tsx:67`) ; planning dupliquait le calcul de charge.
- *Hors périmètre acté* : fusion complète des 2 fiches (atelier + parking) en 1 route unique → **reportée** (liens croisés suffisants) ; fix du side-effect notification dans un GET (`getSanteGarage`) → noté, hors lot ; exports CSV KPI → déjà couverts côté rapports.

**Périmètre acté (décision interne T3.0)** : dashboard direction sur `/dashboard/pilotage` ; corrections KPI backend ; endpoint `tempsParStatut` ; charge techniciens partagée ; seed cibles KPI ; liens croisés 360° pragmatiques (blocs croisés, pas de fusion de routes).

| Tâche | Contenu | Critère d'acceptation |
|---|---|---|
| T3.0 ✅ | Audit des existants (sous-agent explore) | Rapport structuré (ci-dessus) |
| T3.1 ✅ | Backend : `tempsParStatut` (agregation durées depuis `or_historique`, fenêtre glissante, perm `or.consulter`) ; `getDashboard.chargeTechniciens` (helper partagé `chargeTechnicien`, capacité 5) ; `getPlanning` via helper ; `score` dans `getSanteGarage` (helper `scoreSante`) ; fix `renvoye`/`jourStr` (null-safe)/marge fallback `prixAchat` ; fix consumers `d.ors`→`d.parc` | `atelier-kpi-router.ts`, `or-router.ts`, 2 fichiers UI |
| T3.2 ✅ | Data-migration `migrate-kpi-cibles.ts` (6 codes défaut : PONCTUALITE 90/75/60 %HAUT, FTQ 85/70/55 %HAUT, TAUX_RETOUR_SAV 5/10/15 %BAS, RAPIDITE_DIAG_JOURS 1/2/3 jBAS, FIABILITE_APPRO 90/75/60 %HAUT, SATISFACTION_CLIENT 4/3/2 /5 HAUT ; idempotente) branchée `package.json` + `test-db.mjs` (étape 4d) | `pnpm db:test-setup` vert ; 12 cibles (6 × 2 agences) |
| T3.3 ✅ | UI : `/dashboard/pilotage` réécrit en dashboard direction (6 sections : santé atelier, parc OR + charge tech, occupation parking, facturation + créances, temps par statut, hub navigation conservé ; polling 30 s, sélecteur période, loading/erreur/vide par carte) | `dashboard/pilotage/page.tsx` |
| T3.4 ✅ | Liens croisés 360° : `garage.vehicule` + bloc `atelier` (OR non clos du canonique) ; `garage.vehiculeParCanonique` (perm `parking.consulter`) ; bloc « Emplacement parking » dans fiche atelier (`VehiculeDetail.tsx`) ; bloc « Atelier » + lien fiche 360° dans fiche parking (`garage/vehicules/[id]`) | 2 fiches reliées dans les 2 sens |
| T3.5 ✅ | `pilotage-lot3.integration.test.ts` : 6/6 (tempsParStatut, chargeTechniciens, bloc atelier, vehiculeParCanonique, scoreSante, kpiCibles seedées) ; suite **48 fichiers / 861 tests** verts ; lint 0 ; typecheck = 348 erreurs préexistantes (**0 dans les fichiers Lot 3**) ; graphify (7929 nœuds) | Tout vert |

### 3.5 Lot 4 — Qualité ✅ (2026-10-14)

**Audit T4.0 (2026-10-14) — état des lieux** :
- *e2e Playwright* : infra historique rodée mais **hors CI, en manuel, exclusive RH/paie** (`playwright-r{4,5,6,8,9}.config.ts` + `e2e-rX/`, `webServer` :3000) ; config racine `playwright.config.ts` **cassée** (`globalSetup`/`.auth/` manquants) ; **zéro spec atelier/OR/garage/parking** existante.
- *Couverture cycle OR* : verrous et unitaires couverts (lot0 : 5 tests verrous ; `atelier-service.test.ts` transitions) mais **aucun happy-path complet** réception→clôture.
- *Orphelins* : définition confirmée = `parking_vehicles.immatriculation` NULL ⇒ `vehicule_id` NULL (12 lignes seed, par conception D3) ; **aucun script d'audit/nettoyage** existant (`verify-garage.ts` ne compte que des totaux).
- *CI* : `.github/workflows/ci.yml` = lint + db:test-setup + vitest + typecheck (continue-on-error) + build ; **pas d'étape e2e**.

**Périmètre acté (décision T4.0)** :
- Le happy-path complet du cycle OR est livré en **test d'intégration tRPC** (couche API, tourne en CI, pattern D8 rodé des lots 0-3), pas en Playwright UI : l'infra UI existante est cassée/hors CI et une spec navigateur du cycle atelier serait non déployable en l'état. Playwright UI = work séparé si besoin.
- Orphelins = **rapport d'audit non destructif** (script `tsx`, `requireLocalOrForced`) ; aucune suppression automatique (D3, arbitrage manuel).

| Tâche | Contenu | Critère d'acceptation |
|---|---|---|
| T4.0 ✅ | Audit (sous-agent explore) : infra e2e, couverture cycle, orphelins, CI | Rapport (ci-dessus) |
| T4.1 ✅ | `or-lot4-cycle.integration.test.ts` : happy-path complet via tRPC — réception → diagnostic soumis/validé → devis soumis/accepté → QC validé → facturation soldée → restitution → clôture définitive ; assertions de statuts + historique + véhicule projeté (`sorti`) | Test vert sur base de test |
| T4.2 ✅ | `packages/db/src/audit-orphelins-parking.ts` (script `audit:parking-orphelins`) : rapport non destructif (lignes sans immat, non liées, non positionnées, alertes ouvertes par site) ; `requireLocalOrForced` | Script vert, sortie lisible |
| T4.3 ✅ | Vérifs : suite complète, lint, typecheck (baseline 348, 0 erreur Lot 4), graphify, doc | Tout vert |

---

## 4. Conventions de travail (obligatoires)

1. **Ce document** : toute session commence par sa lecture ; toute fin de lot / décision / blocage le met à jour (date + journal §5).
2. **AGENTS.md** : règles UX (recherche, Enregistrer + `invalidate()`, `toast()`, états, permissions sincères) + `graphify update .` après tout changement de code.
3. **Mapping P2I/I2P** : `parking-vehicule-service.ts` ≡ CASE SQL de `migrate-parking-vehicules.ts` — toujours modifier les deux.
4. **Aucune invention de données** (D3) ; verbatim GPJ ; `null` honnête plutôt qu'un état fabriqué.
5. Vérifications avant de conclure un lot : `pnpm db:test-setup` (si schema), `pnpm -F @atelierone/nextjs test`, `pnpm -F @atelierone/nextjs lint`, `pnpm -F @atelierone/nextjs typecheck` (baseline **348 erreurs préexistantes** mesurée le 2026-10-13 — critère : 0 erreur dans les fichiers du lot), `graphify update .`.

## 5. Journal d'avancement

| Date | Jalon | Résultat |
|---|---|---|
| 2026-10-13 | **Lot 0 DONE** | T0.1→T0.5 livrés ; `or-lot0.integration.test.ts` 5/5 ; suite 45 fichiers / 834 tests verts ; lint 0 ; graphify à jour |
| 2026-10-13 | Décision D2 | « Projection synchronisée » validée par l'utilisateur (question clarificatoire Lot 1) |
| 2026-10-13 | **Lot 1 DONE** | T1.1→T1.6 livrés ; `garage-lot1.integration.test.ts` 8/8 ; suite **46 fichiers / 842 tests** verts ; backfill test : 35/47 liés ; lint 0 ; typecheck = 3 erreurs préexistantes ; graphify (7878 nœuds) |
| 2026-10-13 | CDC rédigé | Ce document créé (source de vérité) ; AGENTS.md pointé ici |
| 2026-10-13 | **Décision D9** | Workflow 2 phases (option a) validée par l'utilisateur |
| 2026-10-13 | **Lot 2 DONE** | T2.0→T2.5 livrés ; `parking_transfers` + migrations 0002/0003 ; permissions transfert/site ; UI transferts + espaces ; `garage-lot2.integration.test.ts` 13/13 ; suite **47 fichiers / 855 tests** verts ; lint 0 ; typecheck 0 erreur Lot 2 (baseline 348 inchangée) ; graphify (7913 nœuds) |
| 2026-10-14 | **Lot 3 DONE** | T3.0→T3.5 livrés ; `tempsParStatut` + `chargeTechniciens` + scoreSante + fixes KPI ; `migrate-kpi-cibles` (6 codes, 12 lignes) ; dashboard `/dashboard/pilotage` ; liens croisés 360° (2 sens) ; `pilotage-lot3.integration.test.ts` 6/6 ; suite **48 fichiers / 861 tests** verts ; lint 0 ; typecheck 0 erreur Lot 3 (baseline 348 inchangée) ; graphify (7929 nœuds) |
| 2026-10-14 | **Base réelle migrée** | Sous validation utilisateur (« go ») : `pg_dump` sauvegarde (`backups/atelierone_erp_2026-10-14_0515.dump`, 15 Mo) → `pnpm db:migrate` (0001-0003) → `migrate:parking-vehicules` (**42/54 liées**, 12 sans immat par conception) → `migrate:kpi-cibles` (0 insérées — 12 déjà présentes). `parking_transfers` OK. Serveur prod non redémarré (D5) |
| 2026-10-14 | **Lot 4 DONE** | T4.0→T4.3 livrés ; `or-lot4-cycle.integration.test.ts` **10/10** (happy-path complet réception→clôture via tRPC — Playwright UI acté hors périmètre, infra cassée/hors CI) ; `audit:parking-orphelins` (rapport non destructif : 12 orphelins par conception, 0 anomalie) ; suite **49 fichiers / 871 tests** verts ; lint 0 ; typecheck 0 erreur Lot 4 (baseline 348) ; graphify (7936 nœuds) |
| 2026-10-14 | **Points ouverts §6 clos** | (1) **GET pur** : `getSanteGarage` n'écrit plus les notifications — corps extrait dans helper `calculerSanteGarage()` ; évaluation des règles qualité déplacée dans la mutation dédiée `evaluerReglesQualite` (perm `or.modifier`), appelée au montage du dashboard pilotage. (2) **Config Playwright racine réparée** : retrait du `globalSetup`/`storageState` inexistants, `E2E_PORT` supporté pour un serveur éphémère à côté de la prod (D5). (3) **Smoke e2e atelier/garage 4/4** : `e2e/lot4-atelier-garage.spec.ts` (pilotage, atelier, garage, fiche 360°) — run sur :3001 éphémère, prod :3000 non redémarrée. (4) **Orphelins** : chemin de fix confirmé (`garage.update` réécrit `vehicule_id` par immat normalisée) — 12 lignes restent manuelles par conception (D3), aucune suppression auto. |
| 2026-10-19 | **Lot 5 — Stock & Catalogue** (audit + Lots A-E) | **Audit 30 SELECT** : journal vs stock 61/129 divergents, miroirs faux (lots 17/23, unités 7/21), 163 alertes invisibles, 204/321 produits sans prixAchat, 186 variantes orphelines, 190 produits sans catégorie, 46 unités contradictoires, 127 produits hors codes_barres. **Décisions actées** : divergences = données d'essai → réparation autorisée ; alerte unique par (produit×agence) ; CMUP unique ; Catalogue = la fiche (jamais une quantité). **Livré** : Lot A `cc05db6` (écrans fantômes `/inventory` + `/transfers` + moteur `inventory.ts` supprimés, 4 onglets Achats retirés, « Réception » → « Entrée de stock») ; Lot B `2b4df29` (nav Catalogue 4 entrées, recherche avancée partagée, formulaire variante unique `~/lib/variante-form.ts`, 6 confirmations destructives) ; Lot C `f80cc95` (`enregistrerMouvement` = SEUL écrivain : création quand vendeuse, déstockage catalogue, réception, rejet, annulation vente ; type `REJET_RECEPTION` ajouté) ; Lot D `0dec6d9` (`lignesAlerteStock` + `niveauAlerte` — produits sans ligne de stock désormais visibles —, CMUP dormant valorisé, KPI dashboard par agence) ; Lot E `ef384bf` (**migration `0028_mirroirs_stock`** : stocks/stocks_lots = oracle journal, 0 divergence réelle après application ; CMUP repli « prix fiche » pour 81 lignes ; orphelines 0 ; catégories 0 ; barcodes miroir). |
| 2026-10-19 | **Lot 5 fini, prod alignée, étape 4 du plan stock** | Lot F (suite **97 fichiers / 1199 tests** verts, `next build` OK, menu conforme) ; test invariant `41208fc` « toute écriture s'accorde au journal » (2 tests : `rejeterReception`, `voidSale` + invariant relu après chaque écriture) ; **push main** `d16482c..50d9055` puis `50d9055..7afb5c3` — le hook pre-push applique les migrations sur Neon depuis l'endpoint **direct** (sauvegarde JSON pré-migration des 8 tables pivot ; le **pooler** Neon ouvre `search_path` vide — le hook corrige `50d9055`) ; un **record fantôme** du journal migratoire (hash de 0029 enregistré sans ses objets, le double-passe du `db:sync` du push s'est digéré par la session concurrente en mouvement) a été résorbé : `db:check` = schéma identique, 21 écarts de contenu tolérés) ; **étape 4 du plan stock** : migration `0029_emplacements_stockage` (zones NORMAL/RECEPTION/QUARANTAINE/REBUTS/PERIMES + capacité, additif, CHECK en base), étiquette code+QR imprimable (`qrcode.react`, cible `?p=CODE`), récapitulatif par zone + théorique-au-lieu au recensement ; test `stock-emplacements-zones.integration` 4/4. **Reste** : étape 5 (plan de prise FEFO), stocks_unites facteur ≠ 1 (passe suivante), 22 PIECE à reclassement manuel, 86 CMUP sans source (volontairement visibles), `next build` à rejouer une fois la session concurrente (`garage/vehicules/page.tsx` en écriture) réparée |
| 2026-10-19 | **CI + build déploiement remis verts** | GitHub Actions `pnpm test` refusait `stock-q-journal` : `unites_mesure` code `PCE` absent de la base CI fraîche (le test le supposait ; seul lui — `stock-audit-entree-piece` tolère l'absence, « la création doit garantir PCE elle-même »). Fix `303c78a` : upsert pattern 0024 au beforeAll (2/2 verts). Vercel `main@3304809` échouait : `Module not found: '@/components/vehicule/RevueVehicules'` — **l'import et l'usage committés par `cc05db6` mais le composant jamais suivi** (untracked) ; builds locaux verts seulement parce que le fichier existe sur disque ; `next.config.js` a `ignoreBuildErrors: true`, seule la résolution de modules compte. Fix `04f584d` : composant committé tel quel (104 lignes, pur client ; route `revueParc.file` présente à HEAD) — **fichier de la session concurrente commité SANS toucher son contenu** ; ses incohérences de types internes restent à rattraper par sa session. Suite locale pleine désormais bruitée par la réécriture concurrente en cours (`vehicule-service.ts` +48/−133 non committé : 30 échecs, hors périmètre CI) |
| 2026-10-20 | **Méthode tsc corrigée** | Le typecheck « global » n'avait jamais isolé le travail du lot : `tsc -p tsconfig.json` sortait 86+ erreurs de la baseline sale (`strict:false`, export-service, button.tsx de packages/ui…). **Méthode actée** : `next typegen` d'abord (les routes générées sont l'entrée de tsc), puis filtrage du rapport sur les fichiers touchés — **0 erreur dans les fichiers du lot** à chaque conclusion. `tsc` reste aveugle à la frontière client/serveur : seul `next build` la voit. |
| 2026-10-20 | **Lot 6 — Catalogue/stock : le pont véhicule est testé, la qualification peut entrer par import** | **Lot S (4 silences stock, test 4/4)** : INITIAL_RECEIPT passe `coutUnitaireBase` ; `ECHANGE_RETOUR_BLANC` absent de la chaîne — ajouté à `stock-engine.ts` + constante dans `stock.ts` ; `ajusterStock` réécrit via la moteur unique (delta → `AJUSTEMENT_POSITIF/NEGATIF` au lieu d'updater `stocks` en douce) ; S4 déjà unifié par un lot D antérieur. **C1 (pont véhicule↔catalogue)** : endpoint `articles.pourVehicule` (POSITIVE sauf NEGATIVE ; exclusion > inclusion ; fourchette d'années ; raffinement motorisation/version **relâché** s'il retire tout ; châssis = préfixe VIN), composant `PiecesCompatibles` dans l'onglet Pièces de `FicheVehicule360` + branchement dans l'onglet OR, recherche avancée cascade marque→modèle→année. **Le test d'intégration 4/4 a attrapé 4 bugs du SQL avant la prod** : fragments avec `AND` en tête passés à `and()` drizzle, raffinement version inscrit au niveau WHERE (alias hors de portée) puis rejeté dans l'EXISTS et gardé par `avecVersion && version` (sinon `%null%` sans relâchement), pont châssis inversé (`code_chassis` est un PRÉFIXE du VIN, pas l'inverse). **C2 (qualification sincère, 21/21)** : réfs OEM/aftermarket + positions (côté/essieu) portées par la variante — formulaire partagé + pages article/variante ; compatibilités et refEq affichent `source` + `niveauVerification` (`MANUELLE` par défaut à la saisie) ; endpoints `qualifierCompatibilite`/`qualifierReferenceEquiv` ; « CONFIRMÉ sans source » = **avertissement, pas refus** (décision ③ actée) ; sélection inline de qualification sur les chips. **C3 (import de masse, 3/3)** : nouvelles entités `references_equiv.jsonl` + `compatibilites.jsonl` (attache par `designationArticle` — article créé à la volée — ou `codeBarre` de variante ; **jamais** d'IDs internes ; qualification défaut `CATALOGUE`/`NON_VERIFIE`) ; `designationArticle` borné à 255 (longueur réelle de la colonne) ; **ré-import anti-destructif** : produit existant = UPDATE champ par champ (un UPSERT batch aurait nullifié les champs absents — bug attrapé avant le test), attachement one-way, patch de qualification vide = no-op ; **dry-run à projection profonde** (les maps s'agrètent dans l'ordre d'import avec ids négatifs locaux, aucune écriture) : 0 ligne écrite, coexistence POSITIVE/NEGATIVE, idempotence du ré-import, survie du refOem saisi à la main. Fichiers DOC enrichis (5 produits avec `designationArticle`/`refOem`/positions ; 2 jsonl de qualification). **C4** : ce journal + mise en sommeil actée d'`articleEquivalences` (§6). |
| 2026-10-20 | **Décision ② — `articleEquivalences` en sommeil** | L'ancienne table d'équivalences d'articles (FK double sur `produits`, `agence_id NOT NULL`) est **orpheline** : aucun endpoint ne la lit ni ne l'écrit. Acté : elle reste en place exactement comme elle est — aucune migration soustractive (le journal SQL ne réécrit pas l'histoire), aucun rebranchement, la logique moderne du module équivalence passe par `produit_references_equiv` (rattachée à l'**article conceptuel**, pas aux variantes). Une reprise passe par une décision produit explicite. |
| 2026-10-20 | **Lot 6 finalisé — prêt production** | Finitions : `addReferenceEquiv` aligné sur la décision ③ (défaut `MANUELLE` + avertissement CONFIRMÉ sans source, cohérence totale avec `addCompatibilite`) ; le formulaire partagé ne peut plus produire autre chose que le contrat serveur — les 6 champs à unions exactes (`etatProduit`, `origineProduit`, 4 positions) sont typés côté client, avec 6 helpers purs de conversion (`*DuSelect`/`*DuServeur` dans `~/lib/variante-form.ts`) branchés sur tous les selects des pages article/variante (7 onChange recapturés, dont 3 selects cachés de la page variante). **Vériﬁcation complète** : tsc filtré **0 erreur dans les fichiers du lot** (305 lignes rapportées vs 348 baseline — l'écart est notre épargne), suite ciblée **6 fichiers / 36 tests** verts (import, m7, pourVehicule, stock-engine, stock-q-journal, stock-audit), **`next build` vert** (la frontière client/serveur tient), **`db:check` : schéma local↔production identique** (21 écarts de données d'exploitation tolérés). Nota technique : le wizard `NouvelArticleWizard` garde ses casts `as any` internes préexistants (à runtime les options des selects sont déjà les bonnes valeurs) — rattrapage typique possible plus tard, sans urgence. |
| 2026-10-20 | **Résolu — backfill CMUP lancé (consentement utilisateur)** | `packages/db/src/migrate-cmup-repli.ts` : pour chaque ligne `stocks.cout_unitaire_moyen IS NULL`, reprendre le coût du dernier mouvement entrant valorisé (`sens='E'`, `cout_unitaire_base > 0`, `DISTINCT ON` ordonné par date desc) — **jamais** une ligne déjà valorisée, **jamais** un coût inventé. Verdict exécution : local **0/85**, production **0/84** — les lignes « sans source » n'ont **aucun** mouvement entrant valorisé à reprendre, le repli prix fiche reste donc la seule vérité disponible, exactement comme la directive le prévoyait (« sinon laisser le prix fiche »). Le script est idempotent et reste dans la caisse à outils : dès qu'une réception valorisée existera pour un produit sans coût, un relance fera remonter un coût réel. |
| 2026-10-22 | **P3.3.6 + P3.3.3 — deux KPI atelier sortent de « bloqué »** | `TAUX_TRANSFORMATION_DEVIS` : dernière trace `VALIDATION_DEVIS → EN_ATTENTE_VALIDATION` dans la période, transformée si la dernière acceptation (`→ EN_COURS`) la suit ; la vérité vient d'`or_historique`, pas du JSON des versions. `PRODUCTIVITE_TECHNICIEN` : heures vendues des lignes `SERVICE` non déclinées sur des OR livrés / heures attendues du cycle RH des employés actifs de fonction technicien, bornées par embauche et fin de contrat ; détail par technicien dans l'onglet Compétences. Cibles 60/40/25 et 70/55/40. Formules, limites (absences et jours fériés non déduits) et vérifs détaillées dans `PLAN-COHERENCE-GARAGE.md`. |
| 2026-10-20 | **Guide utilisateur interactif par module + plan de tests réels** | (1) **`docs/PLAN-TESTS-REELS.md`** : plan de tests métier en langage courant — 6 besoins (B1-B6) mappés sur l'existant, 6 chapitres de scénarios (A : articles/variantes/positions/occasion/réfs/compat/pont ; B : aperçu/entrée/rangement/OR/recensement/inventaire/ajustement/transferts/fûts-DLC ; C : POS ; D : prévisions/import ; E : outillage ; F : recherche/aide), **registre à cocher** (24 tests) et points de vigilance (quantité dans le catalogue = bug, stock jamais négatif, PMP, DLC après ouverture, confirmé sans source = avertissement…). (2) **`GuideInteractif.tsx`** : pas-à-pas interactif générique et client-safe — étapes dépliables (quoi / « le contrôle est réussi si » / astuce / lien vers l'écran), progression cochée conservée en `localStorage` par module, barre %, recherche, réinitialisation ; branché dans `HelpCenter` (RH et clients héritent du pas-à-pas dérivé du parcours quand aucun contenu dédié n'est fourni). (3) **Catalogue** : registre neuf `catalogue-help.ts` (8 fiches : articles, variantes/positions, références, compatibilité-exclusion, recherche ×4, outillage, aide à la saisie, import de masse) + pas-à-pas 9 étapes + parcours ; `/dashboard/catalog/aide` devient une page à **deux onglets** (Guide interactif ↔ Aide à la saisie, toujours accessible) ; le bouton **?** du domaine catalogue passe sur `CATALOGUE_HELP_FICHES`. (4) **Stock** : 5 fiches manquantes ajoutées au centre d'aide (recensement, contenants & DLC, déconditionnement, chercher avant de commander, prévisions) + pas-à-pas 11 étapes (`stock-pas-a-pas.ts`). **Vérifications** : tsc **305 total (baseline inchangée), 0 erreur dans les fichiers de la session** ; suite **103 fichiers / 1 237 tests verts** ; **`next build` vert**. **Leçon** : la génération de texte long produit des artefacts, et le retour console PowerShell **ré-encode** ce qu'il affiche (du mojibake peut correspondre à des octets sains, et l'inverse) — la seule vérité est la relecture **octet-octet via Node** (`readFileSync` + recherche de caractères suspects), appliquée à chaque fichier écrit de la session. |

## 6. Risques & points ouverts

| Point | Statut | Action |
|---|---|---|
| Migrations `0001`-`0003` + backfill + cibles KPI sur la base locale réelle | ✅ **2026-10-14** | Appliquées (sauvegarde `backups/atelierone_erp_2026-10-14_0515.dump`) ; 42/54 parking liés, 12 cibles KPI |
| 12 lignes parking sans immat (base réelle et test) non liées | ⬜ **arbitrage manuel** | Par conception (D3). Fix existant : saisir l'immat via `garage.update` (UI Garage → Véhicules) — le endpoint réécrit `vehicule_id` en réliant au canonique par immat normalisée (`garage-router.ts:1067-1089`). Audit : `pnpm -F @atelierone/db audit:parking-orphelins` |
| Fusion complète des 2 fiches véhicule (atelier + parking) en 1 route unique | ⬜ **reportée** | Liens croisés 360° livrés (Lot 3) ; fusion = arbitrage produit, ne pas faire sans demande explicite |
| e2e Playwright UI atelier/garage | ✅ **2026-10-14** | Config racine réparée + `e2e/lot4-atelier-garage.spec.ts` **4/4** (pilotage/atelier/garage/fiche 360°) sur serveur éphémère :3001 (D5 respectée). Hors CI (pas d'étape e2e) ; happy-path cycle OR couvert en intégration tRPC (Lot 4) |
| Side-effect notification dans un GET (`atelierKpi.getSanteGarage`) | ✅ **2026-10-14** | GET purifié : helper `calculerSanteGarage()` (lecture seule) + mutation dédiée `evaluerReglesQualite` (perm `or.modifier`, anti-spam E1) appelée au montage du dashboard pilotage |
| Seed `seed-garage` purge les `vehicules` de démo | ℹ️ | Comportement connu du setup de test — vérifier avant tout run sur base réelle |
