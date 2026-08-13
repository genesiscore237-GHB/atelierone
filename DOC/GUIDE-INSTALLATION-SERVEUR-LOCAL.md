# Guide d'installation — Serveur local (déploiement chez le client)

> Objectif : déployer **AtelierOne** (client **Garage Polyvalent Junior**) sur un
> serveur local, accessible depuis tous les postes du garage sans internet.

---

## 1. Configuration matérielle

Charge réelle : 5 à 10 utilisateurs simultanés, ~4 000 produits, milliers de
ventes/an. L'application (Next.js + PostgreSQL) est légère.

| Niveau | CPU | RAM | Stockage | Recommandé pour |
|---|---|---|---|---|
| Mini | 4 cœurs (Intel N100/N305, i3, Ryzen 3) | 8 Go | 256 Go SSD NVMe | 1 site, petits volumes |
| **Confort (choix recommandé)** | 4-6 cœurs (i5, Ryzen 5) | **16 Go** | **512 Go SSD NVMe** | Usage réel du garage + marge |
| Croissance | 8 cœurs | 32 Go | 1 To SSD + RAID1 | Multi-agences / très gros volumes |

Indispensables :
- **Onduleur (UPS)** : protège la base contre les coupures électriques.
- **Disque externe ou partage cloud** pour les sauvegardes quotidiennes.
- Réseau local Ethernet Gigabit (les postes du garage accèdent via l'IP du serveur).

## 2. Système d'exploitation

- **Recommandé** : Ubuntu Server 24.04 LTS (gratuit, stable, consommation faible).
- Alternative : Windows Server 2022 (mêmes étapes, commandes adaptées).

## 3. Logiciels à installer (Ubuntu Server)

```bash
# Mise à jour du système
sudo apt update && sudo apt upgrade -y

# PostgreSQL 16 — base de données
sudo apt install -y postgresql postgresql-contrib

# Node.js 22 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
sudo corepack enable

# Git
sudo apt install -y git

# PM2 — superviseur du process Node
sudo npm install -g pm2

# Nginx — reverse proxy (http://IP_LOCALE → port 3000)
sudo apt install -y nginx

# Sécurité : pare-feu + anti-force-brute
sudo apt install -y ufw fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# Sauvegardes : cron est déjà présent
```

## 4. Préparer la base de données

```bash
sudo -u postgres psql
CREATE USER atelierone WITH PASSWORD 'mot_de_passe_fort';
CREATE DATABASE atelierone_erp OWNER atelierone;
GRANT ALL PRIVILEGES ON DATABASE atelierone_erp TO atelierone;
\q
```

## 5. Installer l'application

```bash
# Récupérer le code (repo GitHub AtelierOne)
cd /opt
sudo git clone https://github.com/<compte>/atelierone.git
cd atelierone
sudo chown -R $USER:$USER .

# Dépendances
pnpm install

# Configuration locale (adaptée au serveur)
#   DATABASE_URL="postgresql://atelierone:mot_de_passe_fort@localhost:5432/atelierone_erp"
#   AUTH_SECRET=<généré une fois, conservé>
#   NEXTAUTH_URL="http://192.168.x.x:3000"
#   SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_* : non requis pour un fonctionnement 100 % local
#     (skippés via SKIP_ENV_VALIDATION=1 si absents)

# Déploiement local complet (schéma + socle + rôles GPJ + catalogue)
pnpm db:deploy

# Build de production
pnpm build
```

## 6. Démarrer en production (PM2)

```bash
# Démarrage auto + redémarrage au crash/reboot
cd apps/nextjs
pm2 start npm --name atelierone -- start
pm2 save
pm2 startup
```

## 7. Rendre accessible sur le réseau local (Nginx)

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/atelierone /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Les postes du garage ouvrent simplement `http://192.168.x.x` (IP du serveur).

## 8. Sauvegardes automatiques

```bash
# /etc/cron.d/atelierone-backup — tous les jours à 2h30
30 2 * * * root pg_dump -Fc -U atelierone atelierone_erp > /backups/atelierone-$(date +\%F).dump && find /backups -name '*.dump' -mtime +30 -delete
```

- Les déploiements du pipeline font déjà un backup automatique avant chaque `pnpm db:deploy`.
- Copier régulièrement `/backups` vers le disque externe / cloud.

## 9. Mettre à jour l'application

```bash
cd /opt/atelierone
git pull
pnpm install
pnpm build
pm2 restart atelierone
```

## 10. Comptes d'accès après installation

Identiques à l'installation de référence : `admin@gpj.cm / admin123` (à changer
immédiatement), puis les 9 comptes de démonstration `@gpj.cm` — voir
`DOC/STRUCTURE-DU-TEMPLATE.md`.

## Vérifications finales

1. `http://192.168.x.x` affiche la page de connexion.
2. `admin@gpj.cm / admin123` → tableau de bord (200).
3. `pnpm -F @atelierone/db verify:data -- DOC/import-atelierone` → tout conforme.
4. Redémarrage du serveur → l'app redémarre seule (PM2 startup).
