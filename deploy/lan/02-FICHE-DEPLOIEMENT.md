# 02 — Fiche de déploiement point par point

Installation du serveur LAN Windows + mise en service des 4 postes.
> Les blocs `PS>` se collent dans **PowerShell administrateur** ; `CMD>` dans l'invite de commandes.
> Adaptez les 4 valeurs : `IP_SERVEUR`, `MDP_POSTGRES`, `AUTH_SECRET` (auto-généré), `COMPTE_WIN`.

---

## Étape 0 — Préparation Windows

Mises à jour et identité de la machine.

```powershell
# Mettre à jour Windows (Panneau > Windows Update) puis :
# Nom de machine lisible
Rename-Computer -NewName "SRV-ATELIER" -Restart
```

Après redémarrage, définir une **IP fixe** sur la carte Ethernet :

```powershell
# Adapter IP / masque / passerelle / DNS à votre réseau (ex. 192.168.1.100)
$adapter = Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Select-Object -First 1
New-NetIPAddress -InterfaceIndex $adapter.ifIndex `
  -IPAddress 192.168.1.100 `
  -PrefixLength 24 `
  -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses 192.168.1.1
```

> En amont, réservez cette IP dans le routeur (réservation DHCP) pour éviter les conflits.

---

## Étape 1 — Installer Node.js 20 LTS

Télécharger l'installeur : https://nodejs.org (volet **LTS**, v20.x → installez v20).
Cocher « Add to PATH ». Vérifier :

```powershell
node -v   # v20.x.x attendu
npm -v
```

---

## Étape 2 — Installer pnpm 10.19.0

pnpm est fourni via Corepack (bundlé avec Node) mais il est plus fiable de l'installer
explicitement :

```powershell
npm install -g pnpm@10.19.0
pnpm --version   # 10.19.0 attendu
```

---

## Étape 3 — Installer PostgreSQL 17

1. Télécharger l'installeur EDB : https://www.postgresql.org/download/windows/
2. Installez **17** ; à l'invite, **choisissez un mot de passe fort** (ce sera `MDP_POSTGRES`) —
   pas le `postgres` par défaut.
3. Gardez le port **5432** par défaut.
4. Le service s'appelle `postgresql-x64-17` et démarre automatiquement.

Vérifier le client psql :

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" --version
```

**Durcissement immédiat (recommandé)** : PostgreSQL ne doit **pas** écouter sur le LAN.
Vérifiez que `listen_addresses` reste `localhost` (défaut) dans le fichier
`C:\Program Files\PostgreSQL\17\data\postgresql.conf`. L'application tournant sur la même
machine, aucun réglage supplémentaire n'est requis. (Plus de détail fichier 03.)

---

## Étape 4 — Créer la base de données

```powershell
# Se connecter en superutilisateur postgres
$env:PGPASSWORD = "MDP_POSTGRES"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE atelierone_erp;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -l
```

> La base cible est **`atelierone_erp`** (celle du `.env.local` du projet). Les bases
> `_b`, `_c`, `_central` servent aux tests/SaaS et ne sont pas nécessaires au garage LAN.

---

## Étape 5 — Déployer le code source

