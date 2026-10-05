# Rapport intermédiaire — Audit P2/P3 Module 1 (Catalogue)

**Date :** 2026-09-11 · **Périmètre :** P2 (fiabilité affichage) + P3 (terminologie & cohérence taxonomique)
**Baseline validée :** socle PIECE → variantes → attributs → références → transaction → récupération → affichage (voir `RAPPORT_FINAL_MODULE1_CATALOGUE_2026.md`).

---

## A. Constats d'audit & corrections appliquées

| # | Constat | Verdict | Correction |
|---|---------|---------|------------|
| P2.1 | La fiche article ne montrait pas les attributs de la variante (le routeur `getArticle` ne ramenait pas `variante_attributs`), et l'onglet Identification mêlait article / références | **FAIL** | Serveur enrichi : `getArticle` renvoie les attributs groupés par variante. UI : onglet Identification affiche « Caractéristiques de l'article (communes à toutes les références) » (dès le premier rendu) ; onglet Variantes affiche « Caractéristiques propres à chaque référence » ; onglet Technique renommé « … — article (communes à toutes les références) » |
| P2.2 | Les déf. de type `NOMBRE` étaient rendues en `<input type="number">`, rendant impossible la saisie de valeurs techniques alpha-numériques légitimes (`3/4-16`, `M20x1.5`) | **FAIL** | `attribut-def-ligne.tsx` : les déf. numériques passent en `type="text"` + `inputMode="decimal"`. Aucun changement de modèle : `valeur` est déjà TEXT en base (la sémantique numérique reste portée par `type_attribut`) |
| P3.1 | L'étape 2 (SERVICE) n'expliquait pas pourquoi aucune catégorie n'est demandée | **FAIL** | Carte explicative affichée : « Un service … n'est **pas stockable** et n'a pas besoin d'être classé… » |
| P3.2 | La terminologie OUTIL/EQUIPEMENT restait « Variante » alors que le produit représente un MODÈLE + EXEMPLAIRES physiques | **FAIL** | Wizard : étape 4 intitulée « Exemplaires & références » (libellé du bouton, du stepper et du bouton retour) ; en-tête « Exemplaires physiques du modèle » avec hint explicite ; l'article affiche « MODÈLE », chaque ligne = un EXEMPLAIRE (n° inventaire / n° série, état, emplacement) |
| P3.3 | Orphelins taxonomiques : 4 articles OUTIL encore rattachés à la feuille `DEMO-OUTCLES` (id 1440) sous la racine 11 « Outillage » (masquée, `is_active=false`) | **FAIL** | Mapping corrigé vers l'arbre canonique G13 « Outillage d'atelier » : 569→305 (Clé dynamométrique), 580→308 (Meuleuse), 581→317 (Multimètre), 582→309 (Clé à chocs). Racine 11 conservée intacte (aucune suppression) |

---

## B. Preuves

### B.1 Non-régression — RUN `NRwx45ro` (tous PASS)
| Segment | Scénario | Résultat |
|---------|----------|----------|
| A | SERVICE (634) — banner étape 2, explication étape 4, 0 variante | create `200` `variantesCrees:0` |
| B | FOURNITURE (635) — type étendu sans catégorie | create `200` `variantesCrees:1` |
| C | OUTIL (636) — exemplaire « clé dynamométrique », catégorie 294 | create `200` `variantesCrees:1` ; payload `{typeOutil:"INDIVIDUEL", etatEquipement:"NEUF", calibrable:false, valeurAcquisition:45000, numeroSerie:"SN-NRwx45ro"}` |
| D | PIECE filtre (637) — statut N/A sur `type_filtre` | create `200` ; payload `type_filtre=/N_A` ; en base `statut_valeur='N_A', valeur=''` |

