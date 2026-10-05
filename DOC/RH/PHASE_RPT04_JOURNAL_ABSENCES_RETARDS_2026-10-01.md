# RPT-04 - Journal des absences & retards

> Phase livrée le 2026-10-01. DB : `packages/db`. Moteur : `rh-journal-engine`.
> API : `rhJournal`. Aucun report written back dans la paie (§0).

## 1. Ce qui a été livré

| Élément | Fichier |
|---|---|
| Moteur pur | `apps/nextjs/src/server/lib/rh-journal-engine.ts` |
| Tests unitaires du moteur | `apps/nextjs/src/server/lib/rh-journal-engine.test.ts` |
| API tRPC | `apps/nextjs/src/server/api/routers/rh-journal.ts` |
| Intégration DB réelle | `apps/nextjs/src/server/api/routers/rpt04-journal.integration.test.ts` |
| Schéma Drizzle | `packages/db/src/schema/rh_absence_justifications.ts` |
| Migration idempotente | `packages/db/src/migrate-rh-absence-justifications.ts` |
| Permissions | `packages/db/src/security-socle.ts`, `apps/nextjs/src/lib/module-permissions.ts` |

Deux tables dédiées au **workflow de justificatif** uniquement :

- `rh_absence_justifications` — une ligne par `(agence, employé, date)` ;
- `rh_absence_justification_decisions` — historique immuable
  (`ON DELETE RESTRICT`), une ligne par décision.

Permissions ajoutées au socle : `rh.absence.justifier` et
`rh.absence.valider`.

## 2. Décisions structurantes

### 2.1 Une occurrence = une journée

Un jour d'absence **et** un retard le même jour ne produisent pas deux lignes :
la journée est **fusionnée** en une seule occurrence, avec la liste
`rapportEventIds` qui conserve chaque identifiant RPT-01 consommé. Sans ça, un
manager compterait deux événements pour une seule journée réellement travaillée
à moitié.

L'identifiant est **stable** : `journal:<employeeId>:<date>`, dérivé de la clé,
jamais d'une position de tri ni d'un index de page. Il est produit par
`eventIdStable()` et relu par `analyserEventIdStable()`, qui refuse tout
identifiant qui ne se re-compose pas exactement.

> **Bug corrigé en cours de phase.** Le parseur d'`eventId` du routeur
> prenait `indexOf(":")`, soit le deux-points du *préfixe* : `slice(8, 7)`
> renvoyait `""`, `employeeId` valait `0` et **tous** les appels à `detail()`
> échouaient en `BAD_REQUEST`. Détecté par le test d'intégration, reproduit sur
> la base réelle, corrigé en déplaçant le contrat dans le moteur (avec aller-retour
> et 10 cas malformés en test unitaire).

### 2.2 Le journal ne possède aucune donnée métier

Le journal ne fait **aucun** calcul d'heures, de retard ou de montant. Il
consomme la couche source unique de RPT-01 (`chargerDonneesRapport`) et lui
ajoute seulement :

- la fusion par journée ;
- le rapprochement avec les saisies et calculs déjà présents (CAS A/B/C/D) ;
- le workflow de justificatif ;
- le masquage.

Aucune règle de planning n'est dupliquée : `jourOuvrePour()` et
`heuresTheoriquesDuJour()` de `rh-centre-rapports` sont les seules sources de
vérité pour « ce jour était-il travaillé ».

### 2.3 L'écriture ne réécrit jamais la source

495 pointages portent `validated = true` sans `validated_by`, et l'absence
réelle porte `justifie = true` sans `valide_par`. Ce sont des **validations
fantômes** : RPT-04 les **signale** (`ANOMALIE_VALIDATION_SANS_AUTEUR`) et ne
les corrige pas.

