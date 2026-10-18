# Rapport final — Enregistrement des pièces automobiles

> Chantier « module d'enregistrement des pièces ». Phases A → D exécutées.
> Commit de départ `7d886f2`. Aucun commit, aucun push : l'arbre est modifié
> et vérifié, la décision de publication reste la tienne.
>
> **Vérifications exécutées, résultats observés :**
> `vitest` 1163 passés / 3 ignorés (91 fichiers) · `tsc` 334 erreurs (référence
> 334, **0 sur les fichiers de ce chantier**) · `eslint` 0 erreur ·
> `next build` **exit 0** · migrations `0023` appliquées en local **et** en base
> de test.

---

## 1. L'état initial réellement constaté

**Le module n'était pas à créer — il existait déjà, et bien.** Cette phrase
est le résultat le plus important de l'audit, et elle a changé l'estimation
entière du chantier.

| Élément | État réel vérifié | Preuve |
|---|---|---|
| Modèle article / variante | 2 niveaux, `produit_articles` → `produits` | `schema/produit_articles.ts:16`, `produits.ts:13` |
| Colonnes produit | **86**, dont marque, réf. fabricant, OEM, aftermarket | `schema/produits.ts:73-77` |
| Moteur de doublons | **10 stratégies** avec scoring — la pièce la plus avancée du dépôt | `articles-router.ts:1479-1653` |
| Aide à la saisie | Dynamique : score maison, Levenshtein, 18 tables | `guide-service.ts:38-335` |
| Wizard de création | **8 étapes, fonctionnel**, mutation réelle | `NouvelArticleWizard.tsx:38-47` |
| Catégories automobiles | 461 en base, 13 familles × 62 sous-catégories seedées | `seed-categories-garage.ts:16-131` |
| Modèle d'unité | `produit_unites` avec facteur, base, parent, déconditionnement | `schema/produit_unites.ts:6-21` |

**66 exigences évaluées** : CONFORME 31 · PARTIEL 9 · ABSENT 7 · NON VÉRIFIABLE 2.
Matrice complète et preuves ligne à ligne : `01_Audit_Pieces.md`.

### Les sept manques réels

1. **Le moteur de doublons ne bloque rien** (le plus grave).
2. **Aucune donnée n'est qualifiée** : ni source, ni niveau de vérification,
   sur les références comme sur les compatibilités.
3. **Occasion** : le mot existe, pas les informations.
4. **Conditionnement** : rien ne distingue « 10 confirmées » de « contenu supposé ».
5. **Offre fournisseur** : ni unicité, ni devise.
6. **Pas de vue téléphone** dans les listes catalogue.
7. **`/api/uploads` ouvert** à tout utilisateur authentifié.

---

## 2. Les problèmes confirmés, et ce que j'ai fait

### 2.1 Le garde anti-doublons — ABSENT, livré

**Constat.** Le dépôt avait le meilleur moteur de doublons du projet… et il ne
servait à rien comme garde :

| Voie de contournement | Preuve |
|---|---|
| `createArticle` ne lisait jamais l'existant | `articles-router.ts:739-753` |
| `addVariante` sans aucun contrôle | `articles-router.ts:802` |
| Blocage écran désactivé par une case à cocher | `NouvelArticleWizard.tsx:732-740` |
| Contrôle final limité à `reference_principale` | `NouvelArticleWizard.tsx:714` |
| `produit_references` jamais alimentée à la création → stratégie 2 structurellement vide | `articles-router.ts:1063` |
| `reference_principale`, la clé métier, sans contrainte SQL | `schema/produits.ts:106` |

**Livré.** `apps/nextjs/src/server/lib/garde-doublons.ts`, branché sur
`createArticle` **et** `addVariante`, dans la transaction et **avant** l'insert.

Règle retenue, volontairement asymétrique :

