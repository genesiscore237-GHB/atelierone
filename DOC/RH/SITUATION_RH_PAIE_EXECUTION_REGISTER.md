# REGISTRE D'EXÉCUTION — SITUATION RH & PAIE — ANALYSE DE PÉRIODE

> Capacité transverse lecture seule · module tRPC `rhPeriode` (`situation` / `employe` / `export`).
> Mandat : MASTER TASK 2026-09-28 (« Situation RH & Paie — Analyse de période »).
> Référentiels : `audit/SITUATION_RH_PAIE_PERIODE_CONCEPTION_V2.md` · `audit/situation-rh/preflight.md` ·
> `DOC/RH/SITUATION_RH_PAIE_API_CONTRACT.md` (**VERROUILLÉ 2026-09-28**).
> Règles : lecture seule stricte (aucune mutation depuis `rhPeriode.*`) · masque salaire côté serveur `rh.salaire.consulter` ·
> projection pure `calculatePayroll` · tri serveur whitelist · gardes période (to ≥ from, ≤ 13 mois civils).

| Étape | Intitulé | Statut | Preuve |
|---|---|---|---|
| 1 | PLANIFIER — périmètre, risques, interdits | ✅ | `audit/situation-rh/preflight.md` |
| 2 | INSPECTER — moteurs purs réutilisables, FORBIDDEN, permissions réelles | ✅ | `preflight.md` §1-§8 |
| 3 | CONTRACTER — spec API verrouillée | ✅ | `DOC/RH/SITUATION_RH_PAIE_API_CONTRACT.md` |
| 4 | CONCEVOIR — moteur pur `rh-situation-engine.ts` + types partagés (§G) | ✅ | vitest `rh-situation-engine.test.ts` **57/57 verts** |
| 5 | BACKEND — routeur `rh-situation.ts` typecheck-clean, monté dans `root.ts` | ✅ | `tsc --noEmit` : 0 erreur fichiers touchés ; `root.ts` `rhPeriode: rhPeriodeRouter` |
| 6 | TEST BACKEND — tests d'intégration router (machine, DB locale) | ✅ | vitest `rh-situation.integration.test.ts` **13/13 verts** |
| 7 | REGISTRE — ce fichier | ✅ | — |
| 8 | TERRAIN — scénario installé (fixtures par ID exact + nettoyage, DB avant/après, idempotence x10) | ⏳ | à produire |
| 9 | NON-RÉGRESSION — R3 134j/1114.6h/45.6 %, R4 emp21 +509,42, R5, R6-FUNC-01/02/03 | ⏳ | à exécuter |
| 10 | SÉCURITÉ — masquage serveur (perm `rh.salaire.consulter`), anomalies filtrées, export masqué | ⏳ | à exécuter |
| 11 | UI — page `rh/situation`, `SituationPeriodPanel` (A-B-C-D), volet Sheet investigation | ⏳ | à exécuter |
| 12 | E2E — `e2e/situation-rh-paie-periode.spec.ts` SIT-01→SIT-15 | ⏳ | à exécuter |
| 13 | GATE 60 — contrôles + build | ⏳ | à exécuter |
| 14 | RAPPORT — `DOC/RH/PHASE_SITUATION_RH_PAIE_FINAL_2026-09-28.md` | ⏳ | à produire |
| 15 | CLÔTURE — `graphify update .` + STOP | ⏳ | — |

---

## Point d'étape 2026-09-28 (après étapes 1-7)

### Backend livré
- **Routeur** `apps/nextjs/src/server/api/routers/rh-situation.ts` (`rhPeriodeRouter`) — 3 procédures `.query` exclusivement :
  - `situation` : batch lecture zéro N+1 (employés, calcs présence, saisies, fériés, cycles, historique salaire,
    avances/récupérations, périodes paie, résumés mensuels, bulletins), tri global serveur whitelist, agrégats sur
    le jeu filtré complet, pagination, `periodState` MIXTE par mois civil, anomalie `BULLETIN_DIFFERENT_PROJECTION`.
  - `employe` : volet investigation (timeline quotidienne `classifierJourDetail`, journal avances, projection pure,
    arbre `OrigineValeur` , bulletin réel si couverture).
  - `export` : CSV RFC-4180 (`toCsv`, `;` + CRLF), mêmes filtres, masquage serveur des colonnes salaire sans perm.
- Scoping tenant : `eq(employes.agenceId, ctx.user.agenceId)` + sentinelle `eq(col, -1)` quand le jeu filtres est vide.
- Gardes : `to < from` BAD_REQUEST · plage ≥ 13 mois civils BAD_REQUEST · `sort === "net"` sans perm BAD_REQUEST ·
  tri hors whitelist BAD_REQUEST.
- Aucune écriture : middlewares `.query` + audit tRPC limité aux mutations (vérifié `trpc.ts:138-161`).

### Moteur pur (aucune DB)
- `apps/nextjs/src/server/lib/rh-situation-engine.ts` : `segmenterSalaires`, `modeNormaliseSegments`,
  `soldeAvanceAFin`, `calculerAvancesRow`, `calculerEtatPeriode`, `projeterPaie`, `couvertureBulletin`,
  `construireAnomalies`, `filtrerAnomaliesParPermission`, `resumerAnomalies`, `agregerLignes`, `trierLignes`,
  `classifierJourDetail`, `construireOrigine`, `SEUILS_ANOMALIE_DEFAUT`, `SORT_SITUATION_WHITELIST` (+ re-exports
  de types §G `PeriodeAnalyse`, `PayrollConfigItem`). `AvanceLecture` étendu (`recuperationDebut/Fin`).

### Tests (vert sur la machine)
- `npx vitest run src/server/lib/rh-situation-engine.test.ts` → **57 tests** (0.17 s).
- `src/server/api/routers/rh-situation.integration.test.ts` → **13 tests** contre la base locale `atelierone_erp`
  (caller in-process, ctx superadmin fabriqué, `@atelierone/auth` mocké) : gardes, schéma d'entrée, tenant scope,
  recherche ILIKE, tri serveur, pagination, idempotence x3, volet employé, export CSV.
- `npm run typecheck` (tsc --noEmit) : **0 erreur** sur les fichiers de cette capacité (routeur, moteur, tests,
  root.ts) ; 318 erreurs restantes = **préexistantes** hors périmètre (constaté repo-wide, hors mandat).

### Décisions verrouillées
- Masque salaire/bulletin/avance = permission **`rh.salaire.consulter`** (pas de `rh.paie.consulter` — n'existe pas
  dans le socle). `canSeeSalary` = `isSuperAdmin` OU `hasPermission(..., agenceId)`.
- Base = **base effective** (`baseEffectifPeriode`), jamais fusionné avec gains/net ; `netLabel = REEL|ESTIME`.
- Pas de `Math.max(0, net)` (expose NET_NEGATIF via anomalie). Jamais « *** » côté client (masque serveur).
- `attendance_monthly_summaries` **sans colonne `agenceId`** → requête via innerJoin employes.

### Hors périmètre (documentés, pas corrigés)
- `PlanningRH.tsx:82` · `rh.roster` (protectedProcedure) · `rh.getFiche` sans masque · `listBulletinSnapshots` gated
  sur perm de modifier · `hr_public_holidays.date` varchar · tsconfig `strict:false`.

### À faire
- Étapes 8 (fixtures TERRAIN) → 15 (rapport final + `graphify update .`). Voir pipeline ci-dessus.

---

## Notes d'exécution

- **2026-09-28** — Étapes 1→7 closes. Backend typecheck-clean, monté, testé 57+13 sur la machine.