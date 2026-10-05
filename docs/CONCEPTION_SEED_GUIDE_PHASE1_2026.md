# PHASE 1 — Audit & Conception : SEED MÉTIER MASSIF + GUIDE DE SAISIE INTELLIGENT (Module 1 — Catalogue)

- **Date** : 2026-09-11
- **Statut** : PHASE 1 (audit + conception) — **aucun code implémenté**. Décisions à valider avant la PHASE 2.
- **Périmètre** : Module 1 « Catalogue universel » (AtelierOne). Le socle ARTICLE → VARIANTE → ATTRIBUTS → RÉFÉRENCES (P2/P3, validé) est la base inchangée de cette conception.
- **Données mesurées** : base locale `atelierone_erp`, sondage du 2026-09-11 (cf. §B).

---

## A. Architecture actuelle (ayant-droit validé)

**Moteur.** Monorepo pnpm/turbo. `packages/db` (drizzle-orm + postgres) définit le schéma et les seeds ; `packages/validators` porte les enums métier ; `apps/nextjs` expose les routes tRPC (`articles-router`, `catalog`, `ontology-router`…) et l'UI Catalogue (`dashboard/catalog/**`, module-shell `domainId="catalogue"`).

**Modèle catalogue (épine dorsale).**
- `produit_articles` : l'ARTICLE (entité commune, `categorieId`, `typeProduit`).
- `produits` : VARIANTE (SKU) ou EXEMPLAIRE (outil/équipement), `codeBarre`/`codeArticle` uniques, `refOem/referenceFabricant/referencePrincipale`, niveau, statuts, position, `niveau` VARIANTE|EXEMPLAIRE.
- `categories` : hiérarchie PFAR avec `niveauOntologie` (FAMILLE|CATEGORIE|SOUS|TYPE), `typeBranche`, `domaine`.
- `attribut_definitions` : portée ARTICLE|VARIANTE|EXEMPLAIRE|POSITION|VEHICULE|LOT|FOURNISSEUR, `typeAttribut` (13 types), `obligatoire/searchable/filtrable/comparable`, min/max, `liste`, `uniteId`, `aide`.
- `article_attributs` / `variante_attributs` : valeurs (TEXT + unité + `statutValeur`).
- `produit_references` (typeRef FABRICANT|OEM|CONSTRUCTEUR|FOURNISSEUR|EAN|UPC|GTIN|ANCIENNE|AUTRE, `valeurNormalisee`, `isPrincipale`), `produit_supersessions`, `produit_substitutions` (niveauConfiance OFFICIEL|HOMOLOGUE|TECHNIQUE|COMMERCIAL|MANUELLE), `produit_references_equiv`.
- `compatibilites_produits` (POSITIVE|NEGATIVE : marque/modele/version/generation/anneeDe-A/motorisation/carburant/cylindree/puissanceKw/codeMoteur/boite/codeBoite/transmission/codeChassis…).
- Stock : `stocks` (quantite, Reservee, Bloquee, Rayon, seuilAlerteLocal), `lots` (dateFabrication/Peremption, statut), `stocks_lots`, `emplacements` hiérarchiques, `mouvements_stock` (moteur `stock-engine`).
- Appro : `produits_fournisseurs` (referenceFournisseur, prixAchat, delai, estPrincipal, facteurConditionnement), `fournisseurs` (circuit PIECES|CHARGES).
- Outillage/équipement : `prets_outils`, `outillage_maintenance`, `outillage_calibration`, `kits_lignes`.
- `catalogue_qualite` : snapshot CAT-01 (score, problemes, TTL 10 min, advisory lock).
- `vehicules` : fiche parc (immatriculation, marque, modele, version, annee, numeroChassis, kilométrage, carburant, typeVehicule, statutImmobilisation).

**Seeds (pipeline).** `seed-install` purge + socle (agences SITE-1/SITE-2, sécurité, comptes admin) ; le catalogue se charge via `import:catalogue` (scripts/deploy.mjs) enchaînant `seed-references` → `seed-categories-garage` → `seed-ontologie-filtres` → `seed-demo`/`seed-demo-garage` → `seed-scenarios`. Le `seed-catalogue-v3` porte unités complémentaires + emplacements + `attribut_templates`. `seed-lib.ts` fournit l'API partagée idempotente (ensureCategory, ensureArticle, addRef, setStock, addLot, addStockLot, journal…).

