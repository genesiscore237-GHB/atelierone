# PHASE 7 — CONCEPTION — UX/UI : pagination + harmonisation + lecture des historiques (P20, N14, F27)

Date : 2026-09-23 · Phase 7 · ouverte après gate Phase 6 (feu vert humain)

## Contexte (audit + recon)

- **N14** : le cap 100 **réel** est sur l'Annuaire (`rh/annuaire/page.tsx` → `rh.list({limit:100})` sans pagination) ; les 5 listes RH (contrats, documents, sanctions, compétences, planning) chargent tout et filtrent côté client, sans pagination ni état ; `rh.list` supporte déjà `page/limit/search` (liste employés = 50/page paginée).
- **P20** : statuts employés affichés **bruts** (frappés `conge`/`sorti`) à 4 endroits (liste employés, contrats, organigramme, dossier disciplinaire) ; 5 jeux de libellés/classes dupliqués ; devise triplement hétérogène (`XOF`/`FCFA`/`F`, défaut agence `XAF`).
- **F27** : 4 tables snapshot écrites en P6, **aucun endpoint de lecture** ; colonnes JSON complètes aux 4 sites d'insertion.

## Décisions actées

### N14 — pagination / état visible
1. Annuaire réécrit sur le pattern serveur existant (`rh.list` `{page, limit, search}`) : recherche serveur + compteur « N employé(s) » + pagination (50/page). **Fini le cap 100 silencieux.**
2. Composants partagés client `ClientPagination` : hook `useClientPaging(items, pageSize)` + `<PaginationBar/>` + compteur de résultats + bouton « retour page 1 » ; appliqués aux 5 listes (25/page) : contrats, documents, sanctions, compétences (référentiel principal), planning (lignes de la semaine). Aucun clipper silencieux : tout ce qui est chargé est paginé, le total est affiché.
3. Le « signalement » (UX : état recherche) : input déjà présent partout ; on ajoute « 0 résultat pour « q » » et le compteur.

### P20 — harmonisation libellés / devise
4. Nouveau module partagé `src/lib/rh-labels.ts` : `STATUT_EMPLOYE_LABELS`/`COLORS` (5 clés, `sorti` inclus), `TYPE_EMPLOYE_LABELS`, `MODE_PAIE_OPTIONS`, `STATUT_EMPLOYE_OPTIONS` (5, et 4 pour le formulaire : `sorti` reste un workflow dédié). Tous les affichages d'employé passent par `statutLabel/typeLabel` — plus aucun `{emp.statut}` brut.
5. Devise canonique RH = **`XOF`** (défaut fiche existant ; `settings.currency` reste la source agence). Nouveau helper `formatDevise(amount, devise="XOF")` (lib/format.ts) ; remplacement de tous les littéraux `FCFA` et suffixes `" F"` des écrans RH par l'affichage `XOF` cohérent ; placeholders « (FCFA) » → « (XOF) ». `lib/format.ts` (usage hors RH) : `formatCurrency` inchangé (non-régression hors périmètre RH).
6. Description de la liste employés « Gérez les employés de votre librairie » → « Gérez les employés de votre structure » (texte dupliqué/erroné, cf. organigramme « garage »).

### F27 — lecture des historiques
7. **4 endpoints de lecture** (protectedProcedure) gatés par les **mêmes permissions que l'écriture** (l'historique bulletin/solde expose des montants) :
   - `rhPayroll.listBulletinSnapshots({ payrollEntryId })` — `rh.paie.modifier`
   - `rhPlanning.listWeekSnapshots({ employeId?, from?, to? })` — `rh.presence.modifier`
   - `rhEvaluation.listSnapshots({ evaluationId })` — `rh.evaluation.modifier`
   - `rhLeave.listBalanceSnapshots({ leaveBalanceId })` — `rh.conge.modifier`
8. Retour : liste triée `version/createdAt` desc (planning : `createdAt` seulement), avec `raison`, `createdAt`, `createdBy` (jointure `utilisateurs` → nom/prénom), et les payloads JSON bruts (`entityJson`, `linesJson`, `scoresJson`, `rowsJson`, `datesJson`…). Scopé `agenceId`.
9. **UI** : bouton « Historique » par élément (bulletin, évaluation, solde employé, semaine planning) → dialog listant les versions (vN · raison FR via `RAISON_LABELS` · date · auteur) + contenu dépliable. Pas de « rejouer/restauration » en Phase 7 (lecture seule ; le replay est une écriture → phase ultérieure décidée produit).
10. Aucune migration : les données existent (P6) ; index de tri non requis à ce volume (ordre à la requête).

## Déroulé
1. Socle partagé (rh-labels, format devise) + P20 sweeps. 2. Pagination (Annuaire + 5 listes). 3. F27 (read endpoints + labels RAISON_LABELS + UI). 4. Tests + typecheck + news + registre/TJ/RAPPORT + gate.

## Restes (backlog)
- Rejouer/restaurer une version (écriture) — proposé phase ultérieure.
- Devise agence `XAF/XOF` : normalisation de `settings.ts` (valeur par défaut agence) hors périmètre RH.
- Purge P16/N05 (phase 9), gardes P11 (phase 8), lecture+export historique (N15 phase 8).