# PHASE R6 — CYCLE DE VIE RH / SITUATIONS / SUSPENSIONS / ABSENCES /
# MISES À PIED / SORTIES / RÉEMBAUCHES — CONCEPTION V2 — 2026-09-29

STATUT : **CONCEPTION — EN ATTENTE D'APPROBATION (matrice de vérité §23).**
Aucune implémentation avant validation.

---

## 1. EXPERTISE MOBILISÉE ET CONTRAINTES

La revue réunit : DRH, spécialiste administration du personnel, expert paie,
spécialiste temps & présence, juriste droit du travail camerounais (Code du
travail, loi 92/007 du 14/08/1992), architecte SaaS métier, architecte
PostgreSQL, spécialiste RBAC/audit, UX designer RH, spécialiste workflow.

Contraintes de compatibilité :
- **GPJ** : garage PME camerounaise, main-d'œuvre mixte permanente/temporaire,
  mode paie horaire prédominant (import pointages réels : 15 employés, salaire
  horaire) ; cycle de travail 07:30→18:00 lun-sam.
- **AtelierOne** : multi-tenant (`agenceId`), monorepo pnpm, Next.js + tRPC +
  Drizzle, modules RH existants (rh.ts, rh-leave, rh-discipline, rh-payroll,
  rh-situation, rh-presence, rh-stats, rh-dashboard).
- **R3** : présence/temps — source temporelle du pointage (`attendance_entries`,
  `attendance_calculations`, `attendance_monthly_summaries`, projection).
- **R4** : paie — moteur unique (`payroll-engine.ts`, `prepareMonth`).
- **R5** : avances — workflow transactionnel + journal (`advance_transitions`).

Contrainte absolue de conception : **ne pas transformer le champ `statut` en une
liste interminable de valeurs.** Une situation datée remplace tout statut
« maladie », « congé », « mise à pied », « absence », « maternité ».

---

## 2. RÈGLE FONDAMENTALE — SÉPARATION DES 8 DIMENSIONS

| Dimension | Support | Contenu |
|---|---|---|
| A. Statut administratif | `employes.statut` (4 valeurs) | état courant d'emploi |
| B. Événement / situation RH | `employee_situations` (nouvelle, datée) | quoi, de quand à quand |
| C. Effet contrat | impact `impact_contrat` | ACTIVE / SUSPENDU / TERMINE |
| D. Effet présence | impact `impact_presence` | pointage/projection R3 |
| E. Effet planning | impact `impact_planning` | planification postes |
| F. Effet paie | impact `impact_paie` + mode de calcul | politique de rémunération |
| G. Effet accès | `utilisateurs` + règles accès/pointage | logiciel + garage |
| H. Workflow | `statut_workflow` + `situation_transitions` | validation |

La situation portée par **B** est l'objet de premier niveau ; tous les impacts
**C→G** sont des colonnes calculables/mapées de cet objet, jamais des statuts.

---

## 3. STATUT ADMINISTRATIF — ENSEMBLE LIMITÉ (DÉCISION D-R6-01)

Valeurs réelles vérifiées dans le code (rh-labels.ts, rh.ts Zod, DB varchar libres) :
`actif`, `conge`, `suspendu`, `archive`, `sorti`.

**Décision :** le statut administratif passe à **4 valeurs** :

| Valeur | Règle |
|---|---|
| `actif` | état normal ; posé par `create`, `reembaucher`, fin d'une situation sans effet contrat suspensif |
| `suspendu` | **état dérivé** : posé/fin par le moteur quand une situation de catégorie SUSPENSION avec `impact_contrat=SUSPENDU` est ouverte/close. **N'est plus modifiable en direct** (retiré du sélecteur). Le moteur écrit aussi `employee_status_history` (avril→avant/après) en conservant l'intervalle (date_début réaliste = `date_effet` de la situation, pas « today »). |
| `sorti` | posé uniquement par `sortir` (transition dédiée, garde exacte) |
| `archive` | archivage ne touchant pas la paie active ; garde : interdit si avance impayée ou situation ouverte |

**`conge` comme statut : DEPRECIÉ.** Les congés deviennent des situations datées
(catégorie CONGÉ). Lecture historique conservée (labels, `employee_status_history`
gardés intacts) ; le sélecteur n'offre plus `conge` ; aucun nouvel écrit.
`rh-stats-engine` calculera `enConge` depuis les situations (pas depuis statut).
Correctif d'orthographe : `"archivé"` → `"archive"` dans `rh-situation-engine.ts:786`.

