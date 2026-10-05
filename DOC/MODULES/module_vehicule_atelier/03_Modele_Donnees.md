# 03 – Modèle de Données

## Entités principales et relations

```
Client 1 ────────── * Véhicule
   │
   │ 1
   │
   └────────────── * DossierIntervention
                        │
                        ├── * LigneDiagnostic
                        ├── * LigneDevis
                        ├── * LigneTravail (Main d’œuvre)
                        ├── * LignePiece (Pièces sorties)
                        ├── * Photo / Document
                        └── * Facture (via table de liaison)
```

---

## 1. Client

| Attribut              | Type          | Obligatoire | Notes |
|-----------------------|---------------|-------------|-------|
| id                    | UUID / Int    | Oui         | Clé primaire |
| type                  | Enum          | Oui         | Particulier / Entreprise |
| nom                   | String        | Oui         | |
| prenom                | String        | Non         | |
| raison_sociale        | String        | Non         | Si entreprise |
| telephone_principal   | String        | Oui         | |
| telephone_secondaire  | String        | Non         | |
| email                 | String        | Non         | |
| adresse               | Text          | Non         | |
| created_at            | DateTime      | Oui         | |
| updated_at            | DateTime      | Oui         | |

---

## 2. Véhicule

| Attribut              | Type          | Obligatoire | Notes |
|-----------------------|---------------|-------------|-------|
| id                    | UUID / Int    | Oui         | |
| client_id             | FK            | Oui         | Propriétaire |
| immatriculation        | String        | Oui         | Unique recommandé |
| numero_chassis        | String        | Fortement   | |
| marque                | String        | Oui         | |
| modele                | String        | Oui         | |
| version               | String        | Non         | |
| annee                 | Integer       | Non         | |
| couleur               | String        | Non         | |
| type_vehicule         | Enum          | Oui         | VP / VU / PL / Moto / etc. |
| energie               | Enum          | Non         | Essence / Diesel / Hybride / Élec |
| date_mise_en_circulation | Date       | Non         | |
| created_at            | DateTime      | Oui         | |

**Note** : L’outillage/accessoires est stocké au niveau du **DossierIntervention** (car il peut changer) ou dans une table d’historique d’état du véhicule.

---

## 3. DossierIntervention (Ordre de Réparation)

| Attribut                  | Type          | Obligatoire | Notes |
|---------------------------|---------------|-------------|-------|
| id                        | UUID / Int    | Oui         | |
| numero                    | String        | Oui         | Ex: OR-2026-00482 (unique) |
| vehicule_id               | FK            | Oui         | |
| client_id                 | FK            | Oui         | Dénormalisé pour perf |
| statut                    | Enum          | Oui         | Voir Cycle de vie |
| type_intervention         | Enum          | Oui         | Atelier / Dépannage / Entretien… |
| date_reception            | DateTime      | Oui         | |
| kilometrage_entree        | Integer       | Oui         | |
| kilometrage_sortie        | Integer       | Non         | |
| niveau_carburant_entree   | Enum          | Non         | Vide / 1/4 / 1/2 / 3/4 / Plein |
| pannes_declarees          | Text          | Non         | |
| observations_reception    | Text          | Non         | |
| receptionniste_id         | FK User       | Oui         | |
| technicien_principal_id   | FK User       | Non         | |
| date_fermeture            | DateTime      | Non         | Rempli à la clôture définitive |
| created_at / updated_at   | DateTime      | Oui         | |

---

## 4. Check-list Outillage / Accessoires (liée au Dossier)

Table `DossierOutillage` ou JSON dans le dossier :

- cric
- cle_de_roue
- manivelle
- roue_de_secours
- extincteur
- radio
- triangle
- cd
- documents
- parapluie
- pieces_du_vehicule
- nattes
- bougies
- huile_de_frein
- sacs
- bache
- boite_a_pharmacie
- autres (texte libre)

Chaque élément = Boolean (présent / absent) + éventuelle observation.

---

## 5. LignePiece (Sortie de stock)

| Attribut                | Type      | Obligatoire | Notes |
|-------------------------|-----------|-------------|-------|
| id                      | UUID      | Oui         | |
| dossier_id              | FK        | Oui         | **Obligatoire** |
| produit_id              | FK        | Oui         | Lien vers le stock |
| quantite                | Decimal   | Oui         | |
| prix_achat              | Decimal   | Oui         | Figé au moment de la sortie |
| prix_vente              | Decimal   | Oui         | |
| mouvement_stock_id      | FK        | Oui         | Lien vers le mouvement de stock |
| created_at              | DateTime  | Oui         | |

**Règle absolue** : On ne peut pas créer de LignePiece sans dossier_id valide et ouvert.

---

## 6. Autres tables importantes

- **LigneDiagnostic** : description, gravité, photos, technicien
- **LigneDevis** : peut provenir d’un diagnostic + pièces + MO
- **LigneTravail** : libellé, temps barémé, temps réel, taux horaire, technicien
- **Facture** + table de liaison `FactureDossier`
- **HistoriqueActions** : qui a modifié quoi et quand (audit trail)

---

## Relations clés à respecter

1. Un DossierIntervention appartient à **un** Véhicule et **un** Client.
2. Une LignePiece appartient à **un** DossierIntervention.
3. Un MouvementStock de type « Sortie » doit avoir un `dossier_intervention_id` non null.
4. Une Facture peut être liée à **un ou plusieurs** Dossiers du même client.
