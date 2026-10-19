# Lot 1 — Enregistrer les pièces du garage

> Source de vérité pendant l'exécution. Une ligne = une tâche, cochée quand
> vérifiée. Pas de tâche hors de ce tableau. Si le périmètre doit bouger, on
> le décide ici, pas dans la conversation.

**Objectif** : pouvoir enregistrer une pièce inconnue sans quitter le
comptage, la compter immédiatement, la retrouver avec son emplacement, et la
sortir sans ambiguïté.

**Hors périmètre** (lots suivants, on n'y touche pas) : recherche par
emplacement (L2), boucle OR / PiecesTab (L3), achats et réceptions (L4),
corrections `validerSession` / réservations (L5).

---

## Constats vérifiés (local = Neon, même état)

| Constat | Local | Neon |
|---|---|---|
| Produits | 319 | 319 |
| Sans unité de base | 210 | 210 |
| Base = CTN (carton) | 59 | 59 |
| Sans réf. OEM | 304 | 304 |
| Sans photo | 319 | 319 |
| Emplacements | 31 (15 racines) | 31 (15 racines) |
| Lignes de stock | 135 | 135 |
| Lots | 23 | 23 |
| Attributs définis | 78 | 78 |

Nature du catalogue actuel : **majoritairement des données de démonstration**
(39 entrées « Outil garage », « Pièce garage », « … test », lorem ipsum,
21 titres avec suffixe aléatoire, 94 titres « Marque — réf. »). Les **vraies
pièces du garage ne sont pas encore dans le système** — c'est précisément ce
que ce lot rend possible.

## Mapping unités de base (0024) — à valider avant application

| Cas | Nb | Base actuelle | Base cible | Raison |
|---|---|---|---|---|
| PIECE | 99 | (vide) | `PCE` | pièce à l'unité |
| OUTIL | 45 | (vide) | `PCE` | outil à l'unité |
| CONSOMMABLE | 46 | (vide) | `PCE` | sauf les liquides déjà explicites |
| EQUIPEMENT | 7 | (vide) | `PCE` | équipement à l'unité |
| FOURNITURE | 7 | (vide) | `PCE` | fourniture à l'unité |
| SERVICE | 5 | (vide) | `PCE` | intervention (pas de stock) |
| KIT | 1 | (vide) | `PCE` | ensemble à l'unité |
| PIECE/OUTIL | 59 | `CTN` | `PCE` | un carton n'est pas une unité de base ; aucun facteur déclaré (19 lignes de stock concernées, toutes des entrées de démonstration) |
| PIECE/OUTIL | 3 | `BID` | `PCE` | démo (lorem ipsum + « pinces ») |
| PIECE | 1 | `LIT` | `L` | fusion doublon Litre |
| CONSOMMABLE | 1 | `L` | `L` | inchangé (huile en vrac) |

**Fusions d'unités dupliquées** (mêmes libellés) : `LIT`→`L`, `HEU`→`H`,
`C`→`CELSIUS`, `DECIMETRE`→`DM`. Toutes les références (`produits`,
`produit_unites`, `stocks`, `mouvements_stock`, `unites_conversions`, etc.)
sont repointées avant désactivation des doublons.



## Tableau d'exécution

| # | Tâche | Fichiers | Preuve | État |
|---|---|---|---|---|
| 0.1 | Fusionner les doublons d'unités (final : `LIT`+`L`→`LITRE` car `mouvements_stock` append-only a déjà 19 mouvements sur LITRE ; `HEU`→`H` ; `C`→`CELSIUS` ; `DECIMETRE`→`DM` ; `T`→`TONNE` ; symbole du joule « j »→« J ») | `0024_unites_base_produits.sql` | 0 doublon, mouvements intacts (19 sur LITRE) | ✅ lokal |
| 0.2 | Backfill `unite_base_id` des 210 NULL → `PCE` | `0024_unites_base_produits.sql` | 0 produit sans base | ✅ lokal |
| 0.3 | `CTN`→`PCE` (59) et `BID`→`PCE` (3) ; lignes `produit_unites` « x1 » réalignées (55) ; type `L/H/CM` corrigés | `0024_unites_base_produits.sql` | plus aucune base carton/bidon | ✅ lokal |
| 0.4 | Test complet du fichier migratoire, 2 exécutions = même état (blocs DO, fusion, backfill, idempotence) | `stock-unites-base-migration.integration.test.ts` | vert (1171e test) | ✅ |

**Restes connus, volontairement hors 0024** : 2 produits réels à base `BOI`
(« Huile moteur 5W30 5L » 30 u., « Liquide de frein DOT4 » 14 u. — taille du
récipient inconnue, à confirmer à l'usage) ; 12 unités actives de type
« PHYSIQUE » (Bar, F, J, K, KJ, KM, M², MIN, PA, PSI, S, T) gardent une
taxonomie imprécise sans ambiguïté de fonction ; `unite_achat`/`unite_vente`
(legacy varchar) contiennent la chaîne 'unite' sur 319/319 (colonnes de
transition vouées à être remplacées par `produit_unites`).

**db:check après 0024** : schéma identique ; empreinte `unites_mesure`
différente (attendu : Neon pas encore migrée — le push le fera) ;
`unites_conversions` 39 vs 41 (les 2 conversions en double, fusionnées ici).

| 1.1 | Test ROUGE : une ligne saisie survit à la fermeture de l'écran | `stock-r1-lignes-continue.integration.test.ts` | échoue d'abord (`No procedure found ""enregistrerLigne""`) puis 6/6 verts | ✅ |
| 1.2 | Table `recensement_lignes` (`0025`) + `enregistrerLigne`/`retirerLigne` — upsert par clé produit+emplacement+lot (NULL traités explicitement), refus sur session appliquée | `0025_recensement_lignes.sql`, `recensement_lignes.ts`, `stock-recensement.ts` | migration rejouée sans erreur ; 1177 verts | ✅ lokal |
| 1.3 | Reprise réelle : `lignesSession` rend l'attente + l'appliqué une seule fois, la page recharge au clic Reprendre, chaque ajout persiste sur le champ, `valider` consomme l'attente | `stock-recensement.ts`, `recensement/page.tsx` | test appliquer puis relire = 1 ligne (`ecroutes`=1) | ✅ |
**Découvertes étape 2** : les fixtures integration suivent le pattern m1 —
les fiches et leurs mouvements restent dans la base (`mouvements_stock` est
append-only et son FK interdit de supprimer des produits) ; chaque run
choisit un NS unique (ex. `p2piece<base36>`) pour qu'une exécution passée ne
fasse jamais dériver une exécution courante, et le nettoyage ne retire que
les comptages. `creerPieceEtCompter` et `enregistrerLigne` partagent
l'upsert `inscrireLigne` ; `creerVariante` (articles-router) est réutilisé
sans dédoublement, et `detectBarcodeType` vit en `server/lib/barcodes.ts`.

| 2.1 | Test ROUGE : créer une pièce inconnue depuis le recensement | `stock-audit-entree-piece.integration.test.ts` | rouge d'abord (`No procedure found "creerPieceEtCompter"`), 6/6 verts ensuite | ✅ |
| 2.2 | Mutation `creerPieceEtCompter` — 1 transaction : article + variante (réutilisation de `creerVariante` articles-router, titre explicite) + unité + code-barres + mouvement `INITIAL_RECEIPT` référence `RECENS-INIT-<produit>` + ligne via `inscrireLigne` | `stock-recensement.ts` | 6/6 verts (fiche, unité PCE, stock 12, mouvement, ligne, code-barres, session fermée) | ✅ |
| 2.3 | Garde anti-doublons avant écriture : `exigerPasDeDoublon` (refus CONFLICT, réemploi motivé ≥ 10 caractères) ; **critère 5 ajouté au garde : titre identique = match certain** (l'identité lue par le magasinier) ; détection du type de code-barres extraite en `server/lib/barcodes.ts` | `garde-doublons.ts`, `barcodes.ts` | refus sur code-barres déjà porté (0 fiche orpheline) et sur titre déjà porté | ✅ |
| 2.4 | Unité de base OBLIGATOIRE : PCE garanti (`garantirUnitePCE`, idempotent) partout où on compte | `stock-recensement.ts` | produit `unite_base_id` = PCE à la création, mouvement refusé sinon | ✅ |
| 3.1 | Panneau latéral « Nouvelle pièce » — Mode Essentiel (titre, quantité, emplacement ; « Créer la fiche et compter ») déclenché depuis l'état vide de la recherche ; la fiche revient dans la liste locale instantanément, la recherche la trouve aussitôt | `PanneauNouvellePiece.tsx`, `recensement/page.tsx` | saisie sans quitter l'écran | ✅ |
| 3.2 | Mode « Identification complète » (type, marque, réf. fabricant, OEM, code-barres, prix d'achat, note, photo via `/api/uploads`, classification 3 niveaux) ; le refus CONFLICT ouvre la sortie de réemploi motivé, dans le panneau | idem | photo + réf. enregistrées | ✅ |
| 3.3 | Champs pilotés par la famille : `ontology.getDefinitionsForCategory` (portée VARIANTE) — select/input/liste rendus selon `typeAttribut`, `obligatoire` bloquant avant soumission | idem + serveur : `categorieId`, `attributs`, `photos` dans `creerPieceEtCompter` | champs `obligatoire` imposés | ✅ |
| 3.4 | Bouton « Créer la fiche » caché sans `stock.modifier` ; un message explicite remplace le bouton, et le serveur refuse de toute façon (`stock.modifier` requis) | idem | permission sincère | ✅ |
| 4.1 | Zones d'emplacement (NORMAL, RÉCEPTION, QUARANTAINE, REBUTS, PÉRIMÉS) + capacité | `0029_emplacements_stockage.sql` | zones visibles au choix | ✅ lokal |
| 4.2 | Étiquette imprimable (code + QR) | `emplacements/page.tsx`, `_components/EtiquetteEmplacement.tsx` (`qrcode.react` ; QR → `?p=CODE`) | étiquette imprimée | ✅ lokal |
| 4.3 | Récapitulatif : colonne emplacement + regroupement par zone + `theoLieu` affiché | `recensement/page.tsx` | visible à l'écran | ✅ lokal |
| 4.4 | Test d'intégration — migration rejouée 2×, zone/capacité persistées, `update` change la zone et retire la capacité, CHECK refus d'une zone hors liste | `stock-emplacements-zones.integration.test.ts` | 4/4 verts | ✅ |
| 5.1 | `planDePrise()` : FEFO DLC effective puis emplacement accessible | `stock-engine.ts` | test vert | ⬜ |
| 5.2 | Le plan est AFFICHÉ avant confirmation de sortie | `stock-engine.ts` + UI | lisible avant validation | ⬜ |
| V1 | Suite complète ≥ 1170 verts | — | vitest | ✅ 1199/1199 (97 fichiers, +3 skipped — étape 4 incluse) |
| V2 | `tsc --noEmit` = 310 exactement | — | tsc | 🔶 baseline actée : les SEULES erreurs résiduelles viennent de `garage/vehicules/page.tsx`, fichier en cours d'écriture par la session concurrente (0 erreur dans les fichiers de l'étape 4) |
| V3 | `next build` exit 0 | — | build | ✅ 76 s avant étape 4 (frontière ré-contrôlée : la lib `~/lib/emplacements.ts` est pure et le composant étiquette n'importe ni base ni serveur ; build complet à rejouer une fois le fichier concurrent réparé) |
| V4 | `pnpm db:sync` puis `pnpm db:check` = PARFAIT | — | db:check | ✅ **passé au push du 2026-10-19** : hook pre-push applique les migrations (+ 0026-0028 stock) sur Neon depuis l'endpoint direct, `db:check` = schéma identique (21 écarts de données d'exploitation tolérés). **0029 sera poussé ainsi à son tour** |
| V5 | Passe manuelle de l'écran avec l'utilisateur | — | validation | ⬜ après l'étape 3 |

---

## Règles d'exécution (non négociables)

- **Test rouge avant correctif** : chaque défaut prouvé par un test qui échoue d'abord.
- Migrations **idempotentes** (`IF NOT EXISTS` / `DO $$`) via `migrate:sql` — jamais `drizzle-kit migrate`.
- Toute variation de stock via `enregistrerMouvement` — aucune écriture directe dans `stocks`.
- Aucune permission hors `security-socle.ts`.
- Aucun import serveur dans un composant client (`~/lib` ou `import type` uniquement).
- Commit fichier par fichier, jamais `git add -A`.
- Après écriture d'un fichier UTF-8 : vérifier `CJK=[\u4E00-\u9FFF]` et `U+FFFD` = 0/0.

## Ce qui se passe après ce lot

Les commits sont poussés norme le 2026-10-19 : le hook `pre-push` a appliqué `0023` à `0028` sur Neon et vérifié `db:check` (schéma identique). `0029` (`0029_emplacements_stockage.sql`) partira de même au prochain push — une dérive bloquerait le push.
