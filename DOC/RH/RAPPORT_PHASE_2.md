# RAPPORT DE PHASE 2 — Paie, périodes et calculs (P05, P14, N03, N07, N08, N09, N10 + N20 pre-step, P13 pré-conception)

Date : 2026-09-23
Phase : 2 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 3)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| P05 — borne de clôture | ✅ Fonction pure `intervalleMois(year, month)` ajoutée dans `presence-engine.ts` (retourne `{debut, finExclusive}`) ; `rhPresence.closeMonth` filtre `gte(debut)` + `lt(finExclusive)` — le 01 du mois suivant ne compte plus. Import drizzle `lt`+`lte` cohabitant (lte conservé pour grille `:248`) |
| P05 — tests | ✅ describe « P05 — borne de clôture du mois » (30/09 inclus, 01/10 exclu ; sept 2025, décembre 2025→2026, janvier, bornes) — presence-engine 30/30 |
| P14 — table canonique | ✅ `normaliserModePaie()` central dans `payroll-engine.ts` (6 modes, alias légués mensuel/horaire/journalier/commission/forfait/non_remunere/essai, inconnu → SALAIRE_MENSUEL) ; utilisé par `prepareMonth` (:313), `adjustEntry` (:~615) ET l'historique `rh.updateEmployee` (rh.ts — suppression du mapping rétro dupliqué qui mappait journalier/commission → SALAIRE_HORAIRE) |
| P14 — branche journalier | ✅ `calculatePayroll` : mode `JOURNALIER` → brut = taux journalier (`baseSalary`) × `daysPresent`, ligne `BASE_JOURNALIER`, jamais la branche mensuelle ; OA/hs condition élargie ; jamais proratisé par `baseEffectifPeriode` |
| P14 — branche commission | ✅ `COMMISSION` → base fixe conservée (ligne `BASE`), la part variable est alignée en Phase 5 (N20) ; jamais proratisée par l'historique |
| N03 — markPaid | ✅ Chargement bulletin + période **scopés agence** (404 sinon) ; refus si période non `closed` ou bulletin non `prepare` (`peutPayer`) ; update `paye` + traçage dans `auditLogs` (action `PAIE_MARQUEE_PAYE`, entityType `payroll_entry`, montant, période, mode, ancien statut) — aucune migration nécessaire (colonne `paidBy` non ajoutée) |
| N07 — dénominateur unifié | ✅ `joursOuvres(debut, fin, holidays[])` exclut dimanche **et** fériés ; `calculerProrata` et `baseEffectifPeriode` acceptent `holidays` ; `prepareMonth` et `adjustEntry` chargent les fériés agence (`hrPublicHolidays`) sur la période et les passent au moteur ; `expectedWorkingDays` prime/prorata = `joursOuvres(période, fériés)` → cohérent avec `workingDaysInMonth` du KPI |
| N08 — forfait réel | ✅ `semainesDansPeriode(debut, fin)` = `round2(joursCalendaires/7)` ; `prepareMonth` l'utilise (30 j → 4,29, plus de `ceil(30/7)=5`) ; suppression du code mort `weeksInPeriod` |
| N09 — heures standard | ✅ `STD_MONTHLY_HOURS = 225.3` (fallback du moteur, remplace le bug `expectedWorkingDays*8 = 208`) ; fautes routers et `rh-posture.ts` déjà à 225,3 ; test HS mis à jour sur la constante |
| N10 — ordre des opérations | ✅ Fonctions pures `peutPreparer` / `peutCloturer` / `peutAjuster` / `peutPayer` ; `openPeriod` refuse double période ouverte + chevauchement ; `closePeriod` scopé agence + garde clôture unique ; `prepareMonth` exige présence clôturée (RH-02) + période ouverte ; `adjustEntry` scopé agence + verrou post-clôture/post-paiement ; `markPaid` exige clôture + statut prepare |
| N20 (pre-step) | ✅ Modes `JOURNALIER`/`COMMISSION` alignés dans moteur + normalisation + historique (fait en Phase 2 avec P14) ; la part variable commission reste Phase 5 (N20 demeure BACKLOG) |
| P13 (pré-conception) | ✅ Table `payroll_entry_snapshots` conçue (version, linesJson, createdBy, createdAt, raison `recalcul|adjustment`) dans `PHASE_2_CONCEPTION.md` ; exécution Phase 6 — `payrollEntryLines` reste l'état actif |
| Tests | ✅ `payroll-engine.test.ts` 51/51 (N09, N08, N07, P14/N20, N10 ajoutés) + `presence-engine.test.ts` 30/30 (P05 ajouté) = **113/113** (hors worktree `.kilo` 14+18 = 113/113 globaux) |
| Non-régression / typecheck | ✅ `tsc --noEmit` : **0 erreur** sur tous les fichiers touchés (`payroll-engine`, `presence-engine`, `rh-payroll`, `rh-presence`, `rh-projection`, `rh.ts` lignes modifiées, tests) ; erreurs restantes toutes préexistantes et hors périmètre (catalog, pos, sales, stock, cash, procurement, geo, ui, services…) |

