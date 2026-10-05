# PHASE 3 — CONCEPTION : Socle multi-tenant et sécurité

> **Contexte** : rapport d'audit `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md` + anomalies N01–N20.
> **Phase active (registre)** : N01, P03, N11, P16, P17, P19 — ouverte après gate ∅ (Phase 2 VALIDE, 2026-09-23).
> **Statut** : EN_CONCEPTION (les 6 lignes le 2026-09-23).
> **Ordre bloquant (§117)** : N01 (socle agence) → N11 ; P16 (durcir) ; P17 (gating) ; P19 (selon dépendances).

---

## 1. Diagnostics fondateurs (audits rendus)

### 1.1 Contexte middleware
- `rhProcedure` / `requirePermissionProcedure` (trpc.ts:170-184) chaînent `tenantMiddleware` (pose `ctx.user.agenceId`) **mais n'injectent aucune condition `agenceId`** dans les requêtes. Le scope doit être écrit explicitement dans chaque `where`.
- Tous les ids d'entrée RH sont `z.number().int()` (ou `z.string()` convertible). Aucun id « global » acceptable en lecture exploratoire.

### 1.2 Classification des tables
| Catégorie | Tables |
|---|---|
| **AVEC `agenceId`** (scope direct) | `employes`, `positions`, `skills`, `trainings`, `trainingSessions`, `evaluationGrids`, `evaluationCampaigns`, `performanceBonusRules`, `payrollPeriods`, `payrollItemsConfig`, `hrDocumentTypes`, `hrLeaveTypes`, `hrGeneralSettings`, `hrAttendanceSettings`, `hrSanctionTypes`, `hrPublicHolidays`, `departments`, `contractTypes`, `hrWorkCycles` |
| **SANS `agenceId`** (scope via parent joint) | `sanctions` (→ employe), `documentsEmployes` (→ employe), `employeePostures` (→ employe), `leaveBalances`/`leaveRequests`/`leaveBalanceAdjustments` (→ employe), `payrollEntries`/`payrollEntryLines` (→ période→agence), `positionSkills` (→ position→agence), `employeeSkills`/`trainingParticipations` (→ employe), `evaluations`/`evaluationScores`/`evaluationCriteria` (→ employe/grid→agence), `employeeSalaryHistory` (→ employe) |
| **Utilisateurs** | `utilisateurs` a `agenceId` ; `employes.userId` relie le compte |

### 1.3 Constats clés
- `rh-posture.ts` : `pointer` (:48-51 scope partiel — `statut=actif` mais **sans agenceId**), `annulerEvenement` (:120 UNSCOPED), `corrigerHeure` (:149-153 UNSCOPED), `annulerJournee` (:196-199 UNSCOPED), `journee` (:308 UNSCOPED), et `now` (:211-221 **fuite cross-tenant** + expose `salaireBase` → P03).
- `rh-leave.ts` : `decideRequest` (:249-330) lit une `leaveRequest` par id sans agence ; `adjustBalance` (:114-148) lit une `leaveBalance` par id sans agence.
- `rh-payroll.ts` : `getEntry` (:553-568) lit `payrollEntries`/`payrollEntryLines` **par id sans agence** (les autres procédures de paie ont été scopées en Phase 2).
- `rh-dashboard.ts:57` : getKpis filtre `ne(statut, "archive")` — **expose les sortis** dans effectif/masse salariale → P19.
- `EmployeesPageClient.tsx:246-251` : bouton « Modifier » jamais gaté avec `rh.employe.modifier` → P17.
- Procédures mortes (~34, cf. N05 puis P16) : elles existent dans les routers **sans purger** ; demandé = les **durcir** (agence + permission) en Phase 3.

---

## 2. Règles de conception transverses

