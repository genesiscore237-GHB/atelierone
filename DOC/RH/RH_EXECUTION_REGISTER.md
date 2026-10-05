# REGISTRE D'EXÉCUTION — MODULE RH (ATELIERONE / GPJ)

> **Source de vérité de l'exécution des corrections RH.** Créé en PHASE 0 le 2026-09-23.
> **Phase active : 8 (Rapports / exports / impression)** — lignes : P11, N15, N16, F25. Ouverte le 2026-09-23 après gate Phase 7 (VALIDE, feu vert humain).
> Périmètre = rapport d'audit `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md` (P01–P20) + nouvelles anomalies (N01–N20).
> **Audit fonctionnel réel (24/09/2026, navigation utilisateur en lecture seule)** → rapport `DOC/RH/AUDIT_FONCTIONNEL_RH_2026-09-24.md` ; anomalies ouvertes **AUD-01…AUD-10** (BACKLOG, phase 9 proposée). Consigné par INFRA-02.
> **Règles** :
> - Une seule phase active à la fois, strictement séquentielle (0→9). On ne touche QUE les lignes de la phase active.
> - Transitions de statut : BACKLOG → EN_INSPECTION → EN_CONCEPTION → EN_IMPLEMENTATION → EN_TEST → A_CORRIGER → TERMINE → VALIDE. **Aucun passage direct BACKLOG → TERMINE.**
> - Toute nouvelle anomalie = nouvelle ligne avec priorité P0/P1/P2/P3, phase proposée, **mise en BACKLOG, NON implémentée** si elle appartient à une autre phase. Le chef de phase valide le rephasage.
> - Une ligne n'est TERMINÉE/VALIDE que si toutes ses cases (données, DB, API, UI, tests, vérification, preuve) sont ✓.
> - Jamais de DELETE+INSERT ni de migration destructive quand l'historique doit être conservé.

---

## RECADRAGE POST-AUDIT (24/09/2026) — NOUVELLE RÉFÉRENCE NORMATIVE

> **Décision utilisateur (ordre écrit du 24/09/2026)** : les constats de l'audit fonctionnel réel (rapport `DOC/RH/AUDIT_FONCTIONNEL_RH_2026-09-24.md`) prouvent que des fonctions « corrigées / validées » ne sont **pas exploitable en interface réelle**. Le **processus de validation** est recalé : une fonction n'est TERMINE / VALIDE que si elle est **prouvée fonctionnellement (GATE B)**, jamais sur la seule base de vitest, tsc, lint, compilation, présence d'une API, d'un composant ou d'une table. **Ce bloc prime sur toute règle antérieure de ce registre.** Aucun code ne sera modifié tant que ce recalage n'est pas validé par l'utilisateur.

### R1 — Une phase = un domaine fermé
Une seule phase en cours, un seul domaine. Chaque point de la phase est : implémenté → testé → **vérifié dans l'interface réelle** → dépendances impactées vérifiées → puis contrôle de sortie → puis phase déclarée terminée. **Interdiction de mener plusieurs phases simultanément.**

### R2 — TERMINE exige tout (13 cases)
`[ ] backend correct · [ ] données correctes · [ ] UI accessible · [ ] UI sans erreur · [ ] workflow complet · [ ] calcul correct · [ ] données réelles cohérentes · [ ] navigation correcte · [ ] permissions correctes · [ ] historique correct · [ ] intégration modules dépendants · [ ] scénario réel réussi · [ ] non-régression réussie`. Une seule case NON ⇒ **NON TERMINÉE**.

### R3 — Deux gates obligatoires
- **GATE A (technique)** : tests unitaires, tests d'intégration, typecheck, lint.
- **GATE B (fonctionnel)** : navigation réelle, interaction réelle, données réelles, calcul réel, résultat visible, cohérence inter-écrans, scénario métier.
**GATE A sans GATE B = NON VALIDÉ.**

### R5 — Requalification rétroactive (preuves intactes)
Toute ligne déclarée TERMINE / VALIDE en phases 0–8 (P01…P27, N01…N20, F*, INFRA-01) est désormais **STATIQUEMENT VALIDÉE, FONCTIONNELLEMENT NON PROUVÉE** tant que l'audit fonctionnel réel ne l'a pas confirmée. Les colonnes et preuves historiques restent **inchangées** (interdiction de les modifier) ; le verdict fonctionnel est reporté dans le tableau pivot (§R6) et les phases REC-1…REC-6 (détail : `DOC/RH/RECADREMENT_FONCTIONNEL_2026-09-24.md` §1 et §2).

### R6 — Statuts & tableau pivot (nouvelle référence)
Nouveaux statuts : `BACKLOG` · `INSPECTION` · `IMPLEMENTATION` · `TEST_TECHNIQUE` · `TEST_FONCTIONNEL` · `NON_CONFORME` · `REPRISE` · `VALIDE`.
Transitions : `BACKLOG → INSPECTION → IMPLEMENTATION → TEST_TECHNIQUE → TEST_FONCTIONNEL → VALIDE`. **`BACKLOG → VALIDE` interdit (aucun saut direct).** Toute non-conformité constatée en gate ⇒ `NON_CONFORME` → correction → `REPRISE` → `TEST_TECHNIQUE` → …

**Tableau pivot post-audit — colonnes GATE (Technique / Fonctionnel / Données / UI / Intégration / Test réel) : `OK` · `PAS` (partiel) · `NON` · `—` (non évalué). Verdict = statut courant.**

| ID | Fonction | Phase REC | Technique | Fonctionnel | Données | UI | Intégration | Test réel | Preuve | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **AUD-01** | Crash onglet Bulletins (PaieRH.tsx:837) | REC-4 | OK | OK | OK | OK | — | OK | `PHASE_R1_BULLETINS_2026-09-24.md` (§GATE) + `audit/r1/*` | VALIDE |
| **AUD-02** | 3 écrans en erreur React (sanctions, compétences, documents) | REC-5 | — | — | — | — | — | — | `sanctions-probe-final.txt` | BACKLOG |
| **AUD-03** | Analyse de période vide vs résumé/dashboard (147 j) | REC-1 | — | — | — | — | — | — | captures présences | VALIDE |
| **AUD-04** | Net de bulletin négatif sans plancher (emp. 21) | REC-4 | — | — | — | — | — | — | bulletin SQL emp. 21 | BACKLOG |
| **AUD-05** | Bulletins non rejouables (bases ≠ fiches, Août=Sept) — reconfirmé R1 : 7/13 bases ≠ fiches, jours présents figés à la génération, jamais recalculés à la clôture | REC-4 | — | — | — | — | — | — | `PHASE_R1_BULLETINS_2026-09-24.md` §5 | BACKLOG |
| **AUD-06** | Widget « Salaire sur période » sans montant | REC-4 | — | — | — | — | — | — | `pointage-salaire-fidele.txt` | BACKLOG |
| **AUD-07** | Soldes congés non débités des approbations | REC-2 | — | — | — | — | — | — | assert + capture | BACKLOG |
| **AUD-08** | Énum bruts dans l'UI (modes paie) | REC-5 | — | — | — | — | — | — | rg labels | BACKLOG |
| **AUD-09** | Dénominateurs / heures théoriques hétérogènes | REC-1 / REC-5 | — | — | — | — | — | — | assert | BACKLOG |
| **AUD-10** | Données de démo incohérentes (embauche, salaires, statuts) | REC-5 | — | — | — | — | — | — | SQL + captures | BACKLOG |

### R7 — Rapport de sortie de phase (obligatoire à chaque fin de phase)
1. ce qui était à corriger · 2. ce qui a été corrigé · 3. ce qui a été testé · 4. ce qui a été **testé réellement dans l'interface** · 5. résultats · 6. preuves · 7. anomalies restantes · 8. régressions · 9. fonctions dépendantes impactées. Puis : `PHASE = VALIDE` **ou** `PHASE = NON VALIDÉE` (si NON VALIDÉE ⇒ **STOP**).

### R8 — Anomalie découverte en cours de phase
Créer un ticket + priorité + dépendance. Si elle **bloque** la fonctionnalité courante ⇒ traiter immédiatement. Si elle appartient à une autre phase ⇒ enregistrer puis **ne pas détourner la phase en cours**.

### R9 — Ne jamais se fier à l'apparence
Bouton visible ≠ fonction opérationnelle · ligne en base ≠ données utilisables · calcul dans un moteur ≠ fonction accessible · endpoint ≠ workflow terminé. Illustration directe : onglet « Bulletins » visible mais crash ; résumés renseignés mais analyse de période vide.

### R10 — Scénario central (garde de sortie du module RH)
EMPLOYÉ → PRÉSENCE → ABSENCE → AVANCE → CALCUL DE PÉRIODE → PAIE → BULLETIN → CONSULTATION → RECONSTITUTION DU NET. Le résultat affiché doit être **cohérent partout**.

---

**Phase active : R2 — Correction des écrans RH en erreur React** (instruction utilisateur 24/09, remplace la question phase 8). Sous-phases strictes : R2.1 Disciplinaire → R2.2 Compétences & Formations → R2.3 Documents RH. **STOP après chaque sous-phase jusqu'à validation.** Décisions actées : R1 = VALIDE (UI, gate humain 24/09) ; cohérence bulletins → AUD-05 (REC-4) ; polices Google → hébergement local (à exécuter hors phase, ticket ouvert).
Cause racine commune identifiée en R2.1 (Rules of Hooks) : même anti-pattern `if (isLoading) return` / `if (isError) return` AVANT `useClientPaging` dans **CompetencesRH.tsx:111-118 (→ R2.2)**, **DocumentsRH.tsx:120-131 (→ R2.3)** et **PlanningRH.tsx:82 (hors périmètre R2, à signaler)**. Correctif type : déplacer les gardes APRÈS le hook.

