# CDC — Enregistrement & suivi des véhicules (AtelierOne / GPJ)

> **Source de vérité** de la transformation « Réception & suivi véhicules ».
> Audit initial du **2026-10-14** ; plan de lots ; journal d'avancement.
> Toute session commence par la lecture de ce document et le met à jour en sortie.

---

## 1. Audit initial (2026-10-14) — état des lieux

### 1.1 Écrans réels identifiés

| Écran | Route | Composant | API | Table cible |
|---|---|---|---|---|
| **Réception** (spec 04) | `/dashboard/atelier/reception` | `ReceptionVehicule.tsx` (376 l.) | `or.receptionner` | `clients` + `vehicules` + `ordres_reparation` + `or_photos` |
| **Registre parking** | `/dashboard/garage/vehicules` | `VehiculeFormDialog.tsx` (623 l.) | `garage.create` / `garage.update` | `parking_vehicles` + `vehicules` canonique |

### 1.2 Anomalies P0 (bloquantes)

| ID | Anomalie | Preuve |
|---|---|---|
| **P0-1** | Aucune contrainte unique sur `vehicules.immatriculation` — deux normalisations incohérentes (exacte vs normalisée) | `vehicules.ts:16` sans `.unique()` ; SQL `0000` sans UNIQUE |
| **P0-2** | `or.receptionner` insère un véhicule **sans contrôle de doublon** (Cas D = doublon garanti) | `or-router.ts:740-756` |
| **P0-3** | `or.restituerVehicule` ne libère **ni le spot, ni le mouvement SORTIE** — asymétrie avec `garage.sortie` | `or-router.ts:1335` vs `garage-router.ts:1558` |

### 1.3 Anomalies P1 (importantes)

| ID | Anomalie | Preuve |
|---|---|---|
| P1-1 | Aucun dédoublonnage client (nom+téléphone identiques → recréé) | `or-router.ts:707-726` |
| P1-2 | Véhicule/client existant : infos saisies **ignorées silencieusement** | `or-router.ts:704-738` |
| P1-3 | Alertes parking 100 % manuelles (aucun scheduler) | `garage.analyser` bouton uniquement |
| P1-4 | Type de véhicule = select fermé snake_case hardcodé 6 valeurs | `ReceptionVehicule.tsx:188-189` |
| P1-5 | 2 champs km aux libellés ambigus ; pas d'invariant `sortie ≥ entrée` | `:213` / `:292` |
| P1-6 | Validation échoue silencieusement (pas de toast, pas de scroll) | `:109-111` |

### 1.4 Anomalies P2 (amélioration)

| ID | Anomalie |
|---|---|
| P2-1 | Section 5 : 18 inputs d'observation **séparés** des 18 cases, hors état du formulaire |
| P2-2 | Section 6 : 3 textareas dont 1 non spécifiée (redondante) |
| P2-3 | Ordre DOM non séquentiel (1,2,3,6,7 \| 4,5,8) |
| P2-4 | Champs `required` affichés mais jamais validés (marque, téléphone, type) |
| P2-5 | Photos > 2 Mo jetées silencieusement |
| P2-6 | Caches parking non invalidés après réception |
| P2-7 | `or.getAlertes` non branché à une UI |

---

## 2. Exigences (matrice)

| # | Exigence | Statut cible | Lot |
|---|---|---|---|
| E1 | Un seul véhicule par plaque normalisée (contrainte DB) | Atteint | R1 |
| E2 | Détection automatique véhicule existant à la saisie immat | Atteint | R2 |
| E3 | Détection automatique client existant (nom/téléphone) | Atteint | R2 |
| E4 | `receptionner` refuse/réconcilie les doublons (4 cas) | Atteint | R3 |
| E5 | Transparence : les infos d'une entité existante ne sont pas écrasées sans information | Atteint | R4 |
| E6 | Dédoublonnage client : suggestion + possibilité de fusionner | Atteint | R5 |
| E7 | Type de véhicule = combobox (suggestions + libre) | Atteint | U1 ✅ |
| E8 | Km entrée (obligatoire, traçable) vs km courant (référence) : libellés clairs + invariant sortie ≥ entrée | Atteint | U2 |
| E9 | Check-list : commentaire inline par ligne ; section 6 supprimée/absorbée | Atteint | U3 |
| E10 | Validation visible : toast + scroll vers erreur ; tous les `*` réellement validés | Atteint | U4 |
| E11 | DOM séquentiel ; caches invalidés après réception | Atteint | U5 |
| E12 | Restitution OR libère le spot + écrit mouvement SORTIE | Atteint | S1 |
| E13 | Alerte « véhicule déjà présent » si réception sur véhicule au garage | Atteint | S2 |
| E14 | Scheduler d'alertes parking (exécution périodique) | Atteint | A1 |
| E15 | `or.getAlertes` branché à une UI | Atteint | A2 |

