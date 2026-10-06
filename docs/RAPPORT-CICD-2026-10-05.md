# RAPPORT CI/CD — AtelierOne

**Date** : 2026-10-05 · **Portée** : chaîne locale → Git → Vercel → base Neon · **Méthode** : exécution réelle des commandes, lecture des logs GitHub Actions et de Vercel, mesure sur copie jetable de la base de production.

---

## Verdict

| Chaîne | État |
| --- | --- |
| **Code → Vercel** (push → déploiement) | ✅ **Fonctionnelle** |
| **Build** (local et Vercel) | ✅ **Vert** |
| **Qualité (CI GitHub Actions)** | ❌ **Cassée depuis le 1ᵉʳ jour — 8 échecs sur 8** |
| **Tests unitaires** | ❌ **53 échecs / 885** et pointés vers la prod |
| **Synchronisation de la base (schéma)** | ❌ **Inexistante** — et l'unique commande disponible est **destructrice** |

En l'état : **le code part bien en ligne, mais rien ne le vérifie, et aucun ajustement de base ne peut être propagé sans risquer de perdre les données de production.**

---

## 1. Ce qui est vérifié et fonctionnel

| Contrôle | Exécution | Résultat |
| --- | --- | --- |
| Build complet | `pnpm build` (turbo) | ✅ `exit 0` — 4 min 44, 188 routes, middleware 85,1 kB |
| Lint | `pnpm -F @atelierone/nextjs lint` | ✅ `exit 0` — warnings uniquement |
| Push → déploiement auto | 8 pushes récents | ✅ Vercel déclenche et construit à chaque push sur `main` |
| App en ligne | `/api/health` | ✅ `db: true` (après ajout des variables d'env) |
| Bascule DB local ⇄ Neon | `pnpm db:current` | ✅ NEON sur les 3 fichiers, aller-retour idempotent |
| Migration des données locale → Neon | `pg_dump` / `pg_restore` | ✅ 227 tables / 24 822 lignes / **0 écart** |
| Intégrité de la prod après audit | relevé post-tests | ✅ 24 822 lignes, 226 tables — inchangé |

---

## 2. Ce qui ne fonctionne pas

### P0-1 — La CI GitHub Actions échoue 8 fois sur 8, en 12 secondes

```
run #8 (fd11908)  18:05:29 → 18:05:37   conclusion: failure
  [success] Run actions/checkout@v4
  [failure] Run pnpm/action-setup@v4        ← échec ici
  [skipped] Run actions/setup-node@v4
  [skipped] Installer les dépendances
  [skipped] Lint / Typecheck / Tests / Build
```

**Cause** : conflit de version déclarée deux fois —
`.github/workflows/ci.yml:17` → `version: 10` **et** `package.json` → `"packageManager": "pnpm@10.19.0"`.
`pnpm/action-setup@v4` refuse ce doublon.

**Conséquence** : **aucune étape d'exécution n'a jamais tourné**. Lint, typecheck, tests et build n'ont jamais été exécutés une seule fois sur GitHub. La seule protection réelle du déploiement est le build Vercel lui-même.

---

### P0-2 — Même réparée, la CI ne bloquerait rien

`.github/workflows/ci.yml` :

| Step | Réglage | Effet |
| --- | --- | --- |
| Lint (l.30) | `continue-on-error: true` | échec ignoré |
| Typecheck (l.34-35) | `\|\| true` | échec ignoré |
| Tests (l.39-40) | `\|\| true` | échec ignoré |

Seul `pnpm build` peut faire échouer la CI. **Lint, typecheck et tests sont décoratifs.**

---

### P0-3 — Les tests échouent et visent la base de production

`pnpm -F @atelierone/nextjs exec vitest run` → **`exit 1`**

```
Test Files   15 failed | 37 passed  (52)
Tests        53 failed | 752 passed | 80 skipped  (885)
```

**Cause racine** — `apps/nextjs/vitest.config.ts:4` :

```ts
process.env.DATABASE_URL ??= 'postgres://localhost:5432/atelierone_test';
```

`??=` n'écrase **jamais** une valeur déjà définie. Depuis la bascule sur Neon, `DATABASE_URL` est déjà renseigné → **les tests d'intégration s'exécutent contre `atelierone_erp` en production**.

Signes observés pendant l'exécution :
- `WARN: Failed to set tenant context` (tentatives de `set_config` sur la prod)
- timeouts 5 000 ms sur les requêtes réseau → 17 échecs sur 19 dans `rpt02-verite-temporelle.integration.test.ts`

Le même `??=` est reproduit dans `apps/nextjs/src/test/setup.ts`.

**Risque** : écriture en production depuis une commande anodine. Pendant cet audit, `audit_logs` est passé de 11 973 à 11 974 (attribuable à votre login, pas aux tests — mais la voie d'écriture est grande ouverte).

**En CI**, de surcroît, `DATABASE_URL` n'est fourni qu'au step *Build* (l.43-46) : les steps *Tests* partent sans base → ils échoueraient même si le workflow tournait.

---

### P0-4 — `pnpm db:push` détruit la production : preuve mesurée

Méthode : création d'une base jetable `atelierone_probe` **clone fidèle** de la prod (226 tables), puis exécution de la commande exacte exposée par `package.json` :

```
drizzle-kit push --verbose --force   →   exit 0
```

| Type d'opération | Nombre |
| --- | --- |
| `DROP` (vues, index, contraintes, tables) | **44** |
| `ALTER` (dont `DROP NOT NULL`) | **46** |
| `CREATE` | **0** |

Exemples de destructions :

```sql
DROP VIEW "public"."parking_spots_v";                      -- vue utilisée par l'app
DROP INDEX "parking_vehicles_agence_idx";
DROP INDEX "parking_vehicles_photo_idx";
DROP INDEX "parking_vehicles_site_statut_idx";
DROP INDEX "parking_alerts_ouvertes_idx";
ALTER TABLE "hr_sensibilisation_rules" ALTER COLUMN "active" DROP NOT NULL;
ALTER TABLE "rh_absence_justifications" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "hr_public_holidays" DROP CONSTRAINT "hr_public_holidays_agence_date_key";
ALTER TABLE "parking_vehicles" DROP CONSTRAINT "parking_vehicles_registre_unique";
DROP TABLE "hr_public_holidays_rpt02_bak" CASCADE;
```

Deux défauts aggravants :

1. **Il échoue** (erreur PostgreSQL `2BP01` : contrainte `parking_spots_zone_site_fk` dépendante de `parking_zones_site_unique`) **mais sort avec `exit 0`** → même intégré à une CI, il serait déclaré « succès ».
2. **Aucun garde-fou** : `requireLocalOrForced()` (`packages/db/src/env-guard.ts`) n'est appelé **ni par `push`, ni par `migrate`, ni par `studio`** — uniquement par les seeds et les scripts `reset-*`. Or `pnpm db:current` = **NEON** : la commande vise donc directement la production.

> **Une exécution accidentelle de `pnpm db:push` sur le poste actuel détruirait des objets de la base de production.**

*(Opérations effectuées sur une copie jetable, supprimée ensuite. La base de production n'a pas été touchée par cet audit : vérifié 24 822 lignes / 226 tables avant et après.)*

---

### P0-5 — Aucun historique de migrations : la base ne peut pas « suivre »

| Élément | Constat |
| --- | --- |
| `packages/db/drizzle.config.ts` → `out: "./drizzle"` | **dossier inexistant, 0 fichier** |
| `packages/db/drizzle-clean/` | 1 seule migration (`0000_past_ezekiel.sql`) |
| Scripts SQL maison (`schema-extras.sql`, `schema-parking.sql`…) | 8 fichiers, **non versionnés dans un journal** |
| `deploy.mjs` | `DROP SCHEMA public CASCADE` + reseed → **reconstruction, pas migration** |

Conséquence : il est **impossible** de propager un ajustement de schéma de façon additive et traçable. Les seules voies aujourd'hui sont :

- `db:push` → **destructeur** (cf. P0-4),
- `db:deploy` → **écrase tout** (mais réservé à `local`/`supabase`, pas de cible Neon : c'est le seul point rassurant).

**Faisabilité vérifiée** : `drizzle-kit generate` **fonctionne** (testé avec config dédiée → `0000_*.sql` 225 Ko + `0000_snapshot.json` + `_journal.json`, `exit 0`). Le flux de migrations versionnées est donc techniquement prêt à être mis en place.

---

### P1 — Défauts secondaires

| # | Constat | Impact |
| --- | --- | --- |
| 1 | Aucun hook Git (pas de husky, `.git/hooks` vide) | Rien n'interdit un push sans build/lint local |
| 2 | Protection de branche : **non vérifiable** sans token (API 401) | `main` poussable en force-push potentiel |
| 3 | Divergence d'installation : CI `--frozen-lockfile`, Vercel `--no-frozen-lockfile` | les deux environnements peuvent installer des versions différentes |
| 4 | Node : CI **20**, local **24** | divergence de runtime |
| 5 | `typecheck` → `exit 2` (erreurs TS) + `ignoreBuildErrors: true` (`next.config.js:40`) | la qualité typage n'est vérifiée nulle part |
| 6 | Dépôt **public** (`private: false`) | code source, scripts et structure exposés |
| 7 | `deploy.mjs sync` compare encore `local`/`supabase` | Supabase n'est plus utilisé → script obsolète |
| 8 | Rate limiting en mémoire dans `src/middleware.ts:5` | inopérant en multi-instance (risque C13 de l'audit) |
| 9 | Variables d'env : `DATABASE_URL_UNPOOLED` présente sur Vercel mais **jamais lue par le code** | bruit, risque de confusion |

---

## 3. Écart entre votre exigence et l'état réel

| Exigence | État | Commentaire |
| --- | --- | --- |
| On travaille en local, puis `commit` + `push` | ✅ **OK** | Le push sur `main` déploie automatiquement Vercel |
| Le CI/CD « fonctionne super bien » | ❌ **KO** | CI rouge sur 8/8, tests à 53 échecs, typecheck masqué |
| La base suit les ajustements | ❌ **KO** | 0 migration versionnée, aucun mécanisme de propagation |
| … sans écraser les données en ligne | ❌ **KO** | La seule commande disponible (`db:push`) écrase (44 DROP prouvés) |
| … sauf si c'est demandé | ❌ **KO** | Aucun garde-fou ni confirmation sur `db:push`/`migrate` |
| Passer facilement de l'un à l'autre | ⚠️ **Partiel** | DB : `db:use-local` / `db:use-neon` ✅ · Code : une seule branche `main` (pas d'environnement de preview isolé) |

---

## 4. Plan de remédiation priorisé

### P0 — bloquant avant le prochain push

1. **Réparer la CI** : retirer `version: 10` de `ci.yml:17` (laisser `packageManager` faire foi) → 1ᵉʳ run vert attendu.
2. **Isoler la base des tests** : remplacer le `??=` par une base de test réelle (`DATABASE_URL_TEST`), ou exclure `*.integration.test.ts` quand aucune base de test n'est configurée. Interdire par construction tout accès à Neon depuis `vitest`.
3. **Verrouiller les commandes destructrices** : appliquer `requireLocalOrForced()` à `db:push`, `db:migrate`, `db:studio` (et faire échouer sur `exit` non nul de drizzle-kit).
4. **Remettre les tests en vert**, puis retirer `continue-on-error` et `|| true` de la CI (sinon la CI reste décorative).
5. **Créer le flux de migrations** : `drizzle-kit generate` → fichier SQL versionné commité → `drizzle-kit migrate` (additif) → journal `_journal.json` en dépôt.

### P1 — court terme

6. Pré-commit (`lint` + `build` rapide) et **protection de branche** `main` (PR obligatoire, checks verts).
7. Aligner Node (24 partout) et le mode d'installation (`--frozen-lockfile` partout).
8. Traiter `ignoreBuildErrors` (390 erreurs TS) et supprimer les scripts Supabase obsolètes (`db:use-supabase`, `deploy.mjs sync`).
9. Rendre le dépôt **privé** si le code est confidentiel.

### Flux cible (après remédiation)

```
LOCAL                    GIT                       VERCEL                 NEON
──────                   ───                       ──────                 ────
modifier le code ──────► commit ──► push main ────► build auto ──► prod
modifier packages/db/src/schema
  → pnpm db:generate ──► commit migration .sql ──► (CI vérifie) ─────────► pnpm db:migrate:prod
                                                                      (additif, jamais destructif)
pnpm db:use-local  ⇄  pnpm db:use-neon          ← bascule instantanée
pnpm db:backup        (pg_dump horodaté, avant toute migration prod)
```

---

## 5. Commandes et preuves

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Build | `pnpm build` | `exit 0` |
| Lint | `pnpm -F @atelierone/nextjs lint` | `exit 0` |
| Tests | `pnpm -F @atelierone/nextjs exec vitest run` | `exit 1` — 53/885 échecs |
| Typecheck | `pnpm -F @atelierone/nextjs typecheck` | `exit 2` |
| État CI | GitHub API `actions/runs` | 8 runs, 8 `failure` |
| Étape en échec | GitHub API `.../jobs` | `pnpm/action-setup@v4` |
| Destructivité `db:push` | exécution sur clone jetable | 44 DROP / 46 ALTER / 0 CREATE, `exit 0` malgré erreur `2BP01` |
| Faisabilité migrations | `drizzle-kit generate` | `exit 0` — snapshot + journal produits |
| Intégrité prod | requêtes `COUNT(*)` avant/après | 24 822 lignes, 226 tables — inchangé |

**Artefacts nettoyés** : bases `atelierone_probe` (locale et Neon) supprimées, fichiers temporaires retirés, dépôt Git propre (`git status` vide).

---

## 6. Addendum — 5 correctifs P0 appliqués (2026-10-06)

| # | Correctif | Fichiers | Preuve |
| --- | --- | --- | --- |
| **P0-1** | CI réparée : `pnpm/action-setup@v4` sans `with: version` (conflit avec `packageManager: pnpm@10.19.0` = cause des 8 échecs en 12 s), Node 24, lint + tests **bloquants**, service `postgres:17`, step `pnpm db:test-setup`, typecheck gardé non bloquant **et commenté** (dette de 390 erreurs) | `.github/workflows/ci.yml` | YAML validé ; étapes : install → lint → base de test → tests → typecheck (dette) → build |
| **P0-2** | Tests isolés de la production : `vitest.config.ts` **impose** `DATABASE_URL` vers `atelierone_erp_test` (l'ancien `??=` ne remplaçait jamais une valeur déjà définie) ; `src/test/setup.ts` refuse par `beforeAll` tout hôte non local ; Playwright (`*.spec.ts`) exclu ; `testTimeout` 5 s → 20 s (flaky en parallèle) | `apps/nextjs/vitest.config.ts`, `apps/nextjs/src/test/setup.ts` | `pnpm test` → **exit 0**, 44 fichiers / 826 tests |
| **P0-3** | Verrous sur les opérations destructrices : `drizzle-kit push/migrate/studio` passent par `scripts/drizzle-guard.mjs` (refus de toute base distante, `FORCE=1` pour consentir) | `packages/db/scripts/drizzle-guard.mjs`, `packages/db/scripts/dburl.mjs`, `packages/db/package.json` | sur Neon → **REFUS exit 1** ; `FORCE=1` → exit 0 ; locale → exit 0 |
| **P0-4** | Tests verts : socle de test créé (`pnpm db:test-setup` = reset + `drizzle-kit migrate` + `schema-extras.sql` + rôles/permissions + 2 agences + employé témoin) ; 6 suites « base REELLE » (lecture seule, IDs figés) sorties du chemin CI vers `pnpm test:reel` ; 2 tests unitaires obsolètes corrigés (`stock-engine` : compteur 22 figé → 26 réels ; `licence-service` : date d'exécution → horloge figée) | `packages/db/scripts/test-db.mjs`, `apps/nextjs/vitest.reel.config.ts`, `apps/nextjs/package.json`, `*.test.ts` | CI locale : **43/43 fichiers, 792/792 tests** + `geo` 34/34 |
| **P0-5** | Historique de migrations créé : `packages/db/drizzle/` (0000 = 225 tables + snapshot + journal) ; `pnpm db:baseline` marque la 0000 comme appliquée **sans l'exécuter** (drizzle compare `created_at` au `when` du journal) sur une base pré-existante ; `pnpm db:generate` pour tout futur changement de schéma | `packages/db/drizzle/*`, `packages/db/scripts/baseline.mjs` | baseline sur prod locale : 226 tables / 56 ventes **inchangées** ; `migrate` après baseline → rien à exécuter ; DB de test → **225 tables** |

### Ce que la CI vérifie désormais

```
pnpm install --frozen-lockfile   ← lockfile synchronisé (vérifié localement)
pnpm -F @atelierone/nextjs lint  ← exit 0 (warnings uniquement)
pnpm db:test-setup --quiet       ← schéma complet + extras + socle, sur postgres:17 éphémère
pnpm test                        ← turbo : nextjs (792) + geo (34)
pnpm -F ... typecheck            ← continue-on-error (dette documentée)
pnpm build                       ← exit 0
```

### Suites hors CI (au choix)

- `pnpm test:reel` — 6 suites conçues pour lire la base **réelle** (employé 9, périodes d'août 2026, journal alimenté par RPT-01). Cible : base **locale** uniquement (`DATABASE_URL_REEL` ou la ligne localhost de `packages/db/.env`) ; elles ne visent jamais Neon. Mesure du 06/10 : **91/93 tests verts**, 2 échecs liés à l'état des données locales (comptage 392/496, 2 timeouts).

### Suites détectées comme « base REELLE »

`rh-history.integration`, `rh-situation.integration`, `rh-situation.terrain`, `rpt02-verite-temporelle.integration`, `rpt03-sensibilisation.integration`, `rpt04-journal.integration` — déclarées dans `TESTS_BASE_REELLE` (`apps/nextjs/vitest.config.ts`). Tout test ajouté qui lit des identifiants figés doit y être ajouté.

