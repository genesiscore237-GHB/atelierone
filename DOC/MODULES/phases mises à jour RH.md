2. PHASE 0 — GOUVERNANCE ET SÉCURISATION

Je commencerais par là, parce que ton problème n’est pas seulement technique : il faut rendre l’agent contrôlable.

Le rapport identifie notamment une fuite potentielle cross-tenant très sérieuse via rhPosture.now, ainsi que plusieurs lectures sans garde d’agence.

PHASE 0 — GOUVERNANCE D'EXÉCUTION RH

NE CORRIGE PAS ENCORE LES FONCTIONNALITÉS MÉTIER.

Objectif :

mettre en place le mécanisme qui permettra d'exécuter les phases
suivantes sans perte, oubli ou travail incomplet.

1. Créer RH_EXECUTION_REGISTER.md.
2. Importer toutes les anomalies du rapport :
   P01 → P20.
3. Ajouter les fonctionnalités manquantes :
   F16, F25, etc.
4. Ajouter les dépendances entre tâches.
5. Identifier :
   - tâches indépendantes ;
   - tâches bloquantes ;
   - tâches nécessitant migration.
6. Créer un journal des tests.
7. Créer une checklist de validation par phase.
8. Identifier les fonctionnalités actuellement conformes
   qui devront être re-testées après les corrections.

NE MODIFIE PAS LE CODE MÉTIER.

À la fin :

produire :

- registre ;
- graph des dépendances ;
- ordre d'exécution ;
- liste des tests de référence ;
- liste des risques de régression.

STOP.
3. PHASE 1 — AVANCES DE SALAIRE

C'est clairement une phase dédiée à part entière.

Le rapport dit explicitement que le moteur et les tables existent, mais que l'UI est absente et que l'intégration paie est cassée.

Il faut donc ne pas toucher à tout le RH pendant cette phase.

PHASE 1 — AVANCES DE SALAIRE

IDS :
P01
P02
+ fonctionnalités associées aux avances.

OBJECTIF :

rendre les avances réellement utilisables de bout en bout.

ETAPE 1 — AUDIT FINAL DE L'EXISTANT
ETAPE 2 — CONCEPTION
ETAPE 3 — UI
ETAPE 4 — API
ETAPE 5 — INTÉGRATION PAIE
ETAPE 6 — TESTS
ETAPE 7 — GATE

============================================================
WORKFLOW CIBLE
============================================================

DEMANDE
→ APPROBATION
→ VERSEMENT
→ RÉCUPÉRATION
→ RÉCUPÉRATION PARTIELLE
→ SOLDE
→ RÉCUPÉRATION COMPLÈTE
→ CLÔTURE.

Chaque état doit être traçable.

============================================================
UI
============================================================

Créer la fonctionnalité dans le contexte RH approprié,
sans créer inutilement plusieurs écrans.

Il faut pouvoir :

- rechercher un employé ;
- saisir une avance ;
- voir les avances existantes ;
- voir les dates ;
- voir les montants ;
- voir le statut ;
- voir le montant récupéré ;
- voir le solde.

Prévoir la saisie hebdomadaire rapide.

============================================================
PAIE
============================================================

CORRIGER P02.

La paie doit utiliser le solde restant réel.

Elle doit récupérer :

solde restant
et non uniquement :

statut = VERSÉE.

Tester obligatoirement :

100 000
→ récupéré 0
→ déduction 100 000

100 000
→ récupéré 40 000
→ solde 60 000
→ prochaine paie = 60 000

100 000
→ récupéré 100 000
→ prochaine paie = 0.

============================================================
INTÉGRITÉ
============================================================

Tester :

- plusieurs avances ;
- deux avances même semaine ;
- avance annulée ;
- avance partielle ;
- avance reportée ;
- avance sur période suivante ;
- salarié sorti avec dette.

============================================================
GATE
============================================================

INTERDICTION de passer PHASE 2 si :

- une avance ne peut pas être saisie ;
- une avance n'est pas retrouvable ;
- une récupération partielle est mal calculée ;
- une avance est déduite deux fois ;
- le solde n'est pas traçable ;
- les tests ne passent pas.

