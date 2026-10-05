MISSION CRITIQUE

Le moteur métier du module Catalogue / Produits / Pièces / Consommables /
Outillage / Équipements / Services est censé être terminé.

Cependant, le SEED de référence et les INTERFACES ne permettent pas encore
de démontrer correctement toute la puissance de l'architecture.

Nous allons donc maintenant transformer ce module en un véritable
« laboratoire métier » représentant un garage automobile moderne.

IMPORTANT :

Ne cherche pas simplement à remplir la base avec beaucoup de données.

Le but est de construire un jeu de données de référence COHÉRENT,
STRUCTURÉ, RÉALISTE et suffisamment diversifié pour exercer toutes les
capacités du modèle.

Puis construire/vérifier les interfaces permettant de manipuler ces données
sans contourner l'architecture.

============================================================
0. RÈGLE ABSOLUE
============================================================

AVANT TOUTE MODIFICATION :

1. Inspecte intégralement le code existant.
2. Identifie les tables/modèles existants.
3. Identifie les relations.
4. Identifie les services backend.
5. Identifie les actions/API.
6. Identifie les pages et composants frontend.
7. Identifie les formulaires existants.
8. Identifie les composants de recherche.
9. Identifie les validations.
10. Identifie le système de permissions.
11. Identifie le système de seed existant.
12. Identifie les migrations déjà appliquées.

NE RECONSTRUIS PAS ce qui existe déjà.

NE DUPLIQUE PAS les fonctionnalités.

NE CRÉE PAS un second système parallèle.

Tu dois compléter et harmoniser l'existant.

============================================================
1. ARCHITECTURE MÉTIER À RESPECTER
============================================================

Le système doit respecter les niveaux suivants.

------------------------------------------------------------
PIÈCES / CONSOMMABLES
------------------------------------------------------------

ARTICLE
    ↓
VARIANTE / SKU
    ↓
STOCK
    ↓
LOT
    ↓
EMPLACEMENT
    ↓
MOUVEMENTS

------------------------------------------------------------
OUTILLAGE
------------------------------------------------------------

MODÈLE OUTIL
    ↓
EXEMPLAIRES PHYSIQUES
    ↓
INVENTAIRE
    ↓
PRÊTS / RETOURS
    ↓
ÉTAT
    ↓
MAINTENANCE / CALIBRATION
    ↓
HISTORIQUE

------------------------------------------------------------
ÉQUIPEMENTS
------------------------------------------------------------

MODÈLE ÉQUIPEMENT
    ↓
ACTIF PHYSIQUE
    ↓
EMPLACEMENT
    ↓
RESPONSABLE
    ↓
MAINTENANCE
    ↓
INSPECTION
    ↓
CALIBRATION
    ↓
PANNE / RÉPARATION
    ↓
RÉFORME

------------------------------------------------------------
SERVICES
------------------------------------------------------------

SERVICE
    ↓
DURÉE
    ↓
TARIFICATION
    ↓
UTILISATION DANS INTERVENTION

AUCUNE confusion entre ces domaines.

============================================================
2. OBJECTIF DU SEED
============================================================

Le seed doit être un « catalogue de démonstration professionnel ».

Il doit permettre à un utilisateur qui ouvre l'application de comprendre
immédiatement :

- ce qu'est un article ;
- ce qu'est une variante ;
- ce qu'est un SKU ;
- ce qu'est un stock ;
- ce qu'est un lot ;
- ce qu'est un emplacement ;
- ce qu'est un outil ;
- ce qu'est un exemplaire ;
- ce qu'est un équipement ;
- ce qu'est un service ;
- ce qu'est une compatibilité ;
- ce qu'est une référence ;
- ce qu'est une équivalence ;
- ce qu'est une substitution ;
- ce qu'est une supersession ;
- ce qu'est un kit ;
- ce qu'est un mouvement ;
- ce qu'est un prêt d'outil.

Le seed doit donc être conçu comme une véritable
BASE DE RÉFÉRENCE MÉTIER.

============================================================
3. PRINCIPES DU SEED
============================================================

Le seed doit être :

- déterministe ;
- reproductible ;
- idempotent ;
- cohérent ;
- réaliste ;
- lisible ;
- documenté ;
- sans données absurdes ;
- sans valeurs aléatoires inutiles ;
- sans doublons accidentels.

Si le seed est relancé :

SEED
→ SEED
→ SEED

ne doit pas créer 3 fois les mêmes données.

Utiliser des codes stables et uniques.

Exemples :

CAT-PART-FILTRATION
CAT-PART-FREINAGE
CAT-PART-MOTEUR

ATTR-OIL-VISCOSITY
ATTR-BATTERY-AH
ATTR-TIRE-SIZE

