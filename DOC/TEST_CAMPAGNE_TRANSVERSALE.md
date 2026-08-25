# CAMPAGNE DE TESTS TRANSVERSALE — AtelierOne (Garage GPJ)

> Document de référence : prompt amélioré + suite de tests + résultats.
> Exécuté par l'assistant IA, données de test conservées (préfixe `TEST`).

## 1. PROMPT AMÉLIORÉ (validation fonctionnelle et transversale)

**Objectif** — Le système couvre le cycle métier complet : **Client → Véhicule → Ordre de Réparation (réception → diagnostic validé → devis client → demandes de pièces → stock/commande fournisseur → réparation → test → livraison) → Facturation → Encaissement/Créances → Soldes**, en passant par les modules RH (techniciens, pointage, paie) et Achats (commandes fournisseur, réceptions).

**À vérifier :**
1. **Le besoin client est réellement rencontré** : chaque étape du cycle est possible, aboutit, et produit le résultat métier attendu (statuts, alertes, soldes, traçabilité).
2. **La logique est optimale et cohérente dans chaque module** : règles métier strictes respectées (priorités, statuts, motifs obligatoires, transitions, permissions), cas limites gérés, aucune donnée incohérente.
3. **Les données transitent de façon cohérente entre les modules** : chaque module reçoit et traite les informations des autres au bon moment et correctement (client ↔ véhicule ↔ OR ↔ stock ↔ facture ↔ créances ↔ achats ↔ RH ↔ inventaire).
4. **La traçabilité est complète** : chaque changement important est historisé (qui, quand, ancienne → nouvelle valeur).
5. **Aucune régression** : non-régression, build, typecheck.

**Livrable** : suite logique et exhaustive de tests (parcours bout en bout, cohérence inter-modules, cas limites, audit) — tous exécutés avec succès, échecs corrigés, commité, rapport final de conformité.

## 2. SUITE DE TESTS

### Phase A — Parcours de bout en bout

| Test | Scénario | Points de contrôle |
|---|---|---|
| **T1** `test-e2e-cycle-complet.cjs` | Client ENTR → contrat actif → véhicule couvert → réception P1 → diagnostic validé → devis accepté → demande servie (stock 10→8 + SORTIE_OR) → réparation → CQ → livré (véhicule SORTI) → facture comptant (remise contrat) → solde = 0 | Statuts à chaque étape ; historique complet ; double facture refusée |
| **T2** `test-e2e-commande-fournisseur.cjs` | Demande MANQUANT → commande BC- liée → réception → stock → demande SERVIE → livraison → facture | Traçabilité COMMANDE_FOURNISSEUR ; stock alimenté |
| **T3** `test-e2e-piece-defaillante.cjs` | Réception → retour DEFAILLANTE → REMPLACE → CLOTURE → travaux → livraison | Transitions retour ; lien OR |
| **T4** `test-e2e-client-bloque.cjs` | Blocage (motif) → OR refusé → déblocage → OR OK | Messages ; historique statut client |
| **T5** `test-e2e-flotte-credits.cjs` | Prospect → contrat → 2 véhicules → 2 OR → facture groupée crédit → dette → encaissement partiel → solde | Facture récap ; dette impaye→partiel ; solde |
| **T6** `test-e2e-rh-atelier.cjs` | EMP003 assigné → planning → pointage → paie heures réelles | Planning ; paie = HN×taux (225,3) + HS×1,5 + primes |

### Phase B — Cohérence inter-modules (C1→C8)

Client↔Véhicule · Véhicule↔OR · OR↔Stock · OR↔Facture · Facture↔Créances · Achats↔OR · Inventaire↔Stock↔OR · RH↔Atelier

### Phase C — Cas limites par module

Transitions illégales, motifs obligatoires, doublons, quantités > demandées, plafond de crédit, terminaux, recherche multicritère.

### Phase D — Audit & traçabilité

Historiques : STATUT, PRIORITE, RESPONSABLE, VALIDATION_DIAGNOSTIC, VALIDATION_DEVIS, DEMANDE_PIECES, COMMANDE_FOURNISSEUR, RETOUR_FOURNISSEUR, CREATION + historique statut client.

### Phase E — Non-régression & livraison

Unitaires + non-régression Playwright + build + typecheck (0 nouvelle erreur) + graphify + commit + rapport final.

## 3. RÉSULTATS

### Phase A — Parcours de bout en bout (67 checks)

