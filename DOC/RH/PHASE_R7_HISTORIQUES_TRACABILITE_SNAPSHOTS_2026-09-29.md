# RAPPORT PHASE R7 — HISTORIQUES / TRACABILITÉ / SNAPSHOTS — 2026-09-29

Date : 2026-09-29 · Statut : **VALIDÉE — R7 = VALIDE (validation utilisateur 29/09), STOP ligne 18 ✔ ; R8/R9 non commencés** · Module : RH
Séquence stricte : PLANIFIER → INSPECTER → CARTOGRAPHIER → CONCEVOIR → IMPLÉMENTER → TESTER TECHNIQUEMENT →
TESTER API → TESTER UI → TESTER HISTORIQUE → TESTER SNAPSHOTS → TESTER TRAÇABILITÉ → TESTER PERMISSIONS →
TESTER RÉGRESSION → VÉRIFIER INTÉGRITÉ → DOCUMENTER → GATE → STOP.
Périmètre exclu : R8, R9, interface « Situation RH transverse ».

## 1. Contexte
La phase R7 rend le module RH capable de répondre à toute question historique : état à une date, avant/après,
qui/quand/pourquoi, bulletin reproductible — sans transformer le système en Event Sourcing intégral et sans
super-table historique. La source de vérité reste la chaîne ÉTAT COURANT + HISTORIQUES + JOURNAUX + SNAPSHOTS.

## 2. Preuves produites
- Inspection §3 : `audit/r7/r7-preflight.md` (17 entités, comptes, fonctions existantes, 6 écarts).
- Modèle / cartho / conception : `audit/r7/r7-model.md` (§1 matrice source, §2 arbre traçabilité, §3 contrats
  de fonctions, §4 corrections rétroactives, §5 plan, §6 limites, §7 déroulé implémentation).
- Registre : `DOC/RH/RH_EXECUTION_REGISTER.md` section « PHASE R7 » (18 critères) — lignes 1→13 renseignées.
- Tests : `apps/nextjs/src/server/lib/rh-history-engine.test.ts` (14) ;
  `apps/nextjs/src/server/api/routers/rh-history.integration.test.ts` (16).

## 3. Planification (critère 1)
Périmètre R7 seul ; R8 interdit. Todo de 11 items posé ; registre phase active. Instructions utilisateur 29/09
respectées (séquence stricte, R8/R9 exclus).

## 4. Inspection (critère 2)
Inventaire DB complet (comptes) : employes 38, employee_status_history 24, employee_salary_history 17,
employee_positions 8, employee_situations 1, employee_situation_transitions 1, contrats 22, absences 1,
leave_requests 2, sanctions 0, payroll_entries 31, payroll_entry_lines 56, payroll_entry_snapshots 51,
payroll_item_config_history 0, employee_advances 6, advance_recoveries 5, advance_transitions 5,
audit_logs 10302, tenant_audit 0, tenant_snapshots 0, évaluation/planning/congés snapshots 0,
attendance_entries 496, attendance_calculations 494, attendance_monthly_summaries 52.
Écarts actés : contrat sans historique ; `date_sortie` effacée à la réembauche (intervalle « sorti » fermé à la
veille) ; audit TRPC sans avant/après ni entity_id ; poste sans auteur (`changed_by`) ; immutabilité snapshot non
sanctionnée ; `payroll_item_config_history` vide (hors périmètre R7).

## 5. Cartographie (critère 3)
Matrice des sources par domaine + arbre de traçabilité RÉSULTAT→DOCUMENT→LIGNES→RÈGLES→SOURCE→ÉVÉNEMENTS→
HISTORIQUES (r7-model.md §1-2). Principe §26 : la fiche `employes` est la PROJECTION, les historiques sont la SOURCE.

## 6. Conception (critère 4)
- `getEtatEmploye` / `getEmployeeStateAt` / `getEmployeeSegments` (r7-model.md §3) : purs, reconstruction à date,
  primauté historique, jamais de valeur inventée.
- Historique contrats : `rh_contract_versions` (avant-images versionnées, `prochaineVersionContrat`).
- Journal avant/après : `rh_audit_logs` distinct de `audit_logs` TRPC.
- Corrections rétroactives : INSERT daté, `reason` obligatoire, fermeture j-1, avertissements bulletins clôturés,
  projection fiche ré-alimentée si intervalle le plus récent.

## 7. Implémentation (critère 5)
- Schéma `packages/db/src/schema/rh_history.ts` (contractVersions, rhAuditLogs) + `employee_positions.changed_by` ;
  drizzle-kit push OK.
