# RAPPORT DE PHASE 7 — UX/UI : pagination & recherche (N14), harmonisation libellés/devise (P20), lecture des historiques (F27)

Date : 2026-09-23
Phase : 7 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 8)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| **P20 — module de libellés partagé** | ✅ `lib/rh-labels.ts` créé : `STATUT_EMPLOYE_LABELS` (actif/conge/suspendu/archive/sorti) + `COLORS`/`BADGE_COLORS` + `TYPE_EMPLOYE_*` + `TYPE_EMPLOYE_OPTIONS` + `MODE_PAIE_OPTIONS` + `statutLabel/statutColor/statutBadgeColor/typeLabel` + `RAISON_LABELS`/`raisonLabel` (recalcul/adjustment/decision). Consommé par EmployeesPageClient, EmployeeDetail, EmployeeForm, contrats, organigramme, DisciplinaireRH, Annuaire, HistoriqueDialog. **Locaux supprimés** (statutColors/statutLabels/typeLabels/statutBadgeColor/const typeOptions/modePaieOptions/statutOptions en dupliqués). |
| **P20 — devise canonique XOF** | ✅ `lib/format.ts` : `DEVISE_DEFAUT = "XOF"` + `formatDevise(amount, devise)`. Remplacements : contrats (salaire base), DisciplinaireRH, DashboardRH (`} F`→`} XOF`), EvaluationsRH (FCFA→XOF), PaieRH (`Brut`/`Σ Primes`/`otherEarnings`), PresencesRH (prime de tâche + libellé aide), PointageDirect (taux/heures/primes/brut + tableau `gainJour`), **PDF bulletin** (route `[id]` : en-tête Montant (XOF), net payé XOF, charges patronales XOF), rename `fmtFCFA`→`fmtXOF` (7 fichiers). Audit `Select-String` : **0 occurrence `FCFA` ni suffixe ` F` restante dans le périmètre RH** (hors définitions formatteur). |
| **P20 — textes dupliqués** | ✅ « Gérez les employés de votre librairie » → « …votre structure » (EmployeesPageClient). |
| **N14 — Annuaire serveur** | ✅ `annuaire/page.tsx` réécrit sur `rh.list({page, limit:50, search, exclureArchives, departmentId})` : recherche serveur (nom/prénom/matricule ILIKE), filtre département (id), compteur honnête, état « 0 résultat », `PaginationBar` 50/page — **fin du cap 100 silencieux et du filtrage archive en cache**. |
| **N14 — `rh.list` + `exclureArchives`** | ✅ `rh.ts` : input `exclureArchives: z.boolean().optional()` → `ne(statut, "archive")` quand `statut` absent (import `ne` ajouté) — décompte serveur réel. Aucun impact sur le comportement des autres appels (param optionnel). |
| **N14 — composant partagé de pagination client** | ✅ `ClientPagination.tsx` : `useClientPaging(items, 25)` (reset page 1 si dépassement, slicing) + `PaginationBar` (compteur « N label » + « N label · page x/y » + Précédent/Suivant + état « 0 résultat »). |
| **N14 — 5 listes paginées** | ✅ contrats (page) · DocumentsRH (documents) · DisciplinaireRH (records) · CompetencesRH (référentiel + formations, instances séparées) · PlanningRH (grille hebdo) — `map` → `pageItems`, états vides recherche-aware, `PaginationBar` inséré (fragments `<>` là où le ternaire devient multi-racine). |
| **F27 — 4 endpoints de lecture gatés** | ✅ `rhPayroll.listBulletinSnapshots` (`rh.paie.modifier`, filtres entry/period/employee + limit, tri version+id desc, join `utilisateurs` pour créateur) · `rhPlanning.listWeekSnapshots` (`rh.presence.modifier`, tri id desc) · `rhEvaluation.listSnapshots` (`rh.evaluation.modifier`, filtre evaluationId) · `rhLeave.listBalanceSnapshots` (`rh.conge.modifier`, filtre leaveBalanceId) — **mêmes perms que les mutations d'écriture**, lecture pure. |
| **F27 — UI « Historique »** | ✅ `HistoriqueDialog.tsx` partagé (overlay, version badge, raison traduite `raisonLabel`, créateur + date, détail JSON repliable). Boutons gatés par `hasPermission` dans PaieRH (barre de synthèse), PlanningRH (barre outils), EvaluationsRH (onglet Historique), CongesAbsences (Soldes) — masqués sans permission (règle UX §6), queries `enabled` à l'ouverture. |
| **Règle UX** | ✅ §1 recherche : présent sur les listes ; §2 validation : aucune nouveau champ libre (uniquement boutons de lecture) ; §3 feedback `toast()` : inchangé (aucun `alert/confirm` ajouté) ; §4 états : loading/empty/error sur les dialogues et l'annuaire ; §5 actions destructives : inchangées ; §6 permissions sincères : boutons F27 masqués sans permission. |
| **Tests** | ✅ **T23 : 379/381 verts** (suite globale identique baseline T22 — seuls les 2 échecs préexistants hors RH) ; 39/39 sur les 4 fichiers RH (`rh-scope`, `rh-recherche`, `rh-snapshots`, `rh-stats-engine`). |
| **Non-régression / typecheck** | ✅ `tsc --noEmit` : **0 erreur sur les fichiers touchés Phase 7** ; restent uniquement les erreurs **préexistantes** : `rh.ts` ×7 (`endDate/employeeCodeSequence/photoUrl`, décalées +2 lignes par `exclureArchives`), `rh-stats-engine:62` (`payrollMass`), contrats/page `useMutation` ×2, + le reste du projet hors périmètre RH (inchangé). |
| **Conformité branchement EN_TEST** | ✅ Registre : P20/N14/F27 → EN_CONCEPTION → … → TERMINE, chaque passage testé ; `TEST_JOURNAL.md` réf **T23** + entrée **n°7** renseignée ; autorévision produite (ce document). |

