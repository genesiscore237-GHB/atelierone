# SPEC — MODULE ARTICLES & CATALOGUE (Garage)

**AtelierOne — Garage Polyvalent Junior**
**Statut : document de référence — à valider avant implémentation**

---

## 0. Principe fondamental : ARTICLE ≠ VARIANTE

| Notion | Définition | Exemple |
|---|---|---|
| **ARTICLE** (produit conceptuel) | Le produit générique commercialisable | « Plaquette de frein avant » |
| **VARIANTE / SKU** | La référence réellement achetable, stockable, vendable | Bosch BP1234 · jeu de 4 · 45 000 F · stock 12 |
| **RÉFÉRENCES ÉQUIVALENTES** | Autres références du même groupe de compatibilité | OEM Toyota 90915-YZZD2 ≡ MANN W 712/95 ≡ Bosch … |

**Règle d'or : on ne crée jamais un nouvel article pour chaque variante.** Une pièce = un article ; N variantes selon marque / référence / position / conditionnement / véhicule. Le stock, les prix, les codes-barres vivent **par variante**.

---

## 1. Arborescence du référentiel

```
CATÉGORIE (13 familles, arborescentes)
   ↓
ARTICLE (produit conceptuel)
   ↓
VARIANTE / SKU (unité stockable)
   ├── marque, référence, conditionnement
   ├── prix achat / vente (facultatifs)
   ├── stock (par emplacement), unité, fournisseur
   └── n° série / lot (si suivi)
   ↓
RÉFÉRENCES ÉQUIVALENTES + COMPATIBILITÉS VÉHICULES
```

### 1.1 Les 13 grandes familles (déjà en base, seedé)

| Famille | Type | Sous-catégories (exemples) |
|---|---|---|
| Pièces mécaniques | PIECE | Filtration, Freinage, Suspension & Direction, Transmission, Courroies & Galets, Roulements, Refroidissement |
| Pièces moteur | PIECE | Distribution, Culasse & Soupapes, Injection & Allumage, Pompes, Joints |
| Électricité & Électronique | PIECE | Batteries, Alternateurs & Démarreurs, Allumage, Éclairage, Capteurs & Calculateurs, Faisceaux |
| Carrosserie & Tôlerie | PIECE | Éléments extérieurs, Rétroviseurs, Optiques, Calandres |
| Peinture & Préparation | CONSOMMABLE | Peintures & Vernis, Apprêts, Diluants, Mastics & Abrasifs, Polish |
| Lubrifiants & Fluides | CONSOMMABLE | Huiles moteur, Huiles transmission, Liquides, Climatisation, AdBlue, Graisses, Nettoyants |
| Pneumatiques | PIECE | Pneus tourisme, 4x4/SUV, utilitaires, poids lourds, Chambres & Valves, Kits de réparation |
| Jantes & Accessoires | PIECE | Jantes, Enjoliveurs, Écrous & Boulons, Entretoises |
| Consommables d'atelier | CONSOMMABLE | Fixations, Joints & Gaines, Abrasifs & Électrodes, Textiles |
| Outillage | OUTIL | À main, Spécialisé auto, Électroportatif, Pneumatique, Levage, Mesure & Contrôle, Diagnostic, Soudage |
| Équipements de garage | EQUIPEMENT | Levage, Diagnostic & Mesure, Air & Énergie, Nettoyage |
| Équipements de sécurité | EQUIPEMENT | EPI, Protection incendie, Premiers secours |
| Accessoires automobiles | PIECE | Essuie-glaces, Intérieur, Électronique embarquée, Éclairage LED |

