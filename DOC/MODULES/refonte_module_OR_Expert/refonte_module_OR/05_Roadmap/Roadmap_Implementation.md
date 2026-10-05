# 05 — Roadmap d’implémentation (sans casser la prod)

## Principe
Migrer **par couches**, en gardant l’ancien monolithe fonctionnel jusqu’à bascule progressive.

---

## Phase 0 — Préparation (1-2 jours)
- Créer la structure de dossiers cible
- Extraire `or-status-machine.ts`
- Créer `useOrPermissions` fin
- Mettre en place les routes `/[id]` en parallèle (ancienne page reste active)

## Phase 1 — Navigation & coquille (3-5 jours)
- Implémenter `/ordres-reparation/[id]` avec header + stepper
- Onglets vides mais routés (`?tab=`)
- Redirection depuis l’ancienne fiche
- Conservation de toutes les données

## Phase 2 — Unification devis + lignes éditables (5-7 jours)
- Supprimer le chemin « devis simple » de l’UI
- Un seul `DevisTab` versionné
- `LignesEditor` avec ajout/édition MO et pièces
- Brancher les mutations existantes

## Phase 3 — Onglets métier un par un (8-12 jours)
Ordre recommandé :
1. Travaux & Pointage (le plus manquant)
2. Pièces (regroupement des 5 blocs actuels)
3. Diagnostic + DVI
4. Qualité
5. Facture & Restitution
6. Réception

## Phase 4 — Permissions fines & nettoyage (3-4 jours)
- Brancher les permissions par onglet / action
- Supprimer l’ancien monolithe
- Invalidations React Query ciblées
- Tests de non-régression sur les 25 fonctionnalités listées

## Phase 5 — Polish UX (2-3 jours)
- Bandeau « prochaine action »
- Messages d’état explicites
- Toasts cohérents
- Responsive tablette atelier

---

## Critères de done globaux

- [ ] Aucun fichier UI > 350 lignes
- [ ] Routes propres + historique navigateur OK
- [ ] Un seul chemin devis
- [ ] Lignes éditables + pointage + technicien visibles
- [ ] Parcours 7 étapes guidé
- [ ] Visibilité par rôle
- [ ] 25 fonctionnalités actuelles toujours opérationnelles
- [ ] Aucune régression sur les transitions de statut
