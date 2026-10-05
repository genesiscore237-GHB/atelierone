# SPEC MODULE 1 — CRÉATION D'ARTICLE COMPLÈTE (les 8 blocs)

**AtelierOne — Garage Polyvalent Junior**
**Statut : EN ATTENTE DE VALIDATION — aucune implémentation avant validation.**

---

## 1. Objectif

Remplacer l'actuel formulaire de création par un écran **complet, intelligent et progressif** capable d'enregistrer n'importe quel type d'article du garage (pièce, consommable, pneu, batterie, outil, équipement, service) en respectant la logique **ARTICLE → VARIANTES** : un produit conceptuel, plusieurs références réellement stockables, chacune avec son stock, ses prix, son conditionnement, sa traçabilité.

## 2. Parcours de création (3 étapes sur un seul écran défilant)

```
ÉTAPE 1 — L'ARTICLE (produit conceptuel)
   BLOC 1 Identification · BLOC 7 Caractéristiques · BLOC 5 Compatibilité · BLOC 8 Comptable
ÉTAPE 2 — LES VARIANTES / SKU (1 à N)
   BLOC 2 Stock · BLOC 3 Unités & conditionnement · BLOC 4 Prix & achats · BLOC 6 Traçabilité
ÉTAPE 3 — RÉCAPITULATIF & ENREGISTREMENT
   Aperçu + boutons « Enregistrer » / « Enregistrer et créer un autre »
```

**Répartition ARTICLE / VARIANTE** (principe fondamental) :

| Donnée | Portée | Exemple |
|---|---|---|
| Désignation, catégorie, type, description, photo, statut | **ARTICLE** | « Plaquette de frein avant » |
| Compatibilités véhicules, références équivalentes | **ARTICLE** | Toyota RAV4 2016-2018 |
| Caractéristiques techniques (attributs dynamiques) | **ARTICLE** | épaisseur 18 mm, position avant |
| Compte comptable, centre de coût, catégorie de dépense | **ARTICLE** | 6072 — Atelier |
| Marque, références, code-barres, conditionnement | **VARIANTE** | Bosch · BP1234 · jeu de 4 |
| Stock, seuils, emplacement, unités & conversions | **VARIANTE** | 12 · min 4 · Magasin 1/R03/E02/C14 |
| Prix, TVA, fournisseurs | **VARIANTE** | achat 30 000 · vente 45 000 |
| Traçabilité (série/lot/fabrication/expiration/garantie) | **VARIANTE** | lot L2026-08 · garantie 24 mois |
| Méthode de valorisation | **VARIANTE** | CUMP |

---

## 3. ÉTAPE 1 — L'ARTICLE

### BLOC 1 — Identification

| Champ | Saisie | Source / Options | Obligatoire | Règles & comportement |
|---|---|---|---|---|
| Désignation | Texte | — | ✅ | ≥ 2 caractères ; ex. « Plaquette de frein avant » |
| Nom court | Texte | — | — | 1 ligne pour les listes |
| Type d'article | Sélecteur boutons | Pièce détachée / Consommable / Outillage / Équipement / Service | ✅ | **Change tout l'écran** (voir §6) |
| Famille (catégorie) | **Recherche (SelectSearch)** | Catégories racines des 13 familles | ✅ si stocké | Filtre les sous-catégories proposées |
| Sous-catégorie | **Recherche (SelectSearch)** | Sous-catégories de la famille choisie | ✅ si stocké | Ex. Freinage → Plaquettes |
| Article (3ᵉ niveau) | Recherche (facultatif) | Catégories de niveau 3 | — | Dernier niveau du référentiel |
| Description | Zone de texte | — | — | Libre |
| Photo | Upload (multi) | /api/uploads | — | Miniature + galerie |
| Statut | Select | Actif / Inactif / Obsolète / Archivé | ✅ défaut Actif | — |

### BLOC 7 — Caractéristiques techniques (dynamiques)

Le bloc affiche automatiquement le **modèle de caractéristiques** correspondant à la sous-catégorie choisie, sinon une liste de modèles au choix, sinon des lignes libres (clé / valeur / unité).

