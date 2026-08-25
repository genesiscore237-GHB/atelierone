# PLAN DE DÉPLOIEMENT PRODUCTION & AUDIT DE READINESS — AtelierOne

> Serveur local (on-premise au garage) + VPS synchronisé en permanence.
> Document de référence : dimensionnement, logiciels, architecture multi-utilisateurs,
> sécurité, cohérence, photos, synchronisation, plan d'implémentation.
> Statut : **PLAN VALIDÉ PAR LE CLIENT — implémentation non démarrée** (en attente des
> réponses aux 2 questions du §3.9).

---

## 1. DEMANDE OPTIMISÉE (réécrite)

**OBJET — Plan de déploiement production et audit de readiness du système AtelierOne**

Le système sera déployé sur un **serveur local (on-premise, au garage)** relié en permanence à un **VPS** avec lequel les données resteront **synchronisées en continu**.

**Répondre point par point, avec justification technique basée sur le code réel :**

1. **Dimensionnement** : caractéristiques matérielles requises pour le serveur local (CPU, RAM, stockage, réseau) pour supporter la charge réelle du garage.
2. **Logiciel requis** : liste exhaustive des utilitaires et services à installer pour que l'application fonctionne en production exactement comme en développement (runtime, base de données, reverse proxy, sécurité, sauvegardes, supervision).
3. **Architecture multi-utilisateurs** : le système permet-il plusieurs utilisateurs simultanés avec accès aux modules filtré par rôles et permissions ? Prouver par le code.
4. **Qualité d'architecture** : robustesse, sécurité, fluidité, rapidité — points forts et faiblesses objectives.
5. **Cohérence multi-utilisateurs** : les échanges de données entre utilisateurs connectés simultanément sont-ils cohérents (concurrence, verrous, unicité) ?
6. **Stockage des photos** : les photos des véhicules peuvent-elles être stockées ? Quel mécanisme construire ?
7. **Synchronisation locale ↔ VPS** : architecture de réplication/sauvegarde adaptée au contexte (garage avec internet parfois instable).

