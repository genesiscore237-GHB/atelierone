# PHASE 0 — PLAN DÉTAILLÉ ET CARTOGRAPHIE DES DÉPENDANCES (MODULE RH)

> **Portée PHASE 0 : aucune ligne de code.** Livraison = registre + cartographie + plan. Ensuite **STOP** et validation humaine.
> Périmètre : rapport `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md` (P01–P20) + nouvelles anomalies N01–N20. Registre : `DOC/RH/RH_EXECUTION_REGISTER.md`.

---

## 1. OBJECTIF DU PLAN

Tout corrigé doit **au moins** être acceptable sur 12 axes : Méthode A–G · Données (migration sûre) · Backend · API (tRPC, **source de vérité unique**) · Logique métier · Interface (cohérence, sans refaire les écrans) · Validation · Permissions & multi-tenant sincères · Historique conservé · Recherche · Calculs (aucune dérive salariale) · Tests automatisés + scénarios métier + non-régression + effets secondaires.

**Règle d'or** : une ligne n'est VALIDE que si toutes ses cases du registre sont ✅, y compris la preuve.

## 2. ORDRE DES PHASES (définitif, non réordonnable sans justification technique documentée)

| Phase | Thème | Raison de l'ordre | Lignes concernées |
|---|---|---|---|
| 0 | Sécurisation de l'exécution (registre + plans + non-régression) | prérequis de pilotage | P0-01, P0-02 |
| 1 | Avances de salaire (bout en bout) | argent + fonction la plus mortelle (UI absente, intégration paie cassée) | P01, P02, F16 |
| 2 | Paie, périodes et calculs (résultat reconstructible) | une fois les avances réelles, la paie doit les intégrer + bornes/modes/snapshot | P05, P14, N03, N07, N08, N09, N10 |
| 3 | Sécurité / multi-tenant / permissions / validation | protéger avant d'étendre ; fuite salaire inter-agences = P0 | P03, P09, P10, P11, P16(durcir), P17, P18, N01, N02, N18, N19 |
| 4 | Présences / absences / temps + analyse de période | masque du calcul (jours muets, KPI, congés) | P06, P07, P08, P15, N04, N06, N17 |
| 5 | Statuts, dossier employé, réembauche, navigation `?employeId=` | comportement métier après fiabilité des calculs | P12, P04, P19, N11, N12, N20, F04, F05 |
| 6 | Historique métier / traçabilité | aucun effacement silencieux (bulletins, planning, évals, soldes, corrections) | P13, N13 |
| 7 | Navigation et cohérence UX (fiche = centre de gravité) | connexion des écrans existants, sans nouveaux écrans inutiles | P20, N14 + rationalisation ciblée |
| 8 | Rapports / exports / impression | valorisation une fois les données fiables | N15, N16, F25 |
| 9 | Nettoyage et confort | purge des procédures mortes, restes | N05, P16(purge) |

**Affectations révisées (décision utilisateur 2026-09-23)** : P05 → Phase 2 (borne de clôture = prérequis paie) · P17 et P19 → Phase 3/5 selon dépendances · P04 → Phase 5 (navigation employé) · F04/F05 → Phase 5 · F16 → Phase 1 · F25 → Phase 8.

### 2b. WORKFLOW CIBLE DES AVANCES (Phase 1)
`DEMANDE → APPROBATION → VERSEMENT → RÉCUPÉRATION → RÉCUPÉRATION PARTIELLE → SOLDE → RÉCUPÉRATION COMPLÈTE → CLÔTURE` — chaque état traçable (statut, date, auteur, montant, solde).

### 2c. TESTS DE RÉFÉRENCE PAR PHASE (hors baseline)
- **Phase 1** : 100 000 → récup 0 → déduction 100 000 · 100 000 → récup 40 000 → solde 60 000 → prochaine paie 60 000 · 100 000 → récup 100 000 → paie 0. Intégrité : avances multiples · 2 avances même semaine · annulée · partielle · reportée · période suivante · sorti avec dette.
- **Phase 2** : borne 30/09 inclus & 01/10 exclu · 6 modes de rémunération (mensuel, horaire, journalier, forfait, non rémunéré, commission) · sortie en cours de mois · changement salaire · avance · absence · retard · HS.
- **Phase 3** : Agence A → accès employé Agence B = REFUS (salaire, présence, bulletin, documents, discipline, compétences) · export sans permission = REFUS.
- **Phase 4** : dossier manuel EMP001 01/09→30/09 : jours présents, absences, heures réelles, retards, HS, congés vs calcul attendu.
- **Phase 5** : même salarié ACTIF → SUSPENDU → ACTIF → SORTI → RÉEMBAUCHE, historique vérifié après chaque transition ; tous les liens `?employeId=` testés.
- **Phase 6** : reconstitution AVANT → MODIFICATION → APRÈS pour bulletins, planning, évals, soldes, corrections présence (date, heure, auteur, motif, ancienne/nouvelle valeur).
- **Phase 7** : parcours Personnel → fiche → présence / avance / paie / congé / évaluation.
- **Phase 8** : rapport présence septembre (employé, date, arrivée, pause, retour, départ, temps réel, retard, HS, situation) sur 1 / plusieurs / tous.

