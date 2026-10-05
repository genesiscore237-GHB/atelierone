# 06 – Architecture Technique & Recommandations

## 1. Stack technique recommandée

**Backend :**
- Laravel / Node.js (NestJS) / Django / ou équivalent moderne
- Base de données : PostgreSQL (recommandé) ou MySQL

**Frontend :**
- React / Vue.js / Livewire / ou équivalent
- Design system simple et robuste (Tailwind + composants)
- Compatible tablette (viewport mobile-first)

**Autres :**
- Authentification avec rôles (Laravel Sanctum / JWT / etc.)
- Possibilité future de lecture barcode/QR (prévoir le champ)

---

## 2. Structure de projet recommandée

```
garage-module/
├── app/
│   ├── Models/
│   │   ├── Tool.php
│   │   ├── ToolMovement.php
│   │   ├── Part.php
│   │   ├── PartMovement.php
│   │   ├── OilProduct.php
│   │   ├── OilStock.php
│   │   ├── OilMovement.php
│   │   └── Supplier.php
│   ├── Http/Controllers/
│   │   ├── ToolController.php
│   │   ├── PartController.php
│   │   ├── OilController.php
│   │   └── DashboardController.php
│   ├── Services/          # Logique métier (CheckOutService, StockService…)
│   └── Enums/             # ToolStatus, MovementType…
├── database/migrations/
├── resources/views/ ou frontend/
└── routes/
```

---

## 3. Points techniques importants

### Stock
- Toujours calculer `quantity_available` de façon fiable
- Utiliser des transactions pour les mouvements critiques
- Empêcher les stocks négatifs au niveau base de données + application

### Huiles
- Implémenter une logique FIFO (First In First Out) pour la déduction des fûts
- Stocker les volumes en `DECIMAL` (précision 2 ou 3)

### Recherche
- Indexer les champs `reference` et `name`
- Utiliser une recherche full-text ou un moteur simple très rapide

### Historique
- Ne jamais supprimer les mouvements
- Créer un mouvement inverse en cas de correction

### Performance
- Pagination sur les listes
- Cache léger sur le dashboard
- Eager loading des relations

---

## 4. Migrations prioritaires

1. suppliers
2. tools
3. tool_movements
4. parts
5. part_movements
6. oil_products
7. oil_stocks
8. oil_movements

---

## 5. Tests recommandés

- Sortie d’outil → quantité disponible diminue
- Retour d’outil OK → quantité disponible augmente
- Sortie de pièce supérieure au stock → erreur
- Sortie d’huile supérieure au volume restant → erreur
- Recherche de pièce existante vs inexistante
- Alertes de seuil

---

## 6. Évolutions futures possibles

- Intégration barcode / QR scanner
- Application mobile native
- Lien fort avec le module Ordres de Réparation existant
- Prévision de consommation d’huile
- Export Excel / PDF des stocks
- Multi-magasins / multi-emplacements avancés

---

**Fin de la documentation technique.**
