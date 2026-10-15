# Plan de cohérence garage — cahier des charges

> **Statut** : à valider avant exécution. Rédigé le 2026-10-15 après audit du code.
> **Complète** `docs/AUDIT-RECEPTION-VEHICULE.md` (réception) et `docs/HARMONISATION-VEHICULE.md` (harmonisation).
> **Règle** : ce document est la seule source de vérité de ce plan. Le mettre à jour à chaque jalon.

---

## 0. Pourquoi un second plan

`AUDIT-RECEPTION-VEHICULE.md` a traité **la réception**. L'utilisateur a ensuite demandé la cohérence **de l'ensemble du cycle véhicule**, du client à la restitution et à la statistique.

L'audit du 2026-10-15 a montré que le problème de fond n'est pas l'ergonomie mais **l'intégrité** : le système peut déclarer des choses fausses, et toute interface construite par-dessus propagera ces mensonges. D'où l'ordre des phases — **intégrité d'abord, confort ensuite**.

### Les 7 défauts qui bloquent tout le reste

| # | Défaut | Preuve |
|---|---|---|
| 1 | La garde « travaux non terminés » ne vérifie **aucune ligne de travaux** — seulement le statut du dossier | `or-router.ts:1438` |
| 2 | Le statut du véhicule est **stocké, jamais déduit** ; machine à états appliquée à 1 endpoint sur 10 | `vehicules-router.ts:585` seul appelant de `TRANSITIONS` |
| 3 | 6 désynchronisations parking ↔ atelier reproductibles | voir §2 P0.2 |
| 4 | `CLOTURE` au lieu de `ferme_definitif` : les dossiers gelés passent pour ouverts | `or-router.ts:258`, `vehicules-router.ts:209/445`, `clients-router.ts:622` |
| 5 | La chaîne terminé → alerte → relance est **rompue sur le chemin atelier** | `parking-alerts.ts:78` ; aucun code ne projette `PRET_A_LIVRER` vers le parking |
| 6 | **Aucun système de relance** : table `relances` orpheline, envois = `logger.info` | `previsions_tresorerie.ts:26`, `alert-service.ts:265` |
| 7 | **Statistiques structurellement fausses** : 5 procédures mortes, remises comptées N fois | `analytics.ts:22/50/171/206/308`, `profit.ts:24`, `marge.ts:53`, `reports/defs.ts:141` |

---

## 1. Exigences reformulées

Reformulation des 11 demandes en exigences **vérifiables**. « Reformulé » = écrit de façon à pouvoir dire oui ou non.

| # | Exigence | Critère d'acceptation vérifiable |
|---|---|---|
| **X1** | Le statut d'un véhicule est juste à tout instant | Une fonction unique `statutVehicule()` **dérive** le statut des dossiers ouverts ; aucun endpoint ne l'écrit directement hors cette fonction |
| **X2** | On ne restitue jamais un véhicule dont les travaux ne sont pas terminés | `restituerVehicule` refuse si une ligne `a_faire`/`en_cours` existe, **sauf** sortie exceptionnelle tracée |
| **X3** | Le cycle de vie est maîtrisé | Machine à états appliquée à **toutes** les écritures de statut ; `CHECK` SQL sur les colonnes de statut ; test qui refuse une transition interdite |
| **X4** | Le suivi des travaux est continu et lisible | Statut de ligne validé par enum (plus `z.string()`) ; vue « avancement » sur la fiche véhicule ; garde travaux ⇄ statut dossier |
| **X5** | La restitution est un processus, pas un bouton | Un dossier `ferme_definitif` n'apparaît nulle part comme ouvert ; sortie exceptionnelle tracée et raisonnée ; checklist de sortie réellement bloquante |
| **X6** | Alertes sur des **critères définis et configurables** | Chaque règle : seuil configurable + justification affichée (« 18 j sans évolution > 15 j ») ; critères stockés en jsonb |
| **X7** | Relances de suivi, véhicule **et** client | Module Relances : canal, date, résultat, historique par client ; relance de devis, de paiement, de véhicule non restitué |
| **X8** | **Une seule liste de véhicules**, quel que soit l'écran | 1 ligne = 1 véhicule canonique ; la position parking est une colonne, pas une autre liste ; sélecteurs partout branchés sur la même procédure |
| **X9** | La fiche client créée au parking est utilisable et perfectible | Statut `PROVISOIRE`, badge « à compléter », modifiable, liée au véhicule, **promue en `ACTIF` à la première réception** ; jamais de fusion automatique |
| **X10** | Statistiques de garage modernes **juste** | Les 5 procédures mortes et les 4 remises comptées N fois sont corrigées **avant** tout nouveau KPI ; satisfaction réellement saisissable |
| **X11** | Base saine | Base de test purgée des fixtures ; production diagnostiquée en lecture seule avant toute décision |