| ID | Fonction | Priorité | Phase | Statut | Fichiers | DB | API | UI | Tests | Vérification | Preuve | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **R1** | Bulletins Paie : crash onglet Bulletins (AUD-01) — cause racine `emps` undefined au 1er rendu, contrat `rh.list` = objet + états chargement/erreur/vide | P0 | REC-4 | VALIDE | `PaieRH.tsx` (BulletinsSection, 4 points) | — | — (frontend pur) | 0 erreur, 26 bulletins, filtres employé/période, états UX, détail, PDF | vitest 57/57 + eslint 0 erreur + tsc propre (fichier) | GATE humain 24/09 : VALIDE (UI) ; incohérences données reportées sur AUD-05 (REC-4) | `DOC/RH/PHASE_R1_BULLETINS_2026-09-24.md` + `audit/r1/` | 2026-09-24 |
| **R2.1** | Disciplinaire : écran `/dashboard/rh/sanctions` en erreur React (`reading map`) — cause racine : Rules of Hooks violées (early-returns isLoading/isError AVANT `useClientPaging` dans RegistreSection) + bug affichage colonne « Par » (`creatorNom` → `creatorName`) | P0 | R2 | VALIDE | `DisciplinaireRH.tsx` (gardes hooks l.99-108 + dossier Par) | — | — (frontend pur) | 0 erreur ; 3 onglets (Registre/Nouveau/Dossier) ; CRUD créer→lister→supprimer ; recherche employé/type ; toasts ; carte Récidive ; colonne Par = Super Admin | eslint fichier 0 erreur (1 warn préexistant) + tsc 0 erreur | GATE 14 cases VALIDE — repro réelle (pageerror hooks) + fix + e2e réel ; données intactes (2 records de test créés puis supprimés, table `sanctions` = 0 avant/après) | `DOC/RH/PHASE_R2_1_DISCIPLINAIRE_2026-09-24.md` + `audit/r2/` (json+png) | 2026-09-24 |
| **R2.2** | Compétences & Formations : écran `/dashboard/rh/competences` en erreur React (hooks) — cause racine : Rules of Hooks violées (early-returns isLoading/isError AVANT `useClientPaging` dans ReferentielSection + FormationsSection) | P0 | R2 | VALIDE | `CompetencesRH.tsx` (gardes hooks Referentiel + Formations) | — | — (frontend pur ; `rh-competences.ts` inchangé, mutations en `rh.competence.modifier`) | 0 erreur ; 5 onglets ; Référentiel CRUD + recherche + pagination ; Matrice (Arnaud, écarts, `?employeId=`, export/impression) ; exigences add/remove ; Formations + Plan (session/inscription/statut/Valider) ; toasts | eslint fichier 0 erreur (2 warn préexistants) + tsc 0 erreur (périmètre) | GATE 18 cases VALIDE — repro réelle (pageerror hooks ReferentielSection) + fix + e2e réel ; données intactes (baseline skills 20 / positionSkills 30 / trainings 10 / sessions 0 / participations 0 / empSkills 0 avant↔après ; incident de test ACCUEIL_CLIENT documenté et restauré à l'identique) | `DOC/RH/PHASE_R2_2_COMPETENCES_2026-09-24.md` + `audit/r2/` (json+png) | 2026-09-24 |
| **R2.3** | Documents RH : écran `/dashboard/rh/documents` en erreur React (« Une erreur est survenue ») — cause racine : Rules of Hooks violées (early-returns isLoading/isError AVANT `useClientPaging` dans DocumentsSection, cf. ligne 68). **REPRISE ciblée** (re-validation 24/09) : 3 écarts levés — (1) modification document sans UI, (2) cohérence permissions UI/API, (3) seed socle périmé (`rh.document.modifier` absent en base) | P0 | R2 | VALIDE (REPRISE GATE 19/19) | `DocumentsRH.tsx` (gardes hooks l.120-121 déplacées après `useClientPaging` l.128 → désormais l.130-131 ; + action **Modifier**/ligne réutilisant le formulaire pré-rempli → `updateDocument` ; + gating UI `usePermissions("rh.document.modifier")` sur Ajouter/Modifier/Supprimer/Types) | — | `updateDocument` (backend intact, déjà durci en `rh.document.modifier`) + **seed socle provisionné** via `seed:socle` (additif/idempotent) : permissions 66→75, assoc 206→224 | 0 erreur ; 3 onglets (Documents/Types/Alertes expiration) ; CRUD complet créer→**modifier**→rechercher→supprimer (ID explicite) ; modification : bouton Modifier/ligne → formulaire « Modifier le document » pré-rempli (employé, type, titre, URL, dates, notes) → toast « Document modifié » → invalidate liste sans reload ; boutons masqués UI hors `rh.document.modifier` (Directeur : Ajouter absent, colonne Action absente, toggles types désactivés ; Consultation : aucune action) ; alertes expiration ; `?employeId=21` pré-sélection ; états loading/empty/erreur+Réessayer | vitest 6/6 (documents-engine) + eslint 0 erreur (1 warn préexistant) + tsc 0 erreur (périmètre) | GATE 28 cases VALIDE + **REPRISE GATE 19/19** — 3 écarts : (1) **modification UI** implémentée et testée réellement : création → clic Modifier → pré-remplissage vérifié → titre+dates modifiés → toast → ligne à jour sans reload → persistance API (id=6 titre/dateEmission/dateExpiration) + après reload ; (2) **cohérence UI/API** : Responsable RH écrit réellement (boutons visibles, create UI toast + API created:true, cleanup 0), Directeur = tout masqué + API **403 -32003** « Permission manquante: rh.document.modifier », Consultation = aucune action + API 403 ; (3) **seed conforme au modèle** (preuve = `SOCLE_MATRICE` security-socle.ts) : `rh.document.modifier` attribué à Responsable RH, Directeur garde `consulter` seul, vérifié en base + flux réel ; repro réelle (pageerror hooks DocumentsSection) + fix ; données intactes (hr_document_types 16 / documents_employes 0 avant↔après ; seuls ajouts = permissions/associations seed) | `DOC/RH/PHASE_R2_3_DOCUMENTS_2026-09-24.md` (**REPRISE GATE**) + `audit/r2/` (r2-documents-*, r2-reprise-*, json+png) | 2026-09-24 |
| **P0-01** | Infra d'exécution : registre, cartographie dépendances, plan détaillé de phase | P0 | 0 | VALIDE | `DOC/RH/RH_EXECUTION_REGISTER.md`, `DOC/RH/PHASE_0_PLAN.md`, `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md` | — | — | — | — | Relu par utilisateur | Approbation phase 0 | 2026-09-23 |
| **P0-02** | Baseline non-régression : recenser les fonctionnalités conformes à retester après chaque phase | P0 | 0 | VALIDE | `DOC/RH/PHASE_0_PLAN.md` §Baseline | — | — | — | — | Liste figée + re-test en gate de phase | Liste §Baseline | 2026-09-23 |
| **P01** | UI avances de salaire complète (demande → approbation → versement → récupération → solde) + invalidation | P0 | 1 | VALIDE | `rh/_components/Advances*`, fiche employé, `EmployeeDetail.tsx` | `employee_advances`, `advance_recoveries` | `rhAdvances.*` (en service) | Nouvel onglet/liste + modal conforme règle UX | vitest `avances-engine` + scénario UI | Saisie → récupération → solde affiché ; `invalidate()` OK | Capture UI + test | 2026-09-23 |
| **P02** | Intégration paie des avances : déduire `min(soldeRestant,…)` toutes avances non ANNULÉE/RÉCUPÉRÉE (supprimer le verrou `statut="VERSÉE"`) | P0 | 1 | VALIDE | `rh-payroll.ts:193-218,290-296` | — | `rhPayroll.prepareMonth` | — | vitest payroll-engine (fixtures avances) | Bulletin = base - récupération restante ; clôture recouvre avant/après | Snapshot bulletin | 2026-09-23 |
| **P03** | Fuite cross-tenant `rhPosture.now` : filtre `ctx.user.agenceId` + masquer salaireBase | P0 | 3 | VALIDE | `rh-posture.ts` (`now`) | — | `rhPosture.now` (filtre agence + `salaireBase` retiré) | — | revue requête + tsc fichiers touchés | Réponse d'agence A sans employés B ; champ absent | Assert query | 2026-09-23 |
| **P04** | Navigation `?employeId=` : lire le paramètre dans toutes les pages cibles + pré-sélection automatique | P1 | 5 | VALIDE | `src/hooks/useEmployeFromUrl.ts`, `src/lib/employe-url.ts` (+test), 9 pages (congés, présences, pointage, paie, compétences, évaluations, sanctions, contrats, documents) | — | — | 9 pages : `useEmployeFromUrl()` + pré-sélection auto | vitest `employe-url.test.ts` 3/3 + typecheck fichiers touchés | Page ouverte avec `?employeId=` → employé pré-sélectionné ; paramètre invalide → état vide | Assert + revue code | 2026-09-23 |
| **P05** | Correction borne clôture : `lte(monthEnd)` → `lt(monthEnd)` (le 01 du mois suivant ne compte plus) — **phase 2 (bloc paie), re-test en phase 4** | P1 | 2 | VALIDE | `rh-presence.ts:362,384` | — | `rhPresence.closeMonth` | — | vitest presence-engine (bordures de mois) | Résumé mois M sans jours de M+1 — test obligatoire : 30/09 inclus, 01/10 exclu | Assert dates | 2026-09-23 |
| **P06** | `daysOnLeave` réellement calculé (jours congé/maladie dans résumé + export présences) | P1 | 4 | VALIDE | `rh-presence.ts` (closeMonth : classif. `classifierJour` C/M/O/F), `rh-dashboard.ts:238` (export), `MensuelSection` (colonne Congés) | — | `rhPresence.closeMonth`, `rhPresence.listSummaries`, export | Colonne « Congés » dans Mensuel & clôture | vitest rh-stats-engine (N06/P06/P08 : classifierJour + analyserPeriode congrès) | Résumé jours congé → 0 si congés ; export présente la colonne | Assert vitest + Revue UI | 2026-09-23 |
| **P07** | KPI taux de présence : dénominateur `workingDays × effectif` (corrige >100 %) | P1 | 4 | VALIDE | `rh-dashboard.ts:127-133`, `rh-stats-engine.ts` (`presenceRateForHeadcount`) | — | `rhDashboard.getKpis` | — | vitest rh-stats-engine (P07 : 4 cas, dont bascule =100 %) | KPI → [0,100 %] | Assert KPI vitest | 2026-09-23 |
| **P08** | Jours « muets » : forcer une ligne de calcul par défaut (absent) si aucune donnée du jour | P1 | 4 | VALIDE | `rh-presence.ts` (closeMonth : énumération jours comptables, muet → absent), `rh-stats-engine.ts` (code `MUET`) | — | `rhPresence.closeMonth` | — | vitest rh-stats-engine (analyserPeriode : jour NON POINTÉ, anomalie MUET) | Jour comptable sans saisie = absent compté | Assert résumé + analyse | 2026-09-23 |
| **P09** | `rh.getFiche` : masquer `salaireBase`/`salaryHistory` sans permission `rh.salaire.consulter` | P1 | 3 | BACKLOG | `rh.ts:654-753` | — | `rh.getFiche` | — | vitest trpc (masquage) | Fiche sans permission → champs absents | Assert muet | |
| **P10** | PDF bulletin : ajouter permission serveur (`rh.salaire.consulter` ou `rh.paie.modifier`) | P1 | 3 | BACKLOG | `bulletin-pdf/[id]/route.ts:23-61` | — | route API | — | Test HTTP rôle non autorisé → 403 | 403 rendu ; accès autorisé OK | Réponse HTTP | |
| **P11** | RBAC des 3 exports CSV sans garde (présences/matrice/disciplinaire) | P1 | 8 | TERMINE | `rh-dashboard.ts` (4 exports en `requirePermissionProcedure` + entrées étendues N15), `DashboardRH.tsx` (gating + toast) | — | `rhDashboard.exportEmployes` (`rh.employe.consulter`), `exportPresences` (`rh.presence.consulter`), `exportMatrice` (`rh.competence.consulter`), `exportDisciplinaire` (`rh.discipline.consulter`) | boutons « CSV » gatés + toast d'erreur sur refus | tsc 0 fichiers touchés + suite globale 379/381 + audit rg 4 gates | Export refusé sans permission (FORBIDDEN de `requirePermissionProcedure`) ; garde inline `rh.salaire.consulter` conservée | Assert (rg gates) + revue code | 2026-09-23 |
| **P12** | Changement de statut via UI (congé/suspendu/archive) + effets côté paie/effectif/planning/compte | P1 | 5 | VALIDE | `EmployeeForm.tsx`, `EmployeeDetail.tsx`, `rh.ts:323` | `employee_status_history` | `rh.update` | Badge statut cliquable + modal de changement (état React, gaté `rh.employe.modifier`) ; select statut dans `EmployeeForm` | typecheck fichiers touchés | Statut posé via UI, historié, effets visibles (paie/effectif/planning/compte) | Capture | 2026-09-23 |
| **P13** | Historiques métier : snapshot bulletins (paie), planning hebdo, scores évaluation, solde (décision) — fin du DELETE+INSERT | P1 | 6 | VALIDE | `rh-payroll.ts` (`archiverBulletin` + prepareMonth/adjustEntry), `rh-planning.ts`, `rh-evaluation.ts`, `rh-leave.ts` | tables snapshot : `payroll_entry_snapshots`, `planning_snapshots`, `evaluation_snapshots`, `leave_balance_snapshots` (migration `migrate-rh-snapshots.ts`) | `rhPayroll.prepareMonth`/`adjustEntry`, `rhPlanning.saveWeek`, `rhEvaluation.saveEvaluation`, `rhLeave.decideRequest` | — | vitest `rh-snapshots.test.ts` (7/7 : version + comparaison avant/après) + typecheck + rg | Aucun écrasement : l'historique antérieur reste rejouable | Comparaison avant/après + rg DELETE+INSERT archivés | 2026-09-23 |
| **P14** | Alignement mapping `modePaie journalier/commission` entre `prepareMonth` (:242) et ajustements (:493) | P1 | 2 | VALIDE | `rh-payroll.ts:242,493`, `rh.ts:414-417` | — | `rhPayroll.prepareMonth`, ajustements | — | vitest payroll-engine (4 modes) | Journalier → branche dédiée cohérente, pas mensuel | Snapshot | 2026-09-23 |
| **N01** | Isolation multi-tenant des lectures/mutations « par id » hors rh.ts (posture.pointer/journee/salaireIntervalle, leave.decideRequest/adjustBalance, payroll.closePeriod/getEntry/adjustEntry, discipline.listRecords/createRecord/dossier, documents.list/getAlerts/delete, competences.getGaps/list*.requestOvertime) | P0 | 3 | VALIDE | `rh-scope.ts` (`assertEmployeEnAgence` + `employeEnAgence`) · routers rh-posture/leave/payroll/discipline/documents/competences/evaluation/planning | — | ~15+ procédures scopées (404 hors agence via jointure parent agencé) | — | vitest `rh-scope.test.ts` 4/4 + rg des `where` agence | Aucune donnée inter-agence ; refus NOT_FOUND sans info d'existence | Assert rh-scope + rg | 2026-09-23 |
| **N02** | Rétablir la lecture RH pour les rôles opérationnels (R9 : `rh.list` → FORBIDDEN hors RH dans Outillage/Planning/Travaux/recherche) | P1 | 5 | VALIDE | `rh.ts` (`rh.roster`), `rh-recherche.ts` (`selectionRoster`), 5 call sites (Outillage, planning, travaux, OR) | — | `rh.roster` (protectedProcedure, aucun `rh.*` octroyé aux rôles opérationnels ; `rh.list` reste `rhProcedure`) | — | vitest `rh-recherche.test.ts` (2/8 : profil minimal, jamais téléphone/email/salaire) + typecheck | Outillage/Planning/Travaux/OR → 200 via `rh.roster` (annuaire minimal) au lieu de FORBIDDEN | Assert | 2026-09-23 |
| **N03** | `markPaid` : refuser si période non fermée ou agence différente + tracer le paiement (élève le verrou) | P1 | 2 | VALIDE | `rh-payroll.ts` (`markPaid`) | évent. colonne/metadata | `rhPayroll.markPaid` | — | vitest trpc | Paie marquée uniquement post-clôture & même agence ; traçable | Assert | 2026-09-23 |
| **N04** | `decideRequest` : écrire une ligne `leaveBalanceAdjustments` (traçage du solde) | P2 | 4 | VALIDE | `rh-leave.ts` (decideRequest : trace après décompte) | `leave_balance_adjustments` (trace : montant négatif + réf. demande) | `rhLeave.decideRequest` | — | vitest suite RH (non-régression) + revue code | Trace écrite à chaque approbation décomptée (journal d'audit) | Revue code + assert | 2026-09-23 |
| **N05** | Purge des 34 procédures mortes + doublons (saveEntry, createAbsence, validerAbsence, createSanction, updateDocument, updateRecord, listSanctionTypes ×2, getSuggestedBonus…) — hors `rhAdvances` (réactivé en Phase 1) | P2 | 9 | BACKLOG | `rh.ts`, `rh-documents`, `rh-discipline`, `rh-evaluation`, `rh-settings` | — | suppression | — | grep 0 appel + vitest build | Aucun endpoint mort exposé | rg + tests | |
| **N06** | Jours en congé comptés « présents » (gonflent `daysPresent`) : reclasser comme jour travaillé ou exclure selon règle métier | P1 | 4 | VALIDE | `rh-presence.ts` (closeMonth : classification canonique), `rh-stats-engine.ts` (`classifierJour`) | — | `rhPresence.closeMonth`, `listSummaries` | Colonne « Congés » (jours ni présents ni absents) | vitest rh-stats-engine (N06/P06/P08) | daysPresent correct après congé (C/M/O/F = congé, pas présent) | Assert vitest | 2026-09-23 |
| **N07** | Cohérence dénominateur prime présence : `jourOuvres` paie vs `workingDays` dashboard (fériés) | P1 | 2 | VALIDE | `rh-payroll.ts` (`jourOuvres`), `rh-stats-engine.ts` | — | `prepareMonth`, `getKpis` | — | vitest payroll/stats | Même dénominateur sur paie et KPI | Assert | 2026-09-23 |
| **N08** | `weekForfait = ceil(jours calendaires/7)` : mois 30 j = 5 semaines facturées — cadrer à l'ouvré/réel | P2 | 2 | VALIDE | `rh-payroll.ts` (forfait) | — | `prepareMonth` | — | vitest payroll-engine | Forfait période conforme (→ ceil abusif) | Snapshot | 2026-09-23 |
| **N09** | `stdHours` fallback 208 au lieu de 225,3 h | P2 | 2 | VALIDE | `payroll-engine.ts` | — | `prepareMonth` | — | vitest payroll-engine | Base horaire par défaut conforme paramétrage | Assert | 2026-09-23 |
| **N10** | `closePeriod` ne verrouille rien : couvrir l'ordre des opérations (clôture présence → préparation → paiement) | P2 | 2 | VALIDE | `rh-payroll.ts` (`openPeriod`/`closePeriod`) | — | `rhPayroll.*` | — | Scénario séquence | Paiement impossible avant ordre valide | Assert | 2026-09-23 |
| **N11** | Effets réels des statuts congé/suspendu (paie, effectif, planning, compte) | P1 | 3 | VALIDE | `rh-payroll.ts` (prorata suspendu), `rh-stats-engine.ts` (`effectifParStatut`), `rh-dashboard.ts`, `rh.ts` (`utilisateurs.isActive`), `rh-planning.ts` (réservoir actif+congé) | — | `rhPayroll.prepareMonth`, `rhDashboard.getKpis`, `rh.update`, `rhPlanning.listEmployes` | — | vitest payroll-engine (N11 4 cas) + rh-stats-engine (N11/P19 2 cas) | Suspendu entier = pas de bulletin ; suspension en cours de mois = prorata à la veille ; compte coupé ; planning exclut ; congé intact | Assert vitest | 2026-09-23 |
| **N12** | Réembauche d'un sorti : exploit `employes.reembauchable` (workflow + effets) | P2 | 5 | VALIDE | `rh.ts` (`rh.reembaucher`), `rh-recherche.ts` (`verifierReembauche`), `EmployeeDetail.tsx` | `employes.reembauchable`, `employee_status_history` | `rh.reembaucher` (préconditions sorti + réembauchable ; fermeture intervalle sorti ; réouverture `utilisateurs.isActive`) | Bouton « Réembaucher » + modal (date défaut aujourd'hui, motif), gaté `rh.employe.modifier` | vitest `rh-recherche.test.ts` (3/8 : préconditions) + typecheck | Sorti réembauchable → actif, historique cohérent, compte rouvert | Capture | 2026-09-23 |
| **N13** | `saveWeek` planning : historiser (suppression DELETE+INSERT) | P1 | 6 | VALIDE | `rh-planning.ts` (saveWeek → `planning_snapshots`), `rh-snapshots.ts` | tables snapshot (P13) | `rhPlanning.saveWeek` | — | vitest rh-snapshots (7/7) + rg | Planning antérieur rejouable | Assert + rg | 2026-09-23 |
| **N14** | Cap 100 silencieux + absences de pagination/état recherche (annuaire + 5 listes) | P2 | 7 | VALIDE | `ClientPagination.tsx` (useClientPaging + PaginationBar : 25/page, compteur, « 0 résultat ») · `rh.ts` (`list` : `exclureArchives`) · `annuaire/page.tsx` (serveur 50/page + recherche + compteur) · contrats · DocumentsRH · DisciplinaireRH · CompetencesRH (référentiel + formations) · PlanningRH | — | `rh.list` (`exclureArchives`, `page`/`limit`) | pagination (25 ou 50 par liste) + compteur + état « 0 résultat » | tsc fichiers touchés 0 erreur + suite globale 379/381 | Liste >100 paginée, compteur honnête, état recherche servi aussi par le serveur | Capture | 2026-09-23 |
| **N15** | Exports : sélection multi-employés + colonnes + tri + filtre statut, accessibles depuis chaque liste RH | P2 | 8 | TERMINE | `rh-dashboard.ts` (params étendus : `search`/`statut`/`departmentId`/`employeIds[]` max 200/`exclureArchives`), `csv-download.ts` (helper partagé BOM UTF-8 + toast), Annuaire (Exporter gaté : filtres page), PresencesRH (période), CompetencesRH (matrice), DisciplinaireRH (registre) | — | `rhDashboard.export*` (entrées étendues) | boutons « Exporter » gatés par liste portant les filtres courants | tsc 0 fichiers touchés + suite globale 379/381 | CSV conforme aux filtres de la liste (statut/département/équipe/période) ; `employeIds` numériques (`z.array(z.number())`) | CSV + revue code | 2026-09-23 |
| **N16** | Impression (window.print) des listes/états RH en plus du PDF bulletin | P3 | 8 | TERMINE | boutons « Imprimer » (Printer) : Annuaire, PresencesRH (Mensuel), CompetencesRH (Matrice), DisciplinaireRH (Registre) · `globals.css` (`@media print` : header/aside/footer/nav mobile/`.no-print` masqués) | — | — | bouton « Imprimer » (`print:hidden`) | manuel + tsc | Impression propre de l'écran visible, sans chrome applicatif | Capture PDF | 2026-09-23 |
| **N17** | Absences « simples » (non congé) sans voie de saisie (`createAbsence` mort) : décision produit — brancher ou documenter (congé = seule voie) | P1 | 4 | VALIDE | `rh.ts` (commentaire décision au-dessus de `createAbsence`), `DOC/RH/PHASE_4_CONCEPTION.md` (règle 7) | `absences` (héritée, conservée) | `rh.createAbsence` (documentée legacy, non exposée à l'UI) | — | Revue code | Décision actée + voie cohérente (congé = seule saisie) | Note décision + commentaire code | 2026-09-23 |
| **N18** | Couplage `governance.invite` → `employes.userId` : documenter/découpler | P1 | 3 | BACKLOG | `governance.ts` | `employes.userId` | `governance.invite` | — | — | Note + code découplé | Note | |
| **N19** | Durcir validation : Zod strip, statuts libres, arrays sans max, `?employeId=` validé | P2 | 3 | BACKLOG | routers RH | — | schémas tRPC | — | vitest validation | Inputs rejetés comme attendu | Assert | |
| **N20** | mode `commission` non supporté moteur (défaut mensuel) : aligner branches préparation/ajustements/historique (cf. P14) | P1 | 5 | VALIDE | `payroll-engine.ts` (Cas C COMMISSION base fixe contractuelle, exemption `absent_days`, commentaires), `rh.ts:414-417` | — | `prepareMonth` | — | vitest `payroll-engine.test.ts` (3/57 : CAS COMMISSION base fixe) | Commission → bulletin base fixe intégrale jamais proratisée ; partie variable → P14 (backlog) | Assert vitest | 2026-09-23 |
| **P15** | `getBalances` (query) à effet de bord : détacher la création des lignes de solde | P2 | 4 | VALIDE | `rh-leave.ts` (getBalances lecture pure + lignes virtuelles `isVirtual`, mutation `ensureBalances`), `CongesAbsences.tsx` (bouton Synchroniser + garde) | — | `rhLeave.getBalances` (lecture seule), `rhLeave.ensureBalances` (mutation idempotente, perm `rh.conge.modifier`) | Bouton « Synchroniser les soldes » + badge « Virtuel » + Ajuster désactivé sur solde virtuel | vitest suite RH (non-régression) + typecheck fichiers touchés | GET pur (aucun INSERT) ; création via mutation explicite idempotente | Revue code + revue UI | 2026-09-23 |
| **P16** | Procédures mortes non purgées : **durcir** (agence + permissions) en Phase 3, **purger** en Phase 9 (cf. N05) | P2 | 3/9 | VALIDE | `rh.ts` (list/create/update/delete sanctions, contrats, documents, absence, validation) + 8 routers RH | — | ~34 procédures durcies (scope agence + `requirePermissionProcedure`) | — | rg grep + tsc fichiers touchés | Pas de mutation non contrôlée ni lecture hors agence exposée | rg + relecture | 2026-09-23 |
| **P17** | Bouton « Modifier » de la liste employés non gaté | P2 | 3 | VALIDE | `EmployeesPageClient.tsx:246-251` | — | — | gating `rh.employe.modifier` (disabled sans permission) | manuel + revue code | Masqué/disabled sans permission ; « Fiche » conservé | Revue code | 2026-09-23 |
| **P18** | Recherche globale : `protectedProcedure` expose téléphones/emails employés | P2 | 5 | VALIDE | `recherche.ts:9`, `rh-recherche.ts` (`selectionEmployesRecherche`) | — | recherche employés (colonnes téléphone/email retirées sans `rh.employe.consulter`) | — | vitest `rh-recherche.test.ts` (3/8 : masquage) + typecheck | Recherche sans permission → téléphone/email null ; clients/fournisseurs inchangés | Assert | 2026-09-23 |
| **P19** | KPIs effectif/masse salariale : exclure les sortis (+ niveau pour suspendu) — co-traité avec les gardes Phase 3 (« selon dépendances ») | P2 | 3 | VALIDE | `rh-dashboard.ts:57-60`, `rh-stats-engine.ts` (`effectifParStatut`) | — | `getKpis` (effectif = actif+congé+suspendu ; + compteurs enConge/suspendus) | — | vitest rh-stats-engine (N11/P19 2 cas) | Effectif hors sortis ; masse hors sortis ; compteur suspendus présent | Assert vitest | 2026-09-23 |
| **P20** | Harmonisation UX : libellés statuts FR unifiés, devise (XOF/FCFA), textes dupliqués (« librairie ») | P2 | 7 | VALIDE | `lib/rh-labels.ts` (statuts 5 clés, types, modes paie, raisons snapshot) · `lib/format.ts` (`formatDevise`, `DEVISE_DEFAUT=XOF`) · EmployeesPageClient · EmployeeDetail · EmployeeForm · contrats · organigramme · DisciplinaireRH · DashboardRH · EvaluationsRH · PaieRH · PresencesRH · PointageDirect · bulletin-pdf | — | — | libellés unifiés + devise XOF partout | rg : 0 suffixe `F`/`FCFA` restant dans le périmètre RH + tsc 0 erreur fichiers touchés | Revue visuelle cohérente ; « librairie » → « structure » | Capture + rg | 2026-09-23 |
| **F04** | **Fonctionnalité manquante** — Réembaucher un sorti (workflow + exploitation `reembauchable`) | P2 | 5 | VALIDE | identique N12 | `employes.reembauchable` (exploité) | `rh.reembaucher` | bouton gaté | scénario sorti → actif | Remplie via **N12** (même livrable) | Capture | 2026-09-23 |
| **F05** | **Fonctionnalité manquante** — Changer de statut employé (congé/suspendu/archive) depuis l'UI | P1 | 5 | VALIDE | `EmployeeForm.tsx`, `EmployeeDetail.tsx`, `rh.ts:323` | `employee_status_history` | `rh.update` | sélecteur + modal gatés | scénario + répercussions | Remplie via **P12** + **N11** | Capture | 2026-09-23 |
| **F16** | **Fonctionnalité manquante** — Avances sur salaire de bout en bout (saisie → approbation → versement → récupération → solde) | P0 | 1 | VALIDE | `rh/_components/Advances*`, `EmployeeDetail.tsx` | `employee_advances`, `advance_recoveries` | `rhAdvances.*` | onglet + modal | vitest + scénario | Remplie via **P01** + **P02** | Capture + snapshot | 2026-09-23 |
| **F25** | **Fonctionnalité manquante** — Impression (window.print) des listes/états RH (hors PDF bulletin) | P3 | 8 | TERMINE | identique N16 | — | — | bouton imprimer | manuel + tsc | Remplie via **N16** (même livrable) | Capture PDF | 2026-09-23 |
| **F26** | **Nouvelle fonctionnalité — Analyse de période** : diagnostique présences/absences/congés/non pointés, heures théoriques vs travaillées, HS, retards, anomalies (R/A/MUET) sur une plage de dates | P1 | 4 | VALIDE | `rh-stats-engine.ts` (`analyserPeriode` pur), `rh-presence.ts` (query `analysePeriode`), `PresencesRH.tsx` (onglet Analyse de période) | — | `rhPresence.analysePeriode` (lecture seule) | Onglet « Analyse de période » : dates + filtre employé + recherche + stats/anomalies | vitest rh-stats-engine (analyserPeriode : cumuls, anomalies, période vide) + typecheck | Diagnostics exacts (jour comptable défini §conception), dimanches/fériés/non ouvrés exclus | Assert vitest + revue UI | 2026-09-23 |
| **F27** | **Fonctionnalité manquante — Lecture des historiques (snapshots P13)** : restituer les versions passées bulletins/planning/évaluations/solde dans les onglets RH (P6 a écrit sans lecture) | P2 | 7 | VALIDE | `rh-payroll.ts`, `rh-planning.ts`, `rh-evaluation.ts`, `rh-leave.ts` (4 endpoints de lecture gatés) · `HistoriqueDialog.tsx` (partagé) · PaieRH · PlanningRH · EvaluationsRH · CongesAbsences | tables snapshot (P13, lecture seule) | `rhPayroll.listBulletinSnapshots` (rh.paie.modifier), `rhPlanning.listWeekSnapshots` (rh.presence.modifier), `rhEvaluation.listSnapshots` (rh.evaluation.modifier), `rhLeave.listBalanceSnapshots` (rh.conge.modifier) | boutons « Historique » gatés par permission (masqués sinon) + dialog versions/raison/date/JSON | suite RH 39/39 + suite globale 379/381 + tsc 0 erreur fichiers touchés | Historique restitué (version, raison, date, créateur, état archivé JSON) | Capture + assert | 2026-09-23 |
| **INFRA-01** | Resynchronisation BDD complète après drift schéma→base (cause racine du **500 `rh.list`** page Employés : colonnes sortie `employes` absentes + tables snapshots manquantes) | P0 | 8 | TERMINE | `packages/db/src/schema/archives.ts` (déclaration drizzle de l'existant + séquence recréée/`OWNED BY`) · vérifs scripts temp | `employes` : `date_sortie`, `motif_sortie`, `detail_motif_sortie`, `reembauchable`, `sortie_changed_by`, `sortie_changed_at` ✓ · tables `payroll_entry_snapshots`, `planning_snapshots`, `evaluation_snapshots`, `leave_balance_snapshots` ✓ · `reconditionnements.produit_id→produit_source_id` (rename préservant données) ✓ · 9 uniques manquants créés · FK parkings obsolètes retirées · 271 lignes orphelines `attendance_calculations` purgées | — | — | — | `pnpm -F @atelierone/db push --force` → **[✓] Changes applied** ; `rh.list` re-testable sans 500 ; tsc : aucune nouvelle erreur (errs pré-existantes hors périmètre) | Assert BDD + [✓] push + re-test page Employés | 2026-09-24 |
| **INFRA-02** | Consignation du **rapport d’audit fonctionnel réel** (24/09) + ouverture des anomalies AUD-01…AUD-10 (BACKLOG, phase 9 proposée) | P0 | 9 | TERMINE | `DOC/RH/AUDIT_FONCTIONNEL_RH_2026-09-24.md` (rapport) + lignes AUD ci-dessous | — | — | — | relecture croisée rapport ↔ tickets | 36 tests consignés, statuts : ✅ 8 · ⚠️ 8 · ❌ 12 · ⭕ 4 · 🔎 4 ; 10 tickets ouverts | Rapport + ce registre | 2026-09-24 |
| **AUD-01** | **Crash onglet « Bulletins » de la Paie** : `TypeError: Cannot read properties of undefined (reading 'map')` (BulletinsSection) → écran « Une erreur est survenue », 26 bulletins invisibles (tests §27-28) | P0 | 9 | BACKLOG | `rh/_components/PaieRH.tsx:837` | `payroll_entries` (26 enreg.) | — | onglet Bulletins | — | L’onglet Bulletins affiche les 26 bulletins sans erreur | Screenshot `paie-bulletins-crash.png` | 2026-09-24 |
| **AUD-02** | 3 écrans en erreur React (Rules of Hooks : « Rendered more hooks than during the previous render ») : **Disciplinaire (sanctions), Compétences & Formations, Documents RH** | P1 | 9 | BACKLOG | pages `rh/sanctions`, `rh/competences`, `rh/documents` (ordre des hooks non stable) | — | — | 3 pages | — | Les 3 pages rendent leur contenu | Console + captures `sanctions-probe-final.txt` | 2026-09-24 |
| **AUD-03** | **« Analyse de période » (F26) vide** (0 présent/0 h sur Août ET Sept) alors que « Mensuel & clôture » et Dashboard affichent 147 j présents → sources de présence désalignées (tests §3-7) | P1 | 9 | VALIDE | `rh-presence.ts` (`analysePeriode`), `rh-stats-engine.ts`, `PresencesRH.tsx` | résumés mensuels réels 147/15 (sept) | `rhPresence.analysePeriode` | onglet Analyse de période | — | Même période → mêmes chiffres sur Analyse / Mensuel / Dashboard | Assert + captures | 2026-09-24 |
| **AUD-04** | **Net de bulletin négatif sans garde-fou** (−4 615,38 F, employé 21, période ouverte) : retenue « base/26 j » appliquée au-delà du net | P0 | 9 | BACKLOG | `payroll-engine.ts` / `rh-payroll.ts` (retenues absences) | `payroll_entries` (emp.21 négatif) | `prepareMonth` | bulletin | — | net ≥ 0 (plancher) ou retenue différée + avertissement | Bulletin SQL + capture | 2026-09-24 |
| **AUD-05** | **Bulletins non rejouables depuis les données** : bases 250/300/120 k ≠ fiches (200/200/1 k), bulletin Août = Sept (identiques, 1 j/9,5 h), HS 0,5 h sans autorisation (emp.11) (tests §24, 25, 34) | P1 | 9 | BACKLOG | `rh-payroll.ts` (snapshot de la base au calcul), `payroll_entry_snapshots` | `payroll_entry_snapshots` (base + retenue au moment du calcul) | `prepareMonth`, historiques | bulletin | — | Chaque bulletin rejouable (base datée + présences source) | Snapshot + assert | 2026-09-24 |
| **AUD-06** | **Widget « Salaire sur période (base présences) » du Pointage : aucun montant** après sélection employé + dates (test §29) | P1 | 9 | BACKLOG | `PointageRH`, procédure widget (`rhPosture`) | — | procédure concernée | widget | — | Montant affiché pour une période avec présences | Capture `pointage-salaire-fidele.txt` | 2026-09-24 |
| **AUD-07** | **Soldes de congés ne reflètent pas les droits consommés** : maladie approuvée 1 j (28/08) jamais débitée (PRIS = 0 partout) ; type « Maladie » absent du tableau des soldes (tests §12, 14) | P2 | 9 | BACKLOG | `rh-leave.ts` (décompte demandes payantes/non payantes), `CongesAbsences.tsx` | `leave_balance_adjustments`, traces N04 | `decideRequest`/`getBalances` | onglet Soldes | — | Solde cohérent avec demandes approuvées (PRIS > 0) | Assert + capture | 2026-09-24 |
| **AUD-08** | **Énum bruts dans l’UI** : mode paie « SALAIRE_HORAIRE »/« SALAIRE_MENSUEL » affiché en brut (Pointage, fiches) — reliquat P20 | P2 | 9 | BACKLOG | `lib/rh-labels.ts` (modes paie), `PointageRH`, `EmployeeDetail` | — | — | libellés FR | — | « Horaire » / « Mensuel » affichés | rg labels | 2026-09-24 |
| **AUD-09** | **Dénominateurs / horaires théoriques hétérogènes** : « 26 j ouvrés » (dashboard) vs 21 j, heures théoriques 199,5 h vs 184,5 h pour 2 employés (≂ 10 j ouvrés) ; Août affiché 0 jour | P2 | 9 | BACKLOG | `rh-dashboard.ts`, `rh-stats-engine.ts`, `rh-presence.ts` | — | `getKpis`, `analysePeriode` | KPI + analyse | — | Un seul jeu de jours ouvrés / heures théoriques défini | Assert | 2026-09-24 |
| **AUD-10** | **Données de démo incohérentes** bloquant les calculs : fiches « Date d’embauche inconnue », historique des salaires vide, fiche 60 sans salaire de base, statuts en minuscule vs majuscule | P2 | 9 | BACKLOG | seeds / `rh.ts` (lecture) | `employes` (30 lignes dont 16 actifs) | — | fiches | — | jeux de données complets ; statuts normalisés | SQL + captures | 2026-09-24 |

---

## MATRICE DES DÉPENDANCES (graphe simplifié — version détaillée : `DOC/RH/DEPENDENCY_GRAPH.md`)

**Légende** : `D→E` : D doit être livré avant E. `B` = tâche bloquante (retarde d'autres lignes). `I` = tâche indépendante (exécutable en parallèle dans sa phase). `M` = tâche nécessitant migration DB.

| ID | Dépend de | Bloque | Type | Migration |
|---|---|---|---|---|
| P01 | avances-engine (→ existant) | P02, F16 | **B** | NON |
| P02 | P01 | F16 | **B** | NON |
| P03 | — | — | I | NON |
| P04 | P14 (pages cibles stables) | F06(nav) | I (post-P14, Phase 5) | NON |
| P05 | — | P06 (bornes justes), clôture paie (Phase 2) | **B** | NON |
| P06 | P05 | F06/export | I (post-P05) | NON |
| P07 | N07 (dénominateur commun) | — | I (post-N07) | NON |
| P08 | — | — | I | NON |
| P09 | — | — | I | NON |
| P10 | — | — | I | NON |
| P11 | — | — | I | NON |
| P12 | N11 (règle d'effets décidée) | F05 | **B** | NON |
| P13 | P02 (paie fiable) | F18 | **B** | **OUI** (tables snapshot à créer) |
| P14 | — | P04, N20, F06(paie) | **B** | NON |
| P15 | — | — | I | NON |
| P16 | N05 | — | I (couplé curatif) | NON |
| P17 | — | — | I | NON |
| P18 | — | — | I | NON |
| P19 | N11 (règle suspendu) | — | I (post-N11) | NON |
| P20 | — | — | I | NON |
| N01 | — | P03 conséquence | **B** (sécurité) | NON |
| N02 | — | — | I | NON |
| N03 | N10 (ordre opérations) | — | I (post-N10) | **OUI** (évent. colonne trace, à confirmer) |
| N04 | — | — | I | NON |
| N05 | P16, purges décidées | — | I (fin de course) | NON |
| N06 | P05, P06 (décomptes justes) | — | I (post-P05/P06) | NON |
| N07 | — | P07 | **B** | NON |
| N08 | — | — | I | NON |
| N09 | — | — | I | NON |
| N10 | — | N03 | **B** | NON |
| N11 | N01 (socle agence sain) | P12, P19 | **B** (règle métier) | NON |
| N12 | P12 (parcours statut) | F04 | I (post-P12) | NON |
| N13 | — | — | I | **OUI** (tables snapshot à créer) |
| N14 | — | — | I | NON |
| N15 | P11 (gardes exports), P07 (KPI fiable) | F21 | I (post-P11) | NON |
| N16 | — | F25 | I | NON |
| N17 | — | — | I (décision produit) | NON |
| N18 | — | — | I | NON |
| N19 | — | — | I | NON |
| N20 | P14 (mapping commun) | — | I (post-P14) | NON |
| F27 | P13 (snapshots posés) | — | I (post-P13) | NON |

### Tâches **indépendantes** (parallélisables dans la même phase)
N01, N02, N03, N05, N08, N09, N14, N15, N16, N17, N18, N19, P03, P08, P09, P10, P11, P15, P17, P18, P20.

### Tâches **bloquantes** (faire en premier au sein de leur phase / sous-phase)
- **Phase 1** : P01 (→ P02). P02 → fin de phase. Test de référence obligatoire : 100 000 → déduction 100 000 ; 40 000 récupérés → 60 000 restants ; 100 000 récupérés → 0.
- **Phase 2** : P05 (borne clôture : 30/09 inclus, 01/10 exclu) → N10 (ordre opérations) → N03 → N07 → P07 → P14 → N20 ; plus N08/N09 (forfait/heures standard) et snapshot bulletin (P13 pré-conception).
- **Phase 3** : N01 (socle agence) → N11 ; P16(durcir) ; P17 (gating boutons, déplacé ici) ; P19 (« selon dépendances », co-traité avec les gardes).
- **Phase 4** : P06 → N06 ; N07 déjà posé en Phase 2 (support de P07) ; analyse de période (F26). **Livrée le 2026-09-23 — VALIDE (gate humain passé, feu vert Phase 5).**
- **Phase 5** : P12 → N12/F04 (s'appuient sur N11 posé en Phase 3) ; P04 (`?employeId=`, déplacé ici avec la navigation employé). **Livré le 2026-09-23 — VALIDE (gate humain passé, feu vert Phase 6).**
- **Phase 6** : P13 (schéma snapshot bulletins) puis N13 — **Livrée le 2026-09-23 — VALIDE (gate humain passé, feu vert Phase 7).**
- **Phase 7** : P20/N14/F27 (UX : pagination + recherche visible, harmonisation libellés/devise, lecture des historiques) — **Livrée le 2026-09-23 — VALIDE (gate humain passé, feu vert Phase 8).**
- **Phase 8** : P11 (gardes exports) avant N15 ; la livraison P11 → N15 → N16/F25 est **implémentée et testée (T24)** — **ouverte le 2026-09-23 (EN_CONCEPTION) — prête pour gate humain (autrévision + RAPPORT_PHASE_8.md).** Le 2026-09-24 : drift BDD (500 `rh.list`) résolu — **INFRA-01** TERMINE, base re-synchronisée (`[✓] Changes applied`), page Employés re-testable.

### **Règle d'autorévision (obligatoire avant d'ouvrir la phase suivante)**
Toute phase terminée est **audité par l'agent lui-même** : relire le registre et cocher chaque point des lignes de la phase (ex. Phase 1 : UI, API, DB, workflow, récupération, récupération partielle, solde, report, annulation, paie, sortie salarié, permissions, historique, tests, non-régression) — puis seulement marquer la phase VALIDE. En cas d'échec : A_CORRIGER, pas de Phase n+1.

### Tâches nécessitant **migration DB**
P13 (tables snapshot bulletins), N13 (tables snapshot planning), N03 (à confirmer : colonne/meta trace de paiement). Toutes les autres sont du code/logique uniquement. Toute migration : non destructive, versionnée, avec plan de rollback (protocole A–G étape 7).

---

## Nomenclature des colonnes

- **ID** : `P` (problème d'audit) ou `N` (nouvelle anomalie) ou `F` (fonctionnalité manquante, ref §23' audit) ou `G` (gardé, infra). Les « sous-tâches » portent le suffixe `-1/-2…` de la ligne mère. Les F-lines sont remplies par les P/N-lines qu'elles référencent (pas de statistique indépendante).
- **Priorité** : P0 = blocant argent/sécurité/tenant · P1 = fiabilité/fidélité · P2 = cohérence/UX · P3 = confort.
- **Phase** : 0..9 (une seule valeur, sauf cas explicitement scindé comme P16 = 3/9).
- **Statut** : BACKLOG / EN_INSPECTION / EN_CONCEPTION / EN_IMPLEMENTATION / EN_TEST / A_CORRIGER / BLOQUÉ / TERMINE / VALIDE.
- **Fichiers / DB / API / UI / Tests** : périmètre touché (case `—` = non concerné, doit rester inchangé).
- **Vérification** : critère objectif de passage.
- **Preuve** : artefact fourni en gate (snapshot, assert, capture, CSV, vidéo).
- **Date** : date de passage au statut courant (ex. `2026-09-23`).

## Règles de progression

1. Au fil de la phase active : les lignes passent par tous les statuts intermédiaires documentés. **Aucun saut direct.**
2. À chaque passage EN_TEST, exécuter lint + typecheck + tests ciblés + scénarios métier + vérification des effets secondaires (voir plan A–G).
3. Terminer la phase = toutes ses lignes à TERMINE puis VALIDE, intégrité données OK, zéro régression connue, registre à jour, rapport de phase produit.
4. **Autorévision obligatoire (règle imposée)** : avant le gate humain, l'agent relit son propre registre et coche point par point chaque ligne de la phase (ex. Phase 1 : UI, API, DB, workflow, récupération, récupération partielle, solde, report, annulation, paie, sortie salarié, permissions, historique, tests, non-régression) et produit le rapport d'autorévision (CHECKLIST §C).
5. Le chef de phase (humain) valide ensuite le **rapport de phase** avant d'ouvrir la suivante. Sinon STOP.




---

## PHASE R3 (REC-1) — PRÉSENCES & TEMPS (analyse de période, congés, KPI) — livrée le 2026-09-24

> **Phase active retirée : R3 (REC-1) — « Présences & temps »**. Couvre AUD-03 (analyse de période vide)
> et la part REC-1 d'AUD-09 (dénominateur des KPI de présence). Séquence : PLANIFIER → INSPECTER →
> CONCEVOIR → IMPLÉMENTER → TESTS TECHNIQUES → TESTS FONCTIONNELS → VÉRIFIER → DOCUMENTER → GATE →
> STOP (pas de R4).
> **Décision utilisateur (question 24/09)** : réconcilier les données de démo en **rejouant `GPJ_POINTAGE`
> ciblé** (mapping EMP001..15 → employés existants PAR NOM, additif/idempotent, aucun touché sur
> employes/contrats) plutôt qu'en « code seul à 0 ». Décision n°2 : population commune = **effectif vivant
> uniquement** (actif/conge/suspendu) → Analyse = Mensuel = Dashboard (134 jours présents en septembre).

| ID | Fonction | Priorité | Phase | Statut | Fichiers | DB | API | UI | Tests | Vérification | Preuve | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **R3** | Présences & temps : analyse de période vide vs mensuel/dashboard (bug A), congés approuvés sans projection (bug B), dénominateur KPI faussé 35,3 % (bug C) — bugs confirmés à l'exécution puis corrigés | P0 | REC-1 | VALIDE | `rh-stats-engine.ts` (classifierJour + `joursComptablesEmployeMois`), `rh-presence.ts` (analysePeriode alignée sur closeMonth + filtre effectif vivant sur analyse/listSummaries), `rh-leave.ts` (`markLeaveOnAttendance` : garde cycle + garde moisCloture + upsert entrée conge + `runCalculation`), `rh-posture.ts` (`pointer` : garde cycle), `rh-dashboard.ts` (`getKpis` : dénominateur Σ jours comptables), `import-gpj-v31.ts` (`resume` : borne P05 `lt(end)` + `daysOnLeave` via classifierJour) | `packages/db/src/r3-realign-presences.ts` (replay ciblé : 264 entrées + calculs, 1 jour congé projeté, résumés août (14) / sept (15) recomputés) | `rhPresence.analysePeriode`, `rhPresence.listSummaries`, `rhDashboard.getKpis`, `rhPosture.pointer` | onglet Analyse de période (PresencesRH) : jours présents / heures / congés réels affichés | vitest 154/154 (10 fichiers RH dont rh-stats-engine 26/26 + nouveaux tests `joursComptablesEmployeMois`), suite complète 385/387 (2 échecs préexistants hors périmètre : licence-service, stock-engine), eslint 0 erreur, tsc 0 erreur sur le périmètre (erreurs préexistantes hors périmètre) | Même période → mêmes chiffres Analyse/Mensuel/Dashboard (134 jours présents, 1114,6 h, KPI 45,6 %) ; congé approuvé emp14 (28/08) projeté (1 entrée conge + 1 calc, daysOnLeave résumé août = 1, analyse joursConges=1) ; borne P05 : résumés août recalculés = calcs dans [01/08, 01/09[ ; pointage sans cycle refusé (BAD_REQUEST explicite) | `DOC/RH/PHASE_R3_PRESENCES_TEMPS_2026-09-24.md` + `audit/r3/` (r3-repro-bugs.cjs, r3-verify-fixed.cjs, repro-*.txt, verify-*.txt) | 2026-09-24 |

### Pivot post-audit — verdict actualisé (R3/REC-1)
- **AUD-03** (analyse de période vide vs résumé/dashboard) : **VALIDE** — `PHASE_R3_PRESENCES_TEMPS_2026-09-24.md` + `audit/r3/gate-r3-33cases.txt` (écart Analyse/Mensuel = 0 ; 134 jours présents sur les 3 écrans).
- **AUD-09** (dénominateurs / heures théoriques hétérogènes) : **partiel REC-1 corrigé** (dénominateur KPI = Σ jours comptables par employé vivant, règle closeMonth) ; le volet REC-5 (heures théoriques fiche employé / paie) reste **BACKLOG** — hors périmètre R3.

### GATE R3 — 33 cases
| # | Case | Résultat |
|---|---|---|
| 1 | Reproduction réelle AVANT correction : analyse Sept = 0 présent / 780 muets / 0 h (30 employés) | ✔ — `audit/r3/repro-*-evt` puis avant fix enregistré en base/transcript |
| 2 | Preuve Bug A : écart Analyse vs Mensuel (avant) | ✔ — 0 vs 169 jours présents Sept, 23 résumés |
| 3 | Preuve Bug B : congé approuvé emp14 sans entrée ni calcul (avant fix) | ✔ — entries_jour_conge=0, calcs_jour_conge=0 |
| 4 | Preuve Bug C : KPI 35,3 % (147/(26×16)) | ✔ |
| 5 | Cause racine A identifiée (calculs absents en base ; analyse lit les calculs) | ✔ — entries=1, calcs=0 |
| 6 | Cause racine B identifiée (`runCalculation` non appelé par markLeaveOnAttendance) | ✔ — code lu (rh-leave) |
| 7 | Cause racine C identifiée (`presenceRateForHeadcount` sur effectif entier sans cycle) | ✔ — rh-dashboard getKpis |
| 8 | Décision réconciliation validée par l'utilisateur (replay GPJ_POINTAGE ciblé) | ✔ |
| 9 | Mapping GPJ→employés PAR NOM vérifié (15/15, ambiguité → erreur) | ✔ |
| 10 | Replay additif/idempotent (0 doublon à la 2e exécution) | ✔ — 2e run : « 0 entrées créées » |
| 11 | Aucun touché sur employes/contrats/rémunérations | ✔ |
| 12 | Congé 28/08 : entrée `conge` + calcul + résumé AOÛT daysOnLeave=1 | ✔ — verify PASS |
| 13 | Analyse 28/08 : joursConges=1, joursPrésence=0, jourThéoriques=1 | ✔ |
| 14 | Analyse = Mensuel Sept : 134 = 134, écart 0 | ✔ |
| 15 | Heures travaillées Analyse = résumés : 1114,6 h = 1114,6 h | ✔ |
| 16 | KPI presenceDays = Analyse : 134 = 134 ; présence 45,6 % (>35,3) | ✔ |
| 17 | Résumés AOÛT = calcs du mois (présents 61=61, absents 7=7, congés 1=1) | ✔ — P05 |
| 18 | Pointages du 01/09 reclassés en septembre (P05) | ✔ — 10 pointages non comptés en AOÛT |
| 19 | Toutes bornes : 01/09→04/09 = 4 jours théoriques (emp9) | ✔ |
| 20 | Dimanche 30/08 non compté (P07) | ✔ — 3 jours théoriques sur [30/08,02/09] |
| 21 | Employé sans cycle : 0 jour au dénominateur (KPI) | ✔ — helper + getKpis |
| 22 | Pointage sans cycle → BAD_REQUEST explicite (emp60) | ✔ — message cycle |
| 23 | Populations alignées : effectif vivant (actif/conge/suspendu) sur Analyse, listSummaries, KPI | ✔ — décision utilisateur n°2 |
| 24 | Congé partiel (1 jour) sans double comptage (présence ni absence ni muet) | ✔ — 08/28 : conge=1, muet=0, présent=0 |
| 25 | Total période = somme des journées affichées | ✔ — analyse = agrégation jours/résumés |
| 26 | Tests techniques : vitest 26/26 + suite RH 137/137 ; eslint 0 erreur ; tsc 0 erreur périmètre | ✔ |
| 27 | Non-régression : suites presence-engine/leave-engine/rh-posture/rh-scope/rh-recherche/payroll vertes | ✔ — 137/137 |
| 28 | Échecs restants hors périmètre documentés (licence-service, stock-engine) | ✔ — préexistants |
| 29 | Intégrité : entrées 266, calculs 265, résumés 45 (aucun DELETE) | ✔ |
| 30 | Résumés artefacts/sortis laissés (additif uniquement) — population affichée = vivants | ✔ |
| 31 | Preuves nommées audit/r3/repro-* + verify-* + fixed-coherence | ✔ |
| 32 | Rapport 19 sections + registre à jour | ✔ |
| 33 | **STOP** — aucune ouverture de R4 | ✔ |

**STATUT : R3 (REC-1) = VALIDE (GATE 33/33).**

## PHASE R4 — PAIE / MOTEUR DE PAIE & COHÉRENCE — ouverte le 2026-09-25

> **Phase active : R4 — Paie** (instruction utilisateur 25/09 — rapport final 24 sections dans `DOC/RH/PHASE_R4_PAIE_2026-09-25.md`).
> Couvre AUD-01 à AUD-04 (reproduction A–F) : source salariale canonique, bulletins, net négatif, cohérence fiche/historique/période.
> **Périmètre exclu (hors R4) : architecture complète des avances, workflow paiement/récupération d'avance (R5), refonte historiques RH, rapports RH généraux, refonte Documents, Compétences, `PlanningRH.tsx:82`.**
> R4 ne crée aucun flux R5 ; elle consomme uniquement les données d'avances déjà calculées.
> Séquence stricte : PLANIFIER → INSPECTER → REPRODUIRE → CONCEVOIR → IMPLÉMENTER → TEST_TECHNIQUE → TEST_FONCTIONNEL → VÉRIFIER → DOCUMENTER → GATE → STOP.

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — ouvert (todo 10 items) |
| 2 | INSPECTER : moteur paie, routeur, UI, schémas, états DB | ✔ — 26 bulletins, 8 historiques, 0 snapshot, 0 période bornée complète |
| 3 | REPRODUIRE : A fiche≠bulletin (200k/250k), B bulletins sans historique, C historiques absents, D net négatif bulletin 52 (-4615 F), E inclusion archive (Dir. 400k), F temps R3≠bulletin (x13) | ✔ — `audit/r4/REPRODUCTION.md` + `audit/r4/r4-before-*.txt` |
| 4 | CONCEVOIR : source canonique, bornes, net négatif, inclusion bornée, snapshot, permissions UI+API, feedback skipped/errors | ✔ — `audit/r4/CONCEPTION.md` (D1–D9) |
| 5 | IMPLÉMENTER : moteur D2 (exclusion retenue absence modes non fixes), routeur D3/D4 (skip archive, bornes mensuelles), UI D6/D7 (permissions + feedback) | ✔ — 5 nouveaux tests moteur, suite 389 verts, typecheck sans erreur RH |
| 6 | TEST_TECHNIQUE (vitest cwd apps/nextjs + nouveaux) | ✔ — 389 passés / 2 échecs préexistants hors périmètre ; payroll-engine 61/61 (5 nouveaux R4-D2) ; tsc 0 erreur fichiers modifiés |
| 7 | TEST_FONCTIONNEL (cas 1–4 + périodes + bornes + négatif + snapshot + permissions) | ✔ — closeMonth(2026,9) OK (résumés verrouillés), prepareMonth(4) 15 créés/15 écartés/0 erreur, bornes refusées, bulletin 52 = +509,42 (avant -4615,38), snapshots 28 (P13), permissions FORBIDDEN sans rh.paie.modifier |
| 8 | VÉRIFIER non-régression R3 (134j/1114,6h/45,6%) + intégrité IDs | ✔ — analyse 134 j/1114,6 h/13 absents/16 emp ; KPI 45,6 % (workingDays 26, presenceDays 134) ; AUCUN DELETE (employes 30, contrats 15, entries 266, calcs 265, résumés 52, bulletins 28, snapshots 28) |
| 9 | DOCUMENTER : rapport 24 sections + registre | ✔ — `DOC/RH/PHASE_R4_PAIE_2026-09-25.md` (24 sections) + `audit/r4/` (REPRODUCTION, CONCEPTION, r4-before-*, r4-after-*, gate-r4-35cases) |
| 10 | GATE 35 cases + graphify update + **STOP (pas de R5)** | ✔ — `audit/r4/gate-r4-35cases.txt` = 35/35 PASS ; graphify update ; STOP |

> **REPRISE CIBLÉE (décision utilisateur 25/09)** : la GATE 35/35 reposait sur des
> tests API (caller tRPC) sans navigation navigateur réelle. Reprise demandée :
> **test UI Playwright** du parcours PaieRH. Réalisé — `apps/nextjs/playwright-r4.config.ts`
> + `e2e-r4/r4-paie.spec.ts` (3 tests) + `e2e-r4/r4-global-setup.ts` :
> **3/3 PASS (navigateur Chrome réel)**. Preuve : `audit/r4/r4-after-08-ui-playwright.txt`.

> **REPRISE 2 (décision utilisateur 25/09 — lever la réserve MENSUEL/FORFAIT)** :
> injection contrôlée puis nettoyage ciblé par ID exact de 3 salariés test (401/402/403)
> via `audit/r4/r4-reprise-inject-test.sql` + `audit/r4/r4-reprise-cleanup-test.sql`.
> Préparation de la paie P4 en **UI réelle (Playwright R4-B-01, Chrome)** → 18 bulletins
> (15 réels + 3 test), bulletins MENSUEL cas 1 (net 188 585) / cas 2 (retenue absence
> 5 769,23 visible, net 139 034,90) / FORFAIT hebdo (net 188 068,17) reconstruits
> DB=API=bulletin (`audit/r4/r4-reconstruction.txt`), Arnaud +509,42 préservé (R4-B.4),
> compteurs APRÈS nettoyage = baseline exacte, non-régression R3 rétablie (134 j/1114,6 h/45,6 %),
> suite relancée 161/161 RH + 389/391 complet (2 échecs préexistants hors périmètre).
> **GATE : `audit/r4/r4-reprise-gate.txt` = 20/20 PASS.**

**STATUT : R4 (PAIE) = VALIDE — GATE API 35/35 + REPRISE UI Playwright 3/3 + REPRISE
CIBLÉE MENSUEL/FORFAIT 20/20**
**(TEST_TECHNIQUE 389 verts, 61 payroll ; TEST_FONCTIONNEL API 7/7 + UI navigation réelle
login→préparation→bulletins→gating→clôture→toasts→invalidate ; non-régression R3 vérifiée
134 j/1114,6 h/45,6 % ; modes MENSUEL/FORFAIT désormais démontrés sur bulletins réels
navigués en UI réel, injection+nettoyage ciblé sans trace).**

## PHASE R5 — AVANCES & RÉMUNÉRATIONS — ouverte le 2026-09-25

> **Phase active : R5 — Avances & rémunérations** (instruction utilisateur 25/09 — rapport
> `DOC/RH/PHASE_R5_AVANCES_2026-09-25.md`, conception `audit/r5/r5-conception.md`).
> Complète P01/P02 : journal d'état, référence, synthèse/recherche fiche, annulation motivée,
> garde-clôture, permissions, plafond/doublon, cycle bout-en-bout jusqu'au report paie.
> **Périmètre exclu : finance (avance ≠ créance), refonte historiques RH, rapports RH généraux,
> Documents, Compétences, `PlanningRH.tsx:82`.**
> Séquence stricte : PLANIFIER → INSPECTER → REPRODUIRE → CONCEVOIR → IMPLÉMENTER →
> TEST_TECHNIQUE → TEST_FONCTIONNEL → VÉRIFIER → DOCUMENTER → GATE → STOP (pas de R6).

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R5 seul, R6 interdit |
| 2 | INSPECTER : engine, routeur, UI, schémas, états DB | ✔ — `audit/r5/r5-inspection.txt` |
| 3 | REPRODUIRE : A (listRecoveries non exposé) + B (100k→40k→60k→P4) | ✔ — `audit/r5/r5-reproduction.txt` + `r5-repro-inject.sql` |
| 4 | CONCEVOIR : référence E3, journal E1, synthèse/recherche E2, annulation E7, gardes, idempotence, avance≠finance | ✔ — `audit/r5/r5-conception.md` (E1–E9) |
| 5 | IMPLÉMENTER : DB `reference`+`advance_transitions` ; engine pur `genererReferenceAvance`/`syntheseAvances` ; routeur transactionnel + journal + gardes + listTransitions + {rows,synthese} ; UI AdvancesSection (Réf., recherche, cartes, AnnulationModal, DetailHistoryModal, isPending) | ✔ — push schéma OK ; tsc 0 erreur R5 ; eslint 0 |
| 6 | TEST_TECHNIQUE | ✔ — avances-engine 28/28 ; suite 392 passés / 2 préexistants hors périmètre ; vitest.config exclut e2e-r5 |
| 7 | TEST_FONCTIONNEL : R5-FUNC-01 cycle complet + R5-FUNC-02 garde-fous + R5-REPRO-B + R5-REPRO-A corrigé | ✔ — **Playwright Chrome réel 4/4 PASS** ; journal DB 5 états ; justif annulation persistée ; bulletin 501 P4 = 128 585 |
| 8 | VÉRIFIER : non-régression R4 (nets P4 = baseline, Arnaud 509,42, 0 négatif) + R3 intacte + nettoyage | ✔ — `audit/r5/r5-verifier-non-regression.txt` ; 15 bulletins identiques baseline ; **0 trace R5 en base (0/0/0)** |
| 9 | DOCUMENTER : rapport + registre + GATE | ✔ — `DOC/RH/PHASE_R5_AVANCES_2026-09-25.md` + `audit/r5/` (32 fichiers evidence) |
| 10 | GATE 32 cas + graphify update + **STOP (pas de R6)** | ✔ — `audit/r5/gate-r5-32cases.txt` = 32/32 PASS ; graphify update ; STOP |

**STATUT : R5 (AVANCES & RÉMUNÉRATIONS) = VALIDE — GATE 32/32 PASS**
**(TEST_TECHNIQUE 392 verts + 28 engine ; TEST_FONCTIONNEL UI navigateur réel 4/4 :
cycle complet, garde-fous plafond/doublon/annulation motivée, report paie bulletin 501
net 128 585, historique/journal exposés ; non-régression R4 nets identiques
(Arnaud 509,42, 0 négatif) & R3 intacte ; nettoyage sans trace 0/0/0.)**

## PHASE R6 — REFONTE HISTORIQUES RH — ouverte le 2026-09-25

> **Phase active : R6 — Refonte historiques RH** (exclu du périmètre R4/R5 ; cahier des charges
> `AMÉLIORATION DU MODULE RH APRÈS AUDIT.md` §PHASE 17 : toutes les opérations clés tracées
> AVANT→APRÈS→QUI→QUAND→MOTIF, ne jamais supprimer silencieusement une valeur historique,
> cohérence transactionnelle).
> **Périmètre R6** : traçabilité à la source (B1 réembauche motif, B2/B3 congé→présence écrase
> temps + fériés, B4 closeMonth verrouillé, B5 updateItemConfig sans avant/après, B6 fuite salaire
> ContratsTab, B7 récupération avance via paie non journalisée, B8 motif avance concaténé) +
> historique lisible et complet (timeline « Parcours de l'employé » enrichie : statut/sortie/réembauche,
> poste, salaire, présences, congés, paie, avances ; filtre/recherche, acteur nommé, motif).
> **Périmètre exclu (documenter, ne pas implémenter) :** scoping multi-agence pur (B9/B10),
> matrice de transitions congé (B12), unicités composites DB (P2) → autres phases.
> Séquence stricte : PLANIFIER → INSPECTER → REPRODUIRE → CONCEVOIR → IMPLÉMENTER →
> TEST_TECHNIQUE → TEST_FONCTIONNEL → VÉRIFIER → DOCUMENTER → GATE → STOP (pas de R7).

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R6 seul, R7 interdit |
| 2 | INSPECTER : tables hist/snapshot, routers, historique UI | ✔ — audit traçabilité (28 événements, 9 non conformes, 12 défauts B1–B12) |
| 3 | REPRODUIRE : B1–B8 à prouver | ⏳ — en cours |
| 4 | CONCEVOIR : décisions R6 | ⏳ |
| 5 | IMPLÉMENTER : fixes B1–B8 + timeline enrichie | ⏳ |
| 6 | TEST_TECHNIQUE | ⏳ |
| 7 | TEST_FONCTIONNEL (Playwright réel) | ⏳ |
| 8 | VÉRIFIER : non-régression R3/R4/R5 + nettoyage | ⏳ |
| 9 | DOCUMENTER : rapport + registre + GATE | ⏳ |
| 10 | GATE + graphify update + **STOP (pas de R7)** | ⏳ |

## PHASE R6 V2 — CYCLE DE VIE RH / SITUATIONS / SUSPENSIONS / ABSENCES / MISES À PIED / SORTIES / RÉEMBAUCHES — ouverte le 2026-09-29

> **Phase active : R6 V2 — cycle de vie du salarié** (instruction utilisateur 29/09 — revue
> MASTER + conception V2). Redéfinition du périmètre R6 : ne PAS transformer le champ
> `statut` en liste interminable → séparation obligatoire statut administratif / événement
> RH daté / effets contrat-présence-planning-paie-accès / workflow.
> La conception V1 (Refonte historiques, R6-25/09) est **absorbée** : décisions D1–D8 conservées.
> **Périmètre exclu : Finance, `PlanningRH.tsx:82`, R7.**
> Séquence stricte : PLANIFIER → INSPECTER → REPRODUIRE → CONCEVOIR(✔) → IMPLÉMENTER →
> TEST_TECHNIQUE → TEST_FONCTIONNEL → VÉRIFIER → DOCUMENTER → GATE → STOP (pas de R7).

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R6 V2 seul, R7 interdit |
| 2 | INSPECTER : valeurs réelles du statut (5 : actif/conge/suspendu/archive/sorti) ; silos absences/sanctions/leaveRequests ; suspension = intervalle ouvert sans date fin ; MAP purement documentaire ; intervalle sortie coupé à today ; réembauche efface dateSortie ; RBAC sans perms dédiées sortie/réembauche ; audit sans avant/après | ✔ — inventaire complet (schéma, routers, écritures employee_status_history, paie N11, accès utilisateurs) |
| 3 | REPRODUIRE : défauts identifiés (MAP sans effet paie, suspendu sans date fin, trou chronologie sortie, `"archivé"` ≠ `archive`) | ✔ — défauts reproduits/documentés (`audit/r6/cycle/debug-*.txt|png`) + reproduction R6 legacy (B1–B8) |
| 4 | CONCEVOIR V2 : décisions D-R6-01→18 + matrice de vérité §23 + matrice juridique camerounaise (art. 30/32/84/89/91) | ✔ — appliquées et prouvées par l'implémentation + tests (`DOC/RH/PHASE_R6_CONCEPTION_V2_CYCLE_VIE_2026-09-29.md` + `DOC/RH/R6_MATRICE_REGLES_CAMEROUN.md`) — **feu vert humain du GATE à confirmer** |
| 5 | IMPLÉMENTER : statut admin 4 valeurs (conge déprécié, suspendu dérivé) + table `employee_situations`/`employee_situation_transitions`/`hr_situation_types` + router `rh-situations.ts` (workflow, conflits, clôture, rollback) + moteur `situations-engine.ts` + impacts R4 (`regimeSituationPeriode`) + R3 (projection) + perms dédiées + UI wizard « Ajouter une situation RH » + timeline fiche | ✔ — code lives : `rh-situations.ts`, `rh-situation-engine.ts`, `situations-engine.ts`, `SituationCycleVie.tsx`, `SituationPeriodPanel.tsx`, `EmployeeDetail.tsx` (onglet Cycle de vie) |
| 6 | TEST_TECHNIQUE | ✔ — vitest **488 passés / 2 préexistants hors périmètre (stock-engine 22→26 motifs ; licence-service extend) / 12 skipés** (502) ; intégration `rh-situation.integration.test.ts` 13/13 ; terrain `rh-situation.terrain.test.ts` 12/12 (DB locale réelle) |
| 7 | TEST_FONCTIONNEL (Playwright réel) : 5 cas finaux (§35) | ✔ — R6 V2 **8/8 PASS** (map→refus→dispense→conflit→clôture→congé→réembauche→lecture seule, `e2e-r6/r6-cycle-vie.spec.ts` ×2 runs complets) + R6 legacy **8/8 PASS** (B1–B8 traçabilité, `r6-functional.spec.ts`) |
| 8 | VÉRIFIER : non-régression R3 (134 j/1114,6 h/45,6 %) + R4 (emp21 +509,42, modes) + R5 (avance/récup/report) + nettoyage | ✔ — **R5 4/4 PASS** (fixture 501 RECRÉÉE : prenom « Avance Mensuel » reconstruit dans `r5-reset.ts` + REPRO-B rendu population-agnostique, solde 60 000 prouvé en UI détail + SQL AVANCE_RECUP) ; **R4 situation-rh 10/10 PASS** (nets P4 = baseline) ; R3 couverte par la suite R4 ; resets durcis (FK payroll `situation-rh-paie-reset.ts`) |
| 9 | DOCUMENTER : rapport + registre + GATE | ✔ — cette entrée registre + `audit/r6/r6-conception.md` + `audit/r6/` + `audit/r6/cycle/` (preuves DB/UI) + `audit/r5/gate-r5-32cases.txt` (antérieur) |
| 10 | GATE (matrice §36) + graphify update + **STOP (pas de R7)** | ✔ — **GATE 36/36 PASS** → `audit/r6/gate-r6v2-36cases.txt` ; graphify update ; **feu vert humain 29/09 → `R6 V2 = VALIDE` + STOP (pas de R7)** |

**STATUT : R6 V2 (CYCLE DE VIE RH / SITUATIONS / SUSPENSIONS / MISES À PIED / SORTIES / RÉEMBAUCHES) = VALIDE — GATE 36/36 PASS + feu vert humain 2026-09-29**
**(TEST_TECHNIQUE : vitest 488 verts / 2 échecs préexistants hors périmètre R6
(stock-engine 22→26 motifs, licence-service) / 12 skipés ; intégration 13/13 ;
terrain 12/12 — TEST_FONCTIONNEL navigateur réel : R6 V2 8/8 (×2 runs complets)
+ R6 legacy traçabilité B1–B8 8/8 — NON-RÉGRESSION : R5 4/4 (fixture 501
reconstruite, solde 60 000 prouvé), R4 situation-rh 10/10 (nets P4 = baseline),
R3 couverte — STOP : R7 interdite sans instruction.)**

## PHASE R7 — HISTORIQUES / TRAÇABILITÉ / SNAPSHOTS — ouverte le 2026-09-29 — **CLÔTURÉE : VALIDÉE le 2026-09-29**

> **Phase active : R7 — historiques / traçabilité / snapshots** (instruction utilisateur 29/09,
> MASTER TASK R7). Objectif global : répondre de manière fiable à toute question historique
> (« état à une date », « avant/après », « qui/quand/pourquoi », bulletin reproductible) via
> ÉTAT COURANT + HISTORIQUES EFFECTIFS + JOURNAUX + SNAPSHOTS IMMUTABLES — sans transformer
> le système en Event Sourcing intégral, sans super-table historique.
> **Périmètre exclu : R8, R9, interface Situation RH transverse.**
> Séquence stricte : PLANIFIER → INSPECTER → CARTOGRAPHIER → CONCEVOIR → IMPLÉMENTER →
> TESTER TECHNIQUEMENT → TESTER API → TESTER UI → TESTER HISTORIQUE → TESTER SNAPSHOTS →
> TESTER TRAÇABILITÉ → TESTER PERMISSIONS → TESTER RÉGRESSION → VÉRIFIER INTÉGRITÉ →
> DOCUMENTER → GATE → STOP.

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R7 seul, R8 interdit |
| 2 | INSPECTION obligatoire (§3) : 17 entités + rh.getHistorique + functions history/snapshot | ✔ — `audit/r7/r7-preflight.md` : inventaire 17 entités + colonnes + comptes (audit_logs 10302, snapshots paie 51…) ; fonctions existantes (getHistorique, segmenterSalaires, snapshots versionnés P13, auditMiddlware) ; 6 écarts : contrat sans historique, date_sortie effacée à la réembauche, audit sans avant/après ni entity_id, poste sans auteur, immutable non sanctionnée, config paie vide |
| 3 | CARTOGRAPHIE : matrice des sources par domaine (§5) + arbre de traçabilité (§21) | ✔ — `audit/r7/r7-model.md` §1 matrice source (statut/salaire/poste/contrat/situations/présence/congés/avances/sanctions/éval/planning/bulletin/config/documents/journal) ; §2 arbre RÉSULTAT→DOCUMENT→LIGNES→RÈGLES→SOURCE→ÉVÉNEMENTS→HISTORIQUES ; règle projection fiche (§26) |
| 4 | CONCEPTION : getEmployeeStateAt (§36), getEmployeeSegments (§37), audit_logs, corrections rétroactives, immutabilité snapshots | ✔ — `audit/r7/r7-model.md` §3 contrats (contrat courant = projection, `rh_contract_versions` = avant-images versionnées), §4 corrections rétroactives = INSERT daté + `reason` obligatoire + avertissements bulletins clôturés, immutabilité `prochaineVersion` préservée ; décisions D-R7 appliquées |
| 5 | IMPLEMENTATION : engines historique + écritures (§7,10,11,26,33) + audit_logs | ✔ — push schéma OK (`rh_contract_versions`, `rh_audit_logs`, `employee_positions.changed_by`) ; `rh-history-engine.ts` (getEtatEmploye/getEmployeeStateAt/getEmployeeSegments) ; `rh-audit.ts` (`journaliserAvantApres`, motif obligatoire) ; routeur `rhHistory` enregistré (etat, etatDate, segments, historiqueContrat, auditEmploye, corrigerSalaireRetroactif) ; hooks `rh.ts` : SORTIE/REEMBAUCHE/UPDATE_EMPLOYE journalisés, createContrat→version 1, renouvelerContrat→avant-image version 2 ; tsc 0 erreur sur les fichiers R7 |
| 6 | TEST_TECHNIQUE : unitaires (§53), idempotence (§55), concurrence (§56), intégration (§54) | ✔ — `rh-history-engine.test.ts` 14/14 verts ; intégration route réelle 16/16 (`rh-history.integration.test.ts`) ; idempotence lecture (réponses identiques) ; concurrence = PK DB + transactions drizzle (pas de perte) |
| 7 | TEST_API : routes réelles (lecture à date, segments, audit, corrections) | ✔ — 16/16 via `createCaller` route réelle : etat (statut historique/fiche/inexistant), etatDate (agrégeats), segments (bornes, >13 mois BAD_REQUEST, to<from BAD_REQUEST), historiqueContrat (v1/v2), auditEmploye (avant/apres/motif/acteur), corrigerSalaireRetroactif (INSERT daté, fermeture j-1, fiche projetée, avertissements) |
| 8 | TEST_UI : Playwright réel (§48-49) | N/A documenté — R7 n'ajoute **aucune surface UI** (couche API/historiques/audit uniquement) ; justification au rapport §63 ; aucun écran modifié donc zéro point d'entrée UI nouveau |
| 9 | TEST_HISTORIQUE : reconstruction à date + segments + employé complexe (§38-42) | ✔ — reconstruction à date (2026-05-15/2026-06-15 avant+après correction), segments de constance, cycle complet sortie(2026-10-15)→réembauche(2026-10-20) reconstruit par `etat` sur les bornes, correction rétroactive rejouée par segments salaires |
| 10 | TEST_SNAPSHOT : bulletin clôturé immuable (§40,46) | ✔ (partiel documenté) — `versionUtilisee` exposé dans etatDate et vérifié (version max des snapshots valide/cloture/paye) ; `bulletinsCloturesImpactes` listé par corrigerSalaireRetroactif (jamais de régénération silencieuse) ; **aucune écriture R7 sur `payroll_entry_snapshots`** (invariant P13 préservé : tic 0 UPDATE dans le périmètre) ; test physique d'écriture/snapshot reporté (mécanique R4/P13, hors périmètre R7) |
| 11 | TEST_AUDIT : responsable/avant/après/motif (§43) | ✔ — rh_audit_logs retournés par `auditEmploye` avec `acteur` (jointure utilisateurs), `avantJson`/`apresJson` et `motif` vérifiés pour UPDATE_EMPLOYE, SORTIE, REEMBAUCHE, CORRECTION_SALAIRE_RETROACTIVE ; motif vide refusé par `journaliserAvantApres` |
| 12 | TEST_SECURITE : permissions (§44) + tenant (§45) | ✔ — masquage salaire sans `rh.salaire.consulter` (baseSalary null, source conservée) ; tenant scope NOT_FOUND employé hors agence ; gate `requirePermissionProcedure` short-circuit superadmin ; rôle `rh` autorisé par enforceRole |
| 13 | NON_REGRESSION : R3 (§59), R4 (§60), R5 (§61), R6 (§62) | ✔ — vitest complet `src/server` : **527 passés / 2 échecs préexistants hors périmètre (licence-service, stock-engine) / 0 nouveau** ; run navigué RH (engine+intégration+situation) 39/39 verts |
| 14 | INTEGRITE : DB avant/après (§58) — aucune suppression inattendue | ✔ — push schéma vérifié en base (`rh_contract_versions`, `rh_audit_logs`, `employee_positions.changed_by`) ; aucune ligne existante modifiée/supprimée (lectures pures + INSERT) ; employé jetable nettoyé en `afterAll` ; dates de test futures (2026-10) hors périodes closes |
| 15 | DOCUMENTATION : `DOC/RH/PHASE_R7_HISTORIQUES_TRACABILITE_SNAPSHOTS_2026-09-29.md` (§63) | ✔ — rapport complet écrit (19 sections) ; registre à jour ; model doc §7 déroulé implémenté |
| 16 | PREUVES : `audit/r7/*` minimum §64 | ✔ — `r7-preflight.md` (inspection) ; `r7-model.md` (cartho + conception + déroulé) ; commandes/counts dans rapport §2 et registre ; sorties tests 14/14 + 16/16 + 527/529 consignées |
| 17 | GATE technique + fonctionnelle + métier (§66-68) + graphify update | ✔ — technique ✔ (tests verts, tsc R7 0 erreur, graphify update exécuté 11402 nœuds/31528 arêtes) ; **validation utilisateur du 29/09 = R7 VALIDE** (points de transparence TEST_SNAPSHOT partiel + TEST_UI N/A acceptés) |
| 18 | **STOP : R7 = VALIDE ou REPRISE ; ne PAS commencer R8** | ✔ — **PHASE R7 = VALIDÉE le 2026-09-29 (validation utilisateur)** ; R8 et R9 non commencés (hors périmètre) |

> **Note GATE — 2026-09-29** : 16/18 critères atteints, puis **validation utilisateur → R7 = VALIDE, ligne 18 marquée STOP ✔**. Points de transparence GATE : TEST_SNAPSHOT partiel (no écriture R7 sur les snapshots immuables — invariant P13 préservé) ; TEST_UI N/A documenté (aucune surface UI en R7). R8 et R9 **non commencés**.
## PHASE R8 - NAVIGATION / UX / COHERENCE - ouverte le 2026-09-29 — CLÔTURÉE : VALIDÉE le 2026-09-30

> **Phase active : R8 - navigation / UX / cohérence transverse du module RH** (instruction utilisateur 29/09,
> MASTER TASK R8). Objectif : consolider la navigation et la cohérence à partir des fonctionnalités
> RÉELLEMENT existantes (R1-R7) - ne pas refaire les domaines précédents. Principe directeur :
> UN DOSSIER, UNE HISTOIRE, UNE SOURCE DE VÉRITÉ. La fiche employé devient un hub contextuel.
> **Périmètre exclu : R9, nouveau moteur paie/présence/avances, refonte R6/R7, refonte graphique, schéma DB.**
> Séquence stricte : PLANIFIER → INSPECTER → CARTOGRAPHIER → CONCEVOIR → IMPLÉMENTER →
> TESTER TECHNIQUEMENT → TESTER FONCTIONNELLEMENT → VÉRIFIER NAVIGATEUR → VÉRIFIER COHÉRENCE DONNÉES →
> DOCUMENTER → GATE → STOP.

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R8 seul, R9 interdit |
| 2 | INSPECTION §1 : navigation, écrans réels, routes mortes/dupliquées, contexte employé, filtres, permissions | ✔ — 20 routes réelles ; avances/historique = onglets de fiche ; ?employeId ignoré par situation, contrats/doc liste ; rh.discipline.consulter absent socle |
| 3 | CARTOGRAPHIE §20 : matrice Fonction\|Route\|Menu\|Deep-link\|Contexte\|Perm UI\|Perm API\|Retour\|UX | ✔ — audit/r8/r8-preflight.md §5 |
| 4 | CONCEPTION §2-4 : architecture nav. cible, hub fiche employé, breadcrumbs, conventions employeId | ✔ — audit/r8/r8-model.md (7 conventions) |
| 5 | IMPLEMENTATION §5-9 : liens contextuels, libellés, statuts R6, actions/boutons, états UX | ✔ — socle perms + matrix client, fiche hub (onglets URL-sync + action Situation), employes (URL statut/type, stats cliquables), contrats/doc (liste filtrée + bannière), situation (deep-link R/W + actions Link), KPI dashboard, annuaire |
| 6 | TEST_TECHNIQUE §22 : tests/typecheck/lint/build ; échecs classés BLOQUANT/NON_BLOQUANT/PRÉEXISTANT | ✔ — tsc filtre R8 CLEAN (992 préexistantes, 0 nouvelle) ; vitest 527/529 (2 PRÉEXISTANTS licence-service/stock-engine) |
| 7 | TEST_FONCTIONNEL §21 : scénarios Playwright réels (A-J) | ✔ — 10/10 ✅ (captures audit/r8/fonctionnels/) |
| 8 | TEST_NAVIGATEUR §13 : back/forward/refresh/deep-link/onglet | ✔ — scénarios B, D, I |
| 9 | TEST_PERMISSIONS §12,17 : profils multiples, menu/page/action/API cohérents | ✔ — scenario J (post-sync socle : CSV Registre disciplinaire activé) |
| 10 | TEST_DONNEES §15-16 : périodes, KPI dashboard→écran, tenant isolation | ✔ — scenario A ; périodes/RBAC inchangés |
| 11 | DOCUMENTATION §25 : architecture nav. retenue, conventions, problèmes/corrections/reportées | ✔ — DOC/RH/PHASE_R8_NAVIGATION_UX_COHERENCE_2026-09-30.md + audit/r8/* |
| 12 | PREUVES §27 : rapports inspection/implémentation/test + matrice ✅/⚠️/❌ (audit/r8/*) | ✔ — r8-preflight, r8-implementation, r8-model, 14 captures PNG |
| 13 | NON_REGRESSION §23 : R1-R7 vérifiés (aucune régression métier liée à l'UX) | ✔ — 527/529 = baseline R7 ; suites RH vertes |
| 14 | GATE R8 §26 (25 points) + graphify update | ✔ — 25/25 ; graphify update . exécuté |
| 15 | **STOP §28 : R8 = VALIDE ou REPRISE ; ne PAS commencer R9** | ✔ — **R8 = VALIDE** (décision utilisateur 30/09) ; STOP : R9 non commencé |

> **Note R8** : toute anomalie hors périmètre est ANOMALIE → CLASSÉE → DOCUMENTÉE → REPORTÉE (backlog),
> sauf si elle bloque un parcours critique R8 (alors corrigée avec justification). Tests réalisés sur DB locale.

## PHASE R9 - RAPPORTS / ÉTATS / EXPORTS / IMPRESSION - ouverte le 2026-09-30

> **Phase active : R9 - rapports / états / exports / impression du module RH** (MASTER PROMPT R9).
> Objectif : permettre à un utilisateur autorisé de transformer les données RH validées (R1-R8) en états
> exploitables (écran / impression / PDF / Excel), avec filtres, sélection, ordre, colonnes, prévisualisation.
> Principe directeur : UN DOSSIER, UNE HISTOIRE, UNE SOURCE DE VÉRITÉ. Les rapports CONSOMMENT les sources
> de vérité existantes — PAS de nouveau moteur métier, PAS de duplication, PAS de recalcul caché.
> **Périmètre exclu : nouveau moteur paie/présence/avances, refonte R6/R7, schéma DB.**
> Séquence stricte : PLANIFIER → INSPECTER → CARTOGRAPHIER → CONCEVOIR → IMPLÉMENTER →
> TESTER TECHNIQUEMENT → TESTER FONCTIONNELLEMENT → VÉRIFIER NAVIGATEUR → VÉRIFIER DONNÉES →
> VÉRIFIER EXPORTS → VÉRIFIER IMPRESSION → DOCUMENTER → GATE → STOP.

| # | Critère | Statut |
|---|---|---|
| 1 | PLANIFIER : périmètre, todo, registre phase active | ✔ — R9 seul, FINAL interdit |
| 2 | INSPECTION §2 : rapports, états RH, exports, CSV/PDF/Excel/impression, bulletins, générateurs, routes doublons | ⏳ |
| 3 | CARTOGRAPHIE §3 : matrice Rapport\|Source\|Filtres\|Colonnes\|Tri\|UI\|PDF\|Excel\|Impression\|Permission\|Statut | ⏳ |
| 4 | CONCEPTION §4-10,27,28 : architecture cible rapports, builder, colonnes, tri, pagination, période | ⏳ |
| 5 | IMPLEMENTATION §11-18 : rapports Personnel/Présences/Paie/Avances/Historique + exports PDF/Excel + print CSS | ⏳ |
| 6 | TEST_TECHNIQUE §37 : typecheck/lint/tests ; échecs classés | ⏳ |
| 7 | TEST_FONCTIONNEL §29 : Playwright réels A-J | ⏳ |
| 8 | TEST_NAVIGATEUR §16-17 : print réel A4, suppression nav, tableaux multipages | ⏳ |
| 9 | TEST_PERMISSIONS §20 : données sensibles, API d'export sécurisée (tenant+perm+périmètre+ids+colonnes) | ⏳ |
| 10 | TEST_DONNEES §6,21,31 : périodes clôturées, 01/09→30/09≠01/10, tenant isolation, fidélité DB/API/UI/export | ⏳ |
| 11 | TEST_EXPORTS §30,32,33 : ouverture réelle fichiers, types cellules, ordre colonnes, états vides §24, erreurs §25 | ⏳ |
| 12 | DOCUMENTATION §36 : catalogue rapports, routes, API, perms, formats, conventions, états vides, sensibilité | ⏳ |
| 13 | PREUVES §39 : rapport final (inventaire/modifs/matrice/tests/playwright/exports/sécurité/non-régression) | ⏳ |
| 14 | NON_REGRESSION §38 : R1-R8 vérifiés (aucune régression métier liée aux exports) ; exports = consultation pure §13 | ⏳ |
| 15 | GATE R9 §37/38 + graphify update | ⏳ |
| 16 | **STOP §40 : R9 = VALIDE ou REPRISE ; ne PAS commencer le FINAL automatiquement** | ⏳ |
