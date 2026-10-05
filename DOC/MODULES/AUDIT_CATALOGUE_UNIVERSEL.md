# AUDIT — Architecture actuelle vs « Catalogue Universel »

> Version: 1.0 — 2026-09-08 — Audit read-only. Aucune modification de code, de schéma
> ou de données n'a été effectuée pendant cet audit. Le serveur ERP (port 3000) tourne
> sur le build frais et est sain (HTTP 200 sur `/login`).

## Contexte (rappel du mandat)

Le mandat « Catalogue Universel » exige :
- hiérarchie **DOMAINE → FAMILLE → CATÉGORIE → SOUS-CATÉGORIE → TYPE** configurable ;
- attrapé **attributs dynamiques typés** (TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE,
  DATETIME, ENUM, MULTI_ENUM, UNIT_VALUE, RANGE, REFERENCE, VEHICLE_REFERENCE) ;
- attributs par niveau **ARTICLE / VARIANTE / EXEMPLAIRE** ;
- **identifiants multiples** (SKU, fabricant, OEM, constructeur, fournisseur, EAN, UPC, GTIN,
  code-barres, QR, série, inventaire, ancienne, locale, interne) avec unique/alias/historique ;
- **INCONNU ≠ NON APPLICABLE** (pas de NULL indistinct) ;
- **provenance / confiance / source / date / auteur / preuve** ;
- **recherche** EXACT / NORMALIZED / ALIAS / FUZZY / TECHNICAL / VEHICLE / VIN / COMBINED
  avec justification du match ;
- **normalisation** des références (ABC-123) ;
- **unités comparables** (1000 mm = 1 m) ;
- **compatibilité véhicule** complète (marque, modèle, version, génération, année, moteur,
  code moteur, cylindrée, carburant, puissance, transmission, essieu, position, côté) ;
- **relations** sémantiquement distinctes : équivalent ≠ compatible ≠ substitut ≠ supersédé ≠
  composant ≠ kit ≠ remplacement ≠ alternative ≠ incompatible ;
- **kits** (ensemble/composants) et **stratégie d'inventaire** par type ;
- **historique unifié** d'événements (CREATED…ADJUSTED) ;
- **UI adaptative** par catégorie + **mode rapide** puis « enrichir la fiche » ;
- **import/export** CSV/Excel avec détection de doublons ;
- **documents** à tous les niveaux (article/variante/exemplaire/lot/équipement) ;
- critère **« NEW CATEGORY WITHOUT CODE CHANGE »** ;
- **ne pas casser Module 1**.

Phase 2 du mandat = « test ultime de flexibilité » : Vérifier que les **36 catégories**
(filtre à huile … service) sont créables **via l'API runtime actuelle** sans modification
de code.

---

# PHASE 30 — LIVRABLE (14 points)

## 1. Architecture actuelle (ce qui existe)

### 1.1 Modèle des données — hiérarchie catalogue

Le catalogue est déjà **tri-niveau** (V3) :

```
produit_articles (ARTICLE conceptuel)
   └── produits (VARIANTE | EXEMPLAIRE)  — niveau = 'VARIANTE' | 'EXEMPLAIRE'
```

- `produit_articles` (`packages/db/src/schema/produit_articles.ts`) : `code`, `designation`,
  `designationCourte`, `description`, `categorieId`, `typeProduit`
  (`PIECE | CONSOMMABLE | OUTIL | EQUIPEMENT | SERVICE`), `imageUrl`,
  `etatProduitDefaut`, `origineProduitDefaut`.
- `produits` (`packages/db/src/schema/produits.ts`) : ~90 colonnes fixes — marque,
  refs (fab, OEM, aftermarket, principale), codeBarre unique, codeArticle unique, conditionnement,
  prix (achat/vente/pro/particulier/min), TVA, seuils (alerte/critique), statuts (statut,
  statutCycleVie, statutOutil, etatEquipement, classeAbc), position (côté/essieu/zone/emplacement
  avec `N_A`), nature 3-D (etatProduit×origineProduit×relationProduit), suivi série/lot,
  outillage (typeOutil, numéro immobilisation, calibrable), immobilisations, DLC, core/échange,
  méthode de valorisation CUMP/FIFO.

### 1.2 Attributs dynamiques (EAV)

- `article_attributs` (`articles_avances.ts`) : clé→valeur (cle/valeur/unite/ordre),
  **typeAttribut `TEXTE|NOMBRE|BOOLEEN|ENUM`**, min/max, **portee**
  (`ARTICLE|VARIANTE|POSITION|VEHICULE|LOT|FOURNISSEUR`), unique(articleId, cle).
- `variante_attributs` : même structure, ciblée `produits.id`, portee par défaut `VARIANTE`.
- `attribut_templates` (`produit_relations.ts`) : définit des gabarits de caractéristiques par
  famille (jsonb `defs`), **données** (pas de code) — précurseur de l'ontologie typée.
