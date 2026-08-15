# RH-02 — PRÉSENCES & TEMPS DE TRAVAIL
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-02`  
**Priorité :** P0  
**Dépendances :** RH-00 (Paramétrage), RH-01 (Employés)

---

## 1. OBJECTIF

Permettre la saisie manuelle (puis plus tard biométrique) des heures d'arrivée et de départ, et **calculer automatiquement** le temps de travail effectif en appliquant les règles paramétrées :
- Déduction de la pause
- Heures supplémentaires uniquement si autorisées
- Détection des retards et départs anticipés
- Production des totaux pour la paie

**Principe :** L'humain saisit les heures brutes. Le système calcule tout le reste selon les paramètres de RH-00.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Saisie des présences
- Saisie quotidienne par employé : heure d'arrivée, heure de départ
- Marquage rapide : Présent / Absent / Congé / Maladie / Mission
- Saisie en lot (tous les employés du jour)
- Correction possible avant clôture du mois
- Source : manual | biometric | import (extensible)

### 2.2 Autorisations d'heures supplémentaires
- Demande / autorisation préalable par employé et par date
- Plafond d'heures autorisées
- Motif obligatoire
- Approbation par Chef d'atelier ou Directeur

### 2.3 Calcul automatique (moteur)
S'appuie **exclusivement** sur les paramètres de RH-00 :
- Horaires du cycle de l'employé
- Tolérance de retard
- Déduction pause (oui/non + plages)
- Règle d'arrivée anticipée
- Plafond heures normales

**Règle HS non négociable :**  
Les minutes après l'heure de fin ne sont comptabilisées en HS **que si** une autorisation approuvée existe pour ce jour. Sinon → ignorées.

### 2.4 Clôture mensuelle
- Verrouillage des présences d'un mois
- Génération du résumé mensuel par employé (heures normales, HS, retards, absences)
- Export vers module Paie

### 2.5 Consultation
- Historique par employé / par période
- Jours non renseignés (alerte)
- Détail du calcul (pour transparence)

---

## 3. MODÈLES DE DONNÉES

### `attendance_entries`
id, employee_id, date, time_in, time_out, source, status, notes,  
validated, validated_by, validated_at, created_by, created_at, updated_at

### `overtime_authorizations`
id, employee_id, date, max_hours, reason, authorized_by, authorized_at, status

### `attendance_calculations`
id, attendance_entry_id, employee_id, date,  
raw_minutes, break_minutes, worked_minutes, normal_minutes, overtime_minutes,  
late_minutes, early_departure_minutes, is_absent, calculation_details (jsonb), calculated_at

### `attendance_monthly_summaries`
id, employee_id, year, month, total_normal_minutes, total_overtime_minutes,  
total_late_minutes, days_present, days_absent, days_on_leave, locked, locked_at, locked_by

---

## 4. MOTEUR DE CALCUL (RÈGLES)

```
Entrées : time_in, time_out, schedule (du cycle de l'employé), overtime_auth, settings (RH-00)

1. Durée brute = time_out - time_in
2. Pause déduite = recouvrement avec plage de pause (si auto_deduct_break = true)
3. Temps de présence = durée brute - pause
4. Retard = max(0, time_in - start_time - tolérance)
5. HS potentielles = max(0, time_out - end_time)
6. HS validées = min(HS potentielles, plafond autorisation) SI autorisation approuvée SINON 0
7. Temps normal = min(temps de présence - HS validées, expected_hours du jour)
8. Les minutes au-delà de end_time sans autorisation sont écartées
```

Toutes les valeurs (start_time, end_time, pause, expected_hours, tolérance) viennent de RH-00 → **100 % flexible**.

---

## 5. ÉCRANS

1. Saisie quotidienne des présences
2. Autorisations HS
3. Historique & correction
4. Rapport mensuel / clôture
5. Détail de calcul d'une journée

---

## 6. PERMISSIONS

| Action | Directeur | RH | Chef Atelier | Secrétaire | Employé |
|--------|-----------|-----|--------------|------------|---------|
| Saisir présences | Oui | Oui | Oui | Oui | Non |
| Autoriser HS | Oui | Non | Oui | Non | Non |
| Clôturer le mois | Oui | Oui | Non | Non | Non |
| Voir ses présences | Oui | Oui | Oui | Oui | Oui |

---

## 7. CAS DE TEST (MINIMUM)

1. Journée standard 07:30-18:00 → 8h30 normales
2. Arrivée 08:00 → retard + temps réduit
3. Départ 19:00 sans autorisation → 8h30, 0 HS
4. Départ 19:00 avec autorisation 2h → 8h30 + 1h HS
5. Modification des horaires dans RH-00 → le calcul utilise les nouvelles valeurs
6. Jour férié paramétré → traité comme non ouvré
7. Clôture mois → verrouillage + résumé généré

---

## 8. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables
2. Service de lecture des paramètres (RH-00)
3. Moteur de calcul pur + tests unitaires
4. CRUD saisies + autorisations HS
5. Écrans
6. Clôture mensuelle + résumé
7. Audit
8. Tests d'intégration

---

## 9. CRITÈRES D'ACCEPTATION

- [ ] Saisie manuelle fonctionnelle
- [ ] Calcul automatique conforme aux règles
- [ ] HS uniquement si autorisées
- [ ] Tout le comportement piloté par RH-00 (aucune constante métier)
- [ ] Clôture mensuelle + résumé exportable vers Paie
- [ ] Cas de test 1 à 7 verts
- [ ] Audit des modifications

---

**Fin RH-02**
