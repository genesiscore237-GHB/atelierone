# Refonte Expert — Module Ordres de Réparation (AtelierOne)

**Statut** : Conception d’expert pour refonte totale  
**Base** : Analyse ligne par ligne du monolithe actuel (1648 lignes, `page.tsx`)  
**Objectif** : Fournir à l’IA codeur un référentiel complet, normé et actionnable pour reconstruire le module selon les meilleures pratiques du génie logiciel et des DMS modernes (Tekmetric, Shop-Ware, AutoLeap, etc.).

---

## Contenu du package

| Dossier | Contenu |
|---------|---------|
| `00_Diagnostic` | Diagnostic expert confirmé + matrice des problèmes |
| `01_Architecture_Cible` | Architecture technique cible (routing, state, responsabilités) |
| `02_UX_UI` | Parcours guidé 7 étapes, vues par rôle, wireframes conceptuels |
| `03_Modele_Donnees` | Machine d’états, règles de transition, unification devis |
| `04_Composants` | Découpage en composants / hooks / services |
| `05_Roadmap` | Plan d’implémentation par phases (sans casser la prod) |
| `06_Specs_Detaillees` | Spécifications écran par écran pour l’IA |

---

## Principes directeurs de la refonte

1. **Un seul objet central** : le Repair Order (OR), avec parcours guidé.
2. **Séparation stricte des préoccupations** : UI ≠ logique métier ≠ données.
3. **Visibilité par rôle** : magasinier ≠ technicien ≠ chef ≠ réception.
4. **Un seul chemin devis** (versionné + autorisation ligne par ligne).
5. **Navigation robuste** : routes dédiées + onglets dans l’URL.
6. **Actions contextuelles** : plus de boutons qui disparaissent sans explication.
7. **Édition des lignes** + **pointage** + **technicien responsable** rendus visibles.

---

## Comment utiliser ce package

Transmettre l’intégralité du ZIP à l’IA codeur avec la consigne :

> « Refondre le module Ordres de Réparation en respectant strictement la conception cible décrite dans ce package. Partir de l’existant, ne rien casser en production, migrer par phases selon la roadmap. »
