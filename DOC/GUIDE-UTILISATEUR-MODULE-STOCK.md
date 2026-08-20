# GUIDE UTILISATEUR — MODULE STOCK / MAGASIN
## AtelierOne — Garage Polyvalent Junior (GPJ)

> **Version :** 1.0 — couvre le module Stock & Approvisionnement (catalogue, mouvements, inventaire, reconditionnement, emplacements, alertes)
> **Public :** Magasinier, Chef d'atelier, Secrétaire/Admin, Dirigeant
> **Prérequis techniques :** aucun — ce guide explique tout, y compris la configuration initiale.

---

## Sommaire

1. [Introduction et objectifs du module](#1-introduction-et-objectifs-du-module)
2. [Accès et droits selon les profils](#2-accès-et-droits-selon-les-profils)
3. [Présentation des écrans principaux](#3-présentation-des-écrans-principaux)
4. [Configuration initiale (articles, unités, emplacements)](#4-configuration-initiale)
5. [Comment faire un inventaire initial](#5-comment-faire-un-inventaire-initial)
6. [Comment enregistrer une réception (entrée de stock)](#6-comment-enregistrer-une-réception)
7. [Comment faire un reconditionnement d'huile (fût → bidons)](#7-comment-faire-un-reconditionnement-dhuile)
8. [Comment sortir une pièce pour un OR](#8-comment-sortir-une-pièce-pour-un-or)
9. [Comment enregistrer une perte / un vol](#9-comment-enregistrer-une-perte--un-vol)
10. [Comment consulter les alertes et le tableau de bord](#10-comment-consulter-les-alertes-et-le-tableau-de-bord)
11. [Comment faire un inventaire cyclique](#11-comment-faire-un-inventaire-cyclique)
12. [Bonnes pratiques quotidiennes du magasinier](#12-bonnes-pratiques-quotidiennes-du-magasinier)
13. [FAQ / Erreurs fréquentes](#13-faq--erreurs-fréquentes)
14. [Glossaire](#14-glossaire)

---

## 1. Introduction et objectifs du module

Le module **Stock / Magasin** est la **source de vérité** du stock du garage. Il gère :

| Domaine | Ce que le module gère |
|---|---|
| **Catalogue** | Articles (pièces, consommables, huiles), catégories, unités, prix, seuils |
| **Emplacements** | Rayonnage codifié ZONE-ALLEE-RAYON-NIVEAU, contenu par emplacement |
| **Mouvements** | Entrées, sorties, transferts, ajustements — **tous tracés, jamais supprimables** |
| **Inventaire** | Inventaire initial + inventaires cycliques avec calcul des écarts |
| **Reconditionnement** | Transformation fût 200L → bidons 5L (huiles et fluides) |
| **Pertes & vols** | Déclarations avec motif obligatoire, impact sur la valeur du stock |
| **Alertes** | Ruptures, stocks bas, surstock, dormants, mouvements suspects |
| **Pilotage** | Valeur du stock, KPI, vue d'ensemble |

**Objectifs mesurables :**
- 100 % des mouvements ont un motif + utilisateur + date + document lié
- Aucune sortie non enregistrée (toute pièce sortie est liée à un OR, une vente ou un ajustement)
- Reconditionnement maîtrisé et tracé
- Ruptures et stocks bas visibles en < 5 secondes
- Écart d'inventaire physique vs théorique < 5 % après 2 cycles

---

## 2. Accès et droits selon les profils

| Action | Magasinier | Chef d'atelier | Dirigeant | Technicien | Secrétaire |
|---|---|---|---|---|---|
| Consulter le stock, alertes, mouvements | ✅ | ✅ | ✅ | ✅ | ❌ |
| Créer/modifier des articles (catalogue) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Créer un mouvement (entrée, sortie, ajustement, perte) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Effectuer un inventaire | ✅ | ❌ | ✅ | ❌ | ❌ |
| Reconditionner, transférer, mettre en rayon | ✅ | ✅ | ✅ | ❌ | ❌ |

> Les boutons auxquels vous n'avez pas accès sont **masqués ou désactivés**. Le serveur vérifie toujours les permissions (aucun contournement possible).

---

## 3. Présentation des écrans principaux

| Écran | Adresse | Rôle |
|---|---|---|
| Articles / Catalogue | `/dashboard/catalog` | Création et gestion des articles, catégories, unités, prix |
| Vue d'ensemble | `/dashboard/stock/apercu` | KPI valeur du stock, ruptures, bas, surstock, alertes |
| Mouvements de stock | `/dashboard/stock/mouvements` | Historique complet tracé |
| Inventaire | `/dashboard/stock/inventaire` | Sessions d'inventaire (initial + cyclique) |
| Reconditionnement | `/dashboard/stock/reconditionnement` | Fût → unités plus petites |
| Déconditionnement | `/dashboard/stock/deconditionnement` | Grande unité → unités (à la vente) |
| Ajustement manuel / Pertes | `/dashboard/stock/ajustement-manuel` | Corrections et déclarations de pertes |
| Transfert | `/dashboard/stock/transfert` | Déplacement entre emplacements |
| Mise en rayon | `/dashboard/stock/mise-en-rayon` | Stock général → rayon |
| Emplacements | `/dashboard/stock/emplacements` | Rayonnage codifié et contenu |
| Prévisions d'achat | `/dashboard/stock/previsions` | Réapprovisionnement suggéré |
| Commandes fournisseurs | `/dashboard/procurement` | Commandes locales et import |
| Réceptions | `/dashboard/procurement/receptions` | Contrôle à l'arrivée |
| Fournisseurs | `/dashboard/suppliers` | Fiches fournisseurs |
| Aide & Documentation | `/dashboard/stock/aide` | Ce guide, en ligne, avec recherche |

---

## 4. Configuration initiale

> ⚠️ **À faire avant d'utiliser le module** : créer les articles, les unités et les emplacements, puis lancer l'inventaire initial.

### 4.1 Créer les catégories

1. **Articles / Catalogue** → **Catégories**.
2. Créez les catégories principales : Filtres, Freinage, Lubrifiants & Fluides, Électricité & Éclairage, Distribution & Transmission, Suspension & Direction, Pneumatiques & Jantes, Refroidissement & Échappement, Carrosserie & Vitrage, Consommables & Divers.
3. Créez les sous-catégories (ex. : Filtres → Huile/Air/Habitacle/Carburant).

### 4.2 Créer les articles

Pour chaque pièce : **Articles / Catalogue → + Nouveau** :
- **Code barre** (généré automatiquement ou saisi — unique)
- **Désignation** (titre), marque, référence constructeur
- **Catégorie** (ou sous-catégorie)
- **Unité de base** (PCE = pièce, LIT = litre, etc.)
- **Prix** : vente, minimum de vente, achat
- **Seuils** : seuil d'alerte (stock bas), seuil critique, stock maximum
- **Emplacement principal** (optionnel)
- **Reconditionnable** : cocher pour les huiles en fût
- **Origine / Qualité** (specs V2) : Constructeur (Genuine), OEM équivalent, Aftermarket ou Autre — reflète la qualité de la pièce
- **DLC** (specs V2) : délai d'alerte avant péremption en jours (fluides, colles…) — le tableau de bord alerte avant péremption et **la sortie est bloquée si le stock est périmé** (specs V2 §05 règle 8)
- **Équivalences / Supersession** : dans la fiche article, ajouter la pièce remplaçante (SUPERSESSION) ou interchangeables (même pièce sous une autre référence)

### 4.3 Créer les unités de conversion

Dans la fiche article, onglet unités :
- Unité de base avec **facteur 1**
- Unités dérivées avec leur facteur (ex. : **FUT = 200** pour un fût de 200 L, **BID = 5** pour un bidon de 5 L)

> Ces facteurs servent au calcul automatique du reconditionnement : 1 fût (200 L) ÷ 1 bidon (5 L) = **40 bidons**.

### 4.4 Créer les emplacements

**Emplacements → Nouvel emplacement**, au format **ZONE-ALLEE-RAYON-NIVEAU** :
- `MAG-A-01-03` → Magasin, Allée A, Rayon 01, Niveau 3
- `MAG-B-02-SOL` → Sol
- `EXT-PNEU` → Zone extérieure pneus
- `BUR-PATRON` → Bureau du patron (stock temporaire à résorber)

**Règles de rangement intelligentes :**
- Pièces lourdes / volumineuses en bas
- Pièces à forte rotation à hauteur d'homme et près de la sortie atelier
- Fluides isolés (rétention) · Batteries sur support adapté · Petites pièces en tiroirs/bacs codés

---

## 5. Comment faire un inventaire initial

> **Priorité absolue** : le garage a déjà des pièces en magasin — l'inventaire initial crée le stock de départ avec traçabilité.

1. **Inventaire** → **+ Nouvelle session** (libellé « Inventaire initial »).
2. Pour chaque article : saisir la **quantité physique** présente.
3. Le système compare avec la **quantité théorique** (souvent 0 au démarrage) et calcule l'**écart**.
4. **Valider** : les écarts génèrent automatiquement des **mouvements d'ajustement historisés** (référence `INV-INIT-{n}`) — le stock théorique devient égal au stock physique.
5. L'historique est conservé : on sait **qui** a compté, **quand**, et **quel écart** a été corrigé.

> 💡 L'inventaire initial peut aussi être réalisé en une passe avec des quantités directes (bouton dédié) : 2 champs par article (produit + quantité), validation immédiate.

---

## 6. Comment enregistrer une réception

1. **Commandes fournisseurs** (`/dashboard/procurement`) → créez la commande (locale ou import).
2. À la réception : **Réceptions** → saisissez les quantités reçues.
3. Le contrôle qualité simple : **Bon** / **Réserves** (écarts).
4. La validation génère le **mouvement d'entrée** + met à jour le **PMP** (prix moyen pondéré) et le **dernier prix d'achat**.

> 💡 Sans commande, une entrée peut être faite via un **ajustement positif** (Ajustement manuel) — mais la réception liée à une commande est recommandée pour la traçabilité.

---

## 7. Comment faire un reconditionnement d'huile

> **Processus critique** : les huiles arrivent en fûts de 200 L et doivent être reconditionnées en bidons (5 L, 1 L…) avant utilisation.

1. **Articles / Catalogue** : créez l'article source **« Fût 200L Huile 5W30 »** avec les unités (base LIT + FUT=200) et cochez **Reconditionnable**.
2. Créez l'article cible **« Bidon 5L Huile 5W30 »** avec les unités (base LIT + BID=5).
3. **Reconditionnement** → sélectionnez :
   - Article source (fût) + quantité source (ex. 1)
   - Article cible (bidon) + unité cible
   - Motif (ex. « Reconditionnement pour l'atelier »)
4. Le système calcule la quantité générée : **1 fût × 200 / 5 = 40 bidons**.
5. **Confirmer** : deux mouvements liés sont créés atomiquement (sortie du fût + entrée des 40 bidons), tracés avec le même groupe d'opération.

> ⚠️ Le reconditionnement est **refusé** si le stock de fûts est insuffisant ou si le ratio est incohérent (quantité générée = 0).

---

## 8. Comment sortir une pièce pour un OR

1. **Ordres de Réparation** (`/dashboard/ordres-reparation`) → ouvrez l'OR du véhicule.
2. Dans la fiche OR, section **« Sortir une pièce (liée à l'OR) »** : sélectionnez le produit + la quantité + un motif.
3. Le système vérifie le **stock disponible** (stock actuel − stock réservé) et **décrémente** automatiquement.
4. Le mouvement **SORTIE_OR** est tracé avec l'OR et le véhicule (référence `OR-{numero}`).
5. L'historique « Mouvements de stock liés à l'OR » affiche toutes les sorties/retours.
6. Si le stock est insuffisant : message « Stock disponible insuffisant » (aucun mouvement créé).

> **Règle d'or GPJ** : toute pièce sortie du magasin est imputée à un OR (ou à une vente comptoir).

### 8bis. Retour de pièce depuis l'atelier

1. Dans la fiche OR, section **« Retour de pièce (atelier → stock) »**.
2. Sélectionnez le produit + la quantité + un motif.
3. Le stock est **réintégré** et le mouvement **RETOUR_ATELIER** est tracé.

### 8ter. Réserver une pièce pour un OR (specs V2)

1. Dans la fiche OR, section **« Réservation de pièce (pour l'OR) »**.
2. Sélectionnez le produit + la quantité + un motif.
3. La pièce est **mise de côté** : le **stock disponible** (actuel − réservé) diminue, le stock actuel reste inchangé.
4. Le mouvement **RESERVATION** est tracé avec l'OR.
5. À la confirmation du client → faites une **Sortie de pièce** (la réservation est alors consommée par la sortie).
6. Si la pièce n'est finalement pas utilisée → bouton **« Libérer la réservation »** : le stock disponible est réintégré (mouvement **LIBERATION_RESERVATION**).

> 💡 La réservation permet d'attribuer une pièce rare/coûteuse à un OR sans la déduire du stock tant que la vente n'est pas confirmée. Une sortie est refusée si le stock disponible (actuel − réservé) est insuffisant.

---

## 9. Comment enregistrer une perte / un vol

1. **Ajustement manuel** → nature **Perte/Casse**.
2. Sélectionnez l'article, la quantité, le **type** (VOL, CASSE, AVARIE, REBUT).
3. **Motif obligatoire** (min. 3 caractères) — sans motif, l'enregistrement est refusé.
4. **Enregistrer** : le stock diminue, une **perte financière** est tracée (montant = quantité × coût unitaire).

> Pour les montants élevés, une double validation peut être exigée selon le paramétrage.

---

## 10. Comment consulter les alertes et le tableau de bord

**Vue d'ensemble** (`/dashboard/stock/apercu`) affiche :
- **Valeur du stock** (somme quantité × PMP)
- **Ruptures** (quantité ≤ 0) — rouge
- **Stocks bas** (quantité ≤ seuil d'alerte) — orange
- **Surstock** (quantité > stock maximum) — bleu
- **Mouvements du jour**
- **Alertes anti-vol** (ajustements suspects sur 7 jours)
- **Stocks dormants** (sans sortie depuis 90 jours, avec valeur)

Les listes sont **cliquables** : cliquez sur une alerte pour aller sur l'article.

---

## 11. Comment faire un inventaire cyclique

1. **Inventaire** → **+ Nouvelle session** (libellé « Cyclique zone A »).
2. Comptez **par zone ou par catégorie** (ex. : tous les filtres, ou l'allée A).
3. Saisissez les **quantités physiques**.
4. Le système calcule les **écarts** (physique − théorique).
5. **Valider** : les écarts génèrent les ajustements (+/-) et les pertes si négatifs.

> Objectif : après 2 cycles, l'écart global doit être < 5 % (fiabilité du stock).

---

## 12. Bonnes pratiques quotidiennes du magasinier

1. **Toujours lier une sortie à un OR ou une vente** — jamais de sortie « flottante ».
2. **Chaque pièce a un emplacement** — utilisez les transferts pour ranger ; pas de stock « au bureau du patron » durable.
3. **Reconditionnez à la demande** — ne préparez que les quantités nécessaires.
4. **Déclarez immédiatement** les pertes, casses et vols (avec motif).
5. **Consultez les alertes** chaque matin (ruptures, bas, expirations).
6. **Faites des inventaires cycliques réguliers** par zone — plus courts qu'un inventaire complet.
7. **Ne supprimez jamais un mouvement** : corrigez par un mouvement inverse avec motif « Erreur de saisie ».

---

## 13. FAQ / Erreurs fréquentes

**Q1. Je ne peux pas faire une sortie : « Stock insuffisant ».**
Le stock disponible est inférieur à la quantité demandée. Vérifiez le stock (Vue d'ensemble) ou faites une entrée/réception.

**Q2. Ma sortie de perte/vol est refusée.**
Le **motif est obligatoire** (min. 3 caractères) pour les pertes, vols, casses et ajustements.

**Q3. Le reconditionnement génère 0 bidon.**
Vérifiez les **unités et facteurs** : le fût doit avoir une unité FUT (facteur 200) et le bidon une unité BID (facteur 5). Ratio = 200/5 = 40.

**Q4. J'ai fait une erreur de saisie de quantité.**
Créez un **mouvement inverse** (ajustement) avec le motif « Erreur de saisie ». Aucun mouvement ne peut être supprimé.

**Q5. La valeur du stock affiche 0.**
Le **coût unitaire moyen (PMP)** n'est pas encore valorisé. Il se met à jour lors des réceptions avec prix.

**Q6. Comment créer un article reconditionnable ?**
Dans la fiche article, cochez **Reconditionnable** et définissez les unités avec facteurs (FUT, BID...).

**Q7. Où voir le contenu d'un emplacement ?**
**Emplacements** → cliquez sur un emplacement : liste des articles, quantités et valeurs.

**Q8. Un article est en surstock, que faire ?**
Réduisez les commandes de cet article ou lancez une promotion. Le KPI Surstock le signale.

**Q9. Comment connaître la valeur de mes pièces dormantes ?**
**Vue d'ensemble → Stocks dormants** : quantité, valeur, dernière vente.

**Q10. Puis-je avoir plusieurs emplacements pour un article ?**
Oui : le stock est géré par article + emplacement + lot (répartition visible dans Emplacements).

---

## 14. Glossaire

| Terme | Définition |
|---|---|
| **PMP** | Prix Moyen Pondéré — coût unitaire recalculé à chaque entrée valorisée |
| **OR** | Ordre de Réparation |
| **Reconditionnement** | Transformation d'une grande unité (fût) en unités plus petites utilisables |
| **Emplacement** | Localisation physique précise (ZONE-ALLEE-RAYON-NIVEAU) |
| **Mouvement** | Toute opération qui impacte le stock (entrée, sortie, transfert, ajustement…) |
| **Rupture** | Stock ≤ 0 |
| **Stock bas** | Stock ≤ quantité minimum (seuil d'alerte) |
| **Surstock** | Stock > stock maximum |
| **Dormant** | Article avec stock > 0 sans sortie depuis X jours (90 par défaut) |
| **Hors série** | Article qui n'est plus approvisionné |
| **Obsolète** | Article techniquement dépassé ou plus utilisé |
| **Groupe d'opération** | Identifiant commun à des mouvements liés (reconditionnement, transfert) |
| **Inventaire initial** | Session qui crée le stock de départ avec ajustements historisés |
| **Inventaire cyclique** | Comptage partiel (zone/catégorie) avec calcul des écarts |

---

*Fin du guide — AtelierOne, module Stock / Magasin. Pour toute question, utilisez le bouton « ? » dans l'application (aide contextuelle et Centre d'aide).*
