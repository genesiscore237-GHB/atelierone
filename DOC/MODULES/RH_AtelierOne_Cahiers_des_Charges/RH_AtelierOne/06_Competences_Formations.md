# RH-06 — COMPÉTENCES & FORMATIONS
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-06`  
**Priorité :** P2  
**Dépendances :** RH-00, RH-01

---

## 1. OBJECTIF

Cartographier les compétences requises et maîtrisées, identifier les écarts, planifier et suivre les formations, anticiper les besoins de montée en compétence du garage.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Référentiel de compétences
- Liste des compétences (paramétrable) : Diagnostic électronique, Climatisation, Transmission auto, Soudure, Accueil client, Excel, etc.
- Niveau de maîtrise : 1 à 5 (ou paramétrable)
- Compétences requises par poste

### 2.2 Matrice employé × compétences
- Niveau actuel de chaque employé sur chaque compétence
- Écart par rapport au requis du poste
- Alerte « compétence critique manquante »

### 2.3 Formations
- Catalogue de formations (internes / externes)
- Plan de formation (besoin → session → participants)
- Historique des formations suivies (date, organisme, attestation)
- Coût et budget formation (optionnel)

### 2.4 Anticipation
- Suggestions automatiques de formation selon les écarts de compétences
- Alerte si aucune formation depuis X mois (paramétrable)

---

## 3. MODÈLES DE DONNÉES

### `skills`
id, code, name, category, description, active

### `position_skills`
id, position_id, skill_id, required_level

### `employee_skills`
id, employee_id, skill_id, current_level, assessed_at, assessed_by

### `trainings`
id, title, description, provider, duration_hours, skill_ids (json), active

### `training_sessions`
id, training_id, start_date, end_date, location, status

### `training_participations`
id, session_id, employee_id, status, certificate_url, score

---

## 4. ÉCRANS

1. Référentiel de compétences
2. Matrice de compétences (poste / employé)
3. Catalogue et sessions de formation
4. Plan de formation
5. Historique formations d'un employé

---

## 5. PERMISSIONS

| Action | Directeur | RH | Manager | Employé |
|--------|-----------|-----|---------|---------|
| Gérer référentiel | Oui | Oui | Non | Non |
| Évaluer compétences de son équipe | Oui | Oui | Oui | Non |
| Voir ses compétences | Oui | Oui | Oui | Oui |
| Planifier formations | Oui | Oui | Non | Non |

---

## 6. CAS DE TEST

1. Créer la compétence « Diagnostic électronique » niveau requis 4 pour poste Technicien
2. Employé à niveau 2 → écart détecté + suggestion formation
3. Enregistrer une formation suivie → historique mis à jour
4. Matrice globale consultable

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables compétences + niveaux
2. Matrice poste / employé
3. Formations + sessions + participations
4. Alertes d'écart
5. Écrans
6. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Compétences et niveaux paramétrables
- [ ] Matrice fonctionnelle
- [ ] Écarts visibles + suggestions
- [ ] Historique des formations
- [ ] Permissions respectées

---

**Fin RH-06**
