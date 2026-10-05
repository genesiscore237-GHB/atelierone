MISSION : RECETTE FINALE EXHAUSTIVE DU MODULE 1 — CATALOGUE / RÉFÉRENTIEL

Tu affirmes avoir terminé l'implémentation du Module 1.

Je ne veux PAS que tu me répondes simplement que "tout fonctionne".

Ta mission maintenant est de réaliser une VÉRITABLE CAMPAGNE QA / RECETTE FINALE, extrêmement rigoureuse, sur :

1. la base de données ;
2. les migrations ;
3. les modèles ;
4. les relations ;
5. les contraintes ;
6. la logique métier ;
7. les API / services serveur ;
8. les validations ;
9. les calculs ;
10. la recherche ;
11. le stock ;
12. les références ;
13. les compatibilités ;
14. les doublons ;
15. les substitutions ;
16. les supersessions ;
17. les lots ;
18. les kits ;
19. les pièces ;
20. les consommables ;
21. l'outillage ;
22. les équipements ;
23. les services ;
24. les permissions ;
25. la sécurité ;
26. les interfaces ;
27. l'UX ;
28. le responsive ;
29. les états de chargement ;
30. les états vides ;
31. les erreurs ;
32. les performances ;
33. les tests de régression.

IMPORTANT :

Tu dois tester LE PRODUIT RÉELLEMENT.

Tu dois utiliser les interfaces de l'application lorsqu'elles existent.

Tu dois exécuter les scénarios de bout en bout.

Tu ne dois pas considérer une fonctionnalité comme "OK" uniquement parce que :
- le code existe ;
- une fonction existe ;
- une route existe ;
- un composant existe ;
- un test unitaire passe.

Une fonctionnalité est considérée comme VALIDÉE uniquement si son comportement réel correspond au cahier des charges.

============================================================
PHASE 0 — INSPECTION DU PROJET
============================================================

Avant de tester, inspecte complètement le projet.

Vérifie :

- architecture ;
- modules ;
- routes ;
- pages ;
- composants ;
- hooks ;
- services ;
- API ;
- schéma DB ;
- migrations ;
- seed ;
- validations ;
- permissions ;
- tests existants ;
- gestion des erreurs ;
- logs ;
- indexes ;
- contraintes SQL ;
- relations ;
- transactions ;
- cache éventuel.

Identifie les fichiers réellement responsables du Module 1.

Donne une cartographie :

MODULE
→ PAGE
→ COMPOSANT
→ API
→ SERVICE
→ TABLE
→ RELATIONS
→ TESTS

Ne modifie rien pendant cette phase.

============================================================
PHASE 1 — BASE DE DONNÉES
============================================================

Vérifie réellement le schéma final.

Contrôle notamment :

ARTICLE
VARIANTE / SKU
EXEMPLAIRE
STOCK
LOT
RÉFÉRENCE
SUPERSESSION
ÉQUIVALENCE
SUBSTITUTION
COMPATIBILITÉ
ATTRIBUTS
FOURNISSEURS
UNITÉS
KITS
MOUVEMENTS
OUTILLAGE
ÉQUIPEMENTS
DOCUMENTS.

Vérifie :

- PK ;
- FK ;
- unique constraints ;
- indexes ;
- nullable / non-nullable ;
- enum ;
- types ;
- cascade ;
- restrict ;
- relations inverses ;
- intégrité référentielle.

TESTS À EXÉCUTER :

1. création d'un article ;
2. création d'une variante ;
3. création d'un exemplaire ;
4. suppression ;
5. modification ;
6. création avec données obligatoires manquantes ;
7. création avec FK inexistante ;
8. création de doublon ;
9. suppression d'un parent possédant des enfants ;
10. modification d'une référence existante ;
11. création simultanée de données concurrentes.

Vérifie qu'aucune corruption de données n'est possible.

============================================================
PHASE 2 — MIGRATIONS
============================================================

Exécute les migrations depuis une base propre.

Puis :

- migration complète ;
- seed ;
- démarrage ;
- création ;
- modification ;
- rollback si supporté ;
- nouvelle migration ;
- migration sur données existantes si applicable.

Vérifie qu'il n'y a :

- aucune erreur ;
- aucune colonne orpheline ;
- aucune relation cassée ;
- aucun index manquant ;
- aucun conflit.

