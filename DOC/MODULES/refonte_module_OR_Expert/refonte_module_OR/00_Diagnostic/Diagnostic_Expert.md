# 00 — Diagnostic Expert Confirmé

## Verdict global

Le module actuel est **fonctionnellement riche** (25+ capacités métier réelles) mais **structurellement invivable**.  
C’est un monolithe UI de 1648 lignes qui concentre trop de responsabilités, sans parcours guidé, avec des chemins métier concurrents et une navigation fragile.

**Note de maturité actuelle :**
- Couverture fonctionnelle : **8/10**
- Architecture & maintenabilité : **2/10**
- UX / guidage utilisateur : **2/10**
- Séparation des rôles : **3/10**
- Robustesse navigation : **2/10**

---

## Matrice des problèmes (priorisée)

### Critiques (bloquants UX / métier)

| ID | Problème | Impact | Priorité |
|----|----------|--------|----------|
| U1 | Absence totale de parcours guidé / onglets | Novice perdu, erreurs fréquentes | P0 |
| U4 | Double système de devis (simple + versionné) | Incohérence métier grave | P0 |
| F1 | Lignes en lecture seule (pas d’ajout MO manuelle) | Atelier bloqué | P0 |
| U3 | Actions éparpillées + tout visible pour tous | Surcharge cognitive + risques | P0 |
| U5 | Pas de route dédiée `/[id]` | Navigation et partage cassés | P1 |

### Majeurs

| ID | Problème | Impact | Priorité |
|----|----------|--------|----------|
| U2 | Boutons qui apparaissent/disparaissent sans explication | Confusion | P1 |
| F3 | Pointage / temps absent de l’UI | Donnée métier perdue | P1 |
| F4 | Sélecteur technicien responsable absent | Responsabilité floue | P1 |
| F2 | Facturation partielle / avances manquantes | Écart schéma ↔ UI | P1 |
| U6 | Terminologie incohérente (3 endroits pour « ligne ») | Confusion | P2 |

### Structurels (dette technique)

| ID | Problème | Impact |
|----|----------|--------|
| T1 | Monolithe 1648 lignes + 6 fonctions | Maintenance quasi impossible |
| T2 | 8 modals « maison » + 8 booléens | État fragile, fuites d’état |
| T3 | ~40 mutations + invalidations en cascade | Perf et complexité |
| T4 | Permissions trop grossières (3 niveaux seulement) | Impossible de scinder par rôle proprement |

---

## Ce qui est bon et doit être conservé

- La richesse fonctionnelle (DVI, cores, kits, pièces client, retours fournisseur, historique…)
- Le backend relativement structuré (`atelier-service`, transitions de statut)
- Le schéma de données déjà assez complet (totalFacture, resteAFacturer, responsableTechnicienId, pointage…)
- La timeline d’historique

**Conclusion** : on ne jette pas le métier, on **restructure radicalement la présentation et l’architecture front**.
