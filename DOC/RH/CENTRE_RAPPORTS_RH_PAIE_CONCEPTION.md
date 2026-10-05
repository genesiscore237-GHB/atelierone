# CENTRE UNIQUE DE RAPPORTS RH & PAIE — MICRO-PHASE 1 : INSPECTION & CONCEPTION

Document de conception. **Aucune implémentation.** Aucun code, schéma, moteur, permission ou
donnée de production modifié à ce stade.

---

## 1. INSPECTION — ÉTAT DES LIEUX

### 1.1 Ce qui existe déjà et est directement réutilisable

| Brique | Emplacement | Réutilisable pour |
|---|---|---|
| Route `/dashboard/rh/rapports` | `app/(dashboard)/dashboard/rh/rapports/page.tsx` | Interface unique cible |
| 5 onglets + filtres + tri + pagination | `_components/RapportsPageClient.tsx:37-42,144-165` | Barre de contexte unique |
| Colonnes configurables + `sensitive: true` | `RapportsPageClient.tsx:64-81` | Masquage salaire non contournable |
| **`LigneSituation`** (ligne employé complète) | `server/lib/rh-situation-engine.ts` + `rh-situation.ts:732-815` | **Source unique Fiche_Paie** |
| `rhPeriode.situation` | `server/api/routers/rh-situation.ts:820` | Agrégation existante |
| `rhPeriode.export` | idem | Base de l'export |
| `buildSituationTable(presences\|paie\|avances)` | `RapportsPageClient.tsx:92-140` | Gabarits de colonnes |
| `rhReports.personnel` + `buildPersonnelRows` | `server/api/routers/rh-reports.ts`, `rh-reports-engine.ts:44` | Matricule, **fonction**, **poste** |
| Exports CSV / XLSX / PDF + CSS print | `_components/report-exports.ts`, `RapportsPageClient.tsx:374` | Formats cible |
| Historique de poste | table `employee_positions` (8 lignes, `start_date`/`end_date`) | `poste` segmenté |
| Historique de salaire | `segmenterSalaires` + `employee_salary_history` (17 lignes) | R7 déjà implémenté |

### 1.2 Découverte structurante

`analyserPresenceEmploye` (`rh-situation.ts`) parcourt **déjà chaque jour** de la période et
produit pour chaque jour :

```ts
{ date, code: codePresence | "MUET", isWorkingDay: jourOuvrePour(...),
  heuresTheoriques: heuresTheoriquesDuJour(sched, seuilDefaut),
  workedMinutes, normalMinutes, overtimeMinutes, lateMinutes, earlyDepartureMinutes }
```

Deux conséquences décisives :

1. **Les « heures d'absence » du classeur sont déjà calculables** = somme de `heuresTheoriques`
   des jours `MUET` (jour ouvré sans pointage). **Aucun moteur de temps supplémentaire n'est requis.**
2. **`heuresTheoriques` est dynamique** (planning réel par jour de semaine), donc conforme à
   l'interdiction de figer 26 jours / 227 h.

### 1.3 Écarts à combler (issus de l'audit)

| # | Écart | Emplacement | Nature |
|---|---|---|---|
| E1 | `calculateAbsenceImpact` renvoie 0 (toutes branches) | `presence-engine.ts:220-236` | Moteur |
| E2 | `hr_public_holidays.date` varchar invalide (`2026-15-08`) comparé à `YYYY-MM-DD` | schéma + 4 consommateurs | Schéma/donnée |
| E3 | `absence_motif`, `absence_justificatif`, `source`, `validated_by` non exposés | `rh-presence.ts:255-270` | API |
| E4 | `rhPresence.listEntries` plafonné à 200 lignes | `rh-presence.ts:242` | API |
| E5 | `rhPeriode.situation` accepte `employeId` **unique** seulement | `rh-situation.ts:825` | API |
| E6 | Situation n'expose ni `fonction` ni `poste` | `rh-situation.ts:791-814` | API |
| E7 | Situation : export **CSV seul** | `SituationPeriodPanel.tsx:194,261` | UI |
| E8 | Situation : pas de ligne TOTAUX exportée | idem | UI |
| E9 | Tolérance retard 0 min vs seuil 15 min du classeur | `hr_attendance_settings` | Paramétrage |
| E10 | Deux sources d'absence (`absences` 1 ligne vs `attendance_entries` 29) | — | Modèle |
| E11 | Aucune ligne TOTAUX / aucun visa RH nominatif | — | Workflow |

