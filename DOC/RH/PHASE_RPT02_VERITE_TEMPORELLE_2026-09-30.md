# RPT-02 — Vérité temporelle RH : de la DATE au rapport

> Statut : ** clos** — gates verts le 2026-09-30.
> Périmètre : chaîne `DATE → calendrier / planning → présence R3 → calcul → paie → rapport`.
> Hors périmètre assumé : refonte RPT-01, UI/PDF/XLSX, second moteur, réécriture d'historique.

---

## 1. Le problème

Une date de jour férié n'était pas une date. Elle voyageait en texte, se recomposait
par concaténation, et une fois stockée elle pouvait être :

- **inexistante** (`2026-15-08`, `2026-05-01`) ;
- **hors du mois attendu** ;
- acceptée par la colonne `varchar` puisinterpretée silencieusement par le
  calendrier qui la consommait.

Conséquence : les bornes de période, les jours ouvrés, les heures théoriques, les
absences et le rapport de présence dérivaient tous ensemble, sans qu'aucun
contrôle ne signale l'erreur. Le rapport pouvait afficher des jours ouvrés un
dimanche ou un jour férié.

---

## 2. La règle : un seul calendrier, une seule vérité

```
DATE réelle (AAAA-MM-JJ)
   │
   ├─→ colonne PostgreSQL DATE  ──→ aucune reinterpretation possible
   │
   ├─→ jours ouvrés   (jour ∉ dimanche, fériés, hors emploi, non ouvré du cycle)
   │      └─→ heures théoriques = 0 si le jour n'est pas ouvert
   │
   ├─→ présence R3    (pointages, tolérances, seuils, absences planifiées)
   │
   ├─→ calcul         (éventail : synthèse R3 + lignes + événements + réconciliation)
   │
   └─→ paie           (joursOuvres, semainesDansPeriode)
```

Une date doit **exister dans le calendrier**, pas seulement respecter le format.
`2026-02-31` est syntaxiquement correct et sémantiquement faux : il est refusé à
l'entrée (validation applicative) et ne peut plus être stocké (colonne `DATE`).

---

## 3. Définitions opposables

| Terme | Définition retenue |
|---|---|
| **Jour théorique** | Jour ouvert : ni dimanche, ni férié agence, ni hors période d'emploi, ni non ouvré du cycle. |
| **Heures théoriques** | Somme des heures des seuls jours ouverts. **0** pour tout jour non ouvert. |
| **Événement d'absence** | Trace (congé, maladie, mission, formation, absence ouverte). Ce n'est pas un jour d'absence. |
| **Jour d'absence** | Jour théorique **et** code présence `A`. Seul cas compté dans `joursAbsence`. |
| **Tolérance de pointage** | Retards/départs acceptés techniquement, configurable par agence. Distincte du seuil métier. |
| **Seuil métier de retard** | Retard retenu comme faute. **0 par défaut** : aucune règle métier n'a été prouvée, donc rien n'est retenu. |
| **Taux de présence** | `joursPresence / joursTheoriques × 100`. |
| **Taux de présence (heures)** | `heuresTravaillees / heuresTheoriques × 100`, `null` si le dénominateur est nul. |
| **Absence ouverte** | Absence sans fin : développée jour par jour, **dimanches inclus** pour rester traçable, **bornée à `to`**. Un dimanche porte donc une trace avec le motif `DIMANCHE` et n'est jamais compté. |
| **Pointage vs absence planifiée** | Un pointage **complet** l'emporte sur un congé/maladie/mission/formation planifié : codes `P`/`R`/`HS` selon la présence réelle, le type d'absence planifié restant tracé dans `details`. Un pointage incomplet conserve le code de congé. |

Ces définitions sont exposées dans `methodology` par l'API `rhCentreRapports.rapport` :
période, tolérance, seuil métier, jour ouvré, réconciliation des absences
(événements / comptabilisés / écart / motifs / doublons).

---

## 4. Ce qui a été corrigé

### 4.1 Données — jours fériés (`packages/db`)

- `hr_public_holidays.date` passe de `varchar(10)` à **`date`**.
- Contrainte `UNIQUE (agence_id, date)` posée (doublon impossible par le loader).
- Migration `migrate-rh-public-holidays.ts` : `DRY_RUN` → `APPLY` → `ROLLBACK` → `APPLY`,
  idempotente, avec table de sauvegarde.
  - Le rollback convertit d'abord la colonne en `varchar(10)` **avant** de restaurer
    les chaînes : sans cela, la restauration des anciennes valeurs invalides échouait.
- Seed régénéré sur des dates réelles explicites, avec validation.

### 4.2 Moteurs

