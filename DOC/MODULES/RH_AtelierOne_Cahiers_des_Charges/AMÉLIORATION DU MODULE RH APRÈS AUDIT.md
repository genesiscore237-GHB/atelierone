MISSION

Tu as terminé l'audit lecture seule du module RH du logiciel GPJ / AtelierOne.

Le rapport d'audit transmis constitue maintenant la photographie de référence de l'existant.

Ta mission est maintenant de corriger et améliorer le module RH, mais de manière contrôlée.

IMPORTANT :

NE PAS repartir de zéro.
NE PAS réécrire le module RH.
NE PAS remplacer les moteurs existants s'ils fonctionnent.
NE PAS créer des doublons fonctionnels.
NE PAS multiplier les pages inutilement.

Le principe directeur est :

CONSERVER CE QUI FONCTIONNE
+
CORRIGER CE QUI EST FAUX
+
COMPLÉTER CE QUI MANQUE
+
GARANTIR LA COHÉRENCE TRANSVERSALE.

============================================================
PHASE 0 — VALIDATION DU RAPPORT AVANT CODE
============================================================

Avant toute modification :

1. Relire intégralement le rapport d'audit.
2. Vérifier dans le code actuel les problèmes signalés.
3. Vérifier qu'aucune correction récente ne les a déjà résolus.
4. Identifier les dépendances.
5. Produire une liste de corrections ordonnée P0 → P1 → P2 → P3.

NE MODIFIE PAS ENCORE LE CODE.

Retourne d'abord :

- problèmes confirmés ;
- problèmes non reproduisibles ;
- problèmes dépendants d'une décision métier ;
- corrections proposées ;
- tables concernées ;
- routers concernés ;
- services concernés ;
- composants UI concernés ;
- migrations nécessaires ;
- risques de régression.

============================================================
PHASE 1 — DÉCISION OBLIGATOIRE SUR LES HEURES SUPPLÉMENTAIRES
============================================================

Le rapport montre une contradiction entre :

A. le CDC :
HS seulement si une autorisation approuvée existe ;

et

B. le moteur actuel :
HS automatiquement calculées sans autorisation.

NE CHOISIS PAS SILENCIEUSEMENT.

Présente explicitement les deux règles :

OPTION A
HS = 0 sans autorisation approuvée.
HS = min(HS potentielles, plafond autorisé) avec autorisation approuvée.

OPTION B
HS automatiques selon les règles horaires,
et autorisation servant à plafonner/valider les HS.

Puis indique précisément :

- fichiers concernés ;
- impact paie ;
- impact présence ;
- impact UI ;
- impact tests ;
- impact documentation.

La règle définitivement retenue devra être appliquée de façon cohérente dans :

- presence-engine ;
- présences ;
- autorisations HS ;
- résumés ;
- paie ;
- exports ;
- statistiques ;
- aide utilisateur ;
- tests.

NE JAMAIS avoir une règle dans le moteur et une autre dans l'interface.

============================================================
PHASE 2 — STATUT EMPLOYÉ : CONCEPTION CANONIQUE
============================================================

Le statut employé doit devenir une véritable donnée métier transversale.

Statuts actuellement identifiés dans le rapport :

- actif
- conge
- suspendu
- archive
- sorti

Avant modification, auditer leurs transitions.

Créer une matrice métier claire :

| Statut | Apparaît dans effectif actif | Peut être planifié | Peut être pointé | Entre en paie | Compte actif | Peut être modifié | Historique conservé |

NE PAS déduire ces règles de suppositions.

Faire valider les règles par la logique métier déjà présente.

------------------------------------------------------------
SORTI
------------------------------------------------------------

Le statut SORTI doit être traité de bout en bout.

Corriger notamment :

- filtre de la liste ;
- recherche ;
- statistiques ;
- KPI ;
- exports ;
- paie ;
- présences ;
- planning ;
- fiche employé ;
- compte utilisateur ;
- historique ;
- rapports.

Un employé sorti doit rester accessible historiquement.

Il ne doit pas devenir « supprimé ».

------------------------------------------------------------
DONNÉES DE SORTIE
------------------------------------------------------------

La sortie doit conserver au minimum :

- date de sortie ;
- motif ;
- statut ;
- utilisateur ayant effectué l'opération ;
- date/heure de l'opération ;
- commentaire si applicable ;
- réembauchable ou non.

IMPORTANT :

`reembauchable` ne doit plus être une simple donnée d'interface perdue.

Si cette information fait partie du modèle métier, elle doit être persistée proprement.

------------------------------------------------------------
COMPTE UTILISATEUR
------------------------------------------------------------

Lorsqu'un employé lié à un compte utilisateur passe SORTI :

