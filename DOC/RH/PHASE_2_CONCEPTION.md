# PHASE 2 — CONCEPTION (PAIE, PÉRIODES ET CALCULS)

> Phase : 2 · Lignes : P05, P14, N03, N07, N08, N09, N10 (+ N20 pre-step, P13 pré-conception) · Statut conception : VALIDÉE (attends gate humain)
> Fichier produit à l'étape 2 du protocole de phase. L'étape 1 (audit) figure dans `rapport-audit-module-rh-2026-09-23.md` + constats ci-dessous.

## 1. Rappel des constats d'audit (Étape 1)

| Point | Fichier/ligne | Constat |
|---|---|---|
| **P05** | `rh-presence.ts:359-387` (closeMonth) | `monthEnd` = 1er jour du mois suivant, utilisé en `lte(attendanceEntries.date, monthEnd)` → le **01 du mois suivant est compté dans le mois courant**. |
| **P14** | `rh-payroll.ts:255` (prepareMonth), `:563` (adjustEntry), `rh.ts:414-417` | Mapping `modePaie` **dupliqué et divergent** : prepareMonth cast `(emp.modePaie as PayMode)` sans mapping → un `journalier` (legacy) tombe dans la branche `else` = mensuel ; adjustEntry ne mappe que `mensuel`/`horaire` ; rh.ts propage `journalier|commission→SALAIRE_HORAIRE`. Aucune table canonique unique. |
| **N20 (pre-step)** | `payroll-engine.ts:14` | `PayMode` = 4 valeurs seulement (`NON_REMUNERE`, `FORFAIT_HEBDOMADAIRE`, `SALAIRE_MENSUEL`, `SALAIRE_HORAIRE`) — `JOURNALIER` et `COMMISSION` non modélisés. |
| **N03** | `rh-payroll.ts:612-621` (markPaid) | Aucune vérification : ni agence, ni période fermée, ni statut `prepare` → un bulletin déjà payé peut être re-payé ; id inexistant → `update...returning()` = `[]` **silencieux** ; aucun traçage. |
| **N10** | `rh-payroll.ts:53-91` (openPeriod/closePeriod) | `openPeriod` n'empêche ni double période ouverte ni chevauchement ; `closePeriod` **sans filtre agence** et sans verrou logique (préparation/ajustement/paiement restent possibles post-clôture). |
| **N07** | `payroll-engine.ts:104` (`joursOuvres`), `rh-payroll.ts` (prepareMonth) | Prime de présence paie : dénominateur `joursOuvres` (lun-sam **sans fériés**) ; KPI dashboard : `workingDaysInMonth` (avec fériés) → dénominateurs divergents. |
| **N08** | `rh-payroll.ts:276` (`weeksForfait`) | `weeksForfait = ceil(joursCalendairesEffectifs / 7)` → mois de 30 j facturé **5 semaines** (30/7 = 4,29). |
| **N09** | `payroll-engine.ts:256` (`stdHours`) | Fallback `expectedWorkingDays × 8` = **208 h** au lieu du standard MVP **225,3 h** (paramétrage `hr_general_settings` défaut 225,3). |
| **P13 (pré-conception)** | `rh-payroll.ts:402,597` | `prepareMonth`/`adjustEntry` font DELETE+INSERT des lignes de bulletin → régénération = **historique perdu**. Exécution Phase 6 ; stratégie à définir ici. |

## 2. Conception — P05 : borne de clôture du mois (bornes pures)

Ajouter dans `presence-engine.ts` une fonction pure (testable) :

```ts
/** Intervalle de référence d'un mois : [début, finExclusive[ (le 1er du mois suivant est EXCLU). */
export function intervalleMois(year: number, month: number): { debut: string; finExclusive: string } {
  const debut = `${year}-${String(month).padStart(2, "0")}-01`;
  const annee = month === 12 ? year + 1 : year;
  const mois = month === 12 ? 1 : month + 1;
  const finExclusive = `${annee}-${String(mois).padStart(2, "0")}-01`;
  return { debut, finExclusive };
}
```

`rh-presence.ts` `closeMonth` :
- `const { debut, finExclusive } = intervalleMois(input.year, input.month);`
- `where(and(gte(attendanceEntries.date, debut), lt(attendanceEntries.date, finExclusive), eq(employes.agenceId, agenceId)))` (remplace les `monthStart` + `lte(monthEnd)`).

