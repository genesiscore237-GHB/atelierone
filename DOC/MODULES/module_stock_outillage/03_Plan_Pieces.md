# Plan de travail — Enregistrement des pièces automobiles

> Document de pilotage. Il répond à trois questions : **ce qui était à faire**,
> **ce qui est fait**, **ce qui reste**. Mis à jour au fil de l'exécution, comme
> le cadrage du module stock.
>
> Dernière mise à jour : 2026-10-18, après la vague de corrections TypeScript.

---

## 1. Ce qui était demandé, et ce que l'audit a trouvé

Le cahier des charges donnait l'impression de construire un module. **L'audit a
montré le contraire** : le module existait déjà à environ 70 %.

| Attendu | Constaté | Verdict |
|---|---|---|
| Créer le modèle pièce / variante | `produit_articles` → `produits`, 86 colonnes | existait |
| Détecter les doublons | 10 stratégies avec scoring | existait — **mais ne bloquait rien** |
| Aide à la saisie | score maison, Levenshtein, 18 tables | existait — **inaccessible depuis le formulaire** |
| Parcours guidé | wizard 8 étapes, mutation réelle | existait |
| Catégories et champs adaptatifs | EAV + 461 catégories automobiles | existait |
| Qualifier les références | **rien** | absent |
| Qualifier les compatibilités | **rien**, pas même un horodatage | absent |
| Occasion : état, défauts, provenance | **rien** | absent |
| Distinguer contenu confirmé / supposé | **rien** | absent |
| Offre fournisseur unique, avec devise | **rien** (contrainte absente) | absent |
| Vue téléphone | **rien** | absent |
| Upload soumis à permission | **non** | absent |

66 exigences évaluées : **31 conformes · 9 partielles · 7 absentes · 2 non vérifiables**.

---

## 2. Ce qui a été fait

### Lot A — Le garde anti-doublons

| # | Tâche | Statut | Preuve |
|---|---|---|---|
| A1 | `garde-doublons.ts` : correspondance certaine vs probable | ✅ fait | `server/lib/garde-doublons.ts` |
| A2 | Branchement sur `createArticle`, avant l'insert | ✅ fait | `articles-router.ts` |
| A3 | Branchement sur `addVariante` (la porte de service) | ✅ fait | idem |
| A4 | Réemploi exigé **avec motif** de 10 caractères | ✅ fait | idem |
| A5 | Tests du garde | ✅ 5 tests verts | `articles-m7-pieces.integration.test.ts` |

### Lot B — La qualification de la donnée

| # | Tâche | Statut | Preuve |
|---|---|---|---|
| B1 | Migration `0023` idempotente | ✅ appliquée local + test | `drizzle/0023_*.sql` |
| B2 | Source + niveau sur les références | ✅ | `produit_references` |
| B3 | Idem sur les références **équivalentes** | ✅ | `produit_references_equiv` |
| B4 | Source + niveau + **horodatage** sur les compatibilités | ✅ | `compatibilites_produits` |
| B5 | Champs occasion (6) | ✅ | `produits` |
| B6 | Unicité réelle des offres fournisseur | ✅ | `UNIQUE (produit_id, fournisseur_id, reference_fournisseur)` |
| B7 | Devise + minimum de commande | ✅ | `produits_fournisseurs` |
| B8 | Contenu de conditionnement confirmé / non | ✅ | `contenu_confirme`, défaut `false` |

### Lot C — L'interface

| # | Tâche | Statut |
|---|---|---|
| C1 | Réemploi : motif obligatoire dans le wizard | ✅ |
| C2 | Qualification des compatibilités, saisie + badge affiché | ✅ |
| C3 | Qualification des références équivalentes, saisie + badge | ✅ |
| C4 | Case « contenu vérifié » sur le conditionnement | ✅ |
| C5 | Accès à l'aide à la saisie depuis le formulaire | ✅ |
| C6 | Permission `stock.modifier` sur `/api/uploads` | ✅ |
| C7 | Champs occasion dans le formulaire | ❌ **non fait** |

### Lot D — Les erreurs

| # | Tâche | Statut |
|---|---|---|
| D1 | 24 erreurs TypeScript de `stock.ts` | ✅ **0 restante** |
| D2 | Un vrai bug trouvé au passage : `totalQte += m.quantite` concaténait des chaînes (`0 + "150"` = `"0150"`) | ✅ |
| D3 | Un vrai bug : `documentLie` inexistant sur `sortirPourOR` — le lien véhicule était perdu **sans erreur** | ✅ |
| D4 | 286 erreurs restantes, hors périmètre | ❌ **non fait** |

