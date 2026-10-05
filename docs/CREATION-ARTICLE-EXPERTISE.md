# Création d'un article — Description du système (pour expertise)

**Version :** 2026-09-11
**Périmètre :** tout ce qui touche à la **création d'un article** dans le module Catalogue : écrans (fenêtres), étapes, comportement selon le type de produit, enregistrement (backend), architecture des données et ontologie.
**Objet de l'expertise :** déterminer si le système est prêt à enregistrer *tout* type d'article d'un garage moderne (pièce détachée, consommable, outillage, équipement, service, fourniture, manuel/document, liquide, bidon/contenant, autre) et comment il est conçu/architecturé.

---

## 1. Vue d'ensemble de l'architecture

Le module est en 3 couches :

| Couche | Technologie | Fichiers principaux |
|---|---|---|
| UI (fenêtres) | React + Next.js App Router, Tailwind, sonner (toasts) | `apps/nextjs/src/app/(dashboard)/dashboard/catalog/…` |
| API métier | tRPC (`createTRPCRouter`) avec procédures par permission | `apps/nextjs/src/server/api/routers/articles-router.ts`, `catalog.ts` |
| Persistance | PostgreSQL + Drizzle ORM | schéma `drizzle` (`apps/nextjs/src/server/db/schema/…`) |

Règles transverses :
- **Permissions sincères** : toute mutation exige `requirePermissionProcedure("stock.modifier")`, toute lecture `requirePermissionProcedure("stock.consulter")`. L'UI masque ce qui est interdit (AGENTS.md).
- **Périmètre agence** : un article est créé pour l'agence de l'utilisateur connecté (`ctx.user.agenceId`).
- **Audit** : chaque action écrite dans `audit_logs` (ARTICLE_CREATED, VARIANTE_CREATED, STOCK_INITIALIZED…).
- **Interface : `alert()`/`confirm()` brut interdit**, feedback via `toast()` seulement.

---

## 2. Le parcours de création : un assistant (« wizard ») à 8 fenêtres