| Modèle | Champs proposés |
|---|---|
| **Pneumatique** | Largeur (mm) · Hauteur (série) · Diamètre (″) · Indice de charge · Indice de vitesse · Type · Saison · Tubeless · Runflat · DOT |
| **Batterie** | Tension (V) · Capacité (Ah) · CCA (A) · Polarité · Technologie · Bornes · Dimensions |
| **Huile / fluide** | Grade SAE (5W-30) · Viscosité · Type (synthétique…) · Norme API · Norme ACEA · Homologations constructeur · Contenance (L) |
| **Filtre** | Type · Longueur · Largeur · Hauteur · Diamètre · Filetage |
| **Bougie** | Filetage · Longueur filetée (mm) · Taille clé (mm) · Écartement électrodes (mm) · Indice thermique · Nb d'électrodes · Technologie |
| **Clé dynamométrique** | Plage min (Nm) · Plage max (Nm) · Entraînement (1/4, 3/8, 1/2…) · Précision (%) · Type |
| **Cric** | Capacité (t) · Hauteur min (mm) · Hauteur max (mm) · Type · Poids · Norme |
| **Multimètre** | Tension max (V) · Courant max (A) · CAT rating · Précision · Type de mesure · Alimentation |
| **Pont élévateur** | Capacité (t) · Hauteur de levage (m) · Temps montée/descente · Nb colonnes · Alimentation |
| **Lignes libres** | Clé (texte) · Valeur (texte) · Unité (texte) — ajout/suppression de lignes |

Règles : les valeurs sont enregistrées par **ARTICLE** (partagées par toutes les variantes) ; on peut les modifier plus tard dans la fiche.

### BLOC 5 — Compatibilité automobile

Liste des véhicules compatibles + formulaire d'ajout :

| Champ | Obligatoire | Notes |
|---|---|---|
| Marque | ✅ | Toyota, Renault… |
| Modèle | ✅ | RAV4, Clio… |
| Version | — | Fini |
| Génération | — | — |
| Année début / fin | — | 2016 / 2018 |
| Motorisation | — | 2.0 essence |
| Cylindrée · Carburant · Puissance | — | — |
| Code moteur · Transmission | — | — |
| Position | — | Essieu avant / arrière |
| Réf. OEM / équivalente | — | Liée à cette compatibilité |

La même section gère les **références équivalentes** (groupe de compatibilité) : Marque + Référence (ex. OEM Toyota 90915-YZZD2 ≡ MANN W 712/95) — le magasinier retrouve l'article en cherchant n'importe laquelle.

### BLOC 8 — Informations comptables et analytiques

| Champ | Saisie | Obligatoire | Notes |
|---|---|---|---|
| Compte comptable | Texte (20) | — | Ex. 6072 |
| Centre de coût | Texte (60) | — | Ex. Atelier |
| Catégorie de dépense | Select | — | Stock / Immobilisation / Consommable (auto selon type, modifiable) |
| Article taxable | Checkbox | ✅ défaut oui | — |

---

## 4. ÉTAPE 2 — LES VARIANTES (1 à N)

Le formulaire propose **une carte par variante** avec bouton « + Ajouter une variante » et suppression (si > 1). Chaque carte contient les blocs 2, 3, 4, 6.

### BLOC 2 — Gestion du stock (par variante)

| Champ | Saisie | Obligatoire | Règles |
|---|---|---|---|
| Stock initial | Nombre | — | > 0 ⇒ emplacement requis ; crée un mouvement `ACHAT_RECEPTION` tracé |
| Stock minimum | Nombre | — | Alerte « stock bas » |
| Stock maximum | Nombre | — | Alerte « surstock » |
| Stock de sécurité | Nombre | — | ⚠️ **nouvelle colonne** `stock_securite` sur produits |
| Point de commande | Nombre | — | ⚠️ **nouvelle colonne** `point_commande` |
| Emplacement | Sélecteur hiérarchique **4 niveaux** : Magasin → Rayon → Étagère → Casier | si stock > 0 | Alimenté par `emplacements` (parentId) ; **création à la volée** d'un emplacement absent (code auto ZONE-ALLEE-RAYON-NIVEAU) |

Après enregistrement, l'écran affiche (lecture) : Quantité réservée · Disponible · En commande · En réparation · Bloquée (selon les données du moteur de stock).