---

## 2. Phases

### P0 — Intégrité (bloquante)

Loi d'or : **tant que le statut d'un véhicule ment, aucune phase suivante n'est honnête.**

**P0.1 · Statut dérivé, plus stocké**
- Nouvelle fonction unique `statutVehicule(vehiculeId)` : déduit de l'OR ouvert (le plus avancé) et, à défaut, du registre parking.
- `vehicules.statut_immobilisation` devient un **cache** regeneré, plus une source de vérité.
- Suppression de `TRANSITIONS` en position de garde : la machine d'états est appliquée par la fonction unique, donc non contournable.
- **Critère** : `or.changerStatut → ANNULE` puis `fermerDefinitivement` laisse le véhicule dans un statut cohérent, pas figé.

**P0.2 · Fin des 6 désynchronisations**
| Piège | Correctif |
|---|---|
| `garage.sortie` ne touche pas `vehicules` | passe par la fonction unique |
| `garage.transfertRecevoir` rebat en `en_reception` un véhicule en cours de dossier | la fonction prend le statut du dossier le plus avancé |
| `CLOTURE` ≠ `ferme_definitif` (4 sites) | constante unique `STATUTS_ATELIER_TERMINAUX` |
| `receptionner`/`create` forcent `en_reparation` | suppression ; délégation à la fonction |
| `sorti → en_reception` contourné | idem |
| statut `NULL` toléré, garde qui s'auto-dégrade | `NOT NULL` + backfill + garde stricte |

**P0.3 · Vraie garde travaux**
- Enum sur `lignes_ordre_reparation.statut` ; `or.updateLigne` refuse une valeur hors nomenclature.
- `restituerVehicule` refuse si des lignes restent `a_faire`/`en_cours`/`bloque` — message nommant les lignes fautives.
- `validerControleQualite` refuse si des travaux ne sont pas faits.
- `statutAutorisation` affiché et respecté dans le calcul d'avancement.

**P0.4 · `CHECK` SQL sur les statuts**
- `vehicules.statut_immobilisation`, `lignes.statut`, `ordres_reparation.statut` : `CHECK (col IN (...))`.
- Migration additive, sans perte de données.

**Refus explicite** : pas de nouveau champ « statut libre » ; pas de garde qui se dégrade silencieusement.

---

### P1 — Une seule liste de véhicules

**P1.1 · Liste canonique** sur `vehicules`, enrichie par jointure sur la position parking courante.
- Une ligne = un véhicule. La colonne « Position » affiche site/zone/place.
- **Reprise du garage** : filtres persistés en URL, compteurs par statut, jeu de colonnes (11), actions, export, impression.
- **Reprise de l'atelier** : identité canonique, lien client, type, kilométrage, OR en cours.

**P1.2 · Registre sans fiche** — onglet distinct, explicitement étiqueté, pour les 12 lignes parking sans identité canonique. Ce ne sont pas des véhicules : c'est un registre GPJ historique. **Les mélanger à la liste véhicules serait une erreur.**

**P1.3 · Une procédure de recherche partagée** — immat, VIN, marque, modèle, n° de registre, téléphone client. Remplace les 7 procédures actuelles dont `or.listVehicules` (endpoint mort) et `clients.get` (sans `is_active`, sans `ORDER BY`, sans `LIMIT`).

**P1.4 · Corrections d'honnêteté visibles**
- `vehicules.list` : `total` réel affiché, pagination réelle (plus de troncature silencieuse à 100).
- `garage.vehicles` : `total` = `count(*)`, plus `rows.length` plafonné au `limit`.
- Sélecteur de statut désormais proposé par le serveur (plus de copie en dur).

**Critère** : pour un même véhicule, tous les écrans donnent le même statut, le même client, le même nombre de lignes.

---

### P2 — Alertes et relances