**Test obligatoire** : `attendanceEntries.date = 2025-09-30` → inclus ; `= 2025-10-01` → exclu. Vérifier par `estDansMois` (optionnel) ou par la requête : on teste `intervalleMois` (pureté) + le filtre SQL via un scénario d'intégration dans le test-engine de présence (assertion `lt`).

## 3. Conception — P14 + N20 (pre-step) : table de correspondance canonique des modes

### 3.1 Moteur (`payroll-engine.ts`)

```ts
export const PAY_MODES = [
  "NON_REMUNERE", "FORFAIT_HEBDOMADAIRE", "SALAIRE_MENSUEL",
  "SALAIRE_HORAIRE", "JOURNALIER", "COMMISSION",
] as const;
export type PayMode = (typeof PAY_MODES)[number];

/** Normalise toute valeur (léguée ou canonique) vers un PayMode. Inconnu → SALAIRE_MENSUEL (rétro). */
export function normaliserModePaie(raw: string | null | undefined): PayMode {
  const v = (raw ?? "").trim().toLowerCase();
  const aliases: Record<string, PayMode> = {
    "non_remunere": "NON_REMUNERE", "essai": "NON_REMUNERE", "non remunere": "NON_REMUNERE",
    "forfait_hebdomadaire": "FORFAIT_HEBDOMADAIRE", "forfait": "FORFAIT_HEBDOMADAIRE",
    "salaire_mensuel": "SALAIRE_MENSUEL", "mensuel": "SALAIRE_MENSUEL",
    "salaire_horaire": "SALAIRE_HORAIRE", "horaire": "SALAIRE_HORAIRE",
    "journalier": "JOURNALIER",
    "commission": "COMMISSION",
  };
  return aliases[v] ?? (PAY_MODES.includes(v as PayMode) ? (v as PayMode) : "SALAIRE_MENSUEL");
}
```

**Décisions produit actées** :
- **JOURNALIER** : paie à la journée → `brut = tauxJournalier × joursPrésents` (le champ `salaireBase` = taux journalier), CNPS/IRPP appliqués. Plus jamais de chute dans `SALAIRE_MENSUEL`.
- **COMMISSION** : la partie variable (commissions sur ventes) n'a pas de source de données en Phase 2 → **rémunération fixe conservée** (bulletin sur `BASE`, cohérent avec l'historique). Le calcul réel des commissions = exécution N20 (Phase 5), documenté en `DOC/RH/PHASE_2_CONCEPTION.md` → REMARQUE cross-phase.
- Branches moteur ajoutées AVANT l'`else` mensuel ; les deux modes sont **explicitement reconnus** (`JOURNALIER` ne tombe plus dans `mensuel`).
- `baseEffectifPeriode`/`baseProratise` : `JOURNALIER` et `COMMISSION` traités **comme `SALAIRE_HORAIRE`** (jamais proratisés via historique).
- HS (`hours_x_rate`) : condition élargie pour inclure `JOURNALIER` (un journalier qui assure des HS).

### 3.2 Routers — une seule source de vérité

- `prepareMonth` (`:255`) : `const modePaie = normaliserModePaie(emp.modePaie);`
- `adjustEntry` (`:562-563`) : remplace le mapping local par `normaliserModePaie(emp?.modePaie)`.
- `rh.ts:414-417` (écriture `employeeSalaryHistory.modePaie`) : utilise `normaliserModePaie` (suppression de la duplication).

## 4. Conception — N10 : ordre des opérations verrouillé (machine d'état pure)

Nouvelles fonctions pures dans `payroll-engine.ts` (testables sans DB) :

```ts
export function peutPreparer(opts: { statutPeriode: string; presenceMoisCloture: boolean }): string | null;
export function peutCloturer(opts: { statutPeriode: string }): string | null;
export function peutAjuster(opts: { statutPeriode: string; statutBulletin: string }): string | null;
export function peutPayer(opts: { statutPeriode: string; statutBulletin: string }): string | null;
```