---

## 2. DÉCISION D'ARCHITECTURE

### 2.1 Principe retenu

**Une seule procédure d'agrégation, trois projections de présentation.**

```
FILTRES (période / employés / département / fonction / statut / contrat / type événement)
        ↓
rhCentreRapports.rapport          ← UNE requête, UNE matérialisation
        ↓
{ rows: EmployeeReportRow[], events: ReportEvent[], summary, methodology, permissions }
        ↓
   ┌────────────┬──────────────────┬─────────────────┐
 FICHE PAIE   DÉTAIL ABSENCES    SENSIBILISATION     (mêmes données)
   ↓            ↓                  ↓
  PDF/XLSX   PDF/Print/XLSX      PDF/Print/XLSX
```

**Interdit** : ne pas créer de moteur par vue. Les trois vues sont des fonctions de projection
pures sur le même objet. Aucun calcul n'est refait dans un composant React.

### 2.2 Extraction de la source unique

L'assemblage par employé est aujourd'hui **privé** dans `rh-situation.ts` (`construireLigne`,
lignes 732-815). Pour éviter une seconde implémentation, il est **extrait et mutualisé** :

- Nouveau module : `server/lib/rh-centre-rapports.ts`
  - `construireLigneRapport()` — corps déplacé depuis `rh-situation.ts`, **inchangé**
  - `chargerDonneesRapport()` — `DonneesSituation` + `chargerDonneesSituation()` factored out
  - `analyserPresenceEmploye()` — réutilisé tel quel
- `rhPeriode.situation` **appelle** ce module (donc une seule implémentation).

