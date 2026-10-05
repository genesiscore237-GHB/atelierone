# PHASE 1 — CONCEPTION (AVANCES SUR SALAIRE)

> Phase : 1 · Lignes : P01, P02, F16 · Statut conception : VALIDÉE (automatiquement, attend gate humain)
> Fichier produit à l'étape 2 du protocole de phase (CHECKLIST §C). L'étape 1 (audit) figure dans `rapport-audit-module-rh-2026-09-23.md` + constats Phase 1 ci-dessous.

## 1. Rappel des constats d'audit (Étape 1)

| Point | Fichier/ligne | Constat |
|---|---|---|
| **P01** | `rh-advances.ts` (router existant, 5 procédures dont 3 mutations) | Aucune UI. `create` insère directement `statut="VERSÉE"` (`:121`) — contourne le workflow DEMANDE→APPROBATION→VERSEMENT exigé. Pas de procédures `approuver`/`verser`. |
| **P02** | `rh-payroll.ts:214` | Filtre `statut === "VERSÉE"` : après la 1re récupération le statut devient `PARTIELLEMENT_RÉCUPÉRÉE` → **plus jamais déduit**. Le moteur calcule déjà `min(soldeRestant, montant−montantRecupere)` (`:294`). C'est le WHERE qui est faux. |
| **P02** | `rh-payroll.ts:215-216` | Fenêtre de récupération NULL (`periodeRecuperationDebut/Fin` non renseignées) → l'avance est **exclue** de toute déduction. La saisie doit rester possible sans ces dates (fenêtre optionnelle = toujours éligible). |
| **P02** | `rh-payroll.ts` (préparation) | `prepareMonth` ne **persiste jamais** la récupération (`advance_recoveries` + `montantRecupere`/`soldeRestant`/`statut` de `employee_advances`) → `soldeRestant` jamais tracé par la paie, et risque de **double déduction** à chaque re-run du même appel (upsert `:332-377`). |
| **Moteur** | `avances-engine.ts` (100 l) | Pur, testé (`avances-engine.test.ts` 118 l, 16 tests). `ADVANCE_STATUTS`, `ACTIFS` corrects. Manque uniquement les **validateurs de transition** (approbation/versement/refus). |

## 2. Workflow cible (demande → clôture)

```
DEMANDÉE ──approuver──▶ APPROUVÉE ──verser──▶ VERSÉE ──récupération(partielle)──▶ PARTIELLEMENT_RÉCUPÉRÉE ──▶ … ──▶ RÉCUPÉRÉE
    │                       │                  │
    └─refuser/annuler──────┘                  └─annuler (seulement si montantRecupere = 0)
```

- **Récupération** : saisie manuelle (`enregistrerRecuperation`, déjà présent) **et** automatique via `prepareMonth` (P02, idempotente).
- **Statuts** : `DEMANDÉE | APPROUVÉE | VERSÉE | PARTIELLEMENT_RÉCUPÉRÉE | RÉCUPÉRÉE | ANNULÉE` — inchangés (compatibles `ADVANCE_STATUTS`).
- `ACTIFS` reste utilisé pour le **doublon même période** (§18) ; pour la **paie**, on ne considère que `VERSÉE` et `PARTIELLEMENT_RÉCUPÉRÉE`.

## 3. Conception — API (`rhAdvancesRouter`, `rh-advances.ts`)

