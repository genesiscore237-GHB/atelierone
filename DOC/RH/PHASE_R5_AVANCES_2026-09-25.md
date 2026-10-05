# PHASE R5 — AVANCES & RÉMUNÉRATIONS — ouverte le 2026-09-25

## 1. Ce qui était à corriger

Périmètre : compléter le cycle complet des avances sur salaire — de la saisie
jusqu'au report sur la paie — en partant du socle existant (P01/P02 : saisie,
approbation, versement, récupération partielle/totale) :

- **E1** — Journal d'état (`advance_transitions`) : chaque transition tracée
  (acteur, date, ancien→nouveau, justification).
- **E2** — Synthèse + recherche exposées dans la fiche employé.
- **E3** — Référence unique de l'avance (`ADV-<yyyymm>-<id>`).
- **E7** — Annulation **motivée** (justification obligatoire pour REFUSER/ANNULER).
- Garanties : idempotence (double-clic/replay), périodes clôturées protégées,
  permissions UI **et** API, plafond salaire, doublon de période, feedback toast
  (jamais alert), avance ≠ créance finance (ne pas toucher la finance).

## 2. Ce qui a été corrigé

### Backend
- `packages/db/src/schema/rh_employes.ts` : colonne `reference` sur
  `employee_advances` + table `advance_transitions`
  (`from_status` nullable, `to_status` NOT NULL, `acteur_id` FK utilisateurs,
  `justification`, `created_at`) ; export `advanceTransitions` dans
  `packages/db/src/schema/index.ts`. Migration additive poussée (`npm run push`).
- `apps/nextjs/src/server/lib/avances-engine.ts` : ajout de fonctions **pures**
  `genererReferenceAvance(now, id)` et `syntheseAvances(rows)`.
- `apps/nextjs/src/server/api/routers/rh-advances.ts` :
  - `create` transactionnel → insert + référence + journal `DEMANDÉE` ;
    garde-clôture période ;
  - `approuver` / `verser` / `refuser` / `annuler` transactionnels avec journal
    (from/to/acteur/justification) ; `annuler` accepte `motif` obligatoire ;
  - `enregistrerRecuperation` transactionnel + journal, garde période clôturée ;
  - `listTransitions` (journal) exposé ;
  - `list` retourne `{ rows, synthese }`.

### UI
- `apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/AdvancesSection.tsx` :
  - Colonne « Réf. » + référence affichée ;
  - recherche locale par statut / motif / référence ;
  - cartes synthèse (Total accordé / total récupéré / reste à récupérer /
    soldées·actives·annulées) ;
  - bouton « Historique des récupérations » visible pour tous les utilisateurs
    (sorti du bloc `peutModifier` — lecture) ;
  - `AnnulationModal` (justification requise, modes REFUSER/ANNULER) ;
  - `DetailHistoryModal` (récupérations + journal des transitions) ;
  - `RecuperationModal` → bouton désactivé + `isPending` (idempotence UI) ;
  - feedback sonner/toast partout, aucun `alert()`.

## 3. Ce qui a été testé

### TEST_TECHNIQUE (vitest, cwd `apps/nextjs`)
- `src/server/lib/avances-engine.test.ts` : **28/28 PASS** (3 nouveaux cas R5-E2/E3 :
  `genererReferenceAvance` mois/id + `syntheseAvances` agrégats + tolérance null/chaînes).
- Suite complète : **392 passés / 2 échecs préexistants hors périmètre**
  (`licence-service.test.ts`, `stock-engine.test.ts`) — identique à la baseline R4.
- `tsc --noEmit` : **0 erreur** sur fichiers R5 (`rh-advances.ts`,
  `AdvancesSection.tsx`, `avances-engine.ts(.test)`, `e2e-r5/*`). Les erreurs
  restantes sont les préexistantes connues (stock, alert-service, compta,
  sale/return/geo/ui).
- `eslint` : **0 erreur / 0 warning** sur les fichiers R5.
- `vitest.config.ts` exclut `e2e-r5/**`.

## 4. Ce qui a été testé réellement dans l'interface (Playwright, navigateur Chrome réel)

Config : `apps/nextjs/playwright-r5.config.ts` (workers=1, `reuseExistingServer`),
global setup R4 (ré-ouvre période 4). **4 tests — 4 PASS :**

