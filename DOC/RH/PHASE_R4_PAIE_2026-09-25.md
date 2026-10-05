# PHASE R4 — PAIE / MOTEUR DE PAIE & COHÉRENCE

Date : 2026-09-25 · Statut : **VALIDE SOUS RÉSERVE — GATE API 35/35 + REPRISE UI Playwright 3/3** · TEST_TECHNIQUE + TEST_FONCTIONNEL + VÉRIFIER réalisés
Séquence : PLANIFIER → INSPECTER → REPRODUIRE → CONCEVOIR → IMPLÉMENTER → TEST_TECHNIQUE → TEST_FONCTIONNEL → VÉRIFIER → DOCUMENTER → GATE → STOP.

---

## 1. Objectif & périmètre

Corriger la chaîne salariale de la paie (cellule « PAIE » du dashboard RH) pour que BRUT et NET
reflètent une source de vérité unique, sans net négatif, sans inclusion des employés archivés,
avec bornes de période mensuelles et permissions serveur/UI sincères. Suite des phases
R1 (métier) → R2 (closeMonth/paie) → R3 (présences & temps).

Périmètre **exclu (hors R4)** : architecture complète des avances + cycle paiement/récupération
(R5), refonte historiques RH, rapports RH généraux, refonte Documents, Compétences,
`PlanningRH.tsx:82`. R4 consomme uniquement les données d'avances déjà calculées, ne crée
aucun flux R5.

## 2. Séquence & registre

- Registre : `DOC/RH/RH_EXECUTION_REGISTER.md` — section « R4 (REC-1) » (10 critères).
- R4 n'absorbe pas R5 ; se termine par **STOP** (pas d'ouverture de R5 sans instruction).

## 3. Méthode & environnement

