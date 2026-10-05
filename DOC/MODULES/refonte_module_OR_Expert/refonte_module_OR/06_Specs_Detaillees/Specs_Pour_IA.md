# 06 — Spécifications actionnables pour l’IA codeur

## Objectif de la refonte
Transformer le monolithe `ordres-reparation/page.tsx` (1648 lignes) en module maintenable, guidé, multi-rôles, avec navigation robuste, tout en **conservant 100 % des fonctionnalités métier existantes**.

## Règles absolues
1. Ne jamais supprimer une capacité métier listée dans le diagnostic (les 25 items).
2. Ne jamais utiliser `deploy.mjs local` / reset de schéma pour cette refonte front.
3. Toute nouvelle UI doit s’appuyer sur les endpoints tRPC déjà présents autant que possible.
4. Les transitions de statut restent pilotées par `atelier-service` / machine d’états.
5. Un seul système de devis : versionné + autorisation ligne par ligne.

## Livrables attendus de l’IA
1. Nouvelle structure de dossiers (voir Architecture_Cible)
2. Route `/ordres-reparation/[id]` fonctionnelle avec stepper
3. 7 onglets (même vides au début) pilotés par `?tab=`
4. `LignesEditor` permettant l’ajout manuel de main d’œuvre
5. Section Pointage visible
6. Sélecteur de technicien responsable
7. Suppression progressive de l’ancien monolithe une fois les onglets à parité
8. Permissions plus fines branchées

## Ordre d’implémentation imposé
Suivre strictement la Roadmap (Phase 0 → 5).

## Tests de non-régression minimaux
- Création OR
- Changement statut avec raison
- Sortie / retour / réservation pièce
- Diagnostic + validation
- Création version devis + autorisation ligne
- DVI + conversion points
- QC + restitution
- Facturation
- Timeline visible

## Références internes
- Diagnostic_Expert.md
- Architecture_Cible.md
- Parcours_et_Vues.md
- Machine_Etats_et_Devis.md
- Decoupage_Composants.md
- Roadmap_Implementation.md
