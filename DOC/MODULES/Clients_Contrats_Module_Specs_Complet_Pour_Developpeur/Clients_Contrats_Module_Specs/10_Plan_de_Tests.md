# 10 — PLAN DE TESTS

### Cas prioritaires

**Client**
- Création particulier / entreprise
- Changement de type
- Soft-delete ou passage inactif

**Contrat**
- Création + affectation de 3 véhicules
- Résiliation + conservation historique
- Alerte d’échéance

**Solde**
- Facture créée → solde augmente
- Paiement partiel → solde diminue correctement
- Plusieurs factures + paiements → calcul exact

**Relance**
- Création relance
- Historique visible
- Client apparaît dans « À relancer » si échu

**Facturation groupée**
- Sélection période → OR non facturés proposés
- Génération facture → OR marqués comme facturés groupés

**Sécurité**
- Client bloqué → nouvel OR refusé ou avec warning selon règle
