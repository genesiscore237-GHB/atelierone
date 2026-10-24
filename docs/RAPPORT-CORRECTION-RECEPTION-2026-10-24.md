# Rapport final — Correction de la réception véhicule

> Date : 2026-10-24.  
> Périmètre : réception d’un véhicule, de l’interface jusqu’à l’OR, au passage parking et aux contrôles serveur.  
> Documents liés : `AUDIT-RECEPTION-VEHICULE-2026-10-24.md`, `PLAN-CORRECTION-RECEPTION-2026-10-24.md`.

## 1. Résumé

La réception est désormais cohérente entre l’écran, le serveur et le registre parking :

- l’identité chargée ne peut plus être modifiée en silence ;
- les photos et notes d’un véhicule ne peuvent plus contaminer le suivant ;
- un véhicule possédé ne produit plus un dossier sans client ;
- un téléphone seul n’est plus perdu ;
- le kilométrage ne peut plus régresser ;
- la date, la promesse et le passage parking partagent la même référence ;
- les permissions, les doublons, les clients supprimés et les véhicules inactifs sont contrôlés ;
- la réception propose un brouillon, un panneau de succès et un lien direct vers l’OR.

## 2. Écarts constatés → corrections réellement apportées

| # | Écart constaté | Correction apportée | Preuve |
|---|---|---|---|
| P0-1 | Photos/outillage du véhicule A conservés sur B | Reset de `photosEtatDesLieu`, `outillageNotes`, erreurs et doublon dans `chargerVehicule`, `reinitialiserFormulaire` et après succès | `ReceptionVehicule.tsx` |
| P0-2 | « Nouveau véhicule » conservait l’ancien `vehicule.id` | Le mode création réinitialise tout le formulaire et les états annexes | `ReceptionVehicule.tsx` |
| P0-3 | Identités éditables mais ignorées par le serveur | Identité véhicule et client verrouillée quand une fiche existante est chargée ; contrôle de plaque côté serveur | `ReceptionVehicule.tsx`, `or-router.ts` |
| P0-4 | Véhicule possédé → OR sans client | Le propriétaire historique est adopté si aucun client n’est saisi | `or-router.ts`, test 8 |
| P0-5 | Téléphone seul → dossier sans client | Refus UI + serveur : nom requis dès qu’un téléphone est saisi | `validation-reception.ts`, `or-router.ts`, test 9 |
| P0-6 | Km inférieur écrasant la fiche | Refus serveur à la réception **et** à la modification de réception | `or-router.ts`, test 10 |
| P0-7 | Doublon client incohérent UI/serveur | Même filtre `deleted_at`/`ARCHIVE` côté recherche et contrôle serveur | `or-router.ts`, `clients-router.ts`, test 15 |
| P1-1 | Permission `or.creer` autorisait l’écran, pas le serveur | `canReception = or.modifier` ; formulaire, photos, outillage et submit désactivés sans permission ; bandeau explicite | `or-status-machine.ts`, `ReceptionVehicule.tsx` |
| P1-2 | Type « voiture » affiché mais non initialisé | `typeVehicule: "voiture"` dans l’état initial et après reset | `ReceptionVehicule.tsx` |
| P1-3 | Contrat de complétude incohérent | Km facultatif UI/serveur ; marque facultative à la réception ; type initialisé ; validation alignée | `validation-reception.ts`, `FormulaireVehicule.tsx` |
| P1-4 | Dossier ouvert annoncé « à confirmer » sans confirmation | Case « nouvelle intervention » + refus serveur sans `confirmerNouvelleIntervention` | `ReceptionVehicule.tsx`, `or-router.ts`, test 7 |
| P1-5 | Tout nouveau client créé `PART` | Type de client sélectionnable et raison sociale enregistrée | `ReceptionVehicule.tsx`, `or-router.ts`, test 13 |
| P1-6 | Motif et type d’intervention se recouvraient | Type limité à `ATELIER` / `DEPANNAGE` ; motif conserve son rôle ; libellés métier | `ReceptionVehicule.tsx` |
| P1-7 | Dépannage créait un passage parking | Aucun passage parking pour `DEPANNAGE` | `or-router.ts`, test 12 |
| P1-8 | Pas de sortie après succès | Panneau de succès avec OR, fiche véhicule et nouvelle réception | `ReceptionVehicule.tsx` |
| P1-9 | Aucun brouillon | Brouillon `sessionStorage` (formulaire + outillage, hors photos) avec restauration explicite | `ReceptionVehicule.tsx` |
| P1-10 | Recherche non normalisée, sans debounce/états | Debounce, normalisation plaque/téléphone, loading/erreur, exclusion inactifs/supprimés | `ReceptionVehicule.tsx`, `or-router.ts`, test 16 |
| P1-11 | Invalidations incomplètes | Ajout de `vehicules.listeCanonique`, `vehicules.get`, `garage.vehicles`, `garage.vehicule`, `or.getAlertes` | `invalidation-reception.ts` |
| P1-12 | Pas de mouvement parking `ENTREE` | Décision : la ligne `parking_vehicles` porte `date_entree` ; le journal des mouvements reste réservé aux sorties/déplacements | `parking-passage-service.ts` |
| P2 | Erreurs/doublon/états morts | Reset erreurs et doublon, suppression de l’état `resultats`, libellé client corrigé, signature clarifiée, avertissement photo | `ReceptionVehicule.tsx` |