Copiez le projet (clé USB, réseau partagé ou `git clone`) vers le serveur, dans
`C:\atelierone\` :

```powershell
mkdir C:\atelierone
# Option A : copie depuis la clé USB
Copy-Item -Recurse -Force "E:\atelierone\*" "C:\atelierone\"
# Option B : clone git (si le repo est accessible sur le LAN / un hébergeur)
#   git clone <URL> C:\atelierone
```

Installer les dépendances (depuis la racine du projet) :

```powershell
cd C:\atelierone
pnpm install
```

---

## Étape 6 — Configurer l'environnement (secrets)

> Ne commitez **jamais** `AUTH_SECRET` ni le mot de passe.

Générer un `AUTH_SECRET` fort (32+ caractères) :

```powershell
# Génère une chaîne aléatoire de 48 caractères
$chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~'
$auth = -join (1..48 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
$auth
```

Éditer `.env` à la racine (ou copier depuis `.env.example`) :

```dotenv
# Database (LOCAL — PostgreSQL)
DATABASE_URL="postgresql://postgres:MDP_POSTGRES@localhost:5432/atelierone_erp"

# Auth (NextAuth v5)
AUTH_SECRET="<COLLEZ_LE_AUTH_SECRET_GENERE>"
NEXTAUTH_URL="http://192.168.1.100:3000"
AUTH_RATE_LIMIT_MAX=5

# App
NEXT_PUBLIC_APP_URL="http://192.168.1.100:3000"
NEXT_PUBLIC_APP_NAME="AtelierOne"
ADMIN_EMAIL="admin@gpj.cm"
```

Répéter la même valeur dans :
- `apps\nextjs\.env.local`
- `packages\db\.env` (DATABASE_URL en une seule ligne, sans guillemets autour du commentaire)

Forcer la cible **local** (au cas où) :

```powershell
cd C:\atelierone
node scripts/db-switch.mjs local
node scripts/db-switch.mjs current   # doit afficher LOCAL
```

---

## Étape 7 — ⚠️ Installation initiale (UNE SEULE FOIS — destructif)

Cette étape crée le schéma et peuple le catalogue. Elle **vide** la base cible
(`reset:schema` + re-seed). À n'exécuter que sur une base vide, à l'installation.

```powershell
cd C:\atelierone
# Sauvegarde de sécurité avant (au cas où), puis installation initiale
node scripts/deploy.mjs local
```

> 🔴 **NE PAS RELANCER** `deploy.mjs local` sur une base en exploitation (il efface tout).
> Toute mise à jour ultérieure passe par le fichier **05** (`deploy-local.ps1`, incrémental).

Résultat attendu : migration du schéma + compte admin seed + catalogue importé + vérification OK.

---

## Étape 8 — Build de production

```powershell
cd C:\atelierone
pnpm -F @atelierone/nextjs exec next build
```

Vérifier la fin : pas d'erreur, traduction des pages en `.next`.

---

## Étape 9 — Démarrer avec PM2

Créer le fichier `ecosystem.config.js` **Windows** (à la racine) :

```javascript
// ecosystem.config.js (Windows)
module.exports = {
  apps: [{
    name: "atelierone",
    cwd: "C:/atelierone/apps/nextjs",
    script: "node_modules/.bin/next.cmd",
    args: "start -p 3000",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
    },
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "1G",
    watch: false,
    error_file: "C:/atelierone/logs/error.log",
    out_file: "C:/atelierone/logs/out.log",
    time: true,
  }],
};
```

Démarrer :

```powershell
cd C:\atelierone
mkdir logs -Force
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # affiche une commande à exécuter pour lancer au boot — suivez les instructions
```

> Sur Windows, `pm2 startup` nécessite de réexécuter la commande affichée en administrateur
> pour l'enregistrer comme service au démarrage.

Vérifier :

```powershell
pm2 status
pm2 logs atelierone   # Ctrl+C pour quitter
```

---

## Étape 10 — Ouvrir le port 3000 sur le pare-feu

Permettre l'accès des 4 postes clients :

```powershell
New-NetFirewallRule -DisplayName "AtelierOne Web (3000)" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 `
  -Action Allow -Profile Private
```

> La base (5432) reste **fermée** (elle n'écoute que sur localhost, étape 3). Aucune règle
> entrante n'y est ajoutée.

---

## Étape 11 — Tester depuis le serveur

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 10 | Select-Object StatusCode
# 200 attendu
```

---

## Étape 12 — Créer les 4 comptes métier

1. Ouvrez `http://192.168.1.100:3000` dans un navigateur.
2. Connectez-vous avec l'admin seed : `admin@gpj.cm` / `admin123`.
3. **Changez immédiatement** ce mot de passe (Paramètres → compte / admin).
4. Créez 4 utilisateurs (Réception, Magasinier, Chef d'atelier, Boss) avec des **logins et
   mots de passe propres**, puis affectez-leur les **permissions minimales** correspondant à
   leurs rôles (voir fichier 03 § Comptes).

---

## Étape 13 — Vérification sur les postes clients

Sur chaque poste (réception, magasinier, chef atelier, boss) :

1. Ouvrir Chrome/Edge.
2. Aller sur `http://192.168.1.100:3000`.
3. Se connecter avec le compte dédié.
4. Tester le rôle :
   - **Réception** : créer une fiche de réception véhicule.
   - **Magasinier** : consulter les demandes de pièces / stock.
   - **Chef atelier** : ouvrir un OR, valider un diagnostic, gérer le planning.
   - **Boss** : consulter le tableau de bord / KPIs / facturation.

---

## Récapitulatif des accès

| Ressource | URL / commande |
|-----------|----------------|
| Application (serveur) | `http://localhost:3000` |
| Application (clients) | `http://192.168.1.100:3000` |
| Base de données | `postgresql://postgres@localhost:5432/atelierone_erp` (localhost only) |
| Supervision | `pm2 status` |

Passez ensuite au **fichier 03 — SECURITE** puis **04 — SAUVEGARDE** et **05 — MISE À JOUR**.
