PROMPT MAÎTRE — CAS RÉEL COMPLEXE DE CRÉATION D’UN ARTICLE, DE L’ÉCRAN JUSQU’À L’ENREGISTREMENT
0. OBJECTIF

Nous allons maintenant aller plus loin que les spécifications théoriques du module Catalogue.

Je veux que tu prennes un cas réel complexe, que tu le traites comme le ferait un utilisateur du Garage Polyvalent Junior, et que tu définisses puis implémentes toute la chaîne :

Écran de création → saisie utilisateur → recherche de références existantes → détection de doublon → classification → attributs dynamiques → variante → références → compatibilités véhicules → fournisseur → unité → prix → stock → emplacement → validation → transaction DB → historique → affichage dans le catalogue → recherche ultérieure.

Il ne suffit pas que les tables existent.

Il faut que l'interface permette réellement d'effectuer cette opération sans contourner l'architecture.

1. CAS MÉTIER À IMPLÉMENTER

Nous voulons enregistrer le produit suivant :

Produit

Batterie automobile AGM Start & Stop

Données connues :

Nom : Batterie AGM Start & Stop 70 Ah
Technologie : AGM
Tension nominale : 12 V
Capacité : 70 Ah
Courant de démarrage à froid : 760 A EN
Polarité : positive à droite
Type de borne : T1
Fixation : B13
Longueur : 278 mm
Largeur : 175 mm
Hauteur : 190 mm
Poids : environ 20 kg
Start & Stop : Oui
Rechargeable : Oui
Batterie plomb-acide : Oui
Type : AGM
État : Neuf
Origine : Aftermarket
Relation : Produit standard

Référence fabricant :

BAT-AGM-70-760

Références équivalentes possibles :

AGM70-760
570901076
H6 AGM 70Ah

Références OEM/constructeur possibles :

Toyota : référence OEM correspondante
BMW : référence OEM correspondante
Mercedes-Benz : référence OEM correspondante

Les références doivent être considérées comme des données de démonstration si aucune source fournisseur réelle n'est disponible. Ne jamais présenter une référence inventée comme une donnée OEM vérifiée.

2. CE QUE L'UTILISATEUR DOIT VOIR

La création ne doit surtout pas être un formulaire géant de 150 champs.

L'écran doit être progressif, intelligent et adaptatif.

Créer un écran :

Nouvel article

avec une progression visible :

① Identification
   ↓
② Classification
   ↓
③ Caractéristiques
   ↓
④ Références
   ↓
⑤ Compatibilité
   ↓
⑥ Fournisseurs & prix
   ↓
⑦ Stock
   ↓
⑧ Vérification
   ↓
✓ Enregistrement

L'utilisateur doit pouvoir revenir en arrière sans perdre les données.

3. ÉTAPE 1 — IDENTIFICATION

Écran :

┌──────────────────────────────────────────────────────────┐
│ Nouvel article                                           │
│                                                          │
│ Identification                                           │
│                                                          │
│ Nom *                                                    │
│ [ Batterie AGM Start & Stop 70 Ah                  ]    │
│                                                          │
│ Désignation courte                                       │
│ [ Batterie AGM 12V 70Ah 760A AGM                  ]    │
│                                                          │
│ Marque                                                   │
│ [ Sélectionner une marque ▼ ]                            │
│                                                          │
│ État                                                     │
│ [ Neuf ▼ ]                                               │
│                                                          │
│ Origine                                                  │
│ [ Aftermarket ▼ ]                                        │
│                                                          │
│ Relation                                                 │
│ [ Produit standard ▼ ]                                   │
│                                                          │
│                         [Continuer →]                    │
└──────────────────────────────────────────────────────────┘
Règle

À ce stade, ne pas demander :

longueur ;
capacité ;
courant de démarrage ;
véhicule ;
stock ;
fournisseur ;
etc.

Ces informations arriveront dans les étapes appropriées.

4. DÉTECTION IMMÉDIATE DES DOUBLONS

Dès que l'utilisateur saisit :

Batterie AGM Start & Stop 70 Ah

le système doit effectuer une recherche intelligente.

Chercher dans cet ordre :

1. Correspondance exacte
2. Référence exacte
3. Référence normalisée
4. Nom normalisé
5. Alias
6. Marque + caractéristiques
7. Référence équivalente
8. Référence OEM
9. Ancienne référence / supersession
10. Similarité globale

Afficher par exemple :

