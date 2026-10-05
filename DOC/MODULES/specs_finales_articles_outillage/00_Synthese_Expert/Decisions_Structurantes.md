# Décisions structurantes (revue expert)

## 1. Un seul référentiel « Article », des comportements différents selon le type

| Type | Stock physique | Suivi | Prix | Exemple |
|------|----------------|-------|------|---------|
| PIECE | Oui (par variante) | Quantité + éventuellement lot | Facultatif | Plaquette Bosch BP1234 |
| CONSOMMABLE | Oui | Quantité + lot / DLC | Facultatif | Huile 5W30 5L |
| OUTIL | Oui (par exemplaire) | Exemplaire + prêt/retour | Souvent null | Clé dynamo FACOM n°12345 |
| EQUIPEMENT | Unité(s) | Exemplaire + maintenance/calibration | Valeur d’acquisition | Pont 4T |
| SERVICE | Non | Aucun | Obligatoire (tarif) | Géométrie, diagnostic |

## 2. Article ≠ Variante (pièces & consommables)

- **Article** = produit conceptuel (« Plaquette de frein avant RAV4 »)
- **Variante / SKU** = référence stockable (marque, réf, conditionnement, prix, stock)
- Stock, code-barres, prix = **toujours au niveau variante**

## 3. Modèle ≠ Exemplaire (outillage & équipements)

- **Modèle** = article de type OUTIL/EQUIPEMENT (« Clé dynamo FACOM 40-200 Nm »)
- **Exemplaire** = unité physique (OT-00041, n° série, état, emplacement, historique)
- Trois outils identiques = **trois exemplaires** distincts

## 4. Séparation des univers (mais lien dans l’OR)

```
STOCK (pièces, conso)  ≠  OUTILLAGE (prêt)  ≠  ÉQUIPEMENTS (machines)  ≠  SERVICES
```
Une intervention peut consommer les quatre en même temps.

## 5. Bureau du magasinier = emplacement de distribution

Les 4 magasins = stock de fond.  
Le bureau = point de sortie vers l’atelier (approvisionné par transferts tracés).

## 6. Variantes et conditionnements

Même huile 5W30 en 1L / 5L / 20L = **3 variantes** (pas 1 article avec 3 unités magiques).  
Les conversions d’unités restent possibles (1 carton = 12 bidons) mais chaque SKU commercial a son stock.
