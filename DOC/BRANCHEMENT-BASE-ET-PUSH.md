# Branchement base & push — à lire avant de toucher à la base

> État vérifié le **2026-10-17**, en fin de journée.
> Ce document existe parce que **deux agents travaillent en même temps dans le
> même arbre de travail**. Il ne dit pas ce qu'il faut faire à la place de
> l'autre : il dit ce qui est vrai, et ce qui va casser.

---

## 1. Où en est le dépôt

| | |
|---|---|
| Branche | `main` |
| HEAD local | `ca8418b` |
| `origin/main` | `a9f5920` |
| **Commits locaux non poussés** | **5** |

```
ca8418b  test(360): un onglet sans branche est un onglet invisible
b26eb78  feat(kpi): le taux de reprises existait, calcule juste, et n'etait affiche nulle part
d74a323  feat(kpi): un KPI qui ne dit pas sur combien il repose est une impression
90f8d28  feat(relances): le module se voit enfin, et sur toutes les vues
7a939a7  feat(relances): le module sait relancer, enfin - et il dit qui, quoi, et quand
```

> **Deux agents, un seul arbre.** Le second agent (module stock/outillage)
> modifie en parallèle : `packages/db/drizzle/0015` à `0021`, `schema/stocks.ts`,
> `schema/lots.ts`, `routers/stock*.ts`, `stock-engine.ts`, et quelques
> suppressions de fichiers.
>
> ### ⚠ Règle qui a été inversée une fois
>
> **Ne jamais `git add -A` ni `git add .`** dans cet arbre. Ça embarque le
> travail de l'autre agent, y compris ses migrations — et il est arrivé qu'un
> commit contienne 5 migrations et 17 fichiers dont aucun n'était du ressort de
> son auteur.
>
> **Toujours `git add <chemin> <chemin> …`**, fichier par fichier, puis
> `git diff --cached --name-only` pour vérifier **avant** de committer.

---

## 2. Les trois bases

| Base | Version | Tables | Colonnes | Rôle |
|---|---|---|---|---|
| `atelierone_erp` | **PG 17.6** | 231 | 2 820 | developpement |
| `atelierone_erp_test` | **PG 17.6** | 231 | 2 895 | tests d'intégration |
| **`atelierone_erp` (Neon)** | **PG 18.6** | 228 | 2 759 | **production** |

> **L'écart de version n'est pas anodin.** Local et test sont en 17, la
> production en 18. Une migration qui passe en local peut échouer en
> production. C'est probablement la cause du blocage de push décrite plus bas.

Les URL sont dans `.env`. **Le fichier contient deux lignes `DATABASE_URL`** :
l'une active (locale), l'autre **commentée** (Neon). Ne pas supprimer la ligne
commentée : `scripts/verifier-base-avant-push.mjs` la cherche par ce mécanisme.

---

## 3. Le journal des migrations

`_journal.json` fait foi. État au moment de la rédaction :

```
0000 … 0013   socles d'origine
0014          relances_tracables          ← appliqué en production
0015          parametres_stock            ← NON appliqué en production
0016          stock_agregat               ← idem
0017          stock_quarantaine            ← idem
0018          lots_contenants_ouverture   ← idem
0019          lots_statut_vocabulaire     ← idem
0020          inventaires_localisation    ← idem
0021          deconditionnement_produit_cible  ← pas encore appliqué en local
```

**Production** contient 16 enregistrements dans `drizzle.__drizzle_migrations` :
`0000` à `0013`, plus `0014`.

**Local** en contient 23, et **`0021` reste à appliquer localement**.

### Comment ça marche — et ce qu'il ne faut surtout pas faire

`packages/db/src/migrate-sql.ts` fait tout le travail :

1. crée `drizzle.__drizzle_migrations` si besoin ;
2. lit les `created_at` déjà enregistrés ;
3. applique **uniquement** les entrées du journal absentes de cette liste ;
4. enregistre le résultat, chaque fichier dans **sa** transaction.

C'est donc **idempotent et piloté par le journal**.

> ### ⛔ Jamais `drizzle-kit migrate`
>
> Il rejoue `0000` en premier, suppose une base vide que ces migrations ne
> supportent pas, et se fie au journal — dont les timestamps furent non
> croissants jusqu'à `0011`, ce qui lui a fait **ignorer six migrations en
> silence**.
>
> **Utiliser `migrate:sql`**, via `pnpm db:sync`.