============================================================
PHASE 3 — SÉPARATION DES DOMAINES
============================================================

Le système doit clairement distinguer :

A. PIÈCES AUTOMOBILES
B. CONSOMMABLES
C. OUTILLAGE DE RÉPARATION
D. ÉQUIPEMENTS D'ATELIER
E. SERVICES

TESTE DES CRÉATIONS INCORRECTES.

Exemples :

- outil avec compatibilité véhicule ;
- service avec stock ;
- service avec SKU physique ;
- pièce sans catégorie ;
- équipement sans numéro d'actif ;
- outil sans numéro d'inventaire ;
- pièce avec logique d'exemplaire physique ;
- consommable traité comme équipement.

Chaque cas doit être refusé lorsque nécessaire.

Vérifie également que l'interface ne permet pas de proposer des champs incohérents selon le domaine.

============================================================
PHASE 4 — ARTICLE / VARIANTE / EXEMPLAIRE
============================================================

TEST COMPLET.

Créer :

ARTICLE :
"Plaquette de frein"

Puis plusieurs variantes :

- Marque A
- Marque B
- Référence constructeur différente
- Condition différente
- Application différente

Vérifie que :

ARTICLE ≠ VARIANTE ≠ EXEMPLAIRE.

TESTE :

- création ;
- modification ;
- suppression ;
- duplication ;
- recherche ;
- affichage ;
- stock ;
- références ;
- compatibilités.

IMPORTANT :

Deux variantes différentes ne doivent JAMAIS être fusionnées automatiquement simplement parce qu'elles sont :

- équivalentes ;
- compatibles ;
- substituables ;
- de même dimension ;
- de même marque ;
- de même catégorie.

============================================================
PHASE 5 — CRÉATION D'UNE PIÈCE
============================================================

Créer une pièce réaliste complète.

Exemple :

Plaquettes de frein avant Toyota Corolla.

Renseigner :

- catégorie ;
- marque ;
- référence principale ;
- références secondaires ;
- OEM ;
- fournisseur ;
- état ;
- origine ;
- relation ;
- position ;
- caractéristiques techniques ;
- compatibilités ;
- unité ;
- prix achat ;
- prix vente ;
- seuil minimum ;
- seuil maximum ;
- stock sécurité ;
- emplacement ;
- documents.

Vérifie que toutes les données sont persistées puis relues correctement.

Recharge la page.

Ferme et rouvre l'application.

Vérifie que rien n'est perdu.

============================================================
PHASE 6 — ATTRIBUTS TECHNIQUES DYNAMIQUES
============================================================

Tester plusieurs catégories.

Exemples :

FILTRE :
- diamètre ;
- hauteur ;
- filetage ;
- type.

BATTERIE :
- tension ;
- capacité ;
- courant de démarrage ;
- dimensions ;
- polarité.

HUILE :
- viscosité ;
- norme ;
- volume ;
- technologie.

PLAQUETTES :
- longueur ;
- largeur ;
- épaisseur ;
- témoin ;
- essieu ;
- position.

Vérifie :

- attributs obligatoires ;
- attributs facultatifs ;
- min/max ;
- unité ;
- type numérique ;
- texte ;
- booléen ;
- liste ;
- validation.

Vérifie également que les attributs spécifiques à la variante sont bien enregistrés au niveau VARIANTE et non uniquement au niveau ARTICLE.

============================================================
PHASE 7 — RÉFÉRENCES
============================================================

Tester plusieurs références sur une même variante.

Exemple :

- référence fabricant ;
- OEM ;
- constructeur ;
- fournisseur ;
- EAN ;
- ancienne référence ;
- autre référence.

Vérifie :

- unicité ;
- recherche ;
- affichage ;
- suppression ;
- modification ;
- référence principale ;
- références secondaires.

TEST CRITIQUE :

Deux produits différents ne doivent pas pouvoir avoir accidentellement la même référence lorsqu'elle doit être unique.

============================================================
PHASE 8 — SUPERSESSION
============================================================

Créer :

ANCIENNE RÉFÉRENCE → NOUVELLE RÉFÉRENCE

Tester :

- recherche de l'ancienne référence ;
- affichage de la nouvelle ;
- commande ;
- stock ;
- historique ;
- avertissement.

Vérifie que la supersession n'est PAS confondue avec :

