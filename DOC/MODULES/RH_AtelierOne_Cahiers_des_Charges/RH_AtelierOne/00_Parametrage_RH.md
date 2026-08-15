# RH-00 — PARAMÉTRAGE RH CENTRAL
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-00`  
**Priorité :** P0 – Fondations  
**Dépendances :** Aucune (premier module à développer)

---

## 1. OBJECTIF

Centraliser **tous les paramètres** qui gouvernent le comportement du module Personnel.  
Aucune règle métier (horaire, tolérance, type de congé, formule de prime, etc.) ne doit être codée en dur. Tout doit être configurable par l'administrateur.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Horaires de travail (paramétrables)
- Définir pour chaque jour de la semaine : heure début, heure fin, pause début, pause fin, durée attendue, jour travaillé (oui/non).
- Possibilité d'avoir plusieurs **cycles de travail** (ex. : Cycle Atelier standard, Cycle Administratif, Cycle Magasin).
- Affecter un cycle à un employé ou à un poste.

### 2.2 Tolérances et règles de présence
- Tolérance de retard (minutes) avant marquage « retard »
- Arrondi des heures (aucune, 5 min, 15 min…)
- Déduction automatique de la pause (oui/non)
- Plafond d'heures normales par jour
- Règle d'arrivée anticipée (compter ou non les minutes avant l'heure de début)

### 2.3 Types de congés / absences
- Liste configurable : Congé annuel, Maladie, Maternité, Permission, Sans solde, Formation, Autre…
- Pour chaque type : payé (oui/non), décompte du solde (oui/non), couleur d'affichage, justificatif obligatoire (oui/non)

### 2.4 Paramètres de paie (liens)
- Jours de paie par mois (ou période)
- Devise
- Activation/désactivation des primes de présence et de performance
- Formules ou barèmes de base (détail dans RH-04)

### 2.5 Grilles d'évaluation (liens)
- Activation du module évaluation
- Fréquence par défaut (mensuelle, trimestrielle, annuelle)

### 2.6 Disciplinaire
- Types de sanctions configurables (Avertissement oral, écrit, Mise à pied 1-3j, 4-8j, Licenciement…)
- Ordre de gravité

### 2.7 Général
- Matricule automatique (préfixe + séquence)
- Format d'affichage des noms
- Fuseau horaire
- Jours fériés (calendrier annuel paramétrable)

---

## 3. MODÈLES DE DONNÉES

### `hr_work_cycles`
id, name, description, is_default, active

### `hr_work_schedules`
id, cycle_id, day_of_week (0-6), start_time, end_time, break_start, break_end, expected_hours, is_working_day

### `hr_attendance_settings`
id, late_tolerance_minutes, round_to_minutes, auto_deduct_break, count_early_arrival, max_normal_hours_per_day, updated_at, updated_by

### `hr_leave_types`
id, code, name, is_paid, deduct_balance, requires_document, color, active

### `hr_sanction_types`
id, code, name, severity_level, active

### `hr_public_holidays`
id, date, name, is_recurring_yearly

### `hr_general_settings`
id, employee_code_prefix, employee_code_sequence, timezone, currency, ...

---

## 4. ÉCRANS

1. **Configuration des cycles et horaires** (CRUD complet)
2. **Paramètres de présence** (formulaire unique)
3. **Types de congés** (liste + édition)
4. **Types de sanctions**
5. **Calendrier des jours fériés**
6. **Paramètres généraux RH**

---

## 5. PERMISSIONS

| Action | Superadmin | Directeur | RH |
|--------|------------|-----------|-----|
| Voir paramètres | Oui | Oui | Oui |
| Modifier paramètres | Oui | Oui | Oui |
| Autres rôles | Non | Non | Non |

---

## 6. CAS DE TEST

1. Créer un cycle « Atelier Standard » avec les horaires Lun–Sam du garage → OK
2. Modifier la tolérance de retard à 10 min → le moteur de présence utilise la nouvelle valeur
3. Ajouter un type de congé « Permission exceptionnelle » → disponible dans les demandes
4. Ajouter un jour férié → les présences de ce jour sont traitées comme non ouvrées
5. Changer le préfixe matricule → les nouveaux employés l'utilisent

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables de paramétrage
2. Seed des valeurs par défaut (horaires Garage Polyvalent Junior)
3. Écrans de configuration
4. Service de lecture des paramètres (cache éventuel)
5. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Tous les horaires sont modifiables sans toucher au code
- [ ] Les valeurs par défaut correspondent au garage (7h30-18h, pause 13h-14h, samedi 7h30-12h)
- [ ] Les types de congés et sanctions sont configurables
- [ ] Les jours fériés impactent le calcul des présences
- [ ] Journal d'audit des modifications de paramètres
- [ ] Aucune constante métier dans le code source

---

**Fin RH-00**