### Lot E — Photos et documents (demande explicite du 2026-10-18)

| # | Tâche | Statut | Preuve |
|---|---|---|---|
| E1 | **Le service des fichiers n'existait pas.** `POST /api/uploads` écrivait sur le disque ; rien ne relisait. En production c'est nginx (`deploy/nginx-atelierone.conf:16-21`), en développement **aucun serveur** — une photo téléversée s'affichait cassée. Un fichier réel traînait dans `uploads/articles/` sans être atteignable. | ✅ | `src/app/uploads/[...path]/route.ts` |
| E2 | Traversée de dossier refusée, extensions non autorisées refusées | ✅ **4 tests** | `route.test.ts` |
| E3 | Fiche article — **téléverser une photo** au lieu de coller une URL (l'upload n'existait que dans le wizard) | ✅ | `article/[id]/page.tsx` |
| E4 | Fiche article — documents : **téléversement réel**, plus seulement « URL du document » | ✅ | idem |
| E5 | Vignettes des photos dans la liste des documents | ✅ | idem |
| E6 | Photo : reste dans le formulaire jusqu'à « Enregistrer » (validation explicite) | ✅ | idem |

### Lot F — Les manquements de logique

| # | Tâche | Statut |
|---|---|---|
| F1 | **R1 — conversion inventée.** `getFacteurVersBase` rendait `1` quand aucun facteur n'était connu : sortir 1 bidon sur un produit dont l'unité de base est le litre ne déduisait qu'1 litre, sans erreur ni trace. | ✅ **refusé explicitement** depuis, avec le nom de l'unité dans le message (`stock-engine.ts`) |
| F2 | **R4 — les 6 colonnes occasion** (`occasion_etat_constate`, `defauts`, `provenance`, `vehicule_id`, `kilometrage`, `garantie_mois`) étaient créées par la migration 0023 et lues par **aucune ligne de code**. | ✅ branchées : `addVariante`, `updateVariante`, `getVariante`, et affichées dans le formulaire quand l'état n'est pas « Neuf » |

---

## 3. Ce qui reste à faire

### 3.1 Bloquant — le module n'est pas cohérent sans

| # | Tâche | Pourquoi c'est bloquant |
|---|---|---|
| **R2** | **Le garde en base** | Une règle qui n'existe que dans un fichier TypeScript disparaît au prochain développeur qui ne le lit pas. Trigger sur `produits.reference_principale`. |
| **R3** | **Vue mobile du catalogue** | Tableau à 8 colonnes en défilement horizontal ; la colonne « Désignation » est hors écran sur téléphone. Le cahier des charges exige téléphone **et** ordinateur. |

### 3.2 Fonctionnel

| # | Tâche | Taille |
|---|---|---|
| R4 | ~~Champs occasion dans le wizard (C7)~~ — **fait** (Lot F2) | ✅ |
| R5 | ~~Afficher la qualification sur la **fiche**~~ — **fait** : badges sur les compatibilités et les références équivalentes, et la fiche peut désormais *poser* le niveau (elle ne le pouvait pas — tout ce qui était ajouté depuis la fiche retombait sur « non vérifié » sans recours) | ✅ |
| R6 | ~~Galerie de photos — l'onglet Documents exigeait une URL collée~~ — **fait** (Lot E) | ✅ |
| R7 | ~~Upload dans l'onglet Documents~~ — **fait** (Lot E) | ✅ |
| R8 | Bouton « réutiliser cette fiche » quand un doublon est détecté | M |
| R9 | `addVariante` : exposer aussi `accepterDoublon` / `motifReemploi` dans son formulaire | S |

### 3.3 Qualité — hors module, mais réel

| # | Tâche | Taille |
|---|---|---|
| R10 | **286 erreurs TypeScript** restantes (105 dans `src/app`, 53 `catalog.ts`, 31 `procurement.ts`…) | L |
| R11 | `ignoreBuildErrors: true` — à retirer après R10 | S |
| R12 | 11 fichiers écrivant `stocks` en direct, contre la règle du cadrage §6.2 | L |
| R13 | Test instable `or-o1-outillage-catalogue` — **cause non isolée** | M |

---

## 4. Tests : demandés / faits

