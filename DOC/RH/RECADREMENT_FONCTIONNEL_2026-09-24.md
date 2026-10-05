# RECADRAGE FONCTIONNEL — MODULE RH (ATELIERONE / GPJ)

> **Date** : 2026-09-24 · **Statut** : PROPOSITION — en attente de validation humaine.
> **Cadre normatif** : `DOC/RH/RH_EXECUTION_REGISTER.md` §RECADRAGE POST-AUDIT (R1–R10). Ce plan en est l'application détaillée.
> **Règle absolue** : une seule phase à la fois (R1). Aucun code n'est modifié avant validation de ce plan.

---

## 1. Requalification des anciennes phases (Règle 5)

Statut officiel de toute ligne P01…P27 · N01…N20 · F* · INFRA-01 :
**STATIQUEMENT VALIDÉE, FONCTIONNELLEMENT NON PROUVÉE** — jusqu'à confirmation par l'audit fonctionnel réel (GATE B).

| Ancienne phase | Domaine | Lignes concernées | Écart fonctionnel constaté (audit 24/09) | Re-validation prévue |
|---|---|---|---|---|
| Phase 0 | Infra / registre / baseline | P0-01, P0-02 | OK en tant que process | — (baseline relue en REC-6) |
| Phase 1 | Avances | P01, P02, F16 | Lecture avances OK (test 18) ; flux complet NON prouvé | REC-3 |
| Phase 2 | Clôture & socle paie | P05, N06, N07, P07, P08, P14, N20, N08, N09, N10, N03 | Dénominateurs/heures hétérogènes (AUD-09) | REC-1 / REC-4 |
| Phase 3 | Sécurité / permissions / statuts | N01, N11, P16, P17, P19, P03, P09, P10, N18, N19 | Permissions non testables en super-admin (audit) | REC-4 (paie) / REC-5 |
| Phase 4 | Présences | P06, N06, N17, P15, F26 | **F26 inopérante** : analyse de période vide (AUD-03) | REC-1 |
| Phase 5 | Statut / effectif / navigation | P12, N12, F04, F05, N02, P04, P18 | Navigation basique OK ; effets statuts NON prouvés en tableau | REC-5 |
| Phase 6 | Historique / snapshots | P13, N13, F27 | **Traçabilité non prouvée** : bulletins non rejouables (AUD-05), historique vide (test 23) | REC-4 |
| Phase 7 | UX / libellés / lecture | P20, N14, F27(UI) | Énum bruts (AUD-08) ; écrans en erreur (AUD-02) | REC-5 |
| Phase 8 | Exports / impression | P11, N15, N16, F25 | PDF bulletin inatteignable (AUD-01) ; exports gatés non prouvés en usage réel | REC-4 / REC-5 |
| — | Infra BDD | INFRA-01 | Base re-synchronisée ; page Employés re-testable (recherche/filtres OK) | REC-1 (socle) |

---

## 2. Nouvel ordre d'exécution (strictement séquentiel — R1)

Ordre imposé par le **scénario central (R10)** : PRÉSENCES → CONGÉS → AVANCES → PAIE → COHÉRENCE → VALIDATION D'ENSEMBLE.

Chaque phase :
- **Contenu** : tickets AUD + re-validation des anciennes lignes listées (GATE B).
- **Gate A** : vitest ciblé + intégration + tsc + lint (0 erreur fichier touché).
- **Gate B** : checklist §3 avec navigation réelle enregistrée en preuve.
- **Sortie (R7)** : rapport de phase → `PHASE = VALIDE` ou `STOP`.
- **Ouverture de la phase suivante** : uniquement après sortie R7 validée par le chef de phase (humain).

### REC-1 — PRÉSENCES (domaine fermé : saisie → jour → mois → analyse)
- Tickets : **AUD-03** (analyse de période alignée : Analyse = Mensuel = Dashboard), **AUD-09** (dénominateurs/heures).
- Re-validation GATE B (tests 1–10) : pointage en direct, présent/absent, heures, retards, HS, résumé mensuel, clôture.
- Anciennes lignes à re-prouver : P05, P06, P07, P08, N06, N07, N17, F26.
- Pré-requis : INFRA-01 (socle BDD).
- Sortie : « 147 j présents / 15 absents » affichés SUR Analyse, Mensuel et Dashboard pour septembre.

### REC-2 — CONGÉS (demande → approbation → solde)
- Tickets : **AUD-07**.
- Re-validation GATE B (tests 11–16) : nouvelle demande, approbation réelle, soldes par type, débit des soldes, calendrier.
- Anciennes lignes à re-prouver : P15 (getBalances pur), N04 (trace de solde).
- Sortie : une demande approuvée (ex. maladie Jean Vinny) réduit bien le solde PRIS.