1. **Double contrôle systématique sur toute lecture/mutation par id RH** : (a) la ressource doit exister **et** (b) appartenir à `ctx.user.agenceId`. Refus = `NOT_FOUND` (404) — jamais d'info sur l'existence.
2. **Scope par jointure** : pour une table sans `agenceId`, joindre le parent agencé (`employes`, `positions`, `payrollPeriods`, `evaluationGrids`…) et ajouter `eq(parent.agenceId, ctx.user.agenceId)`.
3. **Permissions** : conserver les permissions existantes (`requirePermissionProcedure`) ; aucune nouveauté de RBAC (P11 est Phase 3-BACKLOG, README portée les gardes CSV — hors Phase active).
4. **Zero migration** : toutes les lignes Phase 3 = code logique uniquement (aucune table à créer).
5. **Feed UX** : toute suppression désactivée → masquage/disabled + toast (sonner). Pas de `alert`.

---

## 3. N01 — Isolation multi-tenant des lectures/mutations « par id » (P0)

**Objectif** : plus aucune procédure RH « par id » hors scope agence, hors `rh.ts` (traité en P16 dans le même effort de durcissement).

### 3.1 `rh-posture.ts`
| Procédure | Correctif |
|---|---|
| `pointer` (:48-51) | ajouter `eq(employes.agenceId, ctx.user.agenceId)` au `where` du SELECT employé |
| `annulerEvenement` (:120) | charger l'événement **puis** vérifier le scope : joindre `employes` via `employeePostures.employeeId` → `eq(employes.agenceId, agence)` ; 404 si absent |
| `corrigerHeure` (:149-153) | même patron (événement → employé → agence) |
| `annulerJournee` (:196-199) | charger les événements du jour par `input.employeId` + scope employé agence |
| `journee` (:308) | idem : employé de l'agence courante obligatoire |

### 3.2 `rh-leave.ts`
| Procédure | Correctif |
|---|---|
| `decideRequest` (:249) | joindre `leaveRequests.employeeId → employes` + `eq(leaveRequests.id, input.id)` + `eq(employes.agenceId, agence)` ; 404 sinon |
| `adjustBalance` (:114) | joindre `leaveBalances.employeeId → employes` + agence ; 404 sinon |

### 3.3 `rh-payroll.ts`
| Procédure | Correctif |
|---|---|
| `getEntry` (:553) | joindre `payrollEntries.periodId → payrollPeriods` + `eq(payrollPeriods.agenceId, agence)` ; 404 sinon (lignes lues ensuite sur `entry.id` déjà scopé) |

### 3.4 `rh-discipline.ts` (audit : `listRecords`, `createRecord`, `dossier`)
- `listRecords` : filtrer par agence (choix : filtre par ensemble d'employés de l'agence — sinon re-voir le query).
- `createRecord` : l'employé ciblé (`input.employeId`) doit appartenir à l'agence (verrou 404).
- `getSanction`/`dossier` : charger la sanction → employé → agence.

### 3.5 `rh-documents.ts` (audit : `list`, `getAlerts`, `delete`)
- `list` : scope employés de l'agence (join) ou `documentsEmployes.employeId → employes.agenceId`.
- `getAlerts` : dérivé de documents/périodes — vérifier le filtre employé agence (ou documents). 
- `delete` : charger le document → employé → agence avant `DELETE`.

### 3.6 `rh-competences.ts` (audit : `getGaps`, `list*`, `requestOvertime`…)
- Toute procédure avec `employeId`/`positionId` : verrou d'appartenance agence (employé → joindre `employes` ; position → `positions`).
- `requestOvertime` : vérifier le flux d'appartenance employé/équipe.

> **Vérification N01** : pour chaque table sans `agenceId`, grep de joindre le parent agencé ; pour chaque procédure « par id », le `where` contient `eq(employes|positions|payrollPeriods|evaluationGrids.agenceId, ctx.user.agenceId)`.

---

## 4. P03 — Fuite cross-tenant `rhPosture.now` (P0)

**Constats** (rh-posture.ts:211-274) :
- `now` sélectionne **tous les employés `actif` de toutes les agences** → fuite (aussi `salaireBase`, `modePaie`, `workCycleId`).
- La réponse enrichit chaque employé avec son **gain du jour** (confidentialité salariale quand même exposée).