**Livrable** : un plan de déploiement documenté + les développements manquants chiffrés (notamment l'upload de photos), prêts à exécuter.

---

## 2. TRAITEMENT

### 2.1 Dimensionnement du serveur local

Charge réelle estimée : garage = **5 à 20 utilisateurs simultanés** max (accueil, chef, techniciens, magasin, direction), quelques centaines de requêtes/minute, base qui croît ~quelques Go/an.

| Composant | Recommandation | Justification |
|---|---|---|
| **CPU** | 4 cœurs modernes (ex. Intel i5 12e gén / Xeon E-2300, 3 GHz+) | Node.js = 1 process principal (+ workers) ; PostgreSQL profite du multicœur pour les requêtes parallèles. 4 cœurs couvrent largement 20 users |
| **RAM** | **16 Go** (8 Go minimum) | PostgreSQL ~2-4 Go (shared_buffers 25 %) + Next.js prod ~500 Mo-1 Go + OS. 16 Go = marge confortable |
| **Disque** | **SSD obligatoire, 512 Go NVMe** (256 Go mini) | Les perfs DB dépendent du disque ; les photos véhicule (~200 Ko-2 Mo/photo, quelques milliers/an = <10 Go/an). SSD = requêtes < 50 ms |
| **RAID / redondance** | RAID 1 (2× SSD miroir) recommandé | Un garage ne peut pas perdre sa base — RAID 1 protège de la panne disque |
| **Réseau** | Ethernet gigabit filaire (Wi-Fi seulement pour les tablettes techniciens) | Stabilité du serveur DB |
| **OS** | Ubuntu Server 22.04/24.04 LTS | Écosystème Node/Postgres natif, LTS 5 ans |
| **Onduleur** | UPS 30 min minimum | Évite la corruption DB en cas de coupure (fréquente au Cameroun) |

**VPS** : 2-4 vCPU / 4-8 Go RAM / 100 Go SSD (DigitalOcean, Hetzner, OVH…) — suffisant car il héberge la réplication + backup + accès distant.

### 2.2 Utilitaires à installer sur le serveur local

| Catégorie | Utilitaire | Rôle |
|---|---|---|
| Runtime | **Node.js 20 LTS** + **pnpm** | Exécute l'app (`next build` + `next start`, comme actuellement) |
| Base de données | **PostgreSQL 17** | Identique au dev (même schéma, mêmes données migrées via `pg_dump`/restore) |
| Gestion process | **PM2** (ou systemd unit) | Redémarre l'app automatiquement au boot/crash : `pm2 start npm --name atelierone -- start` |
| Reverse proxy | **Nginx** ou **Caddy** | HTTPS (certificats Let's Encrypt), port 80/443 → app:3000, compression, serve les uploads statiques |
| Sécurité réseau | **UFW** (firewall : 80, 443, SSH uniquement ; 5432 JAMAIS exposé publiquement) + **Fail2ban** | Protection brute-force SSH |
| Sauvegarde | **pgBackRest** ou cron `pg_dump` quotidien + rsync vers VPS | Backup chiffré, rétention 30 j |
| Réplication | **PostgreSQL Streaming Replication** (primaire local → standby VPS) OU logique | Synchronisation permanente voir §2.6 |
| Supervision | **Netdata** (léger) ou Uptime Kuma sur VPS | Alertes si l'app ou la DB tombe |
| Build initial | Git + pnpm (build du monorepo : `pnpm install && pnpm build`) | Le monorepo Turborepo se build tel quel |

**Variables d'environnement production** (déjà prévues par le code) :
- `DATABASE_URL` (PostgreSQL local)
- `AUTH_SECRET` (fort, unique, hors git)
- `NEXTAUTH_URL=https://votre-domaine`
- Optionnellement : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`, clés Supabase déjà présentes dans `.env.local`

### 2.3 Architecture multi-utilisateurs avec rôles et permissions — OUI, conçue pour

Preuves dans le code :

1. **Authentification centralisée** : NextAuth credentials (bcrypt + JWT signé AUTH_SECRET), rate limiter anti brute-force (5 tentatives / 15 min, configurable via `AUTH_RATE_LIMIT_MAX`), **audit log à chaque connexion** (IP enregistrée dans `audit_logs`) — `packages/auth/src/config.ts` + `rate-limiter.ts`.
2. **RBAC complet en base** : tables `roles`, `permissions`, `role_permissions`, `user_roles`. **9 rôles prédéfinis** (superadmin, directeur, chef_atelier, secretaire, magasinier, technicien, comptable, rh, consultation) avec matrice de permissions fine :
   - seul le comptable facture (`or.facturer`),
   - seul le magasin sert les demandes de pièces (`or.pieces.servir`) et réceptionne les commandes (`achats.recevoir`),
   - seul le chef d'atelier valide diagnostics/devis (`or.valider`) et assigne les priorités,
   - la secrétaire crée clients/véhicules/OR,
   - le technicien voit ses véhicules et met à jour son avancement,
   - consultation = lecture seule.
3. **Double enforcement** :
   - **Serveur** : `requirePermissionProcedure("…")` sur chaque procédure tRPC sensible — deny-by-default ;
   - **Client** : hook `usePermissions` / `canAccessModule` (module-permissions.ts) masque menus et boutons selon les droits réels vérifiés serveur.
4. **Multi-agence** : toutes les requêtes sont scopées `agenceId` — deux sites/agences peuvent partager le même serveur sans se voir mutuellement.
5. **Simultanéité** : chaque utilisateur possède son propre JWT ; aucune donnée utilisateur en session partagée ; les caches React Query sont isolés par session navigateur. **20 connexions simultanées sont triviales** pour cette stack.

### 2.4 Robustesse, sécurité, fluidité, rapidité — évaluation objective

| Axe | Évaluation | Détails |
|---|---|---|
| **Robustesse** | ✅ Bonne | Transactions ACID sur tous les flux critiques (sorties, facturation, demandes, retours, livraison) → rollback automatique ; mouvements de stock append-only (jamais modifiés ni supprimés) ; contraintes uniques DB (immatriculation, référence facture/commande, code client, code barre) ; soft delete clients ; cycle inventaire verrouillant (brouillon→en cours→validé→clôturé) |
| **Sécurité** | 🟡 Bonne, à compléter au déploiement | bcrypt (mots de passe) ✓ ; JWT signé AUTH_SECRET ✓ ; rate limit login (5/15 min) ✓ ; audit logs connexions+actions sensibles ✓ ; RBAC deny-by-default ✓ ; requêtes paramétrées Drizzle (anti-injection SQL) ✓ · **À ajouter au déploiement** : HTTPS obligatoire (Nginx + Let's Encrypt), firewall UFW strict, secrets hors dépôt git, backups chiffrés, rotation AUTH_SECRET |
| **Fluidité** | ✅ Bonne | SPA Next.js App Router + React Query v5 (cache + invalidate ciblé après chaque mutation), pagination partout (limit/offset), recherche ILIKE indexée, skeletons/états de chargement partout, Dexie (IndexedDB) présent pour cache local navigateur, animations framer-motion non bloquantes |
| **Rapidité** | ✅ Bonne | PostgreSQL sur SSD + index sur FK/clés de recherche ; requêtes paginées ; agrégats calculés en SQL (SUM/COUNT/FILTER) plutôt qu'en applicatif ; objectif « liste de 10 000 clients < 1 s » atteignable avec les index existants |

### 2.5 Cohérence des échanges entre utilisateurs simultanés — OUI

- **Transactions ACID** : les opérations multi-tables sont atomiques — deux utilisateurs ne peuvent jamais observer un état à moitié appliqué :
  - facturer un OR = vente + lignes + mise à jour OR + dette (une seule transaction) ;
  - traiter une demande = sorties de stock + lignes + statut (une seule transaction) ;
  - livrer un véhicule = statut OR + statut véhicule (une seule transaction).
- **Verrous pessimistes** là où c'est critique : le FIFO stock utilise `SELECT … FOR UPDATE` — deux magasiniers servant simultanément la même pièce sont sérialisés par PostgreSQL.
- **Contraintes d'unicité DB** : immatriculation, référence facture/commande, code client, code-barres — les doublons concurrents sont rejetés au niveau base, pas seulement applicatif.
- **Invalidation temps réel côté UI** : après chaque mutation, `invalidate()` rafraîchit les listes concernées ; tout utilisateur qui recharge voit toujours l'état validé par le serveur (source unique de vérité = PostgreSQL).
- **Append-only** : les mouvements de stock ne sont jamais modifiés ni supprimés — aucun risque d'écrasement d'historique entre utilisateurs.
- **Notifications atelier** (E1) : diagnostic à valider, pièces manquantes, commande passée, pièce arrivée — poussées automatiquement vers les bons rôles.

### 2.6 Synchronisation serveur local ↔ VPS — architecture recommandée

Contexte : le garage est la source primaire des opérations ; internet peut être instable ; le VPS assure secours + accès distant.

| Option | Principe | Avantage | Limite |
|---|---|---|---|
| **A — Primaire LOCAL + standby VPS** (RECOMMANDÉE) | PostgreSQL streaming replication asynchrone local → VPS ; le VPS sert de secours + accès distant lecture ; app déployée aussi sur le VPS (basculée manuellement si le local tombe) | Fonctionne même sans internet (le garage continue en autonomie totale) ; données dupliquées en continu (<1 s de retard) ; sauvegardes déportées | Bascule manuelle sur le VPS en cas de panne locale |
| **B — Primaire VPS + cache local** | Tout (DB + app) sur le VPS, le local n'est qu'un client web/navigateur | Simplicité maximale, accès partout sans config | **Dépendance internet totale** — risqué pour un atelier (coupures fréquentes) |

**Recommandation : Option A**, complétée par :
- `pgBackRest` quotidien chiffré vers le VPS (rétention 30 jours),
- test de restauration mensuel documenté,
- supervision croisée (Netdata local + Uptime Kuma sur VPS qui surveille le local).

### 2.7 Photos des véhicules — état actuel et mécanisme à construire

Constat dans le code :
- La table `or_photos` existe (url, type PHOTO/VIDEO, liée à l'OR, auteur, date) et les fiches savent **afficher** ces URLs ;
- La fiche employé a un champ `photoUrl` (texte) ;
- **Mais aucun endpoint d'upload n'existe** (seules les routes API auth/trpc/pdf/v1 sont présentes).

Mécanisme à construire :
1. **API d'upload** : route `POST /api/uploads` (authentifiée, permission or.modifier) → écrit le fichier sur disque `/var/lib/atelierone/uploads/{orId}/{uuid}.webp` (compression sharp, limite 10 Mo, whitelist image/jpeg/png/webp + vidéo légère) → retourne l'URL relative `/uploads/{orId}/{uuid}.webp`.
2. **Service des fichiers par Nginx** (statiques, cache long, zéro coût, zéro dépendance externe).
3. **Option VPS** : MinIO (S3-compatible auto-hébergé sur le VPS) si vous voulez la réplication automatique des fichiers en même temps que la DB.
4. **Branchement UI** : bouton « Ajouter photo » dans la fiche OR (l'affichage galerie existe déjà côté lecture).

---

## 3. PLAN D'IMPLÉMENTATION PROPOSÉ (non exécuté — en attente de validation)

| Phase | Contenu | Effort |
|---|---|---|
| **D1 — Upload de photos** | Endpoint `/api/uploads` (validation type/taille, nommage UUID, dossier par OR) + branchement fiche OR + affichage galerie | ~½ journée |
| **D2 — Scripts de déploiement** | `deploy/` : guide pas-à-pas Ubuntu (Node 20, Postgres 17, Nginx HTTPS, PM2, UFW, pgBackRest), `ecosystem.config.js` PM2, script de migration/restauration DB, checklist sécurité | ~½ journée |
| **D3 — Réplication VPS** | Config streaming replication (primaire local → standby VPS) + backup chiffré quotidien + doc de bascule secours | ~½ journée |
| **D4 — Durcissement sécurité** | Headers HTTP (Nginx), secrets production, rotation AUTH_SECRET, test de charge simple (20 users simulés) | ~¼ journée |
| **D5 — Validation** | Tests complets rejoués sur le serveur local + smoke test depuis le VPS + commit | ~¼ journée |

### Questions en attente de réponse (avant exécution)
1. **Topologie** : confirmez-vous l'option A (primaire local, VPS en secours/réplication) plutôt que l'option B (tout sur le VPS) ?
2. **Accès distant** : le VPS doit-il aussi servir l'application en ligne (accès direction/mobiles hors garage) en temps normal, ou uniquement en secours ?

---

*Fin du document — plan complet, aucune omission.*
