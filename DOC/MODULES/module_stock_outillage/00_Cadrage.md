# Cadrage — Module Stock, Approvisionnement & Outillage

> Source de vérité du chantier. Mis à jour à chaque jalon.
> Ne pas décider en conversation ce qui n'est pas écrit ici.
>
> **Ne pas relire et réécrire ce fichier via `Get-Content -Raw` / `Set-Content`
> côté PowerShell** : PowerShell lit l'UTF-8 comme de l'ANSI et le renvoie
> ré-encodé. Chaque accent devient alors une suite de deux caractères illisibles,
> et le fichier s'ouvre très bien dans un éditeur — l'illusion est totale.
>
> Passé par là une fois : le document a été réécrit intégralement. Utiliser
> `[System.IO.File]::ReadAllText` / `WriteAllText` avec un `UTF8Encoding($false)`,
> qui préserve l'encodage.

---

## 1. Le besoin, en une phrase

> **Enregistrer ce que le garage achète et ce qu'il possède déjà, à sa place.**

Sept besoins, dans l'ordre de douleur réelle :

| # | Besoin | Contraint |
|---|---|---|
| 1 | Enregistrer les pièces achetées pour la maintenance | réception simple |
| 2 | Enregistrer les outils de travail | un outil = un article + quantité |
| 3 | **Huile achetée en fût, déconditionnée en litre, traçabilité impeccable** | fût = lot scellé, ouverture, DLC des bidons |
| 4 | Simplicité et intelligence dans l'enregistrement | pas de doublon, pas de 20 champs |
| 5 | **Recenser les centaines de pièces déjà présentes** | grille rapide, une ligne = 3 gestes |
| 6 | 5 magasins, pièces éparpillées jusque dans les bureaux | arborescence, déplacement possible |
| 7 | Changer l'emplacement d'une pièce | transfert |

**Hors périmètre au MVP** : prêts d'outils avec étalonnage, réappro automatique,
rapprochement sortie/consommation/facturation, classification ABC. Ces chantiers
reviendront **sur un socle juste**, jamais avant.

---

## 2. État vérifié de la base (relevé réel, non déclaratif)

Base locale `atelierone_erp`, interrogée le 2026-10-17.

### Ce qui est déjà bon

- **319 articles** au catalogue : PIECE 166 · OUTIL 78 · CONSOMMABLE 51 · KIT 1 · EQUIPEMENT 7 · FOURNITURE 7 · SERVICE 9
- **195 codes-barres** posés sur 319 articles (61 %) — le scan a donc de la matière dès le premier jour
- **31 emplacements** déjà hiérarchisés (16 sous-emplacements), types `ZONE` · `RAYON` · `BAC` · `CASIER` · `ATELIER` · `BUREAU`
- **23 lots**, dont 15 avec date de péremption
- 15 fournisseurs · 55 unités de mesure · 2 agences

### Ce qui ne va pas, chiffres à l'appui

| Constat | Chiffre | Conséquence |
|---|---|---|
| Lignes de stock **sans coût unitaire moyen** | **106 / 135** | le KPI « Valeur du stock » est calculé sur 29 lignes seulement — le chiffre affiché est faux |
| Lignes de stock **sans ligne dans `stocks_lots`** | **118** | aucun invariant : la traçabilité par lot peut diverger silencieusement |
| Lignes de stock **sans ligne dans `stocks_unites`** | **112** | idem sur les unités de mesure |
| Produits ayant **plusieurs lignes de stock** | **7** | ce sont exactement les cas où les lectures `.limit(1)` prennent une ligne au hasard |
| Lignes avec `quantite_reservee > 0` | 2 | réservations probablement bloquées à jamais |
| Lignes avec `quantite_bloquee > 0` | 1 | la colonne existe et n'est **jamais lue** par le calcul de disponibilité |
| Articles avec `dlc_jours` renseigné | **5 / 319** | la DLC huile n'est exploitable sur presque rien |
| Articles OUTIL avec `typeOutil` renseigné | **27 / 78** | le reste est des outils sans typage |
| **`achats` et `achats_lignes`** | **0 / 0** | le module approvisionnement n'a **jamais** été utilisé |
| Mouvements `DECONDITIONNEMENT_*` | 38 (19 paires) | le déconditionnement a été exercé **sans jamais transporter de lot** |
| `bon_s_reception` | **table absente de la base** | le code la référence : `verify:conformity` le signalera |