Mettre à jour le registre.

STOP.
4. PHASE 2 — PAIE, PÉRIODES ET CALCULS

Le rapport révèle ici plusieurs problèmes indépendants : borne de clôture, mode journalier, semaines forfaitaires, heures standard, snapshot bulletin.

Donc surtout : ne pas les corriger tous dans la même fonction sans tests intermédiaires.

PHASE 2 — PAIE ET CALCULS

IDS :
P05
P14
+ anomalies de paie directement dépendantes.

OBJECTIF :

faire de la paie un résultat entièrement reconstructible.

--------------------------------------------------
1. CLÔTURE
--------------------------------------------------

Corriger la borne du mois :

monthStart inclus
monthEnd exclusif

Tester :

30/09 inclus
01/10 exclu.

--------------------------------------------------
2. MODES DE RÉMUNÉRATION
--------------------------------------------------

Auditer puis aligner :

NON_REMUNERE
FORFAIT_HEBDOMADAIRE
SALAIRE_MENSUEL
SALAIRE_HORAIRE
JOURNALIER
COMMISSION

Ne pas accepter que "journalier" tombe par défaut
dans "mensuel".

Créer une table de correspondance canonique.

--------------------------------------------------
3. FORFAIT HEBDOMADAIRE
--------------------------------------------------

Vérifier la logique actuelle.

Un mois de 30 jours ne doit pas être automatiquement traité
comme 5 semaines payables si la règle métier ne le justifie pas.

Définir la logique de semaine selon les périodes réelles.

--------------------------------------------------
4. HEURES STANDARD
--------------------------------------------------

Vérifier :

- paramètre de référence ;
- calcul réel ;
- fallback ;
- heures mensuelles.

Éliminer les valeurs fallback incohérentes.

--------------------------------------------------
5. SNAPSHOT BULLETIN
--------------------------------------------------

Un bulletin validé/payé doit être reconstituable.

NE PAS permettre qu'une régénération DELETE + INSERT
efface implicitement l'ancienne situation.

Créer une stratégie d'historisation/snapshot adaptée.

--------------------------------------------------
6. TESTS
--------------------------------------------------

Tester :

- mensuel ;
- horaire ;
- journalier ;
- forfait ;
- non rémunéré ;
- sortie en cours de mois ;
- changement salaire ;
- avance ;
- absence ;
- retard ;
- HS.

--------------------------------------------------
GATE
--------------------------------------------------

Chaque formule importante doit avoir :

- test normal ;
- cas limite ;
- test de période ;
- test de sortie ;
- test de non-régression.

STOP après validation.
5. PHASE 3 — SÉCURITÉ / MULTI-TENANT / PERMISSIONS

Cette phase doit passer avant les améliorations UX, parce que le rapport identifie une fuite potentielle de salaire inter-agences.

PHASE 3 — SÉCURITÉ RH

IDS :
P03
P09
P10
P11
P16
P17
P18
P19 selon dépendances.

OBJECTIF :

aucune donnée RH sensible ne doit être accessible
hors périmètre autorisé.

--------------------------------------------------
AUDIT AGENCE
--------------------------------------------------

Pour CHAQUE procédure RH :

vérifier agenceId / tenant scope.

Particulièrement :

rhPosture.now
rhPosture.pointer
rhPosture.journee
rhPosture.salaireIntervalle
rhDiscipline.*
rhDocuments.*
rhLeave.*
rhPayroll.*
rhCompetences.*
rhPresence.requestOvertime

--------------------------------------------------
PERMISSIONS
--------------------------------------------------

Séparer :

consulter
modifier
valider
exporter
imprimer

Respecter réellement :

rh.salaire.consulter
rh.presence.consulter
rh.conge.consulter
etc.

Un masquage UI seul est INTERDIT comme mécanisme de sécurité.

--------------------------------------------------
PDF BULLETIN
--------------------------------------------------

Ajouter une garde serveur appropriée.

Même contrôle pour les exports sensibles.

--------------------------------------------------
TESTS CROSS-TENANT
--------------------------------------------------

Créer un test :