**Correctif** :
1. `where(and(eq(employes.agenceId, ctx.user.agenceId), eq(employes.statut, "actif")))`.
2. **Masquer `salaireBase`** de la réponse : ne plus renvoyer le champ brut (`salaireBase` retiré de la projection retournée) ; le `gain` reste calculé côté serveur (aucune donnée salariale brute exposée via `now`).
3. Ne pas modifier les autres endpoints posture (pas de regression sur `pointer`).

**Vérification** : `now` renvoie uniquement les employés de l'agence courante et aucune clé `salaireBase`.

---

## 5. N11 — Effets réels des statuts congé/suspendu (règles décidées le 2026-09-23)

### 5.1 Règles métier décrétées
| Domaine | Congé | Suspendu |
|---|---|---|
| **Paie** | Conservée (bulletin complet, comme aujourd'hui) | **Jours suspendus non payés** — prorata : seuls les jours avant la suspension sont payés (date de suspension déduite de l'état courant) |
| **Effectif / KPI** | Compté actif | Compté dans l'effectif hors sortis, distingué au niveau « suspendus » (P19) ; exclu des « actifs » |
| **Planning** | Peut être planifié | Exclu des affectations planning |
| **Compte utilisateur** | Accès maintenu | **Accès coupé** (login refusé pendant la suspension, réactivé à la sortie de suspension) |

### 5.2 Sources de données
- `employes.statut` : état courant (`actif | conge | suspendu | sorti | archive`) — déjà exhaustif.
- `employee_status_history` : journal des transitions (créé par `rh.update` :255-291 / 453-465) → pour la **date de début de suspension** (entrée `statut=suspendu` la plus récente avec `endDate IS NULL`). Aucune colonne supplémentaire → **zéro migration**.
- `utilisateurs.actif` : compte lié via `employes.userId`.

### 5.3 Implémentation
1. **Paie (`rh-payroll.ts` `prepareMonth`)** :
   - Employé `suspendu` : exclure sa paie des jours suspendus. Date de début = `employeeStatusHistory.startDate` de la dernière entrée `statut=suspendu` ouverte (ou `dateSortie` déjà géré pour sortis).
   - Réutiliser le mécanisme de **prorata existant** (`calculerProrata`/`baseEffectifPeriode`) : pour un employé suspendu, calculer la paie **jusqu'à la veille de la date de suspension** ; si la période de virement est entièrement après → pas de bulletin.
   - Congé : ne rien changer (paie conservée).
2. **Effectif/KPI (`rh-dashboard.ts` getKpis + `rh-stats-engine`)** :
   - Nouveau filtre `effectif` = `statut IN (actif, conge, suspendu)` (hors `sorti`, hors `archive`) → impacte `effectif`, `actifs`, `inactifs`, répartitions et `masseSalariale`.
   - Distinguer « suspendus » au niveau : ajouter un compteur dérivé dans la réponse getKpis (P19 co-traité).
3. **Planning (`rh-planning.ts`)** : `saveWeek` / `listWeek` — écarter les employés `suspendu` (et `sorti`) du réservoir d'affectation (filtre au chargement).
4. **Compte (`rh.ts` `update`)** :
   - Passage en `suspendu` → `utilisateurs.actif = false` (si `employes.userId`).
   - Passage de `suspendu` → `actif|conge` → `utilisateurs.actif = true`.
   - Ne pas toucher aux comptes quand c'est un simple congé.

> **Vérification N11** : un employé suspendu du 15 au 30 → paie proratée sur les jours 1-14 ; KPI l'affiche hors actifs mais présent hors sortis ; planning l'exclut ; son compte est désactivé tant qu'il est suspendu ; un congé ne change aucun de ces critères.

---

## 6. P16 — Durcir les procédures mortes (agence + permissions)

**Périmètre** : les ~34 procédures mortes recensées (N05) dans `rh.ts`, `rh-documents`, `rh-discipline`, `rh-evaluation`, `rh-settings`, `rh-presence` (dont `saveEntry` L120 mort, `createAbsence` rh.ts:853, `validerAbsence`, `createSanction`, `updateDocument`, `updateRecord`, `listSanctionTypes` doublon, `getSuggestedBonus`, etc.).

