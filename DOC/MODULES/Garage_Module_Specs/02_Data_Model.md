# 02 – Modèle de Données Complet

## Entités principales

### 1. Tool (Outil)

| Champ                  | Type          | Description                                      | Obligatoire |
|------------------------|---------------|--------------------------------------------------|-------------|
| id                     | UUID / BigInt | Identifiant unique                               | Oui        |
| reference              | String        | Référence interne unique                         | Oui        |
| name                   | String        | Nom de l’outil                                   | Oui        |
| category               | String        | Catégorie (Clé, Douille, Diagnostic…)            | Oui        |
| brand                  | String        | Marque                                           | Non        |
| model                  | String        | Modèle                                           | Non        |
| quantity_total         | Integer       | Quantité totale                                  | Oui        |
| quantity_available     | Integer       | Quantité disponible                              | Oui        |
| location               | String        | Emplacement (Casier A3, Ombre Board…)            | Non        |
| status                 | Enum          | available, in_use, under_repair, worn, broken, lost, stolen, scrapped | Oui |
| purchase_date          | Date          | Date d’achat                                     | Non        |
| purchase_price         | Decimal       | Prix d’achat                                     | Non        |
| supplier_id            | FK            | Fournisseur                                      | Non        |
| barcode / qr_code      | String        | Code-barres ou QR                                | Non        |
| notes                  | Text          | Notes                                            | Non        |
| created_at / updated_at| Timestamp     |                                                  | Oui        |

---

### 2. ToolMovement (Mouvement d’outil)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| tool_id              | FK        | Outil concerné                                   |
| movement_type        | Enum      | check_out, check_in, lost, broken, repair…       |
| user_id              | FK        | Qui a effectué le mouvement                      |
| mechanic_id          | FK        | Mécanicien concerné (si check-out)               |
| repair_order_id      | FK        | Lié à une réparation (optionnel)                 |
| expected_return_at   | DateTime  | Date de retour prévue                            |
| returned_at          | DateTime  | Date de retour réelle                            |
| condition_on_return  | Enum      | ok, worn, broken, missing                        |
| notes                | Text      |                                                  |
| created_at           | Timestamp |                                                  |

---

### 3. Part (Pièce)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| reference            | String    | Référence constructeur / interne                 |
| name                 | String    | Désignation                                      |
| category             | String    | Catégorie                                        |
| type                 | Enum      | new, used, recovered                             |
| quantity             | Decimal   | Quantité en stock                                |
| unit                 | String    | pièce, set, litre…                               |
| location             | String    | Emplacement physique                             |
| min_stock            | Decimal   | Seuil d’alerte                                   |
| max_stock            | Decimal   | Seuil maximum                                    |
| cost_price           | Decimal   | Prix de revient                                  |
| selling_price        | Decimal   | Prix de vente (optionnel)                        |
| supplier_id          | FK        |                                                  |
| is_active            | Boolean   |                                                  |
| notes                | Text      |                                                  |
| created_at / updated_at | Timestamp |                                            |

---

### 4. PartMovement (Mouvement de pièce)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| part_id              | FK        |                                                  |
| movement_type        | Enum      | in, out, adjustment, loss, return                |
| quantity             | Decimal   |                                                  |
| reason               | Enum      | repair, stock_replenishment, loss, inventory…    |
| repair_order_id      | FK        | Si lié à une réparation                          |
| user_id              | FK        | Qui a fait le mouvement                          |
| notes                | Text      |                                                  |
| created_at           | Timestamp |                                                  |

---

### 5. OilProduct (Type d’huile)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| name                 | String    | Ex: 5W30 Synthétique                             |
| viscosity            | String    | 5W30, 10W40…                                     |
| brand                | String    |                                                  |
| type                 | String    | Moteur, Boîte, Différentiel…                     |
| unit                 | String    | litre                                            |
| min_stock_liters     | Decimal   | Seuil d’alerte                                   |

---

### 6. OilStock (Stock d’huile – fûts)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| oil_product_id       | FK        |                                                  |
| initial_volume_liters| Decimal   | Volume du fût à l’arrivée                        |
| remaining_volume     | Decimal   | Volume restant                                   |
| purchase_date        | Date      |                                                  |
| supplier_id          | FK        |                                                  |
| batch_number         | String    | Numéro de lot                                    |
| status               | Enum      | open, closed, empty                              |
| location             | String    |                                                  |
| created_at           | Timestamp |                                                  |

---

### 7. OilMovement

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| oil_stock_id         | FK        |                                                  |
| oil_product_id       | FK        |                                                  |
| quantity_liters      | Decimal   | Quantité sortie ou entrée                        |
| movement_type        | Enum      | in, out                                          |
| repair_order_id      | FK        | Si lié à une vidange                             |
| user_id              | FK        |                                                  |
| notes                | Text      |                                                  |
| created_at           | Timestamp |                                                  |

---

### 8. Supplier (Fournisseur)

| Champ                | Type      | Description                                      |
|----------------------|-----------|--------------------------------------------------|
| id                   | UUID      |                                                  |
| name                 | String    |                                                  |
| contact              | String    |                                                  |
| phone                | String    |                                                  |
| email                | String    |                                                  |
| notes                | Text      |                                                  |

---

### 9. RepairOrder (référence externe)

Le module doit pouvoir se lier à une table `RepairOrder` existante (id, vehicle, customer, status…).

---

## Relations clés

- Tool 1 ——— N ToolMovement
- Part 1 ——— N PartMovement
- OilProduct 1 ——— N OilStock
- OilStock 1 ——— N OilMovement
- RepairOrder 1 ——— N PartMovement / ToolMovement / OilMovement
- User 1 ——— N tous les mouvements