Ni `attendance_entries.validated*`, ni `absences.valide_par`, ni
`attendance_entries.absence_justificatif` (trace d'import RPT-07) ne sont
jamais réécrits. Le test d'intégration le prouve par comptage avant/après sur
les tables sources.

### 2.4 Historique immuable et séparation des pouvoirs

`AUCUN → FOURNI → VALIDE | REFUSE`, plus `CORRECTION` quand un dépôt remplace
un justificatif existant. Chaque transition **ajoute** une ligne
`rh_absence_justification_decisions` ; aucune n'est écrasée. Le test
d'intégration capture l'historique après un refus, puis rejoue dépôt +
validation et vérifie que le préfixe est **strictement identique**.

Le déposant ne peut pas statuer sur son propre justificatif : la comparaison
`depose_par = acteur` est faite en base, avant toute écriture.

Les invariants sont aussi garantis **par la base**, pas seulement par le code :

```sql
CHECK (statut <> 'VALIDE' OR (decision_par IS NOT NULL AND decision_at IS NOT NULL))
CHECK (statut <> 'REFUSE' OR (refus_motif IS NOT NULL AND length(trim(refus_motif)) > 0))
```

### 2.5 RPT-03 : un bloc par employé, jamais un champ par ligne

`estimatedImpact` / `impactPercent` sont renvoyés dans
`referenceSensibilisation`, **par employé et par période**. Les journalières
n'ont aucun champ de sensibilisation. La référence utilise exactement la même
chaîne de calcul que `rhSensibilisation.indicateurs` (`chargerReferenceSensibilisation`),
donc elle est identique par construction et n'est jamais recalculée par RPT-04.

Vérifié sur septembre 2026 : RPT-03 = 847 989,48 ; RPT-04 = **847 989,48**.

### 2.6 Gardien de clôture — arbitrage explicite

La garde des mutations est `moisCloture()` : un résumé mensuel verrouillé
(`attendance_monthly_summaries.locked`) bloque dépôt, validation et refus.
Septembre 2026 est verrouillé (30/30) : les trois mutations y sont refusées,
la lecture reste possible.

`payroll_periods.status = 'closed'` **n'est pas** utilisé comme garde. Dans
cette base, juillet, août et septembre 2026 sont tous clos côté paie : l'appliquer
rendrait le module inutilisable jusqu'à l'ouverture d'une période future. Le
verrouillage des résumés de présence est le gardien du domaine RH ; celui des
périodes de paie appartient au module Paie.

## 3. API

`tRPC` `rhJournal`, five endpoints.

| Endpoint | Permission | Effet |
|---|---|---|
| `liste` | `rh.presence.consulter` | lignes fusionnées, filtrées, triées, paginées |
| `detail` | `rh.presence.consulter` | une ligne + historique immuable |
| `submitJustificatif` | `rh.absence.justifier` | dépôt (`FOURNI`) |
| `validateJustificatif` | `rh.absence.valider` | validation (`VALIDE`) |
| `rejectJustificatif` | `rh.absence.valider` | refus motivé (`REFUSE`) |

Filtres : `recherche`, `employeeIds`, `types`, `statutsJustificatif`, `valide`,
`sources`, `departementId`, `fonction`, `anomalies`. Tri : `date`, `employe`,
`retard`, `type`, `statut_justificatif`, en `asc`/`desc`. Pagination 1..200.

Le filtre `types` s'applique **après** la fusion : filtrer sur `RETARD` en
amont masquerait les journées d'absence porteuses d'un retard.

### Masquage

Sans `rh.absence.justifier`, `rh.absence.valider` ou `rh.document.consulter`
(ou pour `superadmin`), `justificatifUrl`, `justificatifReference`,
`justificatifType`, `justificatifLegacy`, `motif`, `refusMotif` et le motif des
historiques renvoient `null`, et `justificatifMasque` passe à `true`. Le
**statut** reste visible : un manager doit savoir qu'un justificatif est en
attente sans connaître son contenu.

## 4. Anomalies

| Code | Signification |
|---|---|
| `ANOMALIE_RECONCILIATION` | saisie et calcul se contredisent |
| `ANOMALIE_CONFLIT_EVENT` | plusieurs saisies pour le même (employé, date) |
| `ANOMALIE_VALIDATION_SANS_AUTEUR` | statut validé sans auteur — validation fantôme |
| `ANOMALIE_HORS_PERIODE_EMPLOI` | jour non travaillé : incidence de présence nulle |

RPT-01 ne conserve qu'une saisie par jour (`saisiesByEmploye` est une
`Map`), donc un conflit serait silencieusement perdu. `chargerConflits()`
reconstitue le conflit par requête groupée (`HAVING count(*) > 1`) et le
remonte en anomalie, avec des impacts mis à zéro.

## 5. Résultats réels

| Mesure | Août 2026 | Septembre 2026 |
|---|---|---|
| Lignes de journal | 63 | 260 |
| Employés concernés | 14 | 16 |
| Lignes `RETARD` | 62 | 230 |
| Lignes `ABSENCE` / `MALADIE` | 1 | 29 |
| Lignes `SITUATION_RH` | 0 | 1 |
| Retards cumulés | 4 742 min | 12 625 min |
| `ANOMALIE_VALIDATION_SANS_AUTEUR` | 63 | 259 |
| `ANOMALIE_HORS_PERIODE_EMPLOI` | 0 | 9 |
| Justificatifs existants | 0 | 0 |

