# PHASE R3 — PRÉSENCES & TEMPS (REC-1) : ANALYSE DE PÉRIODE, CONGÉS, KPI

Date : 2026-09-24 — Base : http://localhost:3000 — Postgres atelierone_erp — Branche refacto RH
Statut de sortie : VALIDE (GATE 33/33) — Méthode : reproduire AVANT, corriger code + données, re-vérifier après.

## 1. Résumé

REC-1 (« Présences & temps ») couvrait trois anomalies constatées lors de l'audit fonctionnel du
24/09/2026 : **(A)** l'onglet « Analyse de période » (F26) était **vide** (0 jour présent, 0 heure) alors
que « Mensuel & clôture » et le Dashboard affichaient des jours présents ; **(B)** un **congé approuvé**
(emp14, 28/08) n'était **pas projeté** (aucune entrée `conge`, aucun calcul) ; **(C)** le **dénominateur du
KPI de présence** était faussé (35,3 % = 147 j / (26 j × 16) sur l'effectif entier, sans règle des jours
comptables). Traitement : (1) corrections **côté serveur** (analyse alignée sur le moteur de mois,
projection des congés avec recalcul, garde `cycle` au pointage, dénominateur Σ jours comptables) ;
(2) **réalignement des données de démo** validé par l'utilisateur : relecture ciblée de `GPJ_POINTAGE`
(mapping EMP001…15 PAR NOM, replay additif/idempotent, aucun touché sur employes/contrats) ;
(3) **décision population** : Analyse = Mensuel = Dashboard sur **effectif vivant** (actif/conge/suspendu
= 16 employés) → **134 jours présents** en septembre sur les 3 écrans, **KPI 45,6 %**, 1114,6 h.
GATE 33/33, testé aussi 154/154 (vitest RH = 10 fichiers) + eslint 0 erreur + tsc 0 erreur sur le périmètre.

## 2. Périmètre de la mission R3 (REC-1) — Présences & temps

- Objectif : rendre « Analyse de période », « Congés » et « KPI » cohérents entre les écrans et avec le
  moteur de calcul (`attendance_calculations` → résumés mensuels), en donnant aux démos une source de
  pointage réelle.
- Couverture : `rhPresence.analysePeriode`, `rhPresence.listSummaries`, `rhDashboard.getKpis`,
  `rhPosture.pointer`, `rhLeave.markLeaveOnAttendance`, moteur `rh-stats-engine.ts`,
  import `import-gpj-v31.ts` (`resume`), replay `packages/db/src/r3-realign-presences.ts`.
- Exclusions (documentées §15) : paie / avances / valorisation monétaire des heures supplémentaires
  (futur R4) ; `PlanningRH.tsx:82` (Rules of Hooks, hors périmètre) ; AUD-09 volet REC-5 (heures
  théoriques fiche / paie) ; artefacts de démo résiduels (additif uniquement, jamais supprimés).
- Règle : reproduire AVANT, confirmer la cause par le code + la DB, corriger, puis prouver APRÈS par
  l'API live et la DB. Aucune migration destructive, aucun DELETE.

## 3. Symptômes (avant correction)

- **A** — Analyse de période Sept 2026 : 30 employés, **0 jour présent, 0 absence, 0 congé, 780 muets,
  0 h travaillées** sur tous les employés. « Mensuel & clôture » : 23 résumés, **169 jours présents /
  17 absents**. Dashboard : **147 jours présents**. Trois écrans, trois chiffres.
- **B** — Congé approuvé emp14 « Zo'o Mbarga » du 28/08 : 0 entrée `conge`, 0 calcul en base ; jours
  non comptés par l'analyse.
- **C** — KPI présence **35,3 %** (147 / (26 × 16)) alors que le numérateur réel sérieux était plus élevé
  dès que la règle des jours comptables est appliquée (dénonciation validée : augmenter au KPI 45,6 %).

## 4. Reproduction réelle (AVANT)

Script : `audit/r3/r3-repro-bugs.cjs` (captures originelles dans le transcript, base reconstituée dans
`audit/r3/r3-BEFORE-2026-09-24.txt`) :

- `analysePeriode 2026-09-01→30` : parsed 30 emps, totalPresence=0, totalMuets=780, totalHeuresTrav=0.
- `listSummaries 2026-09` : 23 lignes, joursPresent=169, joursAbsent=17.
- `getKpis(2026,9)` : presence=35.3, presenceDays=147, workingDays=26, effectif=16.
- `leave_requests` emp14 : status=approuve, **entries_jour_conge=0, calcs_jour_conge=0**.
- Cohérence des sources : `attendance_entries`=1 (entrée closeMonth résiduelle), `attendance_calculations`=0
  (aucun calcul → analyse vide), `attendance_monthly_summaries`=45 (août+sept préexistants).

