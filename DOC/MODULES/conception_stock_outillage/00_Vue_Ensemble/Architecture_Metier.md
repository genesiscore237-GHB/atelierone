# Architecture métier retenue

## 1. Modèle mental (expert)

```
                    CATALOGUE UNIQUE (Articles)
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   [Magasin 1]          [Magasin 2]  ...    [Bureau Magasinier]
   stock par rayon      stock par rayon      stock de distribution
          │                   │                   │
          └──────── transferts ───────────────────┘
                                                  │
                                    ┌─────────────┴─────────────┐
                                    ▼                           ▼
                             PRÊT OUTIL                  DOTATION CONSO
                          (technicien, retour)        (OR / technicien, sans retour)
```

## 2. Distinction fondamentale

| Nature | Comportement stock | Exemple |
|--------|--------------------|---------|
| **PIECE** | Sortie vers OR → consommée (ou retournée si non utilisée) | Plaquette de frein |
| **CONSOMMABLE** | Dotation / sortie → consommée, pas de retour unitaire | Huile, graisse, serpillière |
| **OUTIL** | Prêt → retour obligatoire (état contrôlé) | Clé dynamométrique, valise diag |
| **EQUIPEMENT** | Affectation longue / calibration | Pont, station clim |
| **SERVICE** | Pas de stock physique | Prestation sous-traitée |

## 3. Emplacements

- **Magasins généraux** (x4) : stock de fond, organisés par rayons/casiers
- **Bureau** : emplacement unique de distribution (le magasinier y tire depuis les magasins)
- Option futur : « En transit », « Chez technicien », « En réparation outil »

## 4. Principe de vérité

> La quantité disponible d’un article = somme des quantités par emplacement  
> Un mouvement change **toujours** au moins deux choses : origine et destination (ou statut).
