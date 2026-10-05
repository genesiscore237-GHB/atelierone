# RAPPORT DE PHASE 4 — Présences / absences / temps (P06, P07, P08, P15, N04, N06, N17 + analyse de période)

Date : 2026-09-23
Phase : 4 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 5)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| **P06 — `daysOnLeave` réel** | ✅ `closeMonth` (`rh-presence.ts`) classe chaque jour comptable via `classifierJour` : **C/M/O/F → CONGE** (ni présent ni absent) ; `daysOnLeave` écrit dans le résumé ; `listSummaries` et `exportPresences` (rh-dashboard) le renvoient ; colonne « Congés » ajoutée dans « Mensuel & clôture » (`PresencesRH.tsx`) |
| **P07 — KPI ≤ 100 %** | ✅ `presenceRateForHeadcount(presentDays, workingDays, headcount)` ajouté (`rh-stats-engine.ts`) ; `getKpis` (`rh-dashboard.ts:133`) branché dessus → dénominateur `workingDays × effectif vivant` (effectif = actif+congé+suspendu, déjà filtré P19) ; taux ∈ [0,100] |
| **P08 — jours muets = absents** | ✅ `closeMonth` énumère les jours calendaires du mois et compte « jour comptable » = dans `[dateEmbauche, dateSortie]`, hors dimanche, hors férié agence, non désactivé par le cycle (`hr_work_schedules.isWorkingDay = false`) et **seulement si l'employé a un `workCycleId`** ; tout jour comptable sans ligne de calcul → `daysAbsent++` ; employé sans cycle = résumé à zéros, jamais imputé |
| **P15 — lecture pure** | ✅ `getBalances` : plus aucun INSERT — lignes existantes + **virtuelles** (`isVirtual`, `id: null`) ; création déplacée dans la mutation `ensureBalances` (idempotente, permission `rh.conge.modifier`) ; UI `CongesAbsences.tsx` : bouton « Synchroniser les soldes » + badge « Virtuel » + bouton « Ajuster » désactivé/gardé sur solde virtuel |
| **N04 — trace approbation** | ✅ `decideRequest` (branch décompte) : après l'`update` du solde, INSERT d'une ligne `leaveBalanceAdjustments` (montant négatif, motif `Prise de congé approuvée (demande #id, n j)`, `createdBy`) = journal d'audit, sans recalcul depuis cette table |
| **N06 — congés ≠ présents** | ✅ Intégré à la classification : les jours C/M/O/F ne gonflent plus `daysPresent` ; colonne « Congés » dédiée ; bis : les jours « muets » ne gonflent pas non plus `daysAbsent` de manière erronée (règle 8 de conception) |
| **N17 — congé = seule voie** | ✅ Décision actée (règle 7 de `PHASE_4_CONCEPTION.md`) + commentaire au-dessus de `createAbsence` (`rh.ts`) documentant le statut legacy (conservé, non exposé à l'UI, purge Phase 9/N05) |
| **F26 — analyse de période** | ✅ Moteur pur `analyserPeriode` + types (`JourAnalyseInput`, `AnomalieAnalyse`, `PeriodeAnalyse`) ; query lecture seule `rhPresence.analysePeriode` (from/to/employeeId, jours fériés, schedules par cycle+jour, `heuresTheoriquesDuJour` avec repli paramétrage) ; onglet « Analyse de période » (`PresencesRH.tsx`) : dates + filtre employé + recherche texte + stats + anomalies R/A/MUET |
| **Re-test P05 (bornes clôture)** | ✅ `closeMonth` conserve `intervalleMois(year, month)` (`finExclusive`) — le 01 du mois suivant reste EXCLU ; test P03 (dimensions) : cohérent |
| **Moteur non régressé** | ✅ `presence-engine` / `rh-projection` **non modifiés** (30/30 verts) ; classification isolée dans `classifierJour` |
| Tests | ✅ T20 : **165/165** verts — dont **10 nouveaux** (rh-stats) ; 1 fixture corrigée en cours (cohérence workedMinutes des jours R/HS) ; suite RH complète (10 fichiers, y compris leave-engine/rh-posture/disciplinary/documents/evaluation) |
| Non-régression / typecheck | ✅ `tsc --noEmit` : **0 erreur sur les fichiers touchés** de la phase (rh-presence, rh-dashboard, rh-leave, rh-stats-engine, PresencesRH, CongesAbsences — 3 erreurs introduites corrigées) ; restent **préexistantes** hors périmètre : `rh.ts:122/224/264/439/461/521/535`, `rh-stats-engine.ts:62` = `payrollMass` (décalée 46→62 par le diff, lignes inchangées), catalog/pos/sales/stock/services |

## Lignes passées (EN_INSPECTION → … → **TERMINE**)

- **P06** — `daysOnLeave` réel + colonne Congés (P1)
- **P07** — KPI taux de présence `workingDays × effectif` (P1)
- **P08** — jours muets → absents (P1)
- **P15** — `getBalances` lecture pure + `ensureBalances` + UI sync (P2)
- **N04** — trace `leaveBalanceAdjustments` à l'approbation (P2)
- **N06** — classification canonique (C/M/O/F = congé) (P1)
- **N17** — décision produit : congé = seule voie (P1)
- **F26** — analyse de période (onglet + moteur + API) (P1)

## Preuves

- `npx vitest run` (10 fichiers RH) → **165/165 verts** (baseline 124 → +41 tous fichiers RH, dont +10 Phase 4)
- `npx tsc --noEmit` → 0 erreur sur les fichiers touchés de la phase (liste détaillée ou §autorévision)
- `TEST_JOURNAL.md` §1 : réf **T20** ajoutée · §2 : entrée **n°4** renseignée
- `DOC/RH/PHASE_4_CONCEPTION.md` : 8 règles de conception actées + déroulé + risques
- `graphify update .` exécuté après modification (règle AGENTS.md)

## Régressions

0 connue sur la baseline RH. Full-suite garde 2 échecs **préexistants hors RH** (licence-service, stock-engine) — inchangés. Erreurs typecheck restantes toutes préexistantes, hors périmètre RH.

## Décisions produit actées (détaillées : `PHASE_4_CONCEPTION.md`)

1. **Classification canonique** `classifierJour(code, isAbsent)` : C/M/O/F → CONGE (jours congés, ni présents ni absents) ; A/isAbsent → ABSENCE ; sinon PRESENCE.
2. **Jour comptable** = dans `[dateEmbauche, dateSortie]`, hors dimanche, hors férié agence, non désactivé par cycle.
3. **P08** : employé sans `workCycleId` non compté (aucun jour muet imputé — résumé à zéros conservé).
4. **P07** : dénominateur KPI = `workingDays × effectif vivant`.
5. **P15** : `getBalances` lecture pure + lignes virtuelles ; création via `ensureBalances` ; garde UI sur `adjustBalance`.
6. **N04** : trace `leaveBalanceAdjustments` = journal d'audit (aucun recalcul depuis cette table).
7. **N17** : congé = seule voie de saisie d'absence ; `createAbsence` legacy documenté, non exposé.
8. **Analyse de période** : moteur pur + query lecture seule + onglet UI ; code `MUET` pour jour comptable sans saisie.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Restes de phase (BACKLOG conservés, autres phases)

- **P04, P09, P10, P11, P12, P13, P18, N02, N05(Context), N12, N13, N14, N15, N16, N18, N19, N20, F04, F05, F25** — restent BACKLOG Phases 5/6/7/8/9, non actifs.
- **N02** (lecture RH rôles opérationnels) et **P18** (recherche globale) confirmés comme socle de la Phase 5.
- **T15 multi-agence complet** (tRPC salaire/présence/bulletin/documents/discipline/compétences) : la base vitest (`rh-scope` + classifications présences) est posée ; le routage complet reste proposé en phase ultérieure.

## Demande

**Gate Phase 4 : passé le 2026-09-23 — lignes passées en VALIDE au registre (P06, P07, P08, P15, N04, N06, N17, F26 + re-test P05). Feu vert humain obtenu pour ouvrir la Phase 5 (Statuts / réembauche / navigation — P04, P12→N12/F04, F05, N02, P18, N20).**