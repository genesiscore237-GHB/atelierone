# MODULE PERSONNEL (RH) — ATELIERONE
## Index maître des composantes + Ordre d'exécution

**Projet :** AtelierOne – Garage Polyvalent Junior  
**Date :** 13 août 2026  
**Principe directeur :** Tout doit être **paramétrable** (horaires, tolérances, formules de paie, grilles d'évaluation, types de congés, sanctions, etc.). Aucune valeur métier ne doit être codée en dur.

---

## 1. LISTE DES COMPOSANTES DU MODULE PERSONNEL

| # | Code | Composante | Fichier | Priorité |
|---|------|------------|---------|----------|
| 0 | `RH-00` | **Paramétrage RH central** | `00_Parametrage_RH.md` | P0 – Fondations |
| 1 | `RH-01` | **Fiches Employés & Organigramme** | `01_Fiches_Employes.md` | P0 |
| 2 | `RH-02` | **Présences & Temps de travail** | `02_Presences.md` | P0 |
| 3 | `RH-03` | **Congés & Absences** | `03_Conges_Absences.md` | P1 |
| 4 | `RH-04` | **Paie** | `04_Paie.md` | P1 |
| 5 | `RH-05` | **Évaluation & Performance** | `05_Evaluation_Performance.md` | P2 |
| 6 | `RH-06` | **Compétences & Formations** | `06_Competences_Formations.md` | P2 |
| 7 | `RH-07` | **Disciplinaire** | `07_Disciplinaire.md` | P2 |
| 8 | `RH-08` | **Documents RH** | `08_Documents_RH.md` | P2 |
| 9 | `RH-09` | **Tableau de bord & Reporting RH** | `09_Dashboard_RH.md` | P1 |

---

## 2. ORDRE D'EXÉCUTION RECOMMANDÉ (DÉPENDANCES)

```
Étape 1 : RH-00  Paramétrage RH central
Étape 2 : RH-01  Fiches Employés & Organigramme
Étape 3 : RH-02  Présences & Temps de travail
Étape 4 : RH-03  Congés & Absences
Étape 5 : RH-04  Paie                    ← consomme Présences + Congés + Paramétrage
Étape 6 : RH-05  Évaluation & Performance
Étape 7 : RH-06  Compétences & Formations
Étape 8 : RH-07  Disciplinaire
Étape 9 : RH-08  Documents RH
Étape 10: RH-09  Tableau de bord RH      ← agrège tout
```

**Règle stricte :** Ne pas commencer un module tant que ses dépendances ne sont pas validées.

---

## 3. PRINCIPE DE FLEXIBILITÉ (OBLIGATOIRE POUR TOUS LES MODULES)

- Toutes les valeurs métier (horaires, taux, grilles, types, seuils) sont stockées en base et modifiables par l'administrateur.
- Aucune constante métier dans le code source.
- Chaque module expose ses paramètres dans un écran de configuration dédié ou centralisé.
- Les changements de paramètres prennent effet sans redéploiement (sauf mention contraire).
- Historique des modifications de paramètres (audit).

---

## 4. CRITÈRES DE VALIDATION GLOBAUX DU MODULE PERSONNEL

Le module Personnel est considéré comme **terminé** lorsque :

- [ ] Tous les sous-modules listés ci-dessus sont implémentés et validés individuellement
- [ ] Les données circulent correctement (Présences → Paie, Évaluation → Prime, etc.)
- [ ] Tout est paramétrable sans modifier le code
- [ ] Les permissions par rôle sont respectées
- [ ] Le journal d'audit trace les actions sensibles
- [ ] Les rapports RH principaux sont disponibles
- [ ] Les tests d'acceptation de chaque sous-module sont verts

---

## 5. FICHIERS DE SPÉCIFICATIONS

Chaque fichier `.md` contient :
1. Objectif du sous-module
2. Périmètre fonctionnel détaillé
3. Règles métier (avec flexibilité)
4. Modèles de données
5. Écrans / API
6. Moteur de calcul (si applicable)
7. Permissions
8. Cas de test
9. Ordre de développement interne
10. Critères d'acceptation

---

**Prochaine étape :** Lire et implémenter les fichiers dans l'ordre indiqué.