### BLOC 3 — Unités et conditionnement (par variante)

| Champ | Saisie | Obligatoire | Règles |
|---|---|---|---|
| Unité de gestion (base) | SelectSearch | ✅ si stocké | Unités existantes : Pièce, Litre, Bidon, Carton, Boîte, Fut, Douzaine… + **seed complémentaire** : Kg, g, ml, Mètre, Rouleau, Jeu, Kit, Paire, Lot |
| Conditionnement | Texte | — | Libellé commercial : « jeu de 4 », « bidon 5 L », « carton 12×5 L » |
| Conversions | Éditeur de lignes : (Unité, Facteur → base) | — | Ex. Carton = 60 L ; Bidon = 5 L ; Jeu = 4 pièces. **Un stock est toujours exprimé en unité de base** ; les conversions évitent les erreurs de comptage |

### BLOC 4 — Prix et achats (par variante)

| Champ | Saisie | Obligatoire | Règles |
|---|---|---|---|
| Prix d'achat HT | Nombre | — | Facultatif (outils/consommables) |
| Prix de vente HT | Nombre | — | Facultatif ; indicatif — le prix réel est celui de la ligne d'OR |
| TVA % | Nombre | défaut 0 | — |
| **Marge** | Lecture calculée | — | (vente − achat) / vente, affichée en % |
| Prix professionnel | Nombre | — | ⚠️ **nouvelles colonnes** `prix_pro`, `prix_particulier` |
| Prix particulier | Nombre | — | idem |
| Prix minimum autorisé | Nombre | — | Existe (`prixMinimumVente`) — contrôle à la vente |
| Fournisseur principal | SelectSearch | — | Table `produits_fournisseurs` (estPrincipal) |
| Fournisseurs secondaires | SelectSearch multiple + lignes | — | Réf. fournisseur · Délai (j) · Prix d'achat · Unité |
| Quantité min. de commande | Nombre | — | ⚠️ **nouvelle colonne** `qte_min_commande` |

### BLOC 6 — Traçabilité (par variante)

| Champ | Saisie | Règles |
|---|---|---|
| Suivi par n° de série | Checkbox | Alternateurs, démarreurs, calculateurs, machines, outils électroniques |
| Numéro de série | Texte | ⚠️ **nouvelle colonne** `numero_serie` sur produits |
| Suivi par lot | Checkbox | Huiles, peintures, chimiques, consommables |
| Numéro de lot | Texte | ⚠️ **nouvelle colonne** `numero_lot` |
| Date de fabrication | Date | ⚠️ **nouvelle colonne** `date_fabrication` |
| Date d'expiration / DLC | Date (ou délai en jours) | `dlcJours` existe ; ⚠️ **nouvelle colonne** `date_expiration` |
| Garantie | Nombre de mois | `garantieMois` existe ; début = date d'achat, fin auto |

### Champs spécifiques selon le type (affichés dans la carte variante)

| Si type = OUTIL / EQUIPEMENT | Si type = SERVICE |
|---|---|
| Type d'outil : Individuel / Kit / Jeu / Machine | Durée estimée (h) |
| N° d'inventaire (auto : OT-000xxx) | Tarif |
| N° de série (suivi individuel) | Blocs Stock & Unités masqués |
| État : Neuf / Très bon / Bon / Moyen / Usé / Endommagé / Hors service | — |
| Soumis à calibration (checkbox) | — |
| Date d'achat · Valeur d'acquisition · Garantie | — |

---

## 5. ÉTAPE 3 — Récapitulatif & enregistrement

- Récap : article (désignation, catégorie, type) + N variantes (marque, réf., conditionnement, prix, stock initial, emplacement).
- Boutons : « Enregistrer » / « Enregistrer et créer un autre » / « Annuler ».
- Après succès : redirection vers la **fiche article** (Module 2).

---

## 6. Comportements dynamiques (résumé)

