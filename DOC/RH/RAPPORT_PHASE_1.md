# RAPPORT DE PHASE 1 — Avances sur salaire (P01, P02, F16)

Date : 2026-09-23
Phase : 1 · strictement séquentielle · une seule phase active
Statut : TERMINE (tests verts, autorévision faite — **gate humain en attente**)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| UI | ✅ Onglet **Avances** dans `EmployeeDetail.tsx` (gaté `canPaie` = `rh.salaire.consulter`) + composant `AdvancesSection.tsx` : recherche texte, liste (dates, montants, statut badge, récupéré, solde, motif), saisie + « Saisie hebdomadaire rapide », modals ConfirmationDialog, loading/empty/error, toast |
| API | ✅ `rhAdvances.*` en service (monté `root.ts:94`) ; mutations gatées serveur `requirePermissionProcedure("rh.paie.modifier")` + scope agence (innerJoin `employes.agenceId`) ; consultation `list`/`listRecoveries` |
| DB | ✅ Aucune migration : `employee_advances` (dateDemande, dateApprobation, responsableId existants) + `advance_recoveries` inchangées |
| Workflow | ✅ DEMANDÉE→APPROUVÉE→VERSÉE (create n'insère plus directement VERSÉE) + refus→ANNULÉE ; chaque transition validée par règles pures (validerApprobation/Versement/Refus) + horodatage |
| Récupération | ✅ `enregistrerRecuperation` conservé, transactionnel (ligne + mise à jour avance atomiques) |
| Récup partielle | ✅ `apresRecuperation` : 40 000/100 000 → PARTIELLEMENT_RÉCUPÉRÉE, solde 60 000 |
| Solde | ✅ `soldeRestant` déduit à chaque récupération, tracé dans la liste |
| Report | ✅ Fenêtre de récupération NULL = illimitée (`estEligibleRecuperationPaie` borne par borne) ; solde reporté sur période suivante |
| Annulation | ✅ Refusée si récupérations existantes (`validerAnnulation`) ; bouton Annuler n'apparaît que si `montantRecupere` nul |
| Paie (P02) | ✅ Filtre corrigé : `inArray(VERSÉE, PARTIELLEMENT_RÉCUPÉRÉE)` + `soldeRestant > 0` + fenêtre NULL-safe ; montant = `min(soldeRestant, montant−récupéré)` ; **persistance idempotente** (verrou `advanceId+payrollEntryId`) → pas de double déduction au re-run |
| Sortie salarié | ✅ Avance refusée sur employé sorti (`validerSaisieAvance`) |
| Permissions | ✅ Serveur : `rh.paie.modifier` (mutations), agence scoping systématique ; UI : `canModifier` + `hasPermission` doubles, onglet masqué sans droit |
| Historique | ✅ Traçable : ligne `advance_recoveries` (montant, date, auteur `createdBy`, bulletin lié) + avance (montantRecupere, soldeRestant, statut, updatedAt) |
| Tests | ✅ `avances-engine.test.ts` 25/25 + `payroll-engine.test.ts` 34/34 (59/59 verts) — vecteurs 100 k ∫égral/récup 40 k→60 k/récup 100 k→0 + 7 cas intégrité + P02 éligibilité/fenêtre/montant |
| Non-régression | ✅ Typecheck `tsc --noEmit` sur les 5 fichiers touchés sans erreur (autres erreurs préexistantes hors périmètre : geo, stock, sales, returns.ts:141, rh.ts:120) |

## Lignes passées

**TERMINE** (en attente passage VALIDE par gate humain) :
- **P01** — UI avances complète + invalidation
- **P02** — Intégration paie (déduction solde réel, idempotente)
- **F16** — Avances de bout en bout (remplie via P01+P02)

## Preuves

- `vitest run src/server/lib/avances-engine.test.ts` → **25/25** verts
- `vitest run src/server/lib/payroll-engine.test.ts` → **34/34** verts
- `tsc --noEmit` : aucune erreur sur `rh-advances.ts`, `rh-payroll.ts`, `avances-engine.ts`, `AdvancesSection.tsx`, `EmployeeDetail.tsx`
- `TEST_JOURNAL.md` §2 : entrée n°1 (T17) renseignée

## Régressions

0 connue sur la baseline. Erreurs typecheck **préexistantes** (non introduites) dans `@atelierone/geo`, `returns.ts:141`, `rh.ts:120` — hors périmètre Phase 1, traitées en Phase 3 (RBAC/validation dure).

## Décisions produit actées

- Workflow avances : DEMANDÉE→APPROUVÉE→VERSÉE→(PARTIELLEMENT) RÉCUPÉRÉE→RÉCUPÉRÉE ; ANNULÉE possible (demande/approbation). `create` ne crée plus une VERSÉE directe.
- Fenêtre de récupération optionnelle → une borne NULL laisse ce côté illimité.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Demande

**Ouvrir la Phase 2 (Paie, périodes et calculs — P05, P14, N03, N07, N08, N09, N10, N20 pre-step, P13 pre-conception)** : **oui** (attente gate humain sur Phase 1).