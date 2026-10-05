# RAPPORT DE PHASE 3 — Socle multi-tenant et sécurité (N01, P03, N11, P16, P17, P19)

Date : 2026-09-23
Phase : 3 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 4)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| **N01 — socle agence** | ✅ Helper pur `assertEmployeEnAgence(employeId, agenceId, verifier?)` (`rh-scope.ts`) + `employeEnAgence` ; refus systématique `NOT_FOUND` « Employé introuvable. » (jamais d'info d'existence). Appliqué à **toutes** les lectures/mutations « par id » hors `rh.ts` : posture (`pointer`, `annulerEvenement`, `corrigerHeure`, `annulerJournee`, `journee`, `salaireIntervalle`, `historique`), leave (`createRequest`, `adjustBalance`, `decideRequest`), payroll (`getEntry`), discipline (`listRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `getEmployeeDossier`), documents (`listDocuments`, `createDocument`, `updateDocument`, `deleteDocument`, `getExpirationAlerts`), compétences (`updateSkill`, `deleteSkill`, `listPositionSkills`, `set/removePositionSkill`, `listEmployeeSkills`, `set/removeEmployeeSkill`, `getGaps`, `updateTraining`, `deleteTraining`, `createSession`, `updateSession`, `deleteSession`, `listParticipations`, `addParticipation`, `updateParticipation`, `removeParticipation`), évaluation (`getEvaluation`, `saveEvaluation`) |
| N01 — tables sans agenceId | ✅ Scope par **jointure du parent agencé** (`employes`, `positions`, `trainingSessions`, `evaluationGrids`, `payrollPeriods`) + `eq(parent.agenceId, ctx.user.agenceId)` ; refus 404 |
| N01 — tests | ✅ `rh-scope.test.ts` 4/4 (trouvé même agence / autre agence / inexistant + verifier injecté) ; rg des `where` agence sur les routers RH |
| **P03 — fuite `rhPosture.now`** | ✅ `where(and(eq(employes.agenceId, agence), eq(employes.statut, "actif")))` + **`salaireBase` retiré de la réponse** (gain toujours calculé côté serveur, aucune donnée salariale brute exposée) |
| **N11 — effets des statuts** | ✅ Règles décrétées respectées : **suspendu** = jours suspendus non payés (prorata jusqu'à la veille via `veilleDe`), exclusion totale si période entièrement après ; **congé** = paie conservée (rien changé) |
| N11 — prorata | ✅ `regimeSuspensionEnPeriode({statut, suspensionStart, debutPeriode})` → `aucun|total|partiel` ; `prepareMonth` charge les suspensions ouvertes (`employeeStatusHistory`, `endDate IS NULL`, jointures agence) et applique `dateSortiePaie` au prorata et à `baseEffectifPeriode` ; tests payroll-engine 4 cas (aucun / total / partiel début de mois / partiel en cours de mois) |
| N11 — compte | ✅ `rh.update` : passage `suspendu|archive` → `utilisateurs.isActive = false` si `employe.userId` ; retour `actif|conge` → `true` ; congé seul ne touche pas le compte |
| N11 — planning | ✅ `rhPlanning.listEmployes` : réservoir = `inArray(statut, ["actif", "conge"])` (suspendus et sortis exclus) |
| N11 — effectif/KPI | ✅ `effectifParStatut(statuts)` (rh-stats-engine) : `effectif = actif + congé + suspendu` (hors sorti/archive) + compteurs `actifs/enConge/suspendus/inactifs` ; `getKpis` branché dessus |
| **P16 — durcissement** | ✅ Aucun `delete` de procédure (purge = Phase 9/N05) ; toutes les mutations ont `requirePermissionProcedure` + scope agence/404 ; toutes les lectures par id scopées par jointure ; `rh.ts` : `listSanctions`, `createSanction`, `listContrats`, `createContrat`, `renouvelerContrat`, `listDocuments`, `createDocument`, `deleteDocument`, `createAbsence`, `validerAbsence` durcis |
| **P17 — gating** | ✅ `EmployeesPageClient.tsx` : bouton « Modifier » `disabled={!hasPermission("rh.employe.modifier")}` ; « Fiche » (lecture) conservé |
| **P19 — KPI hors sortis** | ✅ `getKpis` : `where inArray(["actif","conge","suspendu"])` (exclut sorti + archive) ; masse salariale = `payrollMass(effectif)` donc hors sortis ; compteurs `enConge` + `suspendus` ajoutés ; import `ne` retiré |
| Tests | ✅ T19 : **124/124** verts — payroll-engine 55 (dont N11 4 cas), presence-engine 30, avances-engine 25, rh-stats-engine 10 (dont N11/P19 2 cas), rh-scope 4 |
| Non-régression / typecheck | ✅ `tsc --noEmit` : 0 erreur sur les fichiers touchés (seule `rh-stats-engine:46` = `payrollMass` préexistant, ligne inchangée par le diff) ; erreurs restantes **préexistantes** hors périmètre (catalog, pos, sales, stock, cash, geo, ui, alert/compta/kpi/return/sale/stock-services, licence/stock tests) |

## Lignes passées (BACKLOG → EN_INSPECTION → EN_CONCEPTION → EN_IMPLEMENTATION → EN_TEST → **VALIDE**)

- **N01** — Isolation multi-tenant des lectures/mutations « par id » (P0)
- **P03** — Fuite cross-tenant `rhPosture.now` : agence + salaire masqué (P0)
- **N11** — Effets réels congé/suspendu : paie, effectif, planning, compte (P1)
- **P16** — Durcissement des ~34 procédures mortes (agence + permissions) (P2)
- **P17** — Gating bouton « Modifier » (P2)
- **P19** — KPIs effectif/masse hors sortis + niveau suspendu (P2)

Le bloc P19 est co-traité avec N11 (même filtre effectif) comme prévu à la conception §8 et §9.

## Preuves

- `npm test -- --run src/server/lib/payroll-engine.test.ts src/server/lib/presence-engine.test.ts src/server/lib/avances-engine.test.ts src/server/lib/rh-stats-engine.test.ts src/server/lib/rh-scope.test.ts` → **124/124** verts
- `npm run typecheck` → 0 erreur sur les fichiers touchés de la phase (liste des erreurs globales = préexistantes, hors périmètre RH)
- `rg` scope agence : aucun router RH Phase 3 sans `eq(...agenceId, ctx.user.agenceId)` sur les lectures/mutations par id
- `TEST_JOURNAL.md` §1 : réf **T19** ajoutée · §2 : entrée n°3 renseignée
- `graphify update .` exécuté (règle AGENTS.md)

## Régressions

0 connue sur la baseline ; full-suite garde 2 échecs **préexistants hors RH** (licence-service, stock-engine) — inchangés depuis avant la phase. Erreurs typecheck restantes toutes préexistantes, hors périmètre RH.

## Décisions produit actées

- **Suspension** = jours non payés, paie proratée à la veille de la date d'effet ; période entièrement après la suspension = pas de bulletin.
- **Congé** ne modifie ni paie ni compte (accès maintenu).
- **Suspendu/archivé** : compte utilisateur désactivé (`utilisateurs.isActive = false`), réactivé au retour `actif|conge`.
- **Planning** : réservoir d'affectation = statuts `actif` + `conge` uniquement.
- **Effectif/KPIs** : définition unique = `actif + congé + suspendu`, sortis/archivés exclus de l'effectif et de la masse salariale.
- **Refus multi-tenant** : `NOT_FOUND` (jamais d'information sur l'existence d'une ressource d'un autre agence).

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Restes de phase (BACKLOG conservés, autres phases)

- **P09** (masquage `getFiche`), **P10** (PDF bulletin), **P11** (exports CSV), **P18** (recherche globale), **N02** (rôles opérationnels), **N18** (note `governance.invite`), **N19** (validation dure) — restent BACKLOG Phases 3/9, non actifs.
- **T15 tRPC multi-milieux complet** (salaire/présence/bulletin/documents/discipline/compétences Agence A→B) : la base posée est `rh-scope` vitest ; le routage tRPC complet est proposé en Phase 4 (§BACKLOG N19) pour couvrir aussi les modules Présences.

## Demande

**Ouvrir la Phase 4 (Présences / absences / temps — P06, P07, P08, P15, N04, N06, N17 + analyse de période) : oui — gate humain Phase 3 passé (feu vert 2026-09-23), registre Phase 3 clôturée.**