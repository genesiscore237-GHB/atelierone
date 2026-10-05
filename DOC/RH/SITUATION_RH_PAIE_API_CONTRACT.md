# CONTRAT API — SITUATION RH & PAIE — ANALYSE DE PÉRIODE

Statut : **VERROUILLÉ** — aucune modification silencieuse après implémentation UI.
Date : 2026-09-28 · Module : `rhPeriode` (router tRPC) · Source fonctionnelle : `SITUATION_RH_PAIE_PERIODE_CONCEPTION_V2`

> Corrections contractuelles vs conception (issues relevées au preflight) :
> - `rh.paie.consulter` **n'existe pas** dans le socle (`security-socle.ts:77-97`) → le masque
>   salaire/bulletin/avance est piloté par **`rh.salaire.consulter`** (cohérent rf.ts:93-97, getKpis:73-76).
> - Pas de `createLineItems` : la projection pure est **`calculatePayroll`** (payroll-engine.ts:358).
> - Pas de `rhPayroll.listBulletins` : les bulletins réels se lisent via **`rhPayroll.listEntries`/`getEntry`** (+ snapshots).

---

## A. Fichier / montage

- Fichier : `apps/nextjs/src/server/api/routers/rh-situation.ts` → `export const rhPeriodeRouter = createTRPCRouter({ … })`.
- Montage : `apps/nextjs/src/server/api/root.ts` (~L100) → `rhPeriode: rhPeriodeRouter,`.
- Procédures : toutes **`.query`**, aucune `.mutation`. Accès : `rhProcedure` (rôles `rh | superadmin | directeur`),
  tenant scope `eq(employes.agenceId, ctx.user.agenceId)` systématique (jamais `employeeId` nu).
- **Aucune écriture** : aucune de ces procédures n'appelle les mutations FORBIDDEN (cf. preflight §3). Preuve exigée :
  capture DB avant/après (SIT-13, §41/§64).

## B. `rhPeriode.situation`

```
.situation(input: {
  from: string;            // "YYYY-MM-DD" (regex) — début période
  to: string;              // "YYYY-MM-DD" — fin période (to >= from)
  employeId?: number;      // filtre un employé
  departementId?: number;  // filtre département
  statut?: string;         // filtre statut employé (actif|sorti|conge|suspendu|…)
  modePaie?: string;       // filtre mode normalisé (SALAIRE_MENSUEL|…)
  search?: string;         // texte libre nom / prénom / matricule (recherche serveur ILIKE)
  sort?: SortSituation;    // whitelist ci-dessous (défaut "nom")
  dir?: "asc" | "desc";    // défaut "asc"
  page?: number;           // >=1, défaut 1
  pageSize?: number;       // 10..200, défaut 50
})
→ {
  rows:   LigneSituation[];
  total:  number;              // nb de lignes sur le jeu filtré (sans pagination)
  page:   number;
  pageSize: number;
  aggregates: AgregatsSituation;   // calculé sur TOUT le jeu filtré (== filtres du tableau)
  anomaliesSummary: { total: number; parType: Record<TypeAnomalie, number>; parGravite: Record<Gravite, number> };
  periodState: EtatPeriode;
}
```

### B1. SortSituation (whitelist serveur — jamais de tri client sur la page courante)

```
type SortSituation = "nom" | "matricule" | "joursAbsence" | "heures" | "retardTotalMinutes" | "net";
```
- Toutes les colonnes triables : `"nom"` (nom+prenom), `"matricule"`, `"joursAbsence"` (défaut agrégat), `"heures"`
  (heures travaillées), `"retardTotalMinutes"`, `"net"` (masqué sans `rh.salaire.consulter`).
- Le tri s'applique au **jeu complet** avant pagination (§16/§39). Tout autre `sort` → `BAD_REQUEST`.

### B2. LigneSituation (une ligne par employé)

```ts
type LigneSituation = {
  employeeId: number;
  matricule: string;
  prenom: string | null;
  nom: string;
  departement: string | null;
  statut: string | null;              // état courant employé
  mode: string | null;                // mode NORMALISÉ (normaliserModePaie) du/des segments

  // PRÉSENCE (source R3 — jamais recalculée ici)
  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  joursMuets: number;
  heuresTheoriques: number;
  heuresTravaillees: number;
  heuresNormales: number;
  heuresSupp: number;
  retardTotalMinutes: number;
  departAnticipeTotalMinutes: number;
  tauxPresence: number | null;

  // RÉMUNÉRATION — trois notions DISTINCTES (§10)
  salaires: SalairesRow | null;       // null si !canSeeSalary (masquage SERVEUR, pas de valeurs envoyées)
  // AVANCES — quatre indicateurs (§14)
  avances: AvancesRow | null;         // null si !canSeeSalary
  anomalies: Anomalie[];              // permission-aware (§20)
};
```

