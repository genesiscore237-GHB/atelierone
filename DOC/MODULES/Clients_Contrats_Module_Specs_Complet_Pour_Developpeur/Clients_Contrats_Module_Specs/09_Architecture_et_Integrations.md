# 09 — ARCHITECTURE & INTÉGRATIONS

### Intégrations obligatoires

| Module | Nature de l’intégration |
|--------|-------------------------|
| Véhicules | Propriétaire actuel + historique + affectation aux contrats |
| Ordres de Réparation | Lien client + contrat éventuel |
| Facturation | Client obligatoire + impact sur le solde |
| Paiements / Caisse | Mise à jour du solde client |
| Stock | Indirect (via OR) |
| RH / Users | Qui a créé le client, le contrat, la relance |

### Événements recommandés

- `client.created` / `client.updated`
- `contract.activated` / `contract.expired`
- `client.balance.changed`
- `dunning.created`
- `client.blocked`

### Nuances d’architecture

Adapte les noms d’entités (Customer / Partner / ResPartner selon le framework) et les mécanismes de droits à l’existant.  
Documente chaque écart par rapport à ces spécifications.
