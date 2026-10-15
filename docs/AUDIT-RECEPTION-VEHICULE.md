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
| E8 | Km entrée (obligatoire, traçable) vs km courant (référence) : libellés clairs + invariant sortie ≥ entrée | Atteint | U2 ✅ |
| E9 | Check-list : commentaire inline par ligne ; section 6 supprimée/absorbée | Atteint | U3 ✅ |
| E10 | Validation visible : toast + scroll vers erreur ; tous les `*` réellement validés | Atteint | U4 ✅ |
| E11 | DOM séquentiel ; caches invalidés après réception | Atteint | U5 ✅ |
| E12 | Restitution OR libère le spot + écrit mouvement SORTIE | Atteint | S1 ✅ |
| E13 | Alerte « véhicule déjà présent » si réception sur véhicule au garage | Atteint | S2 ✅ |
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
| **U0a** | Service unique de règles véhicule (3 endpoints alignés) | db, véhicules, garage | ✅ |
| **U0b** | `FormulaireVehicule` partagé + suppression écran doublon | réception, véhicules | ✅ |
| **U0c** | Photos d'état des lieux versionnées par visite + caméra | db, réception, restitution | ✅ |
| **U0d** | Dimensions physiques + provenance véhicule | db, réception, garage | ✅ |
| **U1** | Type véhicule combobox | réception (UI) | ✅ |
| **U2** | Km regroupé + invariant | réception (UI+API) | ✅ |
| **U3** | Check-list reformée | réception (UI) | ✅ |
| **U4** | Validation visible | réception (UI) | ✅ |
| **U5** | DOM séquentiel + caches | réception (UI) | ✅ |
| **S1** | Sortie unifiée (restitution → spot) | or, parking | ✅ |
| **S2** | Alerte véhicule déjà présent | réception (API) | ✅ |
| **A1** | Scheduler alertes | parking | ⬜ |
| **A2** | `or.getAlertes` UI | atelier | ⬜ |

### U0 — Unification des trois créations de véhicule (décision utilisateur, 2026-10-14)

Constat : **trois** interfaces créent un véhicule, avec trois comportements divergents
(et non deux — leForms `/dashboard/vehicules` a été oublié jusqu'à l'inventaire).

| Interface | Endpoint | Client créé | Plaque déjà connue | Type véhicule |
|---|---|---|---|---|
| `/atelier/reception` | `or.receptionner` | oui + dédoublonnage R5 | **réconcilie** (R4) | libre (U1) |
| `/garage/vehicules` | `garage.create` | **non** (texte libre) | lie au canonique | **champ inexistant** |
| `/vehicules` | `vehicules.create` | optionnel | **refuse** l'erreur | `z.enum` fermé |

Écarts constatés : (1) un véhicule créé au garage n'a **aucun** enregistrement client
(il n'apparaît ni à l'historique client, ni aux contrats, ni à la facturation) ;
(2) même plaque → 3 comportements selon l'écran ; (3) `typeVehicule` libre en
réception mais `z.enum` en `/vehicules` — **un type « benne » accepté à la réception
serait refusé ailleurs** (incohérence introduite par U1).

**Décision actée** : garder **deux** interfaces, pas une. Le registre parking est le
registre GPJ historique (n° 1-48, le 33 n'existe pas, dimensions, emplacements,
mouvements) : ce n'est pas un doublon du parc, c'est un métier distinct.
`/dashboard/vehicules` est en revanche un **doublon** → supprimé.

**Cadrage retenu** :
- La réception est le **point de passage unique** de création.
- La création directe au garage reste possible **uniquement** si la plaque est inconnue
  à la réception, et doit alors créer un **vrai client**, pas un texte.
- Les règles vivent dans **un service**, pas recopiées par écran (cause racine des bugs).

