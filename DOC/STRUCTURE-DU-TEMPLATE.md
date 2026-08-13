# STRUCTURE DU TEMPLATE — AtelierOne

> Ce document décrit l'ossature réplicable du projet AtelierOne (généré depuis
> le système de référence libracore-platform, thématique neutralisée).
> Il sert de guide pour créer un NOUVEAU projet à partir de ce template.

## 1. Architecture globale

```
atelierone/
├── apps/
│   └── nextjs/              # Application Next.js 15 (App Router, tRPC, NextAuth v5)
├── packages/
│   ├── api/                 # (interfaces partagées)
│   ├── auth/                # Authentification NextAuth v5 + RH-GOUVERNANCE
│   ├── db/                  # Schéma drizzle + pipeline d'import + déploiement
│   ├── design-system/       # Tokens de design centralisés
│   ├── ui/                  # Composants UI (shadcn-style)
│   └── validators/          # Schémas zod partagés
├── tooling/                 # eslint, tailwind, typescript
├── scripts/                 # deploy.mjs, db-switch.mjs, check-login.mjs, extract…
└── DOC/                     # Guides (déploiement, structure template)
```

## 2. Blocs répliqués (noyau)

| Bloc | Emplacement | Rôle |
|---|---|---|
| Monorepo pnpm + turbo | racine | Workspaces, builds parallèles |
| Auth RH-GOUVERNANCE | `packages/auth` + `apps/nextjs/src/app/(auth)` | Login credentials, rôles, invitation employés, activation par token |
| Multi-tenant | `agences` (sites) + RLS | Isolement des données par agence/site |
| Audit | `audit_logs` + triggers (`schema-extras.sql`) | Traçabilité de chaque action |
| Rôles & permissions | `packages/db/src/security-socle.ts` | 10 rôles, 49 permissions, matrice |
| Schéma socle | `packages/db/src/schema/*` | Tables génériques (ventes, stock, achats, caisse, RH, compta…) |
| Tables métier garage | `vehicules`, `ordres_reparation`, `lignes_ordre_reparation`, `interventions_techniciens`, `contrats_flottes`, `contrats_flotte_vehicules` | Prêtes pour les modules à développer |
| Pipeline d'import | `packages/db/src/import/` | JSONL canonique : unités, catégories, fournisseurs, produits, unités produits, stocks |
| Vérification de conformité | `packages/db/src/verify-deploy.ts` | Contrôle avant/après import (RG) |
| Déploiement | `scripts/deploy.mjs` | backup → schéma → install → conformité → import → vérif |
| Bascule local/cloud | `scripts/db-switch.mjs` | 1 commande |
| Diagnostic login | `scripts/check-login.mjs` | Test login DB ou HTTP |

## 3. Comment créer un NOUVEAU projet (10 étapes)

1. Copier ce répertoire (hors `.git`, `node_modules`, `backups`, `tmp`).
2. `git init` + renommage global :
   - `@atelierone/*` → `@<client>/*` (packages, imports, tsconfig, turbo)
   - `atelierone` → `<client>` ; `AO-` → `<PREFIXE>-` ; `admin@atelierone.cm` → admin client
   - `AtelierOne` → nom du projet ; libellés UI adaptés
3. Adapter `packages/db/src/seed-install.ts` : agences/sites, devise, TVA, préfixes facture.
4. Adapter `packages/db/src/security-socle.ts` : rôles/permissions métier du client.
5. Adapter le thème : `apps/nextjs/src/styles/globals.css` (tokens) + `DESIGN.md`.
6. Créer le dossier d'import du client (`DOC/import-<client>/*.jsonl`) au format canonique.
7. `pnpm install` puis `pnpm db:deploy` (base locale prête).
8. Tester : `scripts/check-login.mjs db …` + `http http://localhost:3000`.
9. Créer le projet Supabase, renseigner `.env.supabase`, `pnpm db:deploy:supabase`, `pnpm db:sync`.
10. Connecter GitHub + Vercel (variables : `AUTH_SECRET`, `DATABASE_URL`, `NEXTAUTH_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 4. Extensions de modules (modèle)

- **Table** : ajouter `packages/db/src/schema/<module>.ts` + export dans `schema/index.ts`.
- **Migration** : `pnpm -F @atelierone/db generate:clean` (régénère la migration complète) puis `pnpm db:deploy`.
- **API** : ajouter un router dans `apps/nextjs/src/server/api/routers/` + l'enregistrer dans `root.ts`.
- **Permission** : ajouter le code dans `security-socle.ts` + l'attribuer dans la matrice.
- **UI** : page sous `apps/nextjs/src/app/(dashboard)/dashboard/<module>/` + entrée de navigation (ModuleGuard).

## 5. Comptes par défaut (installation)

| Compte | Rôle | Mot de passe |
|---|---|---|
| admin@atelierone.cm | superadmin | admin123 |
| directeur@atelierone.cm … | directeur | admin123 |
| chef.atelier@atelierone.cm | chef_atelier | admin123 |
| secretaire@atelierone.cm | secretaire | admin123 |
| magasinier@atelierone.cm | magasinier | admin123 |
| technicien@atelierone.cm | technicien | admin123 |
| comptable@atelierone.cm | comptable | admin123 |
| rh@atelierone.cm | rh | admin123 |
| consultation@atelierone.cm | consultation | admin123 |

> ⚠️ Changer les mots de passe avant mise en production.
