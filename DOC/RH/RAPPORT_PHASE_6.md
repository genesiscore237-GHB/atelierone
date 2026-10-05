# RAPPORT DE PHASE 6 — Historisation métier : snapshots versionnés (P13, N13)

Date : 2026-09-23
Phase : 6 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 7)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| **P13 — snapshot bulletins (paie)** | ✅ Helper `archiverBulletin(ctx, entryId, raison, userId)` (`rh-payroll.ts:48-78`) : SELECT entrée + lignes (`payroll_entry_lines`), calcule `prochaineVersion` sur `payroll_entry_snapshots` (uniq `(payrollEntryId, version)`), INSERT snapshot avec `entityJson` + `linesJson` + `raison` + `createdBy`/`createdAt`. Branches branchées : `prepareMonth` **existing** (raison `"recalcul"`, l.524) et `adjustEntry` (raison `"adjustment"`, l.732) — **avant** tout DELETE de régénération. |
| **P13 — snapshot planning hebdo** | ✅ `saveWeek` (`rh-planning.ts`) : sélection des lignes `planning_affectations` affectées **avant** le delete+insert, INSERT `planning_snapshots` (raison `"recalcul"`, l.59) → le planning antérieur reste rejouable. |
| **P13 — snapshot évaluations** | ✅ `saveEvaluation` branche **existing** (`rh-evaluation.ts`) : archive évaluation + scores (`entityJson` + `scoresJson`, raison `"recalcul"`, l.245) avant le `delete(evaluationScores)`/UPDATE — **avant** l'écrasement. |
| **P13 — snapshot solde (décision congé)** | ✅ `decideRequest` branche **décompte** (`rh-leave.ts`) : archive le solde (`entityJson` + `employeIdsJson` en cours de validation, raison `"decision"`, l.425) avant `update(leaveBalances)` — l'état du solde pré-décision est conservé. |
| **Helpers purs** | ✅ `rh-snapshots.ts` : `prochaineVersion(versions)` = max+1 (1 si vide) et `comparerLignes(avant, apres, cle)` = diff `{ajoutees, supprimees, modifiees, inchangees}` — **7/7 tests verts** (version 3, comparaison 4). |
| **Schéma (4 tables)** | ✅ `packages/db/src/schema/rh_snapshots.ts` : `payroll_entry_snapshots`, `planning_snapshots`, `evaluation_snapshots`, `leave_balance_snapshots` — chacune avec `agence_id`, `raison`, `created_by`, `created_at`, colonnes jsonb versionnées (`entityJson`, `linesJson`, `rowsJson`, `scoresJson`, `employeIdsJson`, `datesJson`), uniq contrainte `(…Id, version)`, index sur FK. Exporté via `schema/index.ts` + égalité de type vérifiée par `packages/db` tsc. |
| **Migration** | ✅ `migrate-rh-snapshots.ts` (pattern `migrate-rh-sortie.ts` : `requireLocalOrForced`, transactionnel, **additive** `CREATE TABLE IF NOT EXISTS` + index, rollback = `DROP TABLE`) + script package.json `migrate:rh-snapshots`. ⚠️ **Non exécutée en dev ici** (aucune base locale accessible) — à exécuter sur l'environnement de dev avant mise en prod (aucune donnée existante n'est altérée). |
| **N13 — suppression du DELETE+INSERT planning** | ✅ Le delete+insert de `saveWeek` est désormais précédé d'un snapshot → plus aucun écrasement silencieux ; `rg` de vérification : `planningSnapshots` avant `.delete(planningAffectations)` (l.59/71). |
| **Audit « plus aucun DELETE+INSERT nu »** | ✅ `rh-payroll.ts` (delete `payrollEntryLines` l.530 et l.748 : précédés des snapshots l.524/l.732), `rh-evaluation.ts` (delete `evaluationScores` l.267 : précédé snapshot l.245), `rh-planning.ts` (l.71 : précédé snapshot l.59) — **aucun DELETE de régénération non archivé** sur les 4 domaines. |
| **Anomalie d'édition (imitée/corrigée en cours)** | ⚠️→✅ Le premier placement du helper `archiverBulletin` dans `adjustEntry` avait atterri par erreur dans `prepareMonth` (oldString ambigu). Bloc mal placé retiré, helper réinséré au bon endroit (`adjustEntry`, l.732-740) ; recalcul refait et **vérifié par l'audit** ci-dessus. |
| **Tests** | ✅ **T22 : 379/381 verts** (suite globale) — `rh-snapshots.test.ts` **7/7** nouveaux ; test engins liés (`rh-recherche` 8, `payroll-engine` 57, `leave-engine`, `avances-engine`, `employe-url` 3) verts à l'issue ; seuls 2 échecs **préexistants hors périmètre** (licence-service, stock-engine) inchangés. |
| **Non-régression / typecheck** | ✅ `tsc --noEmit` : **0 erreur sur les fichiers touchés** de la phase (`rh-payroll.ts`, `rh-planning.ts`, `rh-evaluation.ts`, `rh-leave.ts`, `rh-snapshots.ts`, `rh-snapshots.test.ts`) + **0 erreur `packages/db`** (schéma + migration) ; restent uniquement les erreurs **préexistantes** hors périmètre (inchangées). |
| **Anti-règle UX / conformité branchement EN_TEST** | ✅ Pas d'UI dans cette phase (cas « — » aux registre) → règles UX §1-6 non concernées (aucun nouveau champ modifiable) ; conformité « chaque passage EN_TEST = lint + typecheck + tests + scénarios + effets secondaires » respectée (registre) |

