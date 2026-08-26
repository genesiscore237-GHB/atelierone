# DÉPLOIEMENT PRODUCTION — AtelierOne (serveur local Ubuntu)

## Prérequis matériels
- 4 cœurs / 16 Go RAM / SSD NVMe 512 Go en RAID 1 / UPS 30 min
- Ubuntu Server 22.04 ou 24.04 LTS
- Connexion internet (pour Let's Encrypt et la réplication VPS)

---

## 1. INSTALLATION DES UTILITAIRES

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
sudo corepack enable && sudo corepack prepare pnpm@latest --activate

# PostgreSQL 17
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update && sudo apt install -y postgresql-17

# Nginx
sudo apt install -y nginx

# PM2
sudo npm install -g pm2

# UFW + Fail2ban
sudo apt install -y ufw fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo systemctl enable --now fail2ban

# Git
sudo apt install -y git
```

## 2. BASE DE DONNÉES

```bash
sudo -u postgres psql -c "CREATE USER atelierone WITH PASSWORD 'MOT_DE_PASSE_FORT';"
sudo -u postgres psql -c "CREATE DATABASE atelierone_erp OWNER atelierone;"
sudo -u postgres psql -c "ALTER USER atelierone CREATEDB;"

# Migration du schéma (depuis le repo cloné)
cd /opt/atelierone
pnpm install
cp .env.example .env.local # éditer DATABASE_URL etc.
```

## 3. APPLICATION

```bash
sudo mkdir -p /opt/atelierone /var/lib/atelierone/uploads
sudo chown -R $USER:$USER /opt/atelierone /var/lib/atelierone
git clone <repo-url> /opt/atelierone
cd /opt/atelierone

pnpm install
pnpm build

# PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup # suivre les instructions pour le boot automatique
```

## 4. NGINX (reverse proxy HTTPS)

Copier `nginx-atelierone.conf` dans `/etc/nginx/sites-available/atelierone`
```bash
sudo ln -s /etc/nginx/sites-available/atelierone /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS avec certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.local
```

## 5. UPLOADS

```bash
sudo mkdir -p /var/lib/atelierone/uploads
sudo chown -R www-data:www-data /var/lib/atelierone/uploads
```

Ajouter dans Nginx :
```nginx
location /uploads/ {
    alias /var/lib/atelierone/uploads/;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

## 6. SAUVEGARDES

```bash
# Cron quotidien pg_dump vers /var/backups/atelierone
echo '0 2 * * * pg_dump -U atelierone atelierone_erp | gzip > /var/backups/atelierone/db_$(date +\%Y\%m\%d).sql.gz' | crontab -

# Rétention 30 jours
echo '30 2 * * * find /var/backups/atelierone -name "*.gz" -mtime +30 -delete' | crontab -

# Synchronisation vers VPS (rsync)
echo '0 3 * * * rsync -avz /var/backups/atelierone/ user@vps:/backups/atelierone/' | crontab -
```

## 7. CHECKLIST SÉCURITÉ

- [ ] AUTH_SECRET fort (32+ caractères aléatoires) — jamais dans git
- [ ] DATABASE_URL avec mot de passe fort
- [ ] UFW actif (80, 443, SSH seulement)
- [ ] Fail2ban actif
- [ ] PostgreSQL n'écoute que sur localhost (pas 0.0.0.0)
- [ ] HTTPS obligatoire (redirection 301 de HTTP)
- [ ] Uploads limités à 10 Mo et whitelist types MIME
- [ ] Sauvegardes testées (restauration mensuelle documentée)

## 8. SYNCHRONISATION VPS (streaming replication)

Sur le primaire (local), dans `postgresql.conf` :
```
wal_level = replica
max_wal_senders = 3
```
Dans `pg_hba.conf` :
```
host replication replicator IP_VPS/32 scram-sha-256
```
Créer l'utilisateur réplication :
```sql
CREATE ROLE replicator WITH REPLICATION PASSWORD 'MOT_REPLICATION' LOGIN;
```
Sur le standby (VPS), utiliser `pg_basebackup` pour initialiser puis configurer `standby.signal`.

Voir `deploy/vps-replication.md` pour le guide détaillé.