**INTERDIT** d'ajouter une valeur de statut pour une situation datée.

---

## 4. CATALOGUE DES SITUATIONS RH (DÉCISION D-R6-02)

Une seule table générique datée portant le **catalogue hiérarchique**. Chaque
situation appartient à une catégorie puis un type/sous-type ; les règles
juridiques ne sont jamais codées à l'aveugle (source LOI / POLITIQUE GPJ /
CONFIGURATION documentée — voir `R6_MATRICE_REGLES_CAMEROUN.md`).

| Catégorie | Types / sous-types |
|---|---|
| `ABSENCE` | ABSENCE_INJUSTIFIEE, ABSENCE_AUTORISEE, PERMISSION_EXCEPTIONNELLE |
| `CONGE` | CONGE_ANNUEL, CONGE_SANS_SOLDE, CONGE_EDUCATION (art. 91), CONGE_FORMATION |
| `MALADIE` | MALADIE (art. 32-c) |
| `ACCIDENT_TRAVAIL` | ACCIDENT_TRAVAIL, MALADIE_PROFESSIONNELLE (art. 32-g) |
| `MATERNITE` | MATERNITE (art. 84) |
| `DISCIPLINAIRE` | MISE_A_PIED (art. 30), MISE_A_PIED_CONSERVATOIRE |
| `SUSPENSION` | AUTRE_CAUSE_LEGALE (art. 32 : service militaire, fonctions publiques, garde à vue, suivi conjoint), CHOMAGE_TECHNIQUE (art. 32-2) |
| `SORTIE` | sortie (via transition dédiée, voir §17) |
| `AUTRE` | relevés libres |

Le catalogue est **configurable** (table `hr_situation_types` paramétrable) avec
des valeurs pré-ensemencées conformes au droit ; aucun type ne pioche dans le
statut.

---

## 5. MISE À PIED — ÉVÉNEMENT DISCIPLINAIRE DATÉ (DÉCISION D-R6-03)

Traitée comme une situation de catégorie `DISCIPLINAIRE`, **jamais** réduite à
`statut = suspendu`. Champs dédiés : `date_debut`, `date_fin`, `duree_jours`,
`motif`, `fait_reproche`, `notification_ecrite`, `notification_at`,
`communication_inspection` (bool + date), `acteur`, `validation`, `preuve`,
`impact_paie`, historique.

**Garde-fous juridiques durs (art. 30) :**
1. `duree_jours ≤ 8 jours ouvrables`, fixée au moment du prononcé (30-3-a) ;
2. notification écrite avec motifs **obligatoire** avant activation (30-3-b) ;
3. communication à l'inspection du travail **dans les 48 h** (30-3-c) — bloquante
   si absente (alerte + blocage selon politique GPJ) ;
4. **interdiction des amendes** (30-1) : `details_financiers` de la MAP est
   interdit hors retenue strictement proportionnelle aux jours non prestés ;
   un montant forfaitaire « punitif » est refusé par le moteur.

Effet paie : `RETENUE` (prorata des jours MAP, delimitée par les jours non
prestés — pas au-delà). Impact présence : `POINTAGE_INTERDIT` + jours
retranches des calculs R3. Impact planning : `BLOQUE`. Impact contrat :
`SUSPENDU`. Impact accès : pointage/opérations restreints pendant la période,
compte login conservé (lecture) — révocable par politique GPJ.

---

## 6. IMPACT PAIE — POLITIQUE STRUCTURÉE (DÉCISION D-R6-04)

**Jamais `suspension = salaire 0` codée en dur.** Chaque situation porte une
politique d'impact explicite :

| `impact_paie` | Règle | Exemples |
|---|---|---|
| `NORMAL` | paie inchangée | congé annuel |
| `MAINTIEN_REMUNERATION` | salaire maintenu, jours comptés | congé annuel payé, permission payée (POL) |
| `RETENUE` | retranchement des jours non prestés | mise à pied (art. 30), absence injustifiée **dans la limite des jours absents** |
| `NON_REMUNERE` | aucun paiement sur la période | congé sans solde, chômage technique |
| `PARTIEL` | prorata / période partielle | sortie en milieu de mois, maladie avec maintien partiel (POL) |
| `INDEMNISATION_EXTERNE` | salaire remplacé par prestation externe | AT/MP, maternité (CNPS) |
| `A_DETERMINER` | requiert décision humaine avant clôture | chômage technique sans arrêté |
| `MANUEL` | montant saisi, preuve jointe | cas légal singulier |