SUP-001
SUP-002

LOC-MAG-01
LOC-RAY-A
LOC-BAC-A01

============================================================
4. HIÉRARCHIE DES CATÉGORIES
============================================================

Construire une hiérarchie suffisamment riche.

Structure :

DOMAINE
→ FAMILLE
→ CATÉGORIE
→ SOUS-CATÉGORIE
→ TYPE

------------------------------------------------------------
DOMAINES
------------------------------------------------------------

1. PIÈCES AUTOMOBILES
2. CONSOMMABLES
3. OUTILLAGE
4. ÉQUIPEMENTS ATELIER
5. KITS / COFFRETS
6. SERVICES

------------------------------------------------------------
PIÈCES AUTOMOBILES
------------------------------------------------------------

Créer au minimum :

Moteur
- filtration
- lubrification
- distribution
- injection
- admission
- échappement
- refroidissement

Freinage
- plaquettes
- disques
- étriers
- capteurs
- accessoires

Suspension
- amortisseurs
- ressorts
- coupelles
- silentblocs
- rotules

Direction
- crémaillère
- rotules
- biellettes
- pompes

Transmission
- embrayage
- volant moteur
- cardans
- joints
- roulements

Électricité
- batteries
- alternateurs
- démarreurs
- relais
- fusibles
- ampoules

Électronique
- capteurs
- calculateurs
- modules
- connecteurs
- faisceaux

Carrosserie
- pare-chocs
- ailes
- capots
- portes
- rétroviseurs
- phares
- feux

Climatisation
- compresseurs
- condenseurs
- évaporateurs
- détendeurs
- capteurs

Pneumatiques
- pneus
- chambres
- valves
- TPMS

Roues
- jantes
- accessoires

Fixations
- vis
- écrous
- rondelles
- clips

Joints
- joints plats
- joints toriques
- joints spi

============================================================
5. CONSOMMABLES
============================================================

Créer des catégories :

Lubrifiants
- huiles moteur
- huiles boîte
- huiles pont
- graisses

Fluides
- liquide frein
- liquide refroidissement
- lave-glace
- direction assistée

Produits chimiques
- nettoyant frein
- dégraissant
- frein-filet
- pâte à joint

Carrosserie
- apprêt
- peinture
- mastic
- abrasifs

Atelier
- chiffons
- papier
- adhésifs
- colliers
- consommables soudure

============================================================
6. OUTILLAGE
============================================================

Créer une hiérarchie :

Outillage manuel
- clés
- douilles
- tournevis
- pinces
- marteaux
- extracteurs

Outillage dynamométrique
- clés dynamométriques
- tournevis dynamométriques

Outillage électroportatif
- perceuses
- visseuses
- meuleuses
- clés à choc

Outillage pneumatique
- clés à choc
- souffleurs
- ponceuses

Outillage hydraulique
- crics
- presses
- vérins
- extracteurs hydrauliques

Mesure
- multimètres
- pinces ampèremétriques
- manomètres
- testeurs

Diagnostic
- scanners OBD
- oscilloscopes
- testeurs batterie
- équipements diagnostic

============================================================
7. ÉQUIPEMENTS
============================================================

Créer :

Levage
- pont 2 colonnes
- pont 4 colonnes
- pont ciseaux
- cric hydraulique

Pneumatiques
- démonte-pneu
- équilibreuse

Climatisation
- station recharge climatisation

Air comprimé
- compresseur
- sécheur

Carrosserie
- poste à souder
- débosseleur
- cabine si applicable

Diagnostic
- station diagnostic
- équipement ADAS

Électricité
- chargeur
- alimentation stabilisée

Atelier
- établi
- armoire
- presse hydraulique

============================================================
8. SERVICES
============================================================

Créer :

Diagnostic
- diagnostic électronique
- diagnostic moteur
- diagnostic électrique

Entretien
- vidange
- entretien périodique
- remplacement filtres

Freinage
- remplacement plaquettes
- remplacement disques

Suspension
- remplacement amortisseurs
- remplacement rotules

Climatisation
- diagnostic climatisation
- recharge climatisation

Pneumatiques
- montage
- équilibrage
- permutation

Géométrie
- parallélisme

Électricité
- recherche panne
- réparation faisceau

============================================================
9. ATTRIBUTS TECHNIQUES
============================================================

C'est une partie CRITIQUE.

Ne pas créer une liste énorme de colonnes spécifiques.

Utiliser le système d'attributs dynamiques existant.

Créer des templates par catégorie.

------------------------------------------------------------
PNEU
------------------------------------------------------------

Attributs :

largeur
hauteur
diamètre
indice_charge
indice_vitesse
XL
runflat
saison
DOT
profondeur_sculpture
pression_max
type