Chemin unique : `Catalogue → Articles → Nouvel article` → `/dashboard/catalog/article/nouveau`.
Composant : `NouvelArticleWizard.tsx`. Il s'agit d'un **assistant multi-étapes** (pas d'ancres, pas de tabs) : chaque étape est une « fenêtre » complète avec navigation **Précédent / Suivant**, récap final et un seul bouton de soumission « Créer l'article ».

### Étape 1 — Identification
- Champs : **désignation** (obligatoire, ≥ 2 caractères), **désignation courte**, **description**, photo/image (URL).
- **Type de produit** : sélecteur de 10 valeurs (voir §4).
- État (état produit par défaut) et **origine** : valeurs de référence `NEUF/OCCASION/RECONDITIONNE/REMANUFACTURE` et `CONSTRUCTEUR/OEM/AFTERMARKET/ADAPTABLE`.
- Enregistré côté serveur dans la table des articles (conceptuels) `produit_articles`.

### Étape 2 — Classification
- Arborescence 3 niveaux : **famille → sous-catégorie → niveau 3 (feuille)**.
- Les familles proposées sont filtrées par la **branche de type** de la catégorie (`compatible(typeBranche)`), et la feuille sélectionnée alimente l'étape suivante.
- **Contrainte forte : une catégorie est requise** (« Catégorie requise ») — ce n'est pas optionnel côté wizard, bien que le serveur accepte `categorieId` absent.

### Étape 3 — Caractéristiques (attributs communs de l'article)
- Lignes d'attributs générées à partir de l'**ontologie de la catégorie** (`getDefinitionsForCategory` → table `attribut_definitions`) : clé, label, unité, type (TEXTE/NOMBRE/ENUM/BOOLEEN…), bornes, options, portée COMMUNE.
- Chaque ligne peut prendre un **statut de valeur** : Renseigné / Inconnu / N.A.
- Saisie libre de lignes supplémentaires (« + ligne d'attribut »).
- Sélection manuelle d'un **gabarit** parmi 28 (`attribut_templates`, liste non filtrée) qui « patch » la grille.
- Les attributs sont enregistrés dans `article_attributs` avec toute leur **métadonnée** (recherchable, filtrable, comparable, provenance, source, niveauConfiance, preuve…) pour le moteur de recherche technique.

### Étape 4 — Variante & références
- **Une ou plusieurs cartes de variante** (`VarianteCard.tsx`) ; chaque variante contient :
  - **Identité** : marque, réf. fabricant, réf. OEM, code-barres, code article, désignation courte, **référence principale** (le code qui identifie la variante de façon unique), conditionnement.
  - **Attributs différenciants** (portée VARIANTE) — mécanisme prévu mais **constat d'échec** (voir §7-B).
  - Pour un niveau **EXEMPLAIRE** (outillage/équipement) : passage dans la section exemplaire (n° immobilisation, type d'outil, etat, calibrage…).
- Sous-blocs : **Références équivalentes** (marque + référence + note), masqués pour les exemplaires.

### Étape 5 — Compatibilité véhicule
- Lignes **POSITIVE / NÉGATIVE** structurées selon le standard **ACES** (année début/fin, make, model, submodel, moteur, motorisation, aspiration, chambre, dCC, dVB, qlY, note) — enregistrées dans `compatibilites_produits`.
- Masqué pour SERVICE, OUTIL, EQUIPEMENT ; **non masqué** pour les autres types (voir §7-B).

### Étape 6 — Fournisseurs & prix
- Par cartes : **fournisseur** (lien fournisseur), **prix d'achat**, **prix de vente**, **prix pro**, **prix particulier**, **TVA**, conditionnement, délai d'approvisionnement, fournisseur principal.
- La marge est **recalculée côté serveur**, jamais calculée à l'écran.
- Contraintes de vente validées à la soumission (prix plancher) — voir §5.

### Étape 7 — Stock & traçabilité
- Par cartes : **unité de stock** (base de mesures), **emplacement hiérarchique** (magasin → allée → zone), **stock initial** (uniquement si > 0), **seuil d'alerte**, **stock de sécurité**, point de commande, quantité min de commande.
- **Traçabilité** : **suivi lot / n° lot**, **suivi série / n° de série**, dates fabrication / expiration, **garantie (mois)**, **cœur (core / échange standard)**, positions véhicule (côté/essieu/zone/emplacement).
- L'ouverture de stock à la création écrit un **mouvement INITIAL_RECEIPT** (sens entrée) + création d'un `lots` et `stocks_lots` si suivi par lot.
- Masqué pour les exemplaires (leur stock suit la location).

### Étape 8 — Vérification (récap + enregistrement)
- Récap complet de l'article + cartes variantes et de leurs données.
- **Contrôle anti-doublon** : recherche dans la base par **référence normalisée** (minuscules, sans espaces ni ponctuation : `normaliserRef`) et par dénomination courte, multi-stratégies. Les candidats détectés sont listés et doivent être **confirmés** pour pouvoir créer.
- Bouton unique **« Créer l'article »** → appelle `createArticle` (transaction, voir §5).

---

## 3. Ce qui est réellement enregistré (contrat de données)

### 3.1 L'article conceptuel (`produit_articles`)
code auto-généré `ART-<6 derniers chiffres du timestamp>`, designation, designationCourte, description, categorieId, typeProduit, imageUrl, etatProduitDefaut, origineProduitDefaut, isActive.

### 3.2 La/les variante(s) (`produits`, niveau VARIANTE ou EXEMPLAIRE)
Champs acceptés par `VARIANTE_INPUT` :
- **Identité** : marque, referenceFabricant, refOem, codeBarre, codeArticle, designationCourte, conditionnement, referencePrincipale.
- **Prix** : prixAchat, prixVente, prixPro, prixParticulier, tva (0–100).
- **Approvisionnement** : fournisseurId, delaiApprovisionnement, conditionnement/facteur, fournisseur principal.
- **Stock** : uniteStockId, stockInitial, emplacementStockId, seuilAlerte, stockSecurite, pointCommande, qteMinCommande.
- **État/origine** : etatProduit, origineProduit, relationProduit (EQUIVALENT/SUBSTITUT/ECHANGE_STANDARD).
- **Positions véhicule** : positionCote (G/D/CENTRAL/LES_DEUX/NA), positionEssieu (AVANT/ARRIERE/NA), positionZone, positionEmplacement.
- **Traçabilité** : suiviSerie/numeroSerie, suiviLot/numeroLot, dateFabrication, dateExpiration, garantieMois, estCore.
- **Outillage/exemplaire** : typeOutil (INDIVIDUEL…), etatEquipement, calibrable, numero immobilisation.

### 3.3 Attributs techniques (`article_attributs`, `variante_attributs`)
`ATTRIBUT_INPUT` porte : cle, valeur, unite, typeAttribut, min, max, obligatoire, **searchable/filtrable/comparable**, liste (options), precision, uniteId, aide, statutValeur, provenance, source, niveauConfiance, sourceDate, sourcePar, preuve. Un ordre (ordinalité) est préservé.

### 3.4 Références équivalentes (`produit_references_equiv`)
marque, reference, note — dédupliquées (`onConflictDoNothing`).

### 3.5 Compatibilités (`compatibilites_produits`)
Clé étrangère article OU variante + le bloc ACES complet.

### 3.6 Traçabilité & audit
`lots`, `stocks_lots`, `mouvements_stock` (INITIAL_RECEIPT) et `audit_logs` pour toute action.

---

## 4. Adaptation aux 10 types de produit — ce qui est réellement automatisé

`typeProduit` accepte (client *et* serveur) : **PIECE, CONSOMMABLE, OUTIL, EQUIPEMENT, SERVICE, FOURNITURE, MANUEL, LIQUIDE, BIDON, AUTRE**, défaut `PIECE`.

L'adaptation d'interface ne suit que **3 profils** (logique dans `NouvelArticleWizard`/`VarianteCard`) :

| Profil | Types | Fenêtres/blocs adaptés |
|---|---|---|
| **VARIANTE** | PIECE, CONSOMMABLE, FOURNITURE, MANUEL, LIQUIDE, BIDON, AUTRE | stock, exclusivité, refs équiv., compat véhicule affichés |
| **EXEMPLAIRE** | OUTIL, EQUIPEMENT | ne pas stocker/mouvementer, masque stock, compat véhicule, refs équiv., conditionnement ; ajoute les champs d'outillage (n° immo, type, état, calibrage) |
| **SERVICE** | SERVICE | pas de classification, pas de variante requise ni de stock |

**Limites constatées (à porter à l'expertise)** :
1. Les 5 types étendus (FOURNITURE, MANUEL, LIQUIDE, BIDON, AUTRE) n'ont **aucune famille de catégories** : le filtre `compatible()` ne sert que les branches PIECE/CONSOMMABLE/SERVICE/OUTIL/EQUIPEMENT dans la base → étape 2 de mauvaise : liste de familles vide → création rendue **impossible** pour ces types (même si le serveur accepte l'enum).
2. Un SERVICE peut ajouter une carte « Variante » à l'écran, mais le serveur renvoie `BAD_REQUEST` (un service n'a pas de variantes) — comportement piégeux.
3. La liste/filtre du catalogue ne reconnaît que 4 types (`typeProduitEnum = ["PIECE","SERVICE","OUTIL","CONSOMMABLE"]`), incohérent ai les 10 choisis.

---

## 5. L'enregistrement côté backend (`createArticle`)

Procédure `createArticle` (transaction unique `db.transaction`) :
1. **Validation d'entrée** (zod) du payload complet + `superRefine` : si un **prix plancher** est défini, le prix de vente doit exister et lui être supérieur — sinon BAD_REQUEST avec message explicite.
2. **Garde métier** : `SERVICE` ne peut pas avoir de variantes.
3. **Insertion de l'article conceptuel** retournant son `id`.
4. Boucle sur les **variantes** → `creerVariante` (transaction imbriquée) : insertion variante, attributs VARIANTE, fournisseurs, puis **si stock initial > 0** : création `lots` (si suivi lot) + `stocks_lots` + mouvement `INITIAL_RECEIPT` (sens entrée) + audit `STOCK_INITIALIZED`. Récap `VARIANTE_CREATED`.
5. Boucle sur les **attributs d'article** (portée COMMUNE, `onConflictDoNothing`).
6. Boucle sur les **compatibilités** article.
7. Boucle sur les **références équivalentes** (dédupliquées).
8. **Audit** `ARTICLE_CREATED` avec détails du payload.
9. Retour : `{ articleId, variantesCrees, compatibilitesCrees, referencesEquivCrees }`.

Garde de cohérence type/structure (celle qui a fait échouer les tests réels) : un article **PIECE/CONSOMMABLE** ne peut pas recevoir de champs d'exemplaire (`typeOutil`, `etatEquipement`, `calibrable`, n° immobilisation) — erreur HTTP 400 « Une pièce/consommable ne peut pas avoir de champs d'exemplaire (outillage) ».

---

## 6. L'ontologie / les données de référence (seeds)

- **Arbre de catégories** (`categories`) : très fourni pour l'automobile — ex. famille « Pièces moteur (G01) » → « Filtres » → **Filtre à huile, Filtre à air, Filtre à carburant, Filtre habitacle / pollen, Filtre boîte auto, Filtre hydraulique** ; familles Allumage, Distribution, Freinage, Joints, Refroidissement, Admission, Échappement, Pneus, Huiles/lubrifiants… Le **Filtre habitacle / pollen existe déjà** (id 20).
- **Gabarits de caractéristiques** (`attribut_templates`, 28) : PLAQUETTE_FREIN, DISQUE_FREIN, **FILTRE_HUILE** (hauteur, diamètre extérieur, filetage, clapet anti-retour), **FILTRE_AIR** (longueur, largeur, hauteur, forme), HUILE (grade SAE, type, norme API/ACEA, homologations)…
- **Définitions par catégorie** (`attribut_definitions`, ~50) : reliées à des **catégories « démo »/clones** (PIECE_MECA, FILTRATION, HUILES, PNEUMATIQUES, FREINAGE…) et **pas aux feuilles réelles** G01/Filtres → l'étape 3 n'aide pas l'utilisateur sur l'arbre officiel.
- **Articles seed** : 83 au total, la plupart **sans catégorie** ou sous les catégories démo ; rien sous l'arbre « Filtres ».

**Point d'architecture clé à exposer à l'expert** : le modèle ontologique est en 3 plans (arbre catégories, gabarits de type fichier, définitions par catégorie) qui **ne sont pas connectés entre eux** (le wizard génère la grille depuis `attribut_definitions`, le « Template… » depuis `attribut_templates`, sans lien catégorie↔template).

---

## 7. Constats remontés des tests réels (à expertiser)

### A. Blocage d'expertise (P0)
La création effective d'un article **PIECE/CONSOMMABLE échoue systématiquement (HTTP 400)** : le wizard envoie les défauts d'exemplaire (`typeOutil:"INDIVIDUEL"`, `etatEquipement:"NEUF"`, `calibrable:false`) pour toute variante, sans garde côté UI (les gardes existent seulement en édition sur la fiche article). Résultat : **0 article créable aujourd'hui via l'assistant** — le banc de test « Filtre à huile moteur » a été bloqué à l'étape 8 avec payload et erreur capturés.

### B. Autres points
- **Attributs différenciants des variantes inopérants à l'écran** (filtre sur une clé vide : la ligne est invisible) — la création les transmettrait malgré tout.
- **Étape 3** : plusieurs lignes remplies mais un seul attribut réellement transmis (état de sélection non propagé) — constaté lors des tests.
- **Stock maximum** : la colonne `produits.stock_maximum` existe mais **aucun champ UI** ne l'alimente.
- **Exemplaires** : le contrat prévoit les champs d'outillage et le workflow de calibrage, fonctionnel côté serveur.
- **Latence/perf** : boucle de rerendu React « Maximum update depth exceeded » observée après l'échec de création.

---

## 8. Synthèse pour l'expert : le système est-il prêt pour « tout article de garage moderne » ?

**Ce qui plaide pour :**
- Modèle de données complet et moderne : article conceptuel / variantes / exemplaires, attributs techniques « recherche-transformés » (recherchable, filtrable, comparable, niveauConfiance, provenance), compatibilités véhicule au standard ACES, positions véhicule, traçabilité lot/série/core, garanties, unités de stock, emplacements hiérarchiques, prix multi-profils (pro/particulier/min plancher), références équivalentes multi-marques, audit de bout en bout.
- L'ontologie automobile est déjà riche (Filtres complets dont habitacle/pollen, huiles, pneus, freinage…). Les gabarits de type (28, dont FILTRE_HUILE/FILTRE_AIR) montrent une volonté de guider la saisie.
- Le fonctionnement est compartimenté : **interface (8 fenêtres) → API (transaction unique) → 14+ tables**, avec validation ZOD, permissions, toasts et invalidation — conforme à la charte UX du dépôt.

**Ce qui bloque :**
1. **Aucun article PIECE/CONSOMMABLE n'est créable** (bug de garde côté UI, §7-A) — porte d'entrée du module.
2. **5 des 10 types sont des impasses** (FOURNITURE, MANUEL, LIQUIDE, BIDON, AUTRE) : pas de familles de catégories, donc étape 2 = vide.
3. **Ontologie non reliée** : gabarits présents mais non déclenchés sur les feuilles réelles ; doublons de squelettes (G01 vs PIECE_MECA vs PIECE_MOTEUR).
4. Incohérences secondaires (SERVICE+variantes, filtres de liste 4 types, stock maximum orphelin, attributs variantes invisibles).

**Verdict provisoire à faire valider :** l'architecture est **conçue pour couvrir** toutes les familles d'un garage moderne (les 8 étapes et le modèle anticipe pièces, exemplaires, services, liquides, traçabilité…) mais la mise en œuvre comporte **une porte d'entrée cassée (P0)** et **5 types non câblés**, plus des **grains non liés dans l'ontologie** : ce sera « prêt » après correction des gardes UI (filtrage des champs d'exemplaire selon le niveau), création/raccordement des familles des types étendus, et connexion gabarits↔catégories.

---

## Annexe — chemins du code (références utiles pour l'expertise)

| Élément | Emplacement |
|---|---|
| Assistant 8 étapes, types, mapping envoi | `apps/nextjs/src/app/(dashboard)/dashboard/catalog/article/_components/NouvelArticleWizard.tsx` |
| Carte variante (sections identité/attributs/prix/stock/exemplaire) | `.../_components/VarianteCard.tsx` |
| Ligne d'attribut technique | `.../_components/AttributDefLigne.tsx` |
| Fiche article (édition/consultation) | `apps/nextjs/src/app/(dashboard)/dashboard/catalog/article/[id]/page.tsx` |
| API enregistrement (`createArticle`, `addVariante`, schémas) | `apps/nextjs/src/server/api/routers/articles-router.ts` |
| Liste/filtres catalogue, catégories | `apps/nextjs/src/server/api/routers/catalog.ts` |
| Ontologie (définitions par catégorie, gabarits) | `apps/nextjs/src/server/api/routers/ontology-router.ts` (et tables `attribut_definitions`, `attribut_templates`) |
| Schéma DB (Drizzle) | `apps/nextjs/src/server/db/schema/…` |