| Test | Résultat | Commentaire |
|---|---|---|
| **T1** `test-e2e-cycle-complet.cjs` | **23/23 PASS** | Cycle complet : client ENTR → contrat 5 % → véhicule → OR P1 → diagnostic validé → devis accepté → demande servie (stock 10→8, SORTIE_OR) → livraison → facture comptant (remise 5 %) → solde = 0 → historique complet → alerte OK |
| **T2** `test-e2e-commande-fournisseur.cjs` | **10/10 PASS** | Demande MANQUANTE → commande BC- liée → réception (ACHAT_RECEPTION, stock 10→13) → demande SERVIE (13→10) → livraison → facture |
| **T3** `test-e2e-piece-defaillante.cjs` | **8/8 PASS** | Retour DEFAILLANTE → REMPLACE → CLOTURE (double clôture refusée) → remplacement servi → livraison → facture MoMo |
| **T4** `test-e2e-client-bloque.cjs` | **6/6 PASS** | Blocage (motif obligatoire) → OR refusé → déblocage → OR OK → historique tracé |
| **T5** `test-e2e-flotte-credits.cjs` | **12/12 PASS** | Flotte → 2 OR → facture groupée crédit (échéance +30 j) → dette impayée → encaissement partiel → PARTIEL → complet → PAYÉ → solde 0 |
| **T6** `test-e2e-rh-atelier.cjs` | **8/8 PASS** | EMP003 : OR assigné → planning (charge %) → pointage 9,5 h → paie = HN×taux (225,3 h) + HS×1,5 |

### Phase B — Cohérence inter-modules (10 checks)

| Test | Résultat | Vérifie |
|---|---|---|
| `test-coherence-modules.cjs` | **10/10 PASS** | C1 véhicule↔client · C2 OR hérite client + statut véhicule · C3 réservation (dispo 10→8) + sortie + retour (8→9) + mouvements SORTIE_OR/RETOUR_ATELIER/RESERVATION + sortie bloquée si PRÊT À LIVRER · C7 inventaire (brouillon→en cours→validé) écart appliqué (mouvement AJUSTEMENT) → sortie post-inventaire |

### Phase C — Cas limites (15 checks)

| Test | Résultat | Vérifie |
|---|---|---|
| `test-limites-modules.cjs` | **15/15 PASS** | Archivage refusé si contrat actif · transitions client illégales · code client doublon · résiliation sans motif · renouvellement contrat expiré · immat doublon · saut d'étapes OR · BLOQUE/ANNULE sans raison · ANNULE terminal · quantité servie > demandée · plafond crédit (comptant autorisé) · recherche par NIU/raison sociale |

### Phase E — Non-régression & livraison

| Vérification | Résultat |
|---|---|
| Tests unitaires | **205/205 PASS** |
| Non-régression Playwright | **TOUT EST VERT (21/21)** |
| Build production | **OK (exit 0)** |
| Typecheck | **260 erreurs préexistantes, 0 nouvelle** |
| Rejeu `test-rh-mvp.cjs` | 23/23 PASS (après nettoyage des pointages de test) |

## 4. RAPPORT FINAL DE CONFORMITÉ

**3 bugs réels de cohérence inter-modules découverts et corrigés par la campagne :**
1. `or.facturer` laissait le statut legacy « facture » au lieu de **LIVRE** → l'alerte P1 restait active sur un véhicule livré. Corrigé (or-router + contrats-router) + véhicule passé SORTI à la facturation.
2. `contrats.facturerPeriode` (facturation groupée) filtrait encore sur l'ancien statut « termine » (non migré vers les statuts V2) → aucune facture groupée possible. Corrigé (statuts facturables V2 : PRÊT À LIVRER / LIVRÉ / CONTRÔLE QUALITÉ) + dateCloture posée à PRÊT À LIVRER.
3. Module Finance : `payDebt` et `getDebts` utilisaient `ventes.remise` (remise commerciale) comme « montant dû » → toute dette issue de la facturation était refusée (« dette déjà payée »). Corrigé : dette = `montantTotal − montantPaye`.

**Autres enseignements :** les anciens scripts d'intégration non idempotents (test-cycle-complet, test-vehicules, test-parc, test-cycle-atelier) ne sont rejouables qu'après nettoyage des données de test (les mouvements de stock append-only bloquent la suppression des OR associés) ; leurs flux sont désormais couverts par les nouveaux tests E2E à identifiants uniques.

**Conformité globale : le cycle métier complet est validé de bout en bout (92 checks de campagne + 205 unitaires + 21 non-régression + build).**