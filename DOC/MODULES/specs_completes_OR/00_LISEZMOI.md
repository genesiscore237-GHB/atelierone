# Spécifications Fonctionnelles Complètes — Module Ordres de Réparation

**AtelierOne — Refonte en cours**  
**Base UI** : Stepper 7 étapes déjà en place + header OR + bandeau « Prochaine action recommandée »  
**Objectif** : Fournir à l’IA développeur le détail exhaustif de chaque onglet selon les standards des meilleurs DMS (Tekmetric, Shop-Ware, AutoLeap, Mitchell, etc.).

---

## Structure du package

| Dossier | Contenu |
|---------|---------|
| `00_Vue_Ensemble` | Principes, mapping statut→onglet, règles globales |
| `01_Reception` | Onglet 1 — complet |
| `02_Diagnostic` | Onglet 2 — Diagnostic + DVI |
| `03_Devis_Autorisation` | Onglet 3 — Devis versionné + autorisation ligne par ligne |
| `04_Pieces` | Onglet 4 — Flux pièces complet |
| `05_Travaux_Pointage` | Onglet 5 — Lignes éditables + pointage + technicien |
| `06_Controle_Qualite` | Onglet 6 — QC + essai routier |
| `07_Facture_Restitution` | Onglet 7 — Facturation avancée + restitution |
| `08_Regles_Transverses` | Règles communes (statuts, historique, photos, notifications) |
| `09_Permissions_Roles` | Matrice permissions par rôle et par action |

---

## Consigne pour l’IA développeur

Implémenter **chaque onglet** en respectant :
1. Les champs, actions, états et règles décrits
2. La cohérence avec le stepper et le bandeau « Prochaine action »
3. Les permissions du dossier 09
4. Les standards métier des grands DMS (pas de raccourci fonctionnel)

Chaque onglet doit être **autonome**, **complet** et **utilisable immédiatement** une fois branché sur les endpoints tRPC existants.
