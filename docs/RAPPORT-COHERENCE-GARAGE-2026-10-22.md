# Cohérence garage — rapport d'audit et plan d'ajustement

> **Date** : 2026-10-22
> **Périmètre** : parcours de création d'un véhicule, liste atelier, registre parking,
> fiche véhicule 360°, module Client, contrats.
> **Statut** : corrections appliquées en local, **non commitées**, **aucune écriture
> en production** pendant ce lot.
> **Documents liés** : `docs/PLAN-COHERENCE-GARAGE.md`,
> `docs/HARMONISATION-VEHICULE.md`.

---

## 1. Résumé exécutif

Le défaut principal n'était pas visuel : **quatre interfaces pouvaient créer un
véhicule avec quatre niveaux de complétude différents**. La réception était le
seul parcours complet (client, véhicule, ligne parking, OR). Les trois autres
créaient une fiche canonique isolée, ou une ligne parking sans OR, et
produisaient des données que les autres écrans ne savaient pas interpréter.

Le module Client était par ailleurs **inutilisable comme point d'entrée** : le
domaine « Clients » ouvrait un hub de cartes vide, la liste réelle était ailleurs,
et les 31 fiches de production — toutes `PROVISOIRE` — étaient filtrées comme si
elles n'existaient pas.

Ce lot ferme les trois trous :

1. **une seule porte de création** : `/dashboard/atelier/reception` ;
2. **le module Client devient la liste de référence**, avec validation des fiches
   provisoires et liens vers véhicules, OR et parking ;
3. **la fiche véhicule et la liste parlent le même langage** : identité, client,
   statut atelier, position parking, version, dimensions, poids et dates.

---

## 2. Audit — ce qui a été constaté

### 2.1 Les quatre chemins de création

| Chemin | Ce qu'il créait | Défaut |
|---|---|---|
| `/dashboard/atelier/reception` (`or.receptionner`) | client si besoin, véhicule canonique, ligne parking, OR, mouvements | **Chemin complet — conservé** |
| `/dashboard/vehicules` (`vehicules.create`) | fiche canonique seule | Aucun OR, aucune ligne parking, aucune réception ; le véhicule apparaissait dans l'atelier sans dossier |
| `/dashboard/garage/vehicules` (`garage.create`) | ligne parking + fiche canonique + client provisoire + mouvement | Aucun OR ; la fiche et le registre pouvaient diverger |
| `ordres-reparation` → `VehiculeRecherche` (`or.createVehicule`) | fiche canonique seule | Quatrième variante, sans réception ni position |

Les trois derniers ont été retirés de l'interface. Les endpoints serveur restent
présents pour les imports et les tests, mais **aucun écran ne les expose plus**.

### 2.2 Le module Client

- `app-nav.tsx` pointait vers `/dashboard/clients`, un `DomainHub` sans données.
- La vraie liste `/dashboard/customers` ne figurait pas dans le domaine.
- Le filtre `statut: "ACTIF"` était utilisé par le sélecteur de propriétaire de
  la fiche véhicule et par les trois sélecteurs de contrats.
- En production, **31 clients sur 31 sont `PROVISOIRE`** : ces sélecteurs
  renvoyaient donc zéro client.
- La fiche client affichait les véhicules via l'ancienne requête
  `vehiculesClient`, sans statut canonique, sans OR en cours et sans position
  parking.

### 2.3 La fiche et la liste

La fiche `vehicules.get` ne renvoyait pas plusieurs champs pourtant visibles dans
la liste ou attendus par la 360 : version, dimensions, poids, `dimensionsEstimees`,
`isActive`, `updatedAt`. Deux écrans décrivaient donc le même véhicule avec deux
niveaux d'information différents.

Le registre parking, lui, affichait uniquement l'identité et le client stockés
sur `parking_vehicles`, sans le statut atelier ni le client canonique. Le lien
« Voir » de la revue du parc utilisait `vehicule_id` au lieu de l'identifiant de
la ligne parking : il ouvrait la mauvaise fiche, ou aucune.