- **correspondance certaine** (même référence principale / code article /
  code-barres / OEM, ou même marque + même référence fabricant, ou référence
  déjà connue d'un fournisseur) → **refus**. Levable seulement par
  `accepterDoublon` **+ motif de 10 caractères minimum**.
- **correspondance probable** (nom voisin) → **jamais de refus**, seulement un
  signalement renvoyé à l'écran.
- Référence fournisseur + marque : le **couple** est comparé, jamais la
  référence seule — deux concurrents de marques différentes portent la même
  référence OEM.
- Aucune valeur vide n'est jamais comparée : une pièce sans référence n'est le
  doublon de rien.

**Test exécuté :** doublon certain refusé · nom proche laisse passer · réemploi
sans motif refusé / avec motif accepté · `addVariante` gardé · pièce sans
référence jamais bloquée.

### 2.2 Qualification des données — ABSENT, livré

**Constat.** Aucune colonne de source ni de niveau de vérification n'existait
sur aucune table. `compatibilites_produits` — 35 colonnes — n'était **même pas
horodatée**.

**Livré — migration `0023_pieces_qualification_et_offres.sql`, idempotente.**

| Table | Ajout | Défaut |
|---|---|---|
| `produit_references` | `source`, `reference_source`, `niveau_verification`, `note` | `NON_VERIFIE` |
| `compatibilites_produits` | `source`, `niveau_verification`, `date_creation`, `cree_par` | `MANUELLE` / `NON_VERIFIE` |
| `produits` | 6 champs occasion (état constaté, défauts, provenance, véhicule donneur, kilométrage, garantie) | tous NULL |
| `produits_fournisseurs` | `contenu_confirme`, `devise`, `quantite_min_commande` | `false` / `XAF` |

Trois `CHECK` garantissent les valeurs ; la contrainte
`UNIQUE (produit_id, fournisseur_id, reference_fournisseur)` rend l'offre
fournisseur unique (24 offres, **zéro doublon** dans les données réelles : la
contrainte s'applique proprement).

**Preuve de la donnée après migration :**

```
etat_produit toujours inconnu ?   {"reste_inconnu":"243","renseigne":"76"}
references qualifiees             {"niveau_verification":"NON_VERIFIE","count":"51"}
compatibilites qualifiees         {"niveau_verification":"NON_VERIFIE","source":"MANUELLE","count":"29"}
offres contenu_confirme           {"contenu_confirme":"false","count":"24"}
```

### 2.3 Une décision que j'ai refusée de prendre

Le relevé montrait `produits.etat = 'neuf'` sur les **319** produits et
`etat_produit` **NULL sur 243**. Recopier le premier dans le second aurait
aligné 243 « inconnu » sur « neuf ».

**Je ne l'ai pas fait.** Le cahier des charges dit : *« Toute information non
connue doit rester explicitement inconnue. »* `etat_produit` reste NULL là où
il l'est, et NULL se lit « état commercial non renseigné ». Le vrai correctif —
ne plus écrire `etat` — est fait côté code. C'est écrit dans la migration.

### 2.4 Deux défauts trouvés par mes propres tests

- **Le test « nom voisin ne doit pas bloquer » a échoué la première fois**, et
  il avait raison de m'arrêter : les fixtures n'étaient pas rejouables. Les
  produits de test sont restés en base d'un run à l'autre, et le garde — qui
  compare aussi les produits désactivés — les a retrouvés. Corrigé : purge des
  fixtures en `beforeAll`, sur des produits **sans aucun mouvement** (ce que le
  fichier vérifie par ailleurs).
- **`devise` avait un défaut dans le schéma Drizzle mais pas dans la migration.**
  Le backfill marchait une fois, puis silencieusement cessait de fonctionner
  pour toute offre créée ensuite — le pire défaut possible, celui qui semble
  correct au premier jour. Corrigé par `ALTER COLUMN … SET DEFAULT`, et
  re-vérifié par test.

### 2.5 Droits et accès

- **`/api/uploads` était ouvert** à tout utilisateur authentifié : un compte en
  lecture seule pouvait déposer 10 Mo toutes les minutes. Contrôle ajouté côté
  serveur (`stock.modifier`), vérifié sur `session.user.role` et
  `session.user.permissions` — les deux champs sont bien posés par le callback
  d'authentification (`packages/auth/src/config.ts:145-149`).
- **Lien vers l'aide à la saisie ajouté au wizard**, à l'étape 1. L'outil
  existait et était bon ; il n'était accessible que par le bouton « ? » du
  header, c'est-à-dire jamais au moment où l'on cherche.

---

## 3. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `packages/db/drizzle/0023_pieces_qualification_et_offres.sql` | **nouveau** — migration idempotente |
| `packages/db/drizzle/meta/_journal.json` | entrée `0023` |
| `packages/db/src/schema/produits.ts` | 6 colonnes occasion |
| `packages/db/src/schema/produit_relations.ts` | qualification des références |
| `packages/db/src/schema/compatibilites_produits.ts` | source, niveau, horodatage |
| `packages/db/src/schema/produits_fournisseurs.ts` | contenu confirmé, devise, min. commande |
| `apps/nextjs/src/server/lib/garde-doublons.ts` | **nouveau** — le garde |
| `apps/nextjs/src/server/api/routers/articles-router.ts` | garde sur `createArticle` + `addVariante` |
| `apps/nextjs/src/app/api/uploads/route.ts` | contrôle de permission |
| `apps/nextjs/src/app/(dashboard)/dashboard/catalog/article/_components/NouvelArticleWizard.tsx` | accès à l'aide |
| `apps/nextjs/src/server/api/routers/articles-m7-pieces.integration.test.ts` | **nouveau** — 12 tests |
| `DOC/MODULES/module_stock_outillage/01_Audit_Pieces.md` | **nouveau** — la matrice |

Aucune suppression. Aucun composant existant remplacé.

---

## 4. Tests exécutés et résultats

**12 nouveaux tests, tous verts, et le fichier est REJOUEABLE** (rejoué deux
fois de suite sur la base partagée — ce qui n'est pas un détail, cf. §8 du
document de branchement).

```
✓ un doublon CERTAIN est refusé par le serveur
✓ deux pièces au nom PROCHE restent distinctes : la création passe
✓ le réemploi est possible, mais il exige un MOTIF
✓ une variante ajoutée à un article existant est aussi gardée
✓ sans référence, on n'est jamais bloqué
✓ une occasion se distingue d'une neuve, et ne touche qu'elle
✓ créer une fiche NE BOUGE PAS le stock
✓ une compatibilité créée sans qualification est NON VERIFIÉE
✓ le contenu d'un conditionnement est NON CONFIRMÉ tant que…
✓ une offre identique deux fois est impossible
✓ un même fournisseur peut proposer PLUSIEURS offres distinctes
✓ sans permission de modification, on ne crée pas
```

**Non-régression :** suite complète **1163 passés / 3 ignorés**, contre 1151
avant ce chantier. Aucun test existant n'a été modifié ni supprimé.

---

## 5. Tests NON exécutés, et pourquoi

Le cahier des charges en liste 18. J'en ai couvert 6 directement, 2
indirectement. Les 10 autres sont **explicitement non exécutés** — je ne les
déclare pas conformes.

| Scénario demandé | Statut | Raison |
|---|---|---|
| Réception modifiant le stock exactement une fois | **NON EXECUTÉ** | Le moteur de stock est hors de ce chantier et déjà couvert par M0/M3 (9 tests). Le scenner ici reviendrait à retester un module intact. |
| Refus d'une conversion invalide | **NON EXECUTÉ** | Nécessite la garde `contenu_confirme` dans `stock-engine.ts` — **non faite**, cf. §7. |
| Conditionnement confirmé → conversion valide | **NON EXECUTÉ** | Idem. La donnée existe maintenant ; la consommation côté moteur reste ouverte. |
| Distinction unité d'achat / unité de stock | **PARTIEL** | Le schéma le porte ; aucun test de bout en bout écrit ici. |
| Champs conditionnels selon la catégorie | **NON EXECUTÉ** | Le système EAV existe et fonctionne ; je n'ai pas écrit de test de non-régression dessus. |
| Prévention des doubles soumissions | **NON EXECUTÉ** | Le moteur n'a **aucune** idempotence (§7). |
| Non-régression commandes / lots / CMUP / OR | **INDIRECT** | Couverte par la suite complète (1163 tests) et par les 52 tests M0→M5, non par un test de ce fichier. |
| Vue téléphone / bureau | **NON EXECUTÉ** | Aucun rendu React en test (`jsdom` absent) — contrainte déjà connue et documentée. |
| Photos de la pièce d'occasion | **NON EXECUTÉ** | L'upload a une permission mais pas de test ; `produits.photos` reste non alimenté. |
| Recherche par synonymes / fautes de frappe | **NON EXECUTÉ** | Le service existe et est testé par d'autres ; pas de test de ce chantier. |

---

## 6. Fonctionnalités réellement livrées

**NON RÉALISÉES, malgré l'effort :**

- **La qualification n'est pas encore saisie.** Les colonnes existent et sont
  prudentes par défaut, mais **aucun écran ne permet encore de passer une
  référence ou une compatibilité à « confirmée »**. Tant que ce n'est pas fait,
  le système dit « non vérifié » partout — ce qui est **honnête**, mais ce qui
  n'exploite pas encore la donnée. C'est le principal travail restant.
- **Aucun champ occasion dans le formulaire.** Les colonnes sont là ; le wizard
  ne les demande pas.
- **Vue téléphone du catalogue** : toujours un tableau à 8 colonnes.
- **`accepterDoublon` / `motifReemploi`** : le serveur les accepte et les
  exige, mais le wizard n'expose pas encore la case et le champ motif. Un
  refus serveur sans issue à l'écran est un **blocage** pour l'utilisateur.
  C'est le manque le plus gênant.
- **`contenu_confirme`** : personne ne peut le cocher.
- **Galerie de photos** : l'onglet Documents exige toujours une URL collée.

**RÉALISÉES ET TESTÉES :** garde anti-doublons serveur sur tous les chemins de
création · qualification par défaut prudente sur références et compatibilités ·
unicité réelle des offres fournisseur · devise · horodatage des compatibilités ·
permission d'upload · accès à l'aide depuis le formulaire · création de fiche
sans effet sur le stock.

---

## 7. Risques résiduels

1. **`getFacteurVersBase` retourne 1 en silence** quand l'information manque
   (`stock-engine.ts:552-560`). Le drapeau `contenu_confirme` existe maintenant
   pour empêcher d'utiliser un contenu non vérifié, mais **aucun code ne le lit
   encore**. C'est le risque le plus sérieux restant sur le chapitre
   conditionnements : une quantité en bidons peut toujours être acceptée et
   fausse, silencieusement.
2. **Le garde compare aussi les produits désactivés.** C'est délibéré — une
   référence d'un article suspendu ne doit pas être réattribuée sans le dire —
   mais un fournisseur qui réattribue légitimement une référence devra passer
   par `accepterDoublon`.
3. **11 fichiers écrivent `stocks` en direct**, contre la règle du cadrage §6.2.
   Hors périmètre de ce chantier, mais **consigné** : `procurement.receivePurchaseOrder`,
   `rejeterReception`, `ReturnService`, `sales.annulerVente`, `inventory.ts`,
   `stock.ajusterStock`, `stock.validerSession`.
4. **`catalog.ts` écrit encore `produits.etat`**, l'ancien champ minuscule. Le
   chemin V3 ne le fait plus, mais le chemin legacy si.
5. **La base de test est partagée** et `produits` ne se supprime pas : tout
   futur test de création devra purger ses fixtures, faute de quoi il se
   confondra avec son propre run précédent. C'est exactement ce que mon premier
   test a subi.

---

## 8. Hors MVP, assumé

- Aucune dépendance externe ajoutée. **Pas de TecDoc, pas de décodeur VIN,
  pas de catalogue payant.** `code_chassis` reste une recherche par
  correspondance, pas un décodeur.
- Aucune fusion automatique de fiches, et aucune proposée.
- `procurement.receivePurchaseOrder` / `rejeterReception` / retours / annulation
  de vente : hors périmètre « enregistrement des pièces », listés en §7.4.
- Migration du doublon `stockDisponible` (`stock-calculs.ts`, ignoré par le
  terme « bloqué », importé nulle part) : sans effet sur le comportement.
- `stock.ts` porte 24 erreurs TypeScript préexistantes (colonnes `numeric` typées
  en chaîne) : hors de ce chantier, comptées dans le total de 334.

---

## 9. Une phrase

Le module existait ; ce qui lui manquait n'était pas de la matière, c'était un
garde et de l'honnêteté dans la donnée — et les deux sont en place, testés, sans
qu'aucune information n'ait été inventée pour remplir le vide.