# 01 — CAHIER DES CHARGES FONCTIONNEL
## Module Clients & Contrats

### 1. Vision

Mettre en place un module Clients & Contrats de niveau professionnel permettant de gérer de façon fiable et traçable :

- Les clients particuliers et entreprises
- Les contrats de maintenance de flottes
- Les conditions de paiement et le crédit client
- Le suivi des créances et les relances
- La facturation groupée / périodique
- L’historique complet des relations commerciales

Ce module devient la **source de vérité** de la relation client et des engagements contractuels du garage.

### 2. Objectifs mesurables

| Objectif | Indicateur de succès |
|----------|----------------------|
| Distinction claire des types de clients | 100 % des clients ont un type renseigné |
| Contrats formalisés | Chaque entreprise sous contrat a un contrat actif avec dates, conditions et véhicules liés |
| Visibilité des créances | Le dirigeant voit en < 10 secondes le total dû, les retards et les clients à relancer |
| Facturation groupée | Possibilité de générer une facture récapitulative mensuelle par contrat |
| Traçabilité | Toute facture / OR / paiement est lié à un client (et à un contrat si applicable) |
| Relances | Historique des relances conservé |

### 3. Périmètre fonctionnel (In Scope)

- Fiche Client (particulier / entreprise)
- Types de clients et segmentation
- Gestion des Contrats de maintenance (création, renouvellement, résiliation, avenants)
- Lien Contrat ↔ Véhicules de la flotte
- Conditions de paiement et délais
- Limites de crédit (optionnel mais recommandé)
- Suivi des créances (ouvertures, échéances, soldes)
- Relances (manuelles + historique)
- Facturation groupée / périodique
- Historique client complet (OR, factures, paiements, relances, véhicules)
- Tableaux de bord clients & créances

### 4. Hors périmètre (pour cette version)

- CRM marketing avancé (campagnes email/SMS automatisées complexes)
- Portail client en self-service (peut être prévu en extensibilité)
- Scoring client sophistiqué
- Comptabilité générale (écritures automatiques possibles plus tard)

### 5. Acteurs

| Acteur | Rôle principal |
|--------|----------------|
| Secrétaire / Admin | Création clients, saisie contrats, facturation, relances |
| Dirigeant | Validation contrats, pilotage créances, décisions crédit |
| Chef d’atelier | Consultation historique client / véhicule |
| Système | Calcul soldes, alertes échéances, proposition de facturation groupée |

### 6. Critères d’acceptation globaux

- [ ] Création d’un client entreprise + contrat + plusieurs véhicules liés
- [ ] Distinction visuelle et fonctionnelle des 3 types de clients principaux
- [ ] Calcul correct du solde client (factures – paiements)
- [ ] Génération d’une facture groupée sur période
- [ ] Enregistrement d’une relance avec historique
- [ ] Vue « Clients à relancer » opérationnelle
- [ ] Guide Utilisateur livré
