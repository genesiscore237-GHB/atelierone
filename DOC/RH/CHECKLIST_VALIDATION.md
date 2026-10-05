# CHECKLIST DE VALIDATION PAR PHASE — MODULE RH (ATELIERONE / GPJ)

> Utilisée à la fin de CHAQUE phase (gate humain) et en pré-ouverture de la suivante. Toute case non cochée = PHASE NON VALIDÉE → STOP, rapport de phase en A_CORRIGER.
> Liens : registre `RH_EXECUTION_REGISTER.md` (lignes) · plan `PHASE_0_PLAN.md` · journal `TEST_JOURNAL.md`.
> **Règle d'autorévision (imposée)** : avant le gate humain, l'agent relit son propre registre et coche individuellement CHAQUE point de chaque ligne de la phase. Sans ce rapport d'autorévision, le gate ne s'ouvre pas.

## A. VALIDATION TRANSVERSALE (toutes les phases)

| # | Contrôle | Comment faire | Oui/Non |
|---|---|---|---|
| G1 | Toutes les lignes de la phase = TERMINE puis VALIDE | Registre, statuts | |
| G2 | Aucune ligne BACKLOG sautée / aucun passage BACKLOG→TERMINE | Registre, colonne Date | |
| G3 | Lint + typecheck verts | `pnpm lint` / `pnpm typecheck` (apps/nextjs) | |
| G4 | Tests de référence (T01–T16) re-passés, journal renseigné | `TEST_JOURNAL.md` §2 | |
| G5 | Scénarios métier de la phase exécutés (non-régression incluse) | refs + scénarios A–G | |
| G6 | Zéro régression connue sur la baseline (§5 plan) | re-test T01–T16 | |
| G7 | Effets secondaires contrôlés (appels hors RH impactés : recherche globale, POS, Outillage…) | grep + scénario | |
| G8 | Intégrité des données : aucun DELETE destructif, aucune migration destructive | revue migrations + schéma | |
| G9 | Permissions & multi-tenant sincères sur les zones touchées | re-test T14/T15 + revue gardes | |
| G10 | Toast/invalidation conformes règle UX (AGENTS.md) | revue écrans modifiés | |
| G11 | Aucune anomalie nouvelle non enregistrée dans le registre | revue notes de session | |
| G12 | `graphify update .` exécuté après toute modification de code | commande graphify | |
| G13 | Rapport de phase produit (résumé, preuves, IDs traités, restes) | dossier `DOC/RH/` | |

## B. CHECKLIST PAR PHASE (spécifique)

### PHASE 1 — Avances (P01, P02, F16)
- [x] **Étape 1 Audit de l'existant** : moteur/tables/routers relus, écarts confirmés (aucun code)
- [x] **Étape 2 Conception** : workflow DEMANDE→APPROBATION→VERSEMENT→RÉCUPÉRATION→PARTIELLE→SOLDE→COMPLÈTE→CLÔTURE tracé (statut, date, auteur, montant, solde)
- [x] **Étape 3 UI** : recherche employé · saisie avance · liste existantes (dates, montants, statut, récupéré, solde) · saisie hebdomadaire rapide · règles UX (toast, invalidation, loading/empty/error)
- [x] **Étape 4 API** : `rhAdvances.*` en service, gardes `rh.paie.modifier` (serveur `requirePermissionProcedure`) + agence, consultation `list`/`listRecoveries` ouverte aux rôles RH
- [x] **Étape 5 Intégration paie (P02)** : déduction sur **solde restant réel** (suppression verrou `statut="VERSÉE"` → `inArray(VERSÉE, PARTIELLEMENT)` + `soldeRestant>0`)
- [x] **Étape 6 Tests** — vecteurs obligatoires : 100 000→récup 0→déduction 100 000 ✅ · 100 000→récup 40 000→solde 60 000→paie suivante 60 000 ✅ · 100 000→récup 100 000→paie 0 ✅
- [x] **Intégrité** : avances multiples ✅ · 2 avances même semaine ✅ · annulée ✅ · partielle ✅ · reportée ✅ · période suivante ✅ · sorti avec dette ✅
- [x] T06/T17 : bulletin = base − récupérations ; pas de déduction double (persistance idempotente `advanceId+payrollEntryId` + verrou re-run)
- [ ] **Étape 7 Gate** (interdiction P2 si échec) : saisissable ✅ · retrouvable ✅ · récup partielle juste ✅ · pas de double déduction ✅ · solde traçable ✅ · tests verts ✅ — **gate humain en attente**
- [x] **Autorévision** : UI ✅ API ✅ DB ✅ workflow ✅ récupération ✅ récup partielle ✅ solde ✅ report ✅ annulation ✅ paie ✅ sortie salarié ✅ permissions ✅ historique ✅ tests ✅ non-régression ✅