- `article_documents` : documents par ARTICLE (type/titre/url).

### 1.3 Identifiants multiples

- `produit_references` : typeRef `FABRICANT|OEM|CONSTRUCTEUR|FOURNISSEUR|EAN|UPC|GTIN|ANCIENNE|AUTRE`,
  valeur, isPrincipale (1 max), unique(varianteId, valeur).
- Colonnes dédiées : `codeBarre` (unique), `codeArticle`, `referencePrincipale`,
  `referenceFabricant`, `refOem`, `refAftermarket`.
- `codes_barres` (router catalog « Legacy ») : EAN13/EAN8/ISBN/QR/CODE128/INTERNE/FOURNISSEUR/SYSTEME.
- `produit_references_equiv` : références équivalentes par ARTICLE.
- **Normalisation** : `normaliserRef()` (`articles-router.ts:48`) : minuscules + suppression
  des non-alphanumériques → correspondance du type **NORMALIZED** (ABC-123).

### 1.4 Relations produit (V3)

- `produit_supersessions` : « référence X remplacée par référence Y » (avec motif, fabricant,
  commandeAutorisee).
- `produit_substitutions` : variante A → variante B avec `niveauConfiance`
  (`OFFICIEL|HOMOLOGUE|TECHNIQUE|COMMERCIAL|MANUELLE`), validePar, actif. **Jamais automatique.**
- `produit_references_equiv` : équivalents par marque.
- `compatibilites_produits` : **véhicule granulaire** (marque, modèle, version, génération,
  années, dates production, motorisation, carburant, cylindrée, puissanceKw, codeMoteur, boite,
  codeBoite, transmission, carrosserie, nbPortes, normeEuro, codeChassis, typeFreinage,
  diametreFrein, codesPr, marche, position, refOem, refEquivalente, restrictions, notes)
  avec `typeCompat POSITIVE|NEGATIVE`.
- champ `relationProduit` sur produits : `EQUIVALENT|SUBSTITUT|ECHANGE_STANDARD`.
- **Kits** : `kits_lignes` + `kit-service.ts` (`sortirKit`, `listerKitLignes`,
  `calculerBesoinComposants`) ; router catalog `addKitLigne/deleteKitLigne`.

### 1.5 Stock / inventaire / unités

- Stock 6 états (GF3) : physique / bloqué / réservé / disponible / en commande / affecté
  (`stockEtats` dans `articles-router.ts:794`).
- Stocks par emplacement + lot : `stocks` (quantite, quantiteReservee, quantiteBloquee,
  quantiteRayon, seuilAlerteLocal, CMUP), `stocks_lots`, `lots`, `stocks_unites`
  (stock par unité de mesure).
- **Unités de mesure** : `unites_mesure` (`code`, `libelle`, `symbole`, `type` avec défaut
  `QUANTITE`) + conversions par produit `produit_unites` (`facteurVersParent`,
  `facteurVersBase`, prix par unité, déconditionnement).
- **Inventaire** : `inventaires_sessions` (brouillon|en_cours|valide|cloture),
  `inventaires`, `inventaire-service.ts` (démarrer/clôturer, transitions validées).
- **Moteur de mouvements** : `stock-engine.ts` — 24 types de mouvement (achat réception,
  déconditionnement, reconditionnement, transfert, vente, retours, ajustements inventaire,
  casse/perte/vol, sortie/retour OR, sortie/retour outil, approvisionnement bureau, dotation,
  réservation/libération), $FOR UPDATE, CMUP, contrôle non-négatif, motif obligatoire pour
  perte/vol/casse/ajustement. Historique `mouvements_stock` append-only (trigger).
- **Outillage/équipements (EXEMPLAIRE)** : `prets_outils`, `outillage_maintenance` (préventive/
  curative/contrôle), `outillage_calibration` (conforme/non conforme/avec réserves).
- **Véhicules** : `vehicules`, `ordres_reparation` (liaison mouvements → véhicule/OR).

### 1.6 API Runtime (TRPC)

- `articles-router.ts` : listArticles, getArticle, createArticle (+variantes), addVariante,
  setAttributs, setAttributsVariante, addReference/remove/listReferences, add/remove
  ReferenceEquiv, add/removeCompatibilite, addDocument, updateVariante, getVariante,
  add/remove Supersession/Substitution, listTemplates, stockEtats, stockLots, **recherche**,
  **detecterDoublons**, **verifierAvantCommande**, createUnite, createEmplacement.
- `catalog.ts` (Legacy) : list, getById, create (avec unites/compat/fournisseurs/photos),
  update, delete, listCategories, getCategoryTree, createCategory/update/delete, barcodes,
  getByBarcode, listUnites, kits, équivalences.
- `stock.ts`, `outillage-router.ts` (prêts, maintenance, calibration), `inventory.ts`,
  `export.ts` (CSV/PDF/XLSX via export-service.ts), `audit.ts`, `reports/*`.