**Routers clés.** `articles-router.getArticle` (fiche enrichie ATTRIBUTS par variante + stock + refs) ; `articles-router.recherche` (multicritères : q, référence normalisée contient/exact, réf fournisseur, VIN, marque/modele/motorisation, position, attributs variante OU article) ; `ontology-router.getDefinitionsForCategory` (chaîne d'ancêtres + merge catégorie > famille > type) utilisé par le wizard.

**Wizard validé** (`catalog/article/_components/NouvelArticleWizard.tsx`) : étape 1 catégorie → résout les gabarits, étape 2 article, étape 3 variantes, étape 4 références/exemplaires (OUTIL), étape 5 fournisseurs + stock ; soumission TRPC + `invalidate()` ; toast sonner partout ; gestion loading/empty/erreur.

---

## B. Ce qui existe déjà (état réel mesuré)

| Objet | Quantité en base | Lecture |
|---|---|---|
| Catégories | **461** (44 racines) | Niveaux : CATEGORIE 457, SOUS 4 ; **FAMILLE/TYPE : 0**. `typeBranche` : PIECE 326, CONSOMMABLE 67, OUTIL 49, EQUIPEMENT 9, SERVICE 8, NULL 2. `domaine` : **100 % NULL** |
| Définitions d'attributs | **78** | ARTICLE 12, VARIANTE 60, EXEMPLAIRE 6 (aucune portée POSITION/VEHICULE/LOT/FOURNISSEUR en base) |
| Unités | 55 ; domaines 16 ; conversions 41 | Référentiel unités/complète (LONGUEUR→MM base, PRESSION→BAR, COUPLE→NM…) |
| Articles | **108** | PIECE 59, OUTIL 15, SERVICE 10, CONSOMMABLE 10, FOURNITURE 7, EQUIPEMENT 7 |
| Produits (variantes/exemplaires) | **317** | VARIANTE 290, EXEMPLAIRE 27 ; typeProduit : PIECE 165, OUTIL 77, CONSOMMABLE 51, SERVICE 9, FOURNITURE 7, EQUIPEMENT 7, KIT 1 |
| Produits reliés à un article | **131 / 317** | ≈ 186 variantes/exemplaires sans article ancêtre (héritage) — piste de qualité |
| Références produit | **51** | FABRICANT 23, OEM 11, FOURNISSEUR 10, EAN 6, ANCIENNE 1 — **aucun GTIN / UPC / CONSTRUCTEUR** |
| Compatibilités véhicules | 29 | type POSITIVE (marque/modele/motorisation/codeChassis) |
| Fournisseurs | 15 | — |
| Emplacements | 31 | hiérarchies Magasin → Rayon → Étagère → Bac (LOC-*, LOC-SCEN-*, MAG1-4) |
| Lignes de stock | 135 | dont `quantiteRayon`, `quantiteReservee`, `quantiteBloquee` |
| Lots | 23 | dont lot périmé (scénario EXPIRED-LOT), DLC, provenance, qualité |
| Véhicules | **223** | Toyota 127, Renault 24, Peugeot 18, Nissan 16, Ford 11, Hyundai 6, Kia 4, Mazda 4, Suzuki 3, Dacia 3, Mercedes 2, Honda 2. **Absents : VW, Citroën, BMW** (0 enregistrement) |
| Snapshot qualité CAT-01 | **0** | `catalogue_qualite` vide en local (aucune génération) |
| Prêts d'outils / maintenance / calibration | oui (seed-demo) | OUT-001 dispo, OUT-002 prêté, OUT-003 en maintenance ; outillageCalibration présent |

**Seeds en place (idempotents).**
- `seed-references` : 37 unités, 14 domaines + conversions, 7 familles racines canoniques, 18 définitions transverses (ex. technologie batterie AGM/EFB, viscosité SAE, plage de couple…), manifest des enums.
- `seed-categories-garage` : 13 familles × 62 sous-catégories (PIECE_MECA, MOTEUR, ELEC, CARROSSERIE, PEINTURE, FLUIDES, PNEUMATIQUES, JANTES, CONSO_ATELIER, OUTILLAGE, EQUIPEMENT, SECURITE, ACCESSOIRES, SERVICES).
- `seed-ontologie-filtres` : branche filtres G01 (6 feuilles G010101…G010106) avec gabarits complets (filtre huile : type de montage, Ø ext., hauteur, filetage, joint, clapet, soupape, pression).
- `seed-demo`/`seed-demo-garage` : vitrine Batterie AGM 70 Ah (article→variantes→refs→fournisseurs→lots), Huile 5W30 (produit≠stock≠lot≠emplacement, multi-emplacements 20+17 L), Clé dynamométrique (modèle EX → OUT-001/002/003), véhicules, kit, équipement, services tarifés.
- `seed-scenarios` : 10 situations véridiques (LOW-STOCK, EXPIRED-LOT, TOOL-LOAN, LOST-TOOL, DAMAGED-TOOL, SUPERSESSION, SUBSTITUTION, DUPLICATE, MULTI-LOCATION, KIT-INCOMPLETE).

**Recherche runtime** (`articles-router.recherche`) : la recherche multicritères existe déjà, avec **normalisation de référence** (`normaliserRef` : minuscules sans ponctuation) et mode « contient » (ex. « 90915 » → « 90915-YZZD1 »). Elle couvre refs (principale/fabricant/OEM/codeBarre/codeArticle + table references + équivalences), réf fournisseur, VIN via compatibilités, marque/modele/motorisation, position, attributs (variante OU article). **Elle n'explique pas pourquoi un résultat correspond** (pas de « poursuite de correspondance »).

**Ontologie runtime** : `getDefinitionsForCategory` résout la chaîne d'ancêtres et fusionne les définitions (la plus spécifique gagne), avec fallback `typeProduit` → gabarits transverses.

---

## C. Ce qui manque (ce que le chantier Seed + Guide doit combler)

1. **Taxonomie non cohérente.** 44 racines issues de plusieurs seeds ; `niveauOntologie` FAMILLE/TYPE jamais posé (que CATEGORIE/SOUS) ; `domaine` 100 % vide ; divergences de libellés (« Pièces automobiles & mécaniques » vs « Pièces mécaniques ») ; `typeBranche` avec 2 NULL.
2. **Divergences modèle ↔ données.** `typeProduit` « officiel » à 5 valeurs (PIECE|CONSOMMABLE|OUTIL|EQUIPEMENT|SERVICE) mais la base contient **FOURNITURE (7)** et **KIT (1)** et l'ancien `catalog.ts` admet 4 valeurs. Décision à prendre : officialiser FOURNITURE (+ KIT) comme valeurs du modèle (recommandé), ou migrer/nettoyer. Le Guide doit l'expliquer (confusion PIECE vs FOURNITURE vs CONSOMMABLE).
3. **~186 variantes/exemplaires orphelins** (sans `article_id`) : à rattacher (qualité contrôlée) ou archiver — le snapshot CAT-01 existe pour cela mais n'est pas encore généré.
4. **Références maigres.** Pas de GTIN/UPC/CONSTRUCTEUR, aucune normalisation persistée exploitable pour doublons (`valeurNormalisee` non remplie par les seeds addRef), supersessions/substitutions peuplées seulement via scénarios.
5. **GUIDE INEXISTANT.** Aucune table `guide_*` ; le wizard est data-driven mais **muet** : pas de règles (valeur attendue, unités, pièges, valeurs canoniques), pas d'erreurs courantes, pas d'exemples contextualisés.
6. **Valeurs techniques non sémantiques.** `valeur` est TEXT (YYYY ff.), les unités sont séparées mais : « 3/4-16 » (filetage pouce) n'a pas d'unité cohérente (on sait le stocker, pas le valider) ; « 12 V », « 1,2 bar », « 2,5 kW » dépendent du bon `uniteId` au moment de la saisie ; les `min/max` des définitions existent mais ne sont presque jamais appliquées ni renseignées côté seed.
7. **Référentiel véhicules partiel.** `vehicules` = fiches parc (223) sans référentiel marque/modèle/version en dur ; les compatibilités utilisent du texte libre. Manque les marques VW/Citroën/BMW ; le Guide doit tolérer l'incertitude et orienter vers les exemples.
8. **Qualité & tests.** Pas de suite de non-régression dédiée seed (idempotence, rejouabilité, comptes), pas de « test ultime » de flexibilité (nouvelle famille sans code, nouvel attribut sans colonne SQL, nouvel objet métier) formalisé.
9. **Anomalies** : pas de catalogage explicite des anomalies intentionnelles (les scénarios en portent, mais sans registre machine lisible).

---

## D. Taxonomie cible proposée (data-driven, non hard-codée)

**Principe.** Toute la taxonomie vit dans `categories` ; le code (React/wizard/guide) ne connaît que des conventions de colonnes, jamais des libellés.

- Niveaux posés : racine = `FAMILLE`, puis `CATEGORIE`, puis `SOUS`, feuille = `TYPE` (usage strict de `niveauOntologie`).
- `domaine` rempli sur chaque nœud (2 valeurs : `AUTOMOBILE` / `ATELIER` ; « SERVICES » rattaché à ATELIER), hérité de la racine.
- Convention de codes stable : 2 lettres pour le domaine, préfixe par famille ; ex. `AUT-FILTRE-HUILE`… (à valider — l'existant utilise déjà des codes courts type `G010101`, on propose de **conserver les codes existants** comme alias stables et d'ajouter les valeurs de niveau au-dessus sans renommer ce qui est déjà chaîné).
- Feuille = là où se posent les gabarits `attribut_definitions` (feuille wins over famille over type — déjà le cas dans `getDefinitionsForCategory`).
- Règles d'ajout : une nouvelle famille = 1 insert `categories` + N définitions ; **aucune ligne de code**.

**Familles cibles (à compléter ou créer) — extrait du répertoire garage réaliste :**
PIÈCES : Moteur, Distribution, Refroidissement, Lubrification, Filtration, Carburant, Échappement, Allumage, Électrique, Électronique/Capteurs, Batteries, Démarrage/Alternateur, Transmission, Embrayage, Cardan/Transmission, Freinage (disques/plaquettes/tambours/mâchoires/flexibles/maître-cylindre), Suspension/Direction, Roulements, Carrosserie, Pare-brise, Vitrage, Peinture/Préparation, Éclairage, Climatisation, Intérieur, Pneumatiques/Jantes, Accessoires, Attelages.
CONSOMMABLES : Huiles moteur/transmission, Liquides (frein, refroidissement, LDR, ADBlue), Graisses, Produits d'entretien, Fixations, Abrasifs, Textiles, Consommables soudage/peinture.
OUTILLAGE : Manuel, Spécialisé auto, Électroportatif, Pneumatique, Levage/Manutention, Mesure & Contrôle (clé dynamométrique, pied à coulisse), Diagnostic électronique, Soudage/Découpe.
ÉQUIPEMENTS : Levage (pont, cric…), Diagnostic (valise…), Air & Énergie (compresseur), Nettoyage (haute pression), Sécurité (EPI, incendie), Atelier (établis…).
SERVICES : Main-d'œuvre (heure), Diagnostic & contrôles, Réparations/entretien (forfait), Dépannage/remorquage, Lavage/intérieur.

**Positions canoniques** (déjà côté serveur) : positionCôte GAUCHE|DROITE|CENTRAL|LES_DEUX|N_A ; essieu AVANT|ARRIERE|N_A ; zone ; emplacement MOTEUR|BOITE|ROUE|HABITACLE|CARROSSERIE|FREINAGE|CLIM|CHASSIS|N_A.

---

## E. Seed métier massif — conception (3 niveaux)

### Objectifs
Un dataset DÉTERMINISTE, REPRODUCTIBLE, IDEMPOTENT, DOCUMENTÉ, qui (1) démontre l'architecture sur tous les cas métier, (2) alimente le Guide comme **bibliothèque d'exemples**, (3) permet de tester recherche, contrôles de cohérence, stock, outillage, compatibilités.

### Trois niveaux (séparés, code-prefixes stables)
- **RÉFÉRENTIEL** (prefixe `META-`/racines) : familles canoniques, définitions d'attributs (avec `min/max`, `liste`, `aide`, `obligatoire`), unités/domaines, enums de référentiel (positions, états, types de relations), exceptions officielles (ex. filetage en pouce). **Ne crée aucun produit**.
- **DÉMONSTRATION** (`DEMO-`) : produits « vitrine » réalistes, sans fausse publicité : article → variantes → références → compat véhicules → fournisseurs → lots → emplacements → stock. Chaque variante est un cas pédagogique cité par le Guide.
- **SCÉNARIOS** (`SCENARIO-`) : situations métier **réelles et anomalies intentionnelles documentées** (LOW-STOCK, EXPIRED-LOT, TOOL-LOAN, LOST-TOOL, DAMAGED-TOOL, SUPERSESSION, SUBSTITUTION, DUPLICATE, MULTI-LOCATION, KIT-INCOMPLETE — déjà bâtis), enrichies : valeurs non canoniques (filetage contradictoire, réf OEM dupliquée, lot périmé au stock), prêts/perte d'outils (jamais supprimer un exemplaire perdu/volé → statut PERDU/VOLE/REFORME).

### Règles de contenu
- Aucune donnée « aléatoire » ; chaque ligne a un **motif métier** et une note (colonne/commentaire) si anomalie.
- Données fictives jamais présentées comme réelles : libellés explicites « scénario », codes `SCENARIO-*`, prix cohérents (TVA 19,25 %), fournisseurs réutilisés du référentiel.
- Chaque famille majeure doit avoir ≥ 1 article « exemple » complet (références + compat + stock) pour servir le Guide.
- Lenses : comptabilité (produit≠stock≠lot≠emplacement ; pas de double comptage FEFO/FIFO), outillage (modèle vs exemplaire ; prêt/maintenance/calibration ; jamais supprimer), équipements (modèle → actifs, maintenance/inspection/calibration/panne), services (pas stockable).

### Déploiement
Étendu dans le pipeline `import:catalogue` (deploy.mjs) dans l'ordre référentiel → démo → scénarios ; **rejouable** (idempotent, `onConflictDoNothing` + gardes `hasAnyProduct`), vérifié par `verify-deploy.ts` (conformité + données). Nouveau seed = fichier `packages/db/src/seed-*.ts` utilisant `seed-lib` (API existante réutilisée, zéro nouveauté d'infra).