- équivalence ;
- compatibilité ;
- substitution.

============================================================
PHASE 9 — ÉQUIVALENCE
============================================================

Créer :

A ≡ B

Tester la recherche de A et B.

Vérifier que le système indique clairement :

"Référence équivalente"

et non :

"même produit".

L'identité des deux variantes doit rester distincte.

============================================================
PHASE 10 — SUBSTITUTION
============================================================

Créer :

A → B

Tester :

- recherche ;
- suggestion ;
- commande ;
- remplacement ;
- confiance ;
- historique.

Vérifier que :

SUBSTITUTION ≠ ÉQUIVALENCE.

============================================================
PHASE 11 — COMPATIBILITÉ VÉHICULE
============================================================

Créer des compatibilités très précises.

Tester :

- marque ;
- modèle ;
- version ;
- génération ;
- année début ;
- année fin ;
- moteur ;
- code moteur ;
- cylindrée ;
- carburant ;
- puissance ;
- transmission ;
- position ;
- essieu ;
- côté.

Tester :

- compatibilité générale ;
- compatibilité précise ;
- incompatibilité négative ;
- conflit de compatibilité.

SCÉNARIO :

Une pièce compatible avec Corolla 2018–2022 mais incompatible avec une motorisation précise.

La recherche ne doit PAS retourner cette pièce comme compatible sans avertissement.

============================================================
PHASE 12 — POSITION
============================================================

Tester :

- avant ;
- arrière ;
- gauche ;
- droite ;
- essieu avant ;
- essieu arrière ;
- moteur ;
- habitacle ;
- coffre ;
- N/A.

Vérifier qu'on ne peut pas saisir des positions incohérentes.

============================================================
PHASE 13 — DÉTECTION DE DOUBLONS
============================================================

Créer volontairement des doublons.

TEST CAS :

1. référence exacte identique ;
2. référence avec espaces ;
3. référence avec tirets ;
4. majuscules/minuscules ;
5. caractères spéciaux ;
6. référence OEM identique ;
7. ancienne référence ;
8. équivalent existant ;
9. substitut existant ;
10. combinaison de plusieurs critères.

Vérifier la cascade :

EXACT
→ NORMALISÉ
→ ÉQUIVALENT
→ OEM
→ ANCIENNE RÉFÉRENCE
→ SUBSTITUT
→ COMBINAISON
→ AVERTISSEMENT.

Le système ne doit jamais créer silencieusement un doublon évident.

============================================================
PHASE 14 — RECHERCHE
============================================================

Tester les 6 modes :

1. EXACT
2. NORMALISÉ
3. DESCRIPTIF / FUZZY
4. TECHNIQUE
5. VÉHICULE
6. VIN

Tester avec :

- référence ;
- marque ;
- modèle ;
- OEM ;
- fournisseur ;
- dimensions ;
- caractéristiques ;
- véhicule ;
- VIN ;
- combinaison de critères.

Chaque résultat doit indiquer POURQUOI il correspond.

Tester également :

- aucun résultat ;
- 1 résultat ;
- plusieurs résultats ;
- recherche très large ;
- recherche ambiguë ;
- fautes mineures ;
- caractères spéciaux.

============================================================
PHASE 15 — STOCK
============================================================

Tester séparément :

STOCK PHYSIQUE
STOCK BLOQUÉ
STOCK DISPONIBLE
STOCK RÉSERVÉ
STOCK AFFECTÉ À INTERVENTION
STOCK EN COMMANDE.

Vérifier les formules.

IMPORTANT :

Aucune quantité ne doit être comptée deux fois.

Tester :

stock = 10
réservé = 3
bloqué = 1
affecté = 2

Vérifier exactement les quantités affichées selon les règles métier.

Tester :

- entrée ;
- sortie ;
- réservation ;
- libération ;
- blocage ;
- déblocage ;
- affectation ;
- désaffectation ;
- correction ;
- inventaire.

Chaque mouvement doit être traçable.

============================================================
PHASE 16 — STOCK PAR EMPLACEMENT
============================================================

Tester plusieurs emplacements.

Exemple :

MAGASIN
→ RAYON A
→ ÉTAGÈRE 3
→ BAC 12

Mettre :

5 unités à A
3 unités à B
2 unités à C.

Vérifier :

