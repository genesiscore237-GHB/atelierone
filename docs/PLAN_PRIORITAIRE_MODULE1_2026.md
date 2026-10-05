# PLAN PRIORITAIRE MODULE 1 — cumulé (roadmap CAT-00/01/02 + Seed massif + Guide de saisie)

- **Date** : 2026-09-11
- **Statut** : les PHASES 2→12 du rapport `CONCEPTION_SEED_GUIDE_PHASE1_2026.md` sont conservées ; la roadmap antérieure « CAT-00 → CAT-01 → CAT-02 → stabilisation → seed massif » y est **fusionnée en PRIORITÉ 0** (avant le guide et le seed), selon le principe retenu : **stabiliser le moteur avant d'industrialiser les données**.

---

## Priorité 0 — Fondations & stabilisation du moteur (à faire avant le seed massif)

| Id | Travail | État/verdict |
|---|---|---|
| P0-1 | **CAT-00 — Navigation cible Catalogue/Stock.** Audit nav (`app-nav.tsx`) : module Catalogue complet (Articles, Outillage, Équipements[DEV], Services[DEV], Référentiel, Recherche) + module Stock. Ajout du lien « Vue d'ensemble » du catalogue. | ✅ exécuté (lien « Vue d'ensemble » ajouté en tête du module) |
| P0-2 | **Stabilisation moteur — officialiser `typeProduit`.** La base contient `FOURNITURE` (7 articles/7 produits) et `KIT` (1 produit) que les enums « officiels » n'exposent pas. → superset des enums tRPC (legacy `catalog.ts` + `articles-router`), commentaire schéma. | ✅ exécuté (enums superset, commentaire schéma) |
| P0-3 | **CAT-01 — Dashboard référentiel + qualité.** Déjà câblé: `catalogService.getCatalogueQualite` (TTL 10 min + advisory lock), `apercu` (compteurs + qualité + stock + outillage + répartition + activité), `qualiteDetail` (drill-down), page UI. Compléter : règle `ORPHAN_VARIANTE` (variantes/exemplaires actifs sans `article_id`) et intégration au score. | ✅ exécuté (règle + pénalité + drill-down + icône) — probe : 154 orphelins |
| P0-4 | **CAT-02 — Liste & recherche articles.** `catalog/articles?problem=` (filtres qualité), `articles-router.recherche` multi-critères (ref normalisée contient/exact, réf fournisseur, VIN, marque/modèle/motorisation, position, attributs). A vérifier à l'écran (recherche + états + toasts). | à vérifier (presque complet) |

## Priorité 1 — Guide de saisie intelligent (l'UI qui va servir le seed)

- PHASE 2 : tables `guide_*` + colonnes optionnelles `attribut_definitions` (modeleValeur, explication) — migration + types. ✅
- PHASE 3 : routeur `guide` (lecture) : `getGuideForCategory` (bundle) + `recherche.mode=explain`. ✅
- PHASE 4 : composant `GuidePanel` générique (cartes, étapes, règles, erreurs, exemples ; états loading/empty/erreur). ✅

## Priorité 2 — Seed métier massif (3 niveaux, appuyé sur le moteur stabilisé)

- PHASE 5 : Seed RÉFÉRENTIEL v2 — familles manquantes, `niveauOntologie` (FAMILLE/SOUS/TYPE) posé, `domaine` rempli, gabarits complets (min/max/aide/exemples), valeurs techniques (`3/4-16`). ✅
- PHASE 6 : Seed DÉMONSTRATION étendue — ≥ 1 article abouti par famille majeure (refs + compat + fournisseurs + lots + stock). ⏭️ existant couvrant (seed-demo : filtre à huile Mann 178 reprise comme exemple de référence du guide) ; extensions restantes à planifier
- PHASE 7 : Seed SCÉNARIOS enrichi + registre des anomalies intentionnelles. ⏭️ registre livré (`FICHES_TYPES_ET_REGISTRE_2026.md`) ; scénarios existants conservés

## Priorité 3 — Intégration, qualité & tests

- PHASE 8 : intégration Guide↔Wizard (étapes 2/3/4) + Guide↔Recherche (explain). ⏭️ `GuidePanel` prêt (composant réutilisable) ; branchement wizard volontairement différé (préserver le socle P2/P3 validé) ; `recherche` retourne déjà `explications[]`
- PHASE 9 : qualité contrôlée — origine `cat`-cohérente, doublons (réf OEM/GTIN), rattachement orphelins, dashboard exploitable. ✅ règle ORPHAN_VARIANTE + score (probe 154) ; doublons/GTIN suivis au registre
- PHASE 10 : fiches types « Filtre à huile » et « Clé dynamométrique ». ✅ (`FICHES_TYPES_ET_REGISTRE_2026.md`)
- PHASE 11 : tests flexibilité (nouvelle famille sans code ; nouvel attribut sans colonne SQL) + non-régression (seed rejouable, recherche, wizard, fiche). ✅ T1 « Pompe à eau » sans code PASS ; T2 seed rejouable PASS
- PHASE 12 : build `@atelierone/nextjs` + `graphify update` + rapport de synthèse. ✅ (2 builds verts ; rapport final livré)

## Liens
- Rapport de conception complet (A–L) : `docs/CONCEPTION_SEED_GUIDE_PHASE1_2026.md`.
- Rapport P2/P3 (socle validé) : `docs/RAPPORT_INTERMEDIAIRE_P2P3_MODULE1_2026.md`.
- Fiches types + registre : `docs/FICHES_TYPES_ET_REGISTRE_2026.md`.
- Rapport d'exécution : `docs/RAPPORT_FINAL_SEED_GUIDE_2026.md`.