- désactiver le compte selon la règle de sécurité retenue ;
- conserver son historique ;
- conserver ses anciennes opérations ;
- ne pas supprimer son compte ;
- ne pas supprimer son audit trail.

Si le système permet une réactivation/réembauche :

prévoir une procédure dédiée et contrôlée.

NE PAS réactiver simplement en modifiant arbitrairement le champ statut.

============================================================
PHASE 3 — PAIE ET STATUT SORTI
============================================================

Le moteur de paie doit utiliser :

- période de paie ;
- date d'embauche ;
- date de sortie ;
- statut ;
- présence réelle ;
- règles de proratisation.

Exemple obligatoire :

Employé embauché avant le mois.
Sortie le 5 du mois.

La paie ne doit pas traiter automatiquement le salarié comme présent tout le mois.

Déterminer la règle correcte de proratisation à partir de la logique de paie déjà définie.

Tester au minimum :

A. sorti avant le début de période ;
B. sorti pendant la période ;
C. sorti le dernier jour ;
D. actif pendant toute la période.

Ne pas confondre :

« exclure un sorti de la paie »

avec

« supprimer toute rémunération sur sa dernière période ».

Un salarié sorti au milieu d'une période peut avoir droit à une rémunération pour la partie travaillée.

Le calcul doit donc tenir compte des dates d'effet.

============================================================
PHASE 4 — EFFECTIFS, KPI ET EXPORTS
============================================================

Corriger :

getKpis
exportEmployes
exportPresences
et tout rapport utilisant la table employés.

Définir clairement les populations :

- effectif actif ;
- employés en congé ;
- suspendus ;
- sortis ;
- archivés.

Les KPI ne doivent pas mélanger ces catégories.

La masse salariale doit être calculée selon la population et la période appropriées.

Les exports doivent permettre de choisir la population.

============================================================
PHASE 5 — FILTRE ET RECHERCHE DU PERSONNEL
============================================================

Ajouter explicitement :

STATUT = SORTI

dans la liste du personnel.

Permettre éventuellement :

Tous
Actifs
En congé
Suspendus
Sortis
Archivés

Vérifier également les critères :

- nom ;
- prénom ;
- matricule ;
- téléphone ;
- fonction ;
- département ;
- poste ;
- numéro CNSS si autorisé ;
- date d'embauche ;
- date de sortie.

Les filtres doivent être combinables.

Exemple :

SORTI
+
Département = Atelier
+
Période de sortie = septembre 2026

============================================================
PHASE 6 — IMPRESSION INTELLIGENTE DE LA LISTE DU PERSONNEL
============================================================

Créer une fonctionnalité générale de génération d'état du personnel.

IMPORTANT :

NE PAS créer un PDF fixe avec 7 colonnes imposées.

L'utilisateur doit choisir :

1. la population ;
2. les filtres ;
3. les colonnes ;
4. l'ordre des colonnes ;
5. éventuellement l'ordre de tri.

Exemple :

FILTRES

Statut = Actif
Département = Atelier

COLONNES

☑ Matricule
☑ Nom
☑ Prénom
☑ Fonction
☑ Département
☑ Téléphone
☐ Salaire
☐ CNSS
☐ CNI
☑ Date d'entrée

Puis :

[APERÇU]
[IMPRIMER]
[EXPORT PDF]
[EXPORT EXCEL]

Le salaire doit être soumis aux permissions correspondantes.

La sélection de colonnes ne doit jamais contourner les permissions.

Exemple :

Un utilisateur sans permission de consultation du salaire ne doit pas pouvoir cocher :

☑ Salaire

même si le champ existe techniquement.

============================================================
PHASE 7 — MOTEUR DE RAPPORT PERSONNALISABLE
============================================================

Ne limite pas cette logique à la liste employés.

Concevoir un mécanisme réutilisable.

Le même principe pourra être utilisé plus tard pour :

- présences ;
- absences ;
- congés ;
- sanctions ;
- formations ;
- évaluations ;
- paie.

Structure :

FILTRES
→ COLONNES
→ TRI
→ APERÇU
→ EXPORT / IMPRESSION

Éviter de créer un composant différent pour chaque rapport si un moteur commun est possible.

============================================================
PHASE 8 — NOUVELLE CONCEPTION "PRÉSENCES & TEMPS DE TRAVAIL"
============================================================

Le terme « historique des présences » est trop limité.

L'objectif est de créer une vue métier :

PRÉSENCES & TEMPS DE TRAVAIL

Cette page doit permettre :

- analyse individuelle ;
- analyse de plusieurs employés ;
- analyse de tous les employés ;
- période libre ;
- synthèse ;
- détail quotidien ;
- anomalies ;
- calcul du temps réel ;
- préparation du calcul de paie.

