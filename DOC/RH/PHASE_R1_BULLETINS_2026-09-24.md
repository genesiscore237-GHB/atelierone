# PHASE R1 — Bulletins Paie : réparation onglet Bulletins

Date : 24/09/2026 · Périmètre : **domaine fermé** Bulletins Paie (`/dashboard/rh/paie`, onglet « Bulletins ») · Méthode : protocole R1 8 étapes + GATE R1
Références d'épreuve : `C:\Users\FAYACO~1\AppData\Local\Temp\opencode\audit\r1\` (`r1-repro.js`, `r1-test-ui.js`, `r1-filter-positive.js`, `r1-pdf-check.js` + sorties JSON/screenshots).

---

## ÉTAPE 1 — Reproduction (avant correction)

Script `r1-repro.js` sur l'app réelle (port 3000, session admin).

- `paie h1 = Paie` ✓ ; clic onglet « Bulletins » → écran **« Une erreur est survenue »** (crash composant).
- Erreur navigateur : `TypeError: Cannot read properties of undefined (reading 'map')` dans `BulletinsSection` (stack webpack `PaieRH.tsx:837:34` — sourcemaps d'un build antérieur non alignées ; le runtime est identique à l'audit).
- Seul `rhPayroll.listPeriods` a pu s'exécuter ; le rendu de la liste bulletins n'était jamais atteint.

Verdict ÉTAPE 1 : **crash reproduit de façon déterministe**.

## ÉTAPE 2 — Cause racine (sans children optional-chaining)

Variable **undefined** : `employees`, soit `data` de `api.rh.list.useQuery({ limit: 200, statut: "actif" })`, **au premier rendu** (requête non encore résolue).

- **Contrat de données** : `rh.list` renvoie **toujours un objet** `{ employees, total, page, ... }` (`apps/nextjs/src/server/api/routers/rh.ts:88`), jamais un tableau brut.
- Code fautif (avant correction, `PaieRH.tsx:296`) :
  `const emps = (employees?.employees ?? (employees as unknown)) as unknown as Array<...>`
  - `employees === undefined` (1er rendu) ⇒ `employees?.employees` = `undefined`
  - fallback `?? (employees as unknown)` ⇒ renvoie **`undefined`** (et non `[]`)
  - `emps.map(...)` (ligne ~309, rendu du `<select>` employé) ⇒ **TypeError « reading 'map' »**.
- Pourquoi la donnée est absente : **défaut de contrat de rendu** — l'ajout du filtre employé (modification en cours, non commitée) a monté le `<select>` sur `emps` sans garde `isLoading`, `isError`, ni fallback tableau `[]`. Aucune donnée corrompue en base ; pas de permission en cause.

Verdict ÉTAPE 2 : **cause racine identifiée et prouvée** (contrat API + absence d'états de chargement).

## ÉTAPE 3 — Correction

`apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/PaieRH.tsx` (en 4 points, frontend pur, aucune donnée touchée) :

1. `emps = (employees?.employees ?? [])` — correction du contrat (fallback tableau réel).
2. Query `rh.list` expose `isLoading`/`isError` ; `<select>` employé désactivé pendant le chargement avec option « Chargement des employés… », option « Employés indisponibles » en erreur.
3. Requête `listEntries` expose `isLoading`/`isError`/`refetch` ; `<tbody>` pilote 4 états : chargement → erreur (avec bouton « Réessayer ») → vide (« Aucun bulletin pour ce filtre. ») → liste.
4. Suppression de l'ancien état vide à base de `list.length` (remplacé par la logique d'états).

Historique/données/architecture **préservés** : aucune mutation, aucune modification serveur, aucun schéma touché.

Verdict ÉTAPE 3 : **corrigé à la racine, états UX conformes**.

## ÉTAPE 4 — Test complet dans le navigateur (post-correction)

Script `r1-test-ui.js` (26 bulletins en base) :

