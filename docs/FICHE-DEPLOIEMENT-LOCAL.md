# FICHE DE DÉPLOIEMENT LOCAL — AtelierOne

> **Date d'exécution** : 13/10/2026
> **Poste** : Windows (machine « FAYA COMPUTER »), exécution réelle de toutes les étapes.
> **Résultat** : l'application est **déployée et fonctionnelle en local**, en mode **production** (`next start`), sur `http://localhost:3000`, connectée à la base **PostgreSQL locale**.

---

## 0. Résumé exécutif

| Élément | Valeur |
|---|---|
| URL locale | `http://localhost:3000` (réseau LAN : `http://192.168.100.19:3000`) |
| Mode déployé | **Production** (`pnpm build` + `next start`), démarrage en ~1,8 s |
| Base de données | **PostgreSQL 17 local**, base `atelierone_erp` (227 tables, 11 utilisateurs, 319 produits, 2 agences) — **données conservées** |
| Cible DATABASE_URL | **LOCAL** (bascule effectuée depuis NEON, réversible en 1 commande) |
| Compte de vérification | `admin@gpj.cm` / `admin123` (rôle : superadmin) — login de bout en bout **validé** |
| Sauvegarde préalable | `backups/atelierone_erp_local_<timestamp>.sql` (~32,5 Mo) |

---

## 1. Prérequis — état vérifié sur le poste

| Composant | Version / état constaté | Suffisant ? |
|---|---|---|
| Node.js | **v24.18.0** (engines : `>=18`) | ✅ |
| pnpm | **10.19.0** (version exacte du `packageManager`) | ✅ |
| Git | 2.52.0.windows.1 | ✅ |
| PostgreSQL | **17 installé et démarré** (service `postgresql-x64-17` : *Running* ; `psql` disponible) | ✅ |
| Base `atelierone_erp` | Existe, owner `postgres`, encodage UTF8 | ✅ |
| Docker | **Non installé** sur ce poste | ⚠️ Le déploiement dockerisé n'est pas possible ici — voir §8.3 |
| Dépendances node | `pnpm install` : *Lockfile is up to date*, rien à installer | ✅ |

---

## 2. Architecture locale

```
Navigateur ──► Next.js 15.5 (apps/nextjs, port 3000)
                  │  tRPC + NextAuth v5 (credentials + bcrypt)
                  ▼
            Drizzle ORM (packages/db)
                  ▼
       PostgreSQL 17 LOCAL (localhost:5432 / atelierone_erp)
```

Points de conception utiles à connaître avant tout déploiement :

1. **Une seule source de vérité pour la cible DB** : `.env` à la racine. Le script `scripts/db-switch.mjs` propage la bascule de façon cohérente vers les 3 fichiers consommés réellement :
   - `.env` (racine) et `apps/nextjs/.env.local` → en format « toggle » (une variante active, les autres commentées) ;
   - `packages/db/.env` → utilisée par `drizzle-kit` et les seeds.
2. **Garde-fous anti-destruction** : `drizzle-kit push` et les seeds refusent de s'exécuter sur une base **distante** (Neon/Supabase) sans `FORCE=1` (`packages/db/scripts/drizzle-guard.mjs`, `packages/db/src/env-guard.ts`).
3. **Le seed d'installation est destructif** : `pnpm db:seed` (`seed-install.ts`) **purge toute la base** puis recrée 2 sites, le socle sécurité, l'admin et les comptes démo. Ne l'exécuter que sur une base vierge ou en acceptant la purge.
4. **Le workflow de schéma est « schema-first + push »** : il n'existe qu'une migration initiale (`packages/db/drizzle/0000_*.sql`) ; le schéma réel est piloté par `src/schema/` + `pnpm db:push`.

---

## 3. Journal de mise en place — point par point (exécuté)

### Étape 1 — Audit et sauvegarde

```powershell
# État des services et outils
node -v; pnpm -v; docker --version   # docker absent
Get-Service postgresql*              # postgresql-x64-17 : Running
node scripts/db-switch.mjs current   # cible active : NEON
```

```powershell
# Sauvegarde complète de la base locale AVANT toute écriture
pg_dump -U postgres -h localhost -d atelierone_erp -f backups\atelierone_erp_local_<timestamp>.sql
```

> **Règle** : jamais d'opération de schéma (push/migrate) ni de seed sans un `pg_dump` frais dans `backups/` (dossier déjà ignoré par git).

### Étape 2 — Installation des dépendances

```powershell
pnpm install
```
Résultat : workspace de 9 packages, lockfile à jour, aucune installation nécessaire (12 s).

### Étape 3 — Bascule de la base sur LOCAL

```powershell
pnpm db:use-local     # bascule .env + apps/nextjs/.env.local + packages/db/.env
pnpm db:current       # contrôle : LOCAL (localhost:5432) sur les 3 fichiers
```

### Étape 4 — Contrôle d'intégrité de la base et du compte admin