Septembre : 100 % des lignes portent une validation fantôme. C'est le constat
principal de la phase — la donnée d'import est incohérente et RPT-04 la rend
visible au lieu de la lisser.

Le contraste avec RPT-03 est le point à retenir :

| | RPT-04 (`payrollImpact`) | RPT-03 (`estimatedImpact`) |
|---|---|---|
| Août 2026 | **0** | 2 250 265,36 |
| Septembre 2026 | **0** | 847 989,48 |

`payrollImpact` est le montant **réellement** présent dans
`attendance_calculations` : il vaut 0, donc il est affiché 0. Il n'est jamais
estimé. L'estimation reste dans RPT-03, qui ne touche pas la paie.

## 6. Vérifications

| Périmètre | Résultat |
|---|---|
| Moteur RPT-04 (unitaires) | **48 / 48** |
| API RPT-04 (intégration DB réelle) | **21 / 21** |
| Non-régression ciblée (6 fichiers) | **247 / 247** |
| Suite `src/server/lib` + intégrations RPT-04 | **733 verts**, 2 échecs préexistants |
| `next lint` sur les 4 fichiers RPT-04 | **0 warning, 0 erreur** |
| `tsc --noEmit` | 320 erreurs, **0** sur `rh-journal` / `rpt04` |
| Tables sources après écriture | inchangées (comptage avant/après) |

Les 2 échecs restants sont antérieurs et hors périmètre — identiques à ceux
déjà documentés par RPT-03 : `licence-service.test.ts > etendrePeriode` et
`stock-engine.test.ts > all movement types are accounted for`.

Les 320 erreurs de typecheck sont **antérieures et hors périmètre**. Elles
n'ont pas été corrigées dans cette phase.

Le test d'intégration s'exécute sur la base réelle avec `DATABASE_URL` chargé
depuis `apps/nextjs/.env.local` (le `vitest.config.ts` ne charge pas les `.env`
lui-même) :

```powershell
$env:DATABASE_URL = ((Get-Content ".env.local" | Select-String "^DATABASE_URL=") -split "=", 2)[1].Trim('"')
npx vitest run src/server/api/routers/rpt04-journal.integration.test.ts
```

Il écrit uniquement dans les trois tables RPT-04 et supprime ses lignes en
`afterAll`. L'habilitation est simulée (aucun rôle réel ne peut à la fois
déposer et décider dans ce scénario) ; tenant, clôture, contraintes FK et
moteur sont réels.

## 7. Limites connues

- `payrollImpact` est un nombre : une absence sans montant calculé vaut `0`.
  L'absence de donnée et la valeur nulle ne sont pas distinguées — c'est le
  contrat RPT-01 qui l'impose, RPT-04 ne l'invente pas.
- Le montant d'un retard affiché suit `late_deduction_amount` ; la règle
  d'arrondi de la paie (`arrondiMinutesRetard`) n'est pas dupliquée ici.
- `SITUATION_RH` est exposée comme type de ligne, mais ses incidences ne sont
  pas recalculées : elles viennent des événements RPT-01.
- Les conflits sont détectés par requête groupée à la volée, pas par une vue
  matérialisée : le coût croît avec le volume de `attendance_entries`.

## 8. Repli

```powershell
# Dry-run (lecture seule)
$env:DRY_RUN="1"; npx tsx packages/db/src/migrate-rh-absence-justifications.ts

# Annuler
$env:ROLLBACK="1"; npx tsx packages/db/src/migrate-rh-absence-justifications.ts
```

Le rollback supprime `rh_absence_justification_decisions` puis
`rh_absence_justifications`. Il ne touche à aucune autre table. Retirer aussi
l'entrée `rhJournal` de `apps/nextjs/src/server/api/root.ts` désactive l'API
sans perte de données.

## 9. Fichiers

| Rôle | Chemin |
|---|---|
| Moteur | `apps/nextjs/src/server/lib/rh-journal-engine.ts` |
| Tests moteur | `apps/nextjs/src/server/lib/rh-journal-engine.test.ts` |
| API | `apps/nextjs/src/server/api/routers/rh-journal.ts` |
| Intégration | `apps/nextjs/src/server/api/routers/rpt04-journal.integration.test.ts` |
| Enregistrement | `apps/nextjs/src/server/api/root.ts` |
| Schéma | `packages/db/src/schema/rh_absence_justifications.ts` |
| Migration | `packages/db/src/migrate-rh-absence-justifications.ts` |
| Permissions | `packages/db/src/security-socle.ts` |
| Miroir client | `apps/nextjs/src/lib/module-permissions.ts` |