| Test | Parcours réel | Résultat |
|---|---|---|
| **R5-FUNC-01** | Login admin → fiche employé 501 → synthèse → création 150 000 (réf `ADV-...`) → recherche par référence → filtre « aucun résultat » → approuver → verser → récupération partielle 60k (bouton désactivé pendant mutation) → pré-remplissage 90k → récupération totale → historique + journal → vérifs DB psql (réf, 2 récupérations, solde 0, journal 5 états) | **PASS** |
| **R5-FUNC-02** | Plafond : 250 000 > salaire 200 000 → refus inline modal ; doublon période → refus inline ; sur l'avance 20k : approuver → verser → annulation AVEC motif (E7) → justification persistée en DB → persistance après refresh (statut « Annulée » conservé) | **PASS** |
| **R5-REPRO-B** | Avance 100k → récupération partielle 40k → solde 60k → préparation paie P4 → bulletin employé 501 = **128 585 F** (report correct, 16 bulletins calculés) | **PASS** |
| **R5-REPRO-A (corrigé)** | Le bouton « Historique des récupérations » est désormais exposé (E1) | **PASS** |

Tous les scénarios Reset l'état R5 en début (helper `r5-reset.ts`) → **idempotents**,
ré-exécutables dans n'importe quel ordre.

## 5. Résultats

- Journal de transition complet vérifié en base :
  `DEMANDÉE | APPROUVÉE | VERSÉE | PARTIELLEMENT_RÉCUPÉRÉE | RÉCUPÉRÉE`
  (id avance = ADV-202609-8, 2 récupérations, solde restant = 0).
- Justification d'annulation persistée : `Annulation : Erreur de saisie, avance non versée`.
- Refus serveur cohérents : `Avance (250000 F) supérieure au salaire mensuel (200000 F).`
  et `Avance doublée : une avance active existe déjà sur la même période.`
  (logs webServer = comportement attendu des garde-fous, pas des erreurs).

## 6. Preuves — `audit/r5/` (32 fichiers)

- `r5-inspection.txt`, `r5-reproduction.txt`, `r5-conception.md`, `r5-repro-inject.sql`
- `r5-func-01-login.png` … `r5-func-15-persistance.png` (15 captures pipeline UI)
- `r5-func-10-db-journal.txt` (réf + nbRecups + solde + journal 5 états)
- `r5-func-14-annulation-db.txt` (justification persistée)
- `r5-repro-01-avant-avance-vide.png` … `r5-repro-10-bulletin-501.png` (10 captures)
- `r5-repro-A-corrige-history-btn.png`, `r5-repro-A-empty-recovery-history.png`
- `r5-verifier-non-regression.txt` (nets période 4 après tests)
- `test-results/` (rapports détaillés Playwright des 4 tests, traces)

## 7. Anomalies restantes

Hors périmètre R5 (documentées, non implémentées) :
- CSP bloque le chargement Google Fonts (`style-src 'self' 'unsafe-inline'`) —
  non bloquant fonctionnel.
- Échecs vitest préexistants `licence-service` / `stock-engine` (hors RH).
- Erreurs tsc préexistantes hors RH (stock, alert-service, compta, sale/return/geo/ui).

## 8. Régressions

- **R4 (paie)** : période 4 après tests R5 = **15 bulletins, net identiques à la
  baseline R4** (Arnaud emp21 = **509,42 F**, 96374,32 / 35073,46 / 82549,07 /
  70848,73 / 3221,48 / 18921,97 / 36901,24 / 16822,92 / 0 / 21611,06 / 40586,54 /
  38210,17 / 34819,14 / 0) ; **0 bulletin négatif**.
- **R3 (présences/temps)** : données intactes (aucune requête R5 ne touche
  planning/résumés/KPI).
- **Nettoyage** : employé test 501, avances, récupérations, transitions, bulletin
  supprimés par ID → **0 trace R5 en base** (compteurs 0/0/0).
- Suite vitest complète relancée : 392/394 (2 préexistants hors périmètre).

## 9. Fonctions dépendantes impactées

- `rh-payroll.prepareMonth` : consomme les avances nouvellement
  récupérée/annulable via `synthese` — vérifié sur bulletin 501 (P4 net 128 585).
- Finance : **non touchée** (avance ≠ créance).
- Global R5-gate : tout programme hors RH resté intact.

---

**STATUT : R5 (AVANCES & RÉMUNÉRATIONS) = VALIDE**
**(TEST_TECHNIQUE 392 verts + 28 engine ; TEST_FONCTIONNEL UI Playwright 4/4
navigateur réel ; garde-fous plafond/doublon/annulation motivée prouvés ;
non-régression R4 net identiques (Arnaud 509,42) & R3 intactes ; nettoyage sans
trace ; GATE 32 cas — voir `audit/r5/gate-r5-32cases.txt`.)**