------------------------------------------------------------
BATTERIE
------------------------------------------------------------

tension
capacité_Ah
CCA
technologie
polarité
longueur
largeur
hauteur
type_borne
poids
capacité_réserve

------------------------------------------------------------
PLAQUETTE
------------------------------------------------------------

longueur
largeur
épaisseur
hauteur
matériau
témoin_usure
nombre_pièces
position
système_freinage

------------------------------------------------------------
DISQUE
------------------------------------------------------------

diamètre
épaisseur
épaisseur_minimum
hauteur
centrage
nombre_trous
entraxe
diamètre_trous
ventilé
poids

------------------------------------------------------------
INJECTEUR
------------------------------------------------------------

débit
pression
résistance
impédance
longueur
connecteur
nombre_broches
type_injection
carburant

------------------------------------------------------------
HUILE
------------------------------------------------------------

viscosité_SAE
grade
API
ACEA
OEM_spec
viscosité
volume
type_moteur

------------------------------------------------------------
OUTIL
------------------------------------------------------------

taille
unité
longueur
carré_entrainement
couple_min
couple_max
précision
matériau
poids

------------------------------------------------------------
ÉQUIPEMENT
------------------------------------------------------------

puissance
tension
courant
capacité
pression
dimensions
poids
charge_max
classe
fréquence

============================================================
10. TYPE DES ATTRIBUTS
============================================================

Tester réellement différents types :

TEXT
LONG_TEXT
INTEGER
DECIMAL
BOOLEAN
DATE
DATETIME
ENUM
MULTI_ENUM
UNIT_VALUE
RANGE
REFERENCE
VEHICLE_REFERENCE

Ne jamais stocker toutes les valeurs comme de simples chaînes.

Exemple :

70 Ah

doit être représenté comme :

value = 70
unit = Ah

et non :

value = "70 Ah"

Même logique :

225 mm
→ 225 + mm

2.8 L
→ 2.8 + L

760 A
→ 760 + A

40 Nm
→ 40 + Nm

============================================================
11. UNKNOWN VS NOT_APPLICABLE
============================================================

Tester explicitement :

UNKNOWN
= information non connue.

NOT_APPLICABLE
= caractéristique qui ne s'applique pas.

Exemple :

Batterie :
tension = 12 V

nombre_broches = NOT_APPLICABLE

ECU :
nombre_broches = 48

profondeur_sculpture = NOT_APPLICABLE

NE PAS transformer ces états en chaîne vide.

============================================================
12. DONNÉES DE PIÈCES RÉALISTES
============================================================

Créer au minimum 50 articles.

Ils doivent couvrir :

- filtres ;
- plaquettes ;
- disques ;
- injecteurs ;
- capteurs ;
- batteries ;
- pneus ;
- jantes ;
- courroies ;
- bougies ;
- roulements ;
- silentblocs ;
- amortisseurs ;
- embrayages ;
- cardans ;
- alternateurs ;
- démarreurs ;
- calculateurs ;
- faisceaux ;
- connecteurs ;
- ampoules ;
- pare-chocs ;
- rétroviseurs ;
- phares ;
- joints ;
- vis ;
- écrous ;
- fusibles ;
- relais.

Créer plusieurs variantes par certains articles.

============================================================
13. RÉFÉRENCES
============================================================

Chaque SKU important doit avoir :

- référence interne ;
- référence fabricant ;
- référence OEM si disponible ;
- référence fournisseur ;
- éventuellement EAN/GTIN ;
- anciennes références si nécessaire.

Définir UNE référence principale.

Les autres sont des alias/références secondaires.

Tester la recherche avec toutes les références.

============================================================
14. SUPERSSESSION
============================================================

Créer au moins 5 exemples :

OLD-001 → NEW-001
OLD-002 → NEW-002

etc.

La recherche de l'ancienne référence doit retrouver la nouvelle.

Afficher clairement :

« Référence remplacée par ... »

============================================================
15. ÉQUIVALENCES
============================================================

Créer au moins 5 relations :

A équivalent B

Mais ne jamais fusionner A et B.

Ils restent deux produits/variantes distincts.

============================================================
16. SUBSTITUTIONS
============================================================

Créer :

A substituable par B

La relation doit rester distincte de :

équivalent
compatible
supersession.

============================================================
17. COMPATIBILITÉ VÉHICULE
============================================================

Créer un petit référentiel de véhicules de test.

Au minimum :

Toyota
- Corolla
- Hilux
- RAV4
- Land Cruiser

Honda
- Civic
- CR-V

Mercedes-Benz
- C-Class
- Sprinter

Ford
- Ranger
- Transit

