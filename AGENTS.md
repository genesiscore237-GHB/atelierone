## Base de données : une seule chaîne, sans intervention manuelle

**La production est Neon**, base `atelierone_erp` (`neondb` est vide). Ce n'est
pas Supabase : les scripts qui cherchent `pooler.supabase.com` ne visent rien.

```
pnpm db:sync      # migrations + socle RBAC + données dérivées du parking
pnpm db:check     # compare la base courante à la référence et affiche la dérive
```

`db:sync` enchaîne cinq étapes **dans un ordre figé**, chacune idempotente :
migrations SQL → socle sécurité → clients parking → véhicules parking →
rattachement. L'ordre n'est pas décoratif : le socle applied avant les
migrations échoue sur une colonne absente, la reconstruction des données avant
les migrations échoue sur `immatriculation NOT NULL`.

**Règles non négociables**

- **Jamais `drizzle-kit migrate`.** Il rejoue `0000` en premier, suppose une base
  vide que ces migrations ne supportent pas, et se fie au journal — dont les
  timestamps furent non croissants jusqu'à `0011`, ce qui le faisait ignorer six
  migrations en silence. Utiliser `migrate:sql`, qui lit l'ordre du journal,
  applique chaque fichier dans sa transaction et **enregistre** le résultat.
- **Toute nouvelle permission se définit dans `security-socle.ts`**, jamais dans
  un script de migration. Deux listes concurrentes pour la même règle ont déjà
  produit une dérive permanente entre le local et la production.
- **Toute nouvelle migration SQL doit être idempotente** (`IF NOT EXISTS`,
  `DROP … IF EXISTS` avant `CREATE`, ou `DO $$`). Seules `0000`–`0003` font
  exception : elles créent le socle et ne sont pas rejouables par construction —
  `migrate:sql` les marque alors comme déjà appliquées, et le signale.
- **Ne jamais exécuter `db:sync:reset`** sur une base contenant de la donnée.
  Cette commande réinitialise le schéma (`DROP`/`CREATE`). Elle existe pour
  reconstruire une base locale vierge.

**Avant de conclure qu'un travail est terminé**, `pnpm db:check` doit renvoyer
`PARFAIT` ou ne signaler que des écarts de données d'exploitation attendus.
`audit_logs` diffère toujours : chaque base a son propre historique.

**Écarts de production à connaître**

- L'endpoint **pooler** de Neon ouvre les sessions avec un `search_path` vide ;
  l'endpoint **direct** (celui de l'application) a `search_path = "$user", public`.
  Un script branché sur le pooler doit qualifier `public.`, sinon il échoue en
  `relation does not exist` sur une base parfaitement saine.
- Aucun script ne peut forcer `ssl: false` : Neon l'exige. Utiliser `sslPourUrl()`
  de `env-guard.ts`, qui doit rester aligné avec `packages/db/src/client.ts`.
- Les tests d'intégration tournent sur la base **locale** (`atelierone_erp_test`).
  `src/test/setup.ts` refuse toute base distante — garde-fou à ne jamais retirer.

## Verrou de cohérence base (push vers `main`)

La garantie « après un push et la migration, la production est le même que le
local » ne tient que si elle est **vérifiée au moment du push**. Un contrôle
postérieur ne la garantit qu'au moment où l'on pense à le lancer — donc
jamais.

Un hook `pre-push` fait cette vérification **avant** que le code n'arrive :

```bash
pnpm hooks:install        # une fois par clone — installe scripts/git-hooks/
```

L'installateur pointe `core.hooksPath` sur `scripts/git-hooks/`, **versionné**,
plutôt que sur `.git/hooks`. Deux raisons : `.git/hooks` disparaît au premier
clone (l'équipe croirait la garantie intacte alors qu'elle n'existe que sur une
machine), et sur Windows un hook écrit par PowerShell n'a pas le bit
d'exécutable — git le saute **silencieusement**. Vérifiable par `GIT_TRACE=1` :
un push qui n'affiche aucune invocation de hook ne l'a pas exécuté.

