# 04 — PROCESSUS MÉTIER DÉTAILLÉS

## 1. Création d’un Client

1. Choisir le type (Particulier / Entreprise contrat / Entreprise ponctuelle).
2. Renseigner les informations obligatoires selon le type.
3. Définir les conditions de paiement par défaut.
4. (Optionnel) Définir une limite de crédit.
5. Enregistrement → Client Actif.

## 2. Création d’un Contrat de maintenance

1. Sélectionner un client de type « entreprise_contrat » (ou le promouvoir).
2. Renseigner numéro, dates, type de contrat, conditions de paiement, fréquence de facturation.
3. Affecter les véhicules de la flotte (immatriculations déjà connues ou à créer).
4. Valider le contrat → Statut Actif.
5. Les prochains OR sur ces véhicules peuvent être rattachés automatiquement ou manuellement au contrat.

## 3. Cycle d’une intervention sous contrat

1. Entrée véhicule → identification client + contrat éventuel.
2. OR créé et lié au client (et au contrat si applicable).
3. Travaux + pièces.
4. Facturation :
   - Soit immédiate
   - Soit mise en attente pour facturation groupée de fin de période
5. Paiement (partiel ou total) → mise à jour du solde.
6. Si impayé → entrée dans le processus de relance.

## 4. Facturation groupée / périodique

1. Sélectionner un contrat ou un client.
2. Choisir la période (ex: 1er au 31 du mois).
3. Le système propose toutes les interventions / OR terminés non encore facturés groupés.
4. Génération d’une facture récapitulative.
5. Échéance calculée selon les conditions du contrat.

## 5. Processus de Relance

1. Identification des factures échues non soldées.
2. Création d’une relance (date, canal, montant, résultat).
3. Historique conservé.
4. Possibilité de planifier la prochaine action.
5. Si nécessaire → passage du client en statut « Contentieux » ou « Bloqué ».

## 6. Renouvellement / Résiliation de contrat

- Alerte automatique X jours avant échéance.
- Possibilité de créer un avenant ou un nouveau contrat.
- Résiliation : date de fin + motif + conservation de l’historique.

## 7. Vue 360° Client

Depuis la fiche client on doit pouvoir voir :
- Contrats (actifs et passés)
- Véhicules liés
- OR en cours et historiques
- Factures et soldes
- Paiements
- Relances
- Notes et historique de relation
