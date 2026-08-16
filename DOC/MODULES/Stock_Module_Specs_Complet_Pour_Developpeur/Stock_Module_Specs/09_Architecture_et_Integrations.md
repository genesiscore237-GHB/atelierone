# 09 — ARCHITECTURE & INTÉGRATIONS

### 1. Principe d’intégration

Le module Stock doit s’intégrer proprement à l’architecture existante du projet (AtelierOne ou stack en cours d’utilisation).

**Nuance importante :**  
Si le projet est déjà sur Odoo, Django, Laravel, Node, etc., adapte les noms d’entités, les patterns (services, repositories, events) et les mécanismes d’authentification/droits à ce qui existe.  
Documente clairement chaque adaptation.

### 2. Points d’intégration obligatoires

| Module / Entité existante | Type d’intégration | Description |
|---------------------------|--------------------|-------------|
| Ordre de Réparation (OR) | Sortie de stock | Décrément + lien document |
| Véhicule | Traçabilité | Savoir sur quel véhicule la pièce est partie |
| Fournisseurs / Commandes | Entrée | Réception → mouvement d’entrée |
| Utilisateurs / RH | Audit | Qui a fait le mouvement |
| Facturation / Vente comptoir | Sortie | Lien optionnel |

### 3. Événements recommandés (si architecture event-driven)

- `stock.move.created`
- `stock.level.low`
- `stock.level.out`
- `stock.inventory.validated`
- `stock.reconditioning.done`

### 4. Recommandations techniques

- Transactions atomiques pour le reconditionnement et les inventaires
- Soft delete ou mouvement inverse uniquement
- Index sur les colonnes de recherche fréquente
- Historisation complète (jamais d’update destructif sur les quantités)
- Paramétrage centralisé des règles (stock négatif, méthode de valo, etc.)

### 5. Extensibilité future

Prévoir que l’on puisse plus tard :
- Ajouter la gestion de lots / numéros de série
- Connecter un catalogue type TecDoc
- Gérer plusieurs magasins / dépôts