| Scénario | Statut |
|---|---|
| Doublon exact refusé | ✅ testé |
| Deux pièces proches restent distinctes | ✅ testé |
| Réemploi avec / sans motif | ✅ testé |
| `addVariante` gardé | ✅ testé |
| Sans référence, jamais bloqué | ✅ testé |
| Neuf / occasion distincts | ✅ testé |
| Fiche créée sans toucher le stock | ✅ testé |
| Compatibilité non vérifiée signalée | ✅ testé |
| Contenu de conditionnement non confirmé | ✅ testé |
| Offre fournisseur unique / multiples | ✅ testé |
| Permission d'écriture | ✅ testé |
| Qualification saisie → conservée | ✅ testé |
| **Réception modifiant le stock exactement une fois** | ❌ non exécuté (moteur couvert par M0/M3) |
| **Refus d'une conversion invalide** | ❌ non exécuté (dépend de R1) |
| **Conditionnement confirmé → conversion** | ❌ non exécuté (dépend de R1) |
| **Champs conditionnels par catégorie** | ❌ non exécuté |
| **Prévention des doubles soumissions** | ❌ non exécuté (le moteur n'a aucune idempotence) |
| **Vue téléphone / bureau** | ❌ non exécuté (pas de rendu React en test) |
| **Service des fichiers : servi / traversée refusée / extension refusée / 404** | ✅ **4 tests** |
| **Conversion inconnue refusée par le moteur** (F1) | ✅ via la suite : 1170 verts, aucune régression |
| Non-régression globale | ✅ suite complète, 1170 verts (+3 ignorés) |

---

## 5. Le test instable — ce que j'ai fait et ce que je n'ai pas fait

`or-o1-outillage-catalogue` test 11 a échoué une fois sur deux exécutions
complètes.

**Ce que j'ai vérifié :**

- Il passe **isolé**, systématiquement.
- Le fichier n'importe que `orRouter`, `drizzle-orm` et `db` — **aucun** des
  fichiers que j'ai modifiés n'est dans son chemin.
- Son `beforeEach` remet `atelier_parametres.outillage_catalogue` à `NULL`, et
  son `afterAll` supprime les OR, véhicules et clients qu'il a créés : le fichier
  **est** correctement isolé.
- L'assertion porte sur un libellé lu depuis un **catalogue partagé**.

**Ce que je n'ai pas fait :** je n'ai **pas** trouvé la cause exacte. Répéter
l'exécution jusqu'à obtenir deux verts serait l'erreur que le document de
branchement met en garde. **La cause reste ouverte (R13).**

**Second cas, même famille** — le 2026-10-18, en suite complète :
`vehicules-u0a-regle-unique.integration.test.ts`, test « PARITÉ — les 3
endpoints réconcilient la même plaque ». Il **passe isolément** (9/9, vérifié),
et il **passait** dans la suite complète une heure plus tôt. Il n'importe
aucun des fichiers modifiés par ce chantier. La base de test est partagée et
les fichiers s'exécutent en parallèle : la cause la plus probable est
l'entrelacement des données entre fichiers, pas le code testé. Non tranché —
à traiter comme un défaut d'infrastructure de test, pas comme un détail.

---

## 6. Une anomalie de mesure à connaître

Pendant la correction des erreurs, `tsc` ne remontait que **5** erreurs — et le
compte « 324 » était lui aussi faux. Raison : le fichier
`reimport-parking-par-reception.integration.test.ts`, **modifié et non commité
par l'autre agent**, contient un `catch` sans `try`. Une erreur de parse fait
taire l'analyseur sémantique sur **tout le projet**.

Le compte fiable, obtenu avec une configuration temporaire excluant ce seul
fichier : **310 erreurs**, dont **0 sur les fichiers de ce chantier**.

> Tant que ce fichier est cassé, **tout comptage `tsc` du dépôt est
> ininterprétable**. Il faut l'exclure explicitement pour obtenir un chiffre
> vrai.

---

## 7. État de la publication

| Lot | Commit | Poussé |
|---|---|---|
| M0→M5 stock | `7d886f2` | ✅ |
| Pièces — garde + qualification + interface | `4979532`, `58c21bb` | ❌ |
| Pièces — corrections TypeScript `stock.ts` | `d16482c` | ❌ |
| Pièces — photos + documents + logique (Lots E, F) | *ce commit* | ❌ |

Le push des lots pièces appliquerait `0023` en production, ce qui pose une
**contrainte d'unicité** après dédoublonnage. Écriture en production : décision
laissée à la main.