La base locale étant **déjà provisionnée** (227 tables, données réelles), et sur décision de **conserver les données**, `db:push` et `db:seed` n'ont **pas** été exécutés (inutiles et destructeurs). Contrôle non destructif à la place :

```powershell
$url = (Select-String -Path packages\db\.env -Pattern '^DATABASE_URL="(.+)"$').Matches[0].Groups[1].Value
node scripts\check-login.mjs db $url admin@gpj.cm admin123
```
Résultat : `✓ Compte trouvé (actif)`, `✓ MOT DE PASSE VALIDE (bcrypt)`, rôle **superadmin**.

### Étape 5 — Mise en service en mode DÉVELOPPEMENT (vérifiée puis arrêtée)

```powershell
pnpm dev:local        # tue les anciens serveurs, lance `next dev --port 3000` (webpack), pré-compile ~20 routes
```
Résultat : serveur prêt en ~30 s, `GET /login 200`, warm-up des routes exécuté.
Puis le serveur de dev a été **arrêté** pour libérer le port et le dossier `.next` avant le build de production.

### Étape 6 — Contrôles qualité

| Contrôle | Commande | Résultat |
|---|---|---|
| Lint | `pnpm lint` | ✅ **Passe** (warnings seulement, 2 min 16) |
| Typecheck | `pnpm typecheck` | ❌ **Échec préexistant** — erreurs dans `sale-service.ts`, `stock-engine.ts`, `packages/ui/button.tsx` (double schéma drizzle apps/nextjs vs packages/db). **Aucune modification de code n'a été faite dans cette session** : dette existante, non bloquante pour le build car `next.config.js` définit `typescript.ignoreBuildErrors: true`. |

### Étape 7 — Build de production

```powershell
pnpm build            # turbo run build -> next build
```
Résultat : **✅ succès, exit 0, 4 min 05 s** — toutes les routes générées (`/dashboard/*`, `/login`, middleware 85 ko, etc.).

### Étape 8 — Déploiement mode PRODUCTION

```powershell
pnpm -F @atelierone/nextjs start     # next start sur le port 3000
```
Résultat : **Ready in 1843 ms** sur `http://localhost:3000`.

### Étape 9 — Recette de bout en bout (sur le build de production)

```powershell
node scripts\check-login.mjs http http://localhost:3000 admin@gpj.cm admin123
```
Résultat :
- CSRF obtenu, `POST /api/auth/callback/credentials → 302`, `✓ LOGIN RÉUSSI (session créée)` ;
- session serveur : `admin@gpj.cm`, superadmin, agence « GPJ - Atelier (Site Principal) » ;
- pages authentifiées servies : `/dashboard` ✅, `/dashboard/rh` ✅, `/dashboard/vehicules` ✅, `/dashboard/stock` ✅ (dashboard « Bienvenue, Admin Super » rendu).

---

## 4. Commandes du quotidien

