# Rapport — Lot 0 du socle de la fiche OR

> Date : 2026-10-24.  
> Périmètre : fiche OR `/dashboard/ordres-reparation/[id]`.  
> Statut : **exécuté et vérifié**. Les onglets métier n’ont pas été refondus.

## 1. Objectif

Sortir la fiche OR de l’empilement « header + relation client + stepper + onglet + historique » et donner une lecture fiable de l’avancement réel, sans toucher au contenu métier des 7 onglets.

## 2. Changements livrés

### 2.1 En-tête compact

`OrHeader` ne contient plus :

- les trois tuiles Pièces / Main d’œuvre / Total TTC ;
- le dialogue de facturation ;
- les deux cartes de relation client ;
- l’historique.

Il contient :

- identité véhicule / client / OR ;
- statut, priorité, alerte, promesse, retard, emplacement, technicien ;
- plainte et raison de blocage ;
- total TTC et reste à facturer en une ligne ;
- boutons Journal, Relation client, Gérer, et raccourci Facturer ;
- les sélecteurs statut / priorité / technicien repliés dans « Gérer ».

### 2.2 Relation client en tiroir

`RelationClient` n’est plus affiché en permanence. L’en-tête affiche une alerte compacte si :

- la première réponse client n’est pas tracée ;
- une réclamation est ouverte.

Le détail s’ouvre dans un tiroir.

### 2.3 Journal unique

`Timeline` n’est plus sous chaque onglet. Un tiroir « Journal du dossier » propose :

- tous les événements ;
- filtres Statuts / Priorité / Technicien / Relation client ;
- le détail auteur / date / avant-après existant.

### 2.4 Stepper fondé sur les données réelles

`or-status-machine.ts` calcule désormais chaque étape à partir de ses données :

| Étape | Preuves utilisées |
|---|---|
| Réception | date de réception, données d’entrée, rapport de diagnostic |
| Diagnostic | rapport BROUILLON / SOUMIS / VALIDE, texte de diagnostic |
| Devis | versions de devis, `devisAccepte`, autorisations ligne par ligne |
| Pièces | demandes de pièces, lignes PIECE bloquées, quantités servies |
| Travaux | lignes autorisées, statuts, pointages |
| Qualité | derniers contrôles VALIDE / REJETE |
| Facture / Restitution | vente, total facturé, restitutions, clôture |

Corrections de logique :

- `BLOQUE` reprend l’étape du statut précédent dans l’historique ; la raison de blocage sert de repli. Il n’est plus rattaché à Pièces par défaut.
- `ANNULE` affiche « Cycle arrêté » sur l’étape atteinte, pas « toutes les étapes terminées ».
- `ferme_definitif` est traité comme une clôture, pas comme une progression automatique de toutes les étapes.
- Une étape sans donnée n’est pas marquée terminée.
- Les états disponibles sont : À faire / En cours / En attente / Terminé / Bloqué / Non applicable.

### 2.5 Prochaine action cliquable

`orNextAction` retourne maintenant :

```ts
{ label, tab, cta }
```

Le bandeau de prochaine action ouvre directement l’onglet concerné. Si l’action n’est pas accessible au profil, le bouton est remplacé par une mention explicite.

### 2.6 Vue par rôle

Focus par défaut :

- technicien : Diagnostic, Pièces, Travaux ;
- magasinier : Pièces ;
- comptable : Facture / Restitution ;
- secrétariat : Réception, Diagnostic, Devis, Facture / Restitution ;
- chef d’atelier, direction, consultation : tout.

Le bouton « Tout le dossier » révèle les onglets accessibles par permission. Les permissions serveur restent la seule autorité : la vue rôle ne donne aucun droit.

### 2.7 Une seule interface exposée

Le bandeau « Module en cours de refonte » et le lien « Vue complète (précédente) » sont supprimés.

L’ancienne route `?or=` reste techniquement accessible par URL directe, mais n’est plus exposée. Sa suppression physique attend l’audit de parité avec les 7 onglets.

### 2.8 Facturation déplacée

Le dialogue de facturation vit dans l’onglet Facture & Restitution (`shared/FacturerOR.tsx`). L’en-tête ne garde qu’un raccourci vers l’onglet.

### 2.9 Requêtes du layout dégonflées

`useOrQueries` ne charge plus :

- `catalog.list` (200 produits) ;
- `stock.listMouvementsParOR` ;
- `stock.listerCores` ;
- `or.listerPiecesClient`.

Ces données n’étaient lues par aucun composant du layout. Les onglets qui en ont besoin gardent leurs requêtes.

## 3. Fichiers modifiés / créés

- `.../_lib/or-status-machine.ts` — états réels, rôle, prochaine action.
- `.../_lib/or-status-machine.test.ts` — 22 tests.
- `.../_hooks/useOrStepper.ts` — branchement sur le snapshot complet.
- `.../_hooks/useOrQueries.ts` — requêtes utiles seulement.
- `.../[id]/_components/OrDetailLayout.tsx` — nouveau socle, tiroirs, rôle.
- `.../[id]/_components/OrHeader.tsx` — en-tête compact.
- `.../[id]/_components/OrStepper.tsx` — parcours réel et badges.
- `.../[id]/_components/RelationClient.tsx` — mode `embedded`.
- `.../[id]/_components/RelationClientDrawer.tsx` — tiroir relation client.
- `.../[id]/_components/shared/JournalPanel.tsx` — tiroir journal filtrable.
- `.../[id]/_components/shared/Timeline.tsx` — affichage sans carte redondante.
- `.../[id]/_components/shared/FacturerOR.tsx` — facturation dans l’onglet.
- `.../[id]/_components/tabs/FactureRestitutionTab.tsx` — accueil de l’action Facturer.

## 4. Vérifications

| Vérification | Résultat |
|---|---|
| Tests unitaires stepper | **22/22** |
| Suite complète | **1292 passés / 3 ignorés** |
| `next build` | **exit 0** |
| `tsc` | **0 erreur dans les fichiers du lot** (904 lignes de baseline) |
| ESLint fichiers modifiés | **0 problème** |
| `db:check` | **schéma identique**, 29 écarts de données tolérés |
| `graphify update .` | exécuté (9 225 nœuds) |

## 5. Limites connues

- L’ancienne fiche `?or=` est encore accessible par URL directe ; elle n’est plus liée depuis l’interface.
- Les tests de rendu dédiés au header et aux tiroirs restent à ajouter (Lot 8).
- Les 7 onglets gardent leur contenu actuel : la refonte interne commence au Lot 1 (Réception pilote), puis Diagnostic.
- La vue rôle est un focus d’interface, pas une nouvelle matrice de permissions.

## 6. Prochaine étape

**Lot 1 — Réception (onglet pilote)** : appliquer le standard « résumé → action principale → contenu → détails repliés », puis utiliser ce modèle pour Diagnostic et les onglets suivants.