---

## F. Architecture du guide de saisie (data-driven)

**Chaîne logique : CATALOGUE → CONNAISSANCE → GUIDE.**

- **CATALOGUE** = les données de référence (categories, attribut_definitions, unités, produits exemples).
- **CONNAISSANCE** = les règles métier formalisées en base (tables `guide_*`) : étapes, pièges, valeurs canoniques, erreurs courantes, alias.
- **GUIDE** = rendu générique (aucun libellé codé en dur) : composant `GuidePanel` consommé à 4 points d'entrée — (1) page catégorie, (2) recherche (résultat + explication), (3) fiche article/variante, (4) wizard (étape 2/3/4).

**Ce que le Guide affiche, dans un ordre stable :**
1. Carte catégorie : libellé, branche, « à savoir » (texte libre lié à la catégorie).
2. Caractéristiques attendues (issues des définitions actives, par portée, ordonnées, avec unité par défaut + plage + exemple) — champ « Que dois-je saisir ? ».
3. Règles (valeurs canoniques, conversions, associations, pièges).
4. Erreurs courantes + correctifs.
5. Exemples navigables : « Un produit modèle dans cette famille » → ouvre la fiche de l'exemple et le formulaire prérempli de relecture.
6. « Voir comment l'enregistrer » → lien wizard ancré à la catégorie.