| Action | Commande (racine du repo) |
|---|---|
| Démarrage dev (recommandé sur ce poste) | `pnpm dev:local` |
| Démarrage dev turbo (classique) | `pnpm dev` |
| Build production | `pnpm build` |
| Serveur production | `pnpm -F @atelierone/nextjs start` |
| Qualité | `pnpm lint` · `pnpm typecheck` · `pnpm test` |
| État de la cible DB | `pnpm db:current` |
| Bascule DB | `pnpm db:use-local` · `pnpm db:use-neon` · `pnpm db:use-supabase` |
| Appliquer le schéma (LOCAL uniquement) | `pnpm db:push` (peut DROP/ALTER — sauvegarde d'abord) |
| Socle sécurité (additif, idempotent) | `pnpm -F @atelierone/db seed:socle` |
| Installation propre (⚠️ PURGE TOTALE) | `pnpm db:seed` |

> **Ne jamais lancer `pnpm dev` et `next start` en même temps** : ils se disputent le port 3000 et le dossier `.next`.

---

## 5. Bascule local ↔ cloud (Neon / Supabase)

```powershell
pnpm db:current        # toujours vérifier AVANT
pnpm db:use-local      # développement local
pnpm db:use-neon       # cloud de prod (Neon)
pnpm db:use-supabase   # cloud Supabase
```

- La bascule ne touche **que** la ligne `DATABASE_URL` (le reste du `.env` — AUTH_SECRET, app, etc. — est conservé).
- Les opérations destructives (`db:push`, seeds) sont **refusées** sur une cible distante sans consentement explicite `FORCE=1`.
- En production Vercel : `DATABASE_URL` (Neon) + `AUTH_SECRET` se définissent dans *Settings → Environment Variables*, jamais dans git.

---

## 6. Sauvegarde et restauration

**Sauvegarde (à faire avant toute migration/purge et quotidiennement en prod) :**

```powershell
pg_dump -U postgres -h localhost -d atelierone_erp -f backups\atelierone_erp_local_$(Get-Date -Format yyyyMMdd_HHmmss).sql
```

**Restauration (testée périodiquement) :**

```powershell
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS atelierone_erp_restore;"
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE atelierone_erp_restore OWNER postgres;"
psql -U postgres -h localhost -d atelierone_erp_restore -f backups\<fichier>.sql
```

Sur serveur Ubuntu de prod : crons `pg_dump` quotidien + rétention 30 j + rsync vers VPS (voir `deploy/DEPLOIEMENT.md` §6).

---

## 7. Déploiement « serveur de production » (au-delà du local Windows)

Le repo contient déjà le dossier `deploy/` pour un déploiement **serveur Ubuntu** :

| Fichier | Rôle |
|---|---|
| `deploy/DEPLOIEMENT.md` | Guide complet : Node 20, PostgreSQL 17, Nginx + HTTPS (certbot), PM2, UFW/Fail2ban, sauvegardes cron, réplication VPS |
| `deploy/nginx-atelierone.conf` | Reverse proxy + bloc `/uploads/` |
| `deploy/ecosystem.config.js` | Process PM2 |
| `deploy/setup-server.sh` | Préparation automatisée du serveur |
| `deploy/vps-replication.md` | Streaming replication primaire local → standby VPS |

---

## 8. Anomalies et points de vigilance (constatés pendant le déploiement)

1. **`pnpm typecheck` échoue (dette préexistante)** — erreurs de typage dans `apps/nextjs/src/server/lib/sale-service.ts`, `stock-engine.ts` et `packages/ui/src/button.tsx` (conflit de types entre le schéma drizzle embarqué dans `apps/nextjs` et celui de `packages/db`). Non bloquant pour le build (`ignoreBuildErrors: true`), mais à corriger avant d'activer un gate CI strict sur le typecheck.
2. **`docker-compose.yml` contient une erreur d'indentation** — ligne 14 : `     - AUTH_SECRET=...` (espace parasite avant le tiret) : invaliderait l'interprétation YAML. Sans impact actuel (Docker absent de ce poste), à corriger avant tout usage dockerisé. Voir aussi §8.3.
3. **Docker non installé** sur ce poste : le déploiement dockerisé (`Dockerfile` + `docker-compose.yml`) n'a pas pu être validé ici. Le parcours retenu est natif : PostgreSQL local + `next build/start`.
4. **`/parametres` renvoie 404** — ce chemin n'existe pas (page « Page introuvable » propre). Ce n'est pas une erreur de déploiement.
5. **Le warm-up (`scripts/warmup.mjs`) peut terminer par un `AbortError`** dans les logs de dev : sans impact, le serveur reste opérationnel.
6. **`pnpm db:seed` purge toute la base** — ne l'exécuter qu'après `pg_dump` et uniquement si la purge est voulue.
7. **Le port 3000 peut rester occupé** par un `next dev` antérieur : `pnpm dev:local` les tue automatiquement ; en mode manuel, vérifier avec `Get-NetTCPConnection -LocalPort 3000 -State Listen`.
8. **pnpm 12 est disponible** (10.19.0 utilisé ici, conforme au lockfile) : mise à jour facultative via `pnpm self-update`, à valider avec le lockfile.

---

## 9. Plan de retour arrière (rollback)

1. **Retour du logiciel** : `git checkout main` (ou commit de référence) puis `pnpm install && pnpm build`.
2. **Retour de la base** : restaurer le dump le plus récent de `backups/` (§6).
3. **Retour de la cible cloud** : `pnpm db:use-neon` puis redéploiement Vercel.
4. **Couper le service local** : terminer le processus qui écoute sur 3000
   (`Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }`).

---

## 10. Checklist de recette (à refaire après chaque mise à jour majeure)

- [ ] `pnpm db:current` affiche **LOCAL** (ou la cible voulue) sur les 3 fichiers
- [ ] `pg_dump` frais dans `backups/` avant toute opération de schéma
- [ ] `pnpm lint` passe
- [ ] `pnpm build` sort avec exit 0
- [ ] `pnpm -F @atelierone/nextjs start` démarré, `http://localhost:3000/login` répond 200
- [ ] `node scripts\check-login.mjs http http://localhost:3000 admin@gpj.cm admin123` → `LOGIN RÉUSSI`
- [ ] `/dashboard`, `/dashboard/rh`, `/dashboard/vehicules`, `/dashboard/stock` rendent avec session
- [ ] (Prod serveur) HTTPS actif, UFW/Fail2ban actifs, cron de sauvegarde en place

---

## 11. État final au moment de la rédaction

- **Serveur de production local en cours d'exécution** sur `http://localhost:3000` (build du 13/10/2026).
- Base **locale**, données intactes, compte admin validé.
- Pour repasser en développement : arrêter le serveur (§9.4) puis `pnpm dev:local`.
- Pour revenir au cloud : `pnpm db:use-neon`.
