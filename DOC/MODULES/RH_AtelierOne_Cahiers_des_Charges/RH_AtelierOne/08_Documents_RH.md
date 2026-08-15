# RH-08 — DOCUMENTS RH
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-08`  
**Priorité :** P2  
**Dépendances :** RH-01

---

## 1. OBJECTIF

Centraliser tous les documents relatifs au personnel (contrats, pièces d'identité, attestations, certificats de formation, courriers disciplinaires, etc.) et les rattacher à chaque employé.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Types de documents (paramétrables)
- Contrat de travail, Avenant, CIN/Passeport, CNPS, Attestation, Certificat de formation, Courrier disciplinaire, Autre…

### 2.2 Gestion
- Upload (PDF, image)
- Date du document, date d'expiration (si applicable)
- Alerte d'expiration (pièces d'identité, contrats CDD…)
- Versioning simple (dernier document valide)

### 2.3 Accès
- Depuis la fiche employé
- Recherche par type / employé / expiration

---

## 3. MODÈLES DE DONNÉES

### `hr_document_types`
id, code, name, has_expiration, active

### `hr_documents`
id, employee_id, document_type_id, title, file_url,  
document_date, expiration_date, uploaded_by, uploaded_at, notes

---

## 4. ÉCRANS

1. Liste des documents d'un employé
2. Upload / édition
3. Alertes d'expiration (tableau de bord)

---

## 5. PERMISSIONS

| Action | Directeur | RH | Employé |
|--------|-----------|-----|---------|
| Gérer tous les documents | Oui | Oui | Non |
| Voir ses propres documents | Oui | Oui | Oui (lecture) |

---

## 6. CAS DE TEST

1. Uploader un contrat → rattaché à l'employé
2. Document avec expiration → alerte si proche
3. Type de document configurable

---

## 7. ORDRE DE DÉVELOPPEMENT INTERNE

1. Tables
2. Upload + stockage
3. Alertes expiration
4. Intégration fiche employé
5. Tests

---

## 8. CRITÈRES D'ACCEPTATION

- [ ] Upload et rattachement fonctionnels
- [ ] Types paramétrables
- [ ] Alertes d'expiration
- [ ] Permissions respectées

---

**Fin RH-08**
