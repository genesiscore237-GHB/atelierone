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

**P1.2 · ~~Registre sans fiche~~ — PRIME LE 2026-10-15, à ne pas exécuter**

> Cette exigence est **caducée**. Elle prévoyait un onglet séparé « registre sans
> fiche » pour les 12 lignes parking sans identité canonique, avec ce refus
> explicite : « les mélanger à la liste véhicules serait une erreur ».
>
> L'argument ne tient plus. Ces 12 véhicules sont **physiquement au garage**, et
> la migration `0011` a rendu `vehicules.immatriculation` nullable : ils ont reçu
> une fiche réelle, rattachée à leur client, et sont visibles de l'atelier. Le
> modèle parking (`parking_vehicles.immatriculation`) était d'ailleurs nullable
> depuis le début, et `0004` documente que « plusieurs lignes parking sans plaque
> coexistent par conception » — le défaut était dans `vehicules`, pas dans le
> métier.
>
> Les mélanger n'était pas une erreur de méthode, c'était un trou de modèle.
> **Ce qui reste juste** : `parking_vehicles` demeure le registre GPJ (place,
> zone, photos, mouvements) et `vehicules` la fiche technique. Les 54 lignes sont
> désormais reliées (`vehicule_id`), sans duplication.

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

## 5ter. Où en est le plan — 2026-10-17

| Phase | Avancement | Reste |
|---|---|---|
| **P0** Intégrité | ✅ **7/7** | — |
| **P1** Liste véhicules | ✅ **3/3** | — (`P1.2` caduc) |
| **P2** Alertes/relances | 🟡 **1/4** | Vue centrale d'alertes, module Relances, 2 endpoints orphelins |
| **P3** Statistiques | 🟡 **1/9** | `P3.2` satisfaction, 7 KPI de `P3.3` |
| **P4** Performance | ❌ **0** | Pré-agrégation, cache, scans sans période |
| **P5** Hygiène | ✅ **3/3** | — (liste `KEEP` de `reset-db.ts`) |

### Cycle véhicule — état des étapes

| Étape | Objet | État |
|---|---|---|
| 1 | Réception — la matrice des 9 cas | ✅ |
| 2 | Harmonisation — 360 partagée, listes canoniques | ✅ |
| 3 | Anatomie du cycle — les deux vocabulaires de statut | ✅ |
| 4 | Restitutions — trace obligatoire, panneau partagé | ✅ |
| 5 | Relances | 🟡 **2/3** — table, vocabulaire, routeur, tests ; **manque le panneau** |
| 6 | Statistiques et KPI fouillables | ⬜ à faire |
| 7 | Qualité — tests de rendu React, purge des 339 erreurs TS | ⬜ à faire |

**P0, P1 et P5 sont closes.** Elles n'apportent plus de valeur : ce qui bloque
maintenant n'est plus l'intégrité ni la liste, c'est l'absence de relance et de
statistiques.

**P0 est close.** C'est la phase qui bloquait tout le reste, et elle est vérifiée dans le code, pas seulement au journal : `or-p0-gardes-travaux.integration.test.ts` couvre les gardes travaux, les `CHECK` sont `VALIDATE`, le trigger `immat_norm` est actif en production.

### Les quatre réserves qu'il ne faut pas perdre de vue

1. ~~Une décision actée n'est pas appliquée.~~ **RESOLU le 2026-10-16 — voir le journal.** D4 (« fiche parking = `PROVISOIRE`, promote à la réception ») est désormais implémentée : la promotion existe, et une deuxième faute est sortie de l'investigation — voir le journal du 2026-10-16.

2. ~~**Rien n'a été validé en production.**~~ **Levée le 2026-10-16.** Un premier dossier réel existe désormais : `OR-26-0001`, créé le 2026-10-15, passé par le chemin « à wartier ». Le cycle reste néanmoins exercé **principalement en local**.

3. **Les tests isolent mieux, mais pas encore parfaitement.** Les fichiers d'intégration sont sérialisés, donc plus de recouvrement entre eux. En revanche la base est partagée d'un fichier à l'autre et conserve des résidus : la suite passe deux fois de suite, ce n'est pas une garantie. **Un échec d'intégration sur `audit_logs` est apparu puis disparu sans changement de code** le 2026-10-17 — la référence est un fait, pas une déduction.

4. **Le rapport diagnostique `VALIDE` est définitif et sans issue.** Il ne peut être ni repris, ni annulé, ni corrigé. Ce n'est pas un défaut technique : c'est une décision métier qui n'a jamais été prise. Tant qu'elle ne l'est pas, un diagnostic erroné est définitif — et le vehicle reste immobilisé.

