# SYNCHRONISATION LOCAL ↔ VPS — Streaming Replication PostgreSQL

## Architecture
- **Primaire** : serveur local (garage) — toutes les écritures
- **Standby** : VPS — copie en lecture seule, bascule possible si le local tombe

---

## 1. Configuration du PRIMAIRE (serveur local)

### postgresql.conf
```ini
wal_level = replica
max_wal_senders = 3
max_replication_slots = 3
wal_keep_size = 256MB
listen_addresses = 'localhost,IP_LOCALE'
```

### pg_hba.conf (ajouter à la fin)
```
host replication replicator IP_VPS/32 scram-sha-256
```

### Créer l'utilisateur réplication
```sql
CREATE ROLE replicator WITH REPLICATION PASSWORD 'MOT_REPLICATION_FORT' LOGIN;
```

Redémarrer PostgreSQL :
```bash
sudo systemctl restart postgresql@17-main
```

---

## 2. Configuration du STANDBY (VPS)

Arrêter PostgreSQL :
```bash
sudo systemctl stop postgresql@17-main
```

Vider le data directory :
```bash
sudo rm -rf /var/lib/postgresql/17/main/*
```

Initialiser depuis le primaire :
```bash
sudo -u postgres pg_basebackup \
  -h IP_SERVEUR_LOCAL \
  -U replicator \
  -D /var/lib/postgresql/17/main \
  -Fp -Xs -P -R \
  --slot=atelierone_slot
```

Cela crée automatiquement `standby.signal` et `postgresql.auto.conf` avec la connexion primaire.

Démarrer le standby :
```bash
sudo systemctl start postgresql@17-main
```

---

## 3. VÉRIFICATION

Sur le primaire :
```sql
SELECT client_addr, state, sync_state FROM pg_stat_replication;
-- Attendu : state = 'streaming'
```

Sur le standby :
```sql
SELECT pg_is_in_recovery();
-- Attendu : true
```

---

## 4. BASCULE SECOURS (si le local tombe)

Sur le VPS :
```bash
# Promouvoir le standby en primaire
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/17/main

# Démarrer l'application sur le VPS
pm2 start ecosystem.config.js
```
Le garage se connecte alors au VPS jusqu'au retour du serveur local.

---

## 5. BACKUPS CHIFFRÉS QUOTIDIENS

Sur le VPS, cron de backup du standby :
```bash
0 4 * * * pg_dump atelierone_erp | gzip | openssl enc -aes-256-cbc -pass file:/etc/atelierone/backup.key > /backups/db_$(date +\%Y\%m\%d).sql.gz.enc
30 4 * * * find /backups -name "*.gz.enc" -mtime +30 -delete
```

Clé de chiffrement :
```bash
openssl rand -base64 32 > /etc/atelierone/backup.key
chmod 600 /etc/atelierone/backup.key
```

Restauration :
```bash
openssl enc -d -aes-256-cbc -pass file:/etc/atelierone/backup.key -in db_20260824.sql.gz.enc | gunzip | psql -U atelierone atelierone_erp
```

---

## 6. RÉPLICATION DES FICHIERS UPLOADS

Cron rsync quotidien (local → VPS) pour les photos/documents :
```bash
rsync -avz --delete /var/lib/atelierone/uploads/ backup@VPS_IP:/var/lib/atelierone/uploads/
```