**Sources, jamais codées en dur :**
- `categories` (+ `chaineAncetres`) ; `attribut_definitions` (avec `aide` affichée inline) ;
- tables `guide_*` (voir §G) ;
- exemples = produits du seed (via `guide_examples.produitId/articleId`) ;
- alias de recherche (nom vernaculaire → catégorie/définition).

---

## G. Modèle de données du guide — proposition

La « bibliothèque d'exemples » est déjà portée par `produits`/`produit_articles` ; **on n'y touche pas**. On ajoute des tables `guide_*` (le `attribut_templates` existant est un conteneur générique non lié aux catégories — insuffisant seul, on le laisse tel quel pour compat) :

### Tables proposées (DDL de conception)

```sql
-- guide_categories : en-tête de Guide par catégorie/type de produit
CREATE TABLE guide_categories (
  id serial PRIMARY KEY,
  categorie_id integer NULL REFERENCES categories(id),
  type_produit varchar(30) NULL,          -- fallback transverse (PIECE, OUTIL…)
  titre varchar(160) NOT NULL,            -- ex. « Filtre à huile — montage vissé »
  contexte text,                          -- « à savoir » libre
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX unq_guide_cat ON guide_categories(categorie_id, type_produit);

-- guide_steps : étapes de saisie ordonnées
CREATE TABLE guide_steps (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  ordre integer NOT NULL,
  titre varchar(160) NOT NULL,
  texte text NOT NULL,                    -- consigne aide
  portee varchar(20),                     -- ARTICLE|VARIANTE|EXEMPLAIRE|…
  champ_cle varchar(100),                 -- rattache une étape à une définition
  recommandation text
);

-- guide_rules : valeurs canoniques, conversions, pièges
CREATE TABLE guide_rules (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  type varchar(20) NOT NULL,              -- VALEUR|UNITE|CONVERSION|ASSOCIATION|PIEGE
  condition text,                         -- ex. « type_filtre = SPIN_ON »
  conseil text NOT NULL,
  preuve text,                            -- pourquoi (source factuelle)
  exemple_id integer NULL                 -- produit exemple lié
);

-- guide_examples : bibliothèque d'exemples du Referentiel (pointeurs)
CREATE TABLE guide_examples (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  produit_id integer NULL REFERENCES produits(id),
  article_id integer NULL REFERENCES produit_articles(id),
  libelle varchar(160) NOT NULL,
  motif varchar(255),                     -- pourquoi c'est un bon exemple
  est_reference boolean DEFAULT false,
  ordre integer DEFAULT 0
);

-- guide_common_errors : erreurs courantes + correctifs
CREATE TABLE guide_common_errors (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  code varchar(80) NOT NULL,              -- ex. FILETAGE_UNITE_INCOHERENTE
  message varchar(255) NOT NULL,
  actions text NOT NULL,
  severity varchar(10) DEFAULT 'warning'
);

-- guide_search_aliases : alias vernaculaire → cible (catégorie ou définition)
CREATE TABLE guide_search_aliases (
  id serial PRIMARY KEY,
  alias varchar(160) NOT NULL,
  categorie_id integer NULL REFERENCES categories(id),
  definition_id integer NULL REFERENCES attribute_definitions(id),  -- cf. nom réel
  type varchar(20) NOT NULL              -- CATEGORIE | CHAMP | VALEUR
);
CREATE UNIQUE INDEX unq_active ON guide_search_aliases(lower(alias), type);
```