- `payroll-engine` : `estIsoDateValide()` utilisé par `joursOuvres()` et
  `semainesDansPeriode()` — une date calendaire impossible ne peut plus décaler
  une période de paie.
- `presence-engine` : pointage complet prioritaire sur absence planifiée ; tolérance
  de pointage et seuil métier dissociés (0 par défaut).
- `rh-centre-rapports` : `heuresTheoriques = 0` pour tout jour non ouvert ; réconciliation
  enrichie (`comptabilise`, `motifNonComptabilisation`, `doublonsSupprimes` réellement
  comptés) ; **clé des situations par identifiant employé** (elle était lue par
  matricule alors que le chargeur indexe par `id` : le bloc R6 était silencieusement vide).
- `rh-presence.analysePeriode` : même règle que le rapport — un jour non ouvert
  (dimanche, férié, hors cycle) vaut **0 heure théorique**, pas l'heure d'ouverture
  du planning.

### 4.3 API

- `validerPeriode()` : format **et** réalité (`2026-02-31`, `2026-13-01` → `BAD_REQUEST`).
- `rhSettings.addHoliday` : validation de réalité + `CONFLICT` explicite sur doublon,
  et non une erreur PostgreSQL brute. Écriture réservée à `rh.parametrage.modifier`.

---

## 5. Preuves

### 5.1 Tests

| Niveau | Fichier | Résultat |
|---|---|---|
| Matrice unitaire | `src/server/lib/rpt02-verite-temporelle.test.ts` | 95 tests |
| Moteur présence | `src/server/lib/presence-engine.test.ts` | 30 tests |
| Rapports centre RH | `src/server/lib/rh-centre-rapports.test.ts` | 19 tests |
| Intégration DB → moteur → API (lecture seule) | `src/server/api/routers/rpt02-verite-temporelle.integration.test.ts` | 19 tests |
| Terrain `addHoliday` (écrit puis nettoie) | `src/server/api/routers/rpt02-addholiday.terrain.test.ts` | 3 tests |
| Smoke navigateur | `e2e-rpt02/verite-temporelle.spec.ts` (`playwright-rpt02.config.ts`) | 3 tests |

Total ciblé : **163 tests verts**. La suite `src/server/lib/` conserve 2 échecs
préexistants et hors périmètre (`licence-service`, `stock-engine`).

### 5.2 Non-régression sur données réelles

Capture avant/après sur `atelierone_erp`, septembre 2026 :

- lignes RPT-01, R3, R4, R6, heures, retards, absences, masse salariale : **identiques** ;
- réconciliation : 29 événements d'absence, 20 comptabilisés, 20 jours, **écart 0**,
  9 `HORS_PERIODE_EMPLOI`, 0 doublon ;
- l'événement `SITUATION_RH` apparaît (il manquait, clé par matricule) ;
- 496 pointages existants, aucune absence concomitant : la nouvelle priorité
  pointage/absence ne modifie aucune ligne.

---

## 6. Limites connues, non corrigées volontairement

| Limite | Pourquoi | Suite |
|---|---|---|
| Chiffres R3 historiques `134 j / 1114,6 h / 45,6 %` non reproductibles | La référence porte sur 16 employés ; la base courante en compte 19 et n'a pas la même composition. Snapshot historique non identifié. | Documenter la dérive ; ne pas réécrire l'historique. |
| `is_recurring_yearly` non projeté | Aucun besoin prouvé ; projeter une date récurrente sans règle validée inventerait des jours. | RPT-03. |
| 15 employés sans cycle de travail → samedi à 9,5 h par fallback | Règle non documentée, appliquée par défaut historique. | Documenter ; trancher en RPT-03. |
| Environnement d'intégration déterministe absent | `atelierone_test` inexistant, `atelierone_erp_test` sans fixtures RH. | Les tests d'intégration ciblent la base réelle en **lecture seule**. |

---

## 7. Comment reproduire

```powershell
# Tests ciblés (depuis apps/nextjs : les alias ~ ne sont resolus que la)
$env:VITEST_POOL = "forks"
.\node_modules\.bin\vitest.cmd run `
  src/server/lib/rpt02-verite-temporelle.test.ts `
  src/server/lib/presence-engine.test.ts `
  src/server/lib/rh-centre-rapports.test.ts `
  src/server/api/routers/rpt02-verite-temporelle.integration.test.ts `
  src/server/api/routers/rpt02-addholiday.terrain.test.ts

# Smoke navigateur (dev server requis sur http://localhost:3000)
.\node_modules\.bin\playwright.cmd test -c playwright-rpt02.config.ts
```

Les tests d'intégration exigent
`$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/atelierone_erp"`.