### 2.4 Données de production relevées (lecture seule)

| Mesure | Valeur |
|---|---:|
| Clients | 31, tous `PROVISOIRE` |
| Véhicules canoniques | 55 |
| Véhicules avec client | 42 |
| Véhicules sans client | 13 |
| Lignes parking | 54, toutes liées à un véhicule |
| Véhicules sans ligne parking | 1 |
| OR avec `client_id = NULL` | 1 |
| Divergences d'identité parking / canonique | 0 |
| Lignes parking multiples pour un même véhicule | 0 |

Ces chiffres ne sont pas des anomalies à corriger automatiquement : les 13
véhicules sans client et le véhicule sans ligne parking peuvent être des cas
légitimes (véhicule créé à la réception, ligne sans identité). Ils sont listés
dans le plan d'ajustement pour décision.

---

## 3. Corrections livrées

### 3.1 Une seule interface de réception

- `VehiculesListClient.tsx` : suppression de la modale et de la mutation
  `vehicules.create` ; le bouton devient **« Nouvelle réception »**.
- `garage/vehicules/page.tsx` : suppression de `?nouveau=1`, de `formOpen`, du
  bouton et de la modale de création ; lien **« Réception véhicule »**.
- `garage/page.tsx` : le bouton « Enregistrer un véhicule » devient un lien de
  réception, masqué sans `or.modifier`.
- `VehiculeRecherche.tsx` : suppression du mini-formulaire et de
  `or.createVehicule` ; renvoi vers la réception dans un nouvel onglet.
- `VehiculeFormDialog.tsx` : devient une **modale d'édition seule**. Le type
  `vehicule` est non nul et les deux parents ne la montent que lorsqu'une ligne
  est sélectionnée — sinon l'initialisation `useState` lisait `null`.
- `clients-help.ts` : le mode d'emploi ne décrit plus « Parc → Nouveau
  véhicule », mais la réception.

### 3.2 Module Client

- `app-nav.tsx` : le domaine Clients pointe vers `/dashboard/customers`.
- `clients/page.tsx` : redirection vers la liste réelle.
- `CustomersListClient.tsx` :
  - filtre et libellé `PROVISOIRE` ;
  - total réel (`data.total`) au lieu du nombre de lignes de la page ;
  - état d'erreur avec bouton « Réessayer » ;
  - sous-navigation Clients / Contrats flottes / Doublons ;
  - action **Valider** une fiche provisoire, avec `clients.modifier` (la
    permission réellement exigée par le serveur), `toast`, et invalidation de
    `clients.list` **et** `clients.get`.
- `CustomerDetail.tsx` :
  - bouton « Valider la fiche » pour une fiche `PROVISOIRE` ;
  - lien « Nouvelle réception » ;
  - onglet Véhicules enrichi : statut canonique, OR en cours, position parking,
    version, liens fiche / OR / parking.
- `clients-router.ts` : `clients.get` renvoie en plus `vehiculesCanoniques`,
  calculés par la **liste canonique partagée**, au lieu de réinventer une
  requête locale.

### 3.3 Fiche, liste et registre alignés

- `vehicules-router.ts` : `vehicules.get` renvoie version, longueur, largeur,
  hauteur, poids, `dimensionsEstimees`, `isActive`, `updatedAt` ; les requêtes
  client et « autres véhicules » sont bornées à l'agence.
- `FicheVehicule360.tsx` :
  - sélecteur client sans filtre `ACTIF` (les fiches provisoires sont
    sélectionnables) ;
  - retour contextuel atelier / parking ;
  - badges « Client provisoire » et « Fiche inactive » ;
  - version, dimensions, poids et date de mise à jour affichés.
