#!/bin/bash
# SETUP SERVEUR — AtelierOne (Ubuntu Server 22.04/24.04)
# Exécuter en root : sudo bash setup-server.sh
set -e

echo "=== 1. Mise à jour système ==="
apt update && apt upgrade -y

echo "=== 2. Node.js 20 LTS ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

echo "=== 3. PostgreSQL 17 ==="
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update && apt install -y postgresql-17

echo "=== 4. Nginx + UFW + Fail2ban ==="
apt install -y nginx ufw fail2ban git
ufw allow OpenSSH && ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now fail2ban

echo "=== 5. Répertoires application ==="
mkdir -p /opt/atelierone /var/lib/atelierone/uploads /var/log/atelierone /var/backups/atelierone
chown -R www-data:www-data /var/lib/atelierone/uploads

echo "=== 6. Base de données ==="
sudo -u postgres psql <<SQL
CREATE USER atelierone WITH PASSWORD 'CHANGEZ_MOI' CREATEDB;
CREATE DATABASE atelierone_erp OWNER atelierone;
SQL

echo "=== 7. Sauvegardes cron ==="
cat > /etc/cron.d/atelierone-backup <<CRON
0 2 * * * postgres pg_dump atelierone_erp | gzip > /var/backups/atelierone/db_\$(date +\%Y\%m\%d).sql.gz
30 2 * * * find /var/backups/atelierone -name "*.gz" -mtime +30 -delete
0 3 * * * rsync -avz /var/backups/atelierone/ backup@VPS_IP:/backups/atelierone/
CRON

echo "=== 8. Cloner et build l'application ==="
cd /opt/atelierone
git clone <REPO_URL> . || echo "Repo déjà cloné"
pnpm install
pnpm build

echo "=== 9. PM2 ==="
cp deploy/ecosystem.config.js .
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "=== 10. Nginx ==="
cp deploy/nginx-atelierone.conf /etc/nginx/sites-available/atelierone
ln -sf /etc/nginx/sites-available/atelierone /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=== DÉPLOIEMENT TERMINÉ ==="
echo "N'oubliez pas de :"
echo "  1. Configurer .env.local avec DATABASE_URL et AUTH_SECRET"
echo "  2. Changer le mot de passe PostgreSQL (CHANGEZ_MOI)"
echo "  3. Configurer HTTPS avec certbot"
echo "  4. Tester les sauvegardes (restauration)"