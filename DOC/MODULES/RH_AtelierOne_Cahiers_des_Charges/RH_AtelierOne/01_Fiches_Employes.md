# RH-01 — FICHES EMPLOYÉS & ORGANIGRAMME
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-01`  
**Priorité :** P0  
**Dépendances :** RH-00 (Paramétrage)

---

## 1. OBJECTIF

Gérer le référentiel complet des employés : identité, contrat, poste, rattachement hiérarchique, documents de base, statut.  
Servir de socle à tous les autres sous-modules RH (présences, paie, évaluation…).

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Fiche employé
- Matricule (auto ou manuel selon paramètre)
- Civilité, nom, prénom, date de naissance, lieu de naissance
- Contacts : téléphone, email, adresse
- Personne à contacter en cas d'urgence
- Photo
- Date d'embauche, date de fin (si CDD)
- Type de contrat (paramétrable : CDI, CDD, Stage, Journalier, Prestataire…)
- Poste / Fonction
- Département / Service
- Cycle de travail affecté (lien RH-00)
- Supérieur hiérarchique direct
- Salaire de base actuel
- N° CNPS, NIU si applicable
- Statut : Actif / Inactif / Suspendu / Sorti
- Notes internes

### 2.2 Organigramme
- Vue hiérarchique (arbre)
- Lien « rapporte à »
- Possibilité de réaffecter un employé

### 2.3 Historique
- Historique des postes
- Historique des salaires de base
- Historique des statuts

### 2.4 Documents liés (lien avec RH-08)
- Contrat de travail
- Pièce d'identité
- Autres documents

---

## 3. MODÈLES DE DONNÉES

### `employees`
id, matricule, user_id (nullable), first_name, last_name, gender, birth_date, birth_place,  
phone, email, address, emergency_contact_name, emergency_contact_phone,  
photo_url, hire_date, end_date, contract_type_id, position_id, department_id,  
work_cycle_id, manager_id, base_salary, cnps_number, status, notes,  
created_at, updated_at, created_by, updated_by

### `employee_positions` (historique)
id, employee_id, position_id, start_date, end_date, reason

### `employee_salary_history`
id, employee_id, base_salary, start_date, end_date, reason, changed_by

### `departments`
id, name, code, parent_id, active

### `positions`
id, name, code, department_id, default_role_id, active

### `contract_types`
id, code, name, active

---

## 4. ÉCRANS

1. Liste des employés (filtres : statut, poste, département)
2. Fiche employé (création / édition) – onglets : Identité, Contrat, Hiérarchie, Historique, Documents
3. Organigramme (vue graphique ou arbre)
4. Import CSV (optionnel V1)

---

## 5. RÈGLES MÉTIER

- Matricule unique
- Un employé inactif ne peut plus pointer ni être payé
- Le manager_id doit être un employé actif
- Toute modification de salaire de base crée une entrée d'historique
- Soft delete préférable (statut = Sorti)

---

## 6. PERMISSIONS

| Action | Directeur | RH | Chef Atelier | Autres |
|--------|-----------|-----|--------------|--------|
| Voir liste | Oui | Oui | Oui (son équipe) | Non |
| Créer / modifier | Oui | Oui | Non | Non |
| Voir salaires | Oui | Oui | Non | Non |
| Voir sa propre fiche | Oui | Oui | Oui | Oui |

---

## 7. CAS DE TEST

1. Créer un employé avec matricule auto → OK
2. Affecter un cycle de travail → utilisé par le module Présences
3. Changer le salaire de base → historique créé
4. Désactiver un employé → il disparaît des listes de pointage actives
5. Définir un manager → visible dans l'organigramme

---

## 8. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables
2. CRUD Employés
3. Historiques (poste, salaire)
4. Organigramme
5. Permissions
6. Tests

---

## 9. CRITÈRES D'ACCEPTATION

- [ ] CRUD complet des employés
- [ ] Matricule unique et paramétrable
- [ ] Historique des salaires et postes
- [ ] Organigramme fonctionnel
- [ ] Lien avec cycles de travail (RH-00)
- [ ] Permissions respectées
- [ ] Audit des modifications sensibles

---

**Fin RH-01**
