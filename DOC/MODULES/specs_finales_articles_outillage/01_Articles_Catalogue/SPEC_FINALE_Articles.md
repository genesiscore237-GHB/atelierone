# SPEC FINALE — Module Articles & Catalogue

## 1. Familles (13) — conservées et validées

Pièces mécaniques · Pièces moteur · Électricité & Électronique · Carrosserie & Tôlerie · Peinture & Préparation · Lubrifiants & Fluides · Pneumatiques · Jantes & Accessoires · Consommables d’atelier · Outillage · Équipements de garage · Équipements de sécurité · Accessoires automobiles.

Extensibles à la volée.

## 2. Écran « Nouvel article / Fiche article » — structure validée

### Onglets
`Identification | Variantes | Stock | Compatibilité | Technique | Équivalences | Traçabilité | Documents | Comptable | Historique`

### BLOC Identification (toujours visible)
- Type* (PIECE / CONSOMMABLE / OUTIL / EQUIPEMENT / SERVICE)
- Catégorie* (famille → sous-catégorie)
- Désignation* + nom court + description
- Marque, fabricant, réf. fabricant, réf. OEM, réf. constructeur
- Code interne, code-barres, QR, photo
- Statut (Actif / Inactif / Obsolète / Archivé)

### BLOC Variantes (cœur du modèle)
Tableau des SKU :
- Marque, référence, conditionnement, unité
- Prix achat / vente (nullable)
- Stock total + stock bureau
- Code-barres
- Actions : ajouter / éditer / désactiver variante

**Règle** : on ne crée pas un nouvel article pour chaque marque ou conditionnement.

### BLOC Stock
- Par variante × emplacement (Magasin 1…4, Bureau)
- Seuils : min, max, sécurité, point de commande
- Quantités : stock, réservée, disponible, en commande, bloquée
- Emplacement physique : Rayon → Étagère → Casier
- Vue magasinier : « où se trouve X »

### BLOC Unités & conversions
- Unité de base + unités alternatives (carton, bidon, jeu…)
- Facteurs de conversion explicites

### BLOC Prix & achats
- Prix achat HT, frais, coût d’acquisition
- Prix vente HT, prix pro / particulier, prix mini
- Fournisseur principal + secondaires
- Délai, qté mini commande, dernier / moyen prix d’achat

### BLOC Compatibilité véhicules
- Relation N véhicules : marque, modèle, version, années, motorisation, code moteur, position…
- Références OEM / équivalentes liées

### BLOC Technique (dynamique)
Presets par famille (pneu, batterie, huile, filtre, bougie…) + attributs libres clé/valeur/unité.

### BLOC Traçabilité
- Suivi série et/ou lot selon la variante
- DLC / date fabrication
- Garantie

### BLOC Comptable
- Compte, centre de coût, méthode valorisation (CUMP / FIFO)
- Taxable / non taxable

### BLOC Documents & Historique
- Fiches techniques, factures, photos
- Mouvements agrégés de toutes les variantes

## 3. Règles non négociables

1. Stock / prix / code-barres = niveau **variante**.
2. Recherche multi-critères (code, désignation, marque, OEM, **équivalence**).
3. Prix catalogue indicatif ; prix réel sur ligne d’OR.
4. Ajout article à la volée (formulaire minimal) autorisé.
5. SERVICE : pas de stock, pas d’emplacement.
6. Dans un OR on sélectionne **la variante exacte**.