- total = 10 ;
- détail par emplacement ;
- recherche ;
- disponibilité ;
- transfert.

Tester un déplacement de stock.

Vérifier l'ancien et le nouvel emplacement.

============================================================
PHASE 17 — LOTS
============================================================

Créer plusieurs lots.

Tester :

- numéro de lot ;
- quantité ;
- date fabrication ;
- date expiration ;
- emplacement ;
- disponibilité.

Créer :

LOT A expire dans 10 jours
LOT B expire dans 6 mois.

Tester FEFO.

Le système doit privilégier le lot approprié selon la règle FEFO.

Tester aussi :

- lot expiré ;
- lot bloqué ;
- lot vide.

============================================================
PHASE 18 — UNITÉS ET CONVERSIONS
============================================================

Tester :

1 bidon = 5 litres

1 carton = 12 pièces

1 boîte = 10 unités.

Vérifier :

- achat ;
- stock ;
- sortie ;
- vente ;
- conversion ;
- affichage.

Tester les conversions impossibles.

============================================================
PHASE 19 — FOURNISSEURS
============================================================

Tester plusieurs fournisseurs pour une même variante.

Chaque fournisseur peut avoir :

- référence propre ;
- prix ;
- conditionnement ;
- quantité par emballage ;
- délai ;
- minimum de commande.

Vérifier que ces données restent spécifiques au fournisseur.

============================================================
PHASE 20 — VÉRIFICATION AVANT COMMANDE
============================================================

TEST CRITIQUE.

Créer :

Pièce X
Stock disponible = 8

Puis tenter de commander 3.

Le système doit détecter que le stock suffit.

Tester :

stock suffisant ;
stock insuffisant ;
stock réservé ;
stock bloqué ;
stock affecté ;
stock en commande ;
substitut disponible ;
ancienne référence ;
équivalent disponible.

Le système doit clairement expliquer sa recommandation.

Aucune commande inutile ne doit être créée silencieusement.

============================================================
PHASE 21 — KITS
============================================================

Créer un kit :

KIT VIDANGE

avec :

- huile ;
- filtre huile ;
- joint ;
- éventuellement autres composants.

Tester :

- création ;
- modification ;
- stock ;
- composition ;
- sortie ;
- disponibilité ;
- rupture d'un composant.

Si un composant manque, vérifier exactement le comportement attendu du kit.

Tester kit avec plusieurs variantes.

============================================================
PHASE 22 — OUTILLAGE
============================================================

Créer un outil.

Exemple :

Clé dynamométrique.

Vérifier qu'il possède :

- type ;
- marque ;
- modèle ;
- numéro inventaire ;
- état ;
- emplacement ;
- responsable ;
- historique ;
- maintenance ;
- calibration.

IMPORTANT :

L'outil doit être traité comme EXEMPLAIRE PHYSIQUE.

Tester :

- prêt ;
- retour ;
- perte ;
- maintenance ;
- indisponibilité.

Un outil ne doit PAS être traité comme une simple pièce automobile.

============================================================
PHASE 23 — ÉQUIPEMENTS D'ATELIER
============================================================

Tester :

- pont élévateur ;
- compresseur ;
- démonte-pneu ;
- équilibreuse ;
- station climatisation ;
- poste à souder.

Vérifier :

- numéro d'actif ;
- valeur acquisition ;
- responsable ;
- état ;
- emplacement ;
- maintenance ;
- calibration ;
- sécurité.

Tester équipement indisponible.

Tester équipement en maintenance.

============================================================
PHASE 24 — SERVICES
============================================================

Créer :

"Diagnostic électronique"

Vérifier :

- pas de stock ;
- pas de SKU physique ;
- durée ;
- prix ;
- catégorie ;
- statut.

Tester également les erreurs :

- stock ;
- lot ;
- exemplaire ;
- emplacement physique.

Ces champs doivent être impossibles ou incohérents selon les règles définies.

============================================================
PHASE 25 — VALIDATIONS FRONTEND
============================================================

Tester TOUS les formulaires.

Pour chaque champ obligatoire :

- vide ;
- espace ;
- valeur invalide ;
- valeur minimale ;
- valeur maximale ;
- valeur trop longue ;
- caractères spéciaux ;
- nombre négatif ;
- zéro ;
- décimal ;
- valeur extrêmement grande.

Vérifier que les erreurs :