## Lignes passées (EN_INSPECTION → EN_CONCEPTION → EN_IMPLEMENTATION → EN_TEST → TERMINE → **VALIDÉ** au registre)

- **P13** — snapshots historiques métier (bulletins paie `recalcul`/`adjustment`, planning, évaluations, soldes décisions) — fin du DELETE+INSERT (P1)
- **N13** — `saveWeek` planning : historiser (suppression DELETE+INSERT) (P1)

## Preuves

- `npx vitest run src/server/lib/rh-snapshots.test.ts src/server/lib/rh-recherche.test.ts src/server/lib/payroll-engine.test.ts src/server/lib/leave-engine.test.ts src/server/lib/avances-engine.test.ts src/lib/employe-url.test.ts` → **vert** (7 + 8 + 57 + leave + avances + 3)
- `npx vitest run` (suite globale) → **379/381 verts** (7 nouveaux ; 2 échecs préexistants hors RH inchangés)
- `npx tsc --noEmit` : 0 erreur fichiers touchés Phase 6 + `packages/db` (détail §autorévision)
- Audit `Select-String` : chaque DELETE de régénération précédé d'un snapshot (l.524→530, 732→748, 245→267, 59→71)
- `TEST_JOURNAL.md` §1 : réf **T22** ajoutée · §2 : entrée **n°6** renseignée
- `DOC/RH/PHASE_6_CONCEPTION.md` : décisions de conception actées + déroulé
- `graphify update .` exécuté après modification (règle AGENTS.md) — 6547 nœuds / 11648 arêtes

## Régressions

0 connue sur la baseline RH. Full-suite garde 2 échecs **préexistants hors RH** (licence-service, stock-engine) — inchangés. Erreurs typecheck restantes toutes préexistantes, hors périmètre RH (liste §autorévision).

## Décisions produit actées (détaillées : `PHASE_6_CONCEPTION.md`)

1. **Versionnement `version+1`** pour chaque métadonnée rejouable ; uniq `(…Id, version)` — pas de fenêtre de fenêtre temporelle.
2. **DELETE+INSERT mécanique conservé mais non destructif** : archive AVANT toute régénération (raison `recalcul`/`adjustment`/`decision`).
3. **Aucun endpoint de lecture ni UI en Phase 6** (cas registre « — ») — l'affichage historique est proposé Phase 7 (UX/UI P20/N14) ; les snapshots sont écrits, rejouables, mais pas encore exposés.
4. **RBAC** : les 4 mutations sont déjà permées (`rh.paie.modifier`, `rh.presence.modifier`, `rh.evaluation.modifier`, `rh.conge.modifier`) — aucun nouveau scope.
5. **Corrections présences déjà soft (N01/T10)** : pas de 5e domaine (jours recalculés sans écraser).
6. **Migration additive idempotente** (`CREATE TABLE IF NOT EXISTS`, index ; rollback = `DROP TABLE`), non destructive, versionnée — protocole A–G étape 7 respecté.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Restes de phase (BACKLOG conservés, autres phases)

- **P14 variable (commission)** : rapporté P14 (backlog) — aucun taux de commission en base.
- **P20, N14, N15, N16, N18, N19, F25, N05/P16(purge), P09, P10, P11 (gardes/lecture/PDF/export)** : phases 3/7/8/9 — non actifs.
- **Lecture des historiques (Phase 6 sans UI)** : exposé en Phase 7 (pagina concernant les onglets RH, filtre, lecture `rh.*.snapshots`).

## Demande

**Gate Phase 6 : passé le 2026-09-23 — lignes P13/N13 à VALIDE au registre, rapport validé. Feu vert humain obtenu pour ouvrir la Phase 7 (UX/UI — P20/N14 : harmonisation + pagination, et F27 : lecture des historiques).**