# GUIDE DE DÉPLOIEMENT WINDOWS 10 — ATELIERONE
## Configuration cible : Intel Core i3 · 4 Go RAM · Windows 10 64 bits

> **Objectif :** déployer **AtelierOne** (Garage Polyvalent Junior) sur le nouveau PC
> qui servira de **serveur local** du garage, accessible depuis tous les postes via le réseau local.
> Ce guide liste TOUT ce qu'il faut installer, dans l'ordre, avec les versions exactes.

---

## 0. ⚠️ IMPORTANT — 4 Go de RAM : à lire absolument

Votre machine a **4 Go de RAM**, ce qui est la configuration **mini** recommandée par le
projet (guide officiel : 8 Go conseillés). L'application est légère (Next.js + PostgreSQL),
mais pour un fonctionnement fluide :

1. **Windows 10 64 bits** (édition Professionnelle recommandée) — la version 32 bits ne convient PAS.
2. **Désactiver Windows Update automatique** ou le planifier en dehors des heures de travail (les mises à jour consomment de la RAM).
3. **Désactiver les effets visuels** (Panneau de configuration → Système → Paramètres système avancés → Performances → « Ajuster pour obtenir les meilleures performances »).
4. **Désactiver OneDrive, Cortana et les applications en arrière-plan** inutiles.
5. **Prévoir une pagefile (fichier d'échange)** : laisser Windows la gérer automatiquement (au moins 4 Go) — indispensable avec 4 Go.
6. **Ne PAS installer** Chrome/Edge avec de nombreux onglets sur CE poste : il est réservé au serveur.
7. **Onduleur (UPS) fortement recommandé** : protège PostgreSQL contre les coupures électriques (corruption possible).
8. **Ne PAS exécuter MongoDB, SQL Server ou WAMP sur ce PC** — AtelierOne ne les utilise pas (voir section 4).

---

## 1. Ordre d'installation (résumé)

| # | Logiciel | Version exacte | Rôle |
|---|---|---|---|
| 1 | Windows 10 Pro 64 bits | 22H2 (build 19045) | Système |
| 2 | Pilotes Lenovo/Intel (chipset, réseau, graphique) | Derniers | Stabilité |
| 3 | 7-Zip | 24.09 | Décompression |
| 4 | Git | 2.52.0 | Versionnement (optionnel si copie USB) |
| 5 | Node.js | **24.18.0 LTS** | Runtime |
| 6 | pnpm | 10.19.0 | Gestionnaire de paquets |
| 7 | PostgreSQL | **17.6** | Base de données |
| 8 | PM2 | 6.x (latest) | Superviseur du process |
| 9 | Le code AtelierOne | dernière version | Application |
| 10 | Sauvegardes | — | Sécurité |

---

## 2. Installation détaillée

### 2.1 Windows 10 Pro 64 bits
- Installer Windows 10 **Professionnel 64 bits** (build ≥ 19045 / 22H2).
- Compte utilisateur : créer un compte **local** nommé `atelierone` (pas de compte Microsoft nécessaire).
- Nom de la machine : ex. `SERVEUR-GPJ`.
- **Windows Update complet** puis redémarrage.
- **Activation** : si le poste n'a pas de licence, prévoir une clé Windows 10 Pro valide.

### 2.2 Pilotes
- Intel Chipset, carte réseau (Ethernet/Wi-Fi), contrôleur graphique Intel HD/UHD.
- Vérifier dans le Gestionnaire de périphériques qu'il n'y a **aucun point d'exclamation**.
- Tester la connexion : `ping 8.8.8.8`.

### 2.3 7-Zip (pour décompresser le code si livré en archive)
- Télécharger 7-Zip 24.09 (64-bit) : https://www.7-zip.org
- Installer par défaut.

### 2.4 Git 2.52.0
- Télécharger : https://git-scm.com/download/win
- Options d'installation : laisser les valeurs par défaut (sauf si vous voulez l'éditeur Notepad++).
- Vérifier : `git --version` → `git version 2.52.0.windows.1`

### 2.5 Node.js 24.18.0 LTS — **CRITIQUE**
- Télécharger : https://nodejs.org → **24.18.0** (MSI x64).
- ⚠️ **Cocher « Add to PATH »** pendant l'installation (important !).
- Chemin d'installation : `C:\Program Files\nodejs` (défaut).
- Vérifier dans un nouveau terminal :
  ```
  node -v   → v24.18.0
  npm -v    → 11.5.2
  ```