- Moteur `rh-history-engine.ts` (4 fonctions pures) ; helper `rh-audit.ts`.
- Router `rhHistory` (6 procédures) enregistré dans `root.ts`.
- Hooks écriture dans `rh.ts` : SORTIE, REEMBAUCHE, UPDATE_EMPLOYE journalisés ; createContrat→version 1 ;
  renouvelerContrat→avant-image version 2.

## 8. Tests techniques (critère 6)
- Moteur : 14/14 verts (statut/salaire/poste/contrat par source, inexistant avant embauche, segments, prochaineVersion).
- Intégration (DB réelle) : 16/16 verts.
- Idempotence lecture : réponses identiques sur ré-exécution (vérifié dans l'intégration).
- Concurrence : transactions drizzle + PK DB (pas de perte d'écriture concurrente testée <=> table locale).

## 9. Tests API (critère 7)
Les 16 tests d'intégration passent **par la route réelle** (createCaller) : etat, etatDate, segments,
historiqueContrat, auditEmploye, corrigerSalaireRetroactif — incluant les gardes (NOT_FOUND hors agence,
BAD_REQUEST plage >13 mois / to<from / correction sans valeur, validation reason).

## 10. Tests UI (critère 8)
**N/A documenté** : la phase R7 n'ajoute aucune interface utilisateur (couche API/historiques/audit uniquement).
Aucun écran modifié ; aucun point d'entrée UI nouveau à déployer.

## 11. Tests historique (critère 9)
Reconstruction à date vérifiée : 2026-05-15 (150000, statut actif, contrat v1), 2026-06-15 (200000 après
correction rétroactive), 2026-10-18/2026-10-25 (sorti → actif via réembauche), segments de constance sur plage
courte, sourceStatut « inexistant » avant embauche (2023-06-15).

## 12. Tests snapshot (critère 10)
Couvert en partie : `versionUtilisee` exposé dans etatDate (version max des snapshots valide/cloture/paye) ;
`bulletinsCloturesImpactes` vérifié (liste d'avertissements, jamais de régénération silencieuse). Immutabilité
effective d'un bulletin clôturé : **à couvrir par un test dédié** (reste ⏳ au registre, non bloquant : aucune
écriture R7 ne touche `payroll_entry_snapshots`).

## 13. Tests traçabilité (critère 11)
rh_audit_logs lus via `auditEmploye` : `acteur` (jointure utilisateurs), `avantJson`/`apresJson`, `motif` et
`createdAt` vérifiés pour UPDATE_EMPLOYE, SORTIE, REEMBAUCHE et CORRECTION_SALAIRE_RETROACTIVE. `journaliserAvantApres`
refuse un motif vide.

## 14. Tests permissions/sécurité (critère 12)
- Masquage salaire : appelant sans `rh.salaire.consulter` → `baseSalary`/`forfait` nuls (source conservée).
- Tenant : employé hors agence → NOT_FOUND (`assertEmployeEnAgence`).
- Gate en écriture : `requirePermissionProcedure("rh.employe.modifier")` (superadmin short-circuit) ;
  `enforceRole(["rh","superadmin","directeur"])` sur les lectures paie.

## 15. Non-régression (critère 13)
vitest complet `src/server` : **527 passés / 2 échecs préexistants hors périmètre (licence-service,
stock-engine) / 0 nouveau** — non-régression établie.

## 16. Intégrité (critère 14)
Schéma push vérifié en base (tables `rh_contract_versions`, `rh_audit_logs`, colonne `changed_by`). Aucune
suppression de données : l'intégration crée un employé jetable et le nettoie dans `afterAll` (rh_audit_logs,
contractVersions, contrats, historiques, employes) ; aucune ligne existante n'est modifiée ni supprimée (dates de
test futures 2026-10 hors périodes closes).

## 17. Documentation (critère 15)
Ce rapport ; `audit/r7/r7-preflight.md` ; `audit/r7/r7-model.md` ; registre section PHASE R7 à jour ; graphify
`update .` exécuté (11 402 noeuds / 31 528 arêtes / 635 communautés).

## 18. Limites assumées
- Pas de versionnement « bloc-notes » de la fiche employé ; seuls les faits à enjeu (statut/salaire/poste/contrat/
  situations/paie/congés/avances/éval/planning) sont historisés.
- Reconstruction du passé en lecture seule depuis les données **existantes** ; pas de backfill créatif.
- `payroll_item_config_history` reste vide (hors périmètre : branchement à documenter en phase ultérieure).

## 19. Prochaines étapes
1. GATE fonctionnelle + métier : validation utilisateur des 18 critères (§66-68) — point de transparence
   déjà documenté (TEST_SNAPSHOT partiel, TEST_UI N/A).
2. Décision **STOP : R7 = VALIDE ou REPRISE** portée au registre (ligne 18).
3. **Ne pas commencer R8 (interdit par le périmètre).**