- apparaissent au bon endroit ;
- sont compréhensibles ;
- sont en français ;
- ne disparaissent pas immédiatement ;
- empêchent réellement l'envoi.

============================================================
PHASE 26 — VALIDATIONS BACKEND
============================================================

IMPORTANT :

Ne fais pas confiance au frontend.

Contourner volontairement l'interface et envoyer des données invalides directement aux API.

Tester :

- champs manquants ;
- valeurs invalides ;
- ID inexistants ;
- doublons ;
- types incorrects ;
- permissions insuffisantes ;
- données incohérentes.

Le backend doit également refuser.

============================================================
PHASE 27 — TRANSACTIONS / CONCURRENCE
============================================================

Tester deux opérations simultanées sur le même stock.

Exemple :

Stock = 5

Utilisateur A réserve 4.
Utilisateur B réserve 4 simultanément.

Le système ne doit PAS permettre :

stock négatif ;
sur-réservation ;
double allocation.

Tester également deux modifications simultanées d'une même variante.

============================================================
PHASE 28 — INTERFACE UTILISATEUR
============================================================

AUDIT VISUEL COMPLET.

Inspecter toutes les pages du Module 1.

Tester :

- desktop ;
- tablette ;
- mobile ;
- petite résolution ;
- grande résolution.

Vérifier :

ALIGNEMENT
ESPACEMENT
TYPOGRAPHIE
HIÉRARCHIE VISUELLE
BOUTONS
ICÔNES
TABLEAUX
FORMULAIRES
MODALES
DROPDOWNS
BADGES
FILTRES
PAGINATION
ONGLETS
BREADCRUMBS
SIDEBAR
HEADER.

Aucune interface ne doit :

- déborder ;
- couper du texte important ;
- provoquer de scroll horizontal inutile ;
- cacher des boutons ;
- avoir des éléments superposés ;
- afficher des composants inutilisables.

============================================================
PHASE 29 — UX
============================================================

Tester les parcours réels.

PARCOURS 1 :

Créer une pièce depuis zéro.

PARCOURS 2 :

Créer une variante.

PARCOURS 3 :

Ajouter une référence.

PARCOURS 4 :

Ajouter compatibilité véhicule.

PARCOURS 5 :

Ajouter stock.

PARCOURS 6 :

Rechercher la pièce.

PARCOURS 7 :

Consulter son stock.

PARCOURS 8 :

Commander la pièce.

PARCOURS 9 :

Vérifier avant commande.

PARCOURS 10 :

Modifier la pièce.

Chaque parcours doit être faisable sans confusion.

============================================================
PHASE 30 — ÉTATS UI
============================================================

CHAQUE PAGE doit être testée dans les états :

LOADING
EMPTY
SUCCESS
ERROR
PARTIAL DATA
NO RESULTS
PERMISSION DENIED
NETWORK ERROR
SERVER ERROR.

Vérifier qu'il existe une interface adaptée pour chaque état.

Tester les boutons :

- retry ;
- cancel ;
- save ;
- delete ;
- back ;
- refresh.

============================================================
PHASE 31 — CONFIRMATIONS ET ACTIONS DANGEREUSES
============================================================

Tester suppression.

Tester modification critique.

Tester sortie de stock.

Tester correction de stock.

Tester suppression de référence.

Tester suppression de compatibilité.

Tester suppression d'un kit.

Toute action destructive ou critique doit avoir une protection appropriée.

Vérifier :

- confirmation ;
- message explicite ;
- possibilité d'annuler ;
- feedback après action.

============================================================
PHASE 32 — PERMISSIONS / AUTORISATIONS
============================================================

Tester avec différents rôles disponibles.

Pour chaque fonctionnalité :

LECTURE
CRÉATION
MODIFICATION
SUPPRESSION
STOCK
COMMANDE
CONFIGURATION.

Vérifier :

- interface ;
- API ;
- accès direct à l'URL ;
- appel direct API.

Un utilisateur non autorisé ne doit jamais pouvoir contourner la restriction via l'API.

============================================================
PHASE 33 — SÉCURITÉ
============================================================

Tester notamment :

- IDOR ;
- accès à une ressource d'un autre périmètre ;
- injection ;
- XSS ;
- données non filtrées ;
- paramètres manipulés ;
- API sans authentification ;
- API sans autorisation ;
- mass assignment ;
- upload de fichiers ;
- valeurs inattendues.