Champ `mode_calcul_paie` (PRORATA_JOURS / PRORATA_HEURES / FIXE / SANS) +
`base_calcul` et `validation_requise` (bool). **R4 reste le moteur de paie** :
`prepareMonth` consomme les situations via une projection `impact_paie` par
employé/période (remplace l'actuel binaire `statut="suspendu"` + `suspensionStart`,
voir §20). Traitement identique des 5 modes de paie (mensuel, horaire, forfait,
journalier, non rémunéré).

---

## 7. IMPACT PRÉSENCE (DÉCISION D-R6-05)

Enums : `POINTAGE_AUTORISE`, `POINTAGE_INTERDIT`, `PRESENCE`, `ABSENCE`,
`CONGE`, `SUSPENSION`, `NON_COMPTABLE`.

Règle : impact `SUSPENSION`/`POINTAGE_INTERDIT` → jours retirés du calcul R3
(`attendance_calculations` non générés, ou marques `is_absent=false` + code
`SUSP` si conservés) ; impact `CONGE` → projection existante (R3) ;
`ABSENCE` → absent (code A) si sans pointage réel. Chaque règle est testée
contre les bill of R3 (134 j / 1114,6 h / 45,6 %).

Rappel R6-v1 (conservé) : un congé projeté **n'écrase jamais** une entrée
pointée réelle (`markLeaveOnAttendance`) ; un férié (`hr_public_holidays`)
n'est jamais projeté.

---

## 8. IMPACT PLANNING (DÉCISION D-R6-06)

Enums : `PLANIFIE`, `NON_PLANIFIABLE`, `ABSENT`, `BLOQUE`, `AUTRE`.

Une situation peut bloquer l'affectation planning sur son intervalle
(`BLOQUE` pour mise à pied) sans supprimer l'historique planning
(aucun DELETE ; désaffectation par date via marquage). `PlanningRH.tsx:82`
sort du périmètre (déjà exclu).

---

## 9. IMPACT CONTRAT (DÉCISION D-R6-07)

Enums : `ACTIVE`, `SUSPENDU`, `TERMINE`.

- Situations temporaires (maladie, maternité, MAP, chômage technique) →
  `SUSPENDU` **de contrat**, sans changer le statut administratif si rien ne
  le justifie (congés/absences → `ACTIVE`, contrat non suspendu).
- `SORTIE` → `TERMINE`.
- Le moteur dérive le statut administratif `suspendu` uniquement si
  `impact_contrat ∈ {SUSPENDU, TERMINE}`.

---

## 10. IMPACT ACCÈS (DÉCISION D-R6-08)

| Situation | Compte logiciel | Pointage | Opérations garage |
|---|---|---|---|
| Congé annuel / sans solde | actif | interdit (projection) | normal |
| Maladie / AT / maternité | actif (lecture) | interdit | normal |
| Mise à pied | actif en lecture (POL) / paralysé si durci | **interdit** | **restreintes** |
| Absence injustifiée | actif | pointage réel conservé | normal |
| Sortie | **désactivé** (`isActive=false`), **jamais supprimé** | interdit | interdit |
| Archive | désactivé | interdit | interdit |
| Réembauche | réactivé (`isActive=true`) | autorisé | autorisé |

Réglé par politique GPJ `CFG` (durcissement possible de la mise à pied).
Aucune suppression de compte utilisateur sans règle (sortie/archive → `isActive=false`
conservant la ligne et le lien `employes.userId`).

---

## 11. ÉVÉNEMENT RH GÉNÉRIQUE — MODÈLE (DÉCISION D-R6-09)

Nouvelle table unique **`employee_situations`** (multi-tenant, `agenceId`) :

```
id, agence_id, employee_id (FK, cascade)
category, type, sub_type
date_debut, date_fin (NULL = ouverte), date_effet (défaut = date_debut)
motif (text), fait_reproche (text, MAP), commentaire, justificatif_url
notification_ecrite, notification_at, communication_inspection, communication_inspection_at
impact_contrat, impact_presence, impact_planning, impact_paie
mode_calcul_paie, base_calcul_paie, validation_requise
statut_workflow (BROUILLON|SOUMIS|EN_ATTENTE|APPROUVE|REFUSE|ACTIF|TERMINE|ANNULE)
approbation_requise, approbateur_id, approuve_at
provenance_table, provenance_id   -- pont lecture absences/sanctions/leave_requests
created_by, created_at, updated_at
```

