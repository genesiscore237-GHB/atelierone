# 04 — Sauvegarde et restauration des données

> La donnée la plus précieuse du garage, c'est la base. La sauvegarde est automatique,
> journalière, et la restauration doit être **testée** (jamais présumée).

---

## 1. Principe

- **Méthode** : `pg_dump -Fc` (format compressé natif, fiable, restaurable partiellement).
- **Fréquence** : **1×/jour** (02h00) via le Planificateur Windows.
- **Rétention** : **30 jours** (purge automatique des backups de plus de 30 jours).
- **Hors-machine** : copie quotidienne vers une **clé USB dédiée** (rotative 2 clés).
  Protège contre la panne du serveur, pas seulement l'erreur.

---

## 2. Script de sauvegarde : `backup.ps1`

Créez `C:\atelierone\scripts\backup.ps1` avec ce contenu :

```powershell
# backup.ps1 — Sauvegarde PostgreSQL d'AtelierOne (format .dump compressé)
# Usage : .\backup.ps1   (ou via le Planificateur)
param(
  [string]$DbUser = "postgres",
  [string]$DbName = "atelierone_erp",
  [string]$PgPassword = "MDP_POSTGRES",          # <-- À ADAPTER
  [string]$BackupDir = "C:\atelierone\backups",  # dossier principal
  [string]$RetentionDays = 30,
  [string]$UsbDrive = ""                          # ex. "E:\backups" pour copie hors-machine (optionnel)
)

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $BackupDir "backup-$stamp.dump"

# 1. Dossier + anciens backups
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# 2. Sauvegarde (le mot de passe est passé proprement via la variable d'env, pas en CLI)
$env:PGPASSWORD = $PgPassword
& $pgDump -Fc -U $DbUser -h localhost -p 5432 -d $DbName -f $file
if ($LASTEXITCODE -ne 0) { Write-Error "Echec pg_dump"; exit 1 }

# 3. Purge au-delà de la rétention (conserve les N derniers jours)
Get-ChildItem $BackupDir -Filter "backup-*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

# 4. Copie hors-machine (clé USB) si un lecteur est fourni
if ($UsbDrive -and (Test-Path $UsbDrive)) {
  $target = Join-Path $UsbDrive "atelierone"
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item $file (Join-Path $target (Split-Path $file -Leaf)) -Force
  Write-Host "Copie hors-machine -> $target"
}

Write-Host "Sauvegarde OK : $file"
```

### Lancer une sauvegarde manuelle
```powershell
cd C:\atelierone
.\scripts\backup.ps1
```

---

## 3. Automatiser avec le Planificateur Windows

Créez une tâche quotidienne à 02h00 exécutant le script **même si l'utilisateur est déconnecté** :

```powershell
# Adapter "SRV-ATELIER\COMPTE_ADMIN" au compte Windows qui a les droits
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\atelierone\scripts\backup.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
$principal = New-ScheduledTaskPrincipal -UserId "SRV-ATELIER\COMPTE_ADMIN" `
  -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName "AtelierOne-Backup" `
  -Action $action -Trigger $trigger -Principal $principal -Force

# Vérifier
Get-ScheduledTask -TaskName "AtelierOne-Backup"
```

> Pour la copie vers la clé USB : si la clé n'est pas branchée à 02h00, la copie est
> simplement ignorée (le backup local a quand même lieu). Pensez à **brancher la clé la nuit**.

---

## 4. Restauration : `restore.ps1`

⚠️ Destructif : **écrase** la base cible. À n'exécuter qu'en cas de besoin réel et après
avoir vérifié le backup.