Hyundai
- Tucson
- Santa Fe

Kia
- Sportage

Nissan
- Qashqai
- Navara

Créer plusieurs générations/années/motorisations.

IMPORTANT :

Ne pas créer uniquement :

Toyota Hilux = compatible.

Créer des compatibilités suffisamment précises :

Marque
Modèle
Génération
Année
Moteur
Code moteur
Cylindrée
Carburant
Puissance
Transmission
Position

============================================================
18. POSITIONS
============================================================

Créer des exemples :

AVANT
ARRIÈRE
GAUCHE
DROITE
AVANT_GAUCHE
AVANT_DROITE
ARRIÈRE_GAUCHE
ARRIÈRE_DROITE
ESSIEU_AVANT
ESSIEU_ARRIÈRE
CENTRAL
MOTEUR
COMPARTIMENT_MOTEUR
HABITACLE
CARROSSERIE
N/A

Tester les cas où une position n'a aucun sens.

============================================================
19. STOCK
============================================================

Créer plusieurs emplacements.

Structure :

MAGASIN
→ RAYON
→ ÉTAGÈRE
→ BAC

Exemple :

MAG-01
  RAY-A
    ETAG-03
      BAC-B17

Créer plusieurs stocks.

Pour certains produits :

stock physique = 50
réservé = 10
bloqué = 3

Pour d'autres :

stock = 0
commande = 20

Pour d'autres :

stock = 2
seuil minimum = 5
réapprovisionnement nécessaire.

============================================================
20. LOTS
============================================================

Créer plusieurs lots pour :

- huiles ;
- liquide frein ;
- liquide refroidissement ;
- graisse ;
- produits chimiques.

Chaque lot doit avoir :

- numéro ;
- quantité ;
- date réception ;
- date fabrication ;
- date expiration ;
- emplacement.

Créer volontairement des lots avec différentes dates d'expiration.

============================================================
21. FEFO
============================================================

Créer :

LOT A expire 2027
LOT B expire 2028
LOT C expire 2029

Le système doit identifier LOT A comme prioritaire.

============================================================
22. CONDITIONNEMENTS
============================================================

Créer :

1 carton = 12 bidons
1 bidon = 5 L

Créer :

1 boîte = 10 pièces

Créer :

1 rouleau = 25 mètres.

Vérifier les conversions.

============================================================
23. FOURNISSEURS
============================================================

Créer 5 fournisseurs de test.

Exemple :

SUP-001
SUP-002
SUP-003
SUP-004
SUP-005

Associer plusieurs fournisseurs aux mêmes produits.

Chaque fournisseur peut avoir :

- référence fournisseur ;
- conditionnement ;
- prix achat ;
- délai ;
- fournisseur principal ;
- fournisseur secondaire.

============================================================
24. OUTILS : MODÈLE + EXEMPLAIRES
============================================================

Créer au minimum 20 modèles d'outils.

Exemple :

Clé dynamométrique 40–200 Nm

Puis :

OUT-0001
OUT-0002
OUT-0003

Chaque exemplaire doit avoir :

- numéro inventaire ;
- numéro série si disponible ;
- état ;
- emplacement ;
- date acquisition ;
- responsable ;
- historique.

============================================================
25. PRÊTS D’OUTILS
============================================================

Créer plusieurs mécaniciens de démonstration.

Exemple :

MEC-001
MEC-002
MEC-003
MEC-004

Créer :

outil disponible
outil prêté
outil en maintenance
outil perdu
outil cassé
outil en calibration.

Ne pas supprimer les outils perdus.

============================================================
26. HISTORIQUE DES OUTILS
============================================================

Créer des événements :

CREATED
RECEIVED
MOVED
ASSIGNED
BORROWED
RETURNED
DAMAGED
REPAIRED
MAINTENANCE
CALIBRATED
LOST
FOUND
STOLEN
DISPOSED

Tester leur affichage chronologique.

============================================================
27. COFFRETS / KITS
============================================================

Créer :

KIT-001
« Coffret douilles professionnel 108 pièces »

Composition :

- 1 coffret
- 1 cliquet
- 2 rallonges
- douilles métriques
- douilles longues
- adaptateurs
- embouts

Créer une anomalie :

2 composants manquants.

L'interface doit permettre de voir :

108 attendus
106 présents
2 manquants.

============================================================
28. ÉQUIPEMENTS
============================================================

Créer au minimum :

- pont élévateur ;
- compresseur ;
- démonte-pneu ;
- équilibreuse ;
- station climatisation ;
- presse hydraulique ;
- machine géométrie ;
- poste à souder ;
- chargeur batterie ;
- équipement diagnostic.

Chaque équipement doit avoir :

