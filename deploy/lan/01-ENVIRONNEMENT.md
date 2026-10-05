# 01 — Environnement matériel, logiciel et réseau

Avant d'installer quoi que ce soit, listez l'équipement. Ce fichier décrit le **minimum
recommandé** pour une exploitation fluide à 4-6 postes sur un LAN de garage.

---

## 1. Matériel serveur (machine dédiée)

> Recommandation : **Windows 10/11 Pro** sur un PC dédié (ancien PC, mini-PC, barebone).
> Une machine dédiée évite que le développement coexiste avec la production locale.

| Composant | Recommandation | Minimum |
|-----------|----------------|---------|
| Processeur | 4 cœurs (Intel i3/Ryzen 3+) | 2 cœurs |
| Mémoire | 8 Go DDR4 | 4 Go |
| Stockage | SSD 256 Go (NVMe conseillé) | HDD 512 Go |
| Alimentation | UPS 600 VA (30 min) | — recommandé fortement |
| Réseau | Câble RJ45 GbE | Wi-Fi 5 GHz |
| Système | Windows 10/11 **Pro** | Windows 10/11 Famille |

- **UPS obligatoire** : une coupure pendant une écriture base = base corrompue. C'est le
  point #1 des pertes de données en petit environnement.
- Windows Pro permet les fonctionnalités de verrouillage utiles (BitLocker optionnel,
  Join du domaine si présent). La Famille fonctionne néanmoins.

---

## 2. Matériel clients (4 postes)

Aucune installation requise : chaque poste n'a besoin que d'un **navigateur moderne**.

| Poste | Emplacement | Rôle |
|-------|-------------|------|
| Poste réception | Bureau d'accueil | Saisir les fiches de réception véhicule |
| Poste magasinier | Magasin pièces | Gérer les demandes de pièces et le stock |
| Poste chef atelier | Atelier | Suivre les OR, devis, validations, planning |
| Poste boss | Bureau direction | Tableaux de bord, facturation, paramètres |

- Navigateurs supportés : **Chrome / Edge** (recommandés), Firefox. Éviter les navigateurs
  obsolètes.
- Un même poste peut servir plusieurs rôles (connexion avec le compte adéquat).

---

## 3. Réseau local (LAN)

```
                         +---------------------------+
                         |         ROUTEUR LAN       |
                         |   (adresse 192.168.1.1)   |
                         +-------------+-------------+
                                       |
                    +------------------+------------------+
                    |                  |                  |
          +---------+----+     +-------+--------+  +------+------+
          |  SERVEUR      |     |  SWITCH (si >4 |  |  IMPRIMANTE  |
          |  192.168.1.100|     |  postes)       |  |  (option)    |
          +---------+-----+     +-------+--------+  +-------------+
                    |                    |
          +---------+-----+      +-------+--------+
          |  IP fixe       |      |  Réception /  |
          |  (Réservation   |      |  Magasinier /  |
          |   DHCP)         |      |  Chef / Boss   |
          +-----------------+      +----------------+
```

### 3.1 Règles
- **IP fixe réservée** pour le serveur (ex. `192.168.1.100`) via **réservation DHCP** dans
  le routeur (optionnel mais recommandé, évite les conflits).
- Les clients peuvent être en DHCP (rien à configurer).
- Le plus simple : accès clients via `http://192.168.1.100:3000` (aucun nom DNS nécessaire).

### 3.2 Quatre valeurs à connaître AVANT de commencer
1. **IP du serveur** : ex. `192.168.1.100`
2. **Mot de passe PostgreSQL** : mot de passe fort de votre choix
3. **AUTH_SECRET** : généré par le bloc fourni au fichier 02 (étape 6)
4. **Nom du compte Windows serveur** : le compte qui exécutera l'application

---

## 4. Logiciels serveur à installer (versions exactes)

> Versions verrouillées sur le projet pour la reproductibilité.

| Logiciel | Version | Pourquoi |
|----------|---------|----------|
| Windows 10/11 Pro | à jour (mises à jour Windows) | Système d'exploitation |
| **Node.js** | **20 LTS** (v20.x) | Runtime Next.js (le projet déclare `engines.node >=18` ; 20 = cible prod documentée) |
| **pnpm** | **10.19.0** | Gestionnaire de paquets (c'est le `packageManager` verrouillé du repo) |
| **PostgreSQL** | **17** | Base de données (déjà en 17 sur le poste de dev) |
| **PM2** | dernière (`npm i -g pm2`) | Supervision/relance auto du process Node |
| **Git** | dernière | Récupération/mise à jour du code | 
| Nginx | optionnel | Reverse proxy HTTP(S) — non requis en LAN pur (optionnel) |

### Équivalents/toggles du repo (vérifiés)
- `packages/db` dispose de `drizzle-kit migrate` (**incrémental**, sûr) — c'est la commande
  utilisée par les mises à jour du fichier 05.
- `scripts/deploy.mjs local` (**destructif**) — utilisé uniquement en installation initiale
  (fichier 02, étape 8). Ne jamais relancer sur une base en exploitation.
- `scripts/db-switch.mjs local` — force la base sur le PostgreSQL local.

---

## 5. Prévoir aussi

- **Clé USB dédiée** (ou 2e disque réseau) pour la **sauvegarde hors-machine** (fichier 04) :
  indispensable contre la perte en cas de panne du serveur.
- **Document de secours imprimé** : IP du serveur, URL d'accès, mots de passe principaux
  (PostgreSQL + AUTH_SECRET), procédure de redémarrage courte — à ranger dans le garage.
- **Carnet de versions** : notez à chaque mise à jour la date et le numéro de commit / backup
  (cf. fichier 05).

---

## 6. Cartographie des fichiers de ce dossier

| Fichier | Contenu |
|---------|---------|
| `00-LISEZMOI.md` | Vue d'ensemble + avertissements |
| `01-ENVIRONNEMENT.md` | Ce document |
| `02-FICHE-DEPLOIEMENT.md` | Installation point par point |
| `03-SECURITE.md` | Verrouillage et comptes |
| `04-SAUVEGARDE.md` | Sauvegarde/restauration |
| `05-CI-CD-LOCAL.md` | Mises à jour sans casse + rollback |

Passez maintenant au fichier **02 — FICHE DE DÉPLOIEMENT**.
