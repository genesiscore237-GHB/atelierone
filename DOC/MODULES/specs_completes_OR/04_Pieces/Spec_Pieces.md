# Onglet 4 — Pièces

## Objectif
Gérer tout le flux pièces lié à l’OR, avec traçabilité stricte (aucune sortie sans OR).

## Blocs

### 4.1 Demandes de pièces (vers magasin)
- Créer une demande (lignes issues du devis autorisé ou saisie libre)
- Statuts ligne : Demandée / Servie / Partiellement servie / Manquante / Annulée
- Action magasinier : Servir / Signaler manquant

### 4.2 Réservations
- Réserver du stock disponible pour l’OR
- Libérer une réservation

### 4.3 Sorties de stock
- Sortir une pièce **uniquement** liée à cet OR
- Motif / lien ligne de devis
- Quantité, lot si besoin

### 4.4 Retours atelier → stock
- Retour de pièce non utilisée
- Motif

### 4.5 Cores / Échanges standard
- Dépôt de coquille
- Suivi core (en attente / retournée / perdue / facturée)

### 4.6 Kits
- Sortie de kit (décomposition automatique des composants)

### 4.7 Pièces fournies par le client
- Enregistrement
- Remise éventuelle en fin d’intervention

### 4.8 Commandes fournisseur liées à l’OR
- Créer commande (OR = n° de PO)
- Suivi statut
- Réception

### 4.9 Retours fournisseur
- Pièce défaillante / non conforme / erreur
- Suivi remplacement / avoir

### 4.10 Mouvements de stock de l’OR
Tableau chronologique de tous les mouvements liés.

## Règles d’or
- Toute sortie porte le numéro d’OR.
- On ne sert que ce qui est autorisé (ou explicitement dérogé par le chef).
- Le magasinier a une vue concentrée sur cet onglet.
