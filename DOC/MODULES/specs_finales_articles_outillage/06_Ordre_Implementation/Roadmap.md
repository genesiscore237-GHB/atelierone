# Ordre d’implémentation recommandé

## Phase A — Articles (si pas déjà à jour)
1. Vérifier/aligner `produit_articles` + `produits.articleId`
2. UI Variantes complète (ajout/édition)
3. Stock par emplacement + seuils + vue « où se trouve »
4. Unités & conversions exposées
5. Compatibilités + équivalences + attributs dynamiques
6. Recherche multi-références

## Phase B — Outillage (compléter l’existant)
1. Fiche exemplaire (onglets État / Localisation / Affectation / Historique)
2. Maintenance + Calibration (endpoints + UI + alertes 🟢🟠🔴)
3. Kits (composition + complétude)
4. QR code (génération + page scan actions)
5. Localisation fine + QR armoire
6. Blocage prêts si retard (option)

## Phase C — Intégration OR & Bureau
1. Depuis onglet Pièces d’un OR : servir variante exacte
2. Dotation conso + prêt outil liés OR
3. Alertes bureau dans tableau de bord

## Critères de done
- [ ] Aucun doublon article pour simple variante de marque/contenant
- [ ] 3 outils identiques = 3 exemplaires distincts
- [ ] Prêt impossible si déjà en prêt
- [ ] Retour ≠ OK exige remarque
- [ ] Toute sortie pièce porte un OR
- [ ] Recherche par réf. OEM / équivalente fonctionne
- [ ] Permissions respectées