## 5. Cause racine confirmée

- **A** : `analysePeriode` lit l'agrégat par employé à partir des **calculs** (`attendance_calculations`)
  ; or en base la source réelle de pointage (`GPJ_POINTAGE`) n'avait jamais été rejouée → `calcs`=0 →
  analyse vide. Les **résumés** (`attendance_monthly_summaries`) préexistants (45) provenaient d'une autre
  source / construction et ne sont PAS relus par l'analyse : d'où le désalignement Analyse vs Mensuel.
  De plus `analysePeriode` utilisait `estJourOuvrable(periodDate)` sans les **jours non travaillés du
  cycle** (décalage possible avec closeMonth). `closeMonth` écrivait des entrées résiduelles sans calculs.
- **B** : `markLeaveOnAttendance` créait l'entrée `conge` **mais n'appelait pas `runCalculation`** → aucun
  calcul de période pour la journée → « jours de congé » invisibles dans l'analyse ; borne P05 de
  `resume()` (import) en `lte(end)` faisait compter le 1er du mois suivant dans le mois précédent, et
  `daysOnLeave` (code jour congé) n'était jamais renseigné.
- **C** : `getKpis` calculait `presenceRateForHeadcount(147, 26, effectif=16)` → divise par `26×16` même
  pour les employés **sans cycle**, **embauchés/sortis en cours de mois** et sans tenir compte des
  dimanches/feriés/fériés dans la base. Dénominateur nominal faussé (294 ≙ 147,2 % possible).

## 6. Correction appliquée

**Code (server)**
- `apps/nextjs/src/server/lib/rh-stats-engine.ts` : ajout de `classifierJour` (P / A / C / HS / …) et
  `joursComptablesEmployeMois` (jours travaillés d'un cycle sur une fenêtre : week-ends, jours fériés,
  embauche/sortie en cours de mois, absence de cycle → 0). (`presenceRate`, `presenceRateForHeadcount`
  existants conservés.)
- `apps/nextjs/src/server/api/routers/rh-presence.ts` :
  - `analysePeriode` : alignement du jour « théorique » sur le calendrier du cycle
    (`nonWorkingByCycle`) + **filtre effectif vivant** (`statut IN actif/conge/suspendu`) sur le join
    employés **et** sur le join `attendance_calculations` (décision population user n°2) ;
  - `listSummaries` : même filtre vivant (Analyse = Mensuel = Dashboard).
- `apps/nextjs/src/server/api/routers/rh-leave.ts` (`markLeaveOnAttendance`) : garde cycle (BAD_REQUEST si
  pas de cycle), garde mois clôturé, upsert de l'entrée `conge` + **`runCalculation`** systématique →
  jours de congé crédités en calculs/résumé/Analyse.
- `apps/nextjs/src/server/api/routers/rh-posture.ts` (`pointer`) : garde cycle explicite
  (« n/a pas de cycle de travail — le pointage est désactivé ») → plus de pointage muet sans cycle.
- `apps/nextjs/src/server/api/routers/rh-dashboard.ts` (`getKpis`) : dénominateur = Σ
  `joursComptablesEmployeMois` (cycles + embauche/sortie + fériés + sans-cycle→0), numérateur = jours de
  résumés vivants, `presenceRate` avec fallback `presenceRateForHeadcount` si 0.
- `packages/db/src/import-gpj-v31.ts` (`resume`) : borne P05 `lt(end)` (1er jour du mois suivant exclu),
  `codePresence` sélectionné, jours comptés via `classifierJour` avec `daysOnLeave` ; `days_present` +
  `days_on_leave` corrects dans les résumés recomputés.

