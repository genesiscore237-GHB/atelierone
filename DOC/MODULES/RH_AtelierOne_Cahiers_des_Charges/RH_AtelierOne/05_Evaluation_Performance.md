# RH-05 — ÉVALUATION & PERFORMANCE
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-05`  
**Priorité :** P2  
**Dépendances :** RH-00, RH-01

---

## 1. OBJECTIF

Évaluer périodiquement les employés selon des critères adaptés au garage, historiser les notes, et alimenter la **prime de performance** du module Paie.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Grilles d'évaluation (paramétrables)
- Création de grilles par type de poste (Technicien, Magasinier, Secrétaire…)
- Critères configurables avec pondération (ex. : Qualité technique 30 %, Rapidité 20 %, Propreté 15 %, Respect consignes 15 %, Esprit d'équipe 10 %, Relation client 10 %)
- Échelle de notation paramétrable (1-5, 1-10, A-E…)

### 2.2 Campagnes d'évaluation
- Fréquence : mensuelle, trimestrielle, annuelle (paramétrable)
- Lancement d'une campagne → liste des employés à évaluer
- Évaluateur = supérieur hiérarchique (ou Directeur)

### 2.3 Saisie de l'évaluation
- Note par critère + commentaire
- Note globale calculée (pondérée)
- Appréciation générale
- Objectifs pour la période suivante

### 2.4 Lien avec la paie
- La note globale peut déclencher automatiquement une prime de performance selon un barème paramétrable
- Ou saisie manuelle de la prime par le RH/Directeur

### 2.5 Historique
- Toutes les évaluations conservées dans le dossier employé
- Courbe d'évolution

---

## 3. MODÈLES DE DONNÉES

### `evaluation_grids`
id, name, position_id (nullable), active

### `evaluation_criteria`
id, grid_id, name, weight, max_score, order

### `evaluation_campaigns`
id, name, period_start, period_end, status, created_by

### `evaluations`
id, campaign_id, employee_id, evaluator_id, global_score,  
appreciation, objectives, status, evaluated_at

### `evaluation_scores`
id, evaluation_id, criterion_id, score, comment

### `performance_bonus_rules`
id, min_score, max_score, bonus_amount, bonus_percent, active

---

## 4. ÉCRANS

1. Configuration des grilles et critères
2. Campagnes d'évaluation
3. Saisie d'une évaluation
4. Historique par employé
5. Barème de prime de performance

---

## 5. PERMISSIONS

| Action | Directeur | RH | Manager | Employé |
|--------|-----------|-----|---------|---------|
| Configurer grilles | Oui | Oui | Non | Non |
| Évaluer son équipe | Oui | Oui | Oui | Non |
| Voir ses évaluations | Oui | Oui | Oui | Oui |
| Voir toutes | Oui | Oui | Non | Non |

---

## 6. CAS DE TEST

1. Créer une grille « Technicien » avec 6 critères pondérés
2. Lancer une campagne mensuelle
3. Saisir une évaluation → note globale calculée
4. Barème : note ≥ 4/5 → prime 15 000 FCFA → visible en paie
5. Historique consultable

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables grilles + critères
2. Campagnes + évaluations
3. Calcul note globale
4. Barème prime → lien Paie
5. Écrans
6. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Grilles et critères 100 % paramétrables
- [ ] Note globale correcte (pondération)
- [ ] Historique complet
- [ ] Lien optionnel avec prime de performance (Paie)
- [ ] Permissions respectées

---

**Fin RH-05**
