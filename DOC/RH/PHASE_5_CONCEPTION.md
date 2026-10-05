# PHASE 5 — CONCEPTION : Statuts / réembauche / navigation

> **Phase active (registre)** : P04, P12, N12, F04, F05, N02, P18, N20 (+ dépendance F26/Phase 4 VALIDE).
> **Statut** : EN_CONCEPTION (8 lignes passées EN_INSPECTION le 2026-09-23 après gate Phase 4 VALIDE).
> **Ordre bloquant (§118)** : P18 (backend 1 file) → N02 (backend 1 file + UI call sites) → P12/F05 (UI, backend déjà prêt) → N12/F04 (nouvelle mutation + UI) → N20 (moteur + tests) → P04 (hook + 9 pages). P12 et N12 ne dépendent que de N11 (déjà posé Phase 3).

---

## 1. Diagnostics fondateurs (lecture des fichiers Phase 5)

| Fichier | Constat |
|---|---|
| `EmployeeDetail.tsx:743-751` | Émet 9 liens `?employeId=` (présences, absences, pointage, paie, compétences, évaluations, sanctions, contrats, documents) — mais **aucune page cible ne lit le paramètre** (aucun `useSearchParams` dans le module rh ; P04) |
| `rh.ts:297-482` (`update`) | Gère déjà `statut` (actif/conge/suspendu/archive) : historique `employeeStatusHistory` (ferme l'intervalle ouvert, insert `startDate=today`) + effets N11 (`utilisateurs.isActive` coupé si suspendu/archive) + historique salaire (G10) |
| `EmployeeForm.tsx` | Aucun champ statut (le modePaie `commission` existe déjà dans les options, `:26-31`) ; `EmployeeDetail.tsx:685` affiche un badge statut non cliquable (F05 = aucune surface pour changer de statut) |
| `rh.ts:487-572` (`sortir`) | Pose `statut=sorti`, `dateSortie`, motif, `reembauchable` (colonne existante `employes.reembauchable`), coupe le compte (`isActive=false`) — **aucune voie de réembauche** (N12/F04) |
| `trpc.ts:170` (`rhProcedure`) | `enforceRole(["rh","superadmin","directeur"])` → `rh.list` renvoie FORBIDDEN aux rôles opérationnels qui l'appellent (Outillage, Planning atelier, Travaux, OR) — N02 |
| `recherche.ts:9,169-177` | `global` est `protectedProcedure` et **sélectionne `telephone` + `emailPersonnel` des employés** sans garde `rh.employe.consulter` (P18) |
| `payroll-engine.ts:426-428` | Cas C : COMMISSION tombe dans le défaut « salaire mensuel » (base fixe conservée, commentaire « part variable Phase 5/N20 ») ; `normaliserModePaie` (rh.ts:414-417, rh-payroll.ts:342/670) indexe déjà `COMMISSION`/`JOURNALIER` dans `employee_salary_history` ; `baseEffectifPeriode`/`baseProratise` ne proratisent pas COMMISSION (N20) |

## 2. Règles de conception décidées (Phase 5)

1. **P04 — Navigation `?employeId=`** : hook client partagé `useEmployeFromUrl()` dans le module rh qui lit `searchParams.get("employeId")`, valide `entier > 0`, et fournit la valeur d'initialisation du sélecteur employé de chaque page cible. Si l'id est absent/illégitime/inconnu de la liste → état vide (défaut actuel). Les 9 cibles sont branchées (select de l'onglet principal de chaque page : `CongesAbsences` demandes, `PresencesRH` analyse/mensuel, `PointageDirect` journal par employé, paie, `CompetencesRH`, `EvaluationsRH`, `DisciplinaireRH` dossier, contrats, documents).
2. **P12/F05 — Changer de statut depuis l'UI** : le backend `rh.update` est déjà complet ; aucune modification serveur. Surfaces UI :
   - `EmployeeDetail` en-tête : badge statut cliquable → **menu/confirmation** (état React, jamais `confirm()`) proposant le nouveau statut (`actif`, `conge`, `suspendu`, `archive`) + libellés + effet attendu ; appelle `rh.update({ id, statut })`, garde `rh.employe.modifier` (`hasPermission`) sinon contrôle masqué, `toast()` succès/erreur, `invalidate()` de `rh.getDetail` + `rh.list`.
   - `EmployeeForm` : ajout du sélecteur statut (mode édition), initialisé au statut courant, transmis tel quel par `rh.update` (effets N11 reproduits côté serveur).
   - Message d'effet à la confirmation : suspendu/archive → accès compte coupé (`utilisateurs.isActive=false`) ; congé → accès maintenu.
3. **N12/F04 — Réembauche d'un sorti** : nouvelle mutation `rh.reembaucher` (`requirePermissionProcedure("rh.employe.modifier")`, scope agence) :
   - préconditions : employé existant dans l'agence, `statut === "sorti"`, `reembauchable === true` (sinon `BAD_REQUEST` « Employé non réembauchable ») ;
   - réactive : `statut="actif"`, `dateSortie=null`, `motifSortie=null`, `detailMotifSortie=null`, `sortieChangedBy=null`, `sortieChangedAt=null` (la `dateEmbauche` d'origine est conservée — continuité de carrière) ;
   - historique : ferme l'intervalle `sorti` encore ouvert (`endDate=today`, `reason="Réembauche"`) puis insert `statut="actif"` `startDate=today` `reason="Réembauche"` ;
   - compte : si `userId` lié et `isActive=false` → `isActive=true` (cohérent N11 : actif = accès maintenu) ;
   - UI (`EmployeeDetail`) : si `statut === "sorti"` et `reembauchable` → bouton « Réembaucher » (gaté `rh.employe.modifier`) + modal de confirmation (date par défaut aujourd'hui, motif optionnel) → `toast()` + `invalidate()` + refetch.
4. **N02 — Lecture RH pour les rôles opérationnels** : nouvelle query **`rh.roster`** (`protectedProcedure`, scope agence, filtres `statut`/`search`/`limit`) qui ne retourne que le profil annuaire réduit : `id`, `matricule`, `nom`, `prenom`, `fonction`, `typeEmploye`, `statut`, `photoUrl`, `departmentName`. Les 5 appels opérationnels (`outillage/page.tsx:37`, `Outillage.tsx:65`, `PlanningAtelier.tsx:15`, `TravauxTab.tsx:47`, `ordres-reparation/page.tsx:140`) basculent sur `rh.roster`. `rh.list` reste `rhProcedure` (données complètes, y c. téléphone/email/salaire) réservé RH/Direction — aucun `rh.*` accordé aux rôles opérationnels dans `SOCLE_MATRICE` (le module RH ne s'ouvre pas dans la sidebar pour eux).
5. **P18 — Recherche globale** : dans `recherche.ts`, le bloc `employes` ne retourne `telephone`/`emailPersonnel` que si l'appelant détient `rh.employe.consulter` (`RBACService.hasPermission`), sinon champs à `null` (titre/sous-titre inchangés : matricule + fonction). Clients/fournisseurs inchangés (usage CRM légitime par caisse/accueil).
6. **N20 — Mode commission** : constat — aucune donnée de commission (ventes/SNC câblées à la paie, colonne taux) n'existe dans le schéma ; inventer une table de commission est **P14 (backlog)**. Décision produit actée : COMMISSION = **base fixe contractuelle** (bulletin à l'item `BASE`), jamais proratisée (`baseProratise`/`baseEffectifPeriode` conservés), préparation/ajustements/historique déjà alignés via `normaliserModePaie` (vérifié rh.ts:414-417, rh-payroll.ts:342/670). N20 livre : **tests moteur COMMISSION** (préparation, recalcul ajustement, non-proratation) + commentaire moteur corrigé (suppression du « part variable Phase 5 » — remplacé par note P14). Sans ajout de table.

## 3. Déroulé d'exécution

1. P18 : masque `recherche.ts` (employes) + test RBAC.
2. N02 : query `rh.roster` + bascule des 5 call sites + tests.
3. P12/F05 : contrôle statut `EmployeeDetail` + select `EmployeeForm`.
4. N12/F04 : mutation `rh.reembaucher` + bouton/modal `EmployeeDetail` + tests.
5. N20 : tests moteur COMMISSION + commentaire.
6. P04 : hook `useEmployeFromUrl` + 9 pages.
7. Tests (vitest RH), typecheck fichiers touchés, `graphify update`, journal (T21+), registre EN_TEST→VALIDE, RAPPORT_PHASE_5, autorévision, gate humain.

## 4. Risks & garde-fous

- Aucune migration DB (colonnes existantes : `employes.reembauchable`, `dateSortie`, `motifSortie`, `employeeStatusHistory`, `leave_balance_adjustments`).
- `rh.roster` ne réduit **pas** le périmètre de `rh.list` (aucun rôle opérationnel ne gagne de `rh.*`) — la matrice superadmin/directeur/RH reste source de vérité.
- Ne pas toucher aux autres phases (P13/P14/P16 purge/P20… restent BACKLOG). P14 (commission variable) explicitement renvoyé en backlog.
- P04 : ne pas sur-charger — une seule pré-sélection par page, aucun comportement de liste impliqué.