**Conclusion** : le catalogue est exploitable, l'outillage est déjà catalogué, mais
**le stock n'a jamais été réellement utilisé**. Les 133 lignes existantes sont un
héritage de tests, pas un peuplement.

### Décision à trancher avant le recensement

Ces 133 lignes sont du **stock fantôme**. Deux options, à confirmer :

- **A — Purger** les 133 lignes et repartir de zéro (le module n'a jamais servi) ;
- **B — Réconcilier** : le recensement de M1 se présente en correction du stock existant.

En attendant, M1 est conçu pour être **idempotent et non destructif** : il affiche le
stock actuel à côté de la quantité saisie et signale les écarts au lieu de les écraser.
C'est compatible avec A et avec B.

---

## 3. Les trois pièges qui ont produit cet état

### 3.1 La garde de disponibilité tire au sort

```ts
// stock-engine.ts:100 — verifierStockDisponible
const [row] = await tx.select(…).from(stocks).where(where).for("update");
```

Pas de `.limit(1)` : la requête renvoyait **toutes** les lignes du produit,
verrouillées, et `[row]` prenait **la première dans un ordre que PostgreSQL ne
garantit pas**. C'était la garde de TOUTES les sorties et de TOUTES les réservations.
Le même motif existait en quinze endroits, dont `compterProduit` et `validerSession`
— ce dernier calcule donc la **quantité théorique d'un écart d'inventaire** sur une
ligne arbitraire.

**Règle** : toute lecture de quantité passe par la vue `stock_agregat`.

### 3.2 Trois tables de quantité, aucun invariant

`stocks` (par emplacement × lot) · `stocks_lots` (par lot) · `stocks_unites` (par unité).
Rien ne garantit leur cohérence. Le relevé le prouve : 118 et 112 lignes sans corollaire.

**Règle** : les triggers de la migration `0016` sont **autoritatifs** — ils *recalculent*
`stocks_unites` et `stocks_lots` depuis `stocks` et les tables de référence, ils
*n'incrémentent jamais*. Un réécriture complète est idempotente par construction.

> **Reporté.** Le trigger n'est pas installé : la donnée existante ne peut pas être
> réconciliée (voir §3.2 du rapport — `unite_base_id` est NULL sur 210 produits sur 319,
> `est_unite_base` vaut `true` sur deux unités d'un même produit). Poser l'invariant sur
> une base incohérente figerait l'erreur. L'incohérence est donc **traitée explicitement
> là où elle se produit** — c'est ce que fait `deconditionnerContenant` sur `stocks_lots`.

### 3.3 Le CMUP est calculé à trois endroits, avec deux formules

`stock-engine.enregistrerMouvement` · `procurement.receivePurchaseOrder` ·
`procurement.createReception` — la troisième ne sert nulle part (`stock-calculs.calculerPmp`
est importé par personne).

Deux portes d'entrée distinctes vers le même stock : `receivePurchaseOrder` **ne crée
aucun lot**, `createReception` si. Selon par où passe une réception, la traçabilité
existe ou non.

**Règle** : un seul calcul de CMUP, une seule porte d'entrée de réception qui crée un lot.

---

## 4. Le modèle cible — huile en fût

```
1. RÉCEPTION      fût 208 L  → lot L1, statut scellé, date de fabrication
                                   quantité 208 L (unité de base)
2. OUVERTURE      date_ouverture = J, périodicité = produits.dlc_jours
                                  référence = « Castrol — notice constructeur »
3. DÉCONDITIONN.  1 fût → 208 bidons 1 L  →  lot cible L2
                                             lot_source_id = L1
                                             date_ouverture = J
                                             date_peremption = J + périodicité
4. CONSOMMATION   FEFO sur la DLC EFFECTIVE : L2 d'abord (le plus ancien ouvert),
                  puis le fût encore scellé
```

Un second fût reçu en juin mais ouvert en juin 2027 porte une DLC plus tardive : il sera
donc consommé **après** le premier. La règle découle de la date d'ouverture, pas d'un ordre
arbitraire.

**Granularité** : un lot de bidons **groupés**, pas un lot par flacon. 208 lots pour un
fût serait inapplicable au comptage manuel.

---

## 5. Phases

| Lot | Contenu | Besoin |
|---|---|---|
| **M0** | Fiabilité : vue agrégée, garde de disponibilité, réservations, CMUP unique, quarantaine, lots | socle |
| **M1** | Recensement : flux rapide, onglet lots, arborescence d'emplacements, garde-fou anti-doublon | 5 · 6 · 4 |
| **M2** | Huile : fut scellé → ouverture → lot de bidons → FEFO | 3 |
| M4 | Outillage comme articles | 2 |
| M5 | Transfert rendu visible en navigation | 7 |

Chaque lot est livrable et utilisable dans le garage.

---

## 6. Règles non négociables

1. **Une opération métier = un effet net sur le stock**, même si elle touche plusieurs tables.
2. **Aucune quantité n'est écrite directement.** Tout passe par `enregistrerMouvement`.
3. **Aucune lecture de quantité sans la clé complète.** La vue `stock_agregat` est le seul point d'entrée.
4. **Une migration SQL est idempotente** (`IF NOT EXISTS`, `DROP … IF EXISTS`, `DO $$`).
   Jamais `drizzle-kit migrate` — toujours `migrate:sql`.
5. **Toute nouvelle permission se définit dans `security-socle.ts`**, jamais dans un script de migration.
6. **Le scan améliore, il n'est jamais requis.** Le champ texte est toujours actif en parallèle.
7. **Un stock « disponible » exclut** périmé, bloqué, consommé et réservé.
8. Une perte n'est jamais un ajustement invisible : qui déclare, qui examine, qui valide.

---

## 7. Vérification avant chaque jalon

```bash
pnpm --filter @atelierone/nextjs exec vitest run
pnpm --filter @atelierone/nextjs exec tsc --noEmit -p tsconfig.json
cd apps/nextjs && pnpm exec next build
pnpm db:check
```

`db:check` doit renvoyer `PARFAIT` ou ne signaler que des écarts de données
d'exploitation attendus (`audit_logs` diffère toujours).

---

## 8. Journal des jalons

| Date | Jalon | État |
|---|---|---|
| 2026-10-17 | Cadrage écrit, base interrogée, diagnostic chiffré | ✅ |
| 2026-10-17 | **M0 — fiabilité** | ✅ 5 migrations, 4 correctifs moteur, 10 tests |
| 2026-10-17 | **M1 — recensement** | ✅ 1 migration, 1 router, 3 écrans, 11 tests |
| 2026-10-17 | **M2 — huile (contenants)** | ✅ 1 migration, 1 service, 1 écran, 10 tests |
| 2026-10-17 | **M3 — réception** | ✅ recherche partagée, `createReception` réparée, 1 écran, 9 tests |

---

## 9. M0 — fiabilité

### Migrations `0015` → `0019`

| Fichier | Objet |
|---|---|
| `0015_parametres_stock` | Réglages par agence : fenêtre de consommation, délai fournisseur de repli, couverture de sécurité, DLC, dormance, méthode de valorisation, seuils par défaut, scan |
| `0016_stock_agregat` | **Vue de lecture unique.** `disponible = quantité − réservée − bloquée`, CMUP pondéré, `nb_lignes` / `nb_lignes_cout` / `nb_emplacements` / `nb_lots` comme signaux |
| `0017_stock_quarantaine` | Motif, date et auteur du blocage, sur `stocks` **et** sur `lots` |
| `0018_lots_contenants_ouverture` | Ouverture d'un contenant + vue `lots_contenants` |
| `0019_lots_statut_vocabulaire` | Normalisation `ACTIF` / `disponible` / `perime`, contrainte de vocabulaire |

Idempotentes : rejeuées deux fois, elles ne produisent que des `NOTICE`.

### Correctifs moteur — `stock-engine.ts`

1. **La garde de disponibilité ne tire plus au sort** — ordre explicite `quantite DESC, id ASC`.
2. **La quarantaine est déduite du disponible.** Mesuré sur le produit 955 : 10 en stock,
   2 réservées, 1 bloquée → l'ancien calcul annonçait **8**, la règle correcte donne **7**.
3. **La sortie consomme la réservation.** `sortirPourOR` décrémente `quantite_reservee`.
   Avant, la quantité restait juste et seule la disponibilité se dégradait, sans fin.
4. **Un produit sans unité de base ne casse plus toute sortie.** `uniteBaseId()` renvoyait
   `""` dans une colonne `uuid` — **210 produits sur 319** concernés.

### Tests

`stock-m0-quantites.integration.test.ts` — 10 tests, rejouables.

---

## 10. M1 — recensement

### Migration `0020_inventaires_localisation`

`inventaires.emplacement_id` et `inventaires.lot_id`, plus deux index.

`inventaires` ne portait que produit / théorique / réelle. C'est cohérent pour un inventaire
général (« combien de filtres ? ») et incompatible avec le besoin du garage, qui est spatial :
« 12 dans le magasin, 3 dans le bureau du chef ».

### Le service `stock-recensement`

Cinq entrées, sur les permissions existantes (`stock.consulter`, `stock.inventaire`) :
aucune nouvelle permission, donc rien à ajouter au socle de sécurité.

| Endpoint | Rôle |
|---|---|
| `rechercher` | recherche tolérante + garde-fou anti-doublon |
| `preparerLigne` | stock déjà connu, réparti par emplacement, lots, unités |
| `previsualiser` | théorique de lieu et total, écarts — **n'écrit rien** |
| `ouvrirSession` / `sessions` / `lignesSession` | reprendre un recensement laissé en cours |
| `valider` | écrit, trace, **refuse de se rejouer** |

Trois décisions :

1. **Constater ≠ ajuster.** `mode: "constater"` enregistre l'observation sans toucher au
   stock — premier soir : on relève, on regarde les écarts, on applique le lendemain.
2. **Deux écarts, jamais confondus.** L'écart au LIEU et l'écart au TOTAL.
3. **Aucun coût inventé.** Un recensement physique ne connaît pas le prix d'achat.

### La recherche est tolérante, pas exacte

`ILIKE '%Filtre a huile 15W40%'` ne trouve pas « Filtre huile 15W40 Castrol » : le « a » du
génitif casse le mot. La saisie est décomposée en mots significatifs (les mots vides français
sont écartés), les résultats classés par nombre de mots partagés. Les articles au libellé
proche sont **signalés, jamais fusionnés**.

### Les écrans

- `/dashboard/stock/recensement` — le geste en trois mouvements :
  `[ recherche/scan ] [ qté ] [ emplacement ] → Ajouter`. Le stock déjà connu s'affiche avant
  la saisie.
- `components/stock/BarcodeScanner.tsx` — `BarcodeDetector`. Le champ texte reste actif en
  permanence ; l'état d'autorisation vient de `useCameraPermission`.
- `/dashboard/stock/emplacements` — arborescence, recherche filtrée en conservant le chemin.

### Deux défauts corrigés au passage

**Profondeur d'emplacement écrasée.** `profondeur: input.parentId ? 1 : 0` donnait 1 à tout
enfant. Et l'interface n'envoyait pas `parentId` — on ne pouvait créer que des racines,
alors que 16 sous-emplacements existaient déjà.

**Auto-référence de schéma.** `lots.lotSourceId` se référence à `lots`. Écrit `(): any`, le
type de la table dépend d'elle-même et l'inférence se dégrade **partout** où `lots` est
importé : 27 erreurs en plus, dans la caisse, la finance, le catalogue, l'approvisionnement.
`AnyPgColumn` a rendu les 970 erreurs préexistantes sans en ajouter une seule.

### Code mort supprimé

`lib/inventory-service.ts` et `lib/transfer-service.ts` — squelettes creux important des
tables qui n'existent pas dans ce schéma, jamais importés. `stock/_components/StockNav.tsx`
— 12 onglants dont aucun n'était atteignable.

`routers/inventory.ts` est **conservé** : deux pages l'utilisent. Il est toutefois
contradictoire — son écart est de signe inversé — et sa migration reste à faire.

---

## 11. M2 — l'huile en fût

### Migration `0021_deconditionnement_produit_cible`

`deconditionnements.produit_cible_id` et `deconditionnements.facteur_conversion`.

Un fût et un bidon de 4 L ne sont pas le même article. `operationDouble` acceptait déjà un
`produitCibleId`, mais la table ne le pouvait pas : impossible d'écrire « ce fût de produit A
a produit ces bidons de produit B ». Le facteur est **figé** à l'opération — un historique de
déconditionnement qui se recalcule avec les tables d'unités n'est plus une trace.

### Le service `contenants-service.ts`

`ouvrirContenant` est **idempotent** : rouvrir un fût ne décale pas sa date. Un second clic
accorderait plusieurs mois de conservation à une simple maladresse.

Aucune périodicité n'est imposée : l'expert métier est explicite, elle dépend de la notice,
du constructeur et de l'usage. On saisit ce que le garage sait et on enregistre **d'où ça
vient** (`reference_ouverture`).

`deconditionnerContenant` produit **un lot cible** portant `lot_source_id`, la date
d'ouverture et sa propre DLC. Un lot par flacon serait inapplicable.

### Le FEFO consume la DLC effective, pas la DLC du scellé

`sortirStockFIFO` ordonnait sur `lots.date_peremption`. Pour un contenant ouvert, c'est faux :
un fût daté à 5 ans ferait passer les bidons (qui ne tiennent que 12 mois) **en dernier**.
Le garage servirait d'abord l'huile qui s'oxyde le moins, et jetterait celle qu'il a ouverte.

L'ordre est maintenant `ouverture + périodicité`, repli sur la DLC fournisseur.
`verifierDispoNonPerimee` reçoit la même formule.

**Le FEFO classe, il ne filtre pas.** La protection reste le garde-fou appelé avant les
sorties. Filtrer dans le FEFO obligerait à charger tous les lots pour écarter les périmés,
ce qui défait son verrou ligne à ligne.

### Trois défauts rencontrés en écrivant ce flux

1. **`enregistrerMouvement` attend des quantités en unité de base.** Un fût n'est pas un
   litre : sans conversion, sortir un fût débiterait 1 L au lieu de 208 — et le stock se
   viderait 208 fois trop vite, sans qu'aucun contrôle ne le remarque.
2. **`lotId` faisait deux choses à la fois** : choisir la ligne de stock ET tracer le lot.
   Or `stocks.lot_id` est systématiquement NULL (le détail vit dans `stocks_lots`), donc le
   filtre ne trouvait rien et l'écriture était refusée à tort. Séparé en `lotId` (cible) et
   `lotPourTracabilite` (trace).
3. **`stocks_lots` n'était pas décrémenté** par le déconditionnement — le fût continuait de
   réclamer son contenu au registre, et le FEFO repartait sur un fût déjà vidé.

### L'écran `/dashboard/stock/contenants`

Deux questions, et rien d'autre : « quel fût j'ouvre ? » et « il en reste combien, et
jusqu'à quand ? ».

Le facteur **n'est jamais demandé** : il est calculé depuis les tables d'unités et affiché
avant validation. Un contenu que l'utilisateur vérifie d'un coup d'œil ne se saisit pas.

---

## 12. État de vérification

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | **970 erreurs — exactement la référence d'avant chantier**, zéro sur les fichiers du chantier |
| `vitest run` | **1120 tests, 86 fichiers, 0 échec** |
| `next build` | passe · `/dashboard/stock/recensement` et `/dashboard/stock/contenants` produits · aucune violation de frontière client/serveur |
| `eslint` sur les fichiers du chantier | 0 erreur, 0 avertissement |
| `db:check` | **79 objets en dérive** (73 après M0) — l'attendu tant que les migrations ne sont pas appliquées sur Neon |
| migrations | `0015` → `0021` appliquées sur `atelierone_erp` **et** `atelierone_erp_test`, rejouées sans effet |

## 13. Dérive production

`pnpm db:check` signale des objets de schéma présents en local et absents de la production :
les tables, colonnes, contraintes et index des migrations M0 → M2. C'est l'état attendu tant
que les migrations ne sont pas appliquées sur Neon. **La porte est fermée — c'est son rôle.**
---

## 14. M3 — réception

### Un seul moteur, deux portes

`procurement.createReception` est un bon moteur : bon de réception, lots, écarts avec motif,
conversion d'unité, prix catalogue, cumul de dette. Il est aussi LOURD — il exige une quantité
commandée par ligne, un prix, et refuse toute réception partielle sans motif. Rien de tout cela
ne s'applique à un achat au comptoir, où personne n'a commandé.

`stock-reception.ts` ne réécrit donc pas un moteur : il construit la même charge utile et la
passe à `createReception`. `quantiteCommandee = quantiteRecue` — il n'y a pas d'écart à
justifier puisqu'il n'y a pas de commande. C'est ce point qui rend la réception rapide possible
sans mentir sur le bon de réception.

### La recherche est désormais PARTAGÉE

Le service `recherche-articles.ts` porte la recherche tolérante et le garde-fou anti-doublon,
utilisés par le recensement (M1) ET la réception (M3). Dupliquer ce code aurait produit deux
listes de mots vides et deux scores de similarité qui divergent au premier correctif — exactement
la maladie que ce chantier répare. `stockDisponible`, par exemple, existait en deux versions et
celle qui manquait le terme « bloqué » était celle de la garde de disponibilité.

### Trois défauts réparés dans `procurement.createReception`

Ce flux violait trois règles du cadrage. Corrigés, pas contournés :

1. **Écriture directe de `stocks`.** Le bloc lisait l'ancien stock avec un `.limit(1)` — donc
   sur une ligne ARBITRAIRE dès que le produit est réparti — recalculait le CMUP avec une
   QUATRIÈME copie de la formule, insérait le mouvement à la main, puis resynchronisait
   `stocks_unites` à la main. Un seul appel à `enregistrerMouvement` fait les quatre
   correctement. Au passage : **16 erreurs de typecheck supprimées** dans `procurement.ts`.
2. **Pas d'emplacement.** Toute pièce reçue atterrissait sur la ligne globale — incompatible
   avec « les pièces sont éparpillées dans 5 magasins et dans les bureaux ». Le champ
   `emplacementId` est ajouté à la ligne de réception.
3. **`date` alimentée par un objet `Date`.** `lots.date_fabrication` et `date_peremption` sont
   des colonnes `date`, que Drizzle lit en mode CHAINE ; y passer un `Date` faisait échouer
l'écriture. **Toute réception portant une date de lot était cassée depuis l'écriture du
   schéma** — et rien ne l'avait signalé, parce que le module approvisionnement n'a jamais
   servi : le relevé compte zéro ligne dans `achats`.

### Le prix : trois cas, un seul exige une décision

· **saisi** — c'est le prix que le magasinier connaît ;
· **catalogue** — repris de la fiche, signalé comme tel dans l'aperçu ;
· **aucun** — la pièce entre en stock **sans coût**.

Le troisième cas n'est pas une erreur, mais il a une conséquence visible : la pièce n'entre pas
dans la « Valeur du stock ». Un coût nul écrit `0`, qui ferait disparaître la pièce du chiffre
sans prévenir ; on laisse donc la colonne vide — « on ne sait pas » plutôt que « zéro franc ».
L'écran le signale ligne par ligne.

`stock_agregat.cmup_pondere` a été corrigé au passage pour distinguer ces deux états : il
renvoyait `0` quand aucune ligne n'avait de coût, ce qui transformait une absence d'information
en chiffre. Il renvoie désormais `NULL`.

### L'écran `/dashboard/stock/reception`

Le geste : `[ fournisseur ▾ ] [ 🔍 pièce ] [ qté ] [ emplacement ] [ prix ] → +`.

Les champs de lot (numéro, fabrication, péremption) n'apparaissent que pour un article
traçable. Demander un numéro de lot pour une rondelle apprend au magasinier à saisir
n'importe quoi.

### Reste à faire dans `procurement`

`receivePurchaseOrder` (réception d'un bon de commande) et `rejeterReception` gardent leurs
écritures directes de `stocks` et leurs lectures `.limit(1)`. Même nature de défaut que ceux
corrigés ci-dessus, mais hors du champ de la réception rapide — à traiter quand le flux des
bons de commande sera repris.

## 15. M5 - transfert

### Un transfert est UNE opération, pas N

L'écran appelait `stock.transferer` **une fois par ligne, en parallèle**. Chaque appel ouvrait
sa propre transaction : si la troisième ligne échouait, les deux premières étaient déjà
appliquées. Le magasinier lisait « transfert effectué » et le stock ne correspondait plus —
le pire état possible, celui où l'on ne sait plus à quoi se fier.

`transfererLot` prend toutes les lignes et les écrit dans **une seule transaction**. Un
déplacement de rayon réussit ou échoue en entier.

### La quantité doit être convertie avant d'atteindre `stocks`

`transferer` écrivait dans `stocks` la quantité **brute** — `1` pour un fût — pendant que
`stocks_unites` recevait la quantité convertie. Les deux tables divergeaient à chaque
transfert d'un article à conditionnement non unitaire : déplacer un fût de 208 L retirait
**1 litre** de `stocks`.

Même défaut que sur le déconditionnement (§ 11), même correction : on convertit une fois via
`getFacteurVersBase`, et on ne demande plus au moteur qu'une seule écriture. Test verrouillé :
1 fût de 208 L retire 208 litres.

### `stocks_unites` n'est volontairement pas touché

`stocks_unites` est **global** : pas de dimension `emplacement_id`. Il décrit « combien ce
produit existe dans cet atelier », pas « combien dans ce rayon ». Déplacer un fût du bureau
vers le bac ne change pas le nombre de fûts du garage.

L'ancien `transferer` décrémentait `stocks_unites` à la sortie puis l'incrémentait à l'entrée.
Le solde revenait juste, mais **le décrément exigeait une ligne existante**. Conséquence
mesurée : **112 des 135 lignes de stock réel n'ont aucune ligne `stocks_unites`**, et ces
produits étaient *intransférables*, avec un message trompeur — « stock unité insuffisant pour
synchroniser la sortie » — alors que la pièce était bien là. `transfererLot` ne touche qu'à
`stocks` : le total est inchangé, seule la répartition bouge.

### `quantite_rayon` est enfin entretenue

La colonne est incrémentée à la mise en rayon et n'était **jamais** décrémentée : après un
transfert sortant, le rayon source continuait d'annoncer son contenu, et la liste « à
achalander » le proposait encore. Ici la source passe à zéro ; la cible reçoit la quantité
seulement si elle est un `RAYON` — un `BAC`, un `CASIER` ou un `BUREAU` reçoit la pièce
sans que celle-ci soit comptée « en rayon », ce qui est exactement ce que la colonne décrit.

### Tous les emplacements, pas seulement les rayons

`listRayons` ne renvoyait que les `type = 'RAYON'`. Or le relevé compte des `BAC`, des
`CASIER`, des `ZONE`, des `ATELIER` et un `BUREAU` — et c'est précisément là que finissent
les pièces du garage. Transférer vers un bureau était impossible ; c'est le geste le plus
courant du besoin n°6.

### On transfère ce qu'on VOIT

Choisir un emplacement source affiche son contenu via `stockParEmplacement`. Le magasinier
coche des pièces qu'il a sous les yeux, la quantité disponible est rappelée à chaque ligne,
et une quantité supérieure est refusée avant l'envoi.

### Tests — 10

Conservation du total · destination `BUREAU`/`BAC` · conversion d'unité · produit sans
ligne `stocks_unites` · relocation ne créant pas de `stocks_unites` · atomicité du lot ·
quantité excessive refusée · source = destination refusée · `quantite_rayon` · paire de
mouvements groupés.

Vérification : `tsc` 955 (aucune sur les fichiers du lot, `-2` vs. référence de 957), ESLint
propre, suite complète **1139 passés / 3 ignorés**, `next build` vert, route
`/dashboard/stock/transfert` produite.

## 16. M4 - outillage, le suivi pièce par pièce

### Le drapeau existait déjà, et n'était lu nulle part

`produits.suivi_serie` est dans le schéma depuis le début. Une recherche sur
l'application entière ne trouve que sa déclaration : jamais une lecture,
jamais une écriture. Une colonne morte, qui anticipait exactement le besoin.

On l'active au lieu d'en créer une deuxième qui dirait la même chose. Migration
`0022_outils_exemplaires`.

### Le modèle ne pouvait pas représenter un parc

Le stock dit « 4 clés dynamométriques ». Il ne dit pas que la n° 3 est sur
l'établi, que la n° 1 est à l'étalonnage et que la n° 2 est perdue dans une
fuite de liquide de frein. `prets_outils` enregistre un prêt PAR PRODUIT et
`produits.statut_outil` est UNE chaîne pour tout le parc : impossible
d'exprimer « 3 disponibles, 1 en réparation ».

`outils_exemplaires` (produit, numéro, état, emplacement) rend le parc
exprimable — UNIQUEMENT pour les outils qui le demandent, par outil.

### Trois défauts fonctionnels trouvés en route

**Le prêt d'outils était INOPÉRANT.** `prets_outils.sortie_par` référence
`employes`, et le code y écrivait `ctx.user.id` — un id d'`utilisateurs`. La
base rejetait l'écriture en clé étrangère à chaque prêt. La fonction ne
travaillait pas du tout ; ce n'était pas un bug d'affichage mais une
fonctionnalité morte. `employeDeLUtilisateur()` résout la fiche salarié via
`employes.user_id`, et laisse `sortie_par` à NULL quand le compte n'en a pas :
on ne fabrique pas d'employé pour habiller un historique.

**Un outil rangé ailleurs était déclaré introuvable.** `ajusterStockOutil`
lisait le stock sur UN SEUL emplacement et traitait « aucune ligne ici »
comme « zéro pièce en stock » : un outil en rayon était refusé au prêt avec
« stock disponible insuffisant ». Le modèle de l'utilisateur prévoit 5
magasins ; un outil n'a aucune raison d'être au bureau pour être prêté. La
fonction passe maintenant par `enregistrerMouvement` sans emplacement : le
moteur choisit la ligne la plus remplie, de façon déterministe.

**Une pièce perdue disparaissait deux fois.** Le prêt sort la pièce du stock,
et `retourner(PERDU)` la déduisait *encore* : un outil de moins par pièce
perdue, sans retour possible pour corriger. Ni l'un ni l'autre cas ne touche
au stock à la perte — le prêt l'a déjà fait.

Plus : `ajusterStockOutil` écrivait `stocks` et `mouvements_stock` en direct,
hors moteur. Toute la règle « aucune variation sans `enregistrerMouvement` »
était contournée ici — pas de quarantaine, pas de coût moyen, pas de lot.

### Et le défaut bloquant du MVP

`preter` refusait tout second prêt du MÊME produit tant que le premier n'était
pas rendu. Avec 4 clés sur l'établi, une seule pouvait sortir : l'outil n'était
utilisable que s'il était unique.

Ce refus était en outre **redondant** : le stock décrémente déjà au prêt, donc
le stock disponible compte les pièces sorties. Le refus seul rendait le service
inutilisable pour tout parc supérieur à 1.

### `etat` est un texte, pas une ENUM

Un garage découvre un état de plus tous les six mois, et un `ALTER TABLE` à
chaque découverte est le meilleur moyen de rendre le suivant inutilisable. La
liste est vérifiée par le serveur à l'écriture ; la base reste ouverte.

### Ordre des contrôles, dans `preter`

L'appartenance de la pièce est vérifiée **avant** le drapeau. Fournir un
numéro qui n'est pas celui de cet outil est d'abord une question
d'appartenance : « cette pièce est d'une autre clé » se corrige, « cet outil
n'est pas suivi » laisse deviner. Et un numéro fourni sur un outil non suivi
est **refusé**, pas ignoré : l'ignorer prêterait « la référence » pendant que
le magasinier croit prêter « la n° 3 ».

### Tests — 10

Pièces créées depuis le stock réel · rejeu sans doublon · pièce exigée sur
outil suivi · **deux prêts simultanés** · une pièce cassée ne condamne pas
les autres · perte sans double déduction · état cohérent avec un prêt actif ·
outil non suivi prêtable sans numéro · arrêt du suivi refusé s'il reste des
pièces · refus d'une pièce étrangère.

Vérification : `tsc` 955 (aucune sur les fichiers du lot), ESLint propre, suite
complète **1149 passés / 3 ignorés**, `next build` vert, routes
`/dashboard/stock/outils` et `/dashboard/stock/transfert` produites.

### Reste à faire

- `preter` n'expose pas encore le choix de la pièce depuis l'écran de prêt
  existant : le parc est lisible et modifiable, mais le prêt par numéro se fait
  encore au produit. L'écran `/dashboard/stock/outils` expose les états ; le
  dialogue de prêt de `(catalogue)/stock/outillage` reste à brancher.
- `declarerStatut` / `leverStatut` écrivent encore `produits.statut_outil` sans
  regarder les exemplaires. Sur un outil suivi, ces deux procédures doivent
  viser une pièce.
- `doter` interdit les outils (« un outil se prête ») : c'est un choix à
  confirmer, pas un défaut corrigé.