Justification d'une **nouvelle table** (l'existant ne peut PAS porter le modèle) :
`absences`, `sanctions`, `leaveRequests` sont trois silos hétérogènes, sans
impact contrat/présence/planning/paie/accès ni machine à workflow ni tenant ;
les forcer ou les fusionner serait plus invasif et plus risqué que cette table
normalisée unique, alignée sur les patterns R5 (`advance_transitions`).
Une colonne de provenance permet la lecture conjointe avec l'existant **sans
réécrire l'historique**. Tables secondaires :
- `employee_situation_transitions` (journal workflow avant/après/acteur/motif — pattern R5),
- `hr_situation_types` (catalogue paramétrable : catégorie/type/sous-type +
  impacts par défaut + source de la règle LOI/POL/CFG + garde-fous).

---

## 12. WORKFLOW (DÉCISION D-R6-10)

États : `BROUILLON → SOUMIS → EN_ATTENTE → APPROUVE → ACTIF → TERMINE`
(plus `REFUSE`, `ANNULE`). Tous les états sont écrits en base (historique

via `employee_situation_transitions`). Le workflow est **par catégorie** :

| Catégorie | Approbation requise | Activation |
|---|---|---|
| CONGE (annuel, sans solde) | oui (existant leave) | approbation + dates |
| MATERNITE / MALADIE / ACCIDENT_TRAVAIL | oui (justificatif obligatoire) | approbation + dates |
| DISCIPLINAIRE (MAP) | oui (DRH) + garde-fous art. 30 | 3 conditions remplies |
| SUSPENSION (autre cause, chômage technique) | oui | approbation |
| ABSENCE (constat) | constat simple | saisie immédiate (`ACTIF`) |
| SORTIE / ARCHIVE | voir transitions dédiées (§17) | dédiées |

Les congés restent gérés par `rh-leave` (soldes, demandes) ; la situation
`CONGE` est générée à l'approbation d'une demande (provenance
`leave_requests`) pour unifier la lecture — **sans double flux**.

---

## 13. DATES ET SEGMENTATION (DÉCISION D-R6-11)

Toutes les situations sont **temporelles** : `date_debut`/`date_fin`/`date_effet`.
Les moteurs reconstruisent le passé **exclusivement par les dates d'effet**
(interdiction de lire le seul `statut` courant). La timeline employé est la
segmentation :
```
01/09→09/09 ACTIF · 10/09→12/09 MISE_A_PIED · 13/09→19/09 ACTIF · 20/09→ SORTI
```
Le moteur fournit `statutAdministratif(employee, situations, date)` =
fonction pure de la date (tests unitaires dédiés). `employee_status_history`
reste la source des intervalles de statut écrits par les transitions ; les
nouveaux intervalles utilisent `veilleDe(date_effet)` en borne (corrige le trou
identifié `rh.ts:576-581` qui clôt à `today`).

---

## 14. CHEVAUCHEMENTS (DÉCISION D-R6-12)

Matrice de conflit explicite — jamais deux vérités silencieuses :

| Conflit | Résolution |
|---|---|
| présences pointées + congé projeté | pointage **prime** (R3, conservé) |
| présence + maladie / AT | jour = maladie (si certificat) sinon pointage réel |
| absence + congé | congé prioritaire si approuvé, absence sinon |
| MAP + congé | **REFUS** (chevauchement d'intervalles d'impact) |
| MAP + sortie | sortie **prioritaire** (la MAP est close à la date de sortie) |
| suspension + sortie | sortie prioritaire |
| 2 situations d'impact paie sur même intervalle | **REFUS** sauf catégories compatibles (ex. maladie + congé payé) ; sinon **OUVERTURE_D_ANOMALIE** |

Le moteur `situations-engine.conflits()` détecte et le router refuse en
transaction ; tout chevauchement impossible est signalé comme anomalie
(jeton `anomalie` sur la situation), jamais silencieusement résolu.

---

## 15. PÉRIODES CLÔTURÉES (DÉCISION D-R6-13)

Une situation rétroactive ne réécrit **jamais** un mois verrouillé :
- `create/update/annuler` quand l'intervalle recoupe un mois
  `attendance_monthly_summaries.locked = true` (R3) **ou** une période paie
  clôturée (`payroll_periods.status = closed`) → **REFUS** avec message
  (« mois déjà clôturé »), sauf procédure corrective contrôlée (réouverture
  explicite avec permission dédiée + audit) ;
- test spécifique « création rétroactive » (validation `closeMonth` déjà
  protégée par la V1 : `locked` gardé, idempotence).

---

## 16. ABSENCE ≠ CONGÉ ≠ NON POINTÉ ≠ SUSPENSION ≠ MISE À PIED