- `liste-canonique-vehicules.ts` :
  - nom client `raisonSociale || prenom + nom` ;
  - `clientStatut` exposé ;
  - recherche sur le prénom ;
  - `pos.site_id` exposé dans le LATERAL, sans quoi le filtre `siteId` produisait
    un SQL invalide.
- `garage-router.ts` :
  - `garage.vehicles` joint `vehicules` et `clients` : identité, client et statut
    canoniques, avec repli sur les colonnes parking pour les lignes sans fiche ;
  - `total` calculé par `count(*)`, plus `rows.length` ;
  - recherche élargie au canonique et au client ;
  - `garage.vehicule` renvoie le statut canonique, le client canonique et son
    statut.
- `garage/vehicules/page.tsx` : badge parking **et** badge atelier, badge
  « Provisoire » sur le client ; le compteur parle de « véhicules au registre ».
- `garage/vehicules/[id]/page.tsx` : mêmes badges, statut client, et montage
  conditionnel de la modale d'édition.
- `RevueVehicules.tsx` : le lien « Voir » utilise `r.id` (ligne parking), plus
  `vehiculeId`.
- `revue-parc-router.ts` : recherche élargie au canonique et au client, avec
  `LEFT JOIN clients` pour ne pas exclure les véhicules sans client.
- `garage.vehicule` / `garage.vehicles` : le client affiché est le client
  canonique quand il existe.
- `vehicule-regles.ts` : un client créé depuis le parking naît désormais
  `PROVISOIRE`, plus `ACTIF`.

### 3.4 Contrats

`ContratsListClient.tsx` ne filtre plus les clients sur `ACTIF`. Il charge les
types Entreprise / Administration / Flotte et retient `ACTIF` ou `PROVISOIRE` ;
les fiches provisoires sont signalées dans le sélecteur. Sans cela, les contrats
étaient impossibles à créer pour la totalité du parc actuel.

---

## 4. Décisions actées

1. **La réception est l'unique porte de création** d'un véhicule et de son
   propriétaire. Les endpoints de création restent technique/import uniquement.
2. **La fiche canonique est la source** du propriétaire, du statut atelier et de
   l'identité ; le parking ajoute son statut opérationnel, il ne le remplace pas.