### Ce qui n'est pas fait et ne le sera pas sans décision

- **Sauvegardes production** — différées explicitement. À noter pour le jour venu : une branche Neon est un environnement, pas une sauvegarde ; le filet réel est PITR. Neon est PG18.6, le `pg_dump` local PG17.6.
- **Rotation des secrets Neon / S3** — les identifiants ont été exposés dans une conversation. À faire avant toute automatisation durable.
- **Validation du commit déployé sur Vercel** — le site est derrière Vercel Authentication et aucun CLI ni token n'est disponible.

## 6. Journal

| Date | Lot | Contenu |
| 2026-10-16 | **P1.1 (2/2) — les écrans branchés sur la liste canonique** | Une source de vérité qui n'alimente aucun écran n'a servi à rien. Deux raccordements. **(1) La liste atelier** `/dashboard/vehicules` : elle interroge toujours `vehicules.list` — plafond 100 en dur, `total` calculé puis **ignoré**, `limit`传的 sans pagination, table de statuts recopiée en dur. Elle passe à `listeCanonique` et gagne : pagination réelle avec boutons Précédent/Suivant, **le total affiché porte le filtre courant** (« 54 véhicules pour cette recherche » et non « 100 »), sélecteur de statut **servi par le serveur** avec le compte de chaque statut, colonne **Position** (site · zone · place), badge du **dossier en cours**, recherche par châssis / n° de registre / téléphone, et un état d'erreur affiché au lieu d'un tableau vide muet. Changer de filtre ramène en première page : rester sur la page 7 d'un nouveau filtre affiche un tableau vide, qui se lit comme « aucun véhicule » alors qu'il y en a. Cas des **12 véhicules sans plaque** : ils affichent « Sans plaque relevée » et non une cellule vide, qui ferait croire à une fiche corrompue. Au passage, `useDebounce` sortait de son fichier pour devenir un hook partagé — l'inventaire en avait trouvé **trois** copies, dont une sans anti-rebond, qui émet dix requêtes sur dix caractères tapés, chacune avec son `count(*)` et ses compteurs. **(2) La colonne « Emplacement » du registre garage** : le mensonge le plus visible, et le plus discret. L'écran lit `v.site` / `v.zone` / `v.spot` depuis son introduction ; `garage.vehicles` ne renvoyait que les **identifiants entiers**. La colonne affichait donc « Non défini » **sur toutes les lignes, en permanence**, y compris pour un véhicule posé sur une place connue — et rien ne le signalait : pas d'erreur, pas de test rouge, pas de trace. Le nom lisible n'existe pas sur `parking_vehicles`, il faut joindre sites / zones / spots. `garage.exportVehicules` le faisait déjà — **l'export affichait la place, l'écran non**. Test vérifié : `expected undefined to be 'p1pos-Site'` sur l'ancien code. **1020/1020, build vert.** |
| 2026-10-16 | **P1.1 (1/2) — la liste canonique, et les mensonges qu'elle remplace** | Inventaire avant d'écrire : **onze** procédures renvoient des véhicules, avec onze jeux de filtres, **quatre** implémentations de barre de recherche, **quatre** copies de la liste des statuts, et **aucun test**. Le relevé n'était pas une curiosity — il a mesuré quatre mensonges déjà en production. (1) `garage.vehicles` renvoie `total = rows.length` : le compteur « N véhicule(s) affiché(s) » **ment dès que le parc dépasse la taille de page**. (2) La colonne « Emplacement » du registre lit `v.site`/`v.zone`/`v.spot`, **absents de la réponse** — elle affiche « Non défini » en permanence, depuis toujours. (3) `vehicules.list` propose un `offset` qu'**aucun écran n'utilise**, et plafonne à 100 en dur ; la pagination n'existe nulle part. (4) Les compteurs par statut du garage sont calculés **en JS sur la page courante** — faux au-delà de 200 lignes. `or.listVehicules` est mort : ni `LIMIT`, ni `ORDER BY`, ni filtre `is_active`, recherche faite en JS après coup. Nouvelle procédure `vehicules.listeCanonique` : **une ligne = un véhicule**, `parking_vehicles` réduit à sa ligne la plus récente par `LEFT JOIN LATERAL … LIMIT 1` (sans quoi un véhicule entré trois fois apparaît trois fois — 54 véhicules, 160 lignes), position résolue en **noms lisibles** par jointure site/zone/place, `total` par `count(*)` sur le **même `WHERE`** que les lignes, pagination réelle, compteurs par statut sur le périmètre filtré, sélecteur de statut **servi par le serveur**. Recherche à six critères : immat, VIN, marque, modèle, version, nom/raison sociale client, n° de registre, **téléphone**. Le téléphone a demandé une correction : stocké « 677 00 11 22 », il ne répondait pas à « 677001122 ». C'est le cas le plus fréquent au comptoir — l'agent lit un numéro sur un carton et le recopie avec ou sans espaces ; comparer la colonne telle quelle échoue dans les deux sens et l'agent conclut que le véhicule est introuvable alors qu'il est là. Les deux côtés sont désormais comparés chiffres seuls. Requêtes **paramétrées** (`execute(sql\`…\`)`), pas de concaténation : une apostrophe dans la recherche ne peut plus casser la requête. 10 tests d'intégration, chacun sur un mensonge déjà constaté. **1018/1018, build vert.** Reste : le raccordement des écrans (1/2). |
| 2026-10-16 | **Les résidus de la base de test produisaient de faux échecs — preuve à l'appui** | Un test a échoué sans raison, puis la suite complète est repassée verte sans qu'aucune ligne soit changée. Ce n'était pas un oubli de ma part : c'était exactement la dette signalée deux lots plus tôt (« ~129 véhicules de résidus, deux suites vertes ne sont pas une garantie »). Elle venait de mordre. Deux corrections. (1) `purge:test` **refusait** de purger les véhicules sans client — « origine ambigue : fixture oubliée, ou import du registre GPJ ? ». Refuser de décider à la place de l'utilisateur est la bonne règle… **sur la base locale réelle**, où cette question a un sens. Sur une base `*_test`, elle n'en a pas : la base est créée vide et n reçoit que des fixtures. La distinction porte sur le **nom** de la base, pas sur une option — impossible à activer par inadvertance sur la base réelle. Vérifié dans les deux sens. (2) Mais une purge incrémentale **n'est pas déterministe** : après exécution, les 143 véhicules étaient toujours là et les utilisateurs avaient disparu — les suppressions se chevauchent et l'ordre compte. La vraie réponse n'était pas de mieux purger, c'était de **reconstruire** : `db:test-setup` reconstruit 226 tables depuis le schéma, sans intermédiaire. **Verdict : trois exécutions consécutives de 1008 tests, sans purge ni rechargement entre elles.** Une suite qui ne tient qu'à un `purge` manuel n'est pas une suite, c'est une habitude. |
| 2026-10-16 | **P5.3 — la liste de survie de `db:reset` était fausse** | Décision D7 : ne jamais utiliser `reset-db.ts` pour purger, parce que sa liste `KEEP` est incomplète. On ne s'était pas arrangé pour la **réparer**. Le script vide la base par `TRUNCATE … CASCADE` et sa liste ne protégeait que le socle de sécurité et `unites_mesure`. Conséquence mesurée sur la base locale : il effaçait les **12 cibles KPI** (`kpi_cibles`), les **seuils d'alerte parking** (`parking_configs` — que D6 déclare paramétrables), le **catalogue d'outillage** (`atelier_parametres`), la configuration de paie, et les **319 articles du catalogue**. Le troisième n'était pas théorique : `atelier_parametres.outillage_catalogue` est précisément l'erreur Vercel qu'il a fallu lever deux fois. Deux autres défauts corrigés au passage. `ssl: false` en dur : ce script ne pouvait structurellement pas tourner sur Neon, pour la raison déjà documentée. Et un avertissement explicite sur le fait que **`TRUNCATE` ne déclenche pas les déclencheurs de ligne** : `trg_append_only_mouvements_stock`, le contrôle de gouvernance qui interdit de réécrire un mouvement de stock, est contourné **sans erreur et sans message**. C'est le comportement correct d'un reset — mais il ne faut pas le découvrir en production en cherchant pourquoi la piste d'audit a un trou. La liste vit désormais dans `reset-keep.ts`, **séparée du script** : `reset-db.ts` s'exécute à l'import, il ne peut donc pas être importé par un test, et **une liste de survie qu'on ne peut pas tester est une liste qui se dégradera**. 6 tests, dont un qui vérifie que les tables métier sont bien vidées — un reset qui garderait les dossiers ne serait pas un reset, et la prudence excessive viderait le script de son sens. Vérifiés échouant sur l'ancienne liste (4 échecs, 5 tables perdues). Garde-fou local vérifié intact : refus sur base distante sans `FORCE=1`. |
| 2026-10-16 | **D4 appliquée — PROVISOIRE, promotion à la réception, et les deux fautes que cela a sorties** | D4 disait « fiche parking = `PROVISOIRE`, promote à la réception ». C'était écrit depuis le début du plan et **exécuté nulle part** : les fiches parking restaient non confirmées indéfiniment, alors même que la personne venait de se présenter à la réception. En poursuivant ce trou, **deux fautes sont sorties, pas une**. (1) Les fiches étaient `PROSPECT`. Or `PROSPECT` est un **type** commercial (`type_client = 'PROSP'`) — quelqu'un à qui on vend. Une fiche parking est de type particulier mais connu : nom recopié d'un registre, téléphone inconnu. Confondre les deux envoyait un client non vérifié dans les classements commerciaux et le recouvrement, ce que D4 refuse. `PROVISOIRE` existe désormais, et ne sort que vers `ACTIF` ou `ARCHIVE` — **jamais vers `PROSPECT`**, c'est exactement la confusion qu'on corrige. (2) Les fiches portaient `type_client = 'PARTICULIER'`, **qui n'existe pas dans `TYPES_CLIENT`** : une fiche décrivant un type que rien ne sait interpréter. Invisible parce qu'**aucune contrainte SQL ne couvre ces deux colonnes** — l'angle mort que `0009` avait fermé sur les statuts de véhicule. Migration `0012` : corrige les 31 fiches (**historique conservé** — la trace doit survivre au correctif) et pose `chk_clients_statut` + `chk_clients_type_client`, `NOT VALID` puis `VALIDATE`. **Les contraintes sont la partie qui compte** : sans elles, le prochain script réinstalle la même faute et rien ne le signale. La promotion : `or.receptionner` fait passer `PROVISOIRE` → `ACTIF` et écrit une ligne de `client_statut_historique` — un statut qui change sans trace est un statut dont personne ne peut rendre compte. Volontairement **non** promus : `BLOQUE` (une promotion ne doit pas contourner un blocage), `ARCHIVE` (la machine l'interdit, et c'est la bonne réponse), `ACTIF` (l'écriture serait du bruit). 4 tests **vérifiés échouant sur l'ancien code**. **Leçon gravée** : une valeur écrite par un script doit être validée par la base. Une liste de noms est une convention ; une `CHECK` est une garantie. |
| 2026-10-16 | **Une enquête qui ne devait rien corriger — et qui a trouvé la vraie duplication** | Contrôle de production après D4 : tout va bien (31 `PROVISOIRE/PART`, 2 contraintes validées) **et il y a un dossier**. `OR-26-0001`, créé le 2026-10-15 à 23 h, véhicule `VG 55574 UG`, **sans client**. C'est une première réception réelle passée par le chemin « à wartier » — donc le cas le plus récent, le plus rare, exercé pour de vrai. Réserve « 0 dossier » du §5ter **levée**. Ce véhicule n'a ni ligne parking ni client : il a été créé par la réception, ce qui est normal. Mais la requête a révélé **8 véhicules en production sans statut canonique**. Investigation complète — et conclusion inverse : **ce n'est pas un défaut**. Les 8 sont les lignes parking `DONNEES_INCOMPLETES`, `EN_VENTE` et `ACCIDENTE`, pour lesquelles `PARKING_VERS_IMMOBILISATION` renvoie volontairement `null` : le véhicule est au garage mais hors flux atelier, et on ne lui invente pas un statut. Un `en_reception` de repli le ferait réapparaître dans le parc d'atelier alors qu'il n'y est plus. J'allais donc corriger un comportement qui fonctionne exactement comme prévu. **Le vrai défaut était ailleurs** : `migrate-parking-vehicules.ts` **duplique** cette traduction en SQL sans énumérer les 4 statuts sans équivalent, en se rabattant sur `ELSE NULL`. Même résultat aujourd'hui, rien ne l'y oblige demain — et c'est exactement le motif que `vehicule-regles.ts` désigne comme cause racine des bugs : « trois écrans, trois comportements divergents ». `packages/db` ne peut pas importer d'`apps/nextjs`, donc un test de cohérence lit le script et compare le `CASE` à la constante : il **échouait** avant le correctif (4 statuts non énumérés). Statuts désormais énumérés explicitement, décision commentée dans le SQL. Aucun changement de comportement — la valeur d'un test qui passe à vide est qu'il peut encore échouer. | D4 said "parking sheet = `PROVISOIRE`, promote at reception". It had been written since the start of the plan and **executed nowhere**: parking sheets stayed unconfirmed indefinitely, even once the person had shown up at reception. Chasing that gap uncovered **two faults, not one**. (1) The sheets were `PROSPECT`. But `PROSPECT` is a commercial **type** (`type_client = 'PROSP'`) — a lead you sell to. Putting an unverified sheet there sends it into commercial rankings and dunning, which is exactly what D4 refuses. The two notions were conflated. `PROVISOIRE` now exists, with its own transitions: it can only leave toward `ACTIF` or `ARCHIVE`, never toward `PROSPECT` — because that is precisely the confusion we are fixing. (2) The sheets carried `type_client = 'PARTICULIER'`, **which is not in `TYPES_CLIENT`**. A sheet describing a type nothing can interpret. It went unnoticed because **no SQL constraint covers either column** — the same blind spot 0009 closed for vehicle statuses. So migration `0012` corrects the 31 sheets (history preserved, they will be able to tell), and adds `chk_clients_statut` + `chk_clients_type_client`, `NOT VALID` then `VALIDATE`. The constraints are the part that matters: they fix nothing on their own, but without them the next script reinstates the same fault and nothing will notice. The promotion itself: `or.receptionner` promotes `PROVISOIRE` → `ACTIF` and writes a `client_statut_historique` entry, because a status that changes without trace is a status nobody can account for. Deliberately **not** promoted: `BLOQUE` (a promotion must not become a way around a block), `ARCHIVE` (the machine forbids it, and it is the right answer), `ACTIF` (the write would be noise). Four unit tests, verified to **fail on the old code** (4 failed / 21 passed). Base: 31 `PROVISOIRE/PART`, 2 constraints validated. 1005/1005, build green. **Lesson**: a value written by a script must be validated by the base. A naming list is a convention; a `CHECK` is a guarantee. |
| 2026-10-16 | **Réception — la matrice des 9 cas, et l'IHM qui suit enfin le serveur** | Le serveur appliquait les trois règles depuis le lot précédent ; **l'écran, non**. Il proposait encore une case « Réassigner le propriétaire » : l'agent la cochait, le serveur ignorait le paramètre, et l'agent repartait avec l'impression d'avoir enregistré la réception pour le client choisi. Le défaut était donc toujours là — simplement plus visible. (1) La case disparaît, remplacée par un message expliquant la règle et ce qu'il faut faire : sélectionner la fiche existante si c'est bien ce client, passer par la procédure de cession sinon. **Un écran qui propose une action interdite apprend à l'agent qu'elle est possible** — pire que de ne rien proposer. (2) La confirmation de doublon était déjà donnée par l'agent mais **jamais transmise** : le formulaire refusait sa propre décision. Et en cas de refus `CONFLICT`, le bandeau de choix **réapparaît** — masqué, l'agent recevait un refus sans rien devant lui pour comprendre. Au passage, « à wartier » devient saisissable : nom facultatif, téléphone exigé *dès qu'un nom est saisi* (une fiche sans numéro n'est pas retrouvable). Le garde de propriétaire est aussi descendu dans `resoudreOuCreerVehicule`, donc valable pour tous les appelants, pas seulement la réception. |
| 2026-10-16 | **Tests — les fichiers d'intégration ne tournent plus en parallèle** | Tous les fichiers partageaient **une seule base** et s'exécutaient en parallèle. Chaque fichier créait ses fixtures avec des identifiants en dur, et le nommage s'était recouru : un client détecté comme doublon appartenait parfois au fichier d'à côté. Symptôme caractéristique, rencontré sept fois sur ce seul lot : **le fichier passe seul, échoue dans la suite complète, et l'erreur porte sur une donnée qu'il n'a pas créée**. Corriger au cas par cas (renommer un téléphone de fixture) est futile : la règle métier suivante ferait resurfacer le recouvrement, et l'échec suivant désignerait un fichier innocent. Deux projets vitest désormais — `unites` (logique pure, parallèles) et `integration` (base réelle, **sérialisés**). Coût mesuré : 86 s contre 85 s. Un résidu entre exécutions neutralisé au passage (`vehicules-u1` laissait son client derrière lui, rendant le test non rejouable). **Réserve honnête** : la base de test conserve encore ~129 véhicules de résidus ; la suite passe deux fois de suite, mais l'isolation par base et par fichier reste à faire. |
| 2026-10-16 | **Verrou de cohérence base avant push sur `main`** | La garantie « après push et migration, la production est le même que le local » ne tenait que si quelqu'un pense à la vérifier. Un contrôle postérieur ne garantit rien : il garantit l'état à l'instant où on l'a lancé. Un hook `pre-push` la rend inconditionnelle — sur un push vers `main`, il enchaîne `db:sync` (additif, idempotent) puis `db:check`, et **annule le push** si la production ne rejoint pas le local. Volontairement étroit : uniquement sur `main`, uniquement de l'addition, une seule divergence tolérée (`audit_logs`, propre à chaque base). **Local et non CI** : la CI ne peut écrire en production sans déposer les identifiants Neon dans les secrets GitHub, ce qui ouvrirait l'écriture en production à tout le dépôt et à toutes ses dépendances. Comptez ~2 min sur un push vers `main` ; une branche de travail sort aussitôt. |
| 2026-10-16 | **Correction — un garde-fou qui se croyait actif** | Le verrou ci-dessus était installé, testé de bout en bout, commité en annonçant « vérifié » — **et il ne tournait pas**. Deux pièges, dont un sérieux. (1) **Le contrat de git** : un hook `pre-push` reçoit la liste des références sur **stdin** ; `argv` ne contient que le nom du dépôt distant et son URL. `cibleMain()` lisait `argv`, ne trouvait jamais la branche, et sortait sans rien vérifier sur chaque push. Le test passait parce que je passais la référence manuellement, c'est-à-dire exactement comme git ne le fait pas — test conforme à mon attente, code faux. **C'est la forme la plus dangereuse de garde-fou : celui qui se croit actif et ne l'est pas.** Personne ne l'aurait remarqué, et la première dérive serait passée avec la preuve formelle que la garantie tient. (2) Sur Windows, un hook écrit par PowerShell dans `.git/hooks` n'a pas le bit d'exécutable : git le saute **silencieusement**. Constaté par `GIT_TRACE=1`, où le trace du push ne montrait aucune invocation. Les hooks sont désormais dans `scripts/git-hooks/`, **versionnés**, `core.hooksPath` y pointe, et `pnpm hooks:install` les installe. Un garde-fou n'est vérifié qu'en vérifiant qu'il **déclenche** *et* qu'il laisse passer ce qu'il doit laisser passer. |
| 2026-10-17 | **Étape 3 — Les deux vocabulaires de statut se contredisaient** | L'atelier parle `en_reception`, le parking parle `EN_PARKING` : deux vocabulaires de onze valeurs qui ne se recouvrent pas. Quatre statuts n'avaient **aucun** équivalent (`EN_VENTE`, `ACCIDENTE`, `A_TRANSFERER`, `DONNEES_INCOMPLETES`) et le mapping renvoyait `null`, avec ce commentaire : « pas d'équivalent franc ». Le refus d'inventer était prudent — **mais faux par ses effets**. `null` ne veut pas dire « n'invente rien » : il veut dire « ne rien écrire », donc **garder le statut précédent**. Un véhicule `ACCIDENTE` gardait `en_reception`, et l'agent lisait « accident » au parking et « en réception » à l'atelier : deux vérités contradictoires, au même instant, sans erreur ni journal. **Invisible par construction, donc jamais corrigé.** Migration `0013`. Trois tests **affirmaient** l'ancienne décision — dont un qui écrivait le défaut noir sur blanc (« statut sans équivalent : aucune écriture du canonique »). Ils ne se sont pas laissés passer : le meilleur signe qu'ils servaient à quelque chose. Un test qui affirme une décision ne la protège pas, **il la grave**. |
| 2026-10-17 | **Étape 4 — Restitutions : un refus qui ne dit pas où aller n'est pas une garde** | « Livré » signifie « le véhicule est **parti** », et un changement de statut ne peut pas l'affirmer. La machine d'états le refusait déjà — mais par « Transition refusée », sans indiquer le chemin. Un agent privé de direction **contourne** : l'interface, puis la base. C'est exactement le trajet qu'on voulait éviter. Le refus nomme désormais la restitution et ce qu'elle enregistre. Deux autres constats. (1) **L'invariant « `LIVRE` implique une restitution » n'était garanti par rien** : ni contrainte, ni déclencheur, ni garde applicative hors d'un handler. L'audit donnait trois « conformes » — local, test, production — **tous vides**. On n'avait pas la preuve que la règle tenait, mais la preuve qu'elle n'avait jamais été mise à l'épreuve. Une règle jamais testée n'est pas une règle, c'est une intention. Le test audite désormais **toute la table**, pas le dossier qu'il vient de créer : il tiendra quand un nouveau chemin écrira `LIVRE`. (2) En cherchant pourquoi le nettoyage de test échouait : **187 tables référencent `utilisateurs`, aucune en cascade** — sa suppression est de fait impossible, ce qui explique `deleted_at`. Et PostgreSQL nomme la table *cible*, pas celle qui bloque : « la relation « utilisateurs » viole la contrainte » désigne à tort la table innocente. **Reste à faire : la 360 ne restitue pas** — l'onglet « Facture » y est en lecture seule, la restitution n'existe que dans l'onglet de la page OR. Le garage n'a pas le chemin. |
| 2026-10-17 | **Étape 4 (suite) — La restitution sort de l'onglet** | Le panneau est extrait dans `~/components/or/RestituerVehicule.tsx` et appelé par la page OR **et** par la 360 : une implémentation, deux entrées. **Copier le formulaire aurait été plus rapide — c'est exactement ce qu'il ne fallait pas faire.** Deux formulaires de restitution qui divergent donnent deux réponses à « le véhicule est-il parti avec le plein ? », et l'une des deux aura tort sans qu'on le sache. La réception a déjà divergé entre ses deux écrans. Deux conséquences que seule l'exécution a révélées. (1) **Le contrôle du kilométrage était inerte sur la 360** : `orCourant` ne portait pas `kilometrageEntree`, donc le champ de sortie acceptait une valeur inférieure à l'entrée, et c'était le serveur qui refusait — après que l'agent eut rempli tout le formulaire. Même famille que la colonne « Non défini » du parking : un contrôle qui a l'air d'exister et qui ne s'exerce pas. (2) **La 360 est affichée au garage**, dont les profils n'ont pas forcément `or.consulter` : sans `enabled` sur les deux requêtes, la page aurait empoisonné des Forbidden pour afficher un panneau inutilisable. Le permission reste au serveur — ici on évite seulement de poser une question dont on connaît la réponse. |
| 2026-10-17 | **Étape 5 — Relances : une table qui n'avait jamais servi** | `relances` porte quatorze colonnes soigneusement pensées. Le module Relances du cahier des charges est écrit — **dans la table**. Aucun code n'y écrivait : zéro ligne, local comme production. Un dossier en `EN_ATTENTE_VALIDATION` n'a aucun souvenir d'une relance ; personne ne sait si l'appel a eu lieu, qui l'a fait, ni ce qui a été dit. Ce n'est pas un manque de fonctionnalité, c'est **un état d'attente sans observateur**. Trois trous, deux structurels : `cree_par` sans clé étrangère (l'auteur n'était pas garanti) ; ni `or_id` ni `vehicule_id` (impossible d'écrire « ce véhicule a été relancé », la seule relance utile au garage) ; `type`/`canal`/`statut` en `varchar` libres (un `'SMS '` avec une espace en fin se glisse partout, et un tableau croisant ces colonnes voit ses lignes disparaître du filtre **silencieusement**). Migration `0014` + vocabulaire en un seul endroit + `relancesAttendues()` (fonction **pure**, testable sans fixture) + routeur sous `creances.relancer`. Un refus nomme les valeurs acceptées : la base dit « valeur invalide » sans dire lesquelles, et un appelant bloqué ne peut pas se corriger tout seul. **Trois décisions dans la règle métier** : le PAIEMENT passe avant le DEVIS (une créance de 150 000 F pose une question concrète, un devis sans réponse est une indisponibilité qui peut attendre) ; un véhicule `sorti` n'est **jamais** « non restitué » — l'inverse de l'erreur afficherait une alerte sur un véhicule chez le client ; le seuil est explicite parce qu'un agent qui voit « relance » au bout de deux jours apprend à ne plus regarder l'écran. 1079 tests. |
|---|---|---|
| 2026-10-15 | **P0.6 — `immat_norm` maintenue par la base, et fiches clients créées depuis le parking** | Deux défauts de fond, tous deux **silencieux**. (1) `vehicules.immat_norm` n'était renseignée par **personne** : ni défaut, ni colonne générée, ni déclencheur — seul le backfill manuel la remplissait. Un véhicule inséré par un chemin quelconque restait donc hors couverture de l'index unique (deux fiches pour la même plaque) **et invisible des recherches normalisées**. C'est ce qui rendait le rapprochement parking ↔ atelier aléatoire : `migrate-parking-vehicules.ts` apparie sur `immat_norm` et ne trouvait donc rien. Migration `0010` : un invariant dérivé doit être maintenu par la base, pas par la discipline de chaque appelant — on ne peut pas avoir oublié un `INSERT`. Déclencheur aligné sur `immat-utils.ts`. (2) **Aucun script ne pouvait tourner sur Neon** : tous hadient `ssl: false` en dur → `connection is insecure`. `sslPourUrl()` centralise le calcul, aligné sur `client.ts`. Puis `migrate-parking-clients.ts` : les 31 fiches clients créées depuis `parking_vehicles.client_nom`, **sans rien inventer** (nom seul ; aucun téléphone ni adresse deviné) et en `PROSPECT` — valeur déjà présente dans `STATUTS_CLIENT`, là où « PROVISOIRE » aurait été un mot neuf que le code refuserait ensuite. Les quasi-doublons (`PRC` vs `Mr Ngoh Ngoh / PRC`) ne sont **pas** fusionnés : aucun automate ne peut le faire sans risque. Vérifié local (idempotent, 2ᵉ passage à 0) puis production : **31 clients, 42 véhicules canoniques, 42/54 lignes parking liées**. |
| 2026-10-15 | **P0.7 — La plaque devient nullable : les 12 véhicules sans plaque entrent en fiche** | 12 véhicules sont réellement au garage **sans plaque relevée**. Tant que `vehicules.immatriculation` était `NOT NULL`, ils n'existaient que comme lignes de registre : l'Atelier ne pouvait ni les lister ni les recevoir. **Le défaut était dans la table, pas dans le métier** — `parking_vehicles.immatriculation` était nullable depuis le début, et `0004` documente que « plusieurs lignes parking sans plaque coexistent par conception ». Migration `0011` : `DROP NOT NULL`. Aucune donnée inventée : `immat_norm` reste `NULL`, l'index unique reste **partiel** sur `immat_norm IS NOT NULL`, donc plusieurs véhicules sans plaque coexistent sans conflit et une plaque qui arrivera plus tard sera toujours contrôlée. La migration change ce qui est **permis**, pas ce qui existe. Étape 4 ajoutée à `migrate-parking-vehicules.ts` : la plaque ne servant plus de clé, le lien passe par un marqueur `parking_id=<id>` gravé dans les notes. **Test T1.3 réécrit** : l'absence d'invention ne se prouve plus par « aucune fiche » mais par « une fiche dont la plaque n'est pas remplie » (`immatriculation` **et** `immat_norm` `NULL`) — c'est la garantie qui compte réellement. |
| 2026-10-15 | **Correction — le journal drizzle n'a jamais rien appliqué depuis `0005`** | Les timestamps de `0006` à `0011` étaient **antérieurs** à celui de `0000` (`1763e12` contre `1791e12`). `drizzle-kit migrate` ne compare que `created_at` : il sautait donc ces six migrations **sur toutes les bases**, y compris la base de test. Ce n'est pas un détail de confort : c'est la raison mécanique pour laquelle `0010`/`0011` étaient absentes de la base de test alors qu'elles existaient dans le dépôt. Chronologie remise en ordre strictement croissante. **Corollaire** : `drizzle-kit migrate` reste interdit sur la production Neon, dont le journal ne portait qu'**une** entrée — y rejouer le schéma aurait été irréversible. |
| 2026-10-15 | **P3.1 — Les statistiques ne doivent plus afficher de chiffres faux** | Cinq corrections, chacune prouvée par un test qui **échouait sur l'ancien code** (`expected +0 to be 2`). (1) `sales.statut = "ACTIVE"` : une valeur qu'aucun chemin d'écriture ne produit — la nomenclature réelle est `brouillon / pre_facture / termine / valide / annule`. Chiffre d'affaires, panier moyen et marge renvoyaient **zéro, silencieusement**. Nomenclature centralisée dans `sale-service` (`STATUTS_VENTE`, `conditionVenteRealisee`), consommée par `analytics` comme par `alert-service`. (2) **Remises comptées une fois par ligne** : la remise est un en-tête de vente, sommée après jointure sur `ventes_lignes` elle était multipliée par le nombre de lignes du ticket — invisible sur un panier moyen, écrasant sur une vente de pièces. (3) **Taux de rotation de stock toujours nul** : le filtre portait sur `mouvements_stock.type = 'OUT'`, valeur absente (les types réels sont `SORTIE_OR`, `RETOUR_ATELIER`, `TRANSFERT_SORTIE`…) ; le discriminant est `sens` (`E`/`S`). S'y ajoutait un produit cartésien `stocks × mouvements` qui pondérait le stock moyen par le nombre de mouvements — les articles qui tournaient le plus semblaient avoir le plus de stock. (4) **Dernier jour de période exclu** : `new Date("2026-01-15")` vaut minuit, donc une vente du 15 à 14 h n'entrait jamais dans un rapport « jusqu'au 15 ». Sur une clôture mensuelle, la dernière journée disparaît sans message. Helper pur `borneFin/borneDebut` appliqué à **23 sites**. (5) **`nbAlertes` plafonné au `.limit(50)`** : affichait « 50 alertes » dès qu'il y en avait plus, conduisant à en ignorer le surplus. Compte et détail séparés. **Une affirmation du plan était fausse** : `COUNT(*) FROM produits` sans `agenceId` n'est pas une fuite inter-agences — `produits` n'a ni colonne agence ni clé étrangère vers `agences`, le catalogue est global par construction. Signalé pour arbitrage plutôt que « corrigé » : changer la métrique aurait été inventer une règle métier. **988/988 tests, build vert.** |
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