- OS Windows 10, PowerShell 5.1, PostgreSQL 17 local, db `atelierone_erp`, psql
  `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Tests unitaires : `vitest` depuis `apps/nextjs`. Appels API : caller tRPC réel
  (`createCallerFactory`) avec DB réelle + middlewares (tenant, licence, RBAC, audit).
- Écritures réelles validées : `closeMonth(2026,9)` (prérequis N10), `prepareMonth(4)` (upsert
  bulletins + snapshots P13). Captures avant : `audit/r4/r4-before-*.txt` (lecture seule).

## 4. Référentiel — source salariale canonique

- Chaîne : CONTRAT / MODE RÉMUNÉRATION → SALAIRE PÉRIODE (historique daté `employee_salary_history`
  prioritaire G10, sinon fiche `employes`) → TEMPS R3 (`attendance_calculations`) → retenues →
  BRUT → NET.
- `rh.ts` écrit déjà l'historique salarial à toute modification (lignes 437–452). Les bulletins
  legacy « base fantôme » (250000/300000/…) ne figurent dans **aucune** source → corrigés à la
  re-préparation.

## 5. État AVANT — constats REPRODUCTION (A–I)

Cf. `audit/r4/REPRODUCTION.md` + captures `r4-before-*` :

- A — Base fiche ≠ base bulletin sans historique : emp 9 fiche 200000 → bulletins 250000 ; emp 21
  fiche **1000** → bulletins 120000 ; emp 17 fiche/historique 100000 → bulletins 80000.
- B — Bulletins générés sur base « fantôme » (aucune source fiche/historique).
- C — 24/30 employés sans dossier `employee_salary_history`.
- D — **Net négatif réel** : bulletin 52 (emp 21, période 4) = -4615,38 F (`RETENUE_ABSENCE`
  appliquée en SALAIRE_HORAIRE sur brut 0).
- E — Inclusion non bornée : emp 1 (Directeur, **archive**, mensuel 400000) serait payé.
- F — Temps R3 ≠ bulletins : emp 9 sept = 14 j/7264 min R3 vs 1 j/9,5 h au bulletin (~x13).
- G — Bornes : période 4 = 01/09→29/09 (mois incomplet), période 3 = 01/08→30/08.
- H — Permissions UI : seuls « Historique » conditionné ; ouvertures/calcul/clôture/paiement sans
  garde (403 au clic), et `prepareMonth` sans retour `skipped`/`errors`.
- I — `payroll_entry_snapshots` : 0 ligne (P13 jamais démontré en réel).

## 6. Causes racine

1. Base « fantôme » : bulletins 3/4 calculés avant le replay R3 et hors historique salarial.
2. `RETENUE_ABSENCE` (absent_days = base/26) appliquée aux modes **horaire** (payOnHours) où
   l'absence est déjà pénalisée par un volume nul → brut 0 - 4615,38 = net négatif.
3. Absence de garde `statut='archive'` dans `prepareMonth`.
4. Bornes de période laxistes (début/dernier jour non contrôlés).
5. UI ne masque pas les mutations sans permission et n'affiche pas skipped/errors.

## 7. Conception retenue (D1–D9)

Cf. `audit/r4/CONCEPTION.md` — décisions :

- **D1** source canonique unique (historique daté > fiche), aucun nouveau mécanisme d'écriture.
- **D2** `RETENUE_ABSENCE` réservée aux bases fixes : `SALAIRE_MENSUEL`, `FORFAIT_HEBDOMADAIRE` ;
  exclue pour `SALAIRE_HORAIRE`, `payOnHours`, `JOURNALIER`, `COMMISSION` ; garde `netPay < 0`
  conservée (refus explicite, jamais de `Math.max(0)`).
- **D3** skip `statut === "archive"` dans `prepareMonth` (raison « employé archivé (période non
  rémunérée) »).
- **D4** `openPeriod` : début = 1er du mois (sinon erreur explicite), fin forcée au dernier jour.
- **D5** snapshot P13 déjà en place (archiverBulletin) → démontré au TEST_FONCTIONNEL.
- **D6** permissions UI gated `rh.paie.modifier` + API déjà protégée.
- **D7** toast de retour `created/skipped/errors` sur `prepareMonth`.
- **D8** ordre des opérations : `closeMonth` avant `prepareMonth` (N10, déjà actif).
- **D9** non-régression & intégrité IDs (aucun DELETE).

## 8. Implémentation — moteur (D2)

`apps/nextjs/src/server/lib/payroll-engine.ts` :

- Retenue d'absence conditionnée par `absenceAssiseFixee` = `SALAIRE_MENSUEL` ou
  `FORFAIT_HEBDOMADAIRE`. Modes travail/volume (`SALAIRE_HORAIRE`, payOnHours, `JOURNALIER`)
  exemptés. `COMMISSION` déjà exclu.
- Garde `netPay < 0` conservée (avances/retards > brut → refus avec message explicite).
- Aucune autre règle salariale modifiée (brut horaire, HS, CNPS, IRPP inchangés).

## 9. Implémentation — routeur (D3/D4)

`apps/nextjs/src/server/api/routers/rh-payroll.ts` :

- `openPeriod` : bornes mensuelles — début ≠ `YYYY-MM-01` refusé
  (« Une période de paie mensuelle doit débuter le 1er du mois (YYYY-MM-01). ») ; fin ≠ dernier
  jour du mois refusé (« La période de paie doit couvrir tout le mois : fin attendue le … (dernier
  jour du mois), reçue … »). Contrôles avant le test de chevauchement N10.
- `prepareMonth` : skip `statut === "archive"` en tête de boucle (après chargement des employés),
  dans la comptabilité de sortie. Rattachement de la fiche/historique (D1), agrégation bornée
  présence (D8/R3), upsert bulletin + lignes + snapshot P13 (D5/D9).
- Mutations toujours protégées par `requirePermissionProcedure("rh.paie.modifier")`.

## 10. Implémentation — UI (D6/D7)

`apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/PaieRH.tsx` :

- `hasPermission("rh.paie.modifier")` ajouté sur : Ouvrir la période, Calculer la paie, Clôturer,
  Payer, Recalculer avec la prime (DetailBulletin), saisies config + bascule d'item (ConfigSection).
- `prepareMonth.onSuccess` → toast de synthèse avec `created` / `skipped` / `errors`.
- Hook `usePermissions()` introduit dans `BulletinsSection`, `DetailBulletin`, `ConfigSection`.

## 11. Implémentation — source d'historique (D1)

- Aucun code d'écriture créé : `rh.ts` écrit déjà `employee_salary_history`. La re-préparation
  lit l'historique daté (G10) puis la fiche ; les bulletins legacy sont corrigés par upsert.

## 12. Données — replay / upsert (aucune suppression)

- **Aucun DELETE** de `payroll_entries`, `payroll_entry_lines`, `attendance_*`, `employes`,
  `contrats`, `employee_salary_history`, `employee_advances`.
- `prepareMonth(4)` : **upsert** des bulletins existants par (période, employé) + **archiverBulletin**
  (P13) avant chaque régénération. Nouveaux bulletins (62, 63) insérés (trace de calcul).
- `closeMonth(2026,9)` : résumés septembre passés `locked=true` (état permanent attendu, N10).
- Comptages après : employes 30, contrats 15, entrées présences 266, calculs 265, résumés 52,
  bulletins 28 (P3=13 legacy + P4=15), snapshots 28, lignes bulletins 37, avances 0.

## 13. Preuve après correction — bulletins période 4

`audit/r4/r4-after-01-bulletins-p4.txt` (15 bulletins, ids 40–54) :

| Emp | Mode | Base | Normale h | Days absent | Net |
|---|---|---|---|---|---|
| 9 | SALAIRE_HORAIRE | 200000 (fiche) | 121,07 (R3) | 1 | 96374,32 |
| 10 | SALAIRE_HORAIRE | 80000 | 103,43 | 1 | 35073,46 |
| 11 | SALAIRE_HORAIRE | 200000 | 102,95 | 1 | 82549,07 |
| 12 | SALAIRE_HORAIRE | 150000 | 116,82 | 1 | 70848,73 |
| 13 | SALAIRE_HORAIRE | 80000 | 9,50 | 0 | 3221,48 |
| 14 | SALAIRE_HORAIRE | 80000 | 55,80 | 2 | 18921,97 |
| 15 | SALAIRE_HORAIRE | 80000 | 108,82 | 2 | 36901,24 |
| 16 | SALAIRE_HORAIRE | 40000 | 99,22 | 1 | 16822,92 |
| 17 | SALAIRE_HORAIRE | 100000 (fiche+histo) | 0 | 0 | 0,00 |
| 18 | SALAIRE_HORAIRE | 80000 | 63,73 | 2 | 21611,06 |
| 19 | SALAIRE_HORAIRE | 80000 | 119,88 | 1 | 40586,54 |
| 20 | SALAIRE_HORAIRE | 80000 | 112,68 | 1 | 38210,17 |
| 21 | SALAIRE_HORAIRE | **1000 (fiche)** | 120,18 | 1 | **509,42** |
| 62 | SALAIRE_HORAIRE | 80000 | 102,68 | 0 | 34819,14 |
| 63 | SALAIRE_HORAIRE | 100000 | 0 | 0 | 0,00 |

- Incohérence A corrigée : emp 9 = 200000 (fiche), emp 21 = 1000 (fiche), emp 17 = 100000
  (fiche + historique). Plus de base fantôme 250000/120000/300000/80000.
- Incohérence F corrigée : `normal_hours` = temps R3 (emp 9 = 7264 min = 121,07 h ; emp 11 =
  6177 min = 102,95 h ; emp 21 = 7211 min = 120,18 h), plus 9,5 h par défaut.
- Aucun bulletin à net négatif (cf. §14).

## 14. Preuve après correction — net négatif (D)

- Bulletin 52 (emp 21 Arnaud) : **-4615,38 → +509,42 F** (base 1000 × 120,18 h / heures réelles
  proratisées, sans retenue absence horaire).
- Mécanique validée par le moteur : en SALAIRE_HORAIRE, `RETENUE_ABSENCE` n'est plus émise
  (`absenceAssiseFixee=false`). Tests dédiés : 4 cas → disparition de la retenue en horaire /
  journalier, maintien en mensuel (2×150000/26) et forfait (1×75000/26).
- Synthèse `r4-after-04` : P4 = 15 bulletins, **0 négatif** (P3 legacy : 13 bulletins, 0 négatif).

## 15. Preuve après correction — inclusion bornée (E)

- `prepareMonth(4)` : **15 créés / 15 écartés / 0 erreur**.
  - Archivés écartés (D3) : employés 1, 2, 3, 4, 5, 6, 7, 8, 64, 65, 66
    (raison « employé archivé (période non rémunérée) ») → le Directeur (emp 1, 400000) n'est
    plus payé.
  - Salaire/forfait nuls écartés : 58, 59, 60, 61.
- Règles préexistantes conservées (sorti-avant-période, suspendu total, NON_REMUNERE net 0).

## 16. Preuve après correction — bornes de période (G/D4)

- `openPeriod({startDate:"2026-11-05", endDate:"2026-11-30"})` → **REFUS**
  « Une période de paie mensuelle doit débuter le 1er du mois (YYYY-MM-01). »
- `openPeriod({startDate:"2026-11-01", endDate:"2026-11-15"})` → **REFUS**
  « La période de paie doit couvrir tout le mois : fin attendue le 2026-11-30 (dernier jour du
  mois), reçue 2026-11-15. »
- Périodes legacy 3 (30/08) et 4 (29/09) figées, documentées, non modifiées.

## 17. Preuve après correction — snapshot P13 (I/D5)

- Avant : `payroll_entry_snapshots` = **0**. Après `prepareMonth(4)` : **28** snapshots
  (à chaque régénération d'un bulletin existant, l'état précédent est archivé).
- `listBulletinSnapshots` (procédure protégée `rh.paie.modifier`) exploitable.

## 18. Preuve après correction — permissions (H/D6)

`audit/r4/r4-after-06-permissions.txt` — replay API réel :

- rôle rh **sans** `rh.paie.modifier` : `listPeriods` OK (lecture rh libre), `openPeriod` et
  `closePeriod` → **FORBIDDEN** « Permission manquante : rh.paie.modifier ».
- superadmin (permissions explicites) : `listPeriods` OK.
- Procédures protégées : `openPeriod`, `closePeriod`, `prepareMonth`, `adjustEntry`, `markPaid`,
  `listBulletinSnapshots`, `updateItemConfig`. UI : boutons masqués/disabled sans permission,
  cohérent avec l'API.

## 19. Non-régression transversale

- **R3 (134 j / 1114,6 h / 45,6 %) : vérifié** après clôture + re-préparation
  (`audit/r4/r4-after-05-nonregression-r3.txt`) :
  - `analysePeriode(sept)` : jours présents **134**, absents 13, muets 135, **1114,6 h**, 16 employés.
  - `getKpis(2026,9)` : `presenceDays=134`, `workingDays=26`, `effectif=16`, présence **45,6 %**.
  - `closeMonth` n'a modifié que le verrouillage des résumés (locked) et le comptage
    « muet → absent » (P08, sémantique historique) ; les jours **présents** sont identiques
    avant/après et la vérité temps vit dans `attendance_calculations` (intacts : 265).
- Échecs vitest préexistants **hors périmètre** (inchangés depuis R2/R3) : `licence-service`,
  `stock-engine` (cf. §20).

## 20. Tests techniques

- `audit/r4` — suite complète **389 passés / 2 échecs préexistants hors périmètre**
  (licence-service = modèle licence, stock-engine = mouvements caisse/stock piétinés).
- Moteur paie (`payroll-engine.test.ts`) : **61/61** dont **5 nouveaux cas R4-D2** :
  1) SALAIRE_HORAIRE 0 h → aucune retenue absence, brut 0 ; 2) JOURNALIER absent → aucune retenue,
  brut = jours présents × taux ; 3) SALAIRE_MENSUEL → retenue 2 × (150000/26) conservée ;
  4) FORFAIT_HEBDOMADAIRE → retenue 1 × (75000/26) conservée ; 5) confirmations de structure.
- Typecheck (`tsc --noEmit`) : **0 erreur** sur les fichiers modifiés (payroll-engine.ts,
  rh-payroll.ts, PaieRH.tsx). Erreurs préexistantes hors périmètre (cash/finance/garage TS2339) inchangées.
- ESLint : pas de nouvelle erreur sur le périmètre RH.

## 21. Tests fonctionnels

1. Clôture présence sept (`closeMonth(2026,9)`) → OK, résumés locked=true (N10 satisfait).
2. Ré-préparation période 4 (`prepareMonth(4)`) → 15 bulletins réécrits (upsert), 15 écartés
   (archivés + salaires nuls), 0 erreur, snapshots P13 créés.
3. Bornes mensuelles : début ≠ 01 et fin ≠ dernier jour → refus explicites (§16).
4. Net négatif éradiqué : bulletin 52 = +509,42 ; aucun bulletin négatif sur P4.
5. Bases : fiche/historique reprises partout (D1) ; temps R3 intégré (F corrigée).
6. Permissions serveur + UI : lecture rh libre, mutations FORBIDDEN sans permission (§18).
7. Non-régression R3 (§19).

## 22. Intégrité des données & traçabilité

- Aucun DELETE ; upsert + snapshots uniquement (GATE #33, #34).
- IDs bulletins conservés (40–54) avec `updated_at` rafraîchi et snapshot de l'état précédent.
- Comptages stables : employes 30, contrats 15, entries 266, calcs 265, résumés 52 (45 R3 +
  7 closeMonth sept), snapshots 28, bulletins 28 (13 legacy P3 + 15 P4).
- État permanent modifié (contractuel) : résumés septembre verrouillés par la clôture RH
  (fonction RH-02 existante, prévue par D8/N10 pour toute préparation paie).

## 23. GATE R4 — 35 cases

Le détail case par case est dans `audit/r4/gate-r4-35cases.txt` — **35/35 PASS** :
- Bloc B (AVANT + causes racine, 6–11) : reproductions A, B, C, D, E, F, G, H, I.
- Bloc C (CONCEPTION D1–D9, 12–20) : décisions actées.
- Bloc D (IMPLÉMENTATION + TEST_TECHNIQUE, 21–26) : moteur/routeur/UI + 61 payroll + tsc.
- Bloc E (TEST_FONCTIONNEL API réelle, 27–34) : closeMonth, prepareMonth, bornes, net, bases,
  temps R3, snapshots, permissions.
- Bloc F (VÉRIFIER, 35) : non-régression R3 (134 j / 1114,6 h / 45,6 %).

## 24. Conclusion & statut

- **R4 (PAIE) = VALIDE SOUS RÉSERVE** — incohérences A–I corrigées : source canonique respectée (A/B/C),
  net négatif éradiqué (D), inclusion archivés bornée (E), temps R3 réintégré aux bulletins (F),
  bornes mensuelles (G), permissions UI/API sincères (H), snapshot P13 démontré (I).
- TEST_TECHNIQUE : 389 verts, 61 payroll (5 nouveaux D2). TEST_FONCTIONNEL : 7/7 (§21).
  VÉRIFIER : non-régression R3 validée (134 j / 1114,6 h / 45,6 %).
- **REPRISE UI (25/09, décision utilisateur)** : GATE API 35/35 complétée par un **test Playwright
  réel (Chrome)** — `apps/nextjs/playwright-r4.config.ts` + `e2e-r4/r4-paie.spec.ts` + global-setup —
  **3/3 PASS** (§24bis). L'interface est naviguée réellement : login admin/directeur, période ouverte,
  calcul de paie, toast « 15 bulletin(s) calculé(s) », table Bulletins 15 lignes sans net négatif,
  gating directeur (boutons désactivés + message), clôture persistante. Preuve : `audit/r4/r4-after-08-ui-playwright.txt`.
- **Écarts d'exploitation honnêtes** : les modes **MENSUEL/FORFAIT ne sont pas navigués en UI**
  (aucun salarié actif payé ainsi dans la démo — validés unitairement uniquement) ; la donnée réelle
  ne comporte pas de retards/HS à déduire (`late_deduction_amount`=0, `overtime_minutes`=0) — le
  moteur applique ces déductions dès qu'elles existent (payroll-engine.ts:516-522 / 457-461).
- **Anomalies hors périmètre documentées** : historique salarial incomplet (24/30 dossiers vides,
  piste UI fiche), heures théoriques hétérogènes fiche/paie (REC-5 BACKLOG), règles P08
  « muet → absent » du résumé (accepté, distinct du bulletin), réccurrence des bulletins
  préexistant hors chaîne R3 (legacy P3).
- **STOP** — ne pas ouvrir R5 (avances / valorisation HS / recalcul clôture) sans instruction
  utilisateur.

---

## 24bis. REPRISE UI — test Playwright (3/3 PASS)

| Test | Scénario réel navigué | Résultat |
|---|---|---|
| R4-UI-01 | SuperAdmin : login → Périodes (P4 ouverte, bouton Ouvrir actif, pas de message permission) → aperçu 15 bulletins + Brut total → **Calculer la paie** → toast « 15 bulletin(s) calculé(s) » → Bulletins (filtre P4, 15 lignes) → Arnaud 120,18h / 533,42 brut / **509,42 net** / prepare → **0 net négatif** sur les 15 lignes | ✔ PASS |
| R4-UI-02 | Directeur (sans `rh.paie.modifier`) : accès module RH conservé, **message « Permission requise » visible**, boutons Ouvrir / Calculer / Clôturer **désactivés** | ✔ PASS |
| R4-UI-03 | SuperAdmin : **clôture P4 depuis l'interface** → toast « Période clôturée » → badge « Clôturée » → boutons retirés ; persistance DB vérifiée (`closed_by=1`) | ✔ PASS |

Bilan net : **3/3 PASS (Chrome réel, 3,4 min)**. L'état permanent du run est cohérent :
période 4 close, 15 bulletins `prepare`, 0 net négatif, totaux = brut 535 009,22 − retenues 38 559,70 = net 496 449,52.

---

## Preuves

- `audit/r4/REPRODUCTION.md`, `audit/r4/CONCEPTION.md` — conception.
- `audit/r4/r4-before-01..08-*.txt` — captures AVANT (employés, historique, périodes, bulletins,
  résumés R3, lignes bulletins, avances, snapshots).
- `audit/r4/r4-after-01..06-*.txt` — captures APRÈS : bulletins P4, snapshots, résumés R3
  (verrouillés), synthèse (0 négatif), non-régression R3, permissions.
- `audit/r4/r4-after-07-lignes-gardes.txt` — lignes bulletins + gardes API + constats retards/HS.
- `audit/r4/r4-after-08-ui-playwright.txt` — **REPRISE UI : test Playwright 3/3** (artefacts dans
  `apps/nextjs/test-results/` + `playwright-r4-report/`) ; fichiers : `e2e-r4/r4-paie.spec.ts`,
  `e2e-r4/r4-global-setup.ts`, `playwright-r4.config.ts`.
- Tests : `apps/nextjs/src/server/lib/payroll-engine.test.ts` (61 dont 5 R4-D2).
- Registre : `DOC/RH/RH_EXECUTION_REGISTER.md`.

---

## 24ter. REPRISE CIBLÉE MENSUEL/FORFAIT — données réelles (GATE 20/20 PASS)

Complément demandé par l'utilisateur (25/09 — « REPRISE ») : lever la réserve sur les modes
**MENSUEL et FORFAIT** (§24 « écarts d'exploitation »), jusque-là validés unitairement uniquement,
en les démontrant sur **bulletins réels navigués en UI réelle** par injection + nettoyage ciblé.

### R4-B — injection contrôlée (aucune trace, par ID exact)
- `audit/r4/r4-reprise-inject-test.sql` (idempotent) : 3 salariés test **IDs 401/402/403** —
  401 **SALAIRE_MENSUEL 200000** (25 j présents, 0 absence), 402 **SALAIRE_MENSUEL 150000**
  (24 j + 1 absence), 403 **FORFAIT_HEBDOMADAIRE 50000/sem** (25 j + 1 absence) — avec contrats
  CDI, historique salarial daté, présences réelles sur les 25 jours ouvrés de septembre 2026.

### R4-B.3 — bulletins réels reconstruits (UI = API = DB = bulletin)
| Mode | Décompte | BRUT | Retenue absence | CNPS | IRPP | NET |
|---|---|---|---|---|---|---|
| Mensuel cas 1 (401) | 25 j / 0 abs | 220 000 | — | 9 900 | 21 515 | **188 585** |
| Mensuel cas 2 (402) | 24 j / 1 abs | 165 000 | **5 769,23** (1×150 000/26) | 7 425 | 12 770,87 | **139 034,90** |
| Forfait hebdo (403) | 25 j / 1 abs | 227 700 | **7 961,54** (1×207 000/26) | 10 246,50 | 21 423,79 | **188 068,17** |
| Horaire (emp 21, R4-B.4) | 120,18 h | 533,42 | — | 24,00 | — | **+509,42** |

Chiffres provenant de `payroll_entries` + `payroll_entry_lines` (DB), affichés identiquement
dans l'UI (Playwright R4-B-01, captures `audit/r4/r4-monthly-real-*.png`). Preuve complète :
`audit/r4/r4-reconstruction.txt`.

Points moteur démontrés en réel :
- Retenue absence **visible et exclusivement sur bases fixes** (D2) : mensuel/forfait ❌ horaire
  (l'absence y est déjà pénalisée par le volume de 0 min). Aucun `Math.max(0)` silencieux :
  net réellement > 0 (Arnaud +509,42, dépassé le -4615,38 de R3-bis).
- Prime de présence 10 % sur base/forfait si taux présence ≥ 95 % (2 cas vérifiés).
- Forfait jamais interprété comme mensuel/horaire (`FORFAIT_HEBDOMADAIRE` pur, label « Forfait
  hebdomadaire (4.14 sem × 50000 F) »).

### R4-C / R4-D / R4-E — non-régression & intégrité
- Baseline AVANT : replay R3 = 134 j / 1114,6 h / 16 / 45,6 % (`r4-regression-before-injection.txt`).
- APRÈS injection : delta documenté (employes +3, contrats +3, attendance +76, history +3 ;
  bulletins P4 non-test préservés = 15).
- **Nettoyage par ID exact 401-403** (`r4-reprise-cleanup-test.sql`), enfants → parents :
  **compteurs = baseline exacte** (30/15/266/265/28/37/8), bulletins P4 = 15, séquence id 67.
- APRÈS nettoyage : replay = 134 j / 1114,6 h / 13 absents / 16 / **45,6 %** — non-régression R3
  **rétablie** (`r4-nonregression-apres-cleanup.txt`).

### R4-F — suite relancée
- Vitest RH/paie ciblée : **161/161 PASS** (payroll 61, presence, rh-stats 26, avances 25,
  snapshots 7, scope 4, recherche 8).
- Vitest complet : **389/391 PASS** — 2 échecs préexistants hors périmètre (licence-service,
  stock-engine) ; `vitest.config.ts` exclut désormais `e2e-r4/**` (faux positifs Playwright).
- ESLint : 0 erreur. tsc : 0 erreur dans le périmètre R4 (résidu préexistant hors périmètre).

### GATE
`audit/r4/r4-reprise-gate.txt` — **20/20 PASS** → la réserve sur MENSUEL/FORFAIT est levée.
**STOP** — R5 non ouvert.