## Lignes passées (EN_CONCEPTION → EN_IMPLEMENTATION → EN_TEST → TERMINE)

- **P20** — harmonisation UX : libellés statuts FR unifiés, devise XOF, textes dupliqués (P2)
- **N14** — cap 100 silencieux → pagination + état recherche (annuaire 50/page serveur, 5 listes 25/page client) (P2)
- **F27** — lecture des historiques snapshots P13 : 4 endpoints de lecture gatés + dialogues « Historique » (P2)

## Preuves

- `npx vitest run src/server/lib/rh-scope.test.ts src/server/lib/rh-recherche.test.ts src/server/lib/rh-snapshots.test.ts src/server/lib/rh-stats-engine.test.ts` → **39/39 verts**
- `npx vitest run` (suite globale) → **379/381 verts** (2 échecs préexistants hors RH inchangés : licence-service, stock-engine)
- `npx tsc --noEmit` → **0 erreur fichiers touchés Phase 7** (détail §autorévision)
- Audit `Select-String` : **0 occurrence `FCFA` / `} F` dans le périmètre RH** (devise = XOF partout)
- `TEST_JOURNAL.md` §1 : réf **T23** ajoutée · §2 : entrée **n°7** renseignée
- `DOC/RH/PHASE_7_CONCEPTION.md` : décisions actées (annuaire serveur, pagination 25/50, devise XOF, endpoints gatés mêmes perms)
- `graphify update .` exécuté après modification (règle AGENTS.md)

## Régressions

0 connue sur la baseline RH. Full-suite garde 2 échecs **préexistants hors RH** (licence-service, stock-engine) — inchangés. Erreurs typecheck restantes toutes préexistantes, hors périmètre (liste §autorévision).

## Décisions produit actées (détaillées : `PHASE_7_CONCEPTION.md`)

1. **Devise canonique RH = XOF** (source agence `settings.currency` inchangée pour `formatCurrency` hors périmètre RH) ; affichage unifié XOF dans tout le module.
2. **Annuaire = pagination serveur 50/page** (recherche + filtre département serveurs, compteur réel) ; les 5 listes intra-page = pagination client 25/page via composant partagé.
3. **F27 : lecture seule, pas de replay** — l'historique est restitué (version, raison, date, créateur, JSON archivé) sans bouton de restauration.
4. **RBAC F27 = mêmes permissions que les mutations d'écriture** qui posent les snapshots (`rh.paie.modifier`, `rh.presence.modifier`, `rh.evaluation.modifier`, `rh.conge.modifier`) — les bulletins/soldes exposent des montants.
5. **UI « Historique » masquée sans permission** (règle UX §6), pas d'appel tant que le dialog n'est pas ouvert.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Restes de phase (BACKLOG conservés, autres phases)

- **N15** (exports multi-cibles), **N16/F25** (impression listes), **N18** (couplage governance→employes.userId), **N19** (durcissement Zod), **N05/P16** (purge procédures mortes, Phase 9), **P09** (masquage salaire `getFiche`), **P10** (permission PDF bulletin — le PDF a été harmonisé XOF mais la garde RBAC reste à poser), **P11** (gardes RBAC exports) → phases 8/9. **P14 variable (commission)** conservé (aucun taux de commission en base).

## Demande

**Gate Phase 7 à passer** : lignes P20/N14/F27 à passer TERMINE → **VALIDE** au registre et rapport validé, feu vert pour ouvrir la Phase 8 (baseline : transferts/exports/impression + gardes, priorité N15).