---

## 3. Décisions de conception

| # | Décision | Choix | Raison |
|---|---|---|---|
| **RD1** | Normalisation immat | `upper(regexp_replace(btrim(immat), '[[:space:]]+', '', 'g'))` — **une seule** fonction partagée `normaliserImmatriculation` (existe déjà `parking-vehicule-service.ts:63`) | Fin des 2 normalisations divergentes |
| **RD2** | Unicité plaque | Index **partiel unique** WHERE `immatriculation IS NOT NULL` sur `vehicules` + tentative d'insert en ON CONFLICT → erreur claire | `vehicules.immatriculation` est NOT NULL dans le schéma actuel, mais on garde un garde-fou |
| **RD3** | Détection doublon réception | Côté **serveur** dans `receptionner` : si une plaque normalisée matche un véhicule existant **et** qu'aucun `vehicule.id` n'est fourni → **réconciliation silencieuse** (réutilise l'id) + retour `vehiculeReconcilie: true` pour que l'UI informe l'utilisateur. Pas de rejet (le véhicule revient = cas normal). | Le garage reçoit des véhicules connus — c'est l'usage courant. Le risque est le doublon, pas la réutilisation. |
| **RD4** | Cas D (nouveau client + véhicule connu) | Le véhicule connu est **réutilisé** (RD3) ; le nouveau client est créé ; le `vehicule.clientId` est **mis à jour** vers le nouveau client **uniquement si** le véhicule n'avait pas de client, ou si l'ancien client est différent et que l'opérateur confirme (flag `reassignerClient`). | Évite d'écraser le propriétaire historique par erreur |
| **RD5** | Km | Regroupés dans la section « Entrée » : champ « Kilométrage relevé à l'entrée » (obligatoire) + mention lecture seule « Dernier km connu : X ». Invariant serveur : si `kilometrageSortie` < `kilometrageEntree` → BAD_REQUEST. | Clarification sans supprimer la traçabilité |
| **RD6** | Type de véhicule | Combobox (liste existante + suggestions depuis `SELECT DISTINCT typeVehicule` + saisie libre). Libellés propres affichés (`Poids lourd` et non `poids_lourd`). La valeur stockée reste la chaîne saisie/sélectionnée (varchar 30). | Saisie souple sans migration de données |
| **RD7** | Check-list | Une ligne = case + libellé + bouton « ✎ » qui déplie un input inline. La section 6 est absorbée : « Pannes déclarées » (obligatoire) + « Observations » (facultative) remontent en haut du bloc constats. Le JSONB `outillage` conserve `{present, observation}` (pas de migration). | UX sans migration |
| **RD8** | Unification sortie | `or.restituerVehicule` appelle la **même logique** que `garage.sortie` (libération spot + mouvement SORTIE) **si** le véhicule a une ligne parking liée et n'est pas déjà `SORTI`. | Fin de l'asymétrie |
| **RD9** | Scheduler alertes | Petit helper `ensureAlertesScheduler()` appelé au boot du routeur garage (lazy, une fois par process) qui lance un `setInterval` configurable (défaut 60 min) appelant `garage.analyser` en interne. En production serverless, le fallback reste le bouton manuel. | Pas de dépendance externe (pas de cron OS) |
| **RD10** | Tests | Chaque lot apporte au moins un test d'intégration tRPC sur `atelierone_erp_test` (pattern D8 de HARMONISATION). | Non régression |

---

## 4. Plan de lots

| Lot | Intitulé | Modules | État |
|---|---|---|---|
| **R1** | Unicité plaque + normalisation unique | db, véhicules | ✅ |
| **R2** | Détection auto véhicule/client existant | réception (UI+API) | ✅ |
| **R3** | Contrôle doublon + réconciliation 4 cas | réception (API) | ✅ |
| **R4** | Transparence entités existantes | réception (UI) | ✅ |
| **R5** | Dédoublonnage client | clients, réception | ✅ |
| **U1** | Type véhicule combobox | réception (UI) | ✅ |
| **U2** | Km regroupé + invariant | réception (UI+API) | ⬜ |
| **U3** | Check-list reformée | réception (UI) | ⬜ |
| **U4** | Validation visible | réception (UI) | ⬜ |
| **U5** | DOM séquentiel + caches | réception (UI) | ⬜ |
| **S1** | Sortie unifiée (restitution → spot) | or, parking | ⬜ |
| **S2** | Alerte véhicule déjà présent | réception (API) | ⬜ |
| **A1** | Scheduler alertes | parking | ⬜ |
| **A2** | `or.getAlertes` UI | atelier | ⬜ |

### Responsabilités par module

| Module | Lots concernés | Points de contact |
|---|---|---|
| **db / schema** | R1 | `vehicules.ts`, migration `0004` |
| **réception** (`or.receptionner`) | R2, R3, R4, U2, S2 | `or-router.ts`, `ReceptionVehicule.tsx` |
| **clients** | R5, R2 | `clients-router.ts` |
| **véhicules** | R1, R3 | `vehicules-router.ts`, `parking-vehicule-service.ts` |
| **parking / garage** | S1, A1 | `garage-router.ts`, `parking-alerts.ts` |
| **OR / atelier** | S1, A2 | `or-router.ts` |

---

## 5. Mécanisme d'exécution

1. Ce document est le **plan de référence**. Chaque session le consulte en premier.
2. L'avancement est tracé dans le **journal (§6)** : chaque lot livré = entrée datée avec preuves (tests, lint, typecheck).
3. Critère « lot terminé » : code + tests verts + lint 0 erreur + 0 erreur TS dans les fichiers du lot + entrée journal.
4. Critère « projet terminé » : les 15 exigences E1-E15 à « Atteint » + vérifications finales (suite complète, graphify).
5. En cas de blocage : entrée journal « BLOQUÉ » + question à l'utilisateur.

---

## 6. Journal d'avancement

| Date | Jalon | Résultat |
|---|---|---|
| 2026-10-14 | **Audit initial** | Rapport complet (§1) ; 3 P0, 6 P1, 7 P2 identifiés ; 15 exigences ; 10 décisions (RD1-RD10) ; 14 lots planifiés |
| 2026-10-14 | **R1 – R5 – unicité plaque + réconciliation** | Livré. Migration `0004` (index unique partiel `immat_norm`, `vehicules.ts`), helper centralisé `immat-utils.ts` (`normaliserImmat`, `immatNormaleCondition`, `immatNormPreferenceSql` avec fallback `immat_norm IS NULL` pour lignes héritées), script `dedup-vehicules-immat.ts` (backfill + fusion), branchement des 3 points d'insertion (`or.createVehicule`, `or.receptionner`, `trouverOuCreerCanonique`). **Régression** : `garage-lot1` échouait (lookup sur `immat_norm` seul ignorait les lignes NULL) → corrigée par le fallback. Vérifs : TSC 0 erreur dans fichiers touchés ; 36/36 tests verts (`garage-lot1` 8, `garage-lot2` 8, `or-lot0` 5, `or-lot4-cycle` 15) ; test nouveau `or-r1-immat-uniqueness.integration.test.ts`. Commit `754b26e` poussé. |
| 2026-10-14 | **R4 — transparence entités existantes (E5)** | Livré (commit R1 poussé `754b26e`). API `or.receptionner` : retour enrichi de `vehiculeReconcilie` (RD3 — faux à la création du véhicule, vrai à la réutilisation par plaque normalisée) ; garde-fou propriétaire `reassignerClient` (RD4) — le `clientId` d'un véhicule réconcilié n'est réassigné que si l'opérateur envoie explicitement `reassignerClient: true` (sinon le propriétaire historique est conservé, pas d'écrasement silencieux). UI `ReceptionVehicule.tsx` : toast `info` quand le véhicule existant est réutilisé, bandeau « Ce véhicule est déjà lié au propriétaire X » avec case « Réassigner ce véhicule au nouveau client » (visible si propriétaire différent), reset du contexte après succès. Tests : `or-r1-immat-uniqueness.integration.test.ts` étendu — test 5 vérifie le flag `vehiculeReconcilie` (false→true), nouveau test 6 (RD4) vérifie conservation par défaut puis réassignation sur demande. Vérifs : TSC 0 erreur dans les fichiers touchés (erreurs restantes préexistantes) ; 5/5 tests verts ; lint 0 erreur (11 warnings préexistants). |

