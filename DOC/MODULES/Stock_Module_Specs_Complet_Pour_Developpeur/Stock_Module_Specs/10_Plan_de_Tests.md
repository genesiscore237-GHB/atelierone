# 10 — PLAN DE TESTS

### 1. Stratégie

- Tests unitaires sur les services de calcul de stock et de reconditionnement
- Tests d’intégration sur les flux complets
- Tests de recette métier (scénarios garage réel)
- Après chaque phase de la roadmap → campagne de tests de la phase

### 2. Cas de tests prioritaires (non exhaustif)

**Inventaire initial**
- Création session → saisie quantités → validation → stock correct + mouvements générés

**Reconditionnement**
- Fût 200L → 40 bidons de 5L : stocks source et destination corrects, deux mouvements liés
- Ratio incohérent → alerte ou refus selon règle

**Sortie OR**
- Stock suffisant → décrément + lien OR
- Stock insuffisant → message clair + pas de mouvement

**Perte / Vol**
- Motif manquant → refus
- Motif présent → mouvement créé + stock diminué

**Annulation**
- Impossible de supprimer un mouvement
- Annulation crée un mouvement inverse ou passe le statut à Annulé

**Alertes**
- Article sous qte_min apparaît dans la liste des stocks bas
- Article à 0 apparaît en rupture

**Concurrence**
- Deux sorties simultanées sur le même article → pas de stock négatif non contrôlé

### 3. Critère de fin de module

Tous les cas critiques ci-dessus passent + Guide Utilisateur livré + revue d’architecture documentée.