Quatre concepts distincts, jamais fusionnés :
- `ABSENCE` = situation `ABSENCE`, impact paie retenue bornée, impact présence
  code A si non pointé.
- `CONGE` = situation `CONGE` (ou leave approuvé), projection congé R3,
  maintien ou non selon type.
- `NON_POINTÉ` = état de fait R3 (absence d'`attendance_calculations`) —
  **muet**, ni absence ni congé.
- `SUSPENSION` = impact contrat `SUSPENDU` (maladie, MAP, chômage, causes
  légales) — retiré du calcul, jamais « absent ».
- `MISE_A_PIED` = sanction disciplinaire datée (art. 30) avec garde-fous.

R3 reste **la source temporelle unique** des heures ; les situations ne font
que qualifier (projeter/retirer/marquer) des jours définis par R3.

---

## 17. SORTIE — TRANSITION DE CYCLE D'EMPLOI (DÉCISION D-R6-14)

`sortir` (rh.ts:531) étendu en transition formelle :
- date_sortie, motif (6 motifs existants), détail, reembauchable, acteur, preuve ;
- fermeture de l'intervalle `employee_status_history` à **`veilleDe(date_sortie)`**
  (correction du trou à `today`) et de `employee_positions` idem ;
- insertion `statut: "sorti"` + create de la **situation `SORTIE`** (provenance
  `employes`) pour la timeline ;
- `utilisateurs.isActive=false` ; **aucune suppression physique** ni de
  l'employé ni du compte ;
- garde : refus si avance non soldée clôturée en cours ? (RG : la sortie ne
  supprime pas la dette — R5 reste intact, le solde est juste à récupérer via
  paie) ; ajout d'une **permission dédiée `rh.employe.sortie`** (voir §19/§28).

## 18. RÉEMBAUCHE — NOUVEL ÉPISODE (DÉCISION D-R6-15)

`reembaucher` (rh.ts:621) :
- conserve **intégralement** la trace de sortie (motifSortie, detailMotifSortie,
  sortieChangedBy/At — jamais effacés, cf. D1 V1) ;
- ferme l'intervalle `sorti` à `veilleDe(date_reembauche)` et ouvre
  `actif` au `date_reembauche` → **nouvel épisode d'emploi** (reconstruction
  possible par les intervalles, pas de table « épisodes » dédiée) ;
- nouveau salaire éventuel via `employee_salary_history` (jamais écrasé) ;
- create/close de situations générées (provenance) si besoin ;
- `utilisateurs.isActive=true` ;
- garde : `statut === "sorti" && reembauchable !== false` (conservé),
  nouvelle permission `rh.employe.reembauche`.
- UI : la case « Réembauchable » devient pilotée par l'état React (corrige
  `defaultChecked`, `EmployeeDetail.tsx:1027-1032`) + avertissement de
  réactivation du compte.

---

## 19. USER / ACCÈS (DÉCISION D-R6-16)

- Sortie/archive : `isActive=false`, jamais DELETE ;
- MAP/suspension : compte conservé, restrictions selon §10 ;
- congruence RBAC : les permissions dédiées ajoutées (`rh.situation.consulter`,
  `rh.situation.modifier`, `rh.employe.sortie`, `rh.employe.reembauche`) sont
  intégrées aux groupes existants (`RH_CONSULTATION`, `RH_ECRITURE`,
  superadmin) pour ne **jamais** casser un rôle existant ;
- le middleware `trpc.ts` court-circuite superadmin (inchangé).

---

## 20. PAIE — R6 FOURNIT LES ÉVÉNEMENTS, R4 CALCULE (DÉCISION D-R6-17)

Pas de deuxième moteur de paie. Remplacement du modèle « un seul champ
`statut=suspendu` + `suspensionStart` » (`payroll-engine.ts:199`,
`rh-situation.ts:490-507`, `rh-payroll.ts:315-444`) par :
- une lecture des situations open/par période (tenant) + map `employeeId →
  {impactPaie, modeCalcul, baseCalcul, dateDebut, dateFin}` ;
- `payroll-engine.regimeSituationPeriode(...)` — fonction pure (remplace
  `regimeSuspensionEnPeriode`) : couvre `aucun | maintien | retenue | partiel |
  non_remunere | externe | a_determiner | manuel` ;
- le prorata R4 existant (`calculerProrata`, `veilleDe`, `baseEffectifPeriode`)
  reste inchangé et est alimenté par ces données ;