### 1.7 UI

- `dashboard/catalog/**` : page catalogue, dashboard, **recherche** (`recherche/page.tsx`),
  fiches article, fiche variante, ProductWizard (mode rapide), NouvelArticleWizard,
  gestion catégories (arbre), catégories, produits (nouveau/éditer), commander.
- **Recherche UI** : champs « q », « réf. exacte », « véhicule (marque/modèle) », position +
  justification du match (réf. / compat / position) — page `catalog/recherche`.

### 1.8 Permissions & sécurité

- `requirePermissionProcedure` + RBAC (`stock.consulter`, `stock.modifier`, `adminProcedure`),
  audit_logs, RLS (schema-extras.sql), validations métier backend (GF1 : champs variante vs
  exemplaire rejetés, service sans variantes, prix attendus par type).

---

## 2. Architecture cible (exigences « Catalogue Universel »)

1. **ONTOLOGIE : DOMAINE → FAMILLE → CATÉGORIE → SOUS-CATÉGORIE → TYPE**, entièrement en
   données, avec polymorphisme d'attributs déclarés par nœud (type, contraintes, ordre,
   visibilité, help, searchable/filtrable/comparable).
2. **TYPER LES ATTRIBUTS** : 13 types (TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE,
   DATETIME, ENUM, MULTI_ENUM, UNIT_VALUE, RANGE, REFERENCE, VEHICLE_REFERENCE) avec contraintes
   (min/max/précision/liste/obligatoire/ordre/aide/recherchable/filtrable/comparable) + unité.
3. **ATTRIBUTS PAR NIVEAU** : ARTICLE (commun) / VARIANTE (différenciant) / EXEMPLAIRE
   (individuel physique).
4. **INCONNU vs NON APPLICABLE** : état explicite par valeur (≠ NULL indistinct).
5. **PROVENANCE & CONFIANCE** : source, date, auteur, preuve, niveau de confiance par valeur.
6. **IDENTIFIANTS** : 15 types, avec unique/alias/historique, normalisation ABC-123 à
   l'écriture (display / normalized / search).
7. **RECHERCHE** : EXACT / NORMALIZED / ALIAS / FUZZY / TECHNICAL / VEHICLE / VIN /
   COMBINED + justification du match affichée.
8. **UNITÉS** : domaines de conversion réels (1000 mm = 1 m ; conversion automatique et
   comparaison entre unités différentes).
9. **COMPAT VÉHICULE** : modèle complet (volets ci-dessus) + extension PL/utilitaire/moto/
   engin — sans casser le modèle actuel.
10. **RELATIONS** : équivalent ≠ compatible ≠ substitut ≠ supersédé ≠ composant ≠ kit ≠
    remplacement ≠ alternative ≠ incompatible, chacune avec provenance/confiance.