> Le référentiel reste **extensible à la volée** (création de catégorie/famille depuis l'interface).

### 1.2 Les 4 types d'articles (+ service)

| Type | Stock ? | Particularités |
|---|---|---|
| **PIECE** (stockée) | Oui | Prix facultatifs, refs OEM, compatibilités véhicules, échange standard (core) |
| **CONSOMMABLE** | Oui | Consommé progressivement, unités (L/kg…), DLC, reconditionnable |
| **ÉQUIPEMENT / IMMOBILISATION** | Unité(s) | N° immobilisation, n° série, date/valeur d'achat, garantie, localisation, responsable, état, historique maintenance |
| **SERVICE** | Non | Aucun stock ; peut être lié à des pièces/consommables dans un OR |

---

## 2. Modèle de données

| Table | Rôle | Champs clés |
|---|---|---|
| `produit_articles` | **ARTICLE** conceptuel | code, designation, description, categorieId, typeProduit, imageUrl, isActive |
| `produits` | **VARIANTE / SKU** (l'unité stockable historique) | articleId→article, marque, referenceFabricant, refOem, codeBarre, codeArticle, conditionnement, prixAchat, prixVente, tva, fournisseurId, suiviSerie/suiviLot, typeOutil, numeroImmobilisation, etatEquipement, calibrable, compteComptable, centreDeCout, methodeValorisation |
| `categories` | Arborescence 3 niveaux | nom, code unique, parentId, typeBranche |
| `produit_references_equiv` | Références équivalentes | articleId, marque, reference, note |
| `compatibilites_produits` | Véhicules compatibles | articleId, marque, modele, anneeDe/A, motorisation, version, generation, carburant, cylindree, puissance, codeMoteur, transmission, position, refOem, refEquivalente |
| `article_attributs` | Caractéristiques dynamiques | articleId, cle, valeur, unite, ordre |
| `article_documents` | Documents liés | articleId, type, titre, url |
| `produit_unites` | Unités + conversions | produitId, uniteId, facteurVersBase, estUniteBase… |
| `stocks` / `mouvements_stock` | Stock par emplacement + traçabilité | produitId (=variante), emplacementId, quantite… |
| `stocks_lots` / `lots` | Lots, DLC | lotId, quantite, datePeremption |

**Méthode de valorisation** : `methodeValorisation` (CUMP par défaut / FIFO) + compte comptable + centre de coût par variante.

---

## 3. Écran « Enregistrer un article » — 8 blocs

### BLOC 1 — Identification
Référence interne/SKU · Désignation · Nom court · Description · **Catégorie (famille → sous-catégorie, avec recherche)** · Marque · Fabricant · Réf. fabricant · Réf. OEM · Réf. constructeur · Code-barres · QR Code · Photo · Statut (Actif / Inactif / Obsolète / Archivé).

### BLOC 2 — Gestion du stock
Stock actuel · Stock minimum · Stock maximum · Stock de sécurité · Point de commande · Quantité réservée · Quantité disponible · Quantité en commande · Quantité en réparation · Quantité bloquée · **Emplacement hiérarchique** (Magasin → Rayon → Étagère → Casier) → « Le filtre W 712/95 se trouve Magasin → R03 → E02 → C14 ».

### BLOC 3 — Unités et conditionnement
Unité de gestion (Pièce, Litre, kg, Rouleau, Jeu, Kit, Paire, Carton, Bidon, Boîte, Lot…) + **conversions** (1 carton = 12 bidons = 60 L ; 1 jeu = 4 plaquettes) — évite les erreurs de stock.

### BLOC 4 — Prix et achats
Prix achat HT/TTC · Devise · TVA · Frais transport/douane · Coût d'acquisition réel · Marge · Prix vente HT/TTC · Prix pro / particulier · Prix minimum · **Fournisseurs** (principal + secondaires, réf. fournisseur, dernier/moyen prix d'achat, délai, quantité min. de commande).

### BLOC 5 — Compatibilité automobile
Association article ↔ **1..N véhicules** : Marque, Modèle, Version, Génération, Années début/fin, Motorisation, Cylindrée, Carburant, Puissance, Code moteur, Transmission, **Position** (essieu avant…), + Réf. OEM, réf. constructeur, **références équivalentes**.

### BLOC 6 — Traçabilité
Selon le type : **N° série** (alternateurs, démarreurs, calculateurs, machines…) · **N° lot** (huiles, peintures, chimiques) · Date fabrication · Date expiration · Garantie (durée, début, fin, conditions, fournisseur d'origine) · Documents (facture, bon de livraison, certificat, fiche technique, manuel).

### BLOC 7 — Caractéristiques techniques (champs dynamiques par catégorie)
Le système propose les bons champs selon la famille :

| Famille | Champs affichés |
|---|---|
| Pneumatique | Largeur, hauteur, diamètre, indice de charge, indice de vitesse, type, saison, tubeless, runflat, DOT |
| Batterie | Tension, capacité Ah, CCA, polarité, technologie, bornes, dimensions |
| Huile | Grade SAE (5W-30), viscosité, type (synthétique…), norme API, norme ACEA, homologations constructeur, contenance |
| Filtre | Type, longueur, largeur, hauteur, diamètre, filetage |
| Bougie | Type, filetage, longueur filetée, taille clé, écartement électrodes, indice thermique, nb électrodes, technologie |
| Clé dynamométrique | Plage min/max (Nm), entraînement, précision, type |
| Pont élévateur | Capacité, hauteur de levage, nb colonnes, alimentation |

**Principe : jamais 100 champs inutiles** — un modèle de caractéristiques par famille, pré-remplissable, + lignes libres (clé/valeur/unité).

### BLOC 8 — Informations comptables et analytiques
Compte comptable · Famille comptable · Centre de coût · Catégorie de dépense · Type (Stock / Immobilisation / Consommable) · **Méthode de valorisation (CUMP / FIFO)** · TVA applicable · Article taxable/non taxable.

---

## 4. Fiche article — onglets

`Identification | Variantes | Stock | Compatibilité | Technique | Équivalences | Traçabilité | Documents | Comptable | Historique`

- **Variantes** : tableau des SKU (marque, réf., conditionnement, prix, stock, état) + bouton « Ajouter une variante ».
- **Compatibilité** : liste des véhicules + ajout.
- **Technique** : attributs dynamiques (presets par famille + lignes libres) + Enregistrer.
- **Équivalences** : références croisées (recherche magasinier par n'importe quelle réf. → retrouve l'article).
- **Documents** : fiche technique, manuel, certificat, facture, photos.
- **Historique** : mouvements de stock de toutes les variantes.

---

## 5. Règles métier (non négociables)

1. Un article = une fiche conceptuelle ; **aucun doublon** par variante.
2. Le stock, les prix et les codes-barres sont **par variante**.
3. La recherche fonctionne par : code article, code-barres, désignation, marque, réf. fabricant/OEM, **référence équivalente**.
4. Prix indicatifs sur la fiche ; **prix réel = ligne d'OR** (négociable par client).
5. Les attributs dynamiques sont liés à l'**article** (partagés par toutes les variantes).
6. À la création : article obligatoire, variantes facultatives (ajoutables ensuite).
7. Dans un OR, le réceptionnaire sélectionne **la variante exacte montée** → stock de cette variante décrémenté.

---

## 6. État actuel de l'implémentation

**Déjà fait (à valider) :**
- ✅ Tables : `produit_articles`, `produits.articleId`, `produit_references_equiv`, `compatibilites_produits` étendue, `article_attributs` (par article), `article_documents` (par article), colonnes comptable/équipement sur `produits`
- ✅ 13 familles + 66 sous-catégories seedées
- ✅ Backend `articles` : `listArticles`, `getArticle`, `createArticle` (+variantes), `addVariante`, `setAttributs`, `add/removeReferenceEquiv`, `add/removeCompatibilite`, `add/removeDocument`
- ✅ UI : liste des articles, « Nouvel article » (article + variantes), fiche article (variantes, compatibilité, technique avec presets, équivalences, documents)
- ✅ Vérifications : typecheck 257, build OK, tests API concluants

**Reste à faire (après validation) :**
- Bloc Stock complet : seuils multiples (min/max/sécurité/point de commande), quantités commandée/en réparation/bloquée, vue magasinier « où se trouve X »
- Bloc Prix avancé : prix pro/particulier/minimum, frais, coût d'acquisition réel, marge calculée
- Bloc Comptable complet dans le formulaire (compte, centre de coût, méthode) — champs présents en base, à brancher dans l'UI
- Unités & conversions : écran complet (déjà possible via produit_unites, à exposer)
- Historique de la fiche article (mouvements agrégés des variantes)
- Fiche variante (produit) : lien « voir l'article parent »
- Impression/PDF fiche article (facultatif)