------------------------------------------------------------
FILTRES
------------------------------------------------------------

Période :

[du]
[au]

Employés :

- Tous
- Sélection multiple

Autres filtres :

- département ;
- fonction ;
- statut.

============================================================
PHASE 9 — SYNTHÈSE DE PÉRIODE
============================================================

Pour la sélection :

Afficher :

- nombre de jours théoriques ;
- jours travaillés ;
- absences ;
- absences justifiées ;
- absences injustifiées ;
- jours incomplets ;
- retard total ;
- nombre de retards ;
- départs anticipés ;
- temps de pause ;
- heures théoriques ;
- heures réellement travaillées ;
- heures perdues ;
- heures supplémentaires ;
- anomalies.

Afficher une synthèse globale.

Puis une synthèse PAR EMPLOYÉ.

Exemple :

| Employé | Jours théoriques | Présents | Absents | Heures théoriques | Heures réelles | Écart | Retards | H. sup. | Anomalies |

============================================================
PHASE 10 — DÉTAIL JOURNALIER
============================================================

Pour un employé ou plusieurs employés :

| Date | Jour | Arrivée | Départ pause | Retour pause | Départ | Temps théorique | Temps réel | Écart | Retard | Départ anticipé | H. sup. | État |

Chaque ligne doit pouvoir être ouverte.

Le détail doit montrer :

- événements de pointage ;
- corrections ;
- justificatifs ;
- motif d'anomalie ;
- source ;
- utilisateur ayant corrigé si applicable.

============================================================
PHASE 11 — CALCUL DU TEMPS RÉEL
============================================================

Le temps réel doit être calculé à partir des événements réellement présents.

Ne pas compter simplement le nombre de présences.

Identifier clairement :

TEMPS THÉORIQUE
vs
TEMPS DE PRÉSENCE
vs
TEMPS EFFECTIVEMENT TRAVAILLÉ
vs
HEURES SUPPLÉMENTAIRES.

Vérifier la gestion de :

- pause ;
- arrivée anticipée ;
- arrivée tardive ;
- départ anticipé ;
- départ tardif ;
- journée incomplète ;
- absence ;
- congé ;
- mission ;
- jour férié ;
- jour non ouvré.

============================================================
PHASE 12 — ANALYSE DES ANOMALIES
============================================================

Créer une notion explicite d'ANOMALIE.

Exemples :

- arrivée sans départ ;
- départ sans arrivée ;
- pause incomplète ;
- plusieurs événements contradictoires ;
- absence sans justification ;
- correction ;
- dépassement ;
- journée incomplète.

La page doit permettre de filtrer :

[TOUTES]
[NORMALES]
[ANOMALIES]

============================================================
PHASE 13 — CALCUL SUR UNE PÉRIODE POUR PLUSIEURS EMPLOYÉS
============================================================

Le système doit permettre :

Période
+
Employés sélectionnés

et produire automatiquement :

| Employé | Jours | Heures | Absences | Retards | H. sup. | Base salariale | Ajustements | Résultat paie |

Mais NE PAS inventer la formule de rémunération.

Réutiliser le moteur de paie existant.

Séparer :

DONNÉES DE PRÉSENCE
CALCUL DE TEMPS
RÈGLES DE PAIE
RÉSULTAT DE PAIE.

============================================================
PHASE 14 — LIAISON PRÉSENCE → PAIE
============================================================

Garantir la cohérence :

PRÉSENCES
↓
RÉSUMÉS
↓
CLÔTURE
↓
PAIE
↓
BULLETIN

Une présence clôturée ne doit pas être modifiée silencieusement.

Une correction postérieure à clôture doit suivre une procédure contrôlée.

Une modification ayant une incidence financière doit être traçable.

============================================================
PHASE 15 — CONGÉS ET MOIS CLÔTURÉ
============================================================

Corriger le problème identifié :

un congé approuvé peut actuellement écraser une présence clôturée.

Le système doit empêcher toute modification silencieuse d'une période verrouillée.

Choisir une règle cohérente :

- refus d'opération ;
OU
- procédure de réouverture contrôlée ;
OU
- correction exceptionnelle avec recalcul et historique.

Ne pas laisser l'upsert contourner la clôture.

============================================================
PHASE 16 — PERMISSIONS
============================================================

Réparer la séparation des permissions.

Ne plus utiliser :

rh.utilisateur.modifier

comme autorisation universelle pour toutes les écritures RH si le système dispose de permissions spécialisées.

Vérifier notamment :

- personnel ;
- salaire ;
- présence ;
- paie ;
- congés ;
- évaluation ;
- compétences ;
- disciplinaire ;
- documents.