**Correctif (durcir, ne pas purger)** :
1. Pour chaque procédure morte **avec mutation** (`create*`, `update*`, `delete*`, `valider*`, `adjust*`, `mark*`) : s'assurer d'une permission métier (`requirePermissionProcedure`) et d'un **scope agence complet** (idem §3).
2. Pour chaque procédure morte en **lecture** (`list*`, `get*`, `historique`) : scope agence via parent joint + 404.
3. Ne **supprime aucune** procédure (purge = Phase 9 / N05).
4. `saveEntry` (rh-presence.ts:120) : garder le scope agence + permission existants ; le maintenir car utilisé par scripts/tests seulement.

> **Vérification P16** : aucune procédure morte ne doit s'exécuter sans permission + sans agence scopée : audit par grep + relecture.

---

## 7. P17 — Gating du bouton « Modifier » (liste employés)

**Constats** : `EmployeesPageClient.tsx:246-251` affiche le bouton « Modifier » sans vérification ; `hasPermission` est déjà utilisé ailleurs (:91, :233).

**Correctif** : conditionner le rendu du bouton avec `hasPermission("rh.employe.modifier")` (masqué/disabled pour un rôle sans permission). Vérifier aussi `openEdit` appelé depuis ce bouton seulement. Ne pas masquer « Fiche » (lecture fait partie de `rh.list`/consulter).

> **Vérification P17** : sans `rh.employe.modifier`, l'interface employé ne montre pas « Modifier » (ni aucun chemin d'édition).

---

## 8. P19 — KPIs effectif/masse salariale : exclure les sortis (+ niveau suspendu)

**Constats** : `rh-dashboard.ts:47-61` filtre uniquement `ne(employes.statut, "archive")` → les sortis gonflent `effectif`, `actifs`/`inactifs`, répartitions et `masseSalariale`.

**Correctif** :
1. `getKpis` : `effectif = statut IN (actif, conge, suspendu)` (exclut `sorti` et `archive`).
2. `rh-stats-engine.ts` : ajouter/affiner le helper de composition d'effectif (ex. `effectifParStatut`) pour exposer `actifs`, `enConge`, `suspendus`, et `inactifs = effectif − actifs` — testé en vitest.
3. `masseSalariale = payrollMass(effectif)` — donc hors sortis automatiquement.

> **Vérification P19** : avec 2 sortis historiques, `effectif` ne les compte plus ; `masseSalariale` inchangée ; compteur suspendus présent.

---

## 9. Déroulé d'exécution (ordre)

1. **P03 + N01** (socle) : `rh-posture`, `rh-leave`, `rh-payroll.getEntry`, `rh-discipline`, `rh-documents`, `rh-competences`.
2. **P16** (durcir) : rh.ts + autres routers (même effort scope+permission).
3. **N11** : paie (prorata suspendu), effectif (rh-stats-engine + dashboard), planning, compte (`rh.update`).
4. **P19** : factorise avec N11-§5.2 (même filtre effectif) puis KPI.
5. **P17** : gating UI.
6. **Tests & preuves** : vitest (rh-stats-engine, payroll-engine prorata suspendu, posture/leave/payroll multi-agence en mock db), typecheck, journal T19, registre EN_TEST→TERMINE, autorévision, RAPPORT_PHASE_3, graphify update, **STOP gate humain**.

---

## 10. Risques & garde-fous

- **Pas de DELETE+INSERT** : les seules mutations en place sont des `delete` de documents/sanctions traités en Phase 3 via le verrou d'appartenance — historique conservé.
- **Pas de migration** : aucune nouvelle colonne/table (statut courant + `employee_status_history` suffisent).
- **Ne pas toucher les autres phases** : lignes P09/P10/P11/P18/N02/N19 restent BACKLOG (Phase 3 prévue mais non actives) sauf mention explicite dans les lignes actives.
- Chaque ligne doit rester **dans son propre périmètre** pour la vérifiabilité du gate.