> **RÉVISION 2026-10-14 (U0b)** — l'écran `/dashboard/vehicules` **n'est pas supprimé** :
> l'inventaire a montré que `atelier/parc` affiche les **dossiers en cours** (`or.getDashboard`),
> pas le parc. `/dashboard/vehicules` est donc la **seule liste du parc** — le supprimer aurait
> retiré une vue utile. Le doublon supprimé n'est pas l'écran mais son **formulaire** :
> la fiche véhicule est désormais un **composant unique** partagé avec la réception.

### Éléments repris du formulaire parking vers l'atelier (validés)

| Élément | Décision | Colonne |
|---|---|---|
| Photos d'état des lieux par face | **Importer** (U0c) | migration `or_photos.categorie` |
| Longueur / largeur / hauteur / poids + `dimensionsEstimees` | **Importer** (U0d) | migration `vehicules` |
| Provenance / notes | **Importer** (U0d) | `vehicules.notes` (existe) |
| N° registre GPJ | **Lecture seule** à la réception | `parking_vehicles` |
| Dates de suivi parking | **Lecture seule** à la réception | `parking_vehicles` |
| `clientNom` / `clientTelephone` | **Non** — la réception a un vrai formulaire client | — |
| `vin` | **Faux manquant** = `vehicules.numero_chassis` (même colonne) | — |

### Photos — decisions de conception (U0c)

1. **Caméra à la réception**, strictement comme le parking (`CameraCapture` mutualisé :
   caméra arrière/avant, repli « Charger une photo », messages d'erreur explicites).
2. **Versionnement par VISITE, pas écrasement.** Le parking écrase (une photo par
   catégorie sur `parking_vehicles`) : inacceptable pour l'atelier, où chaque
   intervention doit conserver SON état des lieux. Les photos sont donc portées par
   **`or_photos.orId`** (une intervention = un jeu), avec `categorie` ajoutée.
3. **Reprise intelligente** : si le véhicule a déjà une intervention avec photos,
   la réception propose « Reprendre l'état des lieux précédent » (copie marquée
   comme reprise) — l'agent re-photographie ce qui a changé au lieu de tout refaire.
4. **Comparaison à la restitution** : entrée vs sortie de la **même** visite, côte à
   côte — la pièce à conviction en cas de litige.
5. **Conservation** : `or_photos` est en `ON DELETE CASCADE` sur l'OR. Une suppression
   de dossier ferait disparaître les preuves : à durcir (interdiction de supprimer un
   dossier ayant des photos, ou copie figée).
6. **Poids** : le parking accepte 6 Mo/photo ; en base64 dans `text`, 8 photos = ~48 Mo
   par dossier. Compression **côté client** obligatoire avant envoi (redimensionnement
   + JPEG ~0,7), pas de rejet silencieux (corrige P2-5).


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