Sur un push visant `main`, le hook enchaîne `db:sync` (additif et idempotent)
puis `db:check` contre la production. **Une dérive bloquante annule le push.**
Comptez ~2 min sur un push vers `main` ; une branche de travail sort aussitôt.

- **Pousser une branche de travail ne touche rien** : le hook sort aussitôt.
- **Un hook maison déjà présent n'est pas écrasé** : l'installateur le signale
  et laisse la main.
- **Contournement** : `NO_VERROU_BASE=1 git push origin main` — à n'utiliser
  qu'en connaissance de cause.

Pourquoi un hook local plutôt qu'une étape de CI : la CI ne peut écrire en
production sans déposer les identifiants Neon dans les secrets GitHub, ce qui
expose l'écriture en production à tout le dépôt et à toutes ses dépendances.
Le hook échoue avant le push : du code qui refuse d'arriver est plus sûr que du
code qu'il faut rattraper ensuite.

## Vérification avant commit (obligatoire)

`tsc` **ne suffit pas**. Il ne connaît pas la frontière client/serveur : un composant `"use client"` peut importer sans broncher un module qui tire `@atelierone/db` → `postgres` → `net`, `tls`, `fs`, `perf_hooks`. Le build Vercel échoue alors sur `Module not found: Can't resolve 'net'`, alors que tous les tests et le type-check sont verts.

Avant chaque commit qui touche une page ou un composant :

```
pnpm --filter @atelierone/nextjs exec vitest run   # suite complète
pnpm --filter @atelierone/nextjs exec tsc --noEmit -p tsconfig.json
cd apps/nextjs && pnpm exec next build             # ← le seul qui voie la frontière
```

**Règle de module** : tout ce qu'un composant client doit importer vit dans `apps/nextjs/src/lib/` et n'importe **ni la base, ni quoi que ce soit de serveur**. La logique partagée est dupliquée entre client et serveur uniquement si elle est **pure** — c'est le cas de `~/server/lib/atelier-service.ts` et de `~/lib/outillage.ts`, importés sans risque par des composants client.

`import type` vers un module serveur est sans danger : il est effacé à la compilation.

## Plan de travail (source de vérité)

Le cahier des charges, le planning d'avancement et les décisions actées de l'**harmonisation du véhicule** sont tenus dans `docs/HARMONISATION-VEHICULE.md` :
- Le consulter **en premier** avant toute tâche sur les modules véhicule / parking / atelier / OR.
- Le **mettre à jour** à chaque jalon (fin de lot, décision produit, blocage, nouveau risque) — c'est la seule source durable du plan (pas dans l'historique de conversation).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Règle UX minimale (obligatoire pour toute interface)

Toute page ou fonctionnalité livrée doit satisfaire le standard UX suivant, faute de quoi elle est considérée comme « non exploitable » :

1. **Recherche / filtrage** : toute liste (caisses, utilisateurs, produits, factures, etc.) doit proposer une recherche par texte dès qu'elle peut dépasser ~10 éléments.
2. **Validation explicite et persistante** : chaque modification doit passer par un bouton type **Enregistrer / Valider** qui écrit réellement en backend et appelle `invalidate()` sur les queries concernées. Interdit de laisser des champs modifiables sans bouton de soumission.
3. **Feedback** : toute action réussie ou échouée affiche un `toast()` (sonner) — jamais de `alert()`/`confirm()` brut (confirmer via un état React propre est toléré).
4. **États** : gérer loading (skeleton ou spinner), empty state et erreur serveur affichée.
5. **Désactivation / suppression** : toute action destructive doit être confirmée et reflétée immédiatement dans la liste parente.
6. **Permissions sincères** : l'interface doit masquer ou désactiver les boutons dont l'utilisateur n'a pas la permission (vérifiée serveur), en cohérence avec les endpoints TRPC, avec un message clair en cas de refus.

Cette règle s'applique à toutes les modifications futures, notamment les modules Caisse, POS, Settings et toute nouvelle interface.
