# RH-03 — CONGÉS & ABSENCES
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-03`  
**Priorité :** P1  
**Dépendances :** RH-00, RH-01, RH-02 (pour impact sur présences)

---

## 1. OBJECTIF

Gérer les demandes de congés et absences, les soldes, les validations hiérarchiques, et alimenter le module Présences et le module Paie.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Types de congés
- 100 % pilotés par RH-00 (`hr_leave_types`)
- Payé / non payé, décompte du solde, justificatif obligatoire

### 2.2 Soldes de congés
- Solde annuel par employé et par type
- Acquisition paramétrable (ex. : 2,5 jours/mois ou 30 jours/an)
- Ajustements manuels (avec motif + audit)

### 2.3 Demandes
- L'employé ou le RH crée une demande (type, dates, motif, document)
- Circuit de validation configurable (manager → RH → Directeur)
- Statuts : Brouillon, En attente, Approuvé, Refusé, Annulé

### 2.4 Impact
- Une fois approuvé → les jours apparaissent dans les présences comme « on_leave »
- Impact paie selon type (payé ou non)

### 2.5 Planning des absences
- Vue calendrier des absences de l'équipe
- Détection des conflits (trop d'absents le même jour) – alerte paramétrable

---

## 3. MODÈLES DE DONNÉES

### `leave_balances`
id, employee_id, leave_type_id, year, acquired_days, taken_days, adjusted_days, balance

### `leave_requests`
id, employee_id, leave_type_id, start_date, end_date, days_count, reason,  
document_url, status, requested_by, approved_by, approved_at, rejection_reason, created_at

### `leave_balance_adjustments`
id, leave_balance_id, amount, reason, created_by, created_at

---

## 4. ÉCRANS

1. Mes demandes de congés (employé)
2. Validation des demandes (manager / RH)
3. Soldes par employé
4. Calendrier des absences
5. Ajustement de solde (RH)

---

## 5. PERMISSIONS

| Action | Employé | Manager | RH | Directeur |
|--------|---------|---------|-----|-----------|
| Créer sa demande | Oui | Oui | Oui | Oui |
| Valider | Non | Oui (son équipe) | Oui | Oui |
| Ajuster solde | Non | Non | Oui | Oui |
| Voir tous les soldes | Non | Non | Oui | Oui |

---

## 6. CAS DE TEST

1. Créer un type de congé dans RH-00 → disponible dans les demandes
2. Demande de 3 jours → solde diminué après approbation
3. Refus → solde inchangé
4. Jours approuvés → visibles comme « on_leave » dans Présences
5. Ajustement manuel de solde → tracé

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables
2. Service de calcul de solde
3. CRUD demandes + workflow validation
4. Impact sur présences
5. Écrans
6. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Types de congés 100 % configurables (RH-00)
- [ ] Soldes calculés et ajustables
- [ ] Workflow de validation fonctionnel
- [ ] Impact correct sur Présences et Paie
- [ ] Calendrier des absences
- [ ] Audit

---

**Fin RH-03**