Règles (message = raison de refus, `null` = autorisé) :
- `peutPreparer` : refuse si période **`closed`** (« La période est clôturée : préparation impossible. ») ou présence du mois non verrouillée (message actuel conservé).
- `peutCloturer` : refuse si déjà `closed`.
- `peutAjuster` : refuse si bulletin `paye` (existant) ou période `closed`.
- `peutPayer` : refuse si période ≠ `closed` (« La période doit être clôturée avant tout paiement. ») ou bulletin déjà `paye`.

### Gardes dans `rh-payroll.ts`

| Procédure | Garde ajoutée |
|---|---|
| `openPeriod` | Refus si **une autre période est `open`** pour l'agence ; refus si **chevauchement** avec une période existante (exclu inclus : nouvelle `start < existante.end && existante.start < nouvelle.end`). |
| `closePeriod` | Charger la période **scoped agence** (404 sinon) → `peutCloturer`. N'exige pas les bulletins (préparation des mois suivants reste ouverte), MAIS interdit tout post-clôture par les autres gardes. |
| `prepareMonth` | `peutPreparer({ statutPeriode: period.status, presenceMoisCloture: !!summaryCheck })` (remplace le bloc `:104-123`). |
| `adjustEntry` | Filtre agence sur la période du bulletin (404 si autre agence) + `peutAjuster`. |
| `markPaid` | Filtre agence + `peutPayer` + traçage (cf. §5). |

## 5. Conception — N03 : `markPaid` sécurisé + tracé

`markPaid` (`:612-621`) :
1. Charger le bulletin + sa période (join), **scoped agence** via `payrollPeriods.agenceId`.
2. `peutPayer({ statutPeriode, statutBulletin })` → refus sinon (bulletins déjà `paye` impossible).
3. `update ... set { status:"paye", paymentMethod, paidAt, updatedAt }`.
4. **Traçage** dans `auditLogs` : `{ userId, action:"PAIE_MARQUEE_PAYE", entityType:"payroll_entry", entityId: input.id, details: JSON.stringify({ employeeId, periodId, montant, paymentMethod, periode }) }`.
5. Retourne la ligne mise à jour (jamais `[]` silencieux : le scoping agence + le `peutPayer` lèvent une erreur explicite avant le update).

> Pas de migration : `auditLogs` existe. Le registre (N03, colonne DB « évent. colonne/metadata ») est résolu par l'audit-logs préexistant.

## 6. Conception — N07 : dénominateur prime présence unifié (fériés)

Le moteur accepte des fériés de manière rétrocompatible (paramètre optionnel, défaut `[]`) :

```ts
export function joursOuvres(debut: string, fin: string, holidays: string[] = []): number;
export function calculerProrata(opts: { ...; holidays?: string[] }): ProrataPeriode;
export function baseEffectifPeriode(opts: { ...; holidays?: string[] }): number;
```

- Exclusion identique à `workingDaysInMonth` : dimanche **et** jours listés dans `holidays`.
- `prepareMonth` : charger les fériés de l'agence **sur l'intervalle de la période** (`hrPublicHolidays`, agence = `ctx.user.agenceId`) et les passer à `calculerProrata` (dénominateur `expectedWorkingDays`) et `baseEffectifPeriode`.
- Effet : prime de présence (paie) et KPI présence (dashboard) partagent le même dénominateur domestique (fériés exclus). Tests existants sans `holidays` → inchangés.
- `attendancePct` du moteur (`expectedWorkingDays`) utilise la valeur reçue ; le calcul des lignes s'aligne automatiquement.

## 7. Conception — N08 : forfait hebdomadaire sur périodes réelles

Nouveau helper pur dans `payroll-engine.ts` :

```ts
/** Nombre de semaines (fraction réellement présente) dans [debut, fin] inclus. */
export function semainesDansPeriode(debut: string, fin: string): number {
  const j = Math.round((new Date(`${fin}T00:00:00`).getTime() - new Date(`${debut}T00:00:00`).getTime()) / 86400000) + 1;
  return Math.round((j / 7) * 100) / 100; // 30 j → 4,29 (pas de ceil abusif)
}
```

`prepareMonth` : remplacer `weeksForfait = Math.ceil(joursCalendairesEffectifs / 7)` par `semainesDansPeriode(debutEffectif, finEffective)`. `weeklyForfaits` (si renseigné) reste prioritaire dans `calculerForfaitPeriode`.

