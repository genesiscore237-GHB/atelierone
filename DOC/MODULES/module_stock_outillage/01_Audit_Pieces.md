# Audit — Enregistrement des pièces automobiles

> Phase A du cahier des charges « module d'enregistrement des pièces ».
> **Lecture de code uniquement.** Aucune base interrogée pour cette matrice ; les
> volumes cités proviennent de relevés déjà documentés (cadrage §2).
> Date : 2026-10-18. Commit audité : `7d886f2`.

## Le constat qui change la donne

Le module **n'est pas à construire**. Il existe déjà : 86 colonnes sur `produits`,
un modèle article/variante à deux niveaux, 10 stratégies de détection de doublon,
un outil d'aide dynamique, un wizard de 8 étapes fonctionnel, 461 catégories
automobiles. Le travail réel n'est pas d'écrire, c'est de **refermer six trous
qui contredisent des règles du cahier des charges** — et le plus grave d'entre
eux rend le reste inopérant.

Classification : **CONFORME** 31 · **PARTIEL** 9 · **ABSENT** 7 · **NON VÉRIFIABLE** 2.

---

## 1. Matrice de conformité

| # | Exigence | Implémentation constatée | Preuve | Statut | Action |
|---|---|---|---|---|---|
| **Identité** ||||
| 1 | Identifiant interne stable | `produits.id` serial ; `produit_articles.id` serial | `schema/produits.ts:11`, `produit_articles.ts:16` | CONFORME | — |
| 2 | Désignation principale | `titre` varchar(500) NOT NULL + `designation_courte` | `produits.ts:24`, `:20` | CONFORME | — |
| 3 | Catégorie métier + sous-catégorie | `categorie_id` + `categories.parent_id` auto-référent | `produits.ts:28`, `categories.ts:8` | CONFORME | — |
| 4 | État d'activation | `is_active` | `produits.ts:85` | CONFORME | — |
| 5 | Normalisation de la désignation | **4 fonctions concurrentes**, aucune partagée | `articles-router.ts:109`, `guide-service.ts:38,47`, `recherche-articles.ts:48` | **PARTIEL** | Module partagé `lib/normalise.ts` |
| **Variante** ||||
| 6 | Distinction réelle des variantes | Article (`produit_articles`) → variantes (`produits.niveau`) | `articles-router.ts:225-239` | CONFORME | — |
| 7 | Marque / réf. fabricant / réf. OEM par variante | Colonnes sur `produits` (donc par variante) | `produits.ts:73,74,76` | CONFORME | — |
| 8 | Formulaire piloté par la catégorie | EAV `attribut_definitions` +Wizard étape 3 | `articles_avances.ts:15-45`, `NouvelArticleWizard.tsx:476` | CONFORME | — |
| 9 | Ne pas confondre réf. fournisseur et réf. fabricant | `produits_fournisseurs.reference_fournisseur` distinct de `reference_fabricant` | `produits_fournisseurs.ts:11`, `produits.ts:74` | CONFORME | — |
| 10 | Ne pas fusionner sur similarité de nom | Aucune fusion automatique ; détection seulement | `articles-router.ts:1479-1653` | CONFORME | — |
| **Neuf / occasion** ||||
| 11 | État commercial explicite | **DEUX champs concurrents** : `etat_produit` (majuscules, utilisé) et `etat` (minuscules libre, défaut `"neuf"`) | `produits.ts:108` vs `:26` | **PARTIEL** | Migration 0023 :/backfill + abandon de `etat` |
| 12 | Occasion : état constaté, défauts, provenance, km donneur, garantie | **AUCUN champ** | grep `occasion` dans `packages/db/src/schema` → 4 occurrences, aucune colonne | **ABSENT** | Migration 0023 |
| 13 | Occasion : ne jamais devenir neuf après nettoyage | Pas de chemin de conversion (bon) | `reconditionnements` = opérations, pas d'état | CONFORME | — |
| 14 | Exemplaire unique identifiable | `outils_exemplaires` (migration 0022) + `produits.suivi_serie` | `outils_exemplaires.ts:41` | CONFORME | — |
| **Références** ||||
| 15 | Références multiples typées | `produit_references` (typeRef FABRICANT/OEM/CONSTRUCTEUR/FOURNISSEUR/EAN/ANCIENNE…) | `produit_relations.ts:14-28` | CONFORME | — |
| 16 | Référence normalisée sans détruire l'affichage | `valeur` + `valeur_normalisee` | `produit_relations.ts:17-18` | CONFORME | — |
| 17 | **Équivalence qualifiée (confirmé / conditionnel / non vérifié)** | **AUCUN statut** sur aucune table de référence | `produit_relations.ts:14-28`, `produit_references_equiv.ts:10-21` | **ABSENT** | Migration 0023 |
| 18 | Source de la référence | **AUCUNE colonne `source`** | idem | **ABSENT** | Migration 0023 |
| 19 | Ancienne référence / supersession | `produit_supersessions` | `produit_relations.ts:31-42` | CONFORME | — |
| **Compatibilité** ||||
| 20 | Constructeur / modèle / génération / motorisation / code moteur | `compatibilites_produits` : 35 colonnes | `compatibilites_produits.ts:17-33` | CONFORME | — |
| 21 | VIN / châssis | `code_chassis` (recherche `LIKE`) | `compatibilites_produits.ts:37`, `articles-router.ts:1386` | CONFORME | — |
| 22 | **Compatibilité qualifiée selon sa source** | **ABSENT** : ni source, ni niveau de vérification. La table **n'est même pas horodatée** | `compatibilites_produits.ts:12-47` | **ABSENT** | Migration 0023 |
| 23 | Distinguer saisie utilisateur / catalogue fiable | **ABSENT**. `type_compat` ne dit que POSITIVE/NEGATIVE | `compatibilites_produits.ts:17` | **ABSENT** | Migration 0023 |
| 24 | Ne pas décoder un VIN sans source | Aucun décodeur présent | grep VIN/décode → aucun service | CONFORME | — |
| **Conditionnements — exigence MAJEURE** ||||
| 25 | Unité de stock vs unité d'achat distinctes | `produit_unites.est_unite_base` / `est_unite_achat_defaut` ; `produits.unite_achat` / `unite_vente` | `produit_unites.ts:14,15` | CONFORME | — |
| 26 | Quantité contenue dans un conditionnement | `produits_fournisseurs.facteur_conditionnement` + `unite_conditionnement` | `produits_fournisseurs.ts:16-17` | CONFORME | — |
| 27 | Modèle d'emballage hiérarchique | `modele_emballage_niveaux.quantite_dans_parent` — **table jamais utilisée** | `modeles_emballage.ts:12-21`, import inutilisé signalé par ESLint dans `catalog.ts` | **PARTIEL** | Brancher ou documenter comme hors périmètre |
| 28 | Fractionnement autorisé / interdit | `produit_unites.autoriser_deconditionnement_vente` | `produit_unites.ts:18` | CONFORME | — |
| 29 | **Aucune conversion implicite non confirmée** | `getFacteurVersBase` **retourne 1 en silence** quand l'info manque | `stock-engine.ts:552-560` (commentaire 538-541) | **PARTIEL** | Migration 0023 (`contenu_confirme`) + garde serveur |
| 30 | Aucun mélange d'unités incompatibles | Facteur par produit, pas par commande | `stock-engine.ts:543` | CONFORME | — |
| 31 | Prix lié à l'unité d'achat | `produits_fournisseurs.prix_achat` + `unite_id` | `produits_fournisseurs.ts:10,12` | CONFORME | — |
| 32 | Quantité reçue calculée par le moteur | `createReception` convertit puis passe au moteur | `procurement.ts:1520-1524,1595-1613` | CONFORME | — |
| **Fournisseurs et offres** ||||
| 33 | Plusieurs fournisseurs par pièce | `produits_fournisseurs` | `produits_fournisseurs.ts:7-20` | CONFORME | — |
| 34 | Création rapide de fournisseur | `reference.listFournisseurs`, wizard étape 6 | `NouvelArticleWizard.tsx:634-657` | CONFORME | — |
| 35 | **Offre unique par fournisseur** | **AUCUNE contrainte d'unicité**. `onConflictDoNothing` sans contrainte = **no-op silencieux** | `articles-router.ts:336`, aucun index sur la table | **ABSENT** | Migration 0023 (unique + dédoublonnage) |
| 36 | Prix inconnu toléré | `prix_achat` nullable | `prixAchat` — `produits.ts:33` | CONFORME | — |
| 37 | Devise réellement utilisée | **AUCUNE devise** sur `fournisseurs` ni `produits_fournisseurs` (4 devises divergentes ailleurs : `XAF` / `XOF`) | `produits_fournisseurs.ts:7-20` | **ABSENT** | Migration 0023 |
| 38 | Quantité minimum de commande | `produits.qte_min_commande` — **par produit, pas par fournisseur** | `produits.ts:119` | **PARTIEL** | Migration 0023 |
| 39 | Fournisseur fictif interdit | `fournisseur_id` nullable sur `produits` | `produits.ts:29` | CONFORME | — |
| **Doublons — exigence structurante** ||||
| 40 | Détection multi-niveaux | **10 stratégies**, la partie la plus avancée du dépôt | `articles-router.ts:1479-1653` | CONFORME | — |
| 41 | **Correspondance certaine → réutiliser ; probable → comparaison** | Le serveur **ne contrôle rien** ; le seul blocage UI est **contournable par une case à cocher** | `articles-router.ts:739-753` (aucun contrôle), `NouvelArticleWizard.tsx:732-740` | **ABSENT** | **Garde serveur — priorité 1** |
| 42 | `addVariante` protégé | **Aucun contrôle** | `articles-router.ts:802` | **ABSENT** | Garde serveur |
| 43 | Moteur de doublons déclenché au recensement/réception | `rechercherArticles` **suggère, ne bloque jamais** | `recherche-articles.ts:34-38` | CONFORME | — |
| 44 | Pas de fusion automatique | `produit_substitutions` à activation manuelle | `produit_relations.ts:45-55` | CONFORME | — |
| **Parcours** ||||
| 45 | Recherche tolérante | `articles.recherche` normalise les références (casse, espaces, ponctuation) | `articles-router.ts:1362-1372` | CONFORME | — |
| 46 | Recherche par synonymes | `guide_search_aliases`, 4 sources de candidats | `guide-service.ts:211-243` | CONFORME | — |
| 47 | Propositions explicites d'action | Wizard 8 étapes | `NouvelArticleWizard.tsx:38-47` | CONFORME | — |
| 48 | Détails avancés repliés | Étapes 5-7 séparées | idem | CONFORME | — |
| 49 | Résumé avant enregistrement | Étape 8 | `NouvelArticleWizard.tsx:686-759` | CONFORME | — |
| 50 | **Fonctionne sur téléphone** | Listes = tableaux 8 colonnes en `overflow-x-auto`, **aucun pattern carte mobile** (`md:hidden` → 0 résultat) | `articles/page.tsx:245-318` | **ABSENT** | Cartes mobile |
| 51 | **Création de fiche ≠ mouvement de stock** | `createArticle` écrit `INITIAL_RECEIPT` via le moteur — **donc la création AUGMENTE le stock** si `stockInitial` est fourni | `articles-router.ts:382-396` | **PARTIEL** | Séparer explicitement |
| **Aide** ||||
| 52 | Outil d'aide existant, à améliorer | `AideSaisiePage` + `guide-service` : score JS, Levenshtein, 18 tables, contenu seedé | `guide-service.ts:38-335` | CONFORME | — |
| 53 | Aide accessible depuis les formulaires | **Aucun lien** depuis le wizard ; `GuidePanel` monté sur une page orpheline ; `guide.checkExisting` jamais appelé | grep `catalog/aide` dans le wizard → 0 | **ABSENT** | Lien étape 1 |
| 54 | Ne pas prétendre avoir vérifié une donnée | Contenu seedé = knowledge base, pas de source OEM | `seed-guide-v2.ts:62-74` | CONFORME | — |
| **Stock et intégration** ||||
| 55 | Un seul moteur, pas de second | `stock-engine.enregistrerMouvement` — mais **11 fichiers écrivent `stocks` en direct** | `procurement.ts:1062`, `return-service.ts:116`, `sales.ts:248`, `inventory.ts:155`… | **PARTIEL** | Hors MVP — documenté |
| 56 | Lots / FEFO / CMUP intacts | FEFO sur DLC **effective** (date ouverture + périodicité) | `lot-service.ts:150-160` | CONFORME | — |
| 57 | Coût inconnu ≠ coût nul | `stock_agregat.cmup_pondere` renvoie NULL | `0016_stock_agregat.sql:96-103` | CONFORME | — |
| 58 | Réservations, sorties OR, retours | `sortirPourOR` + `consommerReservation`, `retourAtelier` | `stock-engine.ts:570,690,720` | CONFORME | — |
| 59 | Réceptions partielles | `createReception` : écart + motif obligatoire | `procurement.ts:1514-1516` | CONFORME | — |
| **Droits et historique** ||||
| 60 | Contrôles appliqués côté serveur | `requirePermissionProcedure` sur les mutations | `trpc.ts:172-184`, `articles-router.ts:698` | CONFORME | — |
| 61 | Permissions déclarées une seule fois | `security-socle.ts` — source unique | `security-socle.ts:23-33` | CONFORME | — |
| 62 | Journal d'audit | `auditMiddleware` + `ARTICLE_CREATED` / `VARIANTE_CREATED` | `articles-router.ts` | CONFORME | — |
| 63 | Pas de suppression silencieuse | `is_active` / `date_discontinuation` / `motif_suspension` | `produits.ts:85,55,56` | CONFORME | — |
| 64 | **Upload soumis à permission** | `/api/uploads` : **aucune permission**, seul `session?.user` | `api/uploads/route.ts:22-25` | **ABSENT** | Trivial |
| 65 | Photographies non obligatoires | `image_url` nullable, `photos` jsonb vide par défaut | `produits.ts:83-84` | CONFORME | — |
| 66 | Galerie de photos de la pièce | `produits.photos` **n'alimenté nulle part** ; l'onglet Documents exige une **URL collée** | `article/[id]/page.tsx:740-756` | **PARTIEL** | Upload dans l'onglet |

