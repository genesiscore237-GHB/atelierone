# Guide de déploiement, réinitialisation et peuplement — Libracore

> Document opérationnel : comment installer/réinitialiser une base « comme chez un client »,
> la peupler avec le catalogue extrait de l'ancien système, et garantir que la base locale
> et la base Supabase restent identiques en un clic.

---

## 1. Vue d'ensemble

Le système repose sur **deux mécanismes complémentaires** :

| Mécanisme | Rôle | Où |
| --- | --- | --- |
| **Pipeline d'import standard** | Définit le format canonique (JSONL) de toutes les données du catalogue et les insère de façon ordonnée et idempotente | `packages/db/src/import/` |
| **Pipeline de déploiement** | Réinitialise une base (schéma + données) et la peuple automatiquement après contrôle de conformité | `scripts/deploy.mjs` |

Chaîne exécutée par `deploy.mjs` (tout échec **bloque** le déploiement) :

```
1. BACKUP     → pg_dump de la base cible dans backups/backup-<cible>-<horodatage>.dump
2. SCHÉMA     → reset:schema (DROP + CREATE public) puis migration complète (drizzle-clean)
3. INSTALL    → seed-install : sites (Site Principal - Atelier + Site Secondaire), socle sécurité, admin
4. CONFORMITÉ → verify-deploy : validation de TOUS les fichiers d'import (schéma + clés)
5. IMPORT     → import:catalogue --apply : peuplement ordonné (unités → catégories → éditeurs
                → fournisseurs → produits → manuels → unités produits → liens fournisseurs → stocks)
6. VÉRIF DATA → verify-deploy --data : invariants en base (comptages, unicité, RG-004/RG-012…)
```

## 2. Commandes (une par besoin)

```bash
# Déploiement complet (réinitialisation + peuplement) sur la base LOCALE
pnpm db:deploy

# Déploiement complet sur la base SUPABASE (cloud)
pnpm db:deploy:supabase

# Déploiement sur les DEUX puis comparaison des comptages
pnpm db:deploy:all

# Vérifier uniquement la synchronisation (aucune écriture)
pnpm db:sync

# Sauvegarde seule des deux bases
pnpm db:backup

# Régénérer les fichiers d'import du client
pnpm db:extract

# Vérifier la conformité + invariants de la base courante
pnpm db:verify
```

`FORCE=1` n'est jamais requis : le pipeline bascule automatiquement les fichiers `.env`
sur la cible (`.env`, `apps/nextjs/.env.local`, `packages/db/.env`) puis les restaure.

## 3. Le champ « Nom de code » (recherche rapide)

Chaque produit porte un **nom de code** = les 2 premières lettres de chaque mot du titre,
sans accents, en majuscules :

| Désignation | Nom de code |
| --- | --- |
| 32 BANANIER | `32BA` |
| Anglais ce1 activite | `ANCEAC` |
| Cahier de 200p SAFCA | `CADESA` |

- **À l'enregistrement** (formulaire produit) : généré automatiquement depuis la
  Désignation, modifiable manuellement.
- **À l'import** : calculé et garanti unique (suffixe `-2`, `-3`… en cas de collision).
- **À la recherche** : le champ est indexé dans la recherche catalogue/POS
  (`catalog.search` matche `titre`, `codeBarre` et `nomCode`).

## 4. Le format d'import (évolue avec le système)

Toutes les données d'installation vivent dans un dossier JSONL (par défaut
`DOC/import-atelierone/`) :

| Fichier | Contenu |
| --- | --- |
| `unites.jsonl` | Unités de mesure |
| `categories.jsonl` | Arborescence de catégories (codes stables) |
| `editeurs.jsonl` | Maisons d'édition |
| `fournisseurs.jsonl` | Fournisseurs (codes `FOU-*`) |
| `produits.jsonl` | Produits (typeProduit, langue, niveau, marque, prix…) |
| `manuels.jsonl` | Détails manuels scolaires (RG-004) |
| `produits_unites.jsonl` | Unités de vente/achat par produit |
| `produits_fournisseurs.jsonl` | Liens produit ↔ fournisseur + prix d'achat |
| `stocks_initiaux.jsonl` | Stock d'ouverture par produit/agence (+ mouvement initial) |
| `rejets-produits.jsonl` | Produits exclus (prix nul, artefacts de test) |

**Règles** :
- Références par **codes stables** (`categorieCode`, `fournisseurCode`, `uniteBaseCode`),
  jamais par ids internes.
- Clé d'upsert = `codeBarre` : le déploiement est **idempotent** (ré-exécutable).
- Ordre topologique imposé (parents avant enfants, produits avant stocks).
- Contrôles métier : RG-002 (catégorie/type), RG-009/010 (ISBN/code-barres uniques),
  RG-012/013/014 (unités), RG-016 (prix > 0), RG-017 (facteur entier).
- Les entités optionnelles (tarifs, prix_historique) peuvent être absentes.

**Documentation du format générée par le système** :
```bash
pnpm -F @atelierone/db import:guide        # guide complet en Markdown
pnpm -F @atelierone/db import:validate produits <fichier>   # validation d'un fichier
```

**Faire évoluer le peuplement avec le système** : quand un champ est ajouté au schéma
produit (ex. un nouveau champ métier), on l'ajoute : ① au schéma `produits.ts`,
② au schéma d'import `import/schemas.ts` (+ `engine.ts` si insertion), ③ au wizard
de création, ④ au script d'extraction. Le guide d'import reflète automatiquement
les changements (`import:guide`).

