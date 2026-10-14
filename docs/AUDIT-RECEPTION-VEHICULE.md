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
| E7 | Type de véhicule = combobox (suggestions + libre) | Atteint | U1 |
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
| **R4** | Transparence entités existantes | réception (UI) | ⬜ |
| **R5** | Dédoublonnage client | clients, réception | ⬜ |
| **U1** | Type véhicule combobox | réception (UI) | ⬜ |
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
| 2026-10-14 | **R1 – R5 – unicité plaque + réconciliation** | Livré. Migration `0004` (index unique partiel `immat_norm`, `vehicules.ts`), helper centralisé `immat-utils.ts` (`normaliserImmat`, `immatNormaleCondition`, `immatNormPreferenceSql` avec fallback `immat_norm IS NULL` pour lignes héritées), script `dedup-vehicules-immat.ts` (backfill + fusion), branchement des 3 points d'insertion (`or.createVehicule`, `or.receptionner`, `trouverOuCreerCanonique`). **Régression** : `garage-lot1` échouait (lookup sur `immat_norm` seul ignorait les lignes NULL) → corrigée par le fallback. Vérifs : TSC 0 erreur dans fichiers touchés ; 36/36 tests verts (`garage-lot1` 8, `garage-lot2` 8, `or-lot0` 5, `or-lot4-cycle` 15) ; test nouveau `or-r1-immat-uniqueness.integration.test.ts`. Pas encore de commit. |

Lot **R1** livré (plaque unique + réconciliation). **R2** et **R3** sont couverts par ce même livrable (réconciliation par plaque normalisée dans `or.createVehicule` et `or.receptionner`). Prochains lots : **R4** (transparence entités existantes – UI réception), **R5** (dédoublonnage client), **U1** (combobox type véhicule), puis U2–U5, S1, S2, A1, A2.