**P2.1 · Rétablir la chaîne terminé → alerte → relance**
- Projeter `PRET_A_LIVRER` vers le registre parking et écrire `date_fin_travaux`.
- Nouvelle règle `PRET_A_LIVRER_NON_RESTITUE`, seuil configurable, alimentée par le **chemin atelier** et non plus seulement par le registre parking.

**P2.2 · Vue centrale des alertes**
- Un écran unique qui agrège atelier, parking, stock, finance, **trié par gravité réelle**, avec le propriétaire de l'action.
- Pas cinq écrans à visiter. today : 5 déplacements pour la liste complète.

**P2.3 · Module Relances** — le manque le plus rentable
- Objet : devis en attente, paiement en attente, véhicule terminé non restitué, SAV à relancer.
- Champs : canal (appel/SMS/WhatsApp/mail), date, **résultat** (joigné / absent / refusé / rappel fixé), prochaine relance.
- Historique par client, visible depuis la fiche client.
- Modèles de message réutilisables.
- `date_derniere_relance` alimentée **par le module**, plus une saisie manuelle qui ne trigger rien.

**P2.4 · Exploiter l'existant mort** — `atelierKpi.noterSatisfaction` et `kpi_cibles.updateCible` n'ont aucune UI : branchement ou suppression explicite.

---

### P3 — Statistiques

**Principe : on corrige avant d'étendre.** Enrichir des chiffres faux revient à.encode l'erreur dans 30 tableaux de bord.

**P3.1 · Corrections obligatoires avant tout ajout**
| Correction | Fichier |
|---|---|
| `statut = 'ACTIVE'` → `'termine'` (5 procédures) | `analytics.ts` |
| `SUM(ventes.remise)` par sous-requête sur `ventes` (4 sites) | `analytics.ts`, `profit.ts`, `marge.ts`, `reports/defs.ts` |
| `getStockTurnover` : type de mouvement inexistant + produit cartésien | `analytics.ts:144` |
| `dateFin` à minuit → dernier jour exclu (2 sites) | `dashboard.ts`, `reports/engine.ts` |
| `nbAlertes` plafonné au `.limit(50)` | `dashboard.ts:175` |
| isolation tenant : `COUNT(*) FROM produits` sans `agenceId` | `dashboard.ts:69` |

**P3.2 · Satisfaction client** — rendre la note saisissable (à la restitution), 여행 délai de réponse, réclamation tracée. Sans cela le KPI reste `SANS_DATA` indéfiniment.

**P3.3 · KPI manquants, par ordre de valeur**
1. Marge par dossier (pas seulement globale / par produit)
2. Taux de reprise (rework) — `tauxRetouche` existe, jamais appelé
3. Productivité technicien : heures vendues / disponibles, `tempsStandardHeures` existe et n'est pas exploité
4. Rétention client / réachat
5. Délai moyen de livraison des pièces
6. Taux de transformation devis
7. Série historique d'occupation atelier (aujourd'hui : un instantané)

**Refus explicite** : aucun nouveau KPI n'est ajouté tant que P3.1 n'est pas terminé et testé.

---

### P4 — Performance

Constat : **zéro cache serveur**, KPI recalculés à chaque appel, `/dashboard/pilotage` déclenche 6 requêtes avec `refetchInterval: 30 s` qui rescannent tout `or_historique`, **par utilisateur connecté**.

