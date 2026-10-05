# AtelierOne — Déploiement en réseau local (LAN) du garage

Ce dossier constitue la **fiche de déploiement complète** pour exploiter le logiciel de
garage AtelierOne sur un **petit réseau local**, sans passer par un VPS ni le cloud.

Objectif : permettre à **4 postes** (réception, magasinier, chef d'atelier, boss) d'utiliser
l'application via un simple navigateur web, contre un serveur Windows dédié sur le LAN.

---

## Ordre des étapes

| # | Fichier | Objet |
|---|---------|-------|
| 0 | `00-LISEZMOI.md` | Ce guide : vue d'ensemble, ordre, avertissements |
| 1 | `01-ENVIRONNEMENT.md` | Matériel, logiciel, topologie réseau |
| 2 | `02-FICHE-DEPLOIEMENT.md` | **Installation point par point** du serveur + des 4 postes |
| 3 | `03-SECURITE.md` | Verrouillage : pare-feu, secrets, comptes, HTTPS |
| 4 | `04-SAUVEGARDE.md` | Sauvegarde + restauration + planificateur Windows |
| 5 | `05-CI-CD-LOCAL.md` | **Mise à jour sans casser le code ni la base** + rollback |

Commence par le **01**, puis suis le **02** dans l'ordre.

---

## ⚠️ Avertissements critiques (à lire avant toute manipulation)

### 1. Le pipeline `scripts/deploy.mjs local` est DESTRUCTIF
Le script standard du repo fait `reset:schema` (DROP + CREATE des tables), puis
re-importe le catalogue et resème l'admin.

> **Il n'est à lancer QU'UNE SEULE FOIS**, lors de l'installation initiale sur une base vide
> (étape 8 du fichier 02). **Ne JAMAIS le relancer** sur une base en exploitation : il efface
> toutes les données (clients, véhicules, OR, factures, pointages).

Pour les mises à jour, utilise impérativement le **fichier 05** (`deploy-local.ps1`)
qui procède par **migration incrémentale** (ne supprime rien) après une **sauvegarde automatique**.

### 2. Le compte seed par défaut doit être sécurisé
L'installation crée `admin@gpj.cm` / `admin123`. **Changez ce mot de passe au premier
démarrage** et créez les 4 comptes métier (réception, magasinier, chef atelier, boss)
avec des **permissions minimales** (voir fichier 03).

### 3. PostgreSQL n'écoute que sur localhost
L'application tourne sur la **même machine** que PostgreSQL. La base n'est donc **pas
exposée sur le LAN** : seuls l'application (port 3000) est accessible aux postes clients.
C'est la configuration la plus sûre et la plus simple.

---

## Ce que le projet apporte déjà (réutilisé, pas réinventé)

| Élément | Emplacement | Usage |
|---------|-------------|-------|
| Pipeline déploiement initial | `scripts/deploy.mjs` | Installation initiale seule (destructif) |
| Configuration PM2 | `deploy/ecosystem.config.js` | Gestion du process Node — adapté Windows ici |
| Reverse proxy Nginx | `deploy/nginx-atelierone.conf` | Optionnel sous Windows (pas requis en LAN pur) |
| Bascule base local/Supabase | `scripts/db-switch.mjs` | Force la cible **local** |
| Backups | `backups/` | Scripts `pg_dump` fournis dans le fichier 04 |
| CI GitHub | `.github/workflows/ci.yml` | Lint/typecheck/build (déjà présent, indépendant) |

Stack cible : **Next.js 15 · tRPC 11 · Drizzle ORM · PostgreSQL 17 · pnpm 10 · Node 20 LTS**.

---

## Mode d'emploi de ce dossier

- Tous les blocs de commandes sont **copiables tels quels** dans un terminal **PowerShell
  (administrateur)** ou **invite de commandes**, selon la mention.
- Adaptez **quatre valeurs** au moment de l'installation : l'**IP du serveur**
  (ex. `192.168.1.100`), le **mot de passe PostgreSQL**, l'**AUTH_SECRET** (généré
  automatiquement par le bloc fourni), et le **nom du compte Windows**.
- Si vous utilisez déjà une machine avec Node/pnpm/PostgreSQL installés, sautez les étapes
  d'installation correspondantes du fichier 02.

---

## Rôles métier cibles

| Poste | Rôle | Accès principal |
|-------|------|-----------------|
| Réception | `admin` ou rôle dédié avec `receptionner` | Fiche de réception véhicule, parc |
| Magasinier | rôle stock | Demandes de pièces, stock, sorties |
| Chef d'atelier | rôle atelier | OR, devis, validation diagnostic, planning |
| Boss | rôle direction | Tableaux de bord, KPIs, facturation, settings |

La configuration exacte des rôles/utilisateurs est détaillée au fichier 02 (étape 12) et au fichier 03.
