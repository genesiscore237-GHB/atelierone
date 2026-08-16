# 02 — MODÈLE DE DONNÉES
## Module Stock

### 1. Principes

- Toute quantité est stockée dans l’**unité de base** de l’article.
- Les conversions (reconditionnement) sont explicites et historisées.
- Aucun mouvement n’est jamais physiquement supprimé (statut annulé ou mouvement inverse).
- Chaque mouvement porte : type, quantités, emplacement source/destination, document lié, utilisateur, timestamp, commentaire.

### 2. Entités principales

#### 2.1 Article (Product / Item)
| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| id | UUID/PK | Oui | |
| code_article | String unique | Oui | Code interne (ex: FIL-HUI-001) |
| designation | String | Oui | Nom complet |
| designation_courte | String | Non | |
| categorie_id | FK | Oui | Lien typologie |
| sous_categorie_id | FK | Non | |
| marque | String | Non | |
| ref_oem | String | Non | Référence constructeur |
| ref_aftermarket | String | Non | |
| unite_base | Enum/String | Oui | Pce, Litre, Kg, Jeu, Kit, Bidon… |
| unite_achat | String | Non | Si différente |
| coefficient_conversion | Decimal | Non | Pour reconditionnement |
| prix_achat_moyen (PMP) | Decimal | Calculé | |
| dernier_prix_achat | Decimal | Non | |
| prix_vente_ht | Decimal | Non | |
| qte_min | Decimal | Oui | Seuil d’alerte |
| qte_max | Decimal | Non | |
| qte_stock_actuel | Decimal | Calculé | Somme des mouvements |
| emplacement_principal_id | FK | Non | |
| statut | Enum | Oui | Actif, Inactif, Obsolète, Hors série |
| est_reconditionnable | Boolean | Non | true pour huiles en fût notamment |
| notes | Text | Non | |
| created_at / updated_at | DateTime | Oui | |

#### 2.2 Categorie / SousCategorie
- Structure hiérarchique simple (Catégorie → Sous-catégorie)
- Exemples : Filtres > Huile, Freinage > Plaquettes, Lubrifiants > Huile moteur, etc.

#### 2.3 Emplacement (Location)
| Champ | Description |
|-------|-------------|
| code | Ex: A-01-03 (Allée-Rayon-Niveau/Bac) |
| zone | Magasin principal, Bureau Patron (temporaire), Site 2… |
| type | Étagère, Sol, Tiroir, Extérieur, Frigo… |
| capacite_indicative | Optionnel |
| actif | Boolean |

#### 2.4 MouvementStock (Stock Move) — Cœur du système
| Champ | Description |
|-------|-------------|
| id | |
| type_mouvement | Entrée, Sortie, Transfert, Ajustement+, Ajustement-, Reconditionnement Source, Reconditionnement Destination, Perte, Vol, Casse, Retour… |
| article_id | |
| quantite | Toujours en unité de base (signe selon type) |
| quantite_abs | Valeur absolue |
| emplacement_source_id | |
| emplacement_dest_id | |
| document_type | OR, Facture, Bon de commande, Inventaire, Ajustement manuel… |
| document_id | ID du document lié |
| vehicule_id / or_id | Si sortie atelier |
| prix_unitaire | Pour valorisation |
| montant | |
| motif | Obligatoire pour Perte/Vol/Casse/Ajustement |
| user_id | Qui a fait le mouvement |
| date_mouvement | |
| commentaire | |
| statut | Validé, Annulé |

#### 2.5 Reconditionnement (spécifique)
Opération qui crée **deux mouvements liés** :
1. Sortie du fût (quantité en litres ou kg)
2. Entrée des unités reconditionnées (bidons de 5L, 1L…)

Champs additionnels : ratio, quantités source/destination, lot éventuel.

#### 2.6 Inventaire
- Entête (date, responsable, statut : Brouillon / Validé / Clôturé)
- Lignes : article, emplacement, qte théorique, qte physique, écart, motif écart

#### 2.7 Fournisseur & Commande (lien)
- Réutiliser ou étendre le module Achats/Fournisseurs existant.
- Lien Commande → Réception → Mouvements d’entrée.

### 3. Règles de calcul

- **Stock actuel** = somme algébrique de tous les mouvements validés de l’article (et éventuellement par emplacement).
- **PMP** (Prix Moyen Pondéré) mis à jour à chaque entrée valorisée.
- Les sorties valorisées au PMP du moment (ou dernier prix selon paramétrage).

### 4. Index recommandés

- article.code_article (unique)
- mouvement.article_id + date
- mouvement.document_type + document_id
- emplacement.code
