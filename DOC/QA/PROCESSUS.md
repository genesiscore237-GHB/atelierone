# PROCESSUS DE DÉVELOPPEMENT — ATELIERONE

> Règle d'or : **non-régression d'abord, une tâche à la fois, validation avant la suivante.**

## 1. Non-régression (obligatoire avant ET après chaque tâche)

Script : `apps/nextjs/scripts/non-regression.cjs` (Playwright + Chrome local)

```powershell
node apps/nextjs/scripts/non-regression.cjs
```

Vérifie :
1. Login `admin@gpj.cm` fonctionne
2. Bureau : 8 domaines visibles, pas de sidebar
3. Module RH : sidebar pilotage + hub
4. Breadcrumb + onglets sur les sous-pages
5. Utilisateurs & Rôles : sous-onglets Rôles / Matrice / Connexions
6. Pilotage : le même menu en liste
7. Toggle navigation (masquer / réafficher)
8. Mobile : drawer + bottom nav (5 items)

Prérequis : serveur dev lancé (`npm run dev`), base locale, mot de passe admin
(variable `AO_PASSWORD` si changé).

## 2. Cycle de travail standard

```
1. Écrire / mettre à jour le cahier des charges de la tâche (docs)
2. Implémenter (une tâche = une brique testable)
3. Tester la fonctionnalité (navigateur réel)
4. Lancer la non-régression → tout vert
5. Mettre à jour le document de suivi (statut + tests + notes)
6. Passer à la tâche suivante
```

## 2bis. Test d'intégration complet du module RH

`apps/nextjs/scripts/test-workflow-complet.cjs` — scénario E2E réel (5 employés, août 2026) :
RH-00 paramétrage → RH-01 fiches → RH-02 présences (HS autorisées/non, absences) → RH-03 congés
(solde, marquage) → clôture → RH-05 évaluations + prime suggérée → RH-04 paie (brut, CNPS, net
imposable, IRPP barème, net) → paiements MoMo/OM → PDF. 33 vérifications calculées à la main.

```powershell
node apps/nextjs/scripts/test-workflow-complet.cjs
```

Prérequis : base nettoyée (DELETE des tables hr/payroll/attendance + employes salaires NULL)
— le script est idempotent par nettoyage préalable ; exécuter une seule fois par état de base.

## 3. Règles de la charte (rappel)

- Bento réservé au Bureau ; listes en lignes partout ailleurs
- Breadcrumb `Bureau > Domaine > Module` + sous-onglets via `ModuleShell`
- Navigation déclarée dans `src/lib/app-nav.tsx` (jamais en dur)
- États loading / empty / erreur obligatoires
- Toasts + validation explicite (bouton Enregistrer/Valider), jamais d'alert()
- Permissions : masquer/désactiver selon les rôles, backend = autorité
- Aucune valeur métier codée en dur : paramétrable en base