### B3. SalairesRow (trois notions distinctes + libellé RÉEL/ESTIMÉ)

```ts
type SalairesRow = {
  baseContractuelle: number | null;   // somme segmentée (fiche/historique), jamais fusionnée avec gains/net
  gains: number | null;               // rémunération acquise (projection OU bulletin)
  retenues: number | null;
  net: number | null;                 // net à payer
  netLabel: "REEL" | "ESTIME";        // jamais mélangé (§36)
  segments: SegmentSalaire[];         // détail par dates d'effet (§E0) — bannière UI si length > 1
  tauxHoraire: number | null;
  bulletinExiste: boolean;            // payroll_entries couvre [from,to]
};
```

```ts
type SegmentSalaire = {
  dateDebut: string;            // borne du segment (>= from)
  dateFin: string;              // borne (<= to)
  baseSalary: number | null;
  modePaie: string | null;
  forfaitHebdomadaire: number | null;
  source: "historique" | "fiche";   // employee_salary_history vs employes.salaireBase
  startDate: string;                // date d'effet de la valeur (employee_salary_history.start_date)
};
```

### B4. AvancesRow (quatre indicateurs — §3 de la V2)

```ts
type AvancesRow = {
  avancePeriode: number;        // Σ montant des avances versées dans [from,to]
  recuperePeriode: number;      // Σ advance_recoveries.dateRecuperation ∈ [from,to]
  soldeFinPeriode: number;      // Σ (montant − Σ récup <= to), borne ≥ 0 — RECONSTRUIT, jamais solde_restant
  soldeActuel: number;          // Σ solde_restant courant (affiché séparément)
  nbAvances: number;
};
```

### B5. AgregatsSituation (cartes — même jeu filtré que les lignes, §18)

```ts
type AgregatsSituation = {
  employes: number;
  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  heuresTravaillees: number;
  retardTotalMinutes: number;
  masseAcquise: number | null;          // Σ gains — null si !canSeeSalary
  avancePeriode: number | null;
  recuperePeriode: number | null;
  soldeFinPeriode: number | null;
  soldeActuel: number | null;
};
```

### B6. EtatPeriode (période MIXTE — jamais un état unique trompeur, §15)

```ts
type EtatPeriode = {
  global: "EN_COURS" | "PARTIELLEMENT_CLOTUREE" | "CLOTUREE" | "MIXTE";
  mois: Array<{ mois: string;        // "2026-08"
                label: string;       // "Août 2026"
                etat: "CLOTURE" | "EN_COURS";
                source: ("payroll_periods" | "attendance_monthly_summaries")[] }>;
};
```
- Règle : chaque mois civil couvert est classé CLOTURÉ (mois mensualisé clôturé OU résumé locked) sinon EN_COURS.
  `global` = MIXTE si au moins un CLOTURÉ + un EN_COURS ; PARTIELLEMENT_CLOTUREE si clôture partielle d'un mois (min–ordinaire conservée pour cohérence).

### B7. Anomalie (objet structuré — §21, §20)

```ts
type TypeAnomalie = "ANOMALIE_DONNEE" | "ALERTE_METIER" | "INFORMATION";
type Gravite = "CRITIQUE" | "ATTENTION" | "INFO";
type Anomalie = {
  code: string;              // ex. "ABSENCE_ELEVEE" | "SALAIRE_INHABITUEL" | "CONTRAT_MANQUANT" | "STATUT_MANQUANT"
                             //      | "MODE_REMUNERATION_MANQUANT" | "JOURNEE_INCOMPLETE" | "RETARDS_IMPORTANTS"
                             //      | "POINTAGE_INCOHERENT" | "SOLDE_AVANCE_IMPORTANT" | "AVANCE_SUPERIEURE_SALAIRE"
                             //      | "RECUPERATION_IMPOSSIBLE" | "NET_NEGATIF" | "SALAIRE_SANS_CONTRAT"
                             //      | "BULLETIN_DIFFERENT_PROJECTION"
  type: TypeAnomalie;
  gravite: Gravite;
  titre: string;
  description: string;      // JAMAIS un montant protégé si !canSeeSalary (sinon anomalie supprimée ou générique)
  employeeId: number;
  periode: { from: string; to: string };
  valeurObservee: string | number | null;   // null si masqué
  seuil: string | number | null;
  source: string;           // table/fonction d'origine (ex. "employee_salary_history")
  actionsDisponibles: Array<{ label: string; href: string }>;
};
```
- Moteur recalculé à chaque lecture, **jamais persisté**. Aucune anomalie qui « décide ».
- **Permission-aware** : si `!canSeeSalary`, les familles `SALAIRE_INHABITUEL`, `AVANCE_SUPERIEURE_SALAIRE`,
  `SOLDE_AVANCE_IMPORTANT`, `NET_NEGATIF`, `BULLETIN_DIFFERENT_PROJECTION`, `SALAIRE_SANS_CONTRAT`,
  `RECUPERATION_IMPOSSIBLE` sont **supprimées** (ou réduites à un message générique ne révélant aucune donnée protégée).