## 3. CARTOGRAPHIE DES DÉPENDANCES INTER-DOMAINES

```
                      ┌─────────────────────────────┐
        PHASE 1 ─► AVANCES ──────────────────┐
                      └───────────────┬───────┘      │
                                      ▼             ▼
        PHASE 4 ─► PRÉSENCES/CONGÉS ► CLÔTURE MONTH ◄── PARAMÉTRAGE (cycles/feriés/HS)
                                  │        │
                                  ▼        ▼
        PHASE 2 ─► PAIE (prepareMonth) ◄── AVANCES (solde prélevé)   [dépend : clôture présence + avances]
                    │       ▲
                    │       └── modes rémunération (P14/N20) + paramétrage
                    ▼
              markPaid / closePeriod  → HISTORIQUE SNAPSHOT (Phase 6, dépendances)

        PHASE 3 ─► PERMISSIONS & AGENCE : transversal — avant tout écran public
                  appui : rhProcedure / requirePermissionProcedure / exports / PDF / getFiche

        PHASE 5 ─► STATUTS / PARCOURS : s'appuie sur clôture + paie + permissions (statut→effets)

        PHASE 6 ─► HISTORIQUE : consomme paie (bulletins), planning, évaluations, solde congés

        PHASE 7 ─► NAVIGATION : relie fiche ↔ 9 pages (dépend des pages existantes, pas du calcul)

        PHASE 8 ─► RAPPORTS/EXPORTS/IMPRESSION : consomme agrégats (Phase 4) + permissions (Phase 3)

        PHASE 9 ─► NETTOYAGE : purge endpoints morts (après réactivation rhAdvances en Phase 1)
```

**Dépendances critiques à respecter :**
1. **Paie (2) dépend de** : Avances (1) — sinon mauvaise déduction ; Clôture présence (4) — `prepareMonth` refuse un mois non clôturé (conformité G5 conservée) ; Paramétrage cycles/fériés (E05, existant) — les N07/N09 corrigent le dénominateur côté paie ET agrégats simultanément pour éviter dérives de montants.
2. **Avances (1) dépend de** : `avances-engine` (déjà testé) — pas de changement moteur attendu, uniquement branchement UI + correction du couplage paie (P02). **P02 doit être livré AVANT la fin de Phase 1** (sinon la nouvelle UI crée des avances non déduites).
3. **Export/impression (8)** consomme les agrégats fiabilisés (4) et les gardes de permission (3).
4. **Historique (6)** consomme les écritures paie (2) ; la table de snapshot doit être conçue en accord avec `payroll_entries/lines` pour éviter une seconde source de vérité.
5. **Statuts (5)** : les effets de `conge`/`suspendu` doivent être alignés avec le moteur de paie (2) et le dashboard (5) — rédiger d'abord la règle métier (décision documentée) puis implémenter.

## 4. GRAINE DE DÉPENDANCES PAR LIGNE (matrice rapide)
- P01 dépend de : avances-engine (✅ existant), P02 (livré en même phase).
- P02 dépend de : P01 (source des avances), clôture présence (comportement existant conservé).
- P14/N20 dépendent de : payroll-engine (tests fixtures 4 modes), paramétrage (existant).
- N01 dépend de : aucune ligne de calcul (purement multi-tenant) → peut passer en tête de Phase 3.
- P13/N13 (snapshots) : concevoir le schéma AVANT les écrans d'affichage (Phase 7) pour ne pas casser les listes.

## 5. BASELINE NON-RÉGRESSION (fonctionnalités conformes à retester à CHAQUE gate de phase)

Recensées comme conformes par l'audit — elles ne doivent JAMAIS régresser :

1. Création employé (E12, `rh.create/update`, identité+contrat+position).
2. **Parcours de sortie** bout en bout : `rh.sortir` → compte désactivé + pointage fermé + exclusion bulletins (G1/G2/G10).
3. **HS = 0 sans autorisation approuvée** (G1, presence-engine) — ne jamais régresser lors des changements de présences (Phase 4, N06/P06/P07/P08).
4. **Prorata de paie daté A/B/C/D** (G10) + historique salaire jour par jour.
5. **Clôture congé-vs-présences** : `markLeaveOnAttendance` refuse un mois clôturé (G5) — P05/P06/N06 doivent rester sous cette garde.
6. **Refus `prepareMonth` sur mois non clôturé** (G5) — toute modification de la chaîne paie doit conserver ce verrou.
7. **Masquage serveur salaire** sur `rh.list`/`rh.get`/`getKpis`/`exportEmployes` (G6) — étendre, ne pas dégrader.
8. **Paramétrage** E05 (6 types) : cycles, présence, congés, sanctions, fériés, général.
9. **Demandes congés** + soldes + ajustement tracé (`leaveBalanceAdjustments`, P2) + décision.
10. **Évaluations** : grilles/campagnes/barème IRPP (barème testé 300k → 32 975).
11. **Pointage direct** : posture → annulation soft + motif.
12. **Documents employé** : types ON/OFF + alerte expiration 30 j.
13. **Recherche/mes grilles** : filtres statut+type+dépt + pagination 50 employés ; recherche globale.
14. **Modal « Sortir »** avec motif + `reembauchable` persisté ; `ConfirmationDialog` sur destructions.
15. **Login/accès** : shell `ModuleShell`, breadcrumb, sidebar, `auth()`, `rhProcedure`.