Effet : mois de 30 j → **4,29 semaines** (au lieu de 5) ; mois de 28 j → 4 semaines exactes ; embauche/sortie mi-période → fraction réelle.

## 8. Conception — N09 : heures standard de référence

`payroll-engine.ts` :

```ts
/** Heures standard mensuelles par défaut (specs MVP : 225,3 h). */
export const STD_MONTHLY_HOURS = 225.3;
// stdHours = standardMonthlyHours && standardMonthlyHours > 0 ? standardMonthlyHours : STD_MONTHLY_HOURS;
```

Le fallback **incohérent 208** (`expectedWorkingDays × 8`) est éliminé. Mise à jour du test `2 h HS majorées` (`payroll-engine.test.ts:70-75`) : `hourly = 150000 / 225.3` (nouvelle base par défaut, conforme au paramétrage `hr_general_settings`).

## 9. P13 — Pré-conception : stratégie snapshot bulletins (exécution Phase 6)

**Problème** : `prepareMonth`/`adjustEntry` régénèrent le bulletin courant en DELETE+INSERT des lignes → la situation antérieure disparaît.

**Stratégie retenue (à implémenter en Phase 6 avec P13)** :
- Nouvelle table **`payroll_entry_snapshots`** (non destructive, versionnée, rollback prévu) :
  `id, payrollEntryId, version, periodId, employeeId, baseSalary, netPay, status, linesJson (jsonb), createdBy, createdAt, raison` (`recalcul|adjustment`).
- Avant toute régénération/ajustement d'un bulletin **existant** : archiver l'état courant (données + lignes) dans un snapshot (`version+1`), puis régénérer les lignes actives.
- `payrollEntryLines` = état actif ; `payroll_entry_snapshots` = historique rejouable. **Aucun DELETE destructif.**
- Migration Phase 6 : `CREATE TABLE` seule (+ index `(payrollEntryId, version)`), plan de rollback simple (`DROP TABLE`).
- Lien : CHECKLIST Phase 6 domaines bulletins.

## 10. Conception — Tests (Étape 6)

**Engine** (`payroll-engine.test.ts`) — ajouts :
- **N09** : fallback `STD_MONTHLY_HOURS` (HS sans `standardMonthlyHours`).
- **N08** : `semainesDansPeriode("2025-09-01","2025-09-30")` = 4,29 ; 28 j = 4 ; 14 j = 2.
- **N07** : `joursOuvres("2025-09-01","2025-09-30",["2025-09-02"])` = 25 ; prorata avec férié ; `baseEffectifPeriode` avec férié.
- **P14/N20** : `normaliserModePaie` (mensuel/horaire/journalier/commission/forfait/essai/inconnu) ; CAS JOURNALIER (brut = taux × jours présents) ; CAS COMMISSION (brut fixe, pas de BASE mensuel ≠ salaire proratisé).
- **N10** : matrice `peutPreparer`/`peutCloturer`/`peutAjuster`/`peutPayer` (open/closed, prepare/paye).
- **11 cas** (compléter l'existant) : mensuel ✓ · horaire ✓ · **journalier** (nouveau) · forfait ✓ · non rémunéré ✓ · sortie mi-mois ✓ · changement salaire ✓ · avance ✓ · absence ✓ · retard ✓ · HS ✓ (avec mise à jour fallback).

**Presence** (`presence-engine.test.ts`) : `intervalleMois(2025,9)` → `{debut:"2025-09-01", finExclusive:"2025-10-01"}` ; bordure inclus/exclus (30/09 ∈ [.., 01/10[, 01/10 ∉).

**Router** : scénarios TRPC `rhPayroll` (ordre/séquence N10, `markPaid` N03) — non automatisables hors DB dans la config actuelle → **documentés et vérifiés par scénario** (register PR), plus tests engine purs des règles.

## 11. Sortie de phase
- Registre : P05, P14, N03, N07, N08, N09, N10 → EN_IMPLEMENTATION → EN_TEST → TERMINE → VALIDE ; N20 pre-step (mapping commun) et P13 pré-conception documentés dans ce fichier ; header phase.
- Baseline retestée (T04/T08 : sortie mi-mois + avances).
- Autorévision + rapport + `graphify update .` + STOP.