### Règles d'écriture d'une migration

- **Idempotente** : `IF NOT EXISTS`, `DROP … IF EXISTS` avant `CREATE`, ou `DO $$`.
- **L'ordre n'est pas une préférence, il est la migration** : la contrainte
  doit exister *avant* d'écrire les lignes qu'elle admet. L'erreur du `0013`
  (écrire `accidente` dans une colonne qui l'interdit encore) a été faite puis
  comprise.
- Seules `0000`–`0003` échappent à l'idempotence — elles créent le socle.

---

## 4. Le verrou de cohérence avant push

### Installation — **une fois par clone**

```bash
pnpm hooks:install
```

L'installateur pointe `core.hooksPath` sur `scripts/git-hooks/`, **versionné**,
et non sur `.git/hooks`. Deux raisons : `.git/hooks` disparaît au premier clone,
et sous Windows un hook écrit par PowerShell n'a pas le bit d'exécutable — git
le saute **silencieusement**.

> Un hook maison déjà présent n'est pas écrasé : l'installateur le signale.
> Vérifier qu'un hook tourne : `GIT_TRACE=1 git push …` — un push qui
> n'affiche aucune invocation de hook ne l'a pas exécuté.

### Ce que fait le verrou

`scripts/git-hooks/pre-push` → `scripts/verifier-base-avant-push.mjs` :

1. lit l'URL **Neon** dans `.env` (la ligne commentée) ;
2. lance `pnpm -F @atelierone/db db:sync` avec `DATABASE_URL=<neon>` et
   `FORCE=1` — donc **les migrations du journal s'appliquent en production** ;
3. lance `pnpm db:check` qui compare local ↔ Neon ;
4. **annule le push** si la dérive est bloquante.

Contournement : `NO_VERROU_BASE=1 git push origin main` — **en connaissance de
cause uniquement**.

### Pourquoi un hook local et pas une étape de CI

La CI ne peut pas écrire en production sans déposer les identifiants Neon dans
les secrets GitHub — ce qui expose l'écriture en production à tout le dépôt et
à toutes ses dépendances. Le hook échoue **avant** que le code n'arrive.

Comptez **~2 min par push vers `main`**. Une branche de travail sort aussitôt.

---

## 5. ⚠ Pourquoi le push est actuellement bloqué

État au 2026-10-17 :

```
ECART BLOQUANT : 79 objet(s) de schéma présents dans A (local)
                 et absents de B (production)
```

Ce sont **uniquement des objets du module stock** :

- **3 tables** : `lots_contenants`, `parametres_stock`, `stock_agregat`
- **19 colonnes**
- **4 index**

Le référentiel et les `role_permissions` sont **strictement identiques**. Ce ne
sont donc pas des données manquantes : ce sont des objets de schéma.

### Deux hypothèses — à trancher par qui push

1. **Le `db:sync` sur Neon échoue en cours de route.** Il s'exécute avant le
   `db:check`, et s'il s'arrêtait sur une migration stock, la production resterait
   en arrière — exactement ce qu'on observe. Cause probable : **PG 18 en
   production, PG 17 en local**. Une migration qui passe en local peut être
   refusée par la 18.
2. Le push a été abandonné avant que le hook ait pu s'exécuter.

> **Non tranché.** Je ne l'ai pas vérifié : cela consiste à écrire en
> production. C'est une décision du chantier stock.

### Ce qu'il ne faut **pas** faire

- **Pas de `NO_VERROU_BASE=1` pour « dépanner ».** Le push à contournement
  ferait hériter la base locale d'un schéma que la production ne peut pas
  exécuter — et le prochain agent perdrait une heure à chercher pourquoi.
- **Pas de `db:sync:reset`** (`DROP`/`CREATE`) sur une base qui contient de la
  donnée. C'est pour reconstruire une base locale vierge.

---

## 6. Règles de connexion

| Sujet | Règle |
|---|---|
| **Pooler Neon** | ouvre les sessions avec `search_path` **vide**. Qualifier `public.`, sinon `relation does not exist` sur une base parfaitement saine. |
| **Endpoint direct** | `search_path = "$user", public` — c'est celui de l'application. |
| **SSL** | Neon l'exige. **Aucun script ne peut forcer `ssl: false`.** Utiliser `sslPourUrl()` de `env-guard.ts`, aligné sur `packages/db/src/client.ts`. |
| **Base des tests** | toujours `atelierone_erp_test`. `src/test/setup.ts` **refuse toute base distante** — garde-fou à ne jamais retirer. |

---

## 7. Règles qui ne se négocient pas

1. **Toute nouvelle permission se définit dans `security-socle.ts`**, jamais dans
   un script de migration. Deux listes concurrentes pour la même règle ont déjà
   produit une dérive permanente entre local et production.
2. **Toute nouvelle migration est idempotente** (§ 3).
3. **`pnpm db:check` doit renvoyer `PARFAIT`**, ou ne signaler que des écarts
   de données d'exploitation attendus. `audit_logs` diffère toujours : chaque
   base a son propre historique.
4. **Ne pas copier une logique serveur dans un composant client.** Tout ce
   qu'un composant client importe vit dans `apps/nextjs/src/lib/` et n'importe
   ni la base ni quoi que ce soit de serveur. `import type` vers un module
   serveur est sans danger : il est effacé à la compilation.

### Permissions déjà déclarées pour le module stock

`stock.consulter`, `stock.modifier`, `stock.inventaire`, `stock.utiliser` sont
**déjà** dans le socle. Ne pas les redéclarer ailleurs.

---

## 8. Vérifier avant de committer

`tsc` **ne suffit pas**. Il ne connaît pas la frontière client/serveur : un
composant `"use client"` peut importer sans broncher un module qui tire
`@atelierone/db` → `postgres` → `net`, `tls`, `fs`, `perf_hooks`. Le build Vercel
échoue alors sur `Module not found: Can't resolve 'net'` — tests et type-check
étant verts.

```bash
pnpm --filter @atelierone/nextjs exec vitest run
pnpm --filter @atelierone/nextjs exec tsc --noEmit -p tsconfig.json
cd apps/nextjs && pnpm exec next build     # ← le seul qui voie la frontière
```

### État de la qualité — au 2026-10-17

| Constat | Valeur |
|---|---|
| Tests | **1110 / 1110**, 85 fichiers |
| Erreurs TypeScript | **344** |
| `ignoreBuildErrors` | **`true`** dans `apps/nextjs/next.config.js` |

> **`ignoreBuildErrors: true` signifie que le build ne vérifie AUCUN type.**
> Tant qu'il est là, un build vert ne dit rien de la correction du typage. Les
> 344 erreurs montent avec les apports du module stock.

### Les tests d'intégration sont instables

Sur trois exécutions consécutives le 2026-10-17, **une a échoué** sans
changement de code. Cause : **la base de test est partagée entre fichiers**.
Les fichiers sont sérialisés (`fileParallelism: false`), donc il n'y a pas de
recouvrement — mais les résidus restent.

> Deux exécutions vertes ne sont **pas** une garantie. Il a été erroné de répéter
> les exécutions jusqu'à obtenir deux verts : c'est exactement l'erreur que le
> plan documente. La parade — un schéma par fichier — est ouverte.

---

## 9. Sauvegardes — différées explicitement

À ne pas rouvrir sans demande, mais à savoir :

- **Une branche Neon n'est pas une sauvegarde.** C'est un environnement.
- Le filet réel est **PITR**.
- Neon est en **PG 18.6** ; le `pg_dump` local est en **PG 17.6** — un
  dump local ne restaure pas proprement une base 18.
- Les identifiants Neon et S3 ont été exposés dans une conversation : **rotation
  à faire** avant toute automatisation durable.

---

## 10. Ce qui est ouvert, en une ligne chacune

| Sujet | État |
|---|---|
| Push des 5 commits locaux | **bloqué** par la dérive stock |
| Application de `0015`–`0021` en production | **non faite**, et sa faisabilité sur PG 18 n'est pas établie |
| `kpi_cibles` : `UNIQUE (agence_id, code)` | manquant — invariant tenu par la seule discipline du script |
| Rendu React en test (`jsdom`) | absent —installer les dépendances modifierait l'arbre pendant que l'autre agent travaille |
| `ignoreBuildErrors: true` | à retirer après la purge des 344 erreurs |
| Diagnostic `VALIDE` | définitif, sans issue — **décision métier en attente** |

---

## En une phrase

> **La base locale va plus loin que la production uniquement à cause du module
> stock ; tant que ces migrations ne sont pas validées sur PostgreSQL 18, le
> push reste fermé — et c'est le verrou qui fait son travail, pas une panne.**