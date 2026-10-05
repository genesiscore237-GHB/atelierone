# CONCEPTION PHASE 8 — Rapports / exports / impression (N15, N16, F25, P11)

Date : 2026-09-23
Phase : 8 · activée après gate Phase 7 (VALIDE) · une seule phase active
Ordre de livraison : **P11** (gardes RBAC des exports) → **N15** (exports depuis chaque liste) → **N16/F25** (impression window.print)

## Contexte / état des lieux

- `rhDashboard.export*` (`apps/nextjs/src/server/api/routers/rh-dashboard.ts:229-308`) : 4 exports CSV (exportEmployes, exportPresences, exportMatrice, exportDisciplinaire).
- **P11** : tous sont des `rhProcedure` **sans garde RBAC** → tout utilisateur avec accès RH exporte des données (dont colonne « Salaire base » déjà masquée par `rh.salaire.consulter` inline pour exportEmployes, mais les autres exports n'ont aucune garde métier).
- **N15** : les boutons d'export n'existent pas au niveau des listes ; exports sans filtres (tout, tous statuts, toute l'agence).
- **N16/F25** : pas d'impression (window.print) des listes/états RH (seul le bulletin PDF existe).

## Décisions de conception

### P11 — Gardes RBAC des exports (faire en premier)
1. Chaque export passe sur `requirePermissionProcedure` (même pattern que le reste des routers RH Phase 3) :
   - `exportEmployes` → **`rh.employe.consulter`**
   - `exportPresences` → **`rh.presence.consulter`**
   - `exportMatrice` → **`rh.competence.consulter`**
   - `exportDisciplinaire` → **`rh.discipline.consulter`**
2. Colonne « Salaire base » d'`exportEmployes` : garde inline `rh.salaire.consulter` **conservée** (si l'utilisateur a `rh.employe.consulter` mais pas `rh.salaire.consulter` → valeur `***`).
3. Réponse 403 (FORBIDDEN) cohérente avec le reste du module ; aucun export ne doit fuiter hors de l'agence (déjà scope agence).

### N15 — Exports étendus accessibles depuis chaque liste
1. **Paramètres communs** ajoutés aux exports concernés (optionnels, rétro-compatibles) :
   - `statut?: string` — filtre sur `employes.statut` (liste employés, présences éventuellement) ;
   - `departmentId?: string` — filtre département ;
   - `search?: string` — nom/prénom/matricule ILIKE (cohérent avec la recherche des listes) ;
   - `employeIds?: string[]` — **sélection multi-employés** (max gardée, ex. 200) : si fourni, remplace les filtres individuels.
   - `exportPresences` conserve `year`/`month` (obligatoires, inchangés).
2. **Boutons d'export gatés** sur les listes RH (règle UX §6 : bouton masqué/disabled sans permission, message clair en refus) :
   - Annuaire → « Exporter » (`exportEmployes`, perm `rh.employe.consulter`) — respecte recherche + filtre département + filtre statut de la page ;
   - Présences (Mensuel) → « Exporter » (`exportPresences`, perm `rh.presence.consulter`) ;
   - Compétences → « Exporter la matrice » (`exportMatrice`, perm `rh.competence.consulter`) ;
   - Disciplinaire → « Exporter » (`exportDisciplinaire`, perm `rh.discipline.consulter`).
3. **Téléchargement CSV** : réutiliser le helper `toCsv` existant + mécanisme de download du client (blob). Retour HTTP téléchargeable ou encode en base64 via tRPC (cohérent avec l'existant).
4. Les colonnes exportées reprennent celles de la liste (approx.) + tri serveur par défaut ; pas de colonnes configurables par l'utilisateur dans cette phase (porté N15 si besoin → note).

### N16 / F25 — Impression window.print
1. Bouton « Imprimer » sur les listes RH (Annuaire, Présences, Compétences, Disciplinaire, plus documents/contrats si pertinent).
2. CSS d'impression par page (`@media print`) masquant nav/aside/sidebar, ne gardant que la zone-état imprimable.
3. Remplit F25 (même livrable) ; utilisable pour les « 8 rapports » listés au checkpoint (liste employés, présences… ) via la liste parente.
4. Pas de nouveau PDF (le bulletin PDF existe déjà) ; l'impression navigator est suffisante.

## Périmètre UI (règle UX)
- Recherche/filtrage : conservé sur les listes (existant Phase 7) — les filtres alimentent l'export.
- Feedback : `toast()` sur échec/succès d'export ; états loading sur les boutons.
- Permissions sincères : boutons exports/impression gatés par permissions serveur cohérentes avec les endpoints tRPC.

## Tests / preuve
- **P11** : vitest trpc RBAC — rôle sans `rh.*.consulter` → FORBIDDEN ; avec permission → CSV.
- **N15** : scénario export filtré (statut=département/recherche/employeIds) → CSV conforme — test unitaire du paramètre de filtre + typecheck fichiers touchés.
- **N16/F25** : manuel (impression rendue) + typecheck.
- Suite globale à l'issue : 379/381 (inchangé, 2 échecs préexistants hors RH).

## Restes / non prévu
- Purge des procédures (N05/P16) : Phase 9.
- N18/N19/P09/P10/P14-variable : autres phases.
- Colonnes configurables par utilisateur : optionnel, en note.