⚠ ARTICLES SIMILAIRES TROUVÉS

Batterie AGM 70Ah 760A
Varta
Réf. : BAT-AGM-70-760
Stock : 2
Emplacement : Magasin > Batterie > Étagère B2

[Voir l'article]

────────────────────────

Batterie AGM 70Ah
Bosch
Réf. : AGM70-760
Stock : 0

[Voir l'article]

────────────────────────

[Continuer malgré les correspondances]

Le système doit expliquer pourquoi il considère les articles similaires.

Exemple :

Correspondance :
✓ Technologie AGM
✓ 70 Ah
✓ 760 A
✓ 12 V
✓ Dimensions identiques

Probabilité de doublon : élevée
IMPORTANT

Une équivalence ou une compatibilité ne doit jamais provoquer automatiquement une fusion.

L'utilisateur conserve la décision.

5. ÉTAPE 2 — CLASSIFICATION

L'écran doit être adaptatif.

Afficher :

Domaine *
[ Pièces automobiles ▼ ]

Famille *
[ Électricité / alimentation ▼ ]

Catégorie *
[ Batterie ▼ ]

Sous-catégorie
[ Batterie de démarrage ▼ ]

Type
[ Batterie AGM ▼ ]

Le système doit comprendre que :

Domaine
  Pièces automobiles

    Famille
      Électricité / alimentation

        Catégorie
          Batterie

            Sous-catégorie
              Batterie de démarrage

                Type
                  AGM
RÈGLE ARCHITECTURALE

Cette hiérarchie ne doit pas être codée en dur dans le frontend.

Elle doit provenir du référentiel.

L'administrateur doit pouvoir créer ultérieurement :

Électricité
→ Batterie
→ Batterie Lithium
→ Batterie GEL

sans modifier le code de l'écran.

6. LE SYSTÈME CHARGE LE TEMPLATE TECHNIQUE

Une fois Batterie sélectionnée, le système doit charger automatiquement son template d'attributs.

L'écran devient :

Caractéristiques techniques
Technologie *
[ AGM ▼ ]

Tension nominale *
[ 12 ] V

Capacité *
[ 70 ] Ah

Courant de démarrage *
[ 760 ] A

Norme courant de démarrage
[ EN ▼ ]

Start & Stop
[ ☑ Oui ]

Rechargeable
[ ☑ Oui ]

Polarité
[ Positive à droite ▼ ]

Type de borne
[ T1 ▼ ]

Fixation
[ B13 ▼ ]

Longueur
[ 278 ] mm

Largeur
[ 175 ] mm

Hauteur
[ 190 ] mm

Poids
[ 20 ] kg
7. NE PAS TRANSFORMER CHAQUE CARACTÉRISTIQUE EN COLONNE SQL

Les attributs doivent être dynamiques.

Exemple conceptuel :

attribute_template
    Batterie
        ├── technologie
        ├── tension_nominale
        ├── capacite
        ├── courant_demarrage
        ├── norme_demarrage
        ├── start_stop
        ├── rechargeable
        ├── polarite
        ├── type_borne
        ├── fixation
        ├── longueur
        ├── largeur
        ├── hauteur
        └── poids

Chaque attribut doit avoir :

code
nom
type
unité
obligatoire
ordre
valeurs possibles
minimum
maximum
précision
searchable
filterable
comparable
niveau
8. TYPES D'ATTRIBUTS À TESTER

Le moteur doit être capable de gérer :

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

Dans notre exemple :

Technologie          → ENUM
Tension              → UNIT_VALUE
Capacité             → UNIT_VALUE
Courant              → UNIT_VALUE
Start & Stop         → BOOLEAN
Polarité             → ENUM
Longueur             → UNIT_VALUE
Poids                → UNIT_VALUE
9. UNKNOWN ≠ NOT_APPLICABLE

Le système doit distinguer :

UNKNOWN

de :

NOT_APPLICABLE

Exemple :

Date de fabrication : inconnue

n'est pas la même chose que :

Date de fabrication : non applicable

Ne jamais utiliser arbitrairement 0, chaîne vide ou N/A pour tout.

10. ÉTAPE 3 — VARIANTE / SKU

Après les caractéristiques, demander :

Cette configuration correspond-elle à une référence commerciale
distincte ?

(●) Oui
( ) Non

Pour notre cas :

Oui.

Créer :

ARTICLE
Batterie automobile AGM

        ↓

VARIANTE / SKU
Batterie AGM 70Ah 760A 12V

La variante possède son propre :

SKU interne
référence principale
code-barres éventuel
prix
unité de vente
stock
compatibilités
fournisseurs
11. RÉFÉRENCE PRINCIPALE

L'écran :

Référence principale *

Type
[ Fabricant ▼ ]

Valeur
[ BAT-AGM-70-760                         ]

[✓] Référence principale
RÈGLE

Chaque variante doit avoir une référence principale.

Même si elle possède 10 références secondaires.

12. AJOUT DE RÉFÉRENCES MULTIPLES

Bouton :

+ Ajouter une référence

L'utilisateur peut ajouter :

┌─────────────────────────────────────────────┐
│ Type              Valeur                    │
│ Fabricant        BAT-AGM-70-760             │
│ OEM              XXXXXXXX                    │
│ Fournisseur      FOUR-AGM-70                │
│ EAN              XXXXXXXXXXXXXX              │
│ Ancienne         OLD-AGM-70                 │
│ Équivalente      AGM70-760                  │
└─────────────────────────────────────────────┘

Types :

INTERNAL_SKU
MANUFACTURER
OEM
CONSTRUCTOR
SUPPLIER
EAN
UPC
GTIN
BARCODE
QR
SERIAL
INVENTORY
OLD_REFERENCE
OTHER

Le système doit conserver :

valeur originale

et

valeur normalisée

Exemple :

Original :
BAT-AGM-70-760

Normalisé :
BATAGM70760

Cela permet de retrouver le produit même si l'utilisateur tape :

BAT AGM 70 760
BAT-AGM-70-760
batagm70760
13. ÉQUIVALENCE ≠ SUBSTITUTION ≠ COMPATIBILITÉ

Prévoir trois relations différentes.

Équivalence
BAT-AGM-70-760
       ↔
AGM70-760

Signifie :

ces références désignent des produits équivalents.

Substitution
Ancienne batterie
       ↓
Nouvelle batterie

Signifie :

cette référence peut remplacer l'ancienne.

Compatibilité

Signifie :

cette batterie convient à tel véhicule.

Ne jamais mélanger ces trois notions.

14. ÉTAPE 4 — COMPATIBILITÉ VÉHICULE

Interface :

Compatibilité véhicule

[ + Ajouter un véhicule ]

Marque
[ Toyota ▼ ]

Modèle
[ RAV4 ▼ ]

Génération
[ XA50 ▼ ]

Année début
[ 2019 ]

Année fin
[ 2025 ]

Motorisation
[ 2.5 Hybrid ]

Carburant
[ Hybride ]

Transmission
[ AWD ]

Code moteur
[ ............ ]

Position
[ N/A ]

        [Ajouter]

Puis :

COMPATIBILITÉS

✓ Toyota RAV4 XA50
  2019–2025
  2.5 Hybrid
  AWD

✓ BMW Série 3
  ...
  
✓ Mercedes-Benz
  ...
15. COMPATIBILITÉ POSITIVE ET NÉGATIVE

Prévoir :

Compatibilité
(●) Compatible
( ) Incompatible

Une incompatibilité ne supprime pas le véhicule.

Elle doit servir à empêcher une mauvaise affectation.

Exemple :

⚠ ATTENTION

Cette batterie est explicitement incompatible avec :

Toyota RAV4
2.0 essence
2019

Raison :
capacité / fixation incompatible.
16. POSITION STRUCTURÉE

Ne jamais stocker uniquement :

"avant droite"

dans un champ libre.

Utiliser :

Essieu
[ Avant ]

Côté
[ Droit ]

Zone
[ Compartiment moteur ]

Emplacement
[ N/A ]

Pour une batterie :

Essieu = N/A
Côté = N/A
Zone = Compartiment moteur
Position = N/A
17. ÉTAPE 5 — FOURNISSEUR

Interface :

Fournisseurs

+ Ajouter un fournisseur

Formulaire :

Fournisseur *
[ Fournisseur ABC ]

Référence fournisseur
[ FOUR-AGM-70 ]

Unité d'achat
[ Pièce ]

Conditionnement fournisseur
[ Carton de 4 ]

Facteur de conversion
[ 4 ]

Prix d'achat HT
[ 85 000 FCFA ]

Délai habituel
[ 3 ] jours

Fournisseur principal
[✓]

Le système comprend :

1 carton = 4 batteries

Mais le stock interne reste :

1 unité = 1 batterie
18. ÉTAPE 6 — PRIX

Afficher :

Prix d'achat HT
[ 85 000 ]

Prix de vente professionnel HT
[ 105 000 ]

Prix de vente particulier HT
[ 115 000 ]

TVA
[ 19,25 % ]

Marge
[ calcul automatique ]

Taux de marge
[ calcul automatique ]

Les calculs doivent être réalisés côté métier, pas seulement dans le frontend.

19. ÉTAPE 7 — STOCK

L'écran doit maintenant demander :

Gestion du stock

Gérer le stock ?
(●) Oui
( ) Non

Pour une pièce automobile :

Oui.

Afficher :

Unité de stock
[ Pièce ]

Stock minimum
[ 2 ]

Stock maximum
[ 10 ]

Stock de sécurité
[ 1 ]

Seuil de réapprovisionnement
[ 3 ]
20. EMPLACEMENT

Ne pas demander simplement :

Emplacement : magasin

Utiliser une hiérarchie :

Site
[ Garage principal ]

Zone
[ Magasin ]

Rayon
[ Électricité ]

Étagère
[ B2 ]

Niveau
[ 3 ]

Case
[ 04 ]

Afficher :

Garage principal
└── Magasin
    └── Électricité
        └── B2
            └── Niveau 3
                └── Case 04
21. QUANTITÉ INITIALE

Afficher :

Stock initial

Quantité
[ 4 ]

État
[ Disponible ]

Lot
[ BAT-2026-09 ]

Date de réception
[ 09/09/2026 ]

Date de fabrication
[ 08/2026 ]

Date d'expiration
[ — ]

Emplacement
[ Garage principal / Magasin / Électricité / B2 / N3 / C04 ]
IMPORTANT

L'utilisateur ne doit pas simplement modifier :

stocks.quantity = 4

Il faut créer un mouvement de stock initial.

Par exemple :

OPENING_BALANCE

ou :

INITIAL_RECEIPT

avec :

article
variante
quantité
utilisateur
date
emplacement
motif
22. ÉTAPE 8 — VÉRIFICATION AVANT ENREGISTREMENT

Avant de créer définitivement l'article, afficher un écran de synthèse.

Vérification
┌─────────────────────────────────────────────┐
│ RÉSUMÉ                                      │
├─────────────────────────────────────────────┤
│                                             │
│ Batterie AGM Start & Stop 70 Ah             │
│                                             │
│ Domaine : Pièces automobiles                │
│ Catégorie : Batterie                        │
│ Type : AGM                                  │
│                                             │
│ 12 V                                        │
│ 70 Ah                                       │
│ 760 A EN                                    │
│ 278 × 175 × 190 mm                          │
│                                             │
│ Référence principale :                      │
│ BAT-AGM-70-760                              │
│                                             │
│ Références secondaires : 3                  │
│ Compatibilités : 6                          │
│ Fournisseurs : 2                            │
│                                             │
│ Stock initial : 4 pièces                    │
│ Emplacement : B2 / N3 / C04                │
│                                             │
│ [← Modifier]      [✓ Enregistrer]           │
└─────────────────────────────────────────────┘
23. CONTRÔLES AVANT COMMIT

Avant d'appeler la transaction finale, exécuter toutes les validations.

Identité
✓ Nom présent
✓ Domaine présent
✓ Catégorie présente
Variante
✓ SKU valide
✓ Référence principale présente
✓ Pas de doublon exact
Caractéristiques
✓ attributs obligatoires présents
✓ unités valides
✓ valeurs dans les plages autorisées
Références
✓ références normalisées
✓ aucune référence unique déjà utilisée
Compatibilité
✓ véhicules valides
✓ années cohérentes
✓ motorisation cohérente
Stock
✓ quantité >= 0
✓ minimum <= maximum
✓ sécurité cohérente
✓ emplacement valide
24. TRANSACTION D'ENREGISTREMENT

L'enregistrement complet doit être transactionnel.

Conceptuellement :

BEGIN TRANSACTION

1. créer / récupérer catégorie
2. créer ARTICLE
3. créer VARIANTE
4. enregistrer attributs ARTICLE
5. enregistrer attributs VARIANTE
6. enregistrer référence principale
7. enregistrer références secondaires
8. enregistrer équivalences
9. enregistrer compatibilités
10. enregistrer fournisseurs
11. enregistrer unités
12. enregistrer prix
13. créer emplacement si nécessaire
14. créer lot si nécessaire
15. créer stock
16. créer mouvement de stock initial
17. créer événement d'audit
18. recalculer index de recherche

COMMIT

Si une seule étape critique échoue :

ROLLBACK

Aucun article partiellement créé ne doit rester en base.

25. ÉVÉNEMENT D'AUDIT

Créer automatiquement :

ARTICLE_CREATED

avec :

Utilisateur
Date / heure
Article
Variante
Action
Données concernées

Puis :

STOCK_INITIALIZED

avec :

+4 pièces
Emplacement B2/N3/C04
Utilisateur
Date
Motif
26. APRÈS ENREGISTREMENT

L'application ne doit pas simplement afficher :

Article créé.

Elle doit rediriger vers la fiche complète.

Fiche article
Batterie AGM Start & Stop 70 Ah

[Modifier] [Ajouter stock] [Commander] [Mouvement] [...]

────────────────────────────────────────────

IDENTIFICATION
Marque
État
Origine
Catégorie

────────────────────────────────────────────

CARACTÉRISTIQUES
12 V
70 Ah
760 A
AGM
278 × 175 × 190 mm
...

────────────────────────────────────────────

RÉFÉRENCES
BAT-AGM-70-760
AGM70-760
...

────────────────────────────────────────────

COMPATIBILITÉ
Toyota RAV4...
BMW...
Mercedes...

────────────────────────────────────────────

STOCK

Disponible : 4
Réservé : 0
Bloqué : 0
En commande : 0

Emplacement :
Magasin / Électricité / B2 / N3 / C04

────────────────────────────────────────────

FOURNISSEURS

Fournisseur ABC
85 000 FCFA

────────────────────────────────────────────

HISTORIQUE

09/09/2026
Article créé

09/09/2026
Stock initial +4
27. TESTER IMMÉDIATEMENT LA RECHERCHE

Une fois enregistré, vérifier que le produit est retrouvable avec :

Batterie AGM

mais également :

AGM 70
70Ah
760A
BAT-AGM-70-760
AGM70-760
12V 70Ah

et :

Toyota RAV4 2.5 Hybrid
28. TEST DE RECHERCHE COMBINÉE

Le système doit également permettre :

Batterie
+
AGM
+
70 Ah
+
Toyota RAV4

et retourner notre produit.

Mais surtout, il doit expliquer :

Pourquoi ce résultat correspond ?

✓ Catégorie : Batterie
✓ Technologie : AGM
✓ Capacité : 70 Ah
✓ Véhicule : Toyota RAV4
✓ Référence : BAT-AGM-70-760
29. TEST DE DÉDOUBLONNAGE APRÈS CRÉATION

Maintenant tenter de créer :

Batterie AGM 70Ah 760A

avec :

BAT AGM 70 760

Le système doit reconnaître l'article existant.

Afficher :

⚠ DOUBLON POTENTIEL

Un article existant correspond fortement :

Batterie AGM Start & Stop 70 Ah

Référence :
BAT-AGM-70-760

Correspondances :
✓ Technologie AGM
✓ 70 Ah
✓ 760 A
✓ 12 V
✓ Dimensions
✓ Référence normalisée

[Utiliser l'article existant]

[Créer quand même]

[Annuler]
30. LE TEST LE PLUS IMPORTANT : CRÉER UNE DEUXIÈME VARIANTE

Créer ensuite :

Batterie AGM 80 Ah 800 A

Même catégorie.

Même marque.

Même technologie.

Mais :

80 Ah
800 A
315 × 175 × 190 mm

Le système doit créer :

ARTICLE
Batterie automobile AGM

    ├── VARIANTE
    │   70 Ah / 760 A
    │
    └── VARIANTE
        80 Ah / 800 A
INTERDICTION

Ne jamais fusionner ces variantes parce que :

même catégorie
même technologie
même marque
31. CE QUE CE SCÉNARIO DOIT PROUVER

Après implémentation, je veux être capable de démontrer que ton moteur peut gérer :

Identité
ARTICLE
VARIANTE
Classification
DOMAIN
FAMILY
CATEGORY
SUBCATEGORY
TYPE
Caractéristiques
ATTRIBUTS DYNAMIQUES
Identification
SKU
OEM
FABRICANT
FOURNISSEUR
EAN
GTIN
ANCIENNE RÉFÉRENCE
ALIAS
Relations
ÉQUIVALENCE
SUBSTITUTION
SUPERSESSION
COMPATIBILITÉ
INCOMPATIBILITÉ
Stock
QUANTITÉ
LOT
EMPLACEMENT
MOUVEMENT
RÉSERVATION
BLOCAGE
Recherche
EXACTE
NORMALISÉE
TEXTUELLE
TECHNIQUE
VÉHICULE
COMBINÉE
Traçabilité
QUI
QUAND
QUOI
POURQUOI
OÙ
32. MAIS NE T'ARRÊTE PAS À LA BATTERIE

Une fois ce scénario fonctionnel, reproduis exactement le même principe avec au minimum ces objets :

Objet	Pourquoi il est important
Plaquette de frein	position + compatibilité + dimensions
Disque de frein	diamètre + épaisseur + diamètre centrage + trous
Filtre à huile	références multiples + compatibilité
Huile moteur 5W-30	viscosité + normes + volume + lot + péremption
Pneumatique 225/45 R17	dimensions structurées + indice charge/vitesse
Injecteur	référence + débit + moteur + codification
Batterie AGM	cas complexe ci-dessus
Ampoule LED	culot + puissance + tension
Courroie	longueur + largeur + nombre de nervures
Roulement	dimensions + références croisées
Rétroviseur	côté + électrique + chauffant + rabattable
Calculateur ECU	référence + véhicule + programmation
Connecteur électrique	nombre de voies + type + compatibilité
Liquide de frein DOT 4	norme + conditionnement + lot
Graisse	type + viscosité + conditionnement
Clé dynamométrique	outil + numéro inventaire + calibration
Valise diagnostic	outil + série + logiciel
Coffret 108 outils	kit + composants + exemplaires
Pont élévateur	équipement + actif + maintenance
Station climatisation	équipement + calibration + maintenance
Prestation diagnostic	service sans stock
33. TEST ULTIME : UN OBJET QUE LE DÉVELOPPEUR N'AVAIT PAS PRÉVU

Après tous ces tests, créer une nouvelle catégorie :

Borne de recharge véhicule électrique

avec des attributs :

Puissance
Type de connecteur
Nombre de phases
Courant maximal
Tension
Mode de charge
Indice IP
Longueur câble
Wi-Fi
Bluetooth

sans modifier le code source du formulaire.

Si le système permet :

Créer catégorie
↓
Créer template
↓
Ajouter attributs
↓
Créer article
↓
Saisir valeurs
↓
Enregistrer
↓
Rechercher

alors nous avons réellement obtenu le catalogue universel que nous cherchons.

34. RÈGLE FONDAMENTALE POUR TON IMPLÉMENTATION

Tu ne dois pas implémenter uniquement “le formulaire Batterie”.

Le formulaire Batterie n'est qu'un cas de démonstration du moteur universel.

L'architecture doit produire :

             MOTEUR DE CATALOGUE
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   Catégories    Templates    Attributs
        │            │            │
        └────────────┼────────────┘
                     ↓
              FORMULAIRE ADAPTATIF
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Article    Variante    Exemplaire
          │          │          │
          └──────────┼──────────┘
                     ↓
              Relations métier
                     ↓
             Stock / actifs
                     ↓
               Historique
                     ↓
                Recherche
Et surtout : l'IA doit travailler dans cet ordre

1. Inspecter le code existant.
2. Identifier les tables, services, composants, routes et pages déjà implémentés.
3. Identifier ce qui manque pour réaliser exactement ce scénario.
4. Ne pas créer une deuxième architecture parallèle.
5. Implémenter d'abord le moteur générique.
6. Implémenter ensuite le scénario Batterie comme premier cas réel.
7. Vérifier que le scénario fonctionne de bout en bout.
8. Réutiliser exactement le moteur pour les autres catégories.
9. Tester la création d'une nouvelle catégorie sans modification du code.
10. Tester la recherche de bout en bout.

Critère de réussite absolu

Je ne considère pas le module terminé parce que les tables existent ou parce qu'un seed fonctionne. Je considère le module terminé lorsque, depuis l'interface, un utilisateur peut créer cet article complexe, le système peut le valider, éviter un doublon, créer ses variantes, références, attributs, compatibilités, fournisseurs et stock, enregistrer toutes les opérations de manière transactionnelle et traçable, puis retrouver exactement le produit par référence, caractéristique, véhicule ou combinaison de critères.