3. **Les deux statuts restent deux dimensions** : statut parking (place, passage)
   et statut atelier (cycle d'immobilisation). L'UI les affiche ensemble.
4. **Une fiche client née du parking est `PROVISOIRE`** ; la réception la promeut
   en `ACTIF` et écrit l'historique.
5. **Le nom d'affichage client** est `raisonSociale || prenom + nom`, partout.
6. **Le total affiché est un `count(*)`**, jamais la taille de la page.

---

## 5. Plan d'ajustement

### Priorité 1 — avant de considérer le lot terminé

| # | Action | Critère de fin |
|---|---|---|
| A1 | Ajouter des tests d'intégration sur `garage.vehicles`, `garage.vehicule` et `clients.get` avec un véhicule lié, un client `PROVISOIRE` et une ligne parking | Les trois réponses exposent le même statut, le même client et la même position |
| A2 | Tester le parcours UI : depuis la liste atelier, aucun bouton de création ne subsiste ; depuis le parking, idem | Test de rendu ou revue navigateur consignée |
| A3 | Rejouer la suite complète après nettoyage de la base de test | ✅ **fait** : 103 fichiers / 1241 tests verts, 3 ignorés. Si `or-etape4` réapparaît, isoler le test qui crée un `LIVRE` sans restitution |
| A4 | Vérifier en production, après déploiement, que les 31 fiches provisoires apparaissent et peuvent être validées | Capture ou relevé de 3 fiches validées, historique écrit |
| A5 | Décider du sort des endpoints `vehicules.create`, `garage.create`, `or.createVehicule` | Soit suppression, soit permission dédiée « import » et documentation ; plus aucun appel UI |

### Priorité 2 — qualité de données

| # | Action | Décision attendue |
|---|---|---|
| B1 | Les 31 clients `PROVISOIRE` | Campagne de validation (téléphone / identité) ; ne pas promouvoir en masse sans vérification |
| B2 | 13 véhicules sans client | Distinguer véhicule créé à la réception sans propriétaire identifiable et oubli de rattachement |
| B3 | 1 véhicule sans ligne parking | Vérifier s'il est en atelier hors parking (normal) ou s'il manque une position |
| B4 | 1 OR avec `client_id = NULL` | Rattacher le client si l'identité est connue ; sinon laisser et documenter |
| B5 | 54 lignes parking / 55 véhicules | Aucune duplication constatée ; conserver la règle « une ligne parking par passage » |

### Priorité 3 — cohérence restante

| # | Action | Raison |
|---|---|---|
| C1 | Pagination du registre parking (`limit: 200` en dur) | Le total est désormais honnête, mais la liste reste tronquée au-delà de 200 |
| C2 | Compteurs par type de la liste clients | Le total est réel, mais les compteurs sont encore calculés sur la page |
| C3 | Supprimer `vehiculesClient` de `clients.get` une fois la 360 migrée | Deux sources de véhicules dans la même réponse, même si l'UI utilise la canonique |
| C4 | Statut atelier affiché sur la carte parking | Aujourd'hui visible dans le registre et la fiche, pas dans la vue carte |
| C5 | `P3.3.1` marge par dossier | Toujours bloqué par la décision métier sur le coût horaire atelier |
| C6 | Seed des cibles KPI en production | `kpi_cibles` : 22 local vs 12 production ; consentement requis |
| C7 | Rendu React réel (`jsdom`) et réduction de la baseline `tsc` | Baseline 303 erreurs, aucune dans les fichiers du lot ; l'étape 7 reste partielle |
| C8 | Test `or-etape4-restitution-preuve` | Échoue uniquement dans la suite complète, passe seul ; invariant global sur une table partagée |

---

## 6. Validation technique

| Vérification | Résultat |
|---|---|
| `next build` | **Succès** — la frontière client/serveur tient |
| `tsc --noEmit` | **303 erreurs de baseline**, aucune dans les fichiers modifiés |
| `vitest run` | **1241 tests passés / 3 ignorés** — suite complète verte. L'échec ponctuel précédent (`or-etape4-restitution-preuve`, invariant global) n'est pas réapparu ; le fichier seul passe 4/4 |
| SQL `garage.vehicles` (jointures + count) | Exécuté sur la base de test : 47 lignes, identités et statuts canoniques cohérents |
| SQL `garage.vehicule` (jointures) | Même structure de jointures, validée par PostgreSQL |
| SQL `clients.get` / liste canonique | Requête LATERAL + `site_id` validée par PostgreSQL |
| SQL recherche revue du parc | `EXISTS` + `LEFT JOIN clients` validé, y compris véhicules sans client |

**Aucune migration**, aucun `db:sync`, aucun commit, aucun push, aucune écriture
en production n'ont été effectués pendant ce lot.

---

## 7. Risques et points de vigilance

- **Ne pas réintroduire une création « rapide »** dans la liste atelier ou le
  registre parking : ce serait recréer la divergence que ce lot supprime.
- **Ne pas promouvoir les clients provisoires en masse** : la validation doit
  être une preuve (identité ou contact), pas une case à cocher.
- **Le statut canonique reste un cache** : si un chemin d'écriture ne le met pas
  à jour, l'UI parking affichera un statut atelier périmé. Les tests A1 doivent
  couvrir ce cas.
- **Les endpoints de création restent appelables** : tant qu'ils existent, une
  intégration ou un nouveau composant peut les réutiliser. Décision A5 requise.
- **La base de test conserve des résidus** : l'échec `or-etape4` le rappelle ;
  une suite verte deux fois n'est pas une garantie.

---

## 8. État Git

Les corrections sont dans le working tree, **non commitées**. `origin/main` est
resté à `b3cbae1`. Aucun push n'a été effectué.