## Lignes passées

**EN_TEST → TERMINE** (en attente passage **VALIDE** par gate humain) :
- **P05** — borne de clôture `lt(finExclusive)` (30/09 inclus, 01/10 exclu)
- **P14** — table canonique des modes + branches journalier/commission (moteur, préparation, ajustements, historique)
- **N03** — `markPaid` post-clôture, scoped agence, traçable (audit)
- **N07** — dénominateur unifié paie/KPI avec fériés
- **N08** — forfait hebdomadaire sur semaines réelles (4,29 et plus 5)
- **N09** — fallback heures standard 225,3 h
- **N10** — ordre des opérations paie (machine d'état + gardes)

## Preuves

- `pnpm.cmd vitest run apps/nextjs/src/server/lib/payroll-engine.test.ts apps/nextjs/src/server/lib/presence-engine.test.ts` → **113/113** verts
- `pnpm.cmd --filter @atelierone/nextjs exec tsc --noEmit` → 0 erreur sur les fichiers touchés (liste des fichiers fautifs exhaustive : aucune occurrence de rh-payroll/rh-presence/presence-engine/payroll-engine/rh-projection ; rh.ts ne garde que ses erreurs préexistantes : 121/223/263/438/460/511/525)
- `TEST_JOURNAL.md` §1 : réf **T18** ajoutée · §2 : entrée n°2 renseignée

## Régressions

0 connue sur la baseline. Erreurs typecheck **préexistantes** (non introduites) réparties sur les modules non-RH (catalog, pos, sales, stock, cash, procurement, inventory, customers, finance, geo, ui, alert/compta/kpi/return/sale/stock-services) et `rh.ts` (lignes déjà fautives avant cette phase) — périmètres des Phases 3+.

## Décisions produit actées

- **JOURNALIER** = paie à la journée : brut = taux journalier × jours présents ; le taux journalier est porté par `salaireBase`.
- **COMMISSION** = base fixe conservée en Phase 2 ; la **part variable** est traitée en Phase 5 (N20) ; ces deux modes ne sont jamais proratisés par l'historique de salaire.
- Valeur de mode non reconnue → `SALAIRE_MENSUEL` (rétro-compatibilité stricte).
- Fériés exclus du dénominateur paie (prime/prorata) **comme** sur le KPI dashboard (N07).
- Le paiement d'un bulletin n'ajoute pas de colonne `paidBy` : traçage dans `audit_logs` (action dédiée), tables inchangées → pas de migration.
- Snapshot bibliothèque bulletins (P13) : reporté avec le schéma `payroll_entry_snapshots` en Phase 6.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Demande

**Ouvrir la Phase 3 (N01 socle multi-agence des lectures/mutations « par id » → N11 ; P16 durcissement ; P17 gating boutons ; P19 KPIs statuts)** : **oui — gate humain Phase 2 passé (feu vert 2026-09-23), registre Phase 3 ouverte.**