Agence A
→ tenter d'accéder à employé Agence B.

Résultat obligatoire :

REFUS.

Tester également :

salaire
présence
bulletin
documents
discipline
compétences.

--------------------------------------------------
GATE
--------------------------------------------------

Aucune fuite inter-agence.

Aucun export sensible sans permission.

STOP.
6. PHASE 4 — PRÉSENCES / ABSENCES / TEMPS

C'est ici qu'on construit enfin la fonctionnalité que tu voulais :

« combien cette personne a réellement travaillé pendant telle période ? »

Le rapport identifie déjà les quatre problèmes essentiels : borne de clôture, daysOnLeave, jours muets et agrégats.

PHASE 4 — PRÉSENCES & TEMPS DE TRAVAIL

IDS :
P05 déjà traité
P06
P07
P08
+ fonctionnalités d'analyse de période.

OBJECTIF :

faire de Présences & Temps un véritable outil RH.

============================================================
ANALYSE DE PÉRIODE
============================================================

Entrées :

date début
date fin
un employé
plusieurs employés
tous les employés.

Sorties :

jours théoriques
jours présents
absences
congés
heures théoriques
heures réelles
retards
retard cumulé
départs anticipés
HS
anomalies.

============================================================
JOUR SANS ÉVÉNEMENT
============================================================

Un jour sans événement ne doit pas disparaître.

Déterminer explicitement :

absence
non pointé
hors période
repos
congé
etc.

NE PAS transformer arbitrairement "pas de ligne"
en présence.

============================================================
CONGÉS
============================================================

daysOnLeave doit être réellement calculé.

Vérifier sa cohérence avec :

- présence ;
- absence ;
- paie ;
- export.

============================================================
KPI
============================================================

Corriger le calcul du taux de présence.

Vérifier :

dénominateur
effectif
jours ouvrés
jours fériés.

Utiliser la même définition partout.

============================================================
GATE
============================================================

Vérifier manuellement plusieurs dossiers.

Exemple :

EMP001
01/09 → 30/09

Produire :

jours présents
absences
heures réelles
retards
HS
congés.

Comparer chaque résultat avec le calcul attendu.

STOP.
7. PHASE 5 — STATUTS ET DOSSIER EMPLOYÉ

C'est ici qu'on résout :

ACTIF / CONGÉ / SUSPENDU / SORTI / ARCHIVE

et les transitions.

Le rapport indique précisément que congé et suspendu sont encore largement décoratifs côté effet métier, alors que sorti est déjà mieux intégré.

PHASE 5 — STATUTS ET PARCOURS EMPLOYÉ

IDS :
P12
F4
F5
P19
+ navigation employé P04.

OBJECTIF :

faire des statuts de véritables états métier.

============================================================
STATUT
============================================================

Pour chaque statut :

- définition ;
- date d'effet ;
- durée éventuelle ;
- impact présence ;
- impact paie ;
- impact planning ;
- impact compte ;
- impact dashboard.

============================================================
CHANGEMENT
============================================================

Créer une action unique :

CHANGER LE STATUT

avec :

ancien statut
nouveau statut
date d'effet
motif
commentaire.

============================================================
SORTIE
============================================================

Vérifier :

paie
présence
planning
compte
historique
effectif.

============================================================
RÉEMBAUCHE
============================================================

Utiliser le champ reembauchable existant.

Créer un véritable parcours de réembauche.

NE PAS créer un doublon employé.

============================================================
FICHE EMPLOYÉ
============================================================

Lire correctement les liens :

?employeId=

Les pages ciblées doivent ouvrir le contexte
du salarié sélectionné.

Tester tous les liens de la fiche.

============================================================
GATE
============================================================

Pour un même salarié :

ACTIF
→ SUSPENDU
→ ACTIF
→ SORTI
→ RÉEMBAUCHE éventuelle.

Vérifier l'historique après chaque événement.

STOP.
8. PHASE 6 — HISTORIQUE ET TRAÇABILITÉ

Le rapport est très clair : certains historiques métier sont encore détruits par DELETE + INSERT, notamment bulletins, planning et évaluations.