### PHASE 2 — Paie, périodes et calculs (P05, P14, N03, N07, N08, N09, N10, N20 pre-step, P13 pre-conception)
- [ ] **Borne clôture (P05)** : `monthStart` inclus / `monthEnd` exclusif — test 30/09 inclus, 01/10 exclu
- [ ] **Table de correspondance canonique des modes** : NON_REMUNERE, FORFAIT_HEBDOMADAIRE, SALAIRE_MENSUEL, SALAIRE_HORAIRE, JOURNALIER, COMMISSION — « journalier » ne tombe plus dans « mensuel » (P14/N20)
- [ ] Forfait hebdomadaire : semaine définie sur périodes réelles, pas 5 semaines automatiques (N08)
- [ ] Heures standard : paramètre de référence, calcul réel, fallback incohérent éliminé (N09)
- [ ] Ordre clôture → préparation → paiement verrouillé (N10) ; `markPaid` post-clôture + agence + tracée (N03)
- [ ] **Snapshot bulletin (pré-conception, exécution P13 en Phase 6)** : stratégie d'historisation définie, régénération n'efface pas l'ancienne situation
- [ ] Dénominateur prime présence unifié y compris fériés (N07)
- [ ] **Tests des 11 cas** : mensuel · horaire · journalier · forfait · non rémunéré · sortie en cours de mois · changement salaire · avance · absence · retard · HS
- [ ] Par formule : test normal · cas limite · test de période · test de sortie · test de non-régression (T04/T08)

### PHASE 3 — Sécurité / multi-tenant / permissions / validation (P03, P09, P10, P11, P16-durcir, P17, P18, N01, N02, N18, N19)
- [x] **Audit agence procédure par procédure** : `rhPosture.now/pointer/journee/salaireIntervalle`, `rhDiscipline.*`, `rhDocuments.*`, `rhLeave.*`, `rhPayroll.*`, `rhCompetences.*` — scope + 404 posés (N01)
- [x] `rhPosture.now` filtré agence + salaire masqué (P03)
- [x] **Permissions séparées consulter / modifier / valider / exporter / imprimer** — masquage UI seul INTERDIT : gardes serveur posées sur toutes les mutations activées (Phase 3 active), y compris durcissement P16
- [ ] `getFiche` masquée sans `rh.salaire.consulter` (P09) ; PDF bulletin + exports sensibles gardés serveur (P10/P11) — **BACKLOG (non actifs)**
- [x] **Test cross-tenant** : helper `assertEmployeEnAgence` vitest 4/4 (N01) — lecture/mutation hors agence = NOT_FOUND ; T15 tRPC multi-milieux complet à la Phase 4 (selon BACKLOG N19)
- [ ] T14 : rôles opérationnels = lecture RH (N02) ; recherche globale sans fuite (P18) ; validation dure (N19) — **BACKLOG (non actifs)**
- [x] Purge/durcissement des procédures mortes sans RIP (P16) ; note `governance.invite` (N18) — durcissement fait, **note N18 à écrire (BACKLOG)**
- [x] **Gating bouton Modifier** (P17) : `hasPermission("rh.employe.modifier")` sur `EmployeesPageClient.tsx`

### PHASE 4 — Présences / absences / temps (P06, P07, P08, P15, N04, N06, N17 + analyse de période)
- [ ] (P05 traité en Phase 2 — re-test borne ici)
- [ ] **Analyse de période** : entrées date début/fin + employé(s) ; sorties jours théoriques, présents, absences, congés, heures théoriques/réelles, retards, retard cumulé, départs anticipés, HS, anomalies
- [ ] **Jour sans événement** : état explicite (absence / non pointé / hors période / repos / congé) — jamais « présence » par défaut (P08)
- [ ] `daysOnLeave` réel et cohérent présence/absence/paie/export (P06)
- [ ] KPI : dénominateur × effectif, jours ouvrés, fériés — définition unique partout (P07)
- [ ] Jours congé reclassés selon décision produit (N06) ; `getBalances` pur + `decideRequest` tracé (P15/N04) ; décision absences simples (N17)
- [ ] **Gate manuel** : dossier EMP001 01/09→30/09 — jours présents, absences, heures réelles, retards, HS, congés vs calcul attendu

