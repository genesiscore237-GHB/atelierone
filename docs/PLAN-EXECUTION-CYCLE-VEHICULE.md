# Plan d’exécution — cycle véhicule

> Statut : **livré et vérifié** le 2026-10-23.
> Aucun commit ni push n’a été effectué. Les migrations 0031 et 0032 ont été
> appliquées à la base locale, à la base de test et à la production Neon.

## 1. Objectif

Rendre le cycle véhicule cohérent de bout en bout :

- réception → passage parking → OR → travaux → comptes rendus → restitution ;
- une seule vérité pour le statut, le kilométrage, la plainte et les photos ;
- interfaces alignées sur le métier, sans doublon ni action fantôme ;
- alertes et dashboard compréhensibles, testés et exploitables.

## 2. Décisions de conception

| Sujet | Décision |
|---|---|
| Passage parking | **Une ligne `parking_vehicles` par passage**. Un passage actif maximum par véhicule. |
| Réception | `or.receptionner` crée le passage parking dans la même transaction que l’OR. |
| Lien OR ↔ passage | `parking_vehicles.or_id` porte le dernier OR qui a ouvert/réutilisé le passage. |
| Projection de statut | Met à jour **uniquement le passage actif** ; jamais les lignes `SORTI`. |
| Kilométrage | La réception initiale et la modification d’entrée alimentent `vehicules.kilometrage`. |
| Plainte | `pannesDeclarees` reste la saisie unique ; `plainte` est synchronisée. |
| Comptes rendus | `or_interventions` reste en ajout seul ; visible dans l’OR et dans le journal atelier. |
| Photos | `or_photos.visite` distingue `ENTREE`, `TRAVAUX`, `SORTIE` ; une galerie par contexte. |
| Dashboard | « Véhicules en parc » = véhicules distincts ; « OR ouverts » = dossiers. |
| Alertes | Atelier calculées à la volée ; parking persistées par le scheduler. |
| Plaque | Unicité **par agence** ; l’index global est retiré. |
| Véhicules sans plaque | Restent parking-only : aucune réception atelier sans plaque. |

## 3. WBS et suivi

Légende : `[x]` fait et vérifié.

### L0 — Baseline et garde-fous

- [x] `git status` figé, aucun fichier utilisateur écrasé.
- [x] Tests ciblés du cycle véhicule exécutés avant modification.
- [x] Migration et schéma relus.
- [x] Plan de rollback : migrations additives, aucune suppression de données.

### L1 — Passage parking et projection

- [x] `parking_vehicles.or_id` + index.
- [x] Service `ouvrirPassageReception`.
- [x] `or.receptionner` crée le passage dans sa transaction.
- [x] `garage.create` refuse un second passage actif.
- [x] Projection limitée au passage actif (`statut-vehicule.ts`, `parking-vehicule-service.ts`).
- [x] `sortirVehiculeParking` choisit le passage actif, plus l’ancien.
- [x] Tests : ancien `SORTI` préservé, nouveau passage créé, OR lié.

### L2 — Modification de la réception

- [x] `or.update` refuse un OR clos.
- [x] `or.update` refuse les champs d’entrée si diagnostic figé, sauf emplacement.
- [x] `kilometrageEntree` synchronisé vers `vehicules.kilometrage`.
- [x] `pannesDeclarees` synchronisé vers `plainte`.
- [x] Kilométrage non obligatoire en modification.
- [x] Emplacement désactivé quand la réception est figée.
- [x] Cession de propriétaire dédiée (`vehicules.ceder`) avec motif et audit.
- [x] Tests d’intégration.

### L3 — Fiche 360 et comptes rendus

- [x] `vehicules.get` renvoie technicien, autorisation, blocage, durée.
- [x] Comptes rendus visibles dans l’onglet Travaux de l’OR.
- [x] Journal atelier global avec recherche et rafraîchissement.
- [x] Historique des passages cliquable.
- [x] Lien « Ouvrir l’OR » depuis la fiche 360.
- [x] Rafraîchissement de la fiche 360 toutes les 30 s.

### L4 — Photos