## 6. PROTOCOLE D'EXÉCUTION PAR LIGNE (Méthode A–G, AVANT de coder)

Pour chaque ligne de la phase active :
1. **A. État actuel** : relire la/les lignes exactes (fichier:ligne) + l'audit.
2. **Cause exacte** du dysfonctionnement (pas le symptôme).
3. **Attendu** : comportement cible (critère vérifiable).
4. **Fichiers concernés** (liste exhaustive, maj du registre).
5. **Données** : structure, migrations nécessaires (aucune destructive), seed de test, rapport avec l'historique.
6. **Risques** : dérives salariales, multi-tenant, grains de permission, rollback.
7. **Migration** : plan SQL/Drizzle + validation inverse.
8. **Tests** : cas unitaires (vitest), cas API (routage tRPC), scénario métier, non-régression baseline, effets secondaires.

Ensuite : coder → lint + typecheck → tests → scénarios → vérifications → mettre à jour le registre (statut) → **preuve**.

## 7. COMMANDES DE VÉRIFICATION (à confirmer à la 1re phase de code)
- Lint / typecheck : selon `package.json` de `apps/nextjs` (ex. `pnpm lint`, `pnpm typecheck`) — à figer en Phase 1.
- Tests : `vitest` (moteurs purs + routage trpc si configuré).
- Base de données : migration Drizzle (`drizzle-kit`) ; jamais de `delete`/`drop` sur tables historiques sans validation écrite.

## 8. DÉPART DE LA PHASE SUIVANTE (GATE HUMAN + AUTORÉVISION OBLIGATOIRE)

**Étape A — autorévision par l'agent** (imposée par l'utilisateur) : à la fin de toute phase, l'agent relit SON propre registre et coche individuellement chaque point des lignes traitées (ex. Phase 1 : ✅ UI · ✅ API · ✅ DB · ✅ workflow · ✅ récupération · ✅ récupération partielle · ✅ solde · ✅ report · ✅ annulation · ✅ paie · ✅ sortie salarié · ✅ permissions · ✅ historique · ✅ tests · ✅ non-régression). Puis il produit un **rapport d'autorévision** (CHECKLIST_VALIDATION.md §C).

**Étape B — gate humain** (conditions cumulatives) : (1) rapport de phase validé par l'utilisateur ; (2) autorévision complète et sans case manquante ; (3) baseline non-régression verte (tests de référence re-passés, journal renseigné) ; (4) toutes les lignes de la phase à TERMINE→VALIDE ; (5) aucune anomalie nouvelle non enregistrée ; (6) `graphify update .` exécuté après modifications de code (règle AGENTS.md). Sinon **STOP** : la phase suivante ne s'ouvre PAS.

**Gate Phase 1 — INTERDICTION de passer à la Phase 2 si** : une avance ne peut pas être saisie · une avance n'est pas retrouvable · une récupération partielle est mal calculée · une avance est déduite deux fois · le solde n'est pas traçable · les tests ne passent pas.

## 9. DÉCISIONS PRODUIT À TRANCher EN AMONT DE CERTAINES PHASES (à acter avant le code)
- **Phase 2** : politique `weekForfait` et `stdHours` par défaut (N08/N09) ; ordre `closePeriod`.
- **Phase 4** : règle « congé = jour présent, absent, ou exclu ? » (N06) ; sort des absences simples (N17).
- **Phase 5** : effets décrétés de `congé`/`suspendu` (paie/effectif/planning/compte) (N11) ; règle de réembauche (N12).
- **Phase 6** : granularité des snapshots (bulletin complet vs delta).

## 10. LIVRABLE DE CETTE PHASE 0 (2026-09-23)
1. Registre `DOC/RH/RH_EXECUTION_REGISTER.md` — 43 lignes (P0-01, P0-02 + P01–P20 + N01–N20) avec phase/priorité/statut.
2. Cartographie des dépendances + plan détaillé (ce document).
3. Rapport d'audit enregistré : `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md`.

➡️ **STOP — PHASE 0 TERMINÉE. Validation humaine requise avant PHASE 1.**