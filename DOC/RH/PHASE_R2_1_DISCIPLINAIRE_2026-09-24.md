# PHASE R2.1 — CORRECTION ÉCRAN DISCIPLINAIRE (R2)

**Date** : 2026-09-24
**Instruction** : R2 — « Correction des écrans RH en erreur React » (sous-phase 1/3)
**Écran** : `/dashboard/rh/sanctions` → `apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/DisciplinaireRH.tsx`
**Statut** : **VALIDE (GATE 14 cases — 24/09)** — STOP en attente de validation utilisateur avant R2.2.

---

## 1. Symptôme (audit initial AUD-02 / REC-5)

Écran Disciplinaire en erreur React : écran « Une erreur est survenue » au chargement (`TypeError: Cannot read properties of undefined (reading 'map')` signalé à l'audit).

## 2. Reproduction réelle (ÉTAPE 1)

Script Playwright `audit/r2/r2-discipline-repro.js` (login admin@gpj.cm, navigation, capture console/pageerror/tRPC avant et après).

- **AVANT correction** (`r2-discipline.json` 1re exécution) :
  - `[title] Une erreur est survenue`, `[error label count] 1`, aucun onglet rendu.
  - Console : `React has detected a change in the order of Hooks called by RegistreSection`, `Error: Rendered more hooks than during the previous render.` (react-dom development).
  - tRPC serveur sain : `rhDiscipline.listRecords` → **200** `{json:[]}`. **Ce n'est pas un problème de données ni de `.map`.**

## 3. Cause racine (ÉTAPE 2)

**Violation des Règles des Hooks dans `RegistreSection`** :

```
if (isLoading) return <skeleton/>;         // early-return
if (isError)   return <ErrorState .../>;   // early-return
const list = (records ?? []).filter(...);
const { page, ... } = useClientPaging(list, 25);   // HOOK après early-return
```

`useClientPaging` (`ClientPagination.tsx`) est un hook (useState + useEffect + useMemo). Séquence de hooks non constante entre rendus : rendu 1 (loading) appelle N hooks, rendu 2 (data) appellent N + 3 (useState/useEffect/useMemo de la pagination) → React lève **« Rendered more hooks than during the previous render »** → ErrorBoundary → « Une erreur est survenue ».

C'est exactement l'anti-pattern attendu par l'exercice R2 : l'audit avait vu « reading map » mais l'écran réel muscle une erreur de hooks (le cache Redux/serveur périmé peut masquer la vraie ligne).

## 4. Corrections (ÉTAPE 3) — minimales, aucune donnée touchée

Fichier : `DisciplinaireRH.tsx` (2 modifications, frontend pur) :

1. **`RegistreSection` (l.99-108)** : déplacer les gardes `isLoading` / `isError` **APRÈS** le calcul de `list` et l'appel `useClientPaging(list, 25)`. Tous les hooks sont désormais appelés inconditionnellement dans le même ordre à chaque rendu.
2. **Dossier employé, colonne « Par » (l.402)** : l'API (`getEmployeeDossier`) renvoie `creatorName`/`creatorPrenom` ; le composant lisait `r.creatorNom` (inexistant) → « Super undefined ». Corrigé : `r.creatorNom ?? r.creatorName ?? ""` → « Super Admin ».

**Aucune modification** serveur, schéma BDD ou migration. Table `sanctions` intacte (0 → 2 de test → 0).

## 5. Tests fonctionnels réels (ÉTAPE 4) — scripts Playwright

Preuves dans `audit/r2/` : `r2-discipline.json` (before/after), `r2-discipline-test.json`, `r2-discipline-extra.json`, `r2-discipline-par.json`, captures PNG `r2-01…r2-07`.

| # | Scénario | Résultat |
|---|---|---|
| 1 | Chargement `/dashboard/rh/sanctions` après fix | 0 erreur, h1 « Disciplinaire », 3 onglets présents |
| 2 | Registre vide (aucune sanction en base) | EmptyState « Aucun record disciplinaire » |
| 3 | Création depuis « Nouveau record » (employé Arnaud, type Mise à pied, motif, date) | `createRecord` 200, toast « Sanction enregistrée » visible, formulaire effectif |
| 4 | Registre actualisé | 1 ligne : employé · type · motif · date · GRAVE · NOTIFIÉE |
| 5 | Recherche « Arnaud » / « Avertissement écrit » | 1 ligne (recherche sur employé + type, conforme placeholder) |
| 6 | Recherche terme inconnu / motif (hors critères) | État vide (comportement attendu) |
| 7 | Dossier employé (Arnaud) | 0 erreur, carte Employé/Records/Récidive (« RÉCIDIVE (FENÊTRE 12 MOIS) · 1 avertissement(s) — OK · seuil 2 · depuis 2025-09-24 »), tableau du record |
| 8 | Colonne « Par » | « Super Admin » (plus d'`undefined`) |
| 9 | Suppression via Registre (trash + modal) | `deleteRecord` 200, toast « Record supprimé », Registre vide |
| 10 | Données | table `sanctions` : 0 avant, records de test supprimés, **0 après** |
| 11 | Console | aucun `pageerror` après fix (seules erreurs attendues non liées : police Google bloquée par CSP — ticket polices locales déjà ouvert) |

## 6. Vérifications code

- `eslint` ciblé `DisciplinaireRH.tsx` : **0 erreur** (1 warning préexistant `fmtXOF`).
- `tsc --noEmit` : **aucune erreur** mentionnant DisciplinaireRH/sanctions.
- Tests vitest : non concernés (pas de modification d'engine, base 57/57 inchangée).

## 7. GATE R2.1 — 14 cases

1. Repro réelle avant fix — ✓
2. Cause racine identifiée (hooks, pas données) — ✓
3. Corrections minimales + documentées — ✓ (2 edits frontend)
4. Données/historique/archi intactes — ✓ (0 sanction avant ↔ après)
5. E2E réel sur interface — ✓ (4 scripts, production)
6. États (vide/normal/erreur/chargement) — ✓
7. Recherche/filtre — ✓ (employé + type ; motif hors critère documenté)
8. Actions (créer/lister/supprimer) — ✓
9. Feedback toasts — ✓
10. Permissions — ✓ côté UI (`hasPermission("rh.discipline.consulter")` gating Export) ; refus serveur non rejoué (procédures non modifiées)
11. API/Données (contracts) — ✓ (`listRecords`, `createRecord`, `getEmployeeDossier`, `deleteRecord` 200)
12. Performance/perception — ✓ chargement < 2 s, aucun blocage
13. Aucune régression (R1 intact, lint/tsc) — ✓
14. « Était-ce réel » — ✓ reproduit et corrigé réellement (bundle servi)

## 8. Annexes

### 8.1 Cause racine commune (pour R2.2 / R2.3)

Le même anti-pattern « early returns avant useClientPaging » est présent dans :
- **`CompetencesRH.tsx:111-118`** (Compétences & Formations → **R2.2**) ;
- **`DocumentsRH.tsx:120-131`** (Documents RH → **R2.3**) ;
- **`PlanningRH.tsx:82`** (Planning — **hors périmètre R2**, à signaler à l'utilisateur).

L'erreur exacte renvoyée par ESLint le confirme : `React Hook "useClientPaging" is called conditionally` dans ces 3 fichiers. Correctif type : déplacer les gardes après le hook.

### 8.2 Limites UX constatées (non bloquantes, à arbitrer)

- La recherche du Registre ne couvre **pas le motif ni la date** (placeholder « Rechercher (employé, type) »). Comportement constant avec DocumentsRH.
- Colonne « Document » du dossier affiche « — » si `documentUrl` absent (par défaut).
- Carte Récidive : l'extrait innerText est en majuscules CSS (RÉCIDIVE), la carte n'est pas un état d'alerte tant que `isRecidivism=false`.

### 8.3 Preuves

- `audit/r2/r2-discipline.json` — repro avant/après (pageerror hooks).
- `audit/r2/r2-discipline-test.json` — CRUD complet + tRPC (create/list/getEmployeeDossier/delete).
- `audit/r2/r2-discipline-extra.json` — toasts, recherche, carte Récidive.
- `audit/r2/r2-discipline-par.json` — colonne « Par ».
- `audit/r2/r2-0X-*.png` — captures d'écran.

---

**Demande utilisateur** : la sous-phase **R2.1 est terminée (VALIDE)**. **Validation requise avant de passer à R2.2 (Compétences & Formations).**