### 2.6 pnpm 10.19.0
- Ouvrir PowerShell (Administrateur) :
  ```
  npm install -g pnpm@10.19.0
  pnpm -v   → 10.19.0
  ```
- ⚠️ Vérifier que `C:\Users\atelierone\AppData\Roaming\npm` est dans le PATH utilisateur (npm global l'ajoute normalement).

### 2.7 PostgreSQL 17.6 — **CRITIQUE**
- Télécharger : https://www.enterprisedb.com/downloads/postgres-postgresql-downloads → **PostgreSQL 17.6** (Windows x86-64).
- Assistant d'installation :
  - Chemin : `C:\Program Files\PostgreSQL\17` (défaut)
  - **Port : 5432**
  - Superutilisateur : `postgres`
  - **Mot de passe : `postgres`** ⚠️ (identique à la base de référence — le fichier `.env` utilise `postgres:postgres@localhost:5432`)
  - **Locale : French, France (1252)** (comme la base de référence — important pour la collation)
  - Cocher « Stack Builder » : NON.
- Vérifier : `psql --version` → `psql (PostgreSQL) 17.6`

### 2.8 PM2 (superviseur — démarrage automatique)
- PowerShell (Administrateur) :
  ```
  npm install -g pm2
  pm2 -v
  ```

---

## 3. Installation du code AtelierOne

### 3.1 Copie du code
Deux options :
- **USB** : copier le dossier `atelierone` (sans `node_modules`, `.next`, `graphify-out`) vers `C:\atelierone`.
- **Git** : `git clone <url-du-repo> C:\atelierone`

### 3.2 Fichiers .env — **CRITIQUE**
Copier depuis la machine de référence les fichiers `.env` (ils contiennent les clés) :
- `C:\atelierone\.env`
- `C:\atelierone\apps\nextjs\.env.local`
- `C:\atelierone\packages\db\.env`

Vérifier que `DATABASE_URL` pointe vers le PostgreSQL local :
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/atelierone_erp"
```

⚠️ **Pour l'accès depuis les autres PC du garage**, modifier dans `C:\atelierone\.env` :
```
NEXTAUTH_URL="http://192.168.1.50:3000"
NEXT_PUBLIC_APP_URL="http://192.168.1.50:3000"
```
(remplacer `192.168.1.50` par l'IP fixe du serveur — section 5). Puis relancer le build : `pnpm build` et `pm2 restart atelierone`.

### 3.3 Installation des dépendances
```
cd C:\atelierone
pnpm install
```

### 3.4 Déploiement de la base (schéma + socle + rôles + catalogue)
```
pnpm db:deploy
```
> Ce script : sauvegarde la base → reset le schéma → installe le socle (admin@gpj.cm / admin123) →
> vérifie la conformité → importe le catalogue (13 produits de démonstration).

### 3.5 Vérification
```
pnpm db:verify
```
Résultat attendu : `TOUT EST CONFORME ✓`

### 3.6 Build de production
```
pnpm build
```
> ⚠️ Sur 4 Go de RAM : le build Next.js peut être long (5-15 min). **Ne rien lancer d'autre pendant le build.**
> Si le build échoue par manque de mémoire : fermer tous les programmes, redémarrer, réessayer.
> En dernier recours : `set NODE_OPTIONS=--max-old-space-size=2048` avant `pnpm build`.

---

## 4. Démarrage en production

### 4.1 Lancer avec PM2 (démarrage automatique + redémarrage au crash)
```
cd C:\atelierone\apps\nextjs
pm2 start npm --name atelierone -- start
pm2 save
pm2 startup   → copier la commande affichée et l'exécuter (crée le service de démarrage)
```

### 4.2 Vérifier
```
pm2 status
```
→ `atelierone` doit être **online**.

### 4.3 Tester
- Ouvrir sur CE poste : `http://localhost:3000`
- Se connecter : `admin@gpj.cm` / `admin123` (⚠️ **changer le mot de passe immédiatement**)

---

## 5. Accès depuis les autres postes du garage

1. Fixer une **IP statique** au serveur :
   - Panneau de configuration → Réseau → Carte Ethernet → IPv4 → propriétés
   - Ex. : IP `192.168.1.50`, masque `255.255.255.0`, passerelle `192.168.1.1`, DNS `8.8.8.8`
2. **Autoriser le port 3000 dans le Pare-feu Windows** (Administrateur) :
   ```
   netsh advfirewall firewall add rule name="AtelierOne" dir=in action=allow protocol=TCP localport=3000
   ```
3. Les postes du garage ouvrent : `http://192.168.1.50:3000`

---

## 6. Sauvegardes automatiques (OBLIGATOIRE)

### 6.1 Créer un script de sauvegarde
`C:\atelierone\backup.bat` :
```bat
@echo off
set DATE=%date:~-4%%date:~3,2%%date:~0,2%
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h 127.0.0.1 -p 5432 -Fc -f "D:\backups\atelierone-%DATE%.dump" atelierone_erp
forfiles /p "D:\backups" /m *.dump /d -30 /c "cmd /c del @path"
```
> ⚠️ Adapter `D:\backups` : utiliser le **disque externe** de préférence.

### 6.2 Planifier (Tâches planifiées Windows)
1. Ouvrir « Planificateur de tâches » → Créer une tâche.
2. Déclencheur : **Tous les jours à 02:30**.
3. Action : lancer `C:\atelierone\backup.bat` (exécuter avec les plus hauts privilèges).
4. Optionnel : configurer aussi une sauvegarde de `C:\atelierone\.env` et de `C:\atelierone\DOC` (petits fichiers précieux).

### 6.3 Test de restauration (à faire 1 fois)
```
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -h 127.0.0.1 -p 5432 -d atelierone_erp --clean --if-exists D:\backups\atelierone-<date>.dump
```

---

## 7. Réglages spécifiques 4 Go de RAM (résumé)

| Action | Détail |
|---|---|
| Pagefile | Laisser Windows gérer (au moins 4 Go) |
| Effets visuels | « Meilleures performances » |
| Windows Update | Planifier hors travail |
| OneDrive/Cortana | Désactiver |
| Build | Ne rien lancer d'autre pendant `pnpm build` |
| `NODE_OPTIONS` | `--max-old-space-size=2048` si le build échoue |
| Postgres | `shared_buffers` par défaut (128 Mo) convient |

---

## 8. Checklist de validation finale

- [ ] `node -v` → v24.18.0
- [ ] `pnpm -v` → 10.19.0
- [ ] `psql --version` → 17.6
- [ ] `pnpm db:verify` → TOUT EST CONFORME
- [ ] `pm2 status` → atelierone online
- [ ] `http://localhost:3000` → page de connexion
- [ ] `admin@gpj.cm / admin123` → tableau de bord
- [ ] Les 13 produits + stocks sont présents
- [ ] Accès depuis un autre PC : `http://192.168.1.50:3000`
- [ ] Redémarrage du PC → `pm2` relance l'app automatiquement
- [ ] Sauvegarde automatique testée (fichier .dump créé)

---

## 9. Dépannage rapide

| Problème | Solution |
|---|---|
| `pnpm : commande introuvable` | Node.js non installé avec « Add to PATH », ou terminal pas rouvert |
| Connexion base refusée | Vérifier le service PostgreSQL (services.msc → postgresql-x64-17 → Démarrer) |
| `DATABASE_URL` invalide | Vérifier les 3 fichiers `.env` |
| Port 3000 déjà utilisé | `netstat -ano | findstr :3000` puis tuer le process, ou changer le port |
| L'app ne démarre pas après reboot | `pm2 save` + `pm2 startup` re-exécutés ? Le service PM2 est-il démarré ? |
| Build lent / mémoire | Fermer tout, redémarrer, `set NODE_OPTIONS=--max-old-space-size=2048` |
| Mot de passe admin oublié | Voir `DOC/STRUCTURE-DU-TEMPLATE.md` (comptes de démonstration) |

---

## 10. Ce qu'il ne faut PAS installer sur ce PC

- ❌ **MongoDB** — non utilisé par AtelierOne
- ❌ **SQL Server / SSMS** — non utilisé par AtelierOne
- ❌ **WampServer / MySQL / MariaDB** — non utilisés par AtelierOne
- ❌ **Docker** — non nécessaire pour le déploiement simple
- ❌ Python, Java, Go, VS Studio — non requis pour faire tourner l'application
- ✅ **VS Code** : optionnel (utile seulement pour consulter/modifier le code)

> Ces logiciels alourdiraient le poste 4 Go inutilement. AtelierOne fonctionne avec
> **Node.js + PostgreSQL uniquement**.

---

*Guide généré pour le poste serveur AtelierOne — Intel Core i3 · 4 Go RAM · Windows 10 Pro 64 bits.*