- `[bulletin error count] 0` — **crash disparu** ; `[charges count] 0` (pas d'état chargement bloquant résiduel).
- Sélecteur employé : 17 options (16 actifs + « Tous ») ; **filtre positif** : « Arnaud Nague Zemdjui » (id 21) → 2 bulletins (1/août + 1/sept), matricule GPJ-2026-9025 ; **filtre sans résultat** : « Jean Loic Zo'o Mbarga » → message d'état vide affiché.
- Sélecteur période : 3 options ; filtre « 2026-09-01 → 2026-09-29 » → **13 lignes** ; retour « Toutes » → 26 lignes.
- Détail : ouverture OK (heading « Bulletin détaillé »), net à payer affiché, lien PDF présent.
- Ligne zéro détail : `Arnaud Nague Zemdjui GPJ-2026-9025 0.00h - / 0 / -4 615,38 / -4 615,38 PREPARE` — **identique à la BDD** (id 52).

Verdict ÉTAPE 4 : **écran exploitable** (liste, filtres, états vides/chargement/erreur, détail).

## ÉTAPE 5 — Cohérence données (fiches employés · paie · présences)

Sources : `payroll_entries` / `payroll_entry_lines` / `payroll_periods` / `employes` / `employee_salary_history` / `attendance_monthly_summaries`.

### 5a. Fidélité d'affichage — **OK**
Tous les montants affichés (net, brut, retenues, heures) correspondent exactement aux colonnes `payroll_entries` (vérifié par croisement trpc ↔ SQL sur les 13 bulletins de septembre).

### 5b. Arithmétique bulletin — **OK** (reconstitution ÉTAPE 6)

### 5c. Base salariale bulletin vs fiche — **INCOHÉRENT (7/13 bulletins de septembre)**
| employé | fiche `salaire_base` | bulletin `base_salary` | verdict |
|---|---|---|---|
| 9  Symphonien Tsafack | 200 000 | 250 000 | ❌ |
| 10 Syriane Pandja      | 80 000  | 150 000 | ❌ |
| 11 Yvan Takoueta       | 200 000 | 300 000 | ❌ |
| 12 Faustin Chekep      | 150 000 | 180 000 | ❌ |
| 16 Franky Ebene Ngono  | 40 000  | 80 000  | ❌ |
| 17 Vital Eric Tineba   | 100 000 | 80 000  | ❌ |
| 21 Arnaud Nague Zemdjui| **1 000**| 120 000 | ❌ |
| 13/14/15/18/19/20      | conforme aux fiches | | ✅ |

`employee_salary_history` est **vide** ⇒ aucune revalorisation datée ne justifie un écart : la fiche (`employes.salaire_base`) est la seule source de vérité. Les bulletins ont donc été générés avec des bases non issues des fiches (ou les fiches ont été corrigées *après* génération sans historique — à trancher : deux directions d'écart existent, id 16/17 opposés).

### 5d. Jours présents/absents bulletin vs présences — **INCOHÉRENT**
- Sym 9, bulletin **août** (id 27, généré 31/08) : 1 jour présent / 9,5 h — or `attendance_monthly_summaries` août = **8 jours présents** / 4055 min.
- Yvan 11, bulletin août : 1 jour — résumé août = **8 jours** / 3680 min.
- Arnaud 21, bulletin **sept** (id 52, généré 03/09) : 0 présent / 1 absent — résumé sept aujourd'hui = **14 présents / 1 absent**.
- Fouakouet 19 / Ngouamera 20 : bulletins 0/0 alors que résumés août = 6 jours.

### 5e. Autres constats
- **Ngouamera (id 20) = statut `sorti`** mais possède un bulletin de septembre (id 51, période 4 ouverte) — et n'apparaît pas dans le filtre employé `statut:'actif'` (comportement cohérent avec la requête, mais la présence d'un bulletin « sorti » en période ouverte interroge la préparation de période).
- **Bulletin 52 à net négatif** (−4 615,38) : 0 h travaillées vs 1 absence retenue — cas connu « net < 0 » déjà signalé à l'audit (contrôle moteur `rh-payroll.ts:522`).

Verdict ÉTAPE 5 : **affichage fidèle mais DONNÉES bulletins non cohérentes avec fiches et présences** (snapshot figé à la génération, jamais recalculé à la clôture — période 3 clôturée le 18/09 avec des bulletins du 31/08).

## ÉTAPE 6 — Reconstitution du net (≥ 1 bulletin, fait pour 3)

Net = Σ gains − Σ retenues (`payroll_entry_lines`) :

- Bulletin 27 (Sym, août) : HN 10 541,50 − CNPS 474,37 = **10 067,13** = `net_pay` ✓
- Bulletin 29 (Yvan, août) : HN 12 649,80 + HS 998,67 − CNPS 614,18 = **13 034,29** = `net_pay` ✓
- Bulletin 52 (Arnaud, sept) : 0 − retenue absence 4 615,38 = **−4 615,38** = `net_pay` ✓

Verdict ÉTAPE 6 : **calcul du net conforme aux lignes en base (affichage inclus)**.

## ÉTAPE 7 — Bulletin PDF

Lien généré dans le détail : `/api/rh/bulletin-pdf/52`. Vérification réelle (session authentifiée) : statut **200**, `content-type: application/pdf`, **6 854 octets**, en-tête `%PDF` — fichier conservé `r1-bulletin-pdf-52.pdf`.

Verdict ÉTAPE 7 : **PDF généré et téléchargeable** ✓.

## ÉTAPE 8 — Tests

- `vitest src/server/lib/payroll-engine.test.ts` : **57/57 passés**.
- `eslint PaieRH.tsx` : **0 erreur** (1 warning préexistant `k` non utilisé, ligne 494 hors périmètre).
- `tsc` (apps/nextjs) : **aucune erreur sur PaieRH.tsx** ; le monorepo porte des erreurs préexistantes hors périmètre (return-service, sale-service, stock-engine, kpi-service, geo, ui/button) non traitées ici.

Verdict ÉTAPE 8 : **tests OK sur le périmètre**.

---

## BILAN & GATE R1

| Critère GATE | Résultat |
|---|---|
| Reproduction → cause racine | ✅ `emps` undefined au 1er rendu, contrat `rh.list` = objet, pas d'états |
| Correction robuste (données/historique/archi préservés) | ✅ frontend pur, no-op sur les données |
| Test UI complet | ✅ crash parti, 26 bulletins, filtres employé/période, détail, états |
| Cohérence données base ≥ 3 employés | ⚠️ **affichage fidèle + arithmétique OK, mais données bulletins incohérentes** (bases ∉ fiches 7/13 ; jours présents figés) |
| Reconstitution du net | ✅ 3 bulletins |
| PDF | ✅ réel, 6,8 Ko |
| Tests | ✅ 57/57 · lint 0 · tsc propre (fichier) |

**VERDICT GATE R1 : ⚠️ NON VALIDÉ EN L'ÉTAT — blocage sur la cohérence DONNÉES (critère GATE).** L'onglet Bulletins est **réparé et exploitable** (crash corrigé, états UX, filtres, détail, PDF). Mais la **donnée bulletins** n'est pas cohérente avec les fiches employés (7/13) ni avec les présences (snapshot non régénéré à la clôture). Décision d'arbitrage requise (voir échanges en attente).

Propositions de suite (à choisir par le propriétaire) :
1. **Valider R1 (UI)** et ouvrir un **ticket données/moteur** : régénération des bulletins à la clôture de période depuis les sources finales (fiches + présences) — recommandé.
2. **Étendre R1** au moteur de génération/close : corriger la source des bases + recompute à la clôture avant toute validation.
3. **Gel** : ne pas valider, figer l'état, réexaminer en phase REC.

Annexes : captures `r1-00…r1-05-*.png`, JSONs `r1-console.json`, `r1-test-ui.json`, `r1-filter-positive.json`, `r1-pdf-check.json`.