# RH-04 — PAIE
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-04`  
**Priorité :** P1  
**Dépendances :** RH-00, RH-01, RH-02, RH-03

---

## 1. OBJECTIF

Calculer la rémunération mensuelle de chaque employé à partir :
- du salaire de base
- des heures normales et HS issues des présences
- des primes (présence, performance)
- des absences
- des retenues
et produire un bulletin de paie clair.

**Tout barème, taux et règle de calcul doit être paramétrable.**

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Éléments de rémunération (paramétrables)
- Salaire de base (fiche employé)
- Prime de présence (formule ou barème paramétrable)
- Prime de performance (issue de RH-05 ou saisie manuelle)
- Heures supplémentaires (taux majorés paramétrables : 1.25, 1.5…)
- Autres primes (transport, panier, etc.) – liste configurable
- Retenues (avances, absences non justifiées, cotisations)

### 2.2 Période de paie
- Mensuelle par défaut
- Clôture des présences requise avant calcul de paie

### 2.3 Bulletin de paie
- Détail des gains et retenues
- Net à payer
- Mode de paiement (Espèces, Orange Money, MTN MoMo, Virement)
- Génération PDF
- Historique des bulletins

### 2.4 Préparation CNPS / IRPP (Cameroun)
- Structure prête pour cotisations (paramétrable)
- V1 : saisie manuelle des cotisations ou taux simples
- V2+ : module fiscal camerounais avancé

---

## 3. MODÈLES DE DONNÉES

### `payroll_periods`
id, year, month, status (open, closed), closed_at, closed_by

### `payroll_items_config`  (éléments paramétrables)
id, code, name, type (earning, deduction), calculation_method, is_taxable, active

### `payroll_entries`
id, period_id, employee_id, base_salary, normal_hours, overtime_hours,  
presence_bonus, performance_bonus, other_earnings, total_earnings,  
deductions, cnps_employee, cnps_employer, net_pay, payment_method,  
status, generated_at, paid_at

### `payroll_entry_lines`
id, payroll_entry_id, item_code, label, amount, direction (gain/retenue)

---

## 4. RÈGLES DE CALCUL (FLEXIBLES)

```
Net = Salaire de base
    + Prime de présence (selon règle paramétrée)
    + Prime de performance (selon note RH-05 ou saisie)
    + HS × taux majoré (paramétré)
    + Autres primes
    – Absences non justifiées (valorisation paramétrée)
    – Avances / retenues
    – Cotisations salariales (taux paramétrés)
```

Toutes les formules et taux sont lus depuis la configuration, pas depuis le code.

---

## 5. ÉCRANS

1. Périodes de paie (ouverture / clôture)
2. Préparation de la paie du mois (liste employés + calcul)
3. Détail / ajustement d'un bulletin
4. Validation et marquage « payé »
5. Historique et réédition PDF
6. Configuration des éléments de paie

---

## 6. PERMISSIONS

| Action | Directeur | RH | Comptable | Autres |
|--------|-----------|-----|-----------|--------|
| Préparer la paie | Oui | Oui | Oui | Non |
| Valider / payer | Oui | Oui | Oui | Non |
| Voir son propre bulletin | Oui | Oui | Oui | Oui |
| Configurer les éléments | Oui | Oui | Non | Non |

---

## 7. CAS DE TEST

1. Clôturer les présences du mois → calculer la paie
2. Employé avec HS autorisées → HS majorées selon taux paramétré
3. Employé absent 2 jours non justifiés → retenue appliquée
4. Modifier un taux dans la config → prochain calcul l'utilise
5. Générer le PDF du bulletin
6. Marquer comme payé (Mobile Money)

---

## 8. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables + configuration des éléments
2. Service de calcul (lecture présences + congés + paramètres)
3. Génération des bulletins
4. Écrans de préparation et validation
5. PDF
6. Tests

---

## 9. CRITÈRES D'ACCEPTATION

- [ ] Calcul correct à partir des présences clôturées
- [ ] HS, primes, retenues paramétrables
- [ ] Bulletin détaillé + PDF
- [ ] Modes de paiement locaux (MoMo, etc.)
- [ ] Aucune formule codée en dur
- [ ] Permissions et audit

---

**Fin RH-04**
