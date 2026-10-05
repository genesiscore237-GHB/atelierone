# 05 — RÈGLES MÉTIER

### Règles strictes

1. Tout client doit avoir un **type** renseigné.
2. Un contrat ne peut être créé que pour un client de type entreprise (ou le type est mis à jour automatiquement avec confirmation).
3. Le **solde client** est toujours calculé dynamiquement (ou mis en cache de façon cohérente).
4. On ne peut pas supprimer un client ayant des factures, OR ou contrats historiques → soft-delete ou statut Inactif uniquement.
5. Toute relance est historisée et non supprimable.
6. Un véhicule ne peut être affecté qu’à un seul contrat **actif** à la fois (mais l’historique d’affectation est conservé).
7. Les conditions de paiement du contrat priment sur celles du client lorsqu’un OR est rattaché à un contrat.
8. Un client en statut « Bloqué » ne peut plus avoir de nouvel OR ouvert sans dérogation (droit spécial).

### Règles paramétrables

- Délai d’alerte avant expiration de contrat (30 jours par défaut)
- Seuil de crédit au-delà duquel le client passe en alerte ou bloqué
- Nombre de relances avant passage en contentieux
- Autoriser ou non la facturation groupée automatique

### Cas particuliers

- Client qui commence ponctuel puis passe sous contrat → possibilité de changer le type + créer le contrat.
- Véhicule qui change de propriétaire → transfert d’historique ou conservation selon choix.
- Paiement partiel → le solde et les échéances doivent rester cohérents.
- Avoir / note de crédit → impacte le solde.
