# Modèle de données cible (synthèse)

## Articles / Catalogue
- `categories` (arborescence)
- `produit_articles` → ARTICLE conceptuel
- `produits` → VARIANTE / SKU (ou exemplaire si OUTIL)
- `produit_references_equiv`
- `compatibilites_produits`
- `article_attributs` (dynamiques)
- `article_documents`
- `produit_unites` (conversions)
- `stocks` (par variante × emplacement)
- `stocks_lots` / `lots`
- `mouvements_stock`

## Outillage
- `prets_outils`
- `outillage_maintenance`
- `outillage_calibration`
- `kits_lignes` (composition kit)
- Réutilisation de `produit_articles` + `produits` (type OUTIL/EQUIPEMENT)

## Emplacements
- Arborescence existante : Site → … → Casier
- Emplacement spécial **Bureau**

## Règles d’intégrité
- Variante sans article parent → interdit
- Exemplaire en prêt → pas de 2ᵉ prêt actif
- SORTIE_OR → `or_id` obligatoire
- Mouvement toujours tracé (user, date, type, quantités, origines/destinations)
