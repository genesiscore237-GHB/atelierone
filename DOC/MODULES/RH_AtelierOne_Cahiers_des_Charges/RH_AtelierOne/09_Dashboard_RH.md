# RH-09 — TABLEAU DE BORD & REPORTING RH
## Cahier des charges détaillé – AtelierOne

**Code module :** `RH-09`  
**Priorité :** P1 (peut être enrichi progressivement)  
**Dépendances :** RH-01 à RH-08 (agrégation)

---

## 1. OBJECTIF

Donner au Directeur et au RH une vision claire et actualisée de la situation du personnel : effectifs, présences, masse salariale, performances, alertes.

---

## 2. PÉRIMÈTRE FONCTIONNEL

### 2.1 Indicateurs clés (KPI)
- Effectif total / actifs / inactifs
- Taux de présence du mois
- Nombre d'absences non justifiées
- Masse salariale du mois (si paie clôturée)
- Nombre d'évaluations en retard
- Formations réalisées / planifiées
- Alertes : contrats bientôt expirés, documents expirés, soldes de congés négatifs, jours de présence non saisis

### 2.2 Filtres
- Par période
- Par département / poste
- Par site (si multi-site)

### 2.3 Rapports exportables
- Liste des employés
- Présences mensuelles
- Bulletins de paie
- Matrice de compétences
- Registre disciplinaire (accès restreint)

---

## 3. ÉCRANS

1. Tableau de bord RH (widgets + alertes)
2. Centre de rapports (liste + export CSV/PDF)

---

## 4. PERMISSIONS

| Action | Directeur | RH | Autres |
|--------|-----------|-----|--------|
| Voir tableau de bord complet | Oui | Oui | Non |
| Exporter rapports sensibles | Oui | Oui | Non |

---

## 5. CAS DE TEST

1. Effectif correct après création/désactivation d'employés
2. Alerte « jours de présence non saisis » visible
3. Taux de présence cohérent avec RH-02
4. Export CSV fonctionnel

---

## 6. ORDRE DE DÉVELOPPEMENT INTERNE

1. Widgets de base (effectifs, présences)
2. Alertes
3. Rapports exportables
4. Enrichissement progressif selon modules disponibles
5. Tests

---

## 7. CRITÈRES D'ACCEPTATION

- [ ] KPI principaux affichés et exacts
- [ ] Alertes actionnables
- [ ] Exports fonctionnels
- [ ] Permissions respectées
- [ ] Performance acceptable (pas de requêtes lourdes non optimisées)

---

**Fin RH-09**