numéro actif
numéro série
marque
modèle
date acquisition
valeur acquisition
garantie
emplacement
responsable
état.

============================================================
29. SERVICES
============================================================

Créer au minimum 20 services.

Chaque service peut avoir :

nom
description
durée
prix
tarif professionnel
tarif particulier
catégorie
unité.

Un service ne doit jamais apparaître dans le stock physique.

============================================================
30. DOCUMENTS / PHOTOS
============================================================

Associer quelques documents de démonstration à :

- articles ;
- variantes ;
- outils ;
- équipements.

Tester que l'interface les affiche correctement.

============================================================
31. INTERFACE — NAVIGATION PRINCIPALE
============================================================

Créer ou harmoniser une navigation claire.

Le module Catalogue doit être organisé au minimum en :

CATALOGUE
├── Vue générale
├── Articles
├── Variantes / SKU
├── Pièces
├── Consommables
├── Outillage
├── Équipements
├── Kits / Coffrets
├── Services
├── Catégories
├── Attributs techniques
├── Marques
├── Références
├── Compatibilités véhicules
└── Recherche avancée

GESTION STOCK
├── Stock
├── Emplacements
├── Lots
├── Mouvements
├── Réservations
├── Réapprovisionnement
└── Inventaires

OUTILLAGE
├── Exemplaires
├── Prêts
├── Retours
├── Maintenance
└── Calibration

============================================================
32. DASHBOARD CATALOGUE
============================================================

La page d'accueil du module doit montrer :

Nombre d'articles
Nombre de variantes
Nombre d'exemplaires outils
Nombre d'équipements
Valeur du stock
Produits sous seuil
Produits épuisés
Lots proches expiration
Outils actuellement prêtés
Outils en retard
Outils perdus
Outils en maintenance
Équipements en panne
Mouvements récents

Mais ne pas transformer la page en tableau illisible.

Utiliser des cartes KPI + listes utiles + alertes.

============================================================
33. LISTE DES ARTICLES
============================================================

La liste doit permettre :

recherche
filtres
tri
pagination
colonnes configurables si possible.

Colonnes importantes :

Nom
Type
Catégorie
Marque
Référence principale
Variantes
Stock
Emplacement
État
Compatibilités
Dernière modification.

============================================================
34. RECHERCHE GLOBALE
============================================================

Créer une recherche réellement puissante.

Exemples :

« filtre Toyota »

« 90915 »

« Hilux 2.8 »

« plaquette avant »

« AGM 70Ah »

« 225/45 R17 »

« 40-200 Nm »

« OUT-0001 »

« SN12345 »

Elle doit rechercher dans :

nom
alias
références
OEM
fournisseur
attributs
marque
véhicule
VIN
emplacement
numéro inventaire.

============================================================
35. PAGE FICHE ARTICLE
============================================================

La fiche d'un article doit être structurée.

Onglets recommandés :

APERÇU
VARIANTES
CARACTÉRISTIQUES
RÉFÉRENCES
COMPATIBILITÉS
STOCK
LOTS
FOURNISSEURS
KITS
DOCUMENTS
HISTORIQUE

Ne pas mettre toutes les informations dans une seule page interminable.

============================================================
36. PAGE FICHE VARIANTE
============================================================

Afficher :

Nom
SKU
référence principale
autres références
marque
état
origine
relation
caractéristiques
compatibilités
stock
emplacements
lots
fournisseurs
prix
historique.

============================================================
37. PAGE FICHE OUTIL
============================================================

Afficher :

MODÈLE

puis :

EXEMPLAIRES

Pour chaque exemplaire :

numéro inventaire
série
état
emplacement
détenteur
disponibilité.

Onglets :

APERÇU
EXEMPLAIRES
PRÊTS
MAINTENANCE
CALIBRATION
HISTORIQUE
DOCUMENTS.

============================================================
38. PAGE PRÊT D’OUTIL
============================================================

Le workflow doit être simple :

Sélectionner outil
↓
Sélectionner exemplaire
↓
Sélectionner mécanicien
↓
Intervention
↓
Véhicule
↓
Date prévue retour
↓
État avant
↓
Confirmer.

Retour :

outil
→ état après
→ anomalies
→ commentaire
→ confirmer retour.

============================================================
39. CRÉATION RAPIDE
============================================================

Créer un mode :

« Création rapide »

Il doit permettre par exemple :

Nom
Type
Catégorie
Marque
Référence
Unité
Stock initial.

Puis :

« Enregistrer »

et enrichir plus tard.

============================================================
40. CRÉATION AVANCÉE
============================================================

La création avancée doit être contextuelle.

Si :

TYPE = PNEU

afficher les attributs pneu.

Si :

