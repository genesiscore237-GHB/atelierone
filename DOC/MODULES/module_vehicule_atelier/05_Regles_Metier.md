# 05 – Règles Métier Strictes

Ces règles sont **non négociables**. Toute implémentation doit les respecter.

---

## 1. Règles de Stock (les plus critiques)

| # | Règle | Conséquence |
|---|-------|-------------|
| 1.1 | Aucune sortie de stock n’est possible sans `dossier_intervention_id` | Le système doit bloquer toute sortie « libre » |
| 1.2 | Une pièce ne peut être sortie que pour un dossier **ouvert** (non fermé définitivement) | Vérification du statut du dossier |
| 1.3 | La quantité sortie ne peut pas dépasser le stock disponible | Contrôle en temps réel |
| 1.4 | Tout mouvement de stock de type Sortie doit créer une `LignePiece` liée au dossier | Double écriture obligatoire |
| 1.5 | Les retours de pièces non utilisées doivent aussi être liés au dossier | Mouvement d’entrée justifié |
| 1.6 | On ne peut pas supprimer une LignePiece si le dossier est fermé | Protection de l’historique |

---

## 2. Règles de liaison Véhicule / Client

| # | Règle |
|---|-------|
| 2.1 | Un véhicule a **toujours** un client propriétaire |
| 2.2 | On ne peut pas supprimer un client s’il a des véhicules ou des dossiers |
| 2.3 | Le changement de propriétaire d’un véhicule doit être historisé |
| 2.4 | Un dossier d’intervention est toujours rattaché au client propriétaire **au moment de la réception** (même si le propriétaire change plus tard) |

---

## 3. Règles de modification des dossiers

| Statut du dossier | Diagnostic | Devis | Pièces | Travaux | Facture liée | Possible ? |
|-------------------|------------|-------|--------|---------|--------------|----------|
| Réceptionné       | Oui        | Oui   | Oui    | Oui     | Oui          | Oui      |
| En diagnostic     | Oui        | Oui   | Oui    | Oui     | Oui          | Oui      |
| Devis en cours    | Oui        | Oui   | Oui    | Oui     | Oui          | Oui      |
| Validé client     | Oui*       | Oui*  | Oui    | Oui     | Oui          | Oui      |
| En cours travaux  | Oui*       | Oui*  | Oui    | Oui     | Oui          | Oui      |
| Facturé           | Oui*       | Oui*  | Oui*   | Oui*    | Oui*         | Oui      |
| **Fermé définitif** | **Non**  | **Non** | **Non** | **Non** | **Non**    | **Non**  |

\* = modification possible mais doit être historisée et peut nécessiter un droit particulier.

---

## 4. Règles de facturation

| # | Règle |
|---|-------|
| 4.1 | Une facture peut regrouper plusieurs dossiers du **même client** |
| 4.2 | On ne peut pas facturer un dossier déjà entièrement facturé (sauf avoir / correction) |
| 4.3 | Les acomptes sont possibles dès la validation du devis |
| 4.4 | La facture finale doit pouvoir être générée même si le dossier n’est pas encore fermé |
| 4.5 | Une fois le dossier **fermé définitivement**, la facture liée ne peut plus être modifiée (sauf avoir) |

---

## 5. Règles de traçabilité (Audit)

Toute action suivante doit être enregistrée dans un journal d’audit :

- Création / modification / suppression de dossier
- Ajout / modification / suppression de ligne de diagnostic, devis, pièce, travail
- Changement de statut
- Sortie / retour de pièce
- Génération de facture
- Fermeture définitive

Informations minimales à logger :
- Qui (user_id)
- Quand (timestamp)
- Quoi (entité + id)
- Ancienne valeur / Nouvelle valeur (quand pertinent)

---

## 6. Règles de numérotation

- Numéro de dossier d’intervention : `OR-AAAA-XXXXX` (unique, séquentiel par année)
- Numéro de facture : selon la réglementation en vigueur (séquentiel, sans trou)

---

## 7. Règles d’expérience utilisateur

| # | Règle |
|---|-------|
| 7.1 | La recherche doit fonctionner sur plaque, châssis, nom, téléphone, n° client, n° dossier |
| 7.2 | L’utilisateur ne doit jamais perdre le contexte (toujours savoir sur quel véhicule / dossier il travaille) |
| 7.3 | Les actions destructives (fermeture définitive, suppression) doivent demander une confirmation explicite |
| 7.4 | Les droits utilisateurs doivent permettre de restreindre qui peut fermer définitivement un dossier |