Ne pas effectuer de test destructif hors environnement prévu.

============================================================
PHASE 34 — PERFORMANCE
============================================================

Tester avec :

10 produits
100 produits
1 000 produits
10 000 produits si possible.

Tester :

- liste ;
- recherche ;
- filtres ;
- pagination ;
- tri ;
- ouverture fiche ;
- recherche véhicule ;
- recherche référence.

Identifier :

- requêtes N+1 ;
- chargements excessifs ;
- absence d'index ;
- réponses trop lourdes ;
- composants inutiles ;
- lenteurs UI.

============================================================
PHASE 35 — RECHERCHE COMBINÉE
============================================================

Tester des recherches complexes.

Exemple :

"Toyota Corolla 2019 1.8 essence + avant gauche + Bosch"

Puis :

"référence OEM + marque + dimension"

Puis :

"véhicule + type de pièce + position".

Vérifier la pertinence des résultats.

============================================================
PHASE 36 — TESTS DE RÉGRESSION
============================================================

Après tous les tests précédents :

- relancer tous les tests automatisés ;
- typecheck ;
- lint ;
- build ;
- tests unitaires ;
- tests intégration ;
- tests E2E ;
- migrations ;
- seed.

Aucune régression ne doit apparaître.

============================================================
PHASE 37 — TEST E2E COMPLET
============================================================

Réaliser au minimum ce scénario intégral :

1. créer catégorie ;
2. créer article ;
3. créer variante ;
4. renseigner attributs ;
5. ajouter référence principale ;
6. ajouter références secondaires ;
7. ajouter fournisseur ;
8. ajouter prix ;
9. ajouter compatibilité véhicule ;
10. ajouter position ;
11. ajouter stock ;
12. ajouter emplacement ;
13. créer lot ;
14. effectuer entrée stock ;
15. rechercher produit ;
16. vérifier résultat ;
17. consulter fiche ;
18. vérifier stock ;
19. vérifier compatibilité ;
20. tenter une commande ;
21. lancer vérifierAvantCommande ;
22. tester équivalent ;
23. tester substitut ;
24. tester supersession ;
25. modifier le produit ;
26. recharger ;
27. vérifier persistance ;
28. supprimer si possible ;
29. vérifier historique / intégrité.

============================================================
PHASE 38 — TESTS NÉGATIFS
============================================================

Tu dois volontairement essayer de casser le système.

Créer des données :

- incomplètes ;
- contradictoires ;
- trop grandes ;
- négatives ;
- dupliquées ;
- inexistantes ;
- incohérentes ;
- concurrentes.

Le but est de trouver les failles.

Ne cherche PAS à confirmer que le système fonctionne.

Cherche activement à démontrer qu'il ne fonctionne pas.

============================================================
PHASE 39 — AUDIT DES INTERFACES PAR RAPPORT AU MÉTIER
============================================================

Pour chaque règle métier du Module 1 :

1. existe-t-elle dans la base ?
2. existe-t-elle dans le backend ?
3. existe-t-elle dans le frontend ?
4. est-elle réellement accessible à l'utilisateur ?
5. est-elle correctement validée ?
6. est-elle testée ?
7. l'utilisateur comprend-il son résultat ?

Construire une matrice :

RÈGLE MÉTIER | DB | API | UI | TEST | RÉSULTAT

============================================================
PHASE 40 — MATRICE DE COUVERTURE
============================================================

À la fin, produire une matrice exhaustive.

Colonnes :

ID
FONCTIONNALITÉ
SCÉNARIO
TYPE DE TEST
RÉSULTAT ATTENDU
RÉSULTAT OBTENU
STATUT
PREUVE
FICHIER CONCERNÉ
ANOMALIE
GRAVITÉ.

Statuts obligatoires :

🟢 PASS
🟡 PASS AVEC RÉSERVE
🟠 PROBLÈME MINEUR
🔴 FAIL
⚫ NON TESTABLE

Ne mets PAS PASS si tu n'as pas réellement testé.

============================================================
PHASE 41 — CLASSIFICATION DES BUGS
============================================================

Pour chaque problème :

CRITIQUE
BLOQUANT
MAJEUR
MOYEN
MINEUR
COSMÉTIQUE.