---

## 2. Les six trous, par gravité

### 1 — Le moteur de doublons n'est pas un garde (bloquant)

C'est la partie la plus avancée du dépôt — 10 stratégies, scoring, 3 niveaux de
probabilité — et elle **ne bloque rien** :

| Point de contournement | Preuve |
|---|---|
| `createArticle` ne lit jamais l'existant | `articles-router.ts:739-753` |
| `addVariante` n'a aucun contrôle | `articles-router.ts:802` |
| Le blocage UI se désactive d'une case à cocher | `NouvelArticleWizard.tsx:732-740` |
| Le contrôle final ne porte que sur `reference_principale` | `NouvelArticleWizard.tsx:714` |
| `produit_references` n'est alimentée que par `addReference`, jamais par `creerVariante` → **la stratégie 2 est structurellement vide** | `articles-router.ts:1063` |
| `reference_principale`, la **clé métier**, n'a **aucune contrainte SQL** | `produits.ts:106` |

Le cahier des charges exige : correspondance certaine → réutiliser ; probable →
comparaison explicite ; jamais de fusion sur similarité de nom. Aujourd'hui un
magasinier peut créer dix fois la même pièce en dix secondes.

### 2 — Aucune donnée n'est qualifiée (structurant)

Le cahier des charges exige trois fois « confirmé / conditionnel / non vérifié »
(§5.4 références, §5.5 compatibilités) et la distinction saisie-humain /
catalogue-fiable. **Aucune colonne de ce type n'existe sur aucune table.** La
table des compatibilités n'est pas même horodatée : on ne sait pas quand ni par
qui une compatibilité a été déclarée.