- [x] `ajouterPhoto` accepte `visite`.
- [x] Réception → `ENTREE`, travaux → `TRAVAUX`.
- [x] Galerie OR filtrée par contexte.
- [x] Suppression du doublon dans l’onglet Historique.
- [x] Sources « photos OR » et « photos parking » distinguées.
- [x] `vehicules.photos` ignore un passage vide pour ne pas masquer les photos précédentes.
- [x] Photos historiques sans `visite` conservées dans l’entrée (pas de perte).

### L5 — Dashboard et alertes

- [x] `vehiculesPresents` distinct de `orOuverts`.
- [x] `ferme_definitif` exclu des vues actives.
- [x] Dernier compte rendu visible par véhicule.
- [x] Scheduler parking démarré dès la consultation des alertes, timer `unref`.
- [x] Rafraîchissement de la fiche 360.

### L6 — Unicité et données

- [x] Index global `immat_norm` remplacé par un index non unique.
- [x] Unicité par agence conservée.
- [x] Migrations 0031 et 0032 idempotentes.
- [x] Aucune donnée historique supprimée.
- [x] `db:check` : schéma identique.

### L7 — Qualité et livraison

- [x] Tests unitaires ciblés.
- [x] Tests d’intégration base locale.
- [x] `vitest` complet : **1257 passés, 3 ignorés**.
- [x] `tsc --noEmit` : aucune nouvelle erreur dans les fichiers du lot (305 erreurs baseline hors périmètre).
- [x] `next build` vert.
- [x] `pnpm db:check` : schéma identique, 29 divergences de données tolérées.
- [x] Documentation de suivi mise à jour.
- [x] `graphify update .`.

## 4. Preuves

| Exigence | Preuve |
|---|---|
| Réception crée un passage | `or-passage-parking.integration.test.ts` |
| Ancien passage intact | même test, cas 3 |
| Un seul passage actif | `garage.create` garde + test de réception |
| Km cohérent | même test, cas 4 |
| Plainte cohérente | même test, cas 4 |
| OR clos refusé | même test, cas 5 |
| Diagnostic figé | même test, cas 6 |
| Comptes rendus dans l’OR, la fiche et le journal | `interventions-flux.integration.test.ts` |
| Dashboard distinct et `ferme_definitif` exclu | `interventions-flux.integration.test.ts` |
| Cession tracée | `interventions-flux.integration.test.ts` |
| Photos par visite | `or-u0c-photos-etat-des-lieux.integration.test.ts` |
| Suite complète | `vitest-cycle2.log` : 1257 passés / 3 ignorés |
| Build | `next-build-cycle2.log` |
| Base | `db-check-cycle2.log` : schéma identique |

## 5. Points résiduels assumés

- `or.receptionner` n’écrit pas de ligne `parking_movements` : la ligne de passage
  porte `date_entree`. Le journal des mouvements reste utilisé par les sorties et
  les déplacements. À compléter si l’exploitation exige un mouvement `ENTREE`
  pour chaque réception.
- Le scheduler parking reste un `setInterval` : il démarre à la consultation des
  alertes et est `unref`, mais un cron serveur reste préférable en serverless.
- Les photos historiques de travaux sont en `ENTREE` (valeur par défaut
  antérieure). Elles ne sont pas supprimées ; les nouvelles sont classées.
- Les véhicules sans plaque ne peuvent pas être réceptionnés à l’atelier :
  décision produit maintenue, aucune plaque inventée.
- Plusieurs OR peuvent partager un même passage physique (retours/reprises) ;
  le passage reste unique et la projection ne touche que le passage actif.

## 6. Journal d’exécution

| Date | Lot | Résultat | Preuve |
|---|---|---|---|
| 2026-10-23 | L0 | Baseline figée | `git status` |
| 2026-10-23 | L1-L2 | Passage, projection, réception, cession | tests ciblés |
| 2026-10-23 | L3-L4 | Fiche, comptes rendus, journal, photos | tests ciblés |
| 2026-10-23 | L5-L6 | Dashboard, alertes, unicité, migrations | tests + `db:check` |
| 2026-10-23 | L7 | Suite complète, build, base | 1257 / 3, build vert, schéma identique |