| Situation | Effet sur l'écran |
|---|---|
| Type = **Service** | Blocs Stock, Unités, Traçabilité masqués ; affiche Durée + Tarif |
| Type = **Outillage / Équipement** | Carte variante = « exemplaire » : type d'outil, état, n° série, calibration, achat/valeur ; prix facultatifs |
| Type = **Consommable** | Affiche DLC, lot, reconditionnable ; prix facultatifs |
| Type = **Pièce** | Affiche prix, compatibilités, échange standard (core) |
| Sous-catégorie = Pneumatique/Batterie/Huile/Filtre/Bougie… | **Pré-remplit le bloc Caractéristiques** avec le bon modèle |
| Service sélectionné dans l'article | La catégorie est filtrée sur les familles compatibles |

---

## 7. Règles de validation (à la soumission)

1. Article : désignation ≥ 2 caractères ; type requis ; catégorie requise si type ≠ SERVICE.
2. Variantes : au moins **marque OU référence fabricant** ; code-barres unique (généré si vide).
3. Stock initial > 0 ⇒ emplacement requis.
4. Prix de vente ≥ prix minimum (si renseignés) ; TVA 0–100.
5. Un outil (type OUTIL) : type d'outil requis sur chaque exemplaire.
6. Un article peut être enregistré **sans variante** (avertissement confirmé) — les variantes s'ajoutent ensuite depuis la fiche.

---

## 8. Données — tables et migrations

**Tables existantes réutilisées** : `produit_articles`, `produits` (+`articleId`), `categories`, `compatibilites_produits`, `article_attributs`, `produit_references_equiv`, `article_documents`, `produit_unites`, `produits_fournisseurs`, `stocks`, `unites_mesure`, `emplacements`.

**Migrations à ajouter (champs variante)** :
- `produits` : `stock_securite` (int) · `point_commande` (int) · `prix_pro` (numeric) · `prix_particulier` (numeric) · `numero_serie` (varchar) · `numero_lot` (varchar) · `date_fabrication` (timestamp) · `date_expiration` (timestamp) · `qte_min_commande` (numeric).

**Seeds complémentaires** :
- Unités : Kg, Gramme, Millilitre, Mètre, Rouleau, Jeu, Kit, Paire, Lot.
- Emplacements d'exemple : Magasin 1…4 (avec un rayon/étagère/casier chacun) pour la démonstration du sélecteur hiérarchique.

---

## 9. Backend — endpoints

| Endpoint | Action |
|---|---|
| `articles.createArticle` | **Étendu** : accepte les nouveaux champs variante (seuils, prix pro/particulier, série/lot, dates, qte min, fournisseurs secondaires, conversions) |
| `articles.addVariante` | **Étendu** : idem |
| `articles.updateVariante` | **NOUVEAU** : modification d'une variante existante (nécessaire pour corriger) |
| `articles.createUnite` | **NOUVEAU** : création d'unité à la volée (sinon le select reste sur le seed) |
| `articles.createEmplacement` | **NOUVEAU** (ou réutilisation de `stock.createEmplacement`) : création à la volée depuis le sélecteur hiérarchique |
| `articles.listUnites`, `listEmplacements` | Réutilisés (catalog/stock) |

Toutes les mutations : permission `stock.modifier` ; lectures : `stock.consulter` ; enveloppées en transactions ; mouvements de stock tracés via le moteur existant.

---

## 10. Critères d'acceptation (testables)

1. Création d'un article « Huile moteur 5W30 » avec 3 variantes (Total 1L, Total 5L, Motul 5L) : stocks initiaux distincts, conversions visibles, prix par variante.
2. Création d'un article « Plaquette de frein avant » avec 2 variantes (Bosch, Brembo) + compatibilité RAV4 + attributs (épaisseur, position) + réf. équivalente.
3. Création d'un outil « Clé dynamométrique FACOM 40-200 » avec 2 exemplaires (OT-00041, OT-00042) : états distincts, n° série, calibrable.
4. Création d'un service « Vidange » : aucun champ de stock affiché.
5. Aucune régression : recherche catalogue, mouvements, OR, bureau — typecheck 257, build OK.

---

## 11. Ce qui est déjà en place (réutilisé tel quel)

- Tables article/variante, attributs, équivalences, compatibilités, documents, 13 familles seedées
- Endpoints de base `articles.*`, uploads photos, moteur de stock (mouvements), permission `stock.modifier`
- La page actuelle de création sera **entièrement remplacée** par cet écran (pas de code jetable conservé inutilement)