### REC-3 — AVANCES (demande → approbation → versement → récupération → solde → paie)
- Re-validation GATE B (tests 17–20) : flux complet avances + déduction en paie.
- Anciennes lignes à re-prouver : P01, P02, F16.
- Sortie : avance soldée visible dans la fiche ET déduite du bulletin suivant.

### REC-4 — PAIE (période → préparation → bulletin → consultation → net → PDF)
- Tickets : **AUD-01** (crash Bulletins), **AUD-04** (net ≥ 0 / plancher ou différé), **AUD-05** (bulletin rejouable : base datée + présences source), **AUD-06** (widget salaire).
- Re-validation GATE B (tests 21–32) : fiche, mode, historique, cohérence fiche↔bulletin, périodes, calcul, détail, widget, CNPS, export/PDF.
- Anciennes lignes à re-prouver : P13, F27(lecture), P14, N20, N03, N10, P09, P10.
- Pré-requis : REC-1 (présences justes), REC-3 (avances), INFRA-01.
- Sortie : bulletin = fiche × présence rejouable, net ≥ 0, PDF imprimable.

### REC-5 — ÉCRANS & COHÉRENCE UX (aucune page en erreur, montants cohérents, données de démo)
- Tickets : **AUD-02**, **AUD-08**, **AUD-09** (2e volet), **AUD-10**.
- Re-validation GATE B (tests 33–36) : dashboard cohérent, recherche/filtres, aucun écran en erreur, montants fiables.
- Anciennes lignes à re-prouver : P20, N14, P04, N02, P18, P12/N11 (effets statuts visibles).
- Sortie : les 5 écrans en erreur corrigés ; dénominateurs uniques ; libellés FR ; statuts normalisés.

### REC-6 — VALIDATION D'ENSEMBLE
- **Scénario central R10 complet** exécuté de bout en bout (EMPLOYÉ → … → RECONSTITUTION DU NET), cohérence partout.
- Baseline de non-régression (P0-02) + suite globale + audits des gates déjà passés.
- Rapport de sortie module (R7) → `MODULE RH = VALIDE` ou `STOP`.

---

## 3. Checklists de preuve (Règle 4)

**Chaque case doit être cochée avec sa preuve (capture/assert/console). Interdiction de passer à TERMINE/VALIDE tant qu'une case est NON.**

### 3.1 Checklist par phase (GATE B)

**REC-1 — Présences**
- [ ] pointage en direct : saisie du jour effective (test 1)
- [ ] analyse de période = résumé mensuel sur la même plage (AUD-03)
- [ ] absences/heures/retards/HS reflètent la réalité (tests 3–7)
- [ ] résumé mensuel correct (Symphonien 121h04/14 j/1 absence, etc.)
- [ ] jours non pointés comptés absents (jour muet)
- [ ] congés classés hors présent/absent
- [ ] clôture mensuelle : le 01 du mois suivant est exclu
- [ ] dénominateur jours ouvrés homogène dashboard ↔ paie (AUD-09)
- [ ] KPI taux ∈ [0,100 %]
- [ ] non-régression tests 1–10 rejoués sans régression

**REC-2 — Congés**
- [ ] nouvelle demande soumise (test 11)
- [ ] approbation réelle d'une demande (débit des soldes) (AUD-07)
- [ ] soldes par type corrects (ACQUIS/PRIS/RESTANT)
- [ ] type Maladie visible dans le solde (AUD-07)
- [ ] trace de solde (N04) présente en base
- [ ] getBalances = lecture pure (aucun INSERT) (P15)
- [ ] calendrier des congés inventorié

**REC-3 — Avances**
- [ ] avance créée, approuvée, versée (test 17)
- [ ] récupération partielle → solde recalculé
- [ ] récupération totale → solde à 0
- [ ] avance annulée/rejetée non comptée
- [ ] avance déduite dans le bulletin suivant (P02)
- [ ] non-régression flux P01/P02/F16

**REC-4 — Paie**
- [ ] onglet Bulletins s'ouvre (pas de crash) (AUD-01)
- [ ] liste des bulletins visible, pagination correcte
- [ ] clic sur bulletin → détail lisible
- [ ] base fiche = base bulletin pour la même période (AUD-05)
- [ ] net ≥ 0 ou retenue différée (AUD-04)
- [ ] net reconstituable manuellement depuis le bulletin (R10)
- [ ] HS présentes uniquement si autorisée (règle métier)
- [ ] historique des salaires alimenté (test 23)
- [ ] widget « Salaire sur période » affiche un montant (AUD-06)
- [ ] périodes/fermeture : bulletin Août ≠ Sept si données différentes
- [ ] CNPS (4,5/5,6 %) assiette vérifiable
- [ ] export CSV + PDF bulletin accessibles
- [ ] permissions paie (rh.salaire.consulter / rh.paie.modifier) testées