### B.2 Corrections P2 — RUN `P2mtwwrain` (article 633)
- **P2.2 (saisie technique)** : `filetage` de type NOMBRE accepte `3/4-16` dans le wizard ; payload & base : `variante_attributs` = `filetage=3/4-16` (RENSEIGNE). Affiché sur la fiche : `FILETAGE 3/4-16 mm`.
- **P2.1 (séparation article/références)** : fiche article 633 (PIECE filtre, catégorie 17) :
  - Onglet **Identification** : `CARACTÉRISTIQUES DE L'ARTICLE (COMMUNES À TOUTES LES RÉFÉRENCES)` + `TYPE_FILTRE SPIN_ON` visible au premier rendu.
  - Onglet **Variantes** : `CARACTÉRISTIQUES PROPRES À CHAQUE RÉFÉRENCE (VARIANTE)` avec FILETAGE `3/4-16 mm` et HAUTEUR par référence (V1 Denso 86 mm / V2 Mann 79 mm).
- En base : articles 633 (2 variantes), 634/635/636/637 (voir B.1) — niveaux et catégories conformes (`categorie_id` 17 / null / null / 294 / 17).

### B.3 Corrections P3 — vérifications UI
- **P3.1** : étape 2 SERVICE — `SERVICE_STEP2_HAS_EXPLAIN=true`, snippet « Un service (prestation, diagnostic, main-d'œuvre) n'est pas stockable et n'a pas besoin d'être classé… ».
- **P3.2** : étape 4 OUTIL — bouton étape 3→4 « Exemplaires & références » ; en-tête `4. EXEMPLAIRES PHYSIQUES DU MODÈLE` ; hint MODÈLE/EXEMPLAIRE ; compteur `EXEMPLAIRES (1)` ; badge « Exemplaire » sur la ligne.

### B.4 P3.3 — migration taxonomie (SQL appliqué)
```
MIGRATED 569 -> 305 (Clé dynamométrique)
MIGRATED 580 -> 308 (Meuleuse)      [Ponceuse d'atelier scénario]
MIGRATED 581 -> 317 (Multimètre)    [Multimètre d'atelier scénario]
MIGRATED 582 -> 309 (Clé à chocs)   [Dévireuse à chocs scénario]
ORPHANS_UNDER_ROOT11 = 0
```
Aucune donnée supprimée ; l'arbre G11 « Outillage » reste intact.

### B.5 Compilation
`npx turbo build --filter=@atelierone/nextjs` : **1 successful** (0 erreur TS).

---

## C. Verdict global

| Item | État |
|------|------|
| P1 (précédent rapport) | PASS ✓ |
| P2.1 affichage attrs variante / fiche | **PASS** ✓ |
| P2.2 saisie valeurs techniques alpha-numériques | **PASS** ✓ |
| P3.1 explication SERVICE étape 2 | **PASS** ✓ |
| P3.2 terminologie MODÈLE/EXEMPLAIRE | **PASS** ✓ |
| P3.3 rattachement orphelins OUTIL | **PASS** ✓ |

**Non-régression complète (A/B/C/D) : PASS.** Le socle de création n'est pas affecté.

---

## D. Tests non couverts / à approfondir
- **NOT TESTED** : rendu des valeurs en liste du catalogue (filtres de recherche sur `3/4-16`, `M20x1.5`) — dépend du module Catalogue (CAT-01/02).
- **NOT TESTED** : fiche variante individuelle (`/variante/[id]`) avec attrs mixtes ARTICLE vs VARIANTE — vérifié via fiche article, à étendre.
- **PARTIAL** : la feuille équipement → exemplaire (catégorie vides pour ÉQUIPEMENT) — voir G11 pour OUTIL demo.

## E. Hors périmètre de cet audit (conservé pour phases suivantes)
- CAT-00 : normalisation de la taxonomie G13 (codification G1301xx…), nettoyage des racines doublonnées (11 « Outillage » masquée, `Outillage collections`, G13 canonicalisé).
- CAT-01/02 : catalogue & références croisées, recherche, fiches variantes consolidées.
- Seed métier massif (fiabilisation des familles SUB vs L1/L2/L3, cohérence `code`/`parent_id`).

---

## Prochaine étape
Ce rapport étant livré, **STOP avant CAT-00** comme demandé : attendre la validation utilisateur avant d'attaquer la normalisation taxonomique (CAT-00) et le seed massif.