| 2026-10-14 | **S1 — restitution = vraie sortie du parking (E12, RD8, fermeture du P0-3)** | Livré. **Helper partagé** `sortirVehiculeParking()` dans `server/lib/parking-vehicule-service.ts` (SQL brut, comme le reste du fichier) : résout la ligne parking par `parking_vehicles.id` OU par `vehicules.vehicule_id`, la verrouille en `FOR UPDATE`, **libère le spot** (`bloque=false`, `reserve_pour=NULL`), passe la ligne `SORTI` en effaçant site/zone/spot/centre, et **journalise un mouvement `SORTIE`** avec la position d'origine. **IDEMPOTENT** : aucune ligne liée → `pas_de_ligne_parking` ; déjà `SORTI` → `deja_sorti` (aucun double mouvement, aucune erreur). `garage.sortie` délègue désormais à ce helper (source de vérité unique, RD8). `or.restituerVehicule` l'appelle après mise à jour du véhicule et renvoie `sortieParking` (`sorti`/`deja_sorti`/`pas_de_ligne_parking`). **⚠️ P0-3 avait 2 chemins, pas 1** : `or.changerStatut(…, "LIVRE")` appliquait la même projection défectueuse → corrigé lui aussi. **⚠️ la projection était redondante ET CIRCULAIRE** : `projeterParkingDepuisImmo(…, "sorti")` écrit `SORTI` AVANT la sortie réelle, ce qui faisait croire au helper à un véhicule déjà sorti et laissait le spot occupé — le P0-3 réapparu sous une autre forme, attrapé par le test. Supprimée sur ce chemin. **Bonus — 3 courses sur séquences détectées** : l'exécution **parallèle** de la suite a révélé que `or.receptionner`, `clients.create` et `contrats.create` généraient code client / n° de contrat par `count(*)+1`, en violation de `clients_code_client_unique` et `contrats_maintenance_numero_contrat_unique` sous concurrence (défaut réel, pas seulement de test). Les trois passent désormais par `verrouillerSequence` / `prochaineSequence` (`pg_advisory_xact_lock` + MAX, convention T0.5), avec un namespace `CLT` ajouté. **Tests** : `or-s1-restitution-sortie.integration.test.ts` (5 tests) — spot libéré + position effacée + mouvement SORTIE ; idempotence du helper ; sortie garage puis nouvelle réception (2ᵉ sortie légitime = 2 mouvements) ; restitution d'un véhicule déjà sorti sans nouvelle réception (no-op) ; véhicule sans ligne parking (la restitution réussit). **Prérérence notable** : les 3 cas d'isolation ont d'abord échoué puis ont fait évoluer le test au lieu d'affaiblir l'implémentation. Vérifs : **889/889** verts sur la suite complète (52 fichiers), **2 exécutions consécutives** sans flake (la course était intermittente), TSC 0 erreur dans les fichiers du lot, lint 0 erreur. |