| 2026-10-14 | **R5 — dédoublonnage client (E6)** | Livré. **DB** : migration `0005_clients_doublonnes.sql` (colonne `clients_doublonnes boolean DEFAULT false` + index partiel `idx_clients_doublonnes`), champ `clientsDoublonnes` dans `schema/clients.ts`, helper `tel-utils.ts` (`normaliserTelephone`, `telephonesIdentiques` — chiffres seuls, préfixe 237 retiré, 9 chiffres `[62]…`), script `dedup-clients.ts` (fusion des doublons existants + recalcul du marquage, script npm `dedup:clients`, branché dans `test-db.mjs` étape 4e). **API** : `clients.doublonParTelephone` (détection à la saisie), `clients.suggestionsClients` (groupes par téléphone normalisé, survivant = plus ancien), `clients.fusionner` (complète les champs vides du survivant, **rep oint les 13 tables FK** `client_id`, archive les doublons en soft-delete, purge le marquage) ; `or.receptionner` marque `clients_doublonnes` sur le nouveau client **et** sur l'existant quand le téléphone normalisé coincide (aucune fusion automatique — D3/RD10). **UI** : bandeau de détection en section Client de `ReceptionVehicule.tsx` (« Sélectionner ce client existant » / « Continuer avec un nouveau client ») ; page `dashboard/clients/doublons` (recherche, choix du survivant, `ConfirmationDialog`, `EmptyState`, permissions `clients.consulter`/`clients.modifier`, `toast()` + `invalidate()`). **Tests** : `or-r1-immat-uniqueness.integration.test.ts` étendu à 8 tests (7 = `suggestionsClients`, 8 = `fusionner` + invariant RD10, 9 = `doublonParTelephone`) ; `beforeEach` de purge des données métier pour isoler les fixtures R5. **Pièges rencontrés** : (a) `.set()` de Drizzle attend la **clé TS du champ** (`clientId`), pas le nom de table → sinon `update … set where …` (erreur SQL 42601) ; (b) les échappements `\D` / `\d{9}` sont réinterprétés par le ``sql`` `` de Drizzle et produisent un **NULL silencieux** → expressions SQL réécrites avec `[^0-9]` / `[0-9]{9}`, sur une seule ligne. Vérifs : **8/8 tests verts**, TSC 0 erreur dans les fichiers du lot, lint 0 erreur (19 warnings préexistants). |