| Procédure | Entrée | Règles serveur | Sortie |
|---|---|---|---|
| `list` (existant, **étendu**) | `{ employeId?, search? }` | Agence scoped. Ajouter `dateDemande`, `dateApprobation`, `periodeRecuperationDebut/Fin`, `soldeRestant` (déjà présents) + `employeNom/Prenom/matricule` (présents) | liste avances + recovery liées |
| `create` (**modifié**) | idem existant + `moyenPaiement` requis | **statut `DEMANDÉE`** (au lieu de VERSÉE), `dateDemande = aujourd'hui`, `dateVersement = date prévue` (saisie), contrôles §18 inchangés, `responsableId` | avance créée |
| `approuver` (**nouveau**) | `{ advanceId, dateVersement? }` | Transition `DEMANDÉE→APPROUVÉE` validée par moteur ; `dateApprobation = aujourd'hui` ; `dateVersement` mis à jour si fournie | `{ id, statut }` |
| `verser` (**nouveau**) | `{ advanceId, dateVersement?, moyenPaiement? }` | Transition `APPROUVÉE→VERSÉE` ; `dateVersement` réel (aujourd'hui si vide) | `{ id, statut }` |
| `refuser` (**nouveau**) | `{ advanceId, motif? }` | Transition `DEMANDÉE|APPROUVÉE→ANNULÉE` ; conservation du motif | `{ id, statut }` |
| `annuler` (existant) | `{ advanceId }` | `VERSÉE→ANNULÉE` seulement si `montantRecupere=0` (validerAnnulation : déjà refus si >0 ou RÉCUPÉRÉE) | `{ success }` |
| `enregistrerRecuperation` (existant) | idem | Inchangé (moteur `validerRecuperation` + `apresRecuperation`) | `{ success, soldeRestant, statut }` |
| `listRecoveries` (existant) | `{ advanceId }` | Inchangé | lignes recovery |

Nouveaux validateurs moteur (purs, testables) dans `avances-engine.ts` :
```ts
validerApprobation(statut)  // DEMANDÉE sinon message
validerVersement(statut)    // APPROUVÉE sinon message
validerRefus(statut)        // DEMANDÉE|APPROUVÉE sinon message
```
Réutilisés par les mutations (`BAD_REQUEST` TRPCError). `moyenPaiement` : aligner l'enum existant du router (`especes|virement|cheque|mobile_money`) ; l'UI propose un libellé FR (Espèces, Virement, Chèque, Mobile Money).

## 4. Conception — Intégration paie (P02, `rh-payroll.ts prepareMonth`)

Remplacer le bloc avances `:193-218` et la boucle `:289-296` :

1. **Filtre éligibilité** (requête de base) :
   ```sql
   statut IN ('VERSÉE','PARTIELLEMENT_RÉCUPÉRÉE')
   AND (periodeRecuperationDebut IS NULL OR lte(periodeRecuperationDebut, finPériode))
   AND (periodeRecuperationFin  IS NULL OR gte(periodeRecuperationFin,  débutPériode))
   ```
   → fenêtre NULL = toujours éligible à la récupération (la saisie hebdomadaire rapide n'oblige pas à fixer une fenêtre).

2. **Consommation idempotente (anti double déduction)** :
   - Charger les récupérations déjà enregistrées **pour cette période** : join `advance_recoveries` sur `payrollEntries` filtré `periodId = période` (via `payrollEntryId`), groupées par `advanceId` (`SUM(montant)`).
   - Pour chaque employé : `dejaConsomme = sommePériode[advanceId] ?? 0` ; `montantBulletin = min(soldeRestant, montant − montantRecupere)` si `>&nbsp;0` et non entièrement consommé sur la période.
   - **Au premier passage** (aucune ligne liée au bulletin courant) : après l'upsert du bulletin, insérer une ligne `advance_recoveries` (`payrollEntryId = entryId`, `dateRecuperation = fin de période`) et mettre à jour `employee_advances` (`montantRecupere += X`, `soldeRestant −= X`, `statut = apresRecuperation`).
   - **Au re-run** (bulletin déjà préparé → ligne recovery liée existante) : on **réutilise** la valeur enregistrée (stable) ; on ne re-déduit pas ni ne touche `employee_advances`.
   - Échecs (`netPay < 0`) : pas d'écriture recovery (le bulletin est refusé avant l'upsert, `:323-329`).

3. **Non-régression** : `payroll-engine.ts` **inchangé** — il reçoit déjà `advancesToRecover` avec le montant « restant » ; les tests existants (`payroll-engine.test.ts`) restent verts.

## 5. Conception — UI (P01/F16, règle UX minimale)

`rh/_components/AdvancesSection.tsx` (nouveau composant client) monté **en onglet « Avances »** de la fiche employé (`EmployeeDetail.tsx`, après l'onglet Paie, gaté `canPaie`).

- **Liste employé (centre de gravité)** : tableau des avances de l'employé courant :
  colonnes **date versement**, **montant**, **récupéré**, **solde**, **statut** (+ motif, moyen de paiement) ; recherche libre par statut/motif dès que > 10 lignes ; badge de statut coloré ; sous-menu « Récupérations » par avance.
- **Saisie (modal)** :
  - montant (contrôle §18 montré si invalide), date versement prévue, moyen de paiement (select libellés FR), motif, **semaine concernée** et **fenêtre de récupération** (optionnelle).
  - Bouton **« Saisie hebdomadaire rapide »** : pré-remplit semaine concernée = Lundi→Dimanche courant (satisfait l'exigence de saisie hebdo sans écran dédié).
  - Bouton **Enregistrer / Valider** explicite → `rhAdvances.create` → `toast()` + `invalidate()` (`rhAdvances.list`).
- **Workflow dans la liste** : boutons gatés serveur+UI par permission (`rh.paie.modifier`) — **Approuver**, **Verser** (avec moyens/date), **Refuser**, **Annuler**, **Récupération** (montant + date) — chacun dans son modal de confirmation (jamais `confirm()` brut), `toast()` et invalidation, reflet immédiat dans la liste parente (règle UX ‣5).
- **États** : skeleton au chargement, empty state (« Aucune avance »), erreur serveur affichée dans la liste.

## 6. Conception — Tests (Étape 6)

**Engine (vitest)** — `avances-engine.test.ts` (en plus des 16 existants) :
- validateurs de transition : approuver/verser/refus valides + refus par mauvais statut (3-4 nouveaux).
- **3 vecteurs paie** (obligatoires, plan §gates) :
  - avance 100 000, récup 0 → paie déduit 100 000 (min = soldeRestant).
  - avance 100 000, récup 40 000 (solde 60 000) → paie déduit 60 000.
  - avance 100 000 récupérée → déduction 0 (non-règlement, statut RÉCUPÉRÉE hors filtre).
- **7 cas d'intégrité** (§18) : avance multiple dans la limite (cumul 2 × 60 000 = 120 000 ≤ 200 000) ; doublon même semaine → refus ; annulée jamais récupérée → OK ; partielle (`apresRecuperation` déjà testé) ; reportée sur période suivante (fenêtre hors période → 0) ; période différente → pas de doublon (existe déjà) ; sorti avec dette → refus (existe déjà).

**Router/paie** : `payroll-engine.test.ts` (fixtures avances) — vérifier qu'avec `advancesToRecover = [{advanceId, amount}]` la ligne `AVANCE_RECUP` = montant restant et `netPay = base − récup`. (Le moteur est déjà testé ; ajout de fixtures couvrant les 3 vecteurs.)

## 7. Sortie de phase (Étape 7)

- Registre : P01, P02, F16 → EN_TEST → TERMINE → VALIDE (cases DB: `employee_advances`/`advance_recoveries` existantes, pas de migration).
- Autorévision point par point (CHECKLIST §C) + rapport de phase ; `graphify update .` ; STOP avant Phase 2.
- Baseline retestée : `setupAgence`, paie mensuelle 200 000, fiche employé onglets existants, `rhAdvances.list` renommés/cassants → `grep` des 5 procédures de l'UI.