## 3. Corrections prévues et réellement livrées

### Livré

- Reset complet de l’état de réception.
- Verrouillage des identités existantes.
- Propriétaire historique adopté.
- Téléphone sans nom refusé.
- Km facultatif mais jamais régressif.
- Date de réception unique pour OR et parking.
- Promesse de restitution contrôlée.
- Confirmation explicite d’une nouvelle intervention.
- Type de client et raison sociale.
- Dépannage sans passage parking.
- Permissions sincères.
- Photos séparées et avertissement si aucune photo.
- Brouillon local.
- Panneau de succès.
- Recherche normalisée/debouncée.
- Invalidations complètes.
- Tests d’intégration supplémentaires.

### Décisions assumées

- **Pas de mouvement `parking_movements` `ENTREE`** : la ligne de passage contient déjà `date_entree`, l’OR contient l’historique de réception, et le journal des mouvements reste dédié aux sorties/déplacements. Éviter un doublon de journal évite aussi de fragiliser la suppression de fixtures.
- **Photos recommandées, non bloquantes** : un appareil photo indisponible ne doit pas empêcher une réception ; un avertissement explicite est affiché.
- **Brouillon sans photos** : les photos base64 dépassent le quota navigateur ; elles ne sont pas restaurées et l’écran le dit.
- **Plusieurs OR possibles** : uniquement avec confirmation explicite, car un retour/reprise est un cas métier réel.

## 4. Fichiers principaux modifiés

- `apps/nextjs/src/app/(dashboard)/dashboard/atelier/reception/_components/ReceptionVehicule.tsx`
- `apps/nextjs/src/components/vehicule/FormulaireVehicule.tsx`
- `apps/nextjs/src/lib/validation-reception.ts`
- `apps/nextjs/src/lib/invalidation-reception.ts`
- `apps/nextjs/src/server/api/routers/or-router.ts`
- `apps/nextjs/src/server/api/routers/clients-router.ts`
- `apps/nextjs/src/server/lib/parking-passage-service.ts`
- `apps/nextjs/src/app/(dashboard)/dashboard/ordres-reparation/_lib/or-status-machine.ts`
- `apps/nextjs/src/server/api/routers/or-passage-parking.integration.test.ts`
- `apps/nextjs/src/lib/validation-reception.test.ts`

## 5. Vérifications

| Vérification | Résultat |
|---|---|
| Suite complète | **1270 passés, 3 ignorés** |
| Tests réception ciblés | 16 tests passage/réception + validation |
| `next build` | vert |
| `tsc --noEmit` | 305 erreurs baseline, aucune nouvelle dans les fichiers du lot |
| `pnpm db:check` | schéma identique, 29 divergences de données tolérées |
| Build client/serveur | frontière respectée, `next build` compris |

## 6. État du dépôt

Les corrections sont **présentes dans le working tree**, non commitées.  
Aucun commit ni push n’a été effectué pour ce lot de correction.
