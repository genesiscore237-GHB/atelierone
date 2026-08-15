# RH-07 — DISCIPLINAIRE
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-07`  
**Priorité :** P2  
**Dépendances :** RH-00 (types de sanctions), RH-01

---

## 1. OBJECTIF

Enregistrer, suivre et historiser les incidents disciplinaires et les sanctions, en cohérence avec le Règlement Intérieur du garage.  
Assurer la traçabilité et la proportionnalité.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Types de sanctions
- 100 % configurables via RH-00 (Avertissement oral, écrit, Mise à pied, Licenciement…)
- Niveau de gravité

### 2.2 Enregistrement d'un incident / sanction
- Date des faits
- Employé concerné
- Description des faits
- Type de sanction proposée / appliquée
- Décision (notifiée ou non)
- Documents joints (courrier, PV…)
- Auteur de la décision

### 2.3 Historique
- Dossier disciplinaire complet de l'employé
- Compteur d'avertissements sur une période glissante (paramétrable)

### 2.4 Lien éventuel
- Alerte si récidive
- Visibilité restreinte (RH + Directeur)

---

## 3. MODÈLES DE DONNÉES

### `disciplinary_records`
id, employee_id, incident_date, description, sanction_type_id,  
decision, notified_at, document_url, created_by, created_at, notes

---

## 4. ÉCRANS

1. Nouveau record disciplinaire
2. Dossier disciplinaire d'un employé
3. Liste / filtres (par type, période, employé)

---

## 5. PERMISSIONS

| Action | Directeur | RH | Manager | Autres |
|--------|-----------|-----|---------|--------|
| Créer un record | Oui | Oui | Oui (signalement) | Non |
| Voir tous les dossiers | Oui | Oui | Non | Non |
| Voir son propre dossier | Non (ou restreint) | — | — | Non |

---

## 6. CAS DE TEST

1. Enregistrer un avertissement écrit → visible dans le dossier
2. Type de sanction créé dans RH-00 → disponible
3. Historique complet par employé
4. Permissions strictes respectées

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Table
2. CRUD
3. Lien types de sanctions (RH-00)
4. Écrans
5. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Types de sanctions paramétrables
- [ ] Historique complet et horodaté
- [ ] Documents attachables
- [ ] Accès très restreint
- [ ] Audit

---

**Fin RH-07**