CRITIQUE :

- corruption données ;
- stock faux ;
- commande erronée ;
- faille sécurité ;
- perte données ;
- incompatibilité dangereuse ;
- double allocation.

BLOQUANT :

- fonctionnalité principale impossible.

MAJEUR :

- fonctionnalité importante incorrecte.

MOYEN :

- comportement incorrect mais contournable.

MINEUR :

- problème limité.

COSMÉTIQUE :

- UI uniquement.

============================================================
PHASE 42 — AUCUNE AUTO-CERTIFICATION
============================================================

INTERDICTION de conclure :

"Tout est OK"

sans fournir les preuves.

Pour chaque groupe de tests, donne :

- commande exécutée ;
- test réalisé ;
- résultat ;
- preuve ;
- éventuel screenshot si disponible ;
- logs ;
- erreur exacte si FAIL.

============================================================
PHASE 43 — RAPPORT FINAL
============================================================

À la fin, fournis exactement :

# RAPPORT QA FINAL — MODULE 1

## 1. Résumé exécutif

## 2. Environnement testé

## 3. Fonctionnalités testées

## 4. Tests automatisés

## 5. Tests E2E

## 6. Tests UI/UX

## 7. Tests responsive

## 8. Tests sécurité

## 9. Tests performance

## 10. Tests stock

## 11. Tests recherche

## 12. Tests compatibilité

## 13. Tests références

## 14. Tests doublons

## 15. Tests outillage

## 16. Tests équipements

## 17. Tests services

## 18. Tests permissions

## 19. Tests négatifs

## 20. Tests de concurrence

## 21. Matrice complète PASS/FAIL

## 22. Bugs trouvés

Pour chaque bug :

- ID
- gravité
- reproduction
- cause probable
- fichier
- correction recommandée
- statut

## 23. Fonctionnalités manquantes

## 24. Risques résiduels

## 25. Score de couverture

Donner un pourcentage réel.

## 26. Verdict final

Choisir UNE SEULE catégorie :

🟢 PRODUCTION READY

🟡 READY WITH MINOR FIXES

🟠 NOT READY — FIXES REQUIRED

🔴 NOT READY — MAJOR ISSUES

============================================================
RÈGLE ABSOLUE
============================================================

Ne modifie PAS le code immédiatement lorsqu'un test échoue.

D'abord :

1. identifier ;
2. reproduire ;
3. documenter ;
4. localiser ;
5. expliquer.

Ensuite seulement, si je te demande de corriger, tu corriges.

Je veux d'abord connaître l'état RÉEL du système.

============================================================
CRITÈRE FINAL
============================================================

Le Module 1 ne sera considéré comme validé que si :

- le modèle de données est cohérent ;
- les migrations fonctionnent ;
- les domaines sont séparés ;
- ARTICLE / VARIANTE / EXEMPLAIRE sont respectés ;
- les références fonctionnent ;
- les supersessions fonctionnent ;
- équivalence ≠ compatibilité ≠ substitution ;
- les doublons sont détectés ;
- la recherche fonctionne ;
- le stock est exact ;
- les lots fonctionnent ;
- FEFO/FIFO fonctionne selon les règles ;
- les kits fonctionnent ;
- la vérification avant commande fonctionne ;
- les fournisseurs fonctionnent ;
- les unités/conversions fonctionnent ;
- l'outillage fonctionne comme exemplaires physiques ;
- les équipements fonctionnent comme actifs ;
- les services sont correctement séparés ;
- les validations frontend ET backend fonctionnent ;
- les permissions sont sécurisées ;
- les interfaces sont complètes ;
- les états UI sont gérés ;
- le responsive est correct ;
- les parcours utilisateur sont cohérents ;
- les erreurs sont correctement affichées ;
- les tests E2E passent ;
- le build passe ;
- le typecheck passe ;
- les tests automatisés passent ;
- aucune régression critique n'est détectée.

IMPORTANT :

Ne te contente pas d'inspecter le code.

TESTE L'APPLICATION.

Et surtout, si une fonctionnalité prévue dans le cahier des charges n'est finalement pas réellement accessible ou utilisable depuis l'interface, considère-la comme NON IMPLÉMENTÉE, même si le backend existe.

Commence maintenant par l'audit et ne donne le verdict qu'après avoir terminé toute la campagne.