- `rh-situation-engine` consomme les mêmes données (aucune divergence) ;
- scénarios : par **mode de paie** (mensuel, horaire, forfait, journalier,
  NON_REMUNERE) × impact (sans/partiel/total/à déterminer) — §22.

---

## 21. SCÉNARIOS OBLIGATOIRES (CONFIRMATION)

1. absence injustifiée · 2. absence autorisée · 3. congé annuel · 4. congé
sans solde · 5. maladie · 6. accident du travail · 7. maternité · 8. mise à
pied disciplinaire (avec garde-fous art. 30) · 9. suspension (autre cause
légale) · 10. chômage technique · 11. suspension terminée / reprise ·
12. sortie · 13. sortie en milieu de mois · 14. réembauche ·
15. suspension → reprise (statut dérivé) · 16. actif → congé → actif ·
17. actif → suspendu → actif · 18. actif → sorti → réembauche.

## 22. SCÉNARIOS PAIE (PAR MODE DE PAIE)

× {SALAIRE_MENSUEL, SALAIRE_HORAIRE, FORFAIT, JOURNALIER, NON_REMUNERE} :
événement sans impact / partiel (prorata avant date_effet) / total (aucun
bulletin) / A_DETERMINER (bloquant à la clôture). R4 reste cohérent
(bulletins, nets, prorata).

## 23. MATRICE DE VÉRITÉ — À APPOUVER AVANT IMPLÉMENTATION

| Situation | Statut admin | Contrat | Pointage | Présence | Planning | Paie | Accès | Validation |
|---|---|---|---|---|---|---|---|---|
| Actif (normal) | actif | ACTIVE | autorisé | réelle (R3) | PLANIFIE | NORMAL | complet | — |
| Congé annuel | actif | ACTIVE | interdit | CONGE (proj) | NON_PLANIFIABLE | MAINTIEN | compte actif | approbation congé |
| Congé sans solde | actif | ACTIVE | interdit | CONGE (proj) | NON_PLANIFIABLE | NON_REMUNERE | compte actif | approbation |
| Permission exceptionnelle | actif | ACTIVE | interdit | CONGE (proj) | NON_PLANIFIABLE | CFG | compte actif | approbation |
| Absence autorisée | actif | ACTIVE | autorisé | réelle | PLANIFIE | CFG | compte actif | constat + approbation GPJ |
| Absence injustifiée | actif | ACTIVE | pointage réel | A (si non pointé) | ABSENT | RETENUE (bornée) | compte actif | constat RH |
| Maladie (constatée) | suspendu* | SUSPENDU | interdit | SUSPENSION | BLOQUE | CNPS/maintien POL | compte actif | approbation + certificat |
| Acc. travail / MP | suspendu* | SUSPENDU | interdit | SUSPENSION | BLOQUE | INDEMNISATION_EXTERNE | compte actif | approbation + certificat AT/MP |
| Maternité | suspendu* | SUSPENDU | interdit | SUSPENSION | BLOQUE | INDEMNISATION_EXTERNE + complément POL | compte actif | approbation + certificat |
| Mise à pied disciplinaire | suspendu** | SUSPENDU | interdit | SUSPENSION | BLOQUE | RETENUE (≤8 j ouvrables, bornée) | restreint | DRH + notif écrite + inspection 48 h |
| Mise à pied conservatoire | suspendu** | SUSPENDU | interdit | SUSPENSION | BLOQUE | A_DETERMINER | restreint | DRH |
| Autre suspension (art. 32) | suspendu* | SUSPENDU | interdit | SUSPENSION | BLOQUE | NON_REMUNERE / externe (CFG) | compte actif | approbation + pièce officielle |
| Chômage technique | suspendu* | SUSPENDU | interdit | SUSPENSION | BLOQUE | A_DETERMINER/MANUEL | compte actif | approbation (collective) |
| Sortie | sorti | TERMINE | interdit | bornée par date_sortie | ABSENT | PARTIEL (prorata) + indemnités | compte désactivé | approbation + perms dédiée |
| Réembauche (épisode 2) | actif | ACTIVE | autorisé | réelle | PLANIFIE | NORMAL (nouveau) | compte réactivé | perms dédiée |
| Archive | archive | TERMINE | interdit | non comptée | ABSENT | Aucune | compte désactivé | approbation + garde |

\* statut `suspendu` **dérivé** par le moteur (situation ouverte impact_contrat=SUSPENDU), jamais saisi.
\** `suspendu` dérivé ; la MAP reste une situation DISCIPLINAIRE datée, l'état dérivé n'est pas le modèle.

## 24. MATRICE JURIDIQUE