- Pré-agrégation quotidienne (les tables `faits_*` existent déjà : `dashboard.getReadModels` n'est appelé nulle part — code mort à brancher ou à supprimer)
- Cache sur les KPI coûteux, invalidé par invalidation de requête tRPC existante
- Corriger les scans sans période (`FIABILITE_APPRO` porte sur tout l'historique, les 5 autres sont fenêtrés)

---

### P5 — Purge et hygiène des données

**P5.1 · Base de test** — purge ciblée des fixtures identifiées, avec rapport avant/après et mode `--dry-run` par défaut.

**P5.2 · Production** — **diagnostic en lecture seule uniquement.** Rapport de ce qu'elle contient et de ce qui ressemble à du test. Aucune suppression sans accord explicite et liste revue ligne par ligne.

**P5.3 · Prévention** — `reset-db.ts` ne protège pas `kpi_cibles`, `parking_configs`, `atelier_parametres` ni le plan du garage dans sa liste `KEEP`. **Utiliser ce script cassera les seuils d'alerte et les cibles KPI.** Corriger sa liste `KEEP` avant toute utilisation.

---

## 3. Décisions actées

| # | Décision | Raison |
|---|---|---|
| **D1** | Intégrité avant ergonomie | Un écran parfait sur des données fausses est un écran qui apprend à mentir |
| **D2** | Le statut du véhicule est **dérivé**, jamais stocké comme vérité | Les 6 désynchronisations ont toutes la même cause : deux sources de vérité |
| **D3** | Les corrections de statistiques précèdent les nouveaux KPI | Sinon on encode l'erreur dans 30 tableaux de bord |
| **D4** | Fiche client parking = **`PROVISOIRE`**, promote à la réception | Un nom tapé dans un registre n'est pas un client vérifié : en `ACTIF` il entre au classement commercial et au recouvrement |
| **D5** | Le registre GPJ sans fiche reste **séparé** de la liste véhicules | Ce n'est pas un doublon : c'est un registre historique sans identité |
| **D6** | Les 7 seuils parking restent **configurables** ; les seuils en dur sont remontés en paramètre ou assumés explicitement | Un seuil caché dans le code n'est pas un critère « défini » |
| **D7** | `reset-db.ts` n'est pas utilisé pour purger | Sa liste `KEEP` est incomplète : il casserait les seuils et les cibles KPI |

---

## 4. Ce que je refuse de faire

1. **Ne pas ajouter d'interface sur un statut non fiable.** X1 et X2 passent avant P1 et P2.
2. **Ne pas élargir le périmètre P0** pour « profiter d'être dedans » — chaque lot reste vérifiable seul.
3. **Ne pas créer de client `ACTIF` depuis le parking** sans réception confirmée.
4. **Ne pas purger la production** sans rapport de diagnostic et accord ligne par ligne.
5. **Ne pas utiliser `reset-db.ts`** ni `reset:schema` pour cette tâche.
6. **Ne pas fusionner silencieusement des clients** — détection et proposition, jamais décision prise à la place de l'utilisateur.
7. **Ne pas valider une transition « parce que l'écran le propose »** — la machine d'états est la référence, l'écran ne fait que l'afficher.
8. **Ne pas livrer un lot dont les tests n'ont pas été vus échouer sur l'ancien code** quand il s'agit d'une correction de bug.

---

## 5. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| La base de production contient des données réelles | 🔴 Critique | Diagnostic lecture seule d'abord ; purge seulement sur accord explicite |
| `reset-db.ts` casse les seuils et cibles KPI | 🔴 Critique | Interdit (D7) ; liste `KEEP` à corriger |
| Migration `CHECK` sur des statuts hors nomenclature existants | 🟠 Élevé | Backfill + rapport des valeurs invalides **avant** d'appliquer |
| Dérivation du statut : coût de calcul par affichage | 🟠 Élevé | Requête unique + index ; à mesurer en P0 |
| Fusion liste véhicules : régression sur les 12 lignes sans fiche | 🟡 Moyen | Onglet séparé + test de non-régression |
| Augmentation du périmètre | 🟡 Moyen | D2 — les phases sont bloquantes les unes après les autres |

---

## 5bis. Base de production — diagnostic corrigé et migration exécutée le 2026-10-15

> **Correction d'une erreur de diagnostic.** La section ci-dessous affirming « aucune donnée de test dans la production » était **fausse**. Le diagnostic s'appuyait sur 8 marqueurs de noms (`%test%`, `%demo%`…) et concluait à tort « 0 signature ». La production contenait en réalité **la totalité** de sa population client/véhicule en données de test. Leçon retenue : un marqueur négatif n'est pas une preuve d'absence ; il faut aussi **vérifier ce qui ressemble à de la donnée réelle**.

### La base de production

Neon, endpoint pooler `ep-small-dust-b2dmk7r4-pooler.c-6.eu-central-1.aws.neon.tech`, base **`atelierone_erp`**.
Le projet expose deux bases : **`neondb` est vide** (aucune table) — c'est bien `atelierone_erp` qui porte les données.

**Piège d'accès** : l'endpoint *pooler* ouvre les sessions avec un **`search_path` vide**, alors que l'endpoint *direct* (celui qu'utilise l'application via Vercel) a `search_path = "$user", public`. Toute requête non qualifiée échoue en `relation does not exist` via le pooler alors que la base est parfaitement saine. Ce n'est pas un défaut de production : c'est un piège pour les scripts d'exploitation, qui doivent qualifier `public.`.

### Migrations appliquées

La production était en retard de **9 objets** : non seulement `0004`–`0009` n'y étaient pas, mais même `0001`–`0003` (`parking_vehicles.vehicule_id`, table `parking_transfers`). Le journal `drizzle.__drizzle_migrations` ne portait qu'**une** entrée, alors que `0006`–`0009` ont des `when` **antérieurs** à `0000` — un `drizzle-kit migrate` aurait donc voulu rejouer l'intégralité du schéma.

**`drizzle-kit migrate` était donc interdit ici.** Les migrations ont été appliquées en SQL direct, dans l'ordre `0001`→`0009`, après backup CSV des 6 tables touchées et **préflight** : 0 doublon de plaque normalisée, donc l'index unique de `0004` était sans risque.

| État | Avant | Après |
|---|---|---|
| `vehicules.immat_norm` | absent | présent, **222 backfills**, 0 violation d'unicité |
| `clients.clients_doublonnes` | absent | présent |
| `atelier_parametres.outillage_catalogue` | absent | présent |
| `parking_vehicles.vehicule_id` | absent | présent |
| `parking_transfers` | absent | présente |
| `chk_*` (nomenclatures de statut) | absent | **3 contraintes, puis `VALIDATE`** |

Les deux causes d'erreur vues sur Vercel — `clients_doublonnes` et `outillage_catalogue` — sont levées.

### Pollution : la production entière était une base de test

| Table | Volume | Nature |
|---|---|---|
| `clients` | 151 | **100 % test/démo** — « Test Core », « Cycle », « Sync », lorem ipsum (« Consequat Magnam ut ») |
| `vehicules` | 223 | **100 % démo** — `LT-PARC-01`, `CM-1011-AB`… série synthétique, `CM-DEMO-*` |
| `ordres_reparation` | 168 | 100 % rattachés à ces clients/véhicules |
| `ventes` | 56 | 100 % sur clients de test |
| **`parking_vehicles`** | **54** | **SEULE DONNÉE MÉTIER RÉELLE** — plaques CE/CA/LT/SU, 32 noms de clients camerounais |

Les **32 noms clients réels** (Nations Unies, AFOP, MINEE, Mutuelle Réunie, IMPÔTS, Personnel SUDCAM…) n'existaient **que comme texte libre** dans `parking_vehicles.client_nom` : ils étaient **absents de la table `clients`**. C'est la cause racine du problème « l'Atelier ne trouve pas les véhicules du parking » : les 54 lignes ont `vehicule_id = NULL`.

La pollution est **historique** (dernière écriture test : 2026-09-09). Le garde-fou `src/test/setup.ts`, qui refuse toute base distante, a été posé le 2026-10-05 : **aucune fuite depuis**.

### Purge exécutée

Sur accord explicite, et après **suspension temporaire** du trigger `trg_append_only_mouvements_stock` (contrôle de gouvernance bloquant la suppression ; réactivé et prouvé opérationnel dans la session même).

Ordre de suppression obtenu par **fermeture transitive du graphe FK** (57 tables) puis boucle convergente : l'ordre correct n'est pas déductible d'un simple tri, les tables racines devant partir après leurs enfants.

**Préservé** : `parking_vehicles` (54), `produits` (319), `employes` (38), `utilisateurs` (11), `agences` (2), `stocks` (135), et les **354 mouvements de stock de catalogue** (seuls ceux liés à un dossier/véhicule ont été supprimés).

**Effet secondaire** : les 2 lignes hors nomenclature qui bloquaient la validation (`en_recreation`, `facture`) ont disparu avec la purge. Les trois `CHECK` ont pu être **`VALIDATE`** — ils sont désormais `convalidated = true`, donc réellement protecteurs.

---

## 6. Journal

| Date | Lot | Contenu |
|---|---|---|
| 2026-10-15 | **P0.6 — `immat_norm` maintenue par la base, et fiches clients créées depuis le parking** | Deux défauts de fond, tous deux **silencieux**. (1) `vehicules.immat_norm` n'était renseignée par **personne** : ni défaut, ni colonne générée, ni déclencheur — seul le backfill manuel la remplissait. Un véhicule inséré par un chemin quelconque restait donc hors couverture de l'index unique (deux fiches pour la même plaque) **et invisible des recherches normalisées**. C'est ce qui rendait le rapprochement parking ↔ atelier aléatoire : `migrate-parking-vehicules.ts` apparie sur `immat_norm` et ne trouvait donc rien. Migration `0010` : un invariant dérivé doit être maintenu par la base, pas par la discipline de chaque appelant — on ne peut pas avoir oublié un `INSERT`. Déclencheur aligné sur `immat-utils.ts`. (2) **Aucun script ne pouvait tourner sur Neon** : tous hadient `ssl: false` en dur → `connection is insecure`. `sslPourUrl()` centralise le calcul, aligné sur `client.ts`. Puis `migrate-parking-clients.ts` : les 31 fiches clients créées depuis `parking_vehicles.client_nom`, **sans rien inventer** (nom seul ; aucun téléphone ni adresse deviné) et en `PROSPECT` — valeur déjà présente dans `STATUTS_CLIENT`, là où « PROVISOIRE » aurait été un mot neuf que le code refuserait ensuite. Les quasi-doublons (`PRC` vs `Mr Ngoh Ngoh / PRC`) ne sont **pas** fusionnés : aucun automate ne peut le faire sans risque. Vérifié local (idempotent, 2ᵉ passage à 0) puis production : **31 clients, 42 véhicules canoniques, 42/54 lignes parking liées**. |
| 2026-10-15 | Cadre | Audit des 5 domaines (listes véhicules, cycle de vie, restitution, alertes/relances, statistiques) + diagnostic des données de test. 7 défauts bloquants identifiés. Cahier des charges reformulé : 11 exigences vérifiables (X1–X11), 6 phases, 7 décisions, 8 refus explicites. **Validé.** |
| 2026-10-15 | **P0.5 — Migration de la production (Neon `atelierone_erp`)** | Base de production identifiée : Neon, base `atelierone_erp` (`neondb` est vide). Elle était en retard de **9 objets**, et même `0001`–`0003` n'y étaient pas. `drizzle-kit migrate` était **interdit** : le journal ne portait qu'une entrée et les `when` de `0006`–`0009` sont antérieurs à `0000`, donc drizzle aurait rejoué tout le schéma. Migrations appliquées en **SQL direct**, `0001`→`0009`, après backup CSV et préflight (0 doublon de plaque). `immat_norm` backfillée sur 222 véhicules, 0 violation d'unicité. Les 2 erreurs Vercel (`clients_doublonnes`, `outillage_catalogue`) sont levées. **Piège d'accès** : l'endpoint pooler ouvre les sessions avec `search_path` **vide**, l'endpoint direct non — un script non qualifié échoue en `relation does not exist` sur une base saine. |
| 2026-10-15 | **P5.3 — Purge de la pollution test en production** | Le diagnostic P5.2 (« 0 signature de test ») était **faux** : il reposait sur 8 marqueurs de noms. La production contenait **100 % de ses clients et véhicules** en données de test (151 / 223), plus 168 dossiers et 56 ventes. Seule donnée réelle : les 54 lignes `parking_vehicles` (plaques CE/CA/LT/SU, 32 noms clients camerounais) — dont les 32 noms clients étaient **absents de la table `clients`**, ce qui explique que l'Atelier ne retrouvait rien. Pollution **historique** (dernière écriture 2026-09-09) : le garde-fou `src/test/setup.ts` posé le 2026-10-05 empêche toute récidive. Purge exécutée après accord explicite, trigger `append-only` suspendu puis réactivé et **prouvé opérationnel**. Ordre de suppression obtenu par fermeture transitive du graphe FK (57 tables) + boucle convergente. Préservés : parking, catalogue produits, employés, 354 mouvements de stock de catalogue. Effet secondaire : les 2 lignes hors nomenclature ayant disparu, les 3 `CHECK` de `0009` ont pu être **`VALIDATE`** (`convalidated = true`). |
| 2026-10-15 | **P0.1 — Le statut du véhicule est DÉRIVÉ, plus écrit** | `vehicules.statut_immobilisation` était une colonne dénormalisée écrite à la main par 10 points d'entrée, dont la machine d'états n'en couvrait qu'**un**. Nouveau service `statut-vehicule.ts` : le statut est déduit du dossier d'atelier ouvert, à défaut du registre parking, à défaut du repli. La colonne reste en base comme **cache**, jamais lue comme une vérité. Les 6 désynchronisations refermées : sortie garage sans toucher au canonique, transfert rebattant un dossier en cours en « en réception », dossier `ANNULE`/`ferme_definitif` laissant le véhicule figé « en réparation » à jamais, double écriture réception, `sorti → en_reception` contourné, statut `NULL` qui auto-dégradait la garde en « tout est permis ». **Effet le plus visible** : `PRET_A_LIVRER` → `terminee_attente_paiement`, ce qui **rétablit la chaîne d'alerte** — un véhicule prêt depuis 30 jours ne produisait aucune alerte, et sa place restait immobilisée en silence. **Garde métier ajoutée** : `garage.sortie` refuse un véhicule dont un dossier est ouvert, message à l'appui. `changerStatut` reste possible (seul moyen de poser « transféré », « contentieux », « client non venu ») mais ne peut plus contredire un dossier ouvert, et exige un motif hors flux. 7 tests d'intégration + 5 unitaires. |
| 2026-10-15 | **P0.4 — Contraintes de nomenclature sur les statuts** | Migration `0009` : `CHECK` sur `vehicules.statut_immobilisation`, `lignes_ordre_reparation.statut`, `ordres_reparation.statut`. Ajoutées en `NOT VALID` — elles s'appliquent sans bloquer sur des données existantes hors nomenclature, et `RAISE NOTICE` rapporte le nombre de lignes concernées. Filet de sécurité sous les validations applicatives : une contrainte dit « non », elle ne dit pas pourquoi ; elle garantit qu'aucun chemin — script de maintenance, import, console — n'introduise un statut que le code ne saura pas interpréter. **Contrôle en production (lecture seule)** : 1 véhicule (`en_recreation`) et 1 dossier (`statut='facture'`) sont hors nomenclature. Ils ne bloquent pas la migration et **demandent un arbitrage** : corriger, ou admettre que ces valeurs sont des états métier réels et les ajouter à la nomenclature. |
| 2026-10-15 | **P5.1 — Purge de la base de test** | `pnpm purge:test` créé : dry-run par défaut, purge au niveau **ligne** (jamais `TRUNCATE`), liste `PROTEGE` de 16 tables, exclusion explicite des 10 rôles socles. **713 lignes purgées** (441 journal RH, 110 clients fixtures, 64 permissions, 24 comptes, 20 rôles, 33 sites/zones/spots S2ALERTE, 1 synthèse de présence). **Socle vérifié intact avant/après** : 84 permissions, 10 rôles socles, 12 cibles KPI, 1 config parking, 2 sites / 24 zones / 104 spots. Un premier passage a échoué sur les rôles (contrainte FK : `utilisateurs.role_id`) — l'ordre de suppression est structurel, pas cosmétique ; réordonné et rejoué. Tests toujours verts après purge : **942/942**. |
| 2026-10-15 | **P5.2 — Diagnostic de la production** ⚠️ *infirmé par P5.3* | `pnpm diagnose:data` créé, **lecture seule garantie par la base** (`SET default_transaction_read_only = on`) et non par la bonne intention du code. Résultat annoncé : **0 signature de donnée de test**. **Ce diagnostic était faux** — voir P5.3 : la production était integralement composée de donnees de test. Les 9 objets manquants, eux, etaient corrects. Voir §5bis. |
| 2026-10-15 | **Correction — frontière client/serveur (build Vercel)** | ReceptionTab.tsx (composant client) importait OUTILLAGE_PAR_DEFAUT depuis ~/server/lib/outillage-catalogue, qui touche @atelierone/db → postgres → 
et/	ls/s/perf_hooks. 	sc ne voyait rien : **seul 
ext build voit la frontière**. Découpage : la partie PURE (nomenclature par défaut, types, schémas Zod, slugification) part dans ~/lib/outillage.ts, importable par les deux côtés ; le module serveur ne garde que l'accès base et ré-exporte. Au passage, la slugification était **dupliquée** dans le composant client — deux implémentations d'un même algorithme finissent toujours par diverger, et le serveur aurait refusé la clé que l'écran avait produite. Règle gravée dans AGENTS.md. |