**REC-5 — Écrans & cohérence**
- [ ] sanctions, compétences, documents rendent leur contenu (AUD-02)
- [ ] aucune page RH n'affiche « Une erreur est survenue »
- [ ] libellés FR : « Horaire »/« Mensuel » (AUD-08)
- [ ] statuts employés normalisés (AUD-10)
- [ ] dashboard = analyse = mensuel (AUD-09)
- [ ] recherche/filtres employés fonctionnels (test 34)
- [ ] effets de statut (congé/suspendu/archive) visibles en tableaux (P12/N11)
- [ ] masses salariales cohérentes (test 36)

**REC-6 — Ensemble**
- [ ] scénario central R10 réussi de bout en bout, net cohérent partout
- [ ] baseline de non-régression verte
- [ ] rapport de sortie R7 produit
- [ ] gate humain passé

### 3.2 Checklist par ticket

**AUD-01 (P0)**
- [ ] écran ouvre · [ ] aucun crash · [ ] liste visible · [ ] détail visible · [ ] données correctes · [ ] pagination correcte · [ ] clic sur bulletin fonctionne · [ ] base fiche = base bulletin si même période · [ ] calcul reconstituable · [ ] PDF accessible · [ ] permission testée · [ ] scénario réel validé

**AUD-02**
- [ ] 3 pages rendent leur contenu · [ ] console sans erreur React · [ ] navigation entrante/sortante OK · [ ] recherche/filtres OK sur les 3 · [ ] données affichées conformes

**AUD-03**
- [ ] analyse de période = résumé mensuel (147 j) · [ ] heures/absences cohérentes · [ ] page par période (Sept, Août) · [ ] même résultat que Dashboard · [ ] filtre employé correct

**AUD-04**
- [ ] net ≥ 0 toujours · [ ] retenue au-delà du net différée/plafonnée + avertissement · [ ] bulletin emp. 21 corrigé · [ ] règle documentée

**AUD-05**
- [ ] base snapshot datée au calcul · [ ] bulletin reconstituable depuis présences + base · [ ] Août ≠ Sept si données diffèrent · [ ] historique salaire lié au bulletin

**AUD-06**
- [ ] montant affiché pour période avec présence · [ ] base de calcul = base en vigueur · [ ] cohérent avec bulletin

**AUD-07**
- [ ] congé approuvé débité du solde PRIS · [ ] type Maladie présent · [ ] ajustements traçés (N04) · [ ] solde cohérent entre onglets

**AUD-08**
- [ ] « Horaire » / « Mensuel » affichés · [ ] aucun énum brut restant dans le périmètre RH (rg)

**AUD-09**
- [ ] 21 j ouvrés partout (26 j revu) · [ ] heures théoriques identiques pour même nombre de jours · [ ] Août affiché correctement

**AUD-10**
- [ ] dates d'embauche renseignées · [ ] salaires de base présents · [ ] historique non vide · [ ] statuts normalisés actif/sorti/archive

---

## 4. Dépendances

| Phase | Dépend de | Bloque | Type |
|---|---|---|---|
| REC-1 | INFRA-01 (socle BDD) | REC-4 (données de présence du bulletin) | **B** |
| REC-2 | socle + N04 (traces déjà posées) | debit des soldes | I |
| REC-3 | socle | REC-4 (P02 déduit les avances) | **B** |
| REC-4 | REC-1, REC-3, INFRA-01 | REC-5, REC-6 | **B** |
| REC-5 | REC-1 (AUD-09 volet dashboard) | REC-6 | **B** (partiel) |
| REC-6 | REC-1…REC-5 | sortie module RH | **B** |

- **Blocages croisés** : corrige BUG avant données : présences justes (AUD-03) avant paie (AUD-04/05). Plancher net (AUD-04) indépendant mais doit être avant tout recalcul de bulletins (REC-4).
- **Ne pas détourner** : un problème découvert hors phase active ⇒ ticket (R8), traité dans sa phase.

---

## 5. Gardes transverses

1. **GATE A ≠ GATE B** (R3) : on ne valide jamais sur du code seul.
2. **R2 (13 cases)** : passer à NON TERMINÉE si une case est NON.
3. **R7** : rapport de sortie obligatoire, sinon pas d'ouverture de phase suivante.
4. **R9** : bouton visible / ligne en base / moteur / endpoint = jamais une preuve.
5. **Gate humain** : le chef de phase (utilisateur) valide chaque sortie de phase ; sinon **STOP**.
6. Toute modification de code commence uniquement après validation de ce plan (REC-1 première).

---

## Statut courant
- Phase active : **AUCUNE**.
- En attente : validation utilisateur du présent plan et du §RECADRAGE du registre.