PHASE 6 — HISTORIQUE MÉTIER

OBJECTIF :

aucune opération importante ne doit effacer silencieusement
une version antérieure.

Traiter séparément :

1. bulletins ;
2. planning ;
3. évaluations ;
4. soldes congés ;
5. corrections présence.

Pour chaque domaine :

AVANT
→ MODIFICATION
→ APRÈS

Conserver :

date
heure
auteur
motif
ancienne valeur
nouvelle valeur.

Tester la reconstitution historique.

STOP après validation.
9. PHASE 7 — NAVIGATION ET UX

Seulement maintenant.

Le rapport identifie précisément les ruptures : ?employeId mort, avances orphelines, fiche employé incomplète, doublons Documents/Sanctions, etc.

PHASE 7 — UX/UI ET NAVIGATION

OBJECTIF :

ne pas créer davantage d'écrans avant d'avoir rationalisé ceux
qui existent.

Architecture cible à étudier :

RH
├── Dashboard
├── Personnel
├── Présences & Temps
├── Congés & Absences
├── Avances & Rémunérations
├── Paie
├── Rapports & États
└── Paramètres

Fiche employé = centre de gravité.

Onglets contextuels :

Profil
Contrat
Présences
Congés
Avances
Paie
Évaluations
Compétences/Formations
Disciplinaire
Documents
Historique.

NE PAS fusionner ou supprimer aveuglément.

Chaque transformation doit être justifiée.

Tester tous les parcours :

Personnel → fiche → présence
Personnel → fiche → avance
Personnel → fiche → paie
Personnel → fiche → congé
Personnel → fiche → évaluation.

STOP.
10. PHASE 8 — RAPPORTS / EXPORTS / IMPRESSION

Enfin, seulement après que les données soient fiables.

Le rapport confirme actuellement l'absence d'impression RH, de sélection de colonnes et de filtres d'export.

PHASE 8 — RAPPORTS ET ÉTATS RH

Créer un mécanisme commun :

FILTRES
→ EMPLOYÉS
→ COLONNES
→ TRI
→ APERÇU
→ PDF
→ IMPRESSION
→ EXCEL.

Rapports minimum :

1. Liste employés
2. Présences
3. Absences
4. Retards
5. Avances
6. Paie
7. Congés
8. Contrats.

Permettre :

- un employé ;
- plusieurs ;
- tous.

Respecter les permissions.

Exemple :

Rapport présence septembre :

Employé
Date
Arrivée
Pause
Retour
Départ
Temps réel
Retard
HS
Situation.

STOP après tests.
11. Pourquoi cette méthode est beaucoup plus sûre

Le rapport actuel montre que le module possède déjà une base importante : moteurs purs, tables, routers, UI, historique, etc.

Le danger est donc précisément celui que tu as identifié : un agent peut modifier 30 fichiers, obtenir un build vert et pourtant laisser des ruptures fonctionnelles entre les morceaux.

Avec le système ci-dessus, il est obligé de fonctionner comme ceci :

P01
↓
inspection
↓
conception
↓
code
↓
test
↓
scénario
↓
preuve
↓
registre = VALIDE
↓
P02
↓
...

et non :

P01 P02 P03 P04 P05 P06...
↓
400 modifications
↓
"j'ai terminé le module RH"
Le point le plus important

Je ferais même imposer au Super Agent cette règle supplémentaire :

UNE PHASE TERMINÉE DOIT ÊTRE AUDITÉE PAR L’AGENT LUI-MÊME AVANT DE PASSER À LA SUIVANTE.

Autrement dit, à la fin de la phase Avances, par exemple, il doit relire son propre registre et vérifier :

P01
✅ UI
✅ API
✅ DB
✅ workflow
✅ récupération
✅ récupération partielle
✅ solde
✅ report
✅ annulation
✅ paie
✅ sortie salarié
✅ permissions
✅ historique
✅ tests
✅ non-régression

Puis seulement : PHASE 1 = VALIDE.

Le rapport actuel montre que c'est justement ce type de vérification transversale qui manque sur les avances, les statuts, les permissions et les interfaces.