### Extension minimale de `attribut_definitions` (optionnelle, non-cassante)
- `modele_valeur jsonb NULL` : exemples/regex attendus par type (`"3/4-16"`, `"19.05 mm"`), valeurs types (`liste` existante réutilisée), plage par défaut (réutilise `min/max`).
- `explication text NULL` : aide longue (complément de `aide`).
- **Aucune colonne supprimée ni renommée** → le wizard validé reste fonctionnel.

### Intégration
- Routeur tRPC `guide` (lecture) : `getGuideForCategory(categorieId, portee?)` → bundle { catégorie, chaîne, définitions, steps, rules, errors, examples } (une seule requête, servie aux 4 points d'entrée). Wrapped par `requirePermission("stock.consulter")` + `invalidate()` n/a (lecture).
- Le **wizard** appelle en parallèle `getDefinitionsForCategory` (existant) + `getGuideForCategory` pour l'encart contextuel.
- La **recherche** ajoute en option un `mode=explain` : retourne, par résultat, la liste des conditions matchées (ref exacte/contient, attribut, véhicule) → « pourquoi ce résultat ».

---

## H. Parcours utilisateur (5 scénarios de référence)

1. **Magasinier → recherche.** Tape « 90915-0L040 » → ligne de résultat FILTRE à huile → « Pourquoi ? » : *réf OEM exacte → variante TOYOTA 90915-YZZD1* ; clic → bandeau Guide (catégorie, caractéristiques, erreurs) → bouton « Voir comment l'enregistrer » → wizard pré-positionné sur la catégorie.
2. **Nouveau référentiel sans code.** Admin crée la famille « Pompe à eau » (1 catégorie + 4 définitions via ontologie) **sans toucher au code** ; le wizard affiche automatiquement les nouveaux champs et le Guide générique de la famille.
3. **Outil.** Technicien crée un MODÈLE de clé dynamométrique (attributs modèle : plage de couple, carré, précision, calibrable) puis 2 EXEMPLAIRES (SN, valeur d'acquisition, calibration prochaine, prêt). Le Guide OUTILLAGE explique MODÈLE vs EXEMPLAIRE et la règle « jamais supprimer un exemplaire perdu/volé → statut PERDU/VOLE/REFORME ».
4. **Confusion REF vs OEM.** Erreur courante `REF_FAB_DANS_OEM` : le Guide montre la différence (FABRICANT = marque du produit ; OEM = référence équipementier d'origine) et propose la correction dans `produit_references`.
5. **Stock bas.** Filtre LOW-STOCK (2 < seuil 5) : recherche/fiche → alerte stock ; Guide explique « disponible ≠ rayon ≠ réservé ≠ bloqué ; pas de double comptage » puis pointe vers la commande.

---

## I. Exemple complet — FILTRE À HUILE (cas « simple », référence du guide)

- **Catégorie** : FAMILLE FILTRATION → feuille « Filtre à huile » (gabarit existant G010101).
- **Définitions** (existant) : type de montage (ENUM SPIN_ON/CARTOUCHE/A_VISSER/ENCART, portée ARTICLE) ; Ø extérieur (MM), hauteur (MM), filetage, Ø joint, clapet (BOOLEAN), soupape (BOOLEAN), pression d'ouverture soupape (BAR) — portée VARIANTE.
- **Valeur canonique à valider** : `filetage` = `"3/4-16"` (pouce-UNF) — type TEXTE `modele_valeur` (pas d'unité MM) ; le Guide règle `FILETAGE_UNITE` affiche la conversion équivalente 19,05 mm pour lever la confusion.
- **Données exemple (seed RÉFÉRENTIEL/DÉMO)** : ARTICLE `AUT-FILTRE-HUILE` → VARIANTE `90915-0L040` (TOYOTA) ; refs FABRICANT 90915-0L040 + OEM d'origine ; compat POSITIVE Corolla/RAV4 1.8 (code moteur 2ZR-FE) ; stock 2 < seuil 5 ; lots (un lot courant, un lot proche DLC) si suivi lot.
- **guide_steps (4)** : 1 Magasinier — « Choisir la catégorie Filtre à huile » ; 2 Article — « Type de montage : renseigner SPIN_ON » ; 3 Variantes — « Renseigner Ø ext / hauteur / filetage (pouce) / clapet / soupape / pression » ; 4 Stock & fournisseur — « Seuil d'alerte, prix, réf fournisseur ».
- **guide_rules** : (VALEUR) « SPIN_ON = filtre vissé sur embase », (UNITE) « filetage : pouce UNF — sourcer la référence constructeur », (PIEGE) « ne pas confondre Ø ext de la cartouche et Ø du joint (gabarit distinct) ».
- **guide_common_errors** : `FILETAGE_UNITE_INCOHERENTE` (« 3/4-16 » faux en MM) ; `REF_OEM_INCORRECTE` (« mettre la réf TOYOTA en OEM, la réf de la marque (ex. FILTRON) en FABRICANT »).
- **Wizard** : étape 3 affiche les 6 champs avec `aide` inline + exemples en base ; validation finale affiche « replacer le filetage par la valeur exemple si doute ».

---

## J. Exemple complet — CLÉ DYNAMOMÉTRIQUE (cas « outillage », outil modèle + exemplaires)

- **Catégorie** : OUTILLAGE → Mesure & Contrôle.
- **Mod**èle = ARTICLE (portée ARTICLE) : attributs modèle `plage_couple` (NM), `carre_transmission` (ex. 1/2\"), `precision`, `calibrable` (BOOLEAN). Définitions portée EXEMPLAIRE : SN, valeur d'acquisition, date de calibration, prochain étalonnage.
- **Données exemple** : MODÈLE « Clé dynamométrique réglable 20–210 Nm » → EXEMPLAIRE OUT-001 (dispo, calibrable), OUT-002 (prêté — `prets_outils` actif), OUT-003 (maintenance — `outillage_maintenance` CURATIVE) ; `outillage_calibration` sur OUT-001.
- **Principe enseigné** : UN MODÈLE ≠ SES EXEMPLAIRES ; le stock n'est pas applicable (pas de `stocks` ligne pour un outil individuel) ; un exemplaire perdu/volé n'est **jamais supprimé** → `statutOutil = PERDU | VOLE | REFORME`.
- **guide_steps (5)** : 1 Créer le MODÈLE (attributs modèle) ; 2 Attribuer un numéro de série ; 3 Valeur d'acquisition + état (NEUF/OCCASION/…) ; 4 Planifier calibration/maintenance ; 5 Prêt (motif, technicien, date de sortie) — antémémoire de `prets_outils`.
- **guide_rules** : (ASSOCIATION) « un exemplaire ne change pas de modèle après achat » ; (PIEGE) « ne pas saisir la clé comme PIECE → toujours OUTIL + MODÈLE/EXEMPLAIRE » ; (VALEUR) « plage 20–210 Nm, précision ± 4 %, calibrable = oui ».
- **guide_common_errors** : `OUTIL_CLASSE_PIECE` ; `EXEMPLAIRE_SANS_MODELE` ; `SUPPRESSION_EXEMPLAIRE_DIRECTE`.

---

## K. Stratégie de liaison Seed ↔ Guide ↔ Recherche ↔ Wizard

- **Seed = bibliothèque d'exemples du Guide.** Chaque exemple du REC test d'exemples est un produit réel ; `guide_examples` pointe `produit_id`/`article_id`. La fiche d'un produit ajoute un lien « Modèle de saisie » vers son Guide.
- **Guide = lecteur du référentiel.** `getGuideForCategory` dérive tout de la base : plus jamais de libellés en dur.
- **Recherche = point d'entrée n°1.** Résultat + explication de correspondance (`mode=explain`) + bouton « comment l'enregistrer → Guide/Wizard ».
- **Wizard = point de saisie.** À l'étape Catégorie il joue `getDefinitionsForCategory` (existant) **et** `getGuideForCategory` (nouveau) — l'encart Guide est donc toujours cohérent avec la feuille choisie.
- **Clôture de boucle.** Le formulaire propose « vérification guidée » : règles multi-champ (ex. filetage vs type de montage) côté client avec données serveur ; soumission TRPC → `invalidate()` sur les queries guides/articles concernées ; toast sonner.
- **Tests (à écrire en PHASE 3+) :** test ultime de flexibilité (nouvelle famille sans code ; nouvel attribut sans colonne SQL ; nouvel objet méter via modèle existant), non-régression seed (rejouable N fois, comptes stables), non-régression wizard/fiche (label outil, caracts article/variante), recherche explain.

---

## L. Plan d'implémentation par phases (proposition — à aligner sur l'ordre exact du prompt maître)

| Phase | Contenu | Livrable |
|---|---|---|
| **1 (faite)** | Audit + conception (ce document) | **A valider** |
| **2** | Modèle Guide : tables `guide_*` + colonnes optionnelles `attribut_definitions` + index ; types/validators | Migration + types (aucune casse des routes existantes) |
| **3** | Routeur `guide` (lecture) + bundle `getGuideForCategory` + `recherche.mode=explain` | API testée |
| **4** | Component `GuidePanel` générique + styles + états (loading/empty/erreur) | UI Guide réutilisable |
| **5** | Seed RÉFÉRENTIEL v2 : familles manquantes, `domaine`, `niveauOntologie` posés, gabarits complets (min/max/aide/exemples), incohérences FILETAGE levées | Table `categories`/`attribut_definitions` complétée (seed rejouable) |
| **6** | Seed DÉMONSTRATION étendue : ≥1 article abouti par famille majeure, complet (refs, compat, fournisseurs, lots, stock) | Bibliothèque d'exemples du Guide |
| **7** | Seed SCÉNARIOS enrichi + registre des anomalies intentionnelles | Dataset anomalies documenté |
| **8** | Intégration Guide/Wizard (étapes 2/3/4) + Guide/recherche (explain) | Parcours H1-H5 opérationnels |
| **9** | Qualité contrôlée : génération CAT-01, détection doublons (réf OEM/GTIN), orphelins sans article, rattachement | Dashboard qualité exploitable |
| **10** | Fiches types « Filtre à huile » et « Clé dynamométrique » en pur seed + tests | Familles de référence |
| **11** | Tests flexibilité + non-régression (rejouable, fichier, recherche, wizard) | Suite de tests verts |
| **12** | Build `@atelierone/nextjs` + graphify update + rapport phase | Validation finale |

Chaque phase est stoppable et rejoue sur le socle validé ; aucune ne touche les routes/UI P2/P3 ni ne renomme les colonnes existantes.

---

## VERDICT PHASE 1 & décisions à valider

Le socle et la plupart des briques existantes permettent 70–75 % des besoins (catégories, gabarits pilotés données, recherche multi-critères, stock/lots/outillage, seeds démo/scénarios). **Manquent réellement** : la taxonomie riche/cohérente, le modèle Guide, l'explication de recherche, la qualité contrôlée (CAT-01), les tests de flexibilité.

**Points de décision (bloquants pour la PHASE 2) :**
1. Officialiser `FOURNITURE` (+ `KIT`) comme `typeProduit` du modèle, ou migrer ceux de la base ?
2. Adopter les tables `guide_*` + 2 colonnes optionnelles sur `attribut_definitions` (recommandé), ou tout porter dans `attribut_templates`/jsonb ?
3. `domaine` : 2 valeurs (AUTOMOBILE/ATELIER) — OK ?
4. Faut-il conserver les codes courts existants (`G0101xx`, `DEMO-*`, `SCENARIO-*`) comme alias stables (recommandé) ?
5. `recherche.mode=explain` est-il prioritaire à la PHASE 3 ou après ?

**Phase suivante :** PHASE 2 — modèle de données Guide (migration + types) **après validation présente**.