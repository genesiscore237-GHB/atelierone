# GRAPHE DE DÉPENDANCES, ORDRE D'EXÉCUTION ET RISQUES DE RÉGRESSION — MODULE RH

> PHASE 0 (2026-09-23). Compagnon visuel de `RH_EXECUTION_REGISTER.md` (matrice des dépendances) et `PHASE_0_PLAN.md`. Aucun code métier modifié.

## 1. GRAPHE DES DÉPENDANCES (∅ = indépendante · → = « doit être livré avant »)

```
PHASE 1
  ∅ P01 ──► P02 ──► F16                (P01 bloquante, P02 fin de phase)

PHASE 2
  ∅ P14 ──► N20 ──────────────────────────────────────────► (Phase 5)
  ∅ N10 ──► N03
  ∅ N07 ──► P07 (Phase 4)
  ∅ N08, N09 (parallèles, décision produit commune)

PHASE 3
  ∅ N01 ──► N11 (Phase 5)
  ∅ P03, P09, P10, P11, P18, N02, N19 (parallèles)
  ∅ P16(durcir) ; N18 (note découplage)

PHASE 4
  ∅ P05 ──► P06 ──► N06
  ∅ P08, P15, N04, N17 (parallèles)
  entre : N07 (depuis P2) débloque P07 déjà exécutable

PHASE 5
  N11 (depuis P3) ──► P12 ──► N12 ──► F04
                      └──► P19
  N20 (depuis P2)

PHASE 6
  P13 (schéma snapshot, migration) ──► N13
  (consomme P02, P05… pour rejouer l'historique)

PHASE 7
  P14 (depuis P2) ──► P04
  ∅ P17, P20, N14 (parallèles)

PHASE 8
  P11 (depuis P3) ──► N15
  ∅ N16 ──► F25

PHASE 9
  N05 (après P16) + P16(purge) ; N05 conserve rhAdvances (réactivé P1)
```

## 2. ORDRE D'EXÉCUTION (topologique, par phase — affectations révisées 2026-09-23)

1. **P1 (Avances)** : P01 → P02 → F16 (P02 doit précéder la fin de phase : sinon avances saisies non déduites). Vecteurs : 100 000/40 000/100 000 + intégrité (7 cas).
2. **P2 (Paie)** : **P05 (borne clôture, déplacée ici)** et N10, N07, N14, N08, N09 et P14 (têtes) → N03 ; snapshot bulletin (pré-conception P13).
3. **P3 (Sécurité)** : **N01 en tête** (socle agence) → P03, P09, P10, P11, P18, N02, N19, P16(durcir), **P17 (déplacé ici)**, N18. Test croisé A→B = REFUS.
4. **P4 (Présences)** : P06 → N06 ; P07 (post-N07), P08, P15, N04, N17, analyse de période en parallèle. (P05 déjà traitée en P2 — re-test.)
5. **P5 (Statuts)** : N11 (règle métier) → P12 → N12/F04, P19 ; **P04 (`?employeId=`, déplacé ici)** en parallèle ; N20 post-P14.
6. **P6 (Historique)** : P13 (schéma + migration) → N13 (+ 5 domaines séparés).
7. **P7 (UX)** : rationalisation seulement ; P20, N14. Aucun écran fusionné/supprimé sans justification.
8. **P8 (Rapports)** : N15 (post-P11/P07) ; N16/F25 ; mécanisme commun + 8 rapports.
9. **P9 (Nettoyage)** : N05 + P16(purge), après réactivation `rhAdvances` en P1.

**Autorévision obligatoire** : avant chaque passage de phase suivante, l'agent relit son registre et coche chaque point des lignes (CHECKLIST §C) — puis gate humain.

## 3. CLASSIFICATION (extrait de la matrice du registre)

- **Indépendantes** (parallélisables dans leur phase) : N01*, N02, N03, N05, N08, N09, N14, N15, N16, N17, N18, N19, P03, P08, P09, P10, P11, P15, P17, P18, P20. (*N01 tient le rôle de socle → à lancer d'abord dans la phase, mais sans dépendance entrante.)
- **Bloquantes** : P01 (→P02), P02, P05 (→P06), N07 (→P07), P14 (→P04/N20), N10 (→N03), N01 (→N11), N11 (→P12), P12 (→N12/F05), P13 (→snapshots), P11 (→N15).
- **Nécessitant migration DB** : P13, N13 (tables snapshot) ; N03 (à confirmer : colonne/meta trace paiement). Toute autre ligne : code seul.

## 4. LISTE DES RISQUES DE RÉGRESSION (à contrôler à chaque gate)

| Risque | Ligne(s) concernées | Ligne(s) qui peuvent le provoquer | Mitigation |
|---|---|---|---|
| R-av | Avance déduite deux fois / jamais déduite | P02, N03, P14 | T17 (multi-mois) ; verrou unique de déduction |
| R-paie | Variation montants bulletin sans décision (forfait semaine, stdHours) | N08, N09 | Décision produit signée avant; snapshots avant/après |
| R-clot | Molis suivant faussé par clôture | P05, P06, N06, N17 | T05/T18 : re-test clôture + congés |
| R-img | `daysPresent` gonflé par congés | N06, P08 | T03 re-passé ; comparaison résumés |
| R-tenant | Croisement d'agence (fuite salaire/matrice) | P03, N01, N02, N18 | T14/T15 sur les 15 procédures |
| R-perm | Perte d'accès légitime (rôles opérationnels) | N02, P11 | T14 (lecture hors RH) + T16 |
| R-fiche | Fiche employé cassée (masquage salaire) | P09, P12, N12 | T07 → re-test fiche 8 onglets |
| R-statut | Statut/suivi historique incohérent (sorti/actif) | P12, N11, N12, P19 | T13 + T02 non régressés |
| R-hist | Historique perdu par DELETE+INSERT | P13, N13 | migration rejouable + comparaison avant/après |
| R-nav | Liens `?employeId=` envoi vers page cassée | P04 | T04 préalable (mapping modes) stable |
| R-build | Tests moteur cassés par changements signes | P14, N20, N07, P07 | T04/T08 re-passés |
| R-db | Migration destructive sur tables historiques | P13, N13, N03 | A–G étape migration : non destructive + rollback |

**Fonctionnalités conformes à re-tester (baseline, plan §5)** : les 15 items recensés + refs T01–T16 du `TEST_JOURNAL.md` — exécutables en un bloc à chaque gate.

## 5. CONSOMMATION CROISÉE (hors module RH à ne pas casser)
Recherche globale (`recherche.ts`) → `rh` (T14/T18) · POS/Outillage/PlanningAtelier/Travaux → `rh.list` (T14, N02) · `governance.invite` → `employes.userId` (N18) · `ModuleShell` + `auth()` (T14). Toute modification doit re-tester ces appels (G7 checklist).