`DOC/RH/R6_MATRICE_REGLES_CAMEROUN.md` (créée à part) — colonnes : Situation,
Base juridique, Article, Effet contrat, Effet paie, Durée, Justificatif,
Validation, Risque, Source (LOI / CONV / POL / CFG). Les politiques GPJ ne
sont jamais présentées comme légales.

## 25. UI — ACTION CENTRALE « AJOUTER UNE SITUATION RH »

**Pas d'écran à 25 boutons.** Un point d'entrée unique → wizard de
catégorisation :
1. Catégorie (chips) → 2. Type/sous-type → 3. Dates + motif →
4. justificatif (selon type) → 5. impacts calculés (aperçu non modifiable,
   issus de la config) → 6. validation/workflow → 7. toast de confirmation.
Seuls les champs utiles au type sont affichés (fields dynamiques) ;
recherche texte sur la liste (§25) — conforme règle UX (recherche, validation
persistante, toast, états loading/empty/erreur, confirmation destructive).

## 26. UI FICHE EMPLOYÉ

Bloc « CYCLE DE VIE » : **STATUT ACTUEL** (badge) · **SITUATION EN COURS**
(1 ligne, ex. Mise à pied 10/09→12/09) · **CHANGEMENT À VENIR** (situation
future planifiée) · **HISTORIQUE DES SITUATIONS** (liste filtrable). Exemple :
ACTIF / « Situation en cours : Mise à pied 10/09 → 12/09 » / « Prochaine :
Sortie 20/09 ». Bouton « Ajouter une situation RH » sur la fiche.

## 27. TIMELINE EMPLOYÉ

Simple frise verticale par date : `01/01 embauche · 15/05 congé · 10/08 mise à
pied · 18/08 reprise · 20/09 sortie · 01/11 réembauche`. Réutilise
`rh.getHistorique` (V1) enrichi des situations + transitions. Plus utile
qu'une liste de statuts.

## 28. API — MUTATIONS TRANSACTIONNELLES

Nouveau router `rh-situations.ts` (procédures : `list`, `create`, `update`,
`approuver`, `refuser`, `annuler`, `activer`, `terminer`, `listTransitions`,
`listTypes`) —
- **toutes en `db.transaction` + ROLLBACK** sur toute erreur ;
- contrôles : permission (dédiée), tenant (`agenceId`), dates (bornes,
  rétroactivité), conflits (§14), statut (machine workflow §12), périodes
  clôturées (§15) ;
- idempotence : transitions avec `from_status` vérifié (concurrence) ;
- ajout simultané d'une **permission dédiée** et intégration aux groupes RBAC
  existants (compat ascendante) ;
- `sortir` / `reembaucher` (rh.ts) rattachés aux transitions dédiées et
  protégés par `rh.employe.sortie` / `rh.employe.reembauche`.

## 29. AUDIT

- L'audit middleware (`trpc.ts`) enrichi : `entityId` renseigné + option
  `snapshot` (avant/après JSON) sur les mutations RH sensibles ;
- journal métier `employee_situation_transitions` (acteur, avant→après,
  date, motif, document, impact) — pattern R5 ;
- `audit_logs` conserve le tracé global ; jamais de DELETE sur les situations.

## 30. TESTS

- Unitaires : `situations-engine.test.ts` (statutAdministratif, conflits,
  regimeSituationPeriode, génération situations en provenance congés) ;
- Intégration DB : reset + fixtures tenant (pattern `situation-rh-paie-reset`) ;
- API réelle : appels tRPC via tests de terrain existants ;
- Playwright réel : 5 cas finaux (§35) ; RBAC : accès refus/masqué ;
  tenant : isolation agence ; DB avant/après ; période clôturée refus ;
  paie : impacts par mode ; présence : projection R3 conservée.

## 31. NON-RÉGRESSION R3

Rejouer le jeu de référence : **134 jours / 1114,6 h / 45,6 %** + scénarios
d'entrée/sortie de période et projection congé/férié. R3 reste la source
temporelle (aucune requête situation ne modifie `attendance_*` hors règles §7).

## 32. NON-RÉGRESSION R4

Rejouer : **emp21 (mensuel) + forfait + horaire** ; nets et prorata identiques
à la baseline ; les nouveaux impacts paie ne s'appliquent qu'aux situations
créées (aucun historique réécrit).

## 33. NON-RÉGRESSION R5

Rejouer : avance → récupération → report paie. **Une situation RH ne fait
jamais disparaître une avance ni un solde** (la sortie ne supprime pas la
dette ; elle reste à récupérer via la paie R4/R5).

