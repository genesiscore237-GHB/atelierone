# Module A — Catalogue / Stock général

## 1. Fiche Article (référentiel)

| Champ | Obligatoire | Notes |
|-------|-------------|-------|
| Code article interne | Oui | Unique, auto ou manuel |
| Code-barres / QR | Non | Pour scan |
| Désignation | Oui | |
| Désignation longue | Non | |
| Type | Oui | PIECE / CONSOMMABLE / OUTIL / EQUIPEMENT / SERVICE |
| Catégorie | Oui | Arborescence (ex. Freinage > Plaquettes > Avant) |
| Marque | Non | |
| Réf. fabricant / OEM | Non | Recherche croisée |
| Réf. fournisseur principal | Non | |
| Unité de stock | Oui | U, L, kg, jeu, boîte… |
| Prix d’achat | **Non** (nullable) | |
| Prix de vente HT | **Non** (nullable) | Modifiable à la ligne d’OR |
| TVA par défaut | Non | |
| Seuil d’alerte global | Non | |
| Gestion par lot / n° série | Non | Utile pour certains outils et pièces |
| Actif | Oui | Soft delete |

**Règle prix** : le prix sur la fiche est indicatif.  
La ligne d’OR porte **son propre prix** (négociation client, promo, etc.).

## 2. Catégories arborescentes (proposition)

```
Pièces
├── Moteur & Distribution
├── Freinage
├── Suspension & Direction
├── Électricité & Électronique
├── Transmission
├── Carrosserie & Habitacle
└── Filtration & Allumage

Consommables
├── Fluides (huiles, liquide frein, clim…)
├── Graisses & Produits chimiques
└── Consommables atelier (serre-câbles, chiffons…)

Outillage
├── Manuel
├── Électroportatif
├── Levage & Support
├── Diagnostic & Mesure
└── Spécialisé (valises constructeur…)

Équipements
└── (ponts, stations, etc.)

Services
└── Sous-traitance, prestations
```

## 3. Stock multi-emplacements

Pour chaque article × emplacement :
- Quantité en stock
- Quantité réservée
- Quantité disponible (= stock − réservé)
- Seuil d’alerte **local** (ex. bureau : huile < 3)
- Emplacement physique (rayon / casier) optionnel

## 4. Fonctions catalogue

- Recherche puissante (code, code-barres, désignation, marque, OEM, catégorie)
- Ajout rapide d’article à la volée (formulaire minimal)
- Fiche article complète (onglets : général, stock par emplacement, mouvements, fournisseurs)
- Inventaire (par emplacement ou global)
- Transfert entre emplacements (Magasin → Magasin, Magasin → Bureau)

## 5. Bonnes pratiques expert

- Un seul code article = une réalité physique (pas de doublons « huile 5W40 Castrol » x3)
- Les variantes (contenance, viscosité) = articles distincts ou attributs selon complexité
- ABC : les articles à rotation rapide ont un seuil d’alerte plus fin au bureau
