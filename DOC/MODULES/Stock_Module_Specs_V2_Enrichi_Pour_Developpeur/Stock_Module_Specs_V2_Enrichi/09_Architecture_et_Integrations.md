# 09 — ARCHITECTURE & INTÉGRATIONS

### Intégrations obligatoires
- Ordre de Réparation (OR) → sorties + réservations
- Véhicule → traçabilité
- Fournisseurs / Commandes → réceptions
- Facturation / Vente comptoir → sorties
- Users / RH → audit des mouvements

### Événements recommandés
stock.move.created | stock.level.low | stock.level.out | stock.reservation.created | stock.reconditioning.done | stock.inventory.validated | stock.expiry.warning

### Nuances
Adapter les noms d’entités et patterns à l’architecture existante (AtelierOne). Documenter chaque écart.
Prévoir l’extensibilité : lots/numéros de série, multi-dépôts, connexion catalogue type TecDoc.