Les données sensibles, notamment les salaires, doivent être protégées :

- côté UI ;
ET
- côté API ;
ET
- dans les exports ;
ET
- dans les rapports.

Un champ masqué dans l'interface ne constitue PAS une permission.

============================================================
PHASE 17 — HISTORIQUE DES MODIFICATIONS
============================================================

Toutes les opérations importantes doivent être traçables :

- changement statut ;
- sortie ;
- réactivation ;
- salaire ;
- poste ;
- département ;
- présence ;
- correction présence ;
- congé ;
- paie ;
- ajustement paie.

Pour chaque événement :

AVANT
→ APRES
→ QUI
→ QUAND
→ MOTIF.

Ne jamais supprimer silencieusement une valeur historique.

============================================================
PHASE 18 — QUALITÉ DU CODE IDENTIFIÉE PAR L'AUDIT
============================================================

Corriger les problèmes techniques suivants lorsqu'ils sont sûrs :

- double test `sorti` ;
- duplication `photoUrl` ;
- `positionId ?? 0` ;
- erreurs historiques avalées par `.catch(() => undefined)`.

IMPORTANT :

Une erreur d'historisation ne doit pas disparaître silencieusement.

Si une opération critique doit écrire :

EMPLOYÉ
+
HISTORIQUE

définir si ces opérations doivent être transactionnelles.

Privilégier la cohérence transactionnelle.

============================================================
PHASE 19 — TESTS OBLIGATOIRES
============================================================

Ajouter ou compléter les tests avant de considérer la correction terminée.

STATUTS

1. actif → sorti
2. sorti → tentative de modification interdite ou procédure dédiée
3. sortie réembauchable
4. sortie non réembauchable
5. compte utilisateur désactivé
6. historique conservé

PAIE

7. actif tout le mois
8. sorti avant période
9. sorti pendant période
10. sorti dernier jour
11. calcul proratisé selon règle métier retenue

PRÉSENCES

12. journée normale
13. retard
14. départ anticipé
15. pause
16. journée incomplète
17. absence
18. congé
19. heures supplémentaires autorisées
20. heures supplémentaires non autorisées

CLÔTURE

21. présence clôturée
22. tentative de modification après clôture
23. congé approuvé sur période clôturée

PERMISSIONS

24. utilisateur autorisé salaire
25. utilisateur non autorisé salaire
26. export sans salaire
27. export avec salaire autorisé

RAPPORTS

28. filtre employés
29. sélection multiple
30. sélection de colonnes
31. ordre des colonnes
32. export
33. impression.

============================================================
PHASE 20 — TESTS DE RÉGRESSION
============================================================

Après correction, vérifier que les modules RH déjà conformes restent opérationnels :

- organigramme ;
- fiches ;
- congés ;
- évaluations ;
- compétences ;
- formations ;
- disciplinaire ;
- documents ;
- paie ;
- dashboard ;
- pointage direct.

Ne pas déclarer une correction terminée si elle provoque une régression dans une fonction déjà opérationnelle.

============================================================
PHASE 21 — RAPPORT APRÈS CORRECTION
============================================================

Produire :

### A. Corrections P0
### B. Corrections P1
### C. Corrections P2
### D. Corrections P3

Pour chaque correction :

- problème ;
- cause ;
- solution ;
- fichiers ;
- tables ;
- migration ;
- API ;
- UI ;
- tests ;
- résultat.

Puis :

### E. Matrice avant/après

| Fonction | Avant | Après | Test | Verdict |

Puis :

### F. Régressions

Lister toute régression détectée.

Puis :

### G. Reste à faire

Ne pas masquer les éléments encore incomplets.

============================================================
RÈGLE ABSOLUE
============================================================

Le système RH doit être conçu selon le principe :

UN EMPLOYÉ
→ UNE FICHE
→ UNE HISTOIRE
→ UNE SOURCE DE VÉRITÉ.

Et :

STATUT
→ PRÉSENCE
→ TEMPS
→ PAIE
→ COMPTE
→ HISTORIQUE

doivent rester cohérents.

Le système doit être complexe techniquement si nécessaire,
mais SIMPLE à utiliser.

Aucune correction ne doit créer une nouvelle source de vérité concurrente.

NE COMMENCE PAS PAR LES P3.

ORDRE OBLIGATOIRE :

1. Décision métier HS
2. Statut / sortie
3. Paie
4. Permissions
5. Clôture / présence
6. Historique
7. Recherche / filtres
8. Présences & temps
9. Impression / rapports
10. améliorations UX

ET APRÈS CHAQUE GROUPE :

CODE
→ TEST
→ VÉRIFICATION
→ RAPPORT
→ GROUPE SUIVANT.