## 34. PERFORMANCE

Chargement par écran : statut courant + situation(s) active(s) + événements de
la période uniquement. Maps `Map<employeeId, …>` (pattern existant), pas de
N+1 ; la timeline est paginée ; aucun recalcul global des situations à chaque
requête.

## 35. TESTS DE CONFIRMATION (PLAYWRIGHT RÉEL)

- CAS 1 : ACTIF → CONGÉ → ACTIF ; CAS 2 : ACTIF → MISE_A_PIED → REPRISE ;
- CAS 3 : ACTIF → SUSPENDU → ACTIF ; CAS 4 : ACTIF → SORTI → RÉEMBAUCHE ;
- CAS 5 : ACTIF → SORTIE EN MILIEU DE MOIS.
Chaque cas vérifie : UI → API → DB → historique → présence → paie → accès →
refresh (persistance). Fixtures dédiées `e2e-r6/`, reset idempotent.

## 36. GATE R6

Cases : statut séparé des situations ✔ / catalogue complet ✔ / absence ✔ /
congé ✔ / maladie ✔ / accident travail ✔ / maternité ✔ / mise à pied ✔ /
autres suspensions ✔ / chômage technique ✔ / sortie ✔ / réembauche ✔ /
workflow ✔ / dates ✔ / segmentation ✔ / conflits ✔ / effet contrat ✔ /
effet présence ✔ / effet planning ✔ / effet paie ✔ / effet accès ✔ /
historique ✔ / justificatifs ✔ / permissions ✔ / tenant ✔ / transactions ✔ /
rollback ✔ / périodes clôturées ✔ / non-régressions R3, R4, R5 ✔ / tests
unitaires ✔ / intégration ✔ / API réelle ✔ / Playwright ✔ / DB avant/après ✔ /
documentation juridique ✔ / matrice métier ✔ / rapport ✔ / preuves ✔ /
registre ✔ / graphify ✔.

**Une seule case critique manquante → REPRISE. Tous les éléments démontrés →
R6 = VALIDE. Puis STOP (R7 interdit sans instruction).**

---

## DÉCISIONS R6-V1 CONSERVÉES (historique/traçabilité)

D1 réembauche conserve la trace de sortie · D2 congé ne détruit pas les heures
pointées + fériés exclus · D3 `closeMonth` ne réécrit pas un mois verrouillé ·
D4 `payroll_item_config_history` + `reason` obligatoire · D5 salaire masqué
sans `rh.salaire.consulter` · D6 récupération d'avance journalisée · D7 motif
de refus/annulation non concaténé · D8 historique unifié `rh.getHistorique` ·
(D9 scoping multi-agence → autre phase).

## RÉCAPITULATIF DES DÉCISIONS R6-V2

| Décision | Résumé |
|---|---|
| D-R6-01 | statut admin = {actif, suspendu, sorti, archive} ; `conge` déprécié ; `suspendu` dérivé |
| D-R6-02 | catalogue situations + table générique `employee_situations` |
| D-R6-03 | mise à pied = situation disciplinaire datée + garde-fous art. 30 (≤8 j, notif écrite, inspection 48 h, pas d'amende) |
| D-R6-04 | politique impact_paie structurée (8 valeurs) — jamais « suspension = 0 » |
| D-R6-05 | impact présence guidé par situation ; R3 source |
| D-R6-06 | impact planning (bloque sans DELETE) |
| D-R6-07 | impact contrat ACTIVE/SUSPENDU/TERMINE |
| D-R6-08 | impact accès par situation ; compte jamais supprimé |
| D-R6-09 | nouveau schéma `employee_situations` (+ transitions + types) avec provenance |
| D-R6-10 | workflow par catégorie + journal transitions |
| D-R6-11 | dates d'effet source de vérité ; correction intervalle sortie (veilleDe) |
| D-R6-12 | matrice de conflits : REFUS/PRIORITE/ANOMALIE |
| D-R6-13 | périodes clôturées protégées (refus ou procédure corrective) |
| D-R6-14 | sortie = transition formelle, aucune suppression |
| D-R6-15 | réembauche = nouvel épisode, trace conservée |
| D-R6-16 | permissions dédiées compat ascendante (RBAC groupes) |
| D-R6-17 | R4 moteur ; R6 événements/paramètres ; suppression du binaire suspendu |
| D-R6-18 | performance : chargement ciblé, Maps, pas de N+1 |

**EN ATTENTE D'APPROBATION :** la matrice de vérité (§23) et les décisions
ci-dessus doivent être validées avant toute implémentation.