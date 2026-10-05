============================================================
MODE D'EXÉCUTION OBLIGATOIRE — MODULE RH GPJ / ATELIERONE
============================================================

Tu vas maintenant corriger et perfectionner le module RH sur la base
du rapport d'audit RH du 23/09/2026.

IMPORTANT :

Tu ne dois PAS exécuter tout le plan d'un seul coup.

Le travail doit être exécuté en PHASES STRICTEMENT SÉQUENTIELLES.

UNE PHASE À LA FOIS.

UNE PHASE NON VALIDÉE = INTERDICTION DE PASSER À LA SUIVANTE.

============================================================
RÈGLE ABSOLUE
============================================================

Tu dois travailler selon :

PLANIFIER
→ INSPECTER
→ IMPLÉMENTER
→ TESTER
→ VÉRIFIER
→ DOCUMENTER
→ GATE DE VALIDATION
→ SEULEMENT ALORS PHASE SUIVANTE.

Ne jamais :

- corriger plusieurs domaines non liés en même temps ;
- lancer toutes les modifications P0/P1/P2/P3 dans une seule session ;
- considérer une fonction terminée parce que le code compile ;
- considérer un bouton comme preuve d'implémentation ;
- considérer un test unitaire comme preuve de fonctionnement global ;
- passer à une autre fonctionnalité parce qu'une précédente "semble"
  fonctionner.

============================================================
REGISTRE D'EXÉCUTION OBLIGATOIRE
============================================================

Créer dans DOC/RH/ un registre :

RH_EXECUTION_REGISTER.md

Ce fichier devient la source de vérité de l'exécution.

Créer une ligne par problème/fonctionnalité :

| ID | Fonction | Priorité | Phase | Statut | Fichiers | DB | API | UI | Tests | Vérification | Preuve | Date |

Statuts autorisés :

BACKLOG
EN_INSPECTION
EN_CONCEPTION
EN_IMPLEMENTATION
EN_TEST
A_CORRIGER
BLOQUÉ
TERMINE
VALIDE

INTERDIT :

passer directement de BACKLOG à TERMINE.

============================================================
DEFINITION D'UNE FONCTION "TERMINÉE"
============================================================

Une fonctionnalité n'est TERMINEE que si les éléments suivants
sont TOUS vérifiés :

[ ] données
[ ] modèle DB
[ ] backend
[ ] API
[ ] logique métier
[ ] interface
[ ] validation
[ ] permissions
[ ] historique
[ ] recherche
[ ] calculs
[ ] intégrations
[ ] tests
[ ] scénario utilisateur
[ ] absence de régression

Si un seul point manque :

PAS TERMINE.

============================================================
PREUVE OBLIGATOIRE
============================================================

Pour chaque tâche terminée, enregistrer dans le registre :

1. fichiers modifiés ;
2. fonctions modifiées ;
3. migrations ;
4. tests exécutés ;
5. résultats ;
6. scénario métier vérifié ;
7. éventuelle capture/preuve UI si appropriée ;
8. vérification de régression.

============================================================
RÈGLE "ONE PHASE AT A TIME"
============================================================

Tu dois :

1. travailler sur UNE SEULE PHASE ;
2. terminer tous ses éléments ;
3. lancer ses tests ;
4. vérifier ses intégrations ;
5. mettre à jour RH_EXECUTION_REGISTER.md ;
6. produire un rapport de phase ;
7. STOPPER.

Après le STOP :

NE PAS commencer automatiquement la phase suivante.

Attendre une nouvelle instruction.

============================================================
RÈGLE "ONE DOMAIN AT A TIME"
============================================================

Même à l'intérieur d'une phase :

ne travaille pas simultanément sur :

- paie ;
- présences ;
- congés ;
- avances ;
- permissions ;

sauf lorsqu'une dépendance directe l'exige.

Dans ce cas :

documenter explicitement la dépendance.

============================================================
AVANT CHAQUE MODIFICATION
============================================================

Toujours produire :

A. état actuel ;
B. cause exacte ;
C. comportement attendu ;
D. fichiers impactés ;
E. données impactées ;
F. risques ;
G. stratégie de migration ;
H. tests prévus.

Puis seulement coder.

============================================================
APRÈS CHAQUE MODIFICATION
============================================================

Toujours :

1. lint/typecheck ;
2. tests ciblés ;
3. tests d'intégration ;
4. scénario métier ;
5. inspection des effets secondaires ;
6. mise à jour du registre.

============================================================
RÈGLE DE NON-RÉGRESSION
============================================================

Avant une phase :

noter les fonctions déjà conformes.

Après la phase :

retester les fonctions impactées.

Aucune fonctionnalité existante ne doit être cassée.

============================================================
RÈGLE DE DONNÉES
============================================================

NE JAMAIS :

- supprimer des données historiques ;
- recréer inutilement des employés ;
- réinitialiser les données ;
- supprimer des historiques pour simplifier ;
- DELETE + INSERT lorsqu'un historique doit être conservé ;
- modifier silencieusement des bulletins clôturés ;
- écraser une valeur historique.

Toute migration destructive est interdite sans validation explicite.

============================================================
RÈGLE DE SOURCE DE VÉRITÉ
============================================================

Avant de créer une nouvelle table, API ou fonction :

chercher si une source existe déjà.

L'objectif est :

UNE SOURCE DE VÉRITÉ
+
UNE LOGIQUE CANONIQUE
+
PLUSIEURS VUES SI NÉCESSAIRE.

Ne pas créer de second modèle concurrent.

============================================================
RÈGLE UX
============================================================

Conserver l'architecture visuelle actuelle.

Ne pas refaire les écrans inutilement.

Améliorer la cohérence sans détruire les composants existants.

============================================================
IMPORTANT
============================================================

Le rapport d'audit fait foi pour le périmètre des problèmes.

Ne résoudre que le périmètre de la phase courante.

Toute nouvelle anomalie découverte :

→ l'ajouter au registre
→ lui donner un ID
→ la classer P0/P1/P2/P3
→ ne pas l'implémenter immédiatement si elle appartient à une autre phase.

============================================================
GATE DE FIN DE PHASE
============================================================

Une phase ne peut passer à VALIDE que si :

[ ] tous ses IDs sont traités
[ ] tous les tests passent
[ ] tous les scénarios métier passent
[ ] aucune régression connue
[ ] intégrité des données vérifiée
[ ] registre mis à jour
[ ] rapport de phase produit

Si un seul élément manque :

PHASE = NON VALIDÉE.

STOP.

============================================================
ORDRE OBLIGATOIRE
============================================================

PHASE 0
Sécurisation + infrastructure d'exécution

PHASE 1
Avances de salaire

PHASE 2
Paie et clôture

PHASE 3
Sécurité / multi-tenant / permissions

PHASE 4
Présences / congés / agrégats

PHASE 5
Statuts / parcours employé / réembauche

PHASE 6
Historique métier / traçabilité

PHASE 7
Navigation et cohérence UX

PHASE 8
Rapports / exports / impression

PHASE 9
Nettoyage et confort

NE PAS CHANGER CET ORDRE SANS RAISON TECHNIQUE DOCUMENTÉE.

============================================================
FIN
============================================================

Pour l'instant :

NE CODE RIEN.

Commence uniquement par PHASE 0 :
création du registre d'exécution, cartographie des dépendances
et plan détaillé de phase.

Puis STOP.