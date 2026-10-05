# 03 — Sécurité du déploiement LAN

Objectif : rendre l'installation sûre sans complexité inutile pour un petit réseau fermé.

---

## 1. Secrets (à ne jamais committer)

| Secret | Règle |
|--------|-------|
| `AUTH_SECRET` | **32+ caractères aléatoires** (générateur au fichier 02 é.6). Jamais dans `git`. |
| `DATABASE_URL` (mot de passe PostgreSQL) | Mot de passe fort, jamais par défaut (`postgres`/`postgres` interdit). |
| Mots de passe des 4 comptes métier | Min 12 caractères, propres à chaque utilisateur. |

Vérification que rien ne fuite dans le dépôt :

```powershell
cd C:\atelierone
git grep -l "AUTH_SECRET=\|postgres:postgres" -- .env* apps/nextjs/.env* packages/db/.env* 2>$null
# Aucun résultat attendu : si des fichiers apparaissent, ils doivent être dans .gitignore
```

---

## 2. PostgreSQL

- **`listen_addresses = 'localhost'`** : la base n'écoute que sur localhost (défaut).
  Aucune règle de pare-feu n'ouvre le 5432 → les postes clients ne peuvent pas atteindre la base.
- **Mot de passe super-utilisateur fort** défini à la création (fichier 02 é.3).
- Créer un **utilisateur applicatif dédié** (recommandé, optionnel) au lieu d'utiliser `postgres` :

```powershell
$env:PGPASSWORD = "MDP_POSTGRES"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE atelierone WITH LOGIN PASSWORD 'MDP_APPLI_FORT' CREATEDB;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE atelierone_erp TO atelierone;"
```

> Si vous passez sur l'utilisateur `atelierone`, mettez à jour `DATABASE_URL` dans les 3
> fichiers env (racine, `apps/nextjs/.env.local`, `packages/db/.env`) puis redémarrez PM2.

---

## 3. Pare-feu Windows

**Une seule règle entrante** : le port 3000, profil **Privé** (le réseau local du garage).

```powershell
# Vérifier l'état des profils
Get-NetFirewallProfile | Select-Object Name, Enabled

# Règle déjà créée au fichier 02 — confirmer qu'elle existe
Get-NetFirewallRule -DisplayName "AtelierOne Web (3000)" -ErrorAction SilentlyContinue

# Au besoin, interdiction explicite du 5432 (verrouillage défensif)
New-NetFirewallRule -DisplayName "BLOCK PG LAN (5432)" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Block -Profile Any
```

> Le serveur étant en profil **Privé**, tout le trafic du LAN passe ; le port 3000 est ouvert
> au réseau privé seulement (pas au Public). Si le serveur est connecté à un Wi-Fi public,
> passez l'interface en **Réseau privé**.

---

## 4. HTTPS sur le LAN ?

**Recommandation pour un LAN clos** : rester en **HTTP** sur port 3000, sans certificat.

- Le LAN est un réseau privé de confiance ; un certificat auto-signé n'ajoute pas de réel
  bénéfice et **complexifie** : les navigateurs affichent un avertissement et, surtout,
  NextAuth exige des cookies `secure` en HTTPS (casse la connexion si mal configuré).
- L'accès HTTP LAN avec cookie non-secure par défaut fonctionne sans friction.

Si vous tenez à HTTPS (accès depuis l'extérieur un jour, ou exigence interne) :

```powershell
# Générer un certificat auto-signé (remplacer IP et dossier)
New-SelfSignedCertificate -DnsName "192.168.1.100" `
  -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(2)
# Puis configurez un reverse proxy TLS (n'utilisez PAS NEXTAUTH en HTTP+secure) 
```

> Dans ce cas uniquement, mettez `AUTH_TRUST_HOST=true` et gérez la terminaison TLS du côté
> proxy. C'est de la configuration avancée — hors périmètre du guide de base.

---

## 5. Comptes et permissions

### 5.1 Sécuriser le compte seed
Au premier démarrage : connectez-vous `admin@gpj.cm`, **changez le mot de passe**, ne
l'utilisez plus ensuite pour le quotidien.

### 5.2 Créer 4 comptes à permissions minimales
La liste des permissions du module est dans `apps/nextjs/src/lib/module-permissions.ts`.
Créez chaque compte avec **uniquement** ce dont il a besoin :

| Rôle | Permissions suggérées |
|------|-----------------------|
| Réception | `vehicules.*`, `or.receptionner`/`or.creer`, `or.consulter`, clients de base |
| Magasinier | stock / pièces / demandes de pièces / fournisseurs (lecture) |
| Chef d'atelier | `or.consulter`, `or.creer`, diagnostic, devis, planning, contrôle qualité |
| Boss | `or.consulter`, tableaux de bord, facturation, paramètres (lecture applicative) |

> Chaque rôle voit **masqués/désactivés** les boutons sans permission (l'UI le gère déjà :
> règle UX du projet). Un clic sur une action non autorisée affiche un refus clair côté serveur.

---

## 6. Sauvegarde hors-machine

Renvoyé en détail au fichier **04**. Points clés :
- Backup `pg_dump` quotidien automatisé (Planificateur Windows).
- **Copie hors-machine** vers une clé USB dédiée (rotative) : protège contre la panne du serveur,
  pas seulement contre l'erreur utilisateur.
- **Restauration testée** au moins 1×/mois (procédure fichier 04).

---

## 7. Checklist finale (à cocher avant mise en service)

- [ ] `AUTH_SECRET` est un secret fort, non committé
- [ ] Mot de passe PostgreSQL ≠ `postgres`, et `<MOT DE PASSE>` remplacé partout
- [ ] `listen_addresses = localhost` (5432 non exposé) + règle BLOCK 5432 au pare-feu
- [ ] Une seule règle entrante ouverte = port 3000, profil Privé
- [ ] Mot de passe admin seed changé
- [ ] 4 comptes métier créés, permissions minimales vérifiées
- [ ] Sauvegardes automatiques en place + copie hors-machine
- [ ] Une restauration d'essai a été réalisée (fichier 04)
- [ ] Les deux avertissements du `00-LISEZMOI` sont compris par l'exploitant