**Données (replay validé par l'utilisateur — additif/idempotent)**
- `packages/db/src/r3-realign-presences.ts` : relecture `GPJ_POINTAGE` AOÛT→SEPT 2026, mapping
  EMP001…15 → employés **par nom** (15/15, ambiguïtés → erreur bloquante), upsert entrées +
  `computeAndSaveCalc` (miroir `runCalculation`) pour AOÛT/SEPT, projection **congés approuvés**
  (emp14 28/08), recompute résumés AOÛT (14) + SEPT (15). Résultat : **264 entrées + 264 calculs créés**,
  1 jour congé projeté, 45 résumés AOÛT+SEPT. Re-exécuté 3 fois : **idempotent** (0 doublon).
- Décision population n°2 (utilisateur) : « Effectif vivant uniquement (134) » → filtres §6 code RH.

## 7. Preuve après correction (écrans)

- Analyse de période Sept 2026 : **16 employés, 134 jours présents, 13 absents, 147 muets, 1114,6 h**.
- Mensuel Sept 2026 : **12 résumés, 134 jours présents, 28 absents** → **écart = 0**.
- KPI Sept 2026 : **presenceDays=134, workingDays=26, effectif=16, présence=45,6 %** (134/294 =
  Σ jours comptables vivants) → supérieur au 35,3 % d'avant.
- Détail (période 01→04/09, emp9) : joursThéoriques=4, présence 100 %, anomalie retard 18 mn (31/08 : 5 mn).
- Échantillon de lignes : Youssoufa Fouakouet 14/26 (53,8 %), Symphonien Tsafack Ndongmo 14/26 (53,8 %).

## 8. Tests fonctionnels — Analyse de période (F26)

1. Sept complet : total = somme des journées (294 = Σ théoriques = Σ P+A+C+Muets) ✔.
2. Analyse = Mensuel jours présents (134 = 134) ✔.
3. Heures travaillées = résumés (1114,6 h) ✔.
4. Bornes : [01/09 → 04/09] = 4 jours (mar→ven) ; 30/08 = **dimanche non compté** ([30/08→02/09]=3) ✔.
5. Congé 28/08 emp14 : joursConges=1, joursPrésence=0, joursAbsence=0, joursMuets=0, théorique=1 ✔.
6. Population = vivants uniquement : 16 lignes, sortis/archives masqués partout ✔.

## 9. Tests fonctionnels — Congés (projection)

- `markLeaveOnAttendance` sur congé approuvé 28/08 : entrée `status='conge'` (id 642) + calcul.
- Résumé AOÛT emp14 : `days_on_leave=1` (AOÛT vivants : présents 61 / absents 7 / congés 1).
- Analyse 28/08 : `joursConges=1`. Aucun double comptage (P+A+C+M=1=théorique).

## 10. Tests fonctionnels — Pointage & garde cycle

- `pointer` emp60 (Fidèle AGBODJAN, membre de la démo) **sans cycle** → refus explicite
  (BAD_REQUEST tRPC, message clair : « n'a pas de cycle de travail — le pointage est désactivé »).
- Emp9 sans cycle au dénominateur KPI : contribue 0 jour comptable (4 vivants sans cycle, dénominateur 294).

## 11. Non-régression transversale

- `analysePeriode` + `listSummaries` + `getKpis` + `pointer` écrits/testés ; Mensuel & clôture inchangés
  dans le moteur (closeMonth inchangé) ; Dashboard inchangé hors dénominateur KPI.
- Données Touché: **aucun DELETE** ; `employes`=30, `contrats`=15, agences=1 inchangés (assert GATE #11),
  entrées 266 / calculs 265 / résumés 45 intacts (additif).
- 2 échecs de test internes **préexistants et hors périmètre** : `licence-service.test.ts`,
  `stock-engine.test.ts` (inchangés, cf. §14).

## 12. Tests techniques

- vitest `rh-stats-engine.test.ts` : **26/26** (nouveaux tests `joursComptablesEmployeMois` : 26 j août/sept,
  férié 25, embauche 22/08 → 8, sortie 15/08 → 13, samedi exclu 21).
- Suite RH complète : **154/154** (10 fichiers : rh-stats-engine, presence-engine, leave-engine,
  rh-posture-engine, rh-scope, rh-recherche, payroll-engine, documents-engine, evaluation-engine,
  rh-snapshots). Suite app : 385 passés / 2 échecs préexistants hors périmètre.
- ESLint (next lint) : **0 erreur**, uniquement warnings préexistants (imports inutilisés).
- `tsc` apps/nextjs : erreurs massives **préexistantes hors périmètre** (sales/stock/geo/ui/compta) ;
  seul fichier RH touché = `rh-stats-engine.ts(62,36)` `payrollMass` (préexistant).
- `tsc packages/db` : TS5097 (imports `.ts`, pattern tsx hérité) + TS1355 `import-gpj-v31.ts(404)`
  préexistant — uniquement.

## 13. Intégrité des données & traçabilité

- 266 entrées / 265 calculs / 45 résumés (AOÛT 14 + SEPT 15 + artefacts antérieurs) — valeurs stables
  avant/après chaque re-exécution du replay.
- Replay idempotent (3ᵉ exécution GATE #10 : 0 doublon, « 0 entrées créées, 264 journées recalées »).
- Congé projeté : 1 entrée (id 642) + 1 calcul + 1 résumé `days_on_leave=1`.
- Aucune table d'historique ni ligne supprimée ; aucun touché employes/contrats/agences.

## 14. GATE R3 — 33 cases

Script : `audit/r3/r3-gate-33cases.cjs` → `audit/r3/gate-r3-33cases.txt` — **33/33 PASS**.
Résumé des blocs : B (artefacts AVANT + causes racine) 1-8 ✔ ; C (cohérence Sept) 14-16, 23, 25 ✔ ;
D (congé emp14) 12-13, 24 ✔ ; E (bornes P05 / week-end) 17-20 ✔ ; F (dénominateur + garde cycle) 21-22 ✔ ;
G (idempotence, intégrité, preuves, rapport, STOP) 10-11, 29-33 ✔.

| Bloc | Cases | Résultat |
|---|---|---|
| B — AVANT + causes racine | 1-8 | 8/8 |
| C — Analyse = Mensuel = KPI Sept | 14,15,16,23,25 | 5/5 |
| D — Congé emp14 projeté | 12,13,24 | 3/3 |
| E — Bornes P05 + week-end | 17,18,19,20 | 4/4 |
| F — Dénominateur KPI + garde cycle | 21,22 | 2/2 |
| G — Idempotence, intégrité, preuves, rapport, STOP | 10,11,29,30,31,32,33 | 7/7 |
| **Total** | | **29/29 + 4/4 (analyse=listSummaries, listSummaries vivants)** = **33/33** |

## 15. Anomalies hors périmètre (documentées, non corrigées)

- `PlanningRH.tsx:82` : violation Rules of Hooks (gardes avant hooks) — à corriger en REC-6, pas R3.
- AUD-09 volet REC-5 : heures théoriques hétérogènes fiche employé / paie — reste BACKLOG.
- Paie : avances / valorisation monétaire HS / recalcul bulletins à la clôture — futur R4 (STOP).
- Résumés mensuels « artefacts » issus d'anciennes constructions (45 au total, dont des sortis) : conservés
  (additif), non utilisés par l'analyse ; la population vivante affichable est filtrée partout.

## 16. Constats & limites UX (non bloquants)

- « Muets » (présence attendue sans pointage) reste distinct visuellement des « absents » — cohérent avec
  le moteur (closeMonth compte les non-pointés en absents des résumés).
- Le KPI reste calculé au niveau HEAD de l'agence (effectif vivant 16) ; un futur filtre agence/équipe
  (POSTE) pourra descendre au niveau zone.

## 17. Preuves

- `audit/r3/r3-BEFORE-2026-09-24.txt` — état AVANT (bugs A/B/C, 780 muets, 0 h, 35,3 %, 0 entrées/0 calculs congé).
- `audit/r3/repro-A-analyse-vs-mensuel-sept.txt`, `repro-A-analyse-jour-conge-emp14.txt`,
  `repro-B-conge-sans-projection.txt`, `repro-C-kpi-presence-35.3pct.txt`, `repro-source-exhaustive.txt`
  (re-dumpés APRÈS fix — la base AVANT fait foi via `r3-BEFORE-*`).
- `audit/r3/verify-fixed-coherence.txt` — cohérence post-fix (134 jours, 1114,6 h, 45,6 %, AOÛT 61/7/1,
  pointages 01/09=10, congé 1/1/1, santé 266/265/45).
- `audit/r3/gate-r3-33cases.txt` — GATE 33/33 (généré live API + DB le 24/09).
- `packages/db/src/r3-realign-presences.ts` — replay idempotent (sortie console : mapping 15/15, 264 recalées).

## 18. Conclusion & statut

- **R3 (REC-1) = VALIDE** — GATE 33/33, GATE A (vitest 154/154 RH dont 26/26 stats + eslint 0 erreur + tsc
  périmètre propre) et GATE B (API réelle : analyse/mensuel/KPI 134 jours présents, congé projeté, bornes,
  garde cycle) au vert.
- Décision utilisateur appliquée : réconciliation par replay ciblé idempotent (aucun touché employes/
  contrats) + population « effectif vivant » commune aux 3 écrans.
- **STOP — ne pas commencer R4** (paie / avances / valorisation HS) sans instruction utilisateur.

## 19. Registre

- Registre : `DOC/RH/RH_EXECUTION_REGISTER.md` — section « R3 (REC-1) » ajoutée (24/09), tableau pivot
  AUD-03 → **VALIDE**, AUD-09 → partiel REC-1 mentionné.