| 2026-10-14 | **U1 — type de véhicule en combobox (E7, P1-4)** | Livré. **Helper partagé** `libelleTypeVehicule()` dans `server/lib/vehicule-service.ts` (module pur, importable client) : la valeur **stockée reste snake_case** (`poids_lourd`, varchar 30, aucune migration — RD6) mais l'affichage est humanisé (« Poids lourd » ; seul le premier mot est capitalisé, les mots ≤ 2 lettres restent des siglas en capitales). **API** : `vehicules.typesUtilises` (`vehicules.consulter`) — `SELECT DISTINCT type_vehicule` sur l'**agence courante**, renvoyant `{valeurs, options[{valeur, libelle}]}` : la liste de référence `TYPES_VEHICULE` est **toujours** préfixée (jamais de combobox vide) suivie des types réellement rencontrés hors liste. **Composant** : `SelectSearch` étendu **sans casser les 17 usages existants** — nouvelles props `allowCustom` (ligne « + Utiliser « … » » + validation par `Entrée`), `customMaxLength` (30 = `type_vehicule`), `role`/`aria-expanded` (accessibilité) ; une valeur libre hors `options` s'affiche en clair au lieu du placeholder. **UI** : champ « Type de véhicule » de `ReceptionVehicule.tsx` remplacé (`<select>` fermé 6 valeurs snake_case → `SelectSearch` alimenté par la liste de référence + suggestions agence + valeur du véhicule chargé). **Tests** : nouvelle suite `vehicules-u1-types-combobox.integration.test.ts` (5 tests) — liste de référence jamais vide, libellés humanisés, type hors liste qui remonte, **isolation agence** (type d'une autre agence non proposé), persistance de la saisie libre via `or.receptionner`, tests unitaires du helper. **Piège rencontré** : `ON CONFLICT (agence_id, immat_norm)` est inutilisable en fixture car l'index unique R1 est **partiel** (`WHERE immat_norm IS NOT NULL`) et PostgreSQL refuse d'inférer l'arbitre → garde `WHERE NOT EXISTS`. Vérifs : **5/5** verts sur la nouvelle suite, **884/884** verts sur la suite complète (51 fichiers), TSC 0 erreur dans les fichiers du lot, lint 0 erreur (5 warnings préexistants). |

Lots **R1**–**R5** et **U1** livrés. Prochains lots : **U2** (km regroupés + invariant `sortie ≥ entrée`), U3–U5, **S1** (restitution → libération du spot, P0-3), S2, A1, A2.