TYPE = BATTERIE

afficher les attributs batterie.

Si :

TYPE = OUTIL

afficher les attributs outil.

Si :

TYPE = ÉQUIPEMENT

afficher les attributs équipement.

Si :

TYPE = SERVICE

afficher durée/tarification.

Ne jamais afficher 100 champs inutiles.

============================================================
41. ADMINISTRATION DES ATTRIBUTS
============================================================

Créer une interface permettant si prévue par l'architecture :

Créer attribut
Modifier attribut
Désactiver attribut
Définir type
Définir unité
Définir obligatoire
Définir ordre
Définir valeur min/max
Définir options
Définir recherche
Définir filtre
Associer à catégorie.

Tester sans modifier le code.

============================================================
42. ADMINISTRATION DES CATÉGORIES
============================================================

Permettre :

création
modification
désactivation
déplacement dans hiérarchie
association d'attributs.

Tester :

Nouvelle catégorie

« Capteurs ADAS »

Ajouter :

portée
angle
fréquence
protocole.

Créer ensuite un produit.

Aucune modification du code ne doit être nécessaire.

============================================================
43. IMPORT / EXPORT
============================================================

Si l'architecture le permet déjà, préparer/tester :

CSV
Excel

Import :

nom
catégorie
marque
référence
prix
stock
attributs.

Avant import :

VALIDATION
→ DOUBLONS
→ ERREURS
→ APERÇU
→ CONFIRMATION
→ IMPORT.

NE JAMAIS importer directement sans aperçu si le workflow existe.

============================================================
44. INVENTAIRE
============================================================

Créer une interface d'inventaire physique.

Pour les pièces :

compter quantité.

Pour les outils :

compter exemplaires physiques.

Pour les équipements :

vérifier présence/état.

Pour les kits :

vérifier kit + composants.

Le système doit respecter la nature de chaque objet.

============================================================
45. ALERTES
============================================================

Afficher :

stock faible
rupture
lot proche expiration
outil en retard
outil perdu
outil endommagé
outil maintenance
équipement en panne
équipement calibration échue.

============================================================
46. DONNÉES DE DÉMONSTRATION
============================================================

Le seed doit être suffisamment riche pour rendre les interfaces
visuellement crédibles.

Éviter :

« Produit 1 »
« Produit 2 »
« Test A »
« Test B »

Utiliser des noms métier compréhensibles.

Exemples :

Filtre huile moteur Toyota
Plaquettes frein avant Hilux
Capteur ABS avant gauche
Batterie AGM 70 Ah
Pneu 225/45 R17
Clé dynamométrique 40–200 Nm
Scanner diagnostic multimarque
Pont élévateur 4 tonnes.

============================================================
47. SEED TECHNIQUE
============================================================

Le seed doit utiliser des constantes / helpers.

Exemple conceptuel :

const categories = [...]
const attributes = [...]
const brands = [...]
const suppliers = [...]
const vehicles = [...]
const products = [...]
const variants = [...]
const tools = [...]
const equipment = [...]

Créer les relations dans le bon ordre.

Ordre :

1. référentiels
2. catégories
3. attributs
4. marques
5. fournisseurs
6. véhicules
7. emplacements
8. articles
9. variantes
10. références
11. attributs
12. compatibilités
13. stock
14. lots
15. outils
16. exemplaires
17. équipements
18. kits
19. services
20. événements.

============================================================
48. SEED ET INTÉGRITÉ
============================================================

Le seed doit respecter toutes les contraintes réelles de production.

Il ne doit pas désactiver :

- foreign keys ;
- validations ;
- contraintes uniques ;
- enum ;
- règles métier.

NE PAS utiliser de raccourci du type :

« on désactive les contraintes pour que le seed passe ».

Si le seed échoue à cause d'une contrainte légitime :

corriger le seed.

============================================================
49. TEST APRÈS SEED
============================================================

Après exécution :

Vérifier automatiquement :

- nombre d'articles ;
- nombre de variantes ;
- nombre d'attributs ;
- nombre de références ;
- nombre de compatibilités ;
- nombre de stocks ;
- nombre de lots ;
- nombre d'outils ;
- nombre d'exemplaires ;
- nombre d'équipements ;
- nombre de services ;
- nombre de mouvements.

Puis vérifier les relations.

Aucun orphan.

Aucune référence cassée.

Aucun stock négatif involontaire.

Aucun doublon involontaire.

============================================================
50. TEST UI APRÈS SEED
============================================================

Après le seed, parcourir l'application comme un véritable utilisateur.

Test :

Dashboard
→ Articles
→ recherche
→ filtre
→ fiche
→ variante
→ stock
→ lot
→ fournisseur
→ compatibilité
→ historique.