## C. `rhPeriode.employe` (volet investigation — §23/§24/§22)

```
.employe({ employeId: number; from: string; to: string })
→ DetailEmploye
```

```ts
type DetailEmploye = {
  employe: { employeeId; matricule; prenom; nom; statut; dateEmbauche; dateSortie|null;
             departement|null; contrat: { type|null; dateDebut|null; dateFin|null; statut|null } | null };
  segmentsSalaires: SegmentSalaire[];           // segmentation complète (bannière si changement)
  presence: PeriodeAnalyse;                     // résultat pur analyserPeriode (pré-calculé dans rows, ré-expédié sans requête)
  timeline: JourDetail[];                       // jour quotidien complet (§23 BLOC 3)
  avances: { row: AvancesRow; journal: AdvanceEvent[] };   // 4 indicateurs + journal (transitions + récupérations)
  paie: {
    baseContractuelle: number|null; gains: number|null; retenues: number|null; net: number|null;
    netLabel: "REEL"|"ESTIME"; description: ProjectionDetail|null; bulletin: BulletinRow|null;
    origine: OrigineValeur[];                  // §22 arbres par valeur (retenue absence → jours → base/26, etc.)
  };
  anomalies: Anomalie[];
};
```

```ts
type JourDetail = {
  date: string; jour: string;           // "Lun"…
  arrivee: string|null; pauseSortie: string|null; retour: string|null; depart: string|null;
  travailMinutes: number|null; retardMinutes: number|null; heuresSuppMinutes: number|null;
  etat: "PRESENT"|"ABSENT"|"CONGE"|"MUET"|"JOURNEE_EN_COURS"|"NON_COMPTABILISE";
  provisoire: boolean;                  // true dès qu'une donnée est en cours
};
```

```ts
type OrigineValeur = {
  valeur: string;              // libellé (ex. "Retenue absence")
  montant: number;
  source: string;              // ex. "Payroll R4"
  regle: string;               // ex. "absent_days"
  evenements: string[];        // ex. ["12/09"]
  salaireApplicable: number|null;
  baseCalcul: string;          // ex. "150000 / 26"
};
```

## D. `rhPeriode.export` (CSV Excel FR — §25, §55)

```
.export({ from, to, employeId?, departementId?, statut?, modePaie?, search?, sort?, dir? })
→ string   // CSV RFC-4180 via toCsv (séparateur ';', CRLF), BOM ajouté côté client (csv-download.ts)
```
- Mêmes filtres/période que l'écran (search/sort, **sans** pagination). Permission : `requirePermissionProcedure("rh.presence.consulter")`.
- Masquage serveur : sans `rh.salaire.consulter`, les colonnes salaire/gains/net/avance/récup rendent `""` (jamais la valeur).

## E. Gardes communes

| Groupe | Règle |
|---|---|
| dates | `to < from` → BAD_REQUEST ; plage > 13 mois (écart `to-from` > 13 mois civils) → BAD_REQUEST explicite |
| tenant | `eq(agenceId, ctx.user.agenceId)` sur `employes` / `payroll_periods` / config (jamais employeeId nu) |
| permission | `rhPeriode.*` = `rhProcedure` ; `export` = + `rh.presence.consulter` ; canSeeSalary = `RBACService.hasPermission("rh.salaire.consulter")` (mask serveur + anomalies) |
| réseau | zéro N+1 : 1 batch de présence + 1 batch avances + 1 batch historique/config par jeu filtré ; UI pas de 1 call/employé |
| écritures | aucune (liste FORBIDDEN preflight §3) |
| idempotence | réponse identique pour appels répétés (testé x10) |

## F. Impact sur l'existant (interdit)

- Aucune modification de `rh-presence.analysePeriode`, de `prepareMonth`, de `closeMonth`, de R5/R6, du socle de permissions.
- Aucune migration de schéma. Aucune nouvelle table d'anomalies/alertes.
- `rh_statut`/`PlanningRH.tsx:82` : non touché (documenté hors périmètre).

## G. Types partagés

Les types ci-dessus sont exportés par `src/server/lib/rh-situation-engine.ts` (définitions uniques) et
inférés côté client via `RouterOutputs`. Aucune duplication de structure dans le composant UI (ou cast local toléré, convention RH).