```powershell
# restore.ps1 — Restaure un backup .dump dans une base cible
param(
  [Parameter(Mandatory=$true)][string]$BackupFile,      # chemin du .dump
  [string]$DbUser = "postgres",
  [string]$DbName = "atelierone_erp",
  [string]$PgPassword = "MDP_POSTGRES",                 # <-- À ADAPTER
  [string]$PgHost = "localhost"
)

$pgRestore = "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"

if (-not (Test-Path $BackupFile)) { Write-Error "Backup introuvable : $BackupFile"; exit 1 }

# 1. Double confirmation (jamais de restauration tête baissée)
$confirm = Read-Host "Attention: ecrase la base '$DbName' avec '$BackupFile'. Tapez OUI pour continuer"
if ($confirm -ne "OUI") { Write-Host "Annulé."; exit 0 }

# 2. Sauvegarde de sécurite de l'état actuel AVANT d'écraser (filet de secours)
$env:PGPASSWORD = $PgPassword
$pre = "C:\atelierone\backups\pre-restore-$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -Fc -U $DbUser -h $PgHost -d $DbName -f $pre
Write-Host "Sauvegarde de sécurite : $pre"

# 3. Cible : recréer une base propre pour éviter les conflits d'objets
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U $DbUser -h $PgHost -c "DROP DATABASE IF EXISTS $DbName;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U $DbUser -h $PgHost -c "CREATE DATABASE $DbName;"

# 4. Restaurer (--clean --if-exists évite les erreurs sur objets existants)
& $pgRestore -U $DbUser -h $PgHost -d $DbName --clean --if-exists --no-owner $BackupFile
if ($LASTEXITCODE -ne 0) { Write-Error "Echec restauration"; exit 1 }

Write-Host "Restauration OK depuis $BackupFile"
```

### Restaurer
```powershell
cd C:\atelierone
.\scripts\restore.ps1 -BackupFile "C:\atelierone\backups\backup-20260814_020000.dump"
```

> Après restauration, **redémarrez PM2** : `pm2 restart atelierone`. (Pas de mismatch si la
> version du schéma correspond au build ; sinon voir fichier 05.)

---

## 5. Vérifier qu'une sauvegarde est exploitable

Après une sauvegarde, contrôlez l'intégrité :

```powershell
# Lister les backups
Get-ChildItem C:\atelierone\backups\backup-*.dump | Sort-Object LastWriteTime -Descending | Select-Object Name,Length,LastWriteTime
```

**Test de restauration mensuel (essentiel)** : 1×/mois, sur une base de TEST, pas la prod :

```powershell
# Créer une base de test et restaurer dedans
$env:PGPASSWORD = "MDP_POSTGRES"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE atelierone_test;"
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -h localhost -d atelierone_test --clean --if-exists "C:\atelierone\backups\backup-XXXX.dump"

# Vérifier qu'on retrouve les données attendues
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d atelierone_test -c "SELECT count(*) AS clients FROM clients;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d atelierone_test -c "SELECT count(*) AS or FROM ordres_reparation;"

# Nettoyer la base de test
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "DROP DATABASE atelierone_test;"
```

> Si `clients` et `ordres_reparation` contiennent des valeurs cohérentes, le backup est bon.

---

## 6. Ce que couvre la sauvegarde

- Toutes les tables applicatives : clients, véhicules, ordres de réparation, lignes, pièces,
  pointages, factures, utilisateurs…
- Le **fichier physique** (photos/pièces jointes le cas échéant) doit être sauvegardé
  **séparément** s'il existe un répertoire `uploads/` — renseignez le chemin dans le script
  de copie hors-machine. (Par défaut les chemins d'upload du fichier 02 ne créent pas de
  répertoire uploads tant que la fonctionnalité n'est pas utilisée.)

---

## 7. Récapitulatif

| Action | Quand | Qui |
|--------|-------|-----|
| `backup.ps1` | Quotidien 02h00 (auto) | Planificateur Windows |
| Copie clé USB | Quotidien (dans backup.ps1) | Clé branchée la nuit |
| Purge > 30 jours | Dans backup.ps1 | Auto |
| Test de restauration | Mensuel | Exploitant |
| Restauration réelle | En cas de sinistre | Exploitant (double confirmation) |

Passez au fichier **05 — MISE À JOUR SANS CASSE** (`deploy-local.ps1`) qui **utilise
automatiquement la sauvegarde** avant toute modification de la base.
