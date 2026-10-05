# PHASE R2.2 — CORRECTION ÉCRAN COMPÉTENCES & FORMATIONS (R2)

**Date** : 2026-09-24
**Instruction** : R2 — « Correction des écrans RH en erreur React » (sous-phase 2/3, après validation R2.1)
**Écran** : `/dashboard/rh/competences` → `apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/CompetencesRH.tsx`
**Statut** : **VALIDE (GATE 18 cases — 24/09)** — STOP en attente de validation utilisateur avant R2.3.

---

## 1. Symptôme (audit initial AUD-02 / REC-5, cause racine commune R2.1)

Écran Compétences & Formations en erreur React : « Une erreur est survenue » au chargement. Le rapport R2.1 (§8.1) avait identifié l'anti-pattern « early returns avant `useClientPaging` » dans **`CompetencesRH.tsx:111-118`** comme probable cible R2.2.

## 2. Reproduction réelle (ÉTAPE 1)

Script Playwright `audit/r2/r2-competences-repro.js` (login admin@gpj.cm, navigateur réel, capture console/pageerror/tRPC avant/après).

- **AVANT correction** (`r2-competences-repro.json` 1re exécution) :
  - `[title] Une erreur est survenue`, aucun onglet rendu (0/0/0/0/0).
  - Console : `Error: Rendered more hooks than during the previous render.` — **chaîne dans `ReferentielSection`**, via `useClientPaging (ClientPagination.tsx:18:81)`.
  - tRPC serveur sain : `rhCompetences.listSkills` → **200**, données présentes (compétences de l'agence 1). **Ce n'est pas un problème de données ni de `.map`.**
  - La 2e section en défaut (**`FormationsSection`**, form virtual) est confirmée par le même anti-pattern en lecture source (`CompetencesRH.tsx:461-468` → call hook). Le crash est déclenché par le 1er onglet (Référentiel, défaut).

## 3. Cause racine (ÉTAPE 2)

**Violation des Règles des Hooks dans 2 sections** (`ReferentielSection` + `FormationsSection`) :

```
if (isLoading) return <skeleton/>;        // early-return
if (isError)   return <ErrorState .../>;  // early-return
const list = (skills ?? []).filter(...);
const { page, ... } = useClientPaging(list, 25);  // HOOK après early-return
```

`useClientPaging` (`ClientPagination.tsx`) est un hook (useState + useEffect + useMemo). Séquence de hooks non constante entre rendus : rendu loading = N hooks, rendu data = N + 3 → React lève **« Rendered more hooks than during the previous render »** → ErrorBoundary → « Une erreur est survenue ». **Anti-pattern identique à R2.1**, conforme à la cause racine commune déclarée.

## 4. Corrections (ÉTAPE 3) — minimales, aucune donnée touchée

Fichier : `CompetencesRH.tsx` (2 modifications, frontend pur) :

1. **`ReferentielSection` (l.111-118)** : déplacer les gardes `isLoading` / `isError` **APRÈS** le calcul de `list` et l'appel `useClientPaging(list, 25)`.
2. **`FormationsSection` (l.465-472)** : même correction après `useClientPaging(list, 25)` (recherche retirée avant le hook — le hook est appelé avant le filtrage, ordre constant).

**Aucune modification** serveur, schéma BDD, migration ni donnée. `rh-competences.ts` inchangé (procédures + permissions `rh.competence.modifier` intactes).

## 5. Tests fonctionnels réels (ÉTAPE 4) — scripts Playwright

Preuves dans `audit/r2/` : `r2-competences-repro.json`, `r2-competences-fct.json`, `r2-competences-fct2.json`, `r2-final.json`, `r2-v2.json`, `r2-v2b.json`, `r2-micro.json`, `r2-micro2.json` + captures PNG `r2-*.png`.

| # | Scénario | Résultat |
|---|---|---|
| 1 | Chargement `/dashboard/rh/competences` après fix | 0 erreur, h1 « Compétences & Formations », **5 onglets présents** (Référentiel / Matrice / Exigences par poste / Formations / Plan & historique) |
| 2 | Référentiel | 10 compétences (agence 1 — isolation multi-tenant correcte), pagination 25/ligne, skeleton + EmptyState « Aucune compétence » |
| 3 | Recherche référentiel | « DIAG »→1, « PEINTURE »→1, « toast »→1, terme inconnu→EmptyState (filtre sur **nom + catégorie**, conforme code existant, pas sur le code — limite documentée §8.2) |
| 4 | Création compétence | `createSkill` 200, toast **« Compétence créée »** capturé à 1,2 s et 2,7 s, recherche → 1 ligne puis suppression ciblée |
| 5 | Suppression compétence (modal + trash ciblé) | `deleteSkill` 200, toast « Compétence supprimée », liste revenue à l'état initial |
| 6 | Matrice employés | select pré-sélectionné via `?employeId=21` (Arnaud — P04), panneau Écarts « Aucun écart » (aucun `employee_skills`), boutons Exporter CSV + Imprimer présents |
| 7 | Exigences par poste | 14 lignes (15 pour l'agence 1 via jointure `positions.agenceId`), recherche vide→EmptyState, **ajout** (Carrossier + Climatisation automobile) 14→15, **retrait** 15→14 : 200 des deux côtés |
| 8 | Formations | 5 cartes (titres/durée), création visuelle (`FORM TEST…` puis suppression), **suppression → session + participations en cascade** |
| 9 | Plan & historique | Planifier session (form OK, `sessionsVide`→0, date OK), **inscription Arnaud** (ligne 1), statut → presente, **Valider** → badge « Valid » |
| 10 | Données | baseline AVANT : skills=20 (10 ag1), trainings=10, sessions=0, participations=0, positionSkills=30, empSkills=0 → **identique APRÈS** (incident de test documenté + restauré §8.3) |
| 11 | Console | aucun `pageerror` après fix (seules erreurs attendues : police Google bloquée par CSP — ticket polices locales déjà ouvert) |

## 6. Vérifications code (ÉTAPE 5/6)

- `eslint` ciblé `CompetencesRH.tsx` : **0 erreur** (2 warnings préexistants : `Brain` import inutilisé l.13, `empPositions` inutilisé l.369 — non liés au fix).
- `tsc --noEmit` : **aucune erreur** sur CompetencesRH/ClientPagination/DisciplinaireRH (erreurs globales préexistantes hors périmètre : cash, treasury, garage, contrats… — inchangées, identifiées au R2.1).
- Tests vitest : non concernés (pas de modification d'engine ; suite RH inchangée).

## 7. GATE R2.2 — 18 cases

1. Repro réelle avant fix — ✓ (`r2-competences-repro.json`, pageerror hooks + « Une erreur est survenue »)
2. Cause racine identifiée (hooks, pas données) — ✓ (`ReferentielSection` + `FormationsSection`)
3. Corrections minimales + documentées — ✓ (2 déplacements de gardes, frontend pur)
4. Données/historique/archi intactes — ✓ (baseline identique avant/après ; incident test documenté + restauré)
5. E2E réel sur interface — ✓ (6 scripts Playwright, production)
6. États (vide/normal/erreur/chargement) — ✓ (skeletons + EmptyStates + 0 error boundary)
7. Recherche/filtre — ✓ (Référentiel nom/catégorie, Matrice `?employeId=`, Postes vide ; limite « code non cherché » documentée)
8. Actions (créer/lister/supprimer) — ✓ (compétence, exigence, formation, session, participation)
9. Feedback toasts — ✓ (« Compétence créée » capturé aux 2 instants, « Compétence supprimée » ; libellés confirmés en source `CompetencesRH.tsx:103,107,350,354,456,460,641,645`)
10. Permissions — ✓ côté serveur : toutes les mutations `rh-competences` en `requirePermissionProcedure("rh.competence.modifier")` (inchangé) ; côté UI : bouton Exporter matrice gaté `hasPermission("rh.competence.consulter")` (source l.246). Refus serveur non rejoué (pas de compte non-admin) — limite identique R2.1
11. API/Données (contracts) — ✓ (listSkills/listPositionSkills/listTrainings/listSessions/listParticipations/listEmployeeSkills/getGaps/exportMatrice 200 ; create/update/delete/set/remove 200)
12. Performance/perception — ✓ chargement < 2 s, aucun blocage
13. Aucune régression (R2.1 intact, lint/tsc) — ✓
14. « Était-ce réel » — ✓ reproduit et corrigé réellement (bundle servi)
15. 5 onglets rendus + matrice métier (Arnaud, écarts, ?employeId, export/impression) — ✓
16. Cohérence inter-écrans : fiche employé 21 onglet « Compétences » (« COMPÉTENCES & PROFIL », 0 erreur) + recherche globale Ctrl+K « Arnaud » → fiche (GPJ-2026-9025) — ✓
17. Propreté données post-tests — ✓ (aucun résiduel de test : TOASTT/EQB/FORM TEST purgés ; skills/trainings/sessions/participations/positionSkills/empSkills = baseline)
18. 0 erreur console/pageerror post-fix — ✓

## 8. Annexes

### 8.1 Cause racine commune — état des lieux après R2.2

Anti-pattern « early returns avant `useClientPaging` » :
- ~~`CompetencesRH.tsx:111-118`~~ → **corrigé en R2.2** (2 sections) ;
- **`DocumentsRH.tsx:120-131`** → **R2.3** (incluses) ;
- **`PlanningRH.tsx:82`** → **hors périmètre R2, à signaler** (l'utilisateur devra arbitrer — PlanningRH est sain côté hooks ? non : c'est `PlanningRH.tsx:82` `useClientPaging(filtered, 25)` après `if` — à confirmer en R2.3/extension).

### 8.2 Limites UX constatées (non bloquantes, à arbitrer)

- La recherche du Référentiel ne couvre **ni le code ni la description** (filtre `name + category` uniquement). Placeholder « Rechercher une compétence… » sans précision de critères.
- Matrice : aucun `employee_skills` en base → « Aucun écart » ; l'insertion de compétences employé n'a pas été testée par l'e2e (mutation couverte par le routeur, aucune donnée de prod à risquer).
- Colonne droits : l'export CSV matrice est le seul bouton gaté par permission ; le reste de l'écran suppose `rh.competence.consulter` global (revue source, cohérent avec T21).

### 8.3 Incident de test — suppression accidentelle ACCUEIL_CLIENT et restauration

- **Cause** : dans le script `r2-competences-fct2.js`, l'étape « suppression compétence test » ciblait le premier trash du tableau (`.first()`) au lieu de la ligne de test. Le tableau étant trié par catégorie (« Accueil » en tête), le script a **supprimé la compétence seed `ACCUEIL_CLIENT`** (id 8) ; conséquence en cascade : suppression de l'exigence `position_skills` correspondante (SECRETAIRE → ACCUEIL_CLIENT niveau 4, position « Secrétariat/Accueil » agence 1) et persistance de la compétence de test `EQB_…`.
- **Restauration immédiate** (`restore-acceuil.sql`) : réinsertion du skill id 8 avec le jeu de champs du seed (`code`, `name`, `category`, `description`, `active`, `agence_id=1`, `created_at` d'origine) ; réinsertion de l'exigence (`position_id=9, skill_id=8, required_level=4`) conditionnée `NOT EXISTS` ; suppression de la compétence test ; reset des séquences `skills`/`position_skills`.
- **Vérification** : `skills(agence 1)` = les 10 codes seed exacts dans l'ordre original ; comptes mondiaux = baseline. **Aucune donnée de production perdue.**
- **Leçon appliquée** : le test final (`r2-v2.json`) supprime désormais uniquement la ligne contenant la compétence de test créée avec un code unique, jamais le premier trash.

### 8.4 Preuves

- `audit/r2/r2-competences-repro.json` — repro avant/après (pageerror hooks, « Une erreur est survenue », 0/5 onglets, listSkills 200).
- `audit/r2/r2-competences-fct.json`, `r2-competences-fct2.json` — tests onglets : matrice, écarts, add/remove exigences, session, inscription, statut, Valider, nettoyage formation (`167: title disparu=true`), non-régression fiche employé + recherche globale.
- `audit/r2/r2-final.json`, `r2-v2.json`, `r2-v2b.json` — création + toast « Compétence créée » @1,2 s/@2,7 s, recherche « toast »→1, suppression ciblée + toast « Compétence supprimée », fiche employé onglet Compétences, Ctrl+K « Arnaud » → GPJ-2026-9025.
- `audit/r2/r2-*.png` — captures d'écran des états clés.
- `counts4.sql` / `counts-final.sql` / `restore-acceuil.sql` / `check-skills.sql` — preuves DB avant/après + restauration.

---

**Demande utilisateur** : la sous-phase **R2.2 (Compétences & Formations) est terminée (VALIDE, GATE 18 cases)**. **Validation requise avant de passer à R2.3 (Documents RH — anti-pattern identique `DocumentsRH.tsx:120-131`)**. À signaler également : `PlanningRH.tsx:82` (hors périmètre R2) conserve le même anti-pattern à arbitrer.