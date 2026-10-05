# PHASE 6 — CONCEPTION : Historique / traçabilité (snapshots métier)

> **Phase active (registre)** : P13, N13.
> **Statut** : EN_CONCEPTION (2 lignes passées EN_INSPECTION le 2026-09-23 après gate Phase 5 VALIDE).
> **Ordre bloquant (§121)** : P13 (schéma snapshot + bulletins) → N13 (planning, branche du même mécanisme).

---

## 1. Diagnostics fondateurs (lecture des fichiers Phase 6)

| Fichier | Constat |
|---|---|
| `rh-payroll.ts:483-506` (`prepareMonth`) | Bulletin **existant** → `update(payrollEntries)` + **DELETE de toutes les lignes** `payrollEntryLines` puis ré-insertion → la situation antérieure disparaît à chaque régénération |
| `rh-payroll.ts:690-715` (`adjustEntry`) | Même écrasement : `update(payrollEntries)` + DELETE + ré-insertion des lignes (recalcul avec bonus/ajustements) |
| `rh-planning.ts:47-64` (`saveWeek`) | Réécriture de la semaine : **DELETE** des `planning_affectations` (dates + employés concernés) puis insertion en lot → aucune trace de la semaine précédente (N13) |
| `rh-evaluation.ts:228-267` (`saveEvaluation`) | Évaluation existante → `update(evaluations)` + **DELETE** `evaluationScores` puis ré-insertion (pondération recalculée) → anciennes notes perdues |
| `rh-leave.ts:412-428` (`decideRequest`) | Décompte du solde : `update(leaveBalances)` **écrase** taken/balance à chaque approbation ; seule une trace a posteriori existe (`leaveBalanceAdjustments`, N04). Demande « solde (décision) » : l'état du solde **avant** décision n'est pas archivé |
| `rh-presence.ts` | Corrections présences = **annulation soft** (posture annulée, aucun DELETE — N01/T10) → 5e domaine de la checklist déjà couvert, aucun snapshot requis |

## 2. Règles de conception décidées (Phase 6)

1. **Principe général** : avant toute **régénération** d'un état existant, archiver l'état courant (entité + lignes de détail) dans une table snapshot **versionnée** (`version + 1`, `prochaineVersion`). Les tables actives restent l'état actuel ; les snapshots = **historique rejouable**. Le DELETE+INSERT mécanique subsiste mais **cesse d'être destructif** (pré-conception Phase 2 §9 : « payloadEntryLines = état actif ; payroll_entry_snapshots = historique rejouable. Aucun DELETE destructif. »)
2. **4 tables snapshot** schéma `packages/db/src/schema/rh_snapshots.ts`, toutes avec `agenceId` (isolation multi-tenant), `raison`, `createdBy`, `createdAt` :
   - `payroll_entry_snapshots` : `id, agenceId, payrollEntryId, version, periodId, employeeId, baseSalary, netPay, status, entityJson (bulletin complet), linesJson (lignes détaillées), raison ('recalcul'|'adjustment'), createdBy, createdAt` + unique `(payrollEntryId, version)` — conforme pré-conception Phase 2.
   - `planning_snapshots` : `id, agenceId, employeIdsJson, datesJson, rowsJson (lignes affectées avant réécriture), raison ('recalcul'), createdBy, createdAt` — un snapshot par appel `saveWeek`.
   - `evaluation_snapshots` : `id, agenceId, evaluationId, version, entityJson (évaluation), scoresJson (notes par critère), raison ('recalcul'), createdBy, createdAt` + unique `(evaluationId, version)`.
   - `leave_balance_snapshots` : `id, agenceId, leaveBalanceId, version, entityJson (solde avant décompte), raison ('decision'), createdBy, createdAt` + unique `(leaveBalanceId, version)`.
3. **Versionnement** : helper pur `prochaineVersion(versions)` = `max + 1` (`1` si aucune ligne) — pas de course si VERSION sélectionnée juste avant insertion (1 procédure à la fois sur un bulletin).
4. **Helpers purs `src/server/lib/rh-snapshots.ts`** (testables vitest, sans DB) : `prochaineVersion`, `comparerLignes(avant, apres)` → diff structuré `{ ajoutees, supprimees, modifiees }` servant de **preuve « comparaison avant/après »**.
5. **Points de branchement** (archive juste avant la mutation de régénération) :
   - `prepareMonth` → branche `existing` : snapshot bulletin courant + lignes, raison **`recalcul`** ;
   - `adjustEntry` → snapshot bulletin courant + lignes, raison **`adjustment`** ;
   - `saveWeek` (N13) → snapshot des lignes affectées avant le DELETE, raison **`recalcul`** ;
   - `saveEvaluation` → branche `existing` : snapshot évaluation + scores, raison **`recalcul`** ;
   - `decideRequest` → branche décompte : snapshot du solde **avant** `update(leaveBalances)`, raison **`decision`**.
6. **RBAC / agence** : les snapshots sont écrits par les procédures déjà permées (`rh.paie.modifier`, `rh.presence.modifier`, `rh.evaluation.modifier`, `rh.conge.modifier`) et portent `agenceId`. **Aucune lecture publique ajoutée** (case API du registre = mutations existantes) ; l'historique est consultable en base pour le gate (preuve). Case UI du registre = `—` → **aucun écran livré** (l'affichage des historiques est proposé en Phase 7, fiche employé onglet Historique).
7. **Migration** `packages/db/src/scripts`… : script tsx **additif et idempotent** (`CREATE TABLE IF NOT EXISTS` + index), exécuté en dev ; **rollback = `DROP TABLE`** (aucune donnée existante touchée). Suit le modèle `migrate-rh-sortie.ts` (env-guard local/forced, `postgres.unsafe`).

## 3. Déroulé d'exécution

1. Schéma `rh_snapshots.ts` + export `schema/index.ts` + migration `migrate-rh-snapshots.ts`.
2. Helpers purs `rh-snapshots.ts` + `rh-snapshots.test.ts`.
3. `rh-payroll.ts` : `prepareMonth` + `adjustEntry` (P13 bulletins).
4. `rh-planning.ts` : `saveWeek` (N13).
5. `rh-evaluation.ts` : `saveEvaluation`.
6. `rh-leave.ts` : `decideRequest`.
7. Tests (vitest RH + suite globale), typecheck fichiers touchés, audit rg (plus aucun DELETE+INSERT nu sur les 4 domaines), `graphify update`, journal (T22+), registre EN_TEST→TERMINE→VALIDE, RAPPORT_PHASE_6, autorévision, gate humain.

## 4. Risks & garde-fous

- Aucune table existante modifiée (4 migrations = pur `CREATE TABLE`) ; rollback trivial (`DROP`), zéro risque pour les données courantes.
- Ne pas toucher aux autres phases (N05 purge / P16-purge / P20 / N14… restent BACKLOG).
- Les DELETE + INSERT de régénération **restent** (état actif réécrit) mais deviennent **non destructifs** : chaque remplacement est précédé d'un snapshot `version+1`.
- Pas de sur-ingénierie : pas d'endpoint de lecture nouveau, pas d'UI, pas de mécanisme de diff au runtime — les helpers purs couvrent la preuve « avant/après » sans complexifier les mutations.