### PHASE 5 — Statuts, dossier employé, réembauche, navigation (P12, P04, P19, N11, N12, N20, F04, F05)
- [ ] Pour chaque statut (actif/congé/suspendu/sorti/archive) : définition, date d'effet, durée, impact présence/paie/planning/compte/dashboard documentés (N11)
- [ ] **Action unique CHANGER LE STATUT** : ancien → nouveau, date d'effet, motif, commentaire (P12/F05)
- [ ] Sortie vérifiée : paie, présence, planning, compte, historique, effectif
- [ ] **Réembauche** via `reembauchable` existant, sans doublon employé (N12/F04)
- [ ] **`?employeId=`** lu + contexte ouvert sur toutes les pages cibles — TOUS les liens de la fiche testés (P04)
- [ ] KPIs effectif/masse hors sortis (P19) ; mode commission aligné (N20)
- [ ] **Gate** : même salarié ACTIF→SUSPENDU→ACTIF→SORTI→RÉEMBAUCHE, historique vérifié à chaque transition

### PHASE 6 — Historique / traçabilité (P13, N13 + 5 domaines)
- [ ] Traité **séparément** : 1 bulletins · 2 planning · 3 évaluations · 4 soldes congés · 5 corrections présence
- [ ] Pour chaque domaine : AVANT → MODIFICATION → APRÈS conservé (date, heure, auteur, motif, ancienne valeur, nouvelle valeur)
- [ ] Aucun effacement silencieux (fin DELETE+INSERT sur ces domaines) ; migration non destructive + rollback
- [ ] Reconstitution historique testée (comparaison avant/après en preuve)

### PHASE 7 — UX/UI et navigation (P20, N14 + rationalisation)
- [ ] Architecture cible étudiée (RH → Dashboard, Personnel, Présences & Temps, Congés & Absences, Avances & Rémunérations, Paie, Rapports & États, Paramètres) — **aucun écran fusionné/supprimé sans justification écrite**
- [ ] Fiche employé = centre de gravité, onglets contextuels (Profil, Contrat, Présences, Congés, Avances, Paie, Évaluations, Compétences/Formations, Disciplinaire, Documents, Historique)
- [ ] Libellés FR + devise unifiées (P20) ; cap 100 paginé/signalé (N14)
- [ ] **Parcours testés** : Personnel→fiche→présence / avance / paie / congé / évaluation

### PHASE 8 — Rapports / exports / impression (N15, N16, F25)
- [ ] **Mécanisme commun** : FILTRES → EMPLOYÉS → COLONNES → TRI → APERÇU → PDF → IMPRESSION → EXCEL
- [ ] **8 rapports minimum** : liste employés, présences, absences, retards, avances, paie, congés, contrats
- [ ] Portée : un employé / plusieurs / tous — permissions respectées (T16)
- [ ] **Exemple** : rapport présence septembre (employé, date, arrivée, pause, retour, départ, temps réel, retard, HS, situation)
- [ ] Tests avant STOP

### PHASE 9 — Nettoyage (N05, P16-purge)
- [ ] 34 procédures mortes + doublons purgés ; grep = 0 appel orphelin
- [ ] `rhAdvances` reste vivant (réactivé Phase 1) — non re-purgé
- [ ] Build complet vert après suppression
- [ ] Registre final : 100 % des lignes traitées (VALIDE ou BLOQUÉ documenté)

## C. RAPPORT DE PHASE (modèle)
`Date · Phase n · **Autorévision agent** : [lignes cochées point par point, ex. Phase 1 : UI ✅ API ✅ DB ✅ workflow ✅ récupération ✅ récup partielle ✅ solde ✅ report ✅ annulation ✅ paie ✅ sortie salarié ✅ permissions ✅ historique ✅ tests ✅ non-régression ✅] · Lignes : [IDs passés VALIDE] · Lignes restantes : [IDs] · Preuves : [descriptifs] · Régressions : [0 ou liste] · Décisions produit actées : [liste] · Anomalies nouvelles enregistrées : [IDs] · Demande : ouvrir Phase n+1 (oui/non).`

> **Rappel** : une phase n'est VALIDE qu'après autorévision complète ET gate humain. L'autorévision est faite par l'agent lui-même sur son propre registre.