# PHASE 4 — CONCEPTION : Présences / absences / temps

> **Phase active (registre)** : P06, P07, P08, P15, N04, N06, N17 + analyse de période (+ re-test P05).
> **Statut** : EN_CONCEPTION (les 7 lignes en EN_INSPECTION le 2026-09-23).
> **Ordre bloquant (§118)** : P06 → N06 ; P05 (re-test) ; analyse de période en tête.

---

## 1. Diagnostics fondateurs (lecture des fichiers Phase 4)

| Fichier | Constat |
|---|---|
| `rh-presence.ts` `closeMonth` (:356-441) | `daysPresent = !isAbsent` — les jours CONGE/MALADIE/MISSION/FORMATION (code C/M/O/F, `isAbsent=false`) gonflent `daysPresent` (N06) ; `daysOnLeave` jamais calculé (P06) ; les jours sans ligne de calcul (« muets ») ne sont comptés ni présents ni absents (P08) |
| `rh-dashboard.ts` `getKpis` (:132) | `presenceRate(presentTotal, max(workingDays,1))` — dénominateur **sans × effectif** → taux > 100 % possible (P07) |
| `rh-leave.ts` `getBalances` (:31-113) | Query à effet de bord : `INSERT` dans `leave_balances` à la lecture (P15) |
| `rh-leave.ts` `decideRequest` (:294-373) | L'approbation débite `takenDays`/`balance` **sans aucune trace** dans `leave_balance_adjustments` (N04) |
| `rh.ts` `createAbsence` (:863) | Procédure morte (durcie en Phase 3) : aucun écran ne l'appelle ; l'UI passe par les congés (`CongesAbsences.tsx`) (N17) |
| `presence-engine.ts` | `calculateAttendance` pose `codePresence` C/M/O/F et `isAbsent=false` pour les congés — comportement moteur conservé |

## 2. Règles de conception décidées (Phase 4)

1. **Classification canonique d'un jour (N06/P06/P08)** : pour la clôture et l'analyse, un jour comptable est classé par `codePresence` :
   - `C | M | O | F` → **joursOnLeave** (ni présent, ni absent) ;
   - `A` ou `isAbsent` → **absent** ;
   - autre (P/HS/R) → **présent**.
   Le moteur (`isAbsent=false` pour un congé) n'est **pas** modifié : le reclassement se fait à l'agrégation (résumés, KPIs, analyse).
2. **Jour comptable** = jour du mois `[start, finExclusive[`, hors dimanche, hors férié de l'agence, **dans la période d'emploi** `[dateEmbauche, dateSortie]`, et **non désactivé** par le cycle de travail (`hr_work_schedules.isWorkingDay=false`).
3. **Jour « muet » (P08)** : un jour comptable sans ligne de calcul = **absent compté**. Un employé **sans cycle de travail** n'a aucun pointage possible → non compté (aucun jour muet imputé).
4. **P07** : dénominateur du KPI présence = `jours ouvrés × effectif vivant` (`getKpis` compte déjà uniquement actif+congé+suspendu via P19). Le taux reste borné dans [0, 100 %].
5. **P15** : `getBalances` = **lecture pure** (lignes existantes + lignes virtuelles non persistées `isVirtual`). La création des soldes se fait par une **mutation explicite** `ensureBalances` (bouton UI « Synchroniser les soldes » — règle UX : validation explicite).
6. **N04** : l'approbation d'un congé avec décompte écrit une **ligne de trace** `leave_balance_adjustments` (montant négatif, motif avec réf. demande). `leave_balance_adjustments` = journal d'audit (aucun code ne recalcule le solde depuis cette table).
7. **N17 (décision produit)** : **congé = seule voie de saisie** d'une absence en RH (via demandes de congés approuvées ou statut posé en grille). `createAbsence`/`validerAbsence` restent durcis mais **non exposés à l'UI** (purge prévue en Phase 9 / N05). Documenté + commentaire code.
8. **Analyse de période** (fonctionnalité, en tête de Phase) : périmètre dates `[from, to]` + employé(s) (filtre agence). Sorties par employé : jours théoriques, présents, absents, congés, muets, heures théoriques / travaillées / normales / HS, retards (constatés cumulés), départs anticipés cumulés, taux de présence, et liste d'anomalies (RETARD, ABSENCE, NON POINTÉ). Moteur **pur** dans `rh-stats-engine` (`analyserPeriode`), query tRPC `rhPresence.analysePeriode`, UI onglet dédié dans `PresencesRH.tsx`.

## 3. Déroulé d'exécution

1. Moteur : `rh-stats-engine.ts` → `presenceRateForHeadcount`, `classifierJour`, `analyserPeriode` + tests vitest.
2. `closeMonth` (rh-presence.ts) : classification par codePresence + jours muets + `daysOnLeave` → P08/P06/N06.
3. `getKpis` (rh-dashboard.ts) : `presenceRateForHeadcount` → P07 (+ re-test P05).
4. `analysePeriode` (query) → fonctionnalité.
5. `rh-leave.ts` : `getBalances` pur + `ensureBalances` (P15) + trace approbation (N04).
6. UI : onglet « Analyse de période » (PresencesRH.tsx) + « Synchroniser les soldes » + garde ajustement (CongesAbsences.tsx) + colonne « Congés » (mensuel).
7. N17 : commentaire de décision dans `rh.ts` + note.
8. Tests (vitest RH), typecheck fichiers touchés, `graphify update`, journal T20, registre EN_TEST→VALIDE, RAPPORT_PHASE_4, autorévision, gate humain.

## 4. Risks & garde-fous

- Aucune migration DB (colonnes existantes : `daysOnLeave`, `leave_balance_adjustments`).
- Le moteur `presence-engine` reste inchangé (tests 30 ✅ conservés).
- `getBalances` retourne des lignes à `id: null` (virtuelles) → garde UI avant `adjustBalance`.
- Ne pas toucher aux autres phases (P04/P12/P13/N05… restent BACKLOG).