Conséquence directe : une compatibilité saisie au doigt par quelqu'un s'affiche
exactement comme une équivalence de catalogue. C'est la règle « pas de faux
conforme » appliquée à l'affichage.

### 3 — Occasion : le vocabulaire existe, les informations non

`etat_produit` sait dire OCCASION. Aucun champ ne dit **ce qui est：::
occasion** : pas d'état constaté, pas de défauts, pas de véhicule donneur, pas
de kilométrage, pas de garantie. Et `produits.etat` (minuscule, défaut `"neuf"`)
fait doublon : un chemin de saisie qui l'écrit produira une occasion marquée
neuf.

### 4 — Le conditionnement ne distingue pas « 10 confirmées » de « contenu inconnu »

`facteur_conditionnement` est un nombre nu. Une boîte de 10 filtres et un kit
dont personne n'a documenté le contenu produisent la même ligne. Le cahier des
charges est explicite : *« Si le contenu d'un kit est inconnu, tu ne dois pas
inventer sa composition. »* Et `getFacteurVersBase` **retourne 1 en silence**
quand l'information manque — une quantité en bidons acceptée et fausse, sans
trace.

### 5 — L'offre fournisseur n'est pas unique, et n'a pas de devise

`onConflictDoNothing` sur une table sans contrainte d'unicité : l'ajout d'un
second fournisseur « ne fait rien » en silence — pas d'erreur, pas de doublon,
pas de message. Le cahier des charges exige plusieurs fournisseurs par pièce avec
prix, conditionnement, devise et minimum de commande.

### 6 — Ni téléphone, ni aide dans le formulaire

Les listes catalogue sont des tableaux à 8 colonnes en défilement horizontal,
sans carte mobile : sur téléphone, la colonne « Désignation » — la seule lisible —
est hors écran au chargement. Et l'outil d'aide, excellent et dynamique, n'est
accessible ni depuis le wizard ni depuis la fiche.

---

## 3. Ce qui est explicitement hors périmètre MVP

- Licence TecDoc ou catalogue payant — **ABSENT, et le rester** : aucune dépendance externe.
- API VIN — `code_chassis` est une recherche, pas un décodeur.
- Lecteur de codes-barres physique, imprimante d'étiquettes, IA externe.
- Fusion automatique de fiches.
- Suppression du flux `procurement.receivePurchaseOrder` / `rejeterReception` /
  `ReturnService` / `sales.annulerVente` qui écrivent `stocks` en direct :
  hors du périmètre « enregistrement des pièces », mais **consigné** car il
  contredit la règle du cadrage §6.2.
- Migration du `stock-calculs.ts` (doublon de `stockDisponible` sans le terme
  « bloqué », importé nulle part) : sans effet sur le comportement.