Puis :

Outillage
→ modèle
→ exemplaire
→ prêt
→ retour
→ historique.

Puis :

Équipement
→ fiche
→ maintenance
→ état.

Puis :

Services.

============================================================
51. TEST DE COHÉRENCE ENTRE SEED ET UI
============================================================

Pour CHAQUE concept présent dans le seed :

vérifier qu'il existe une manière de le voir ou le manipuler dans l'interface.

Exemple :

Si le seed crée :

supersession

l'UI doit pouvoir l'afficher.

Si le seed crée :

référence secondaire

l'UI doit pouvoir l'afficher.

Si le seed crée :

attribut dynamique

l'UI doit pouvoir l'afficher.

Si le seed crée :

lot

l'UI doit pouvoir l'afficher.

Si le seed crée :

exemplaire outil

l'UI doit pouvoir l'afficher.

Si le seed crée :

mouvement

l'UI doit pouvoir l'afficher.

AUCUNE fonctionnalité fantôme.

============================================================
52. TEST DE COHÉRENCE ENTRE UI ET MODÈLE
============================================================

Inversement :

Pour chaque fonctionnalité importante visible dans l'interface :

identifier :

UI
→ action
→ backend
→ table
→ relation.

Si un bouton ne fait rien :

BUG.

Si une interface affiche des données fictives :

BUG.

Si un champ est visible mais non sauvegardé :

BUG.

Si une donnée existe en base mais ne peut jamais être atteinte depuis l'UI :

fonctionnalité incomplète.

============================================================
53. DESIGN UX
============================================================

Le module doit être :

professionnel
sobre
rapide
compréhensible.

Éviter :

- écrans surchargés ;
- 100 champs visibles ;
- tableaux illisibles ;
- modales gigantesques ;
- navigation profonde inutile.

Utiliser :

- onglets ;
- accordéons ;
- sections ;
- panneaux latéraux ;
- création rapide ;
- recherche instantanée ;
- filtres intelligents.

============================================================
54. MOBILE
============================================================

Le magasinier doit pouvoir depuis un téléphone :

chercher une pièce
voir son stock
voir son emplacement
scanner une référence
voir une fiche
déplacer du stock si autorisé.

Le mécanicien doit pouvoir :

chercher un outil
voir sa disponibilité
emprunter
retourner.

============================================================
55. TEST DE PERFORMANCE UI
============================================================

Avec le seed :

Tester :

recherche
filtrage
ouverture liste
ouverture fiche
historique
stock.

Surveiller :

N+1
requêtes excessives
chargement inutile
pagination incorrecte
temps de réponse.

============================================================
56. TEST DE RECHERCHE « MÉTIER »
============================================================

Tester les phrases :

« filtre huile Toyota »

« plaquette Hilux avant »

« batterie AGM 70Ah »

« pneu 225 45 17 »

« clé dynamométrique 40 200 Nm »

« outil disponible »

« outils prêtés »

« huile qui expire bientôt »

« pièces sous seuil »

« pièces compatibles Hilux 2020 2.8 »

Le moteur doit exploiter autant que possible les données structurées.

============================================================
57. TEST DE ROBUSTESSE
============================================================

Créer volontairement :

un produit sans marque ;
un produit sans référence ;
un produit avec seulement une description ;
un produit avec plusieurs références ;
un produit avec référence ancienne ;
un produit avec plusieurs fournisseurs ;
un produit avec plusieurs lots ;
un produit sans stock ;
un outil sans numéro de série ;
un outil avec numéro de série ;
un équipement sans garantie ;
un service sans stock.

Le système doit gérer ces situations correctement.

============================================================
58. CE QU'IL NE FAUT ABSOLUMENT PAS FAIRE
============================================================

NE PAS :

- créer des centaines de catégories artificielles uniquement pour remplir ;
- créer des attributs inutiles ;
- utiliser des données incohérentes ;
- dupliquer les produits ;
- utiliser des valeurs fictives absurdes ;
- mettre tout dans une seule table plate ;
- mettre tous les attributs dans des colonnes SQL fixes ;
- transformer tous les objets en stock quantitatif ;
- transformer tous les outils en simple quantité ;
- créer une interface différente pour chaque produit ;
- coder en dur chaque catégorie ;
- coder en dur chaque attribut ;
- casser les contraintes pour faire fonctionner le seed.

============================================================
59. TEST « NOUVELLE CATÉGORIE SANS CODE »
============================================================

C'est un test de certification.

Depuis l'interface :

Créer :

« Capteurs ADAS »

Créer 5 attributs :

portée
angle
fréquence
protocole
tension.

Créer ensuite :

« Capteur radar ADAS avant »

avec ces attributs.