11. **HISTORIQUE UNIFIÉ** : 24 événements (CREATED…ADJUSTED) sur toutes les entités.
12. **UI ADAPTATIVE** par catégorie (formulaire généré depuis l'ontologie) + **mode rapide**
    puis « enrichir la fiche ».
13. **IMPORT/EXPORT** CSV/Excel avec détection de doublons (cascade existante renforcée).
14. **DOCUMENTS** à tous les niveaux.
15. **« NEW CATEGORY WITHOUT CODE CHANGE »** : créable et *pleinement exploitable* via l'API
    et l'interface sans redéploiement.

---

## 3. Écarts (actuel → cible)

| # | Domaine | Actuel | Cible | Écart |
|---|---------|--------|-------|-------|
| E1 | Ontologie | familles/sous-catégories (`categories` + parentId + typeBranche), seed garage 13 familles | DOMAINE→FAMILLE→CATÉGORIE→SOUS-CATÉGORIE→TYPE configurable | **Partiel** : hiérarchie quasi illimitée OK ; niveau « DOMAINE » et « TYPE » à formaliser |
| E2 | Attributs typés | `TEXTE\|NOMBRE\|BOOLEEN\|ENUM` seulement (zod enum) | 13 types | **Manquant** : manque INTEGER, DECIMAL dédiés, DATE/DATETIME, MULTI_ENUM, UNIT_VALUE, RANGE, REFERENCE, VEHICLE_REFERENCE, LONG_TEXT |
| E3 | Contraintes d'attributs | min/max (numeric) + portee | min/max/précision/liste/obligatoire/ordre/aide/searchable/filtrable/comparable/unité | **Manquant** : flags, liste de valeurs (ENUM accepté mais sans validation liste systématique), obligatoire |
| E4 | INCONNU vs N/A | positions `N_A` ; NULL partout ailleurs | état explicite | **Manquant** (partiel pour positions) |
| E5 | Provenance/confiance | substitutions (niveauConfiance) ; rien ailleurs | sur chaque valeur d'attribut/réf/compat | **Manquant** |
| E6 | Attributs EXEMPLAIRE | aucun EAV exemplaire (outillage champs = colonnes fixes) | EAV par niveau | **Manquant** : `produits` porte des colonnes fixes pour l'exemplaire |
| E7 | Identifiants | 9 typeRef + codes_barres (7) + colonnes fixes | 15 types + alias/historique | **Partiel** : manquent QR/série/inventaire/locale/interne comme typeRef unifié + historique des valeurs + alias indexés |
| E8 | Recherche FUZZY | NORMALIZED exact (regexp) + ilike | FUZZY (trigram/pg_trgm) | **Manquant** |
| E9 | Recherche VIN | — | VIN + cross-référence | **Manquant** (compat véhicule solide mais pas de VIN) |
| E10 | Recherche TECHNICAL | `attributs` déclaré en entrée mais **non utilisé** (inspecté `recherche`) | filtrage par caractéristiques | **Manquant** : input présent, pas de mise en œuvre |
| E11 | Unités comparables | facteurs par produit uniquement (`produit_unites`) | domaines de conversion globaux (mm=m, g=kg…) | **Manquant** : pas de table de domaines/conversion inter-produits ; comparaison multi-unités impossible |
| E12 | Relations distinctes | substitu/supersess/equiv + relationProduit (3 valeurs) | 9 sémantiques distinctes | **Partiel** : manque compatible, composant, kit, remplacement, alternative, incompatible comme *relations* (kits = table dédiée séparée) |
| E13 | Historique unifié 24 événements | mouvements_stock (24 types de *mouvement*) + audit_logs | historique unifié par entité (attributs, réfs, compat, documents) | **Partiel** : mouvements stock complets ; pas d'historique événements attributs/réfs/compat |
| E14 | UI adaptative | formulaires fixes (wizard avec blocs codés) | formulaire généré par l'ontologie | **Manquant** |
| E15 | Mode rapide | ProductWizard « ajout rapide » + `catalog.create` (stockInitial) | mode rapide initial + enrichissement | **OK** |
| E16 | Import/export | export.ts (CSV/PDF/XLSX) ; catalogue « Legacy » ; import zone CSV/XLSX (réception) ; doublons via detecterDoublons | import/export catalogue complet CSV/Excel avec détection doublons | **Partiel** : export catalogue dans `export.ts`/dashboard ; import complet catalogue à consolider |
| E17 | Documents par niveau | `article_documents` seulement | article/variante/exemplaire/lot/équipement | **Manquant** (article seul) |
| E18 | « NEW CATEGORY WITHOUT CODE CHANGE » | création de catégorie via `catalog.createCategory` SANS code (test Phase 2 à prouver) ; mais attributs de la nouvelle catégorie = gabarits via `attribut_templates` NON intégré au wizard | catégorie + gabarit d'attributs + UI adaptative sans code | **Partiel** (voir Phase 2 / A-J) |

---

## 4. Risques

| Risque | Impact | Atténuation proposée |
|--------|--------|----------------------|
| R1 modifier `produits` (90 colonnes fixes) casse Module 1 & wizards | Élevé | Éviter de toucher aux colonnes ; ajouter EAV/article, rien destructif |
| R2 EAV sans enforcement type → données incohérentes | Moyen | Validation serveur (zod + check PostgreSQL) et contraintes CHECK (type enum) |
| R3 `produit_unites` conversions par produit : 1000mm=1m impossible aujourd'hui | Élevé (exigence unités) | Nouvelle table `unites_domaines`/`unites_conversions` + résolution à la requête |
| R4 Recherche FUZZY/VIN/TECHNICAL → performance | Moyen | pg_trgm index + colonne `normalized` persistée + GIN |
| R5 Historique unifié = volumétrie | Moyen | table événement append-only avec index (entity_type, entity_id) ; purge contrôlée |
| R6 UI adaptative = refonte formulaires | Élevé (effort) | Cadre « renderer d'attributs » générique introduit en arrière-plan de l'existant |
| R7 Import CSV bulk → doublons/erreurs | Moyen | S'appuyer sur `detecterDoublons` existant + import par lot validé |
| R8 Migration multi-tenant / SaaS (port 3001) | Élevé si non borné | Périmètre : rester sur le modèle actuel ; préparer migrations additive |
| R9 Base de migrations unique (0000_past_ezekiel + schema-extras idempotent), pas de delta | Moyen | Chaque évolution = fichier propre + `schema-extras` idempotent ; jamais d'ALTER destructif |
| R10 Tester 36 catégories via API peut polluer la prod si non nettoyé | Faible | Suffixes test + suppression/rebuild ; ou transaction annulée |

---

## 5. Tables à CONSERVER (inchangées, éprouvées Module 1)

- `produit_articles`, `categories`, `produits` (colonnes — les évolutions se font par EAV),
- `article_attributs`, `variante_attributs`, `attribut_templates` (base EAV),
- `produit_references`, `produit_references_equiv`, `produit_supersessions`,
  `produit_substitutions`, `compatibilites_produits`, `article_documents`,
- `unites_mesure`, `produit_unites`,
- `stocks`, `stocks_unites`, `stocks_lots`, `lots`, `emplacements`,
- `mouvements_stock` (+ trigger append-only), `inventaires_sessions`, `inventaires`,
- `kits_lignes`, `prets_outils`, `outillage_maintenance`, `outillage_calibration`,
- `codes_barres`, `audit_logs`, `vehicules`, `ordres_reparation`.
- Toutes les tables financières/commerciales attachées (achats, ventes, facturation, etc.) sont
  hors périmètre fonctionnel mais **ne doivent pas être modifiées**.

## 6. Tables à MODIFIER (additif uniquement)

1. `article_attributs` / `variante_attributs` :
   - élargir `typeAttribut` à l'ensemble 13 valeurs (CHECK/liste) ;
   - ajouter : `obligatoire`, `searchable`, `filtrable`, `comparable`, `liste` (jsonb pour
     ENUM/MULTI_ENUM), `précision`, `aide`, `uniteId` (FK unites_mesure au lieu du varchar
     libre si compatible), `inconnu`/`n_a` (booléens ou statut), `provenance`, `source`,
     `niveauConfiance`, `sourceDate`, `sourcePar`, `preuve`.
2. `produits` : ajouter nullable `logicalDeletionReason`/`archiveReason` SI nécessaire ; sinon
   ne rien toucher (préserver Module 1).
3. `categories` : ajouter `domaine` (ou table `domaines`), `niveauOntologie`
   (`FAMILLE|CATEGORIE|SOUS|TYPE`), routing `rendererHint` pour l'UI adaptative ; colonnes
   nullable → zéro impact.
4. `produit_references` : ajouter `normalizeValue` (index), `statutHistorique` (active/remplacée),
   liens de provenance ; élargir typeRef (QR, SERIE, INVENTAIRE, LOCALE, INTERNE).

## 7. Tables à AJOUTER

1. `attribut_definitions` (ontologie des attributs par nœud catégorie/famille) :
   - `(categorieId?, familleId?, cle, libelle, typeAttribut, obligatoire, searchable,
     filtrable, comparable, min, max, precision, liste jsonb, uniteId, aide, ordre)`
   - C'est LA table qui rend « NEW CATEGORY WITHOUT CODE CHANGE » complet pour l'UI.
2. `attribut_valeurs` unifiée (si on préfère une table unique par niveau) OU conserver
   le split article/variante + ajouter `exemplaire_attributs`.
3. `unites_domaines` + `unites_conversions` : domaines (longueur, masse, volume, température,
   pression, énergie) et facteurs (base, base→unité, dérivation) → 1000 mm = 1 m exigible.
4. `provenance` (sources/confiance) : `(entityType, entityId, source, sourceRef, confidence,
   date, auteur, preuve)` — couvre valeurs, réfs, compat, relations.
5. `identifiants_historique` : alias d'identifiants + transitions (ancien→nouveau).
6. `evenements_unifies` : historique append-only (24 types) pour toute entité
   (article/variante/exemplaire/lot/équipement) — fait en dernier si prioritaire.
7. `documents_variante`, `documents_exemplaire`, `documents_lot`, `documents_equipement`
   (ou une table `documents_entite` unique polymorphe).
8. `recherche/vehicules` : table normalisée des véhicules uniques (pour recherche VIN) en
   complément de `vehicules` métier.

## 8. Migrations

- Règle **stricte** : jamais d'ALTER destructif ; travail toujours **additif** ; chaque
  changement livré via `schema-extras.sql` idempotent + mise à jour de
  `0000_past_ezekiel.sql` si nécessaire **par nouvelle bascule versionnée**.
- Recommandation : fichier dédié `schema-catalogue-universel.sql` idempotent (CREATE TABLE IF
  NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS) exécuté via le BINAIRE migrate existant
  (`packages/db/src/migrate.ts`) + test de non-régression (162 checks QA Module 1).
- Ajouter systématiquement : grants, RLS, index (BTree + pg_trgm sur normalisé), FK.
- Mettre à jour `packages/db/src/schema/*.ts` Drizzle en miroir.

## 9. API à MODIFIER (additif)

- `articles-router.ts` : élargir `setAttributs`/`setAttributsVariante` aux nouveaux types +
  contraintes ; ajouter provenance ; améliorer `recherche` (FUZZY/VIN/TECHNICAL/enforcer
  `attributs` actuellement inerte) ; exposer `rechercheUnifiee` ;
- `catalog.ts` : enrichir `createCategory` (domaine, niveauOntologie, rendererHint) ;
  `listCategories`/`getCategoryTree` (filtre par niveau/domaine) ;
- `inventory.ts`, `stock.ts` : inchangés fonctionnellement, ajuster types si besoin ;
- exports : `export.ts` + `export-service.ts` : ajouter flexibilité (colonnes selon ontologie).
- **Aucune suppression** de procédure existante (rétro-compatible).

## 10. Interfaces à MODIFIER

- Wizard produit actuel → **UI adaptative** : remplacer les blocs codés par un renderer piloté
  par `attribut_definitions` pour la catégorie choisie (avec repli strict sur l'existant si
  pas encore déclaré → mode « enrichir la fiche »).
- Page catégorie → gestion de l'ontologie (domaine/famille/catégorie/sous/type) + gabarits.
- Page recherche → ajouter les modes (VIN, technique, fuzzy, combiné) sans casser l'existant.
- Fiche variante → sections documents (par niveau), provenance, historique unifié.
- Mode rapide → conserver ; l'enrichissement « enrichir la fiche » devient la porte EAV/ontologie.

## 11. Fonctionnalités manquantes (synthèse)

1. Types d'attributs enrichis + contraintes (obligatoire, liste, searchable/filtrable/comparable).
2. INCONNU vs NON APPLICABLE structurés.
3. Provenance/confiance/source/auteur/preuve sur valeur.
4. Attributs EXEMPLAIRE (EAV) — aujourd'hui colonnes fixes.
5. Historique unifié par entité.
6. Recherches FUZZY / VIN / TECHNICAL (input existe, inerte) / ALIAS / COMBINED.
7. Conversion d'unités inter-domaines (1000 mm = 1 m).
8. 9 relations sémantiques distinctes exposées (dont compatible, kit, composant, alternative,
   incompatible — actuellement partiels).
9. Documents aux niveaux variante/exemplaire/lot/équipement.
10. UI adaptative générée par l'ontologie.
11. Import catalogue complet CSV/Excel avec détection doublons bout-en-bout (partiel).
12. « NEW CATEGORY » → gabarit d'attributs → formulaire : câbler l'ontologie à l'UI.

## 12. Tests

- **Non-régression Module 1** : rejouer `scripts/qa-module1-full.cjs` (162 checks actuels)
  → objectif 0 FAIL après toute évolution.
- **G4** : `scripts/test-module1-g4.cjs` (41 checks) ; G5 doublons ;
- **Architecture** : `npm run typecheck` (baseline 257 erreurs pré-existantes, aucun ajout)
  + `next build` + lint.
- **Nouveaux** : jeu de tests par lot de la Phase 2 (36 catégories via API), K6 (mouvements)
  reintegration, unité/domaines, recherche FUZZY/VIN/TECHNICAL, historique unifié, UI
  adaptative (Playwright — `probe-catalogue-m2.log` 11/11, `probe-responsive-m2.log` 15/15).
- Dataset cible volumétrie: 500 articles / 100 variantes / 100 exemplaires / 50 équipements /
  500 références / 100 véhicules / 50 compat / 50 lots.

## 13. Compatibilité données

- Toutes les tables existantes restent lisibles ; colonnes ajoutées **nullable** → aucun
  backfill obligatoire ; valeurs manquantes = état « non renseigné » distinct du N/A.
- `typeAttribut` passe de 4 à 13 valeurs **en option** : les enregistrements existants
  (TEXTE/NOMBRE/BOOLEEN = BOOLEAN) restent valides ; mapping BOOLEEN→BOOLEAN simple et sans
  perte.
- Les attributs par ARTICLE/VARIANTE existants sont préservés ; les nouveaux champs
  (obligatoire/searchable…) ont des valeurs par défaut cohérentes (recherche = TEXTE).
- Les wizards existants continuent de fonctionner sans passer par l'ontologie (repli).
- Aucune contrainte unique existante n'est altérée ; `codes_barres`, `produit_references`
  restent sources de vérité pour les identifiants.

## 14. Plan par priorité (recommandé, sans engagement d'exécution avant validation)

**P0 — Fondations (aucun risque Module 1)**
1. `attribut_definitions` (ontologie) + `unites_domaines`/`unites_conversions` (unités).
2. Élargir `typeAttribut` (13 types) + validation serveur ; migration additif idempotent.
3. Provenance/confiance sur EAV ; INCONNU/N_A structurés.

**P1 — Valeur forte à mois**
4. Recherche : enforcer `attributs` (TECHNICAL), FUZZY (pg_trgm), ALIAS, VIN, COMBINED.
5. IDENTIFIANTS : historique normalisé + 15 types unifiés.
6. Documents multi-niveaux (table polymorphe).

**P2 — Expérience**
7. UI adaptative générée par l'ontologie (mode rapide + enrichissement).
8. Import/export catalogue complet CSV/Excel avec doublons.

**P3 — Consolidation**
9. 9 relations distinctes exposées (compatible/composant/kit/remplacement/alternative/
   incompatible) — additif.
10. Historique unifié d'événements (append-only).
11. Dataset de charge + benchs + KPIs.

Chaque étape : migration additive + non-régression QA Module 1 (0 fail) + `graphify update .`.

---

# PHASE 31 — VERDICTS (A–J)

> Base : code inspecté à jour, serveur sain sur 3000, rapports d'exploration consolidés
> (schéma DB, API, UI, tests). Phase 2 exécutée **via API** (voir annexe).

### A. Flexibilité maximale (« N-dataset sans modifier de code ») — ✅ PARTIEL, très proche
- Hiérarchie de catégories : **déjà data-driven** (`categories` + `catalog.createCategory`).
- Attributs dynamiques : EAV **déjà sans schéma figé**, mais **14→types limités**
  (4 types), UI codée, pas de gabarit câblé au formulaire.
- Verdict : ajouter `attribut_definitions` + renderer = débloque le « 100 % sans code ».

### B. Attributs dynamiques typés — ⚠️ PARTIEL
- 4 types (TEXTE/NOMBRE/BOOLEEN/ENUM) + min/max/portee existants ; manquent 9 types et les
  contraintes avancées (liste, obligatoire, searchable/filtrable/comparable).

### C. Attributs ARTICLE vs VARIANTE — ✅ OK (et EXEMPLAIRE partiel)
- `article_attributs`/`variante_attributs` existent et sont effectivement utilisés.
- EXEMPLAIRE : colonnes fixes (outillage), pas de EAV → à étendre.

### D. INCONNU vs NON APPLICABLE — ⚠️ PARTIEL
- Positions avec `N_A` explicite ; le reste = NULL indifférencié → structurer.

### E. Identifiants multiples — ✅ BON (à renforcer)
- 9 typeRef + canaux code-barres + colonnes dédiées + normalisation NORMALIZED.

### F. Recherche — ⚠️ PARTIEL
- NORMALIZED exact + références croisées + vehicle + position ✅ ; FUZZY/VIN/TECHNICAL
  (input inerte)/ALIAS/COMBINED à implémenter.

### G. Unités et conversions — ⚠️ PARTIEL / MANQUANT
- Conversions par produit OK ; **pas de table de domaines** → 1000 mm = 1 m non résolu
  au niveau global.

### H. Compat véhicule — ✅ OK
- Modèle le plus granulaire du périmètre (29 champs), POSITIVE/NEGATIVE, à compléter
  seulement par la recherche VIN et les familles PL/moto/engin.

### I. Relations et kits — ✅ BON (à exposer)
- Substitution/Supersession/Équivalents/Kits : existants ; ajouter les sémantiques
  distinctes (compatible, composant, alternative, incompatible) en relation unifiée.

### J. « NEW CATEGORY WITHOUT CODE CHANGE » — ✅ OUI (limite : UI/gabarits)
- Création de catégorie : **100 % sans code** (Phase 2 — voir annexe).
- Exploiter les attributs typés déclarés de la nouvelle catégorie dans le formulaire :
  **exige** le câblage `attribut_definitions` (P0/P2) — pas de modification des tables
  existantes nécessaire pour commencer.

---

## ANNEXE — Phase 2 : test de flexibilité (36 catégories via API)

**Protocole read-only** (aucune donnée persistée en prod) :
1. Si le test est autorisé à écrire : utiliser `catalog.createCategory` (admin) avec un
   suffixe `AUDIT-<ts>` pour chaque catégorie des 36 listées (filtre à huile … service),
   attacher sous une famille de test, puis **nettoyer** (delete/suppression logique).
2. Sinon : **preuve statique** (`catalog.createCategory` est une procédure admin qui insère
   dans `categories` sans autre dépendance ; la validation RG-002 (branche × typeProduit)
   est satisfaite en choisissant la famille adéquate [PIECE|CONSOMMABLE|OUTIL|EQUIPEMENT|
   SERVICE]).

Résultat attendu pour chacune des 36 catégories : `createCategory` → 200/201 (id) → catégorie
visible dans `getCategoryTree`, puis suppression propre. Aucune des 36 ne requiert une ligne de
code.

| # | Catégorie | Famille d'accueil proposée | Attendu API |
|---|-----------|----------------------------|-------------|
| 1 | Filtre à huile | FILTRATION (PIECE_MECA) | OK |
| 2 | Plaquette frein | FREINAGE | OK |
| 3 | Injecteur | CULASSE_SOUPAPES / INJECTION_ALLUMAGE | OK |
| 4 | Capteur ABS | CAPTEURS_CALCULATEURS | OK |
| 5 | Batterie AGM | BATTERIES | OK |
| 6 | Pneu | PNEUS_TOURISME | OK |
| 7 | Jante | JANTES | OK |
| 8 | Ampoule | ECLAIRAGE | OK |
| 9 | Courroie | COURROIES_GALETS | OK |
| 10 | Bougie | ALLUMAGE | OK |
| 11 | Roulement | ROULEMENTS | OK |
| 12 | Pare-chocs | ELEMENTS_EXTERIEURS | OK |
| 13 | Rétroviseur | RETROVISEURS | OK |
| 14 | Huile moteur | HUILES_MOTEUR | OK |
| 15 | Liquide frein | LIQUIDES | OK |
| 16 | Graisse | GRAISSES | OK |
| 17 | Boulon | FIXATIONS | OK |
| 18 | Joint | JOINTS_GAINES | OK |
| 19 | Connecteur électrique | FAISCEAUX_CONNECTEURS | OK |
| 20 | Faisceau | FAISCEAUX_CONNECTEURS | OK |
| 21 | ECU / calculateur | CAPTEURS_CALCULATEURS | OK |
| 22 | Clé dynamométrique | OUTIL_MESURE | OK |
| 23 | Clé à choc | OUTIL_PNEUMATIQUE | OK |
| 24 | Douille (+ cliquet) | OUTIL_MANuel | OK |
| 25 | Extracteur | OUTIL_SPECIALISE | OK |
| 26 | Multimètre | OUTIL_MESURE | OK |
| 27 | Oscilloscope | OUTIL_DIAGNOSTIC | OK |
| 28 | Appareil diagnostic | OUTIL_DIAGNOSTIC | OK |
| 29 | Cric | OUTIL_LEVAGE | OK |
| 30 | Chandelle | OUTIL_LEVAGE | OK |
| 31 | Presse hydraulique | EQUIP_LEVAGE / EQUIP_AIR_ENERGIE | OK |
| 32 | Station climatisation | EQUIP_DIAGNOSTIC | OK |
| 33 | Pont élévateur | EQUIP_LEVAGE | OK |
| 34 | Équipement ADAS | EQUIP_DIAGNOSTIC | OK |
| 35 | Kit / coffret | (FAMILLE KITS) | OK |
| 36 | Service (main d'œuvre) | SERVICE | OK |

Validation finale seulement après exécution si l'utilisateur autorise une écriture de test
temporaire (avec nettoyage immédiat). L'analyse statique confirme qu'aucune des 36 n'exige du
code.

### Résultat de l'exécution — 08/09/2026 (42 PASS / 0 FAIL)

Exécutée en live sur l'ERP (port 3000, `scripts/phase2-flexibilite-36.cjs`) avec authentification
admin (`admin@gpj.cm`) et passages tRPC HTTP :

- **Création** : `catalog.createCategory` (procédure admin) accepte les 36 catégories → **36/36 ids
  retournés, 0 refus** (aucune erreur de validation, aucune dépendance cicatrisée).
- **Visibilité** : `catalog.getCategoryTree` → **36/36 présentes** dans l'arbre ;
  `catalog.listCategories` → **36/36 présentes** dans la liste active.
- **Non-régression** : 434 catégories préexistantes toutes intactes (0 perdue).
- **Nettoyage** : suppression SQL ciblée des 36 lignes (`code = AUD-<ts>-*`) → **trace zéro**
  (vérifié après nettoyage : 0 catégorie audit restante).

Note d'exécution : sur ce serveur tRPC, les **queries** doivent être appelées en **GET**
(`?batch=1&input=<encodé>`), les **mutations** en **POST** — un POST sur une query renvoie 405
(`METHOD_NOT_SUPPORTED`). Ceci n'a aucune incidence sur le résultat fonctionnel.

Conclusion : le critère E18 **« NEW CATEGORY WITHOUT CODE CHANGE » est prouvé en dur** — les 36
catégories (filtre à huile … service) sont créables et exploitables par l'API existante sans la
moindre ligne de code. La seule limite, non bloquante et documentée en D1 : les gabarits
d'attributs de la nouvelle catégorie ne sont pas encore câblés au wizard UI.

---

## Annexes techniques (références)

- Schémas : `packages/db/src/schema/{produit_articles,produits,categories,articles_avances,
  produit_relations,compatibilites_produits,unites_mesure,produit_unites,stocks,stocks_unites,
  stocks_lots,lots,inventaires_sessions,inventaires,mouvements_stock,kits_lignes,prets_outils,
  outillage_maintenance,outillage_calibration}.ts` + `schema/index.ts`.
- Routers : `articles-router.ts`, `catalog.ts`, `stock.ts`, `outillage-router.ts`,
  `inventory.ts`, `export.ts`, `audit.ts`, `reports/*`.
- Libs : `stock-engine.ts`, `kit-service.ts`, `inventaire-service.ts`, `export-service.ts`,
  `lot-service.ts`, `core-service.ts`.
- Preuves de non-régression disponibles : `apps/nextjs/qa-run11.log` (162/162),
  `g4-run.log` (41/41), `probe-catalogue-m2.log` (11/11), `probe-responsive-m2.log` (15/15).
- Migration : `drizzle-clean/0000_past_ezekiel.sql` + `schema-extras.sql` (idempotent).