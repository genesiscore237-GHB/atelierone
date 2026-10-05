# 01 – Architecture du Module Véhicule + Atelier

## 1. Vision

Le module Véhicule + Atelier est le **cœur opérationnel** du garage.  
Il doit permettre de gérer le cycle de vie complet d’un véhicule depuis son arrivée jusqu’à sa restitution, avec une traçabilité totale et un contrôle strict des stocks.

## 2. Principes directeurs (non négociables)

| # | Principe | Explication |
|---|----------|-------------|
| 1 | Tout part de la Réception | Aucun travail ne commence sans un dossier d’intervention créé à la réception |
| 2 | Véhicule ↔ Client toujours liés | Un véhicule appartient toujours à un client (propriétaire). Le chauffeur est une information contextuelle |
| 3 | Une pièce = une intervention | Aucune sortie de stock n’est possible sans être rattachée à un dossier d’intervention ouvert |
| 4 | Modifiable jusqu’à clôture | Diagnostic, devis, travaux, bilan et facture restent éditables tant que le dossier n’est pas **définitivement fermé** |
| 5 | Recherche + Saisie simultanée | L’utilisateur peut taper une plaque, un nom, un téléphone… le système propose les correspondances existantes et permet la création rapide |
| 6 | Historique immuable | Toutes les actions sont historisées (qui a fait quoi, quand) |

## 3. Composants principaux du module

```
┌─────────────────────────────────────────────────────────────┐
│                    MODULE VÉHICULE + ATELIER                │
├──────────────────────┬──────────────────────────────────────┤
│  Gestion Clients     │  Gestion Véhicules                   │
│  - Fiche client      │  - Fiche véhicule                    │
│  - Historique        │  - Historique interventions          │
│  - Multi-véhicules   │  - Outillage / accessoires           │
├──────────────────────┼──────────────────────────────────────┤
│  Réception           │  Dossier d’Intervention (OR)         │
│  - Recherche/Saisie  │  - États du cycle de vie             │
│  - Check-list        │  - Diagnostic technicien             │
│  - Pannes déclarées  │  - Devis                             │
│                      │  - Travaux & temps                   │
│                      │  - Pièces affectées                  │
│                      │  - Bilan d’intervention              │
├──────────────────────┼──────────────────────────────────────┤
│  Stock lié           │  Facturation                         │
│  - Sortie justifiée  │  - Facture partielle / totale        │
│  - Retour de pièces  │  - Facturation cumulative            │
│  - Réservation       │  - Multi-véhicules même client       │
└──────────────────────┴──────────────────────────────────────┘
```

## 4. Entités centrales

- **Client**
- **Véhicule**
- **DossierIntervention** (aussi appelé Ordre de Réparation / OR)
- **LigneDiagnostic**
- **LigneDevis**
- **LigneTravail** (main d’œuvre)
- **LignePiece** (pièces sorties du stock)
- **Facture**
- **MouvementStock** (toujours lié à un DossierIntervention)

## 5. Intégrations obligatoires

- Module **Stock / Produits** (catégories déjà définies)
- Module **Clients**
- Module **Facturation / Comptabilité**
- (Optionnel) Catalogue TecDoc / pièces

## 6. Expérience utilisateur clé

L’utilisateur ne doit **jamais** se demander :
- « Où est l’historique de cette voiture ? »
- « Pourquoi cette pièce est sortie sans justification ? »
- « Est-ce que je peux encore modifier le devis ? »

Le système doit répondre clairement à ces questions à tout moment.