Puis :

rechercher le produit.

Si cela nécessite une modification du code source :

SIGNALER.

============================================================
60. TEST « NOUVEL ATTRIBUT SANS CODE »
============================================================

Créer :

« Température maximale de fonctionnement »

type = DECIMAL
unité = °C

L'associer à une catégorie.

Créer un produit.

Saisir :

120 °C.

Rechercher :

120 °C.

Si impossible :

SIGNALER.

============================================================
61. TEST « NOUVEL OBJET »
============================================================

Créer un objet jamais prévu :

« Module hydraulique atelier XZ-500 »

Attributs :

pression
débit
température
diamètre entrée
diamètre sortie
matériau
poids.

Créer et rechercher.

Ce test doit démontrer l'extensibilité réelle.

============================================================
62. RAPPORT FINAL
============================================================

NE PAS simplement dire :

« Seed terminé ».

Produire :

1. architecture utilisée ;
2. nombre de catégories ;
3. nombre d'attributs ;
4. nombre d'articles ;
5. nombre de variantes ;
6. nombre de références ;
7. nombre de véhicules ;
8. nombre de compatibilités ;
9. nombre de fournisseurs ;
10. nombre de lots ;
11. nombre d'emplacements ;
12. nombre d'outils ;
13. nombre d'exemplaires ;
14. nombre d'équipements ;
15. nombre de kits ;
16. nombre de services ;
17. nombre de mouvements.

Puis :

INTERFACES EXISTANTES
INTERFACES CRÉÉES
INTERFACES INCOMPLÈTES
FONCTIONNALITÉS BACKEND SANS UI
FONCTIONNALITÉS UI NON FONCTIONNELLES

Puis :

LIMITATIONS ARCHITECTURALES
LIMITATIONS UX
LIMITATIONS DE RECHERCHE
LIMITATIONS DE SEED
LIMITATIONS DE PERFORMANCE

============================================================
63. MATRICE FINALE
============================================================

Produire :

| Concept | DB | Backend | UI | Seed | Recherche | Testé | Statut |
|---------|----|---------|----|------|-----------|-------|--------|

Statuts :

🟢 COMPLET
🟡 PARTIEL
🟠 FRAGILE
🔴 MANQUANT

============================================================
64. CRITÈRE DE FIN
============================================================

Le travail n'est terminé que lorsque :

SEED
+
MODÈLE
+
BACKEND
+
UI
+
RECHERCHE
+
STOCK
+
HISTORIQUE
+
OUTILS
+
ÉQUIPEMENTS
+
SERVICES

fonctionnent ensemble.

Le but n'est PAS d'avoir beaucoup de données.

Le but est de démontrer que les données peuvent réellement circuler
dans toute l'application.

ARTICLE
→ VARIANTE
→ RÉFÉRENCE
→ COMPATIBILITÉ
→ STOCK
→ LOT
→ EMPLACEMENT
→ MOUVEMENT
→ INTERVENTION

et :

OUTIL
→ EXEMPLAIRE
→ PRÊT
→ MÉCANICIEN
→ INTERVENTION
→ RETOUR
→ ÉTAT
→ HISTORIQUE

et :

ÉQUIPEMENT
→ ACTIF
→ EMPLACEMENT
→ UTILISATION
→ MAINTENANCE
→ PANNE
→ RÉPARATION
→ CALIBRATION
→ HISTORIQUE.

============================================================
65. RÈGLE FINALE
============================================================

NE ME DIS PAS QUE LE MODULE EST COMPLET PARCE QUE LE CODE COMPILE.

Je veux une démonstration fonctionnelle.

Je veux pouvoir ouvrir l'application et :

1. créer une catégorie ;
2. créer un attribut ;
3. créer un article ;
4. créer une variante ;
5. ajouter des références ;
6. ajouter des caractéristiques ;
7. ajouter une compatibilité ;
8. recevoir du stock ;
9. créer un lot ;
10. affecter un emplacement ;
11. déplacer le stock ;
12. rechercher l'article ;
13. consulter son historique ;
14. créer un outil ;
15. créer plusieurs exemplaires ;
16. prêter un exemplaire ;
17. le retourner ;
18. déclarer une anomalie ;
19. gérer un équipement ;
20. créer un service ;
21. créer un kit ;
22. consulter toutes ces informations depuis les interfaces.

Si l'une de ces actions n'est pas possible :

NE PAS LA MASQUER.

IDENTIFIER EXACTEMENT :

- ce qui manque ;
- pourquoi ;
- où ;
- impact ;
- correction recommandée ;
- priorité.

Le résultat final doit permettre de déterminer objectivement si le module Catalogue AtelierOne est réellement exploitable en production.