## 5. Réinitialisation sans régression

- **Backup systématique** avant toute action destructive (dans `backups/`).
- **Le schéma est reconstruit depuis une migration unique versionnée**
  (`packages/db/drizzle-clean/`), générée à partir du schéma TypeScript
  (`pnpm -F @atelierone/db generate:clean`). C'est le seul moyen fiable d'obtenir un
  schéma conforme et reproductible (le `drizzle-kit push` interactif n'est PAS utilisé
  par le pipeline : il est non automatisable).
- **Les objets SQL hors schéma TS** (fonctions `set_current_agence_id`/`current_agence_id`/
  `set_current_user_id`/`belongs_to_agence`, triggers d'audit, vue `v_stock_total_base`,
  `refresh_read_models`, RLS multi-tenant, soft-delete, séquences barcode) sont recréés
  à chaque installation depuis `packages/db/src/schema-extras.sql` (idempotent) —
  sans eux, l'app logue « Failed to set tenant context » et l'audit ne fonctionne pas.
- Le journal des migrations (`schéma drizzle`) est purgé avec le schéma public, sinon
  drizzle-kit croit les migrations déjà appliquées et ne crée rien.
- **Le référentiel éducatif** (sous-systèmes FR/EN, ministères, niveaux, classes,
  matières, filières, années scolaires, unités) est réinséré à chaque installation
  (idempotent, `seed-education.sql`).
- **Les comptes** : `admin@gpj.cm / admin123` + 8 comptes de démonstration
  (tous `admin123`) — à changer après installation.
- Le socle (rôles/permissions) est recréé par `ensureSecuritySocle` ; une permission
  référencée mais absente est ignorée proprement (plus de crash `uuid : « »`).

## 6. Synchronisation local ↔ Supabase

`pnpm db:deploy:all` déploie local PUIS supabase et compare 11 indicateurs
(agences, utilisateurs, catégories, éditeurs, fournisseurs, produits, manuels,
unités produits, liens fournisseurs, stocks, ventes). Un écart = sortie non nulle.

`pnpm db:sync` vérifie la synchronisation sans écrire.

Rappel : la base Supabase est purgée par le déploiement — un `pg_dump` de sauvegarde
est créé juste avant dans `backups/backup-supabase-*.dump`.

## 7. Les données source

- Dossier d'import : `DOC/import-atelierone/` (format canonique JSONL)SQL).
- Peuplement : `pnpm db:deploy` (import automatique via le pipeline standard)port
  `RAPPORT-IMPORT.md` avec statistiques, correspondance des catégories, décisions).
- Chiffres du catalogue : **3 839 produits** (2 828 manuels / 1 011 fournitures),
  53 fournisseurs, 46 éditeurs, 50 catégories, 2 343 lignes de stock d'ouverture.
- La ligne corrompue `BATHPHPRGE2` du dump est réparée automatiquement à l'extraction.

## 8. Dépannage rapide

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `drizzle-kit migrate` ne crée rien | journal `drizzle.__drizzle_migrations` restant | `pnpm -F @atelierone/db reset:schema` puis relancer |
| `syntaxe invalide pour le type uuid : « »` | permission manquante dans le socle | ajouter la permission dans `security-socle.ts` (filtre défensif déjà en place) |
| Import lent sur Supabase | moteur ligne-à-ligne (ancien) | moteur batch en place : vérifier la version du code |
| `erreur de syntaxe près de IDENTITY` | liste de tables vide après reset | schéma absent : relancer `migrate:clean` |
| Chemin du catalogue cassé | espaces dans le chemin | toujours passer le chemin entre guillemets (fait dans deploy.mjs) |
| SSL `self-signed certificate` | `sslmode=require` dans l'URL | retiré automatiquement par la config drizzle |

## 9. Déploiement cloud (Vercel) — variables d'environnement requises

Le formulaire de connexion renvoie `login?error=Configuration` si les variables
suivantes ne sont pas définies dans le dashboard Vercel
(**Settings → Environment Variables**) :

| Variable | Valeur | Rôle |
| --- | --- | --- |
| `AUTH_SECRET` | chaîne fixe (ex. `openssl rand -base64 32`) | Signature des sessions NextAuth |
| `DATABASE_URL` | URL Supabase (celle de `.env.supabase`) | Base de données |
| `NEXTAUTH_URL` | URL du déploiement (facultatif si `trustHost` est actif) | URL canonique |

Depuis la correction `trustHost: true` (packages/auth/src/auth.config.ts),
NextAuth accepte l'URL dérivée des headers : `NEXTAUTH_URL` devient optionnel.
Un **redéploiement** est nécessaire après chaque changement de variables.

Diagnostic du login sur n'importe quelle cible :
```bash
node scripts/check-login.mjs db  "<DATABASE_URL>" admin@gpj.cm admin123
node scripts/check-login.mjs http "https://mon-app.vercel.app" admin@gpj.cm admin123
```

## 10. Tests après installation

1. `pnpm db:verify` → tout ✓
2. Connexion : `admin@gpj.cm / admin123`
3. Catalogue → recherche « `32BA` » → Cahier 32 pages Bananier (nom de code)
4. Nouveau produit → la Désignation pré-remplit le Nom de code
5. POS → scan/tape d'un code → vente → stock décrémenté