> `rh-situation.ts` conserve son contrat public (aucune régression sur `/rh/situation`
> ni sur l'onglet Présences/Paie/Avances).

### 2.3 Contrat de données `EmployeeReportRow`

Une ligne = un employé × une période. Extension de `LigneSituation`, sans la casser.

```ts
interface EmployeeReportRow extends LigneSituation {
  // ── identification (E6)
  fonction: string | null;              // employes.fonction
  poste: string | null;                 // employee_positions → positions.name (segmenté)
  posteSegments: Array<{ poste: string; from: string; to: string }>;
  typeContrat: string | null;
  dateEmbauche: string | null;
  dateSortie: string | null;

  // ── Fiche_Paie (ajouts)
  tauxHoraire: number | null;           // canonical, JAMAIS recalculé côté UI
  heuresAttendues: number;              // = heuresTheoriques (alias explicite)
  heuresNonFaites: number;              // absenceHours + lateHours

  // ── Sensibilisation (E1)
  joursAbsents: number;                 // = joursAbsence (alias)
  absenceHours: number;                 // Σ heuresTheoriques des jours MUET
  lateHours: number;                    // lateMinutes / 60
  totalNotWorkedHours: number;          // absenceHours + lateHours
  estimatedAbsenceImpact: number | null; // TAUX HORAIRE DE SENSIBILISATION
  estimatedLateImpact: number | null;
  totalEstimatedImpact: number | null;
  impactPercent: number | null;         // null ⇒ « N/A — salaire de référence absent »
  actualPayrollDeduction: number | null;// retenue RÉELLE (projeterPaie.retenues), distincte
  awarenessMessage: AwarenessMessage | null;

  // ── permissions (déjà résolues côté serveur)
  salariesVisible: boolean;
}
```

```ts
interface ReportEvent {            // UN événement = UNE ligne de Détail
  id: number;
  employeeId: number; matricule: string; nom: string; prenom: string;
  date: string;
  type: "ABSENCE" | "RETARD" | "CONGE" | "MALADIE" | "ACCIDENT" | "SITUATION_RH" | "AUTRE";
  codePresence: string;
  heureTheorique: string | null;    // planning du jour
  heureArrivee: string | null;      // time_in
  lateMinutes: number;
  toleranceApplied: number;         // late_tolerance_minutes effectif
  lateThresholdBusiness: number;    // seuil "retard métier" du rapport (configurable)
  isFullDay: boolean;               // journée entière ?
  dureeTheorique: number;          // heures (0 si journée partielle)
  motif: string | null;             // absence_motif
  justificatif: string | null;      // absence_justificatif
  statutJustificatif: "AUCUN" | "FOURNI" | "VALIDE" | "REFUSE";
  source: string | null;            // POINTAGE | SAISIE_MANUELLE | ...
  auteurSaisie: string | null;
  valideurRH: string | null;        // validated_by → null ⇒ « Non validé »
  dateValidation: string | null;
  presenceImpactHours: number;      // absenceHours
  payrollImpact: number | null;     // retenue réelle si existante
}
```

```ts
interface AwarenessMessage {        // moteur STRUCTURÉ (Partie D)
  code: string; niveau: "INFO" | "WARNING" | "CRITICAL";
  titre: string; message: string; raison: string;
  indicateurs: string[]; actionRecommandee: string;
  seuilApplique: number | null;
}
```

---

## 3. VUE 1 — FICHE PAIE

| # | Colonne classeur | Source canonique | Action |
|---|---|---|---|
| 1 | ID | `matricule` | alias |
| 2 | Nom complet | `nom` + `prenom` | alias |
| 3 | **Poste** | `employes.fonction` + `positions.name` (segmenté) | **E6 — à exposer** |
| 4 | Salaire de base | `salaires.baseContractuelle` | existant |
| 5 | **Taux horaire** | `salaires.tauxHoraire` | **exposer ; jamais recalculer en React** |
| 6 | Heures attendues | `heuresTheoriques` (planning réel) | existant, dynamique |
| 7 | Heures réelles | `heuresTravaillees` | existant |
| 8 | Heures normales | `heuresNormales` | existant |
| 9 | Heures supplémentaires | `heuresSupp` | existant |
| 10 | Jours absents | `joursAbsence` | existant |
| 11 | Retard (min) | `retardTotalMinutes` + **règle appliquée affichée** | enrichir |
| 12 | **Avances** | `avances{avancePeriode, recuperePeriode, soldeFinPeriode, soldeActuel, nbAvances}` | déjà décomposé 🟢 |
| 13 | Salaire selon les heures | `salaires.gains` + lignes HN | existant |
| 14 | **Net à payer** | `salaires.net` + `netLabel` (REEL/ESTIME) | existant 🟢 |
| 15 | **Alertes** | `anomalies[]{code, seuil, actions}` + `awarenessMessage` | enrichir |
| — | Ligne **TOTAUX** | agrégat serveur | **E8 — à produire** |
| — | Période / 225,3 h / jours ouvrés | en-tête `methodology` | dynamique |

Le taux horaire est repris **tel quel** de `projeterPaie` (base `standard_monthly_hours`, segments R7
appliqués par `segmenterSalaires`). Aucune division par 225,3 dans le composant.

---

## 4. VUE 2 — DÉTAIL ABSENCES / RETARDS

Source : `attendance_entries` (**canonique**) + `attendance_calculations`. Table `absences` sert
de **complement** (justificatif long, type Absence), **pas** d'une seconde source à additionner.

Règle de réconciliation (E10) à écrire explicitement dans le rapport :

```
1 jour d'absence  =  1 SEUL eventement metier  =  1 SEUL decompte  =  1 SEULE incidence rapport
```

- clé d'identité : `(employee_id, date)` ;
- si `attendance_entries` porte l'absence (cas septembre : 29) → **source canonique**, `absences` ne
  fournit qu'un complément ;
- si seuls `absences` portent l'absence → l'événement est synthétisé à partir de `date_debut..date_fin`
  avec `dureeJours` ;
- **jamais d'addition** ; test d'unicité sur `(employee_id, date)` obligatoire.

Type métier : calculé **côté serveur** via `codePresence` + `absence_type` (jamais déduit en React).
`Visa RH` : si `validated_by IS NULL` → afficher littéralement **« Non validé »**, ne jamais laisser
planer une validation inexistante.

---

## 5. VUE 3 — SENSIBILISATION

### 5.1 Calculs (couche moteur, pas le composant)

```
absenceHours          = Σ heuresTheoriques(jour)   pour les jours MUET ∩ jours ouvrés
lateHours             = retardTotalMinutes / 60
totalNotWorkedHours   = absenceHours + lateHours
estimatedAbsenceImpact= absenceHours          × tauxHoraireDuSegment
estimatedLateImpact   = lateHours             × tauxHoraireDuSegment
totalEstimatedImpact  = estimatedAbsenceImpact + estimatedLateImpact
impactPercent         = totalEstimatedImpact / salaireBasePériode × 100
                        → null si salaireBase ≤ 0  ⇒ « N/A — salaire de référence absent »
tauxPresence          = heuresTravaillees / heuresTheoriques
```

Contraintes :

- `tauxHoraireDuSegment` provient de `segmenterSalaires` (R7) : un changement de salaire en cours de période
  ventile le calcul par portion ;
- **jamais** de `NaN` / `Infinity` (salaire 0 ou null) ;
- `estimatedXxx` (sensibilisation) et `actualPayrollDeduction` (retenue réelle R4) sont deux
  champs **strictement distincts**, jamais confondus ;
- mention obligatoire à l'écran et dans les exports :
  *« Estimation indicative — ne constitue pas une retenue automatique. »*

### 5.2 Indicateurs collectifs

`Σ joursAbsence`, `Σ absenceHours`, `Σ lateMinutes`, `Σ lateHours`, `Σ estimatedAbsenceImpact`,
`Σ estimatedLateImpact`, `Σ totalEstimatedImpact`, `Σ heuresTheoriques`, `Σ heuresTravaillees`,
`Σ totalNotWorkedHours`, taux de présence équipe.

### 5.3 Moteur de messages structuré

Table de règles **configurables** (proposition : `payroll_items_config` étendu, ou table
`hr_sensibilisation_rules`), **jamais** de seuils en dur dans le code. Les seuils du classeur
(15 %, 50 %, 85 % de présence) sont proposés comme **valeurs initiales identifiées comme règles de
sensibilisation**, pas comme règles de paie :

| code | niveau | condition initiale | action |
|---|---|---|---|
| `PRESENCE_SATISFAISANTE_RETARDS_ELEVES` | WARNING | présence ≥ seuil ET retards ≥ seuil | message ponctualité |
| `ABSENCES_RETARDS_SIGNIFICATIFS` | WARNING | total non fait ≥ seuil | plan d'amélioration |
| `IMPACT_IMPORTANT` | WARNING | impact% ≥ seuil1 | entretien / analyse |
| `IMPACT_TRE_ELEVE` | CRITICAL | impact% ≥ seuil2 | entretien RH recommandé |
| `RETARDS_CHRONIQUES` | WARNING | nb events retard ≥ seuil | plan d'amélioration |
| `SALAIRE_REFERENCE_INCOHERENT` | CRITICAL | salaire ≤ 0 | corriger la donnée salariale |
| `ABSENCE_NON_JUSTIFIEE` | WARNING | `statutJustificatif = AUCUN` | régulariser |

---

## 6. MOTEURS À CORRIGER (et uniquement eux)

| # | Correction | Fichier | Justification |
|---|---|---|---|
| M1 | `calculateAbsenceImpact` : produire une valeur exploitable pour l'estimation, en distinguant explicitement `paidAbsence` (impact paie = 0 par design) et `estimatedImpact` (sensibilisation) | `presence-engine.ts:220-236` | E1 — le stub renvoie 0 partout |
| M2 | `hr_public_holidays.date` → type `date`, migration des 3 valeurs invalides | schéma + migration | E2 — 3 fériés sur 6 ne matchent jamais |
| M3 | Étendre `calculateLateDeduction` d'un mode `TAUX_HORAIRE_SENSIBILISATION` **non déductible** | `presence-engine.ts` | la perte estimée ne doit jamais entrer en retenue |
| M4 | Exposer `absence_type`, `absence_motif`, `absence_justificatif`, `source`, `validated_by`, `validated_at`, `created_by` | `rh-presence.ts` + schéma de sortie | E3 |
| M5 | `rhPeriode.situation` : `employeId` → `employeIds[]` | `rh-situation.ts:825` | E5 |
| M6 | `rhSituation.export` : sortie structurée JSON (non CSV only) + totaux + lignes | `rh-situation.ts` | E7, E8 |

**Interdit** : dupliquer une formule existante. `heuresTheoriques`, `tauxHoraire`, `segmenterSalaires`,
`projeterPaie`, `calculerAvancesRow`, `construireAnomalies` sont **appelés**, jamais rejoués.

---

## 7. RÉUTILISER / RECONSTRUIRE

| Fichier | Décision |
|---|---|
| `rapports/page.tsx` | **réutiliser** |
| `RapportsPageClient.tsx` | **réutiliser** (filtres, tri, colonnes, cartes) + 3 onglets cibles |
| `report-exports.ts` | **réutiliser** + multi-feuilles XLSX / multi-sections PDF |
| `csv-download.ts`, `ClientPagination.tsx` | **réutiliser** |
| `rh-reports-engine.ts` (`buildPersonnelRows`) | **réutiliser** (source `poste`/`fonction`) |
| `rh-situation.ts` → `rh-centre-rapports.ts` | **extraire** (factoriser, pas réécrire) |
| `presence-engine.ts` | **corriger** (M1-M3), ne pas créer de moteur |
| `payroll-engine.ts`, `avances-engine.ts`, `rh-situation-engine.ts` | **réutiliser tels quels** |
| Nouveau moteur par vue | **INTERDIT** |

---

## 8. SÉCURITÉ (Partie M)

- `rh.salaire.consulter` gouverne `salaireBase`, `tauxHoraire`, `gains`, `retenues`, `net`,
  `impactPercent`, `estimated*` et le tri sur ces colonnes — **côté serveur**, jamais côté colonne ;
- une colonne non autorisée est **absente du payload**, pas masquée par `null` côté client ;
- toute requête porte `eq(employes.agenceId, ctx.user.agenceId)` (isolation tenant, Cas 14) ;
- `justificatif` et documents sensibles → permission dédiée ;
- `methodology` du rapport ne doit jamais fuiter un taux horaire à un profil non habilité.

---

## 9. PERFORMANCE (Partie N)

- **1** chargement : la procédure renvoie `rows` + `events` + `summary` en une fois ;
- les trois vues sont des projections **côt client** sur le même objet en mémoire — 0 requête
  supplémentaire au changement d'onglet ;
- pagination serveur pour `events` (plafond actuel 200 levé, E4) ;
- l'export complet ignore la pagination et prend tout le périmètre demandé.

---

## 10. PLAN DE TESTS (Partie O)

| Cas | Attendu |
|---|---|
| 1 — 01/09→30/09, tous | 3 vues, même période, même effectif |
| 2 — 1 employé | 3 vues ne montrent que lui |
| 3 — 3 employés | tous totaux cohérents |
| 4 — absence | jours → `absenceHours` → impact → détail |
| 5 — retard | minutes → `lateHours` → impact → détail |
| 6 — absence + retard | `totalNotWorkedHours == absenceHours + lateHours` |
| 7 — avance | versé → récupéré → solde |
| 8 — changement de salaire | segments R7 |
| 9 — salaire 0 | aucun `NaN` / `Infinity` / erreur ; `N/A — salaire de référence absent` + anomalie |
| 10 — Excel | 3 feuilles + Méthodologie |
| 11 — PDF | 3 sections, paysage si large |
| 12 — impression | rendu sans sidebar/menus/boutons |
| 13 — sans permission salaire | salaire, taux, net, avance **absents** |
| 14 — cross-tenant | **REFUS** |

Moteur (`presence-engine.test.ts` étendu) : salaire > 0, salaire = 0, aucune absence, jour de semaine,
samedi, dimanche, férié, congé, situation RH, période multi-mois, changement de salaire.

---

## GATE 1 — ARCHITECTURE

- [x] source de données unique identifiée → `rhPeriode.situation` / `rh-centre-rapports.ts`
- [x] aucune duplication de calcul → 3 vues = projections du même `EmployeeReportRow`
- [x] modèle de rapport défini → `EmployeeReportRow` + `ReportEvent` + `AwarenessMessage`
- [x] aucune modification du métier R3/R4/R5/R6/R7 → correction ciblée M1-M3 uniquement
- [x] écart `absenceHours` demonstrated calculable depuis `jours[]` (pas de nouveau moteur)
- [x] réconciliation `absences` vs `attendance_entries` définie (clé `(employee_id, date)`, pas d'addition)
- [x] sécurité définie au niveau payload serveur

---

# STOP — MICRO-PHASE 1 TERMINÉE

Aucune implémentation lancée. Passage en MICRO-PHASE 2 (source de données / agrégation)
uniquement sur validation explicite de ce document.