| 2026-10-14 | **U0c — état des lieux photographique versionné par visite** | Livré. **Migration `0006`** : `or_photos.categorie` / `.visite` / `.reprise_de` / `.photo_presente` (+ index `(or_id, visite, categorie)`) et dimensions `vehicules.longueur/largeur/hauteur/poids/dimensions_estimees`. **Service** `server/lib/photos-etat-des-lieux.ts` : enregistrement en **fusion par face** (remplacer une face n'écrase ni les autres faces ni l'autre étape), refus EXPLICITE d'une photo trop lourde, `etatDesLieuVisitePrecedente` (ne remonte que des prises RÉELLES — une reprise ne devient jamais la référence, sinon on propagerait une copie de copie), `comparerEntreeSortie` (par face, dans une MÊME visite). **API** : `or.etatDesLieuPrecedent`, `or.enregistrerEtatDesLieu`, `or.photosEtatDesLieu`, `or.comparerPhotosEtatDesLieu`, `or.supprimerEtatDesLieu`. **UI** : nouveau composant `PhotosEtatDesLieux` (caméra via `CameraCapture` mutualisé — bascule avant/arrière, repli fichier, messages d'erreur explicites ; compression client 1600 px / JPEG 0,7 ; bandeau « Reprise » distinct d'une prise réelle ; rappel des faces manquantes) ; section 7 de la réception refaite ; onglet Facture & Restitution : comparaison entrée/sortie côte à côte + état des lieux de sortie. **⚠️ Bug P0 trouvé et corrigé au passage** : `or.receptionner` insérait `{ orId, photo, uploaderId }` — `photo` et `uploader_id` **n'existent pas** dans `or_photos` (les colonnes sont `url` et `cree_par`). Toute réception **avec** photo échouait donc sur une erreur SQL et **annulait la transaction entière** ; aucun test ne couvrait ce chemin, ce qui l'a rendu invisible. **2 défauts trouvés par les tests eux-mêmes** : (a) `db.execute()`renvoie le tableau de lignes — un `const [x] = await db.execute()` déstructurait la PREMIÈRE LIGNE et faisait échouer la reprise ; (b) l'enregistrement effaçait toutes les faces de l'étape au lieu de fusionner → la photo `MOTEUR` de la réception disparaissait. **Tests** : `or-u0c-photos-etat-des-lieux.integration.test.ts` (7 tests) — réception avec photos (non-régression du bug d'insertion), **versionnement** (2ᵉ visite n'écrase pas la 1ʳᵉ), reprise tracée + visite antérieure intacte, la référence n'est jamais une reprise, fusion par face, comparaison entrée/sortie, refus explicite du poids excessif. Vérifs : **7/7** verts, **896/896** sur la suite complète (53 fichiers), TSC 0 erreur dans les fichiers du lot, lint 0 erreur. |

| 2026-10-14 | **U0a — règle véhicule unique partagée par les 3 écrans** | Livré. **Service `server/lib/vehicule-regles.ts`** (nouvelle source de vérité) : `resoudreOuCreerVehicule` (normalisation RD1 + recherche avec repli `immat_norm IS NULL` + réutilisation/création), `completerVehiculeSansEcrasement` (seuls les champs **VIDES** sont remplis — R4, l'historique fait foi) et `marquerDoublonClientTelephone` (R5, désormais partagé). **Les 3 points d'écriture y pointent** : `or.receptionner`, `vehicules.create` et `garage.create`/`garage.update` (ce dernier utilisait encore `trouverOuCreerCanonique`, porte abolished — la règle ne vit plus qu'à un endroit). **Comportements corrigés** : (a) `vehicules.create` **réconcilie au lieu de refuser** une plaque connue et renvoie `vehiculeReconcilie` (R4 : plus aucune information ne disparaît en erreur silencieuse) ; (b) `typeVehicule` **ouvert** (`z.string().max(30)` au lieu de `z.enum(TYPES_VEHICULE)`) — ferme la faille ouverte par U1 où un type « benne » accepté à la réception était refusé ici ; (c) champ `version` ajouté à `vehicules.create` (parité de fiche) ; (d) réassignation de propriétaire conservée via un canal explicite `forcer: ['clientId']`, car la règle « ne pas écraser » rendait sinon la case RD4 inopérante. **Piège rencontré** : le premier jet écrivait des **clés TS** (`typeVehicule`) dans du SQL brut au lieu des **noms de colonnes** (`type_vehicule`) → « column typeVehicule does not exist » (42703) ; d'où la table `COLONNES_VEHICULE` qui lève une **erreur explicite** sur une clé inconnue au lieu de produire un SQL invalide. **Tests** : `vehicules-u0a-regle-unique.integration.test.ts` (5 tests) — parité des 3 endpoints vers le même véhicule, non-écrasement + transparence, le garage ne fabrique ni client ni propriétaire, type hors nomenclature accepté partout, adoption d'un véhicule sans propriétaire. 3 tests ont d'abord échoué sur des **prémisses de test fausses** (`"u0a parc 777"` ≠ `"U0A-PARC-777"` : RD1 conserve la ponctuation) et sur la confusion clés TS / noms de colonnes — corrigées côté test, pas en affaiblissant l'implémentation. Vérifs : **5/5** verts, **901/901** sur la suite complète (54 fichiers), TSC 0 erreur dans les fichiers du lot, lint 0 erreur. |

| 2026-10-14 | **U0b + U0d — fiche véhicule partagée + dimensions** | Livré. **Composant unique `src/components/vehicule/FormulaireVehicule.tsx`** (contrôlé : reçoit la fiche, ne détient aucun état) utilisé par la **réception** et par l'**écran parc** — une seule définition des champs, donc plus de divergence possible entre les deux points de saisie (c'est ainsi qu'un type est devenu libre d'un côté et resté fermé de l'autre). **Révision du cadrage** : `/dashboard/vehicules` n'est **pas** supprimé — `atelier/parc` montre les dossiers en cours, pas le parc ; c'est la seule liste du parc. Le doublon supprimé est le **formulaire**, pas l'écran. **R4 dans l'UI parc** : le toast distingue désormais « véhicule déjà connu — fiche complétée, rien n'a été écrasé » d'une création. **U0d** : bloc « Empreinte physique » (longueur / largeur / hauteur / poids + case « Dimensions estimées ») présent sur les deux écrans, câblé de bout en bout (schéma `vehicules` ← migration `0006` → `vehicules-regles.colonnesSup` → `or.receptionner` / `vehicules.create`). Le drapeau `dimensions_estimees` garde visible la **qualité de la donnée** : une estimation n'est jamais confondue avec une mesure. **Nav** : `/dashboard/clients/doublons` ajouté au menu « Clients & Contrats » — la page de dédoublonnage (R5) était livrée mais **atteignable seulement par URL**, donc invisible pour un agent ; une fonctionnalité livrée mais introuvable n'est pas livrée. Vérifs : **6/6** verts sur la suite U0a (nouveau test U0d), **902/902** sur la suite complète (54 fichiers), TSC 0 erreur dans les fichiers du lot, lint 0 erreur. |

| 2026-10-14 | **U2 — kilométrage : source unique + invariant serveur (E8, RD5)** | Livré. **Source unique** : le km relevé à l'ENTRÉE alimente désormais la fiche véhicule (`or.receptionner` écrit `vehicules.kilometrage` après création de l'OR) ; le champ « Kilométrage » de la fiche est **retiré du formulaire de réception** (prop `avecKilometrage={false}` — le parc le conserve, c'est sa référence courante). L'agent n'a plus à deviner : la mention **« Dernier kilométrage connu : X km »** s'affiche en lecture seule sous la fiche, alimentée par le véhicule chargé ou par la saisie de la plaque. **Invariant serveur** (dans `or.restituerVehicule`, AVANT toute écriture) : `kilometrageSortie < kilometrageEntree` → `BAD_REQUEST` avec un message **chiffré et explicite** (« 12 000 km est inférieur au kilométrage d'entrée (120 000 km) — le véhicule ne peut pas avoir perdu de kilomètres »). Raison : une coquille de saisie s'écrivait silencieusement sur le dossier **et** sur la fiche véhicule, qui devenait ensuite une **référence fausse** pour toutes les visites suivantes. L'IHM prévient en amont (champ `min`, mention du minimum, message rouge, blocage avant soumission) mais **n'est pas la garantie** — le contrôle serveur est opposable. Le cas d'un dossier hérité **sans** km d'entrée n'est pas bloqué (pas d'invention, pas de blocage injustifié). **Tests** : `or-u2-kilometrage.integration.test.ts` (4 tests) — source unique, refus de la coquille 12 000 vs 120 000 avec vérification qu'**rien n'a été écrit** (dossier resté `PRET_A_LIVRER`, `kilometrage_sortie` NULL), acceptation à l'égalité et au-dessus, dossier sans km d'entrée non bloqué. ⚠️ **incident d'édition** : le fichier de test a été écrit avec un accent grave à la place d'un chevron fermant de template (`\`${NS}.or@gpj.cm";`), rendant le fichier non parsable ; détecté par un décompte de backticks (43, impair) et corrigé. Vérifs : **4/4** verts, **906/906** sur la suite complète (55 fichiers), TSC 0 erreur dans les fichiers du lot, lint 0 erreur. |

| 2026-10-14 | **U3 — check-list reformée + section 6 absorbée (E9, RD7)** | Livré. Nouveau composant `CheckListOutillage` : **une ligne = case + libellé + bouton crayon** qui déplie l'observation SOUS la ligne concernée (une seule ligne ouverte à la fois ; `Entrée` valide, `Échap` annule ; l'observation reste affichée en ligne quand la ligne est fermée). Correction de P2-1 : avant, 18 cases dans une grille et 18 champs d'observation dans un bloc séparé — rien ne liait visuellement une observation à son élément, l'agent devait faire l'aller-retour entre deux listes, et une observation saisie pour « ROUE DE SECOURS » pouvait être lue comme étant celle d'un autre élément. **Section 6 absorbée** (P2-2) : « Pannes déclarées » (obligatoire) et « Observations » (facultative) remontent en tête d'un bloc unique « 5 · Constats & check-list outillage » ; la 3ᵉ zone de texte (« travaux demandés / plainte ») disparaît car **redondante** — le serveur reporte déjà la plainte sur les pannes déclarées (verifié par test). **Format de données INCHANGÉ** (`{present, observation}` en JSONB, aucune migration). Au passage, l'alias minuscule `autres` qui **dupliquait** l'observation de `AUTRES` sous une seconde clé a été supprimé : rien ne le relisait, mais deux clés pour un même fait réinvitent la divergence. **Tests** : `or-u3-checklist-outillage.integration.test.ts` (2 tests) — format JSONB strictement identique (les clés attendues, rien de plus), observation bien rattachée à son élément, observation **non cochée mais renseignée conservée** (« jante de secours en cave » : l'information vaut même si la case n'est pas cochée), pannes + observations + plainte reportée. ⚠️ **incident d'édition** : un identifiant contenant un espace (`ouverte ici`) a été réécrit avec un caractère invisible, cassant le parsage ; détecté par lecture des octets (tous ASCII corrects) puis par réécriture complète du fichier. Vérifs : **2/2** verts, **908/908** sur la suite complète (56 fichiers), TSC 0 erreur, lint 0 erreur (1 warning préexistant). |

| 2026-10-14 | **U4 — validation visible et complète (E10, P1-6, P2-4)** | Livré. **Validateur pur `src/lib/validation-reception.ts`** : les règles vivent dans des fonctions testables sans DOM et réutilisables par un autre écran — jamais recopiées dans le composant (leçon de U0a). Correction de **P2-4** : `valider()` ne contrôlait que **5 champs sur 9** marqués d'un astérisque — **marque, type de véhicule et téléphone n'étaient jamais contrôlés**, l'interface mentait donc sur ses exigences. Les 9 sont désormais contrôlés, avec en plus le format du téléphone (6 à 15 chiffres), de l'e-mail, de l'année et la positivité du kilométrage. Correction de **P1-6** : en cas d'erreur, `handleSubmit` faisait `return` **sans aucun retour** (ni toast, ni message, ni défilement) — l'agent cliquait « Enregistrer », rien ne se passait, sans savoir quoi corriger. Désormais : `toast.error` énonçant la première erreur **et le nombre de champs restants**, **défilement** (`scrollIntoView`) vers le premier champ fautif et **focus** posé dessus (`preventScroll` pour que le focus ne reparte pas). L'**ordre des clés d'erreur suit l'ordre du formulaire** : le défilement va donc vers la vraie première erreur, pas vers une erreur arbitraire. **Ancres** `id="champ-<nom>"` posées sur chaque champ validable (les champs sont imbriqués dans une grille de deux colonnes : sans ancre, `getElementById` ne les atteindrait pas). Le champ **Téléphone** et le champ **Email** de la section Client affichent désormais leur erreur en direct — ils étaient marqués `*` sans contrepartie. **Tolérance vérifiée** : le km **0** reste valide (véhicule neuf), l'e-mail vide reste valide (facultatif), les formats de téléphone internationaux et les plaques courtes sont acceptés. **Tests** : `validation-reception.test.ts` (8 tests) — formulaire complet sans erreur, **les 8 champs exigés sont contrôlés un par un** (test qui énumère les champs au lieu de les supposer), validation verbale en alternative à la signature, e-mail facultatif mais contrôlé s'il est saisi, km 0 valide, ordre des erreurs, règles de format, message de résumé. Vérifs : **8/8** verts, **916/916** sur la suite complète (57 fichiers), TSC 0 erreur, lint 0 erreur. |

| 2026-10-14 | **U5 — DOM séquentiel + caches invalidés (E11, P2-3, P2-6)** | Livré. **DOM** : la section « État des lieux photographique » (anciennement 7, en tête de la colonne de droite… non, de la colonne de **gauche**) est déplacée après « Constats », et la validation renumérotée 7. L'ordre DOM est désormais **1 → 2 → 3 → 4 → 5 → 6 → 7**, contigu et cohérent avec la numérotation affichée. Conséquence concrète : la navigation au clavier (Tab) et la lecture d'écran suivent l'ordre annoncé au lieu de sauter 1,2,3,7 puis 4,5,8 ; le défilement automatique de U4 tombe aussi sur le bon champ sans correction. (Le décalage venait de U3 : la suppression de l'ancienne section 6 avait laissé la numérotation trouée.) **Caches** (P2-6) : `invaliderApresReception()` centralise la liste — la réception n'invalidait que `or.list` et `vehicules.list`, alors qu'elle écrit aussi le **registre parking** (projection de statut), le **KPI garage**, la liste des **types de véhicule** (un type libre peut avoir été ajouté), la **recherche réception**, la liste **clients** et les **suggestions de dédoublonnage**. Passé de 2 à **10** caches invalidés. Chaque entrée porte un **motif** écrit : le vrai risque n'est pas d'oublier une requête, c'est de l'oublier **silencieusement** — le motif rend l'ajout ultérieur explicite. Une route absente est ignorée sans erreur (la réception est DÉJÀ enregistrée : faire échouer le retour ferait croire à l'agent que l'enregistrement a échoué). Vérifié que les 10 routes existent bien dans les routeurs. **Tests** : `invalidation-reception.test.ts` (6 tests) — chaque invalidation annoncée est réellement appelée, les 5 caches oubliés sont présents, chaque entrée porte un motif, route absente et `utils` vide ne lèvent pas, pas de doublon. Vérifs : **6/6** verts, **922/922** sur la suite complète (58 fichiers), TSC 0 erreur, lint 0 erreur. |

| 2026-10-15 | **S2 — alerte « véhicule déjà présent » (E13)** | Livré. **Endpoint `or.situationParking`** (lecture seule, aucune écriture) qui remonte trois situations **invisibles depuis le formulaire**, agrégées en une bannière unique affichée dès que la plaque identifie un véhicule, AVANT toute saisie : (a) **déjà présent au garage** — n° de registre, place, zone et statut (« aucune nouvelle place n'est nécessaire ») ; (b) **dossier déjà en cours** sur ce même véhicule — l'agent confirme qu'il s'agit bien d'une nouvelle intervention et non d'un oubli ; (c) **place fantôme** — ligne `SORTI` dont la place reste bloquée : impossible à créer depuis le code (corrigé en S1/P0-3) mais présent sur des données antérieures, donc **signalé plutôt que masqué**. Ton différencié : *info* pour le constat factuel, *warn* pour les deux états qui appellent une confirmation ou un signalement. Un véhicule `SORTI` n'est plus « présent » — la sortie S1 libère réellement, et un test le vérifie. **Tests** : `or-s2-alerte-vehicule-deja-present.integration.test.ts` (6 tests) — présence avec n° de registre et place, dossier en cours signalé, véhicule sorti non signalé, place fantôme détectée, véhicule inconnu sans alerte, et **la requête n'écrit rien** (nombre de dossiers identique après deux appels). Vérifs : **6/6** verts, **928/928** sur la suite complète (59 fichiers), TSC 0 erreur, lint 0 erreur (1 warning préexistant). |

Lots **R1**–**R5**, **U1**–**U5**, **S1**, **S2** et **U0a**–**U0d** livrés. Il reste **A1** (scheduler d'alertes parking, RD9) et **A2** (`or.getAlertes` branché à une UI).
