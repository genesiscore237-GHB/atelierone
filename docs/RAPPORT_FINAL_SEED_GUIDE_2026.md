# RAPPORT FINAL — Seed Guide + Guide de saisie (exécution plan prioritaire, Module 1)

Date : 2026-09-11. Périmètre : « cumule tout, plannifie par priorité et exécute ».

## Exécuté (verrouillé)

**Priorité 0 — Fondations**
- CAT-00 : lien « Vue d'ensemble » du module Catalogue (`app-nav.tsx`).
- Stabilisation : `typeProduit` officialisé (superset tRPC : FOURNITURE, KIT, EQUIPEMENT) sur `catalog.ts` + `articles-router` + commentaire schéma.
- CAT-01 : règle **ORPHAN_VARIANTE** (détection + pénalité ×2 + drill-down + icône dashboard). Probe : 154 variantes/exemplaires actifs sans `article_id`.
- CAT-02 : filtres `FOURNITURE`/`KIT` ajoutés à la liste articles ; recherche multi-critères conforme (recherche, états, `explications[]`).

**PHASE 2 — Schéma guide** : tables `guide_categories, guide_steps, guide_rules, guide_examples, guide_common_errors, guide_search_aliases` + `attribut_definitions.modele_valeur/explication`. Migration idempotente `migrate-guide-saisie.ts` (sql applicatif, pattern repo). Schéma drizzle `schema/guide.ts`.

**PHASE 3 — Routeur guide** : `guide.getGuideForCategory` (bundle : chaîne, en-tête, définitions résolues, étapes, règles, erreurs, exemples, alias) + `guide.resolveAlias`. `explications[]` déjà servies par `articles.recherche` (= mode explain).

**PHASE 4 — GuidePanel** : composant générique (`components/catalogue/GuidePanel.tsx`) avec états loading/empty/erreur ; page de rendu `/dashboard/catalog/referentiel/guide/[id]`.

**PHASE 5 — Seed référentiel v2 + guide** (`seed-guide-saisie.ts`, rejouable) :
- `niveau_ontologie` FAMILLE/CATEGORIE/TYPE + `domaine` AUTOMOBILE/ATELIER posés sur les 461 catégories.
- 8 clés d'attributs enrichies (`3/4-16`, M18x1.5, SPIN_ON…).
- 4 en-têtes de guide, 4 étapes + 8 règles + 3 erreurs pour « Filtre à huile », 3 règles OUTILLAGE, 1 exemple de référence (Mann W712/92 / OEM 90915-YZZD1, produit 178), 8 alias vernaculaires.

**PHASE 9/10/11/12 — Qualité, fiches, tests, build**
- Registre des anomalies + fiches types : `docs/FICHES_TYPES_ET_REGISTRE_2026.md`.
- T1 flexibilité « Pompe à eau » créée **sans changement de code** puis résolue par le bundle → PASS. T2 seed rejouable (2nd run stable : steps 4, règles 8) → PASS.
- Build `@atelierone/nextjs` : **2 verts** (types + bundling), dont après GuidePanel/routeur.

## Vérifications run par run
- Migration guide : « 6 tables + colonnes » OK.
- Seed guide : « SEED GUIDE PHASE 5 : OK (idempotent) ».
- Bundle catégorie 17 : chaîne OK, en-tête OK, 8 définitions, 4 étapes, 8 règles, 3 erreurs, 1 exemple.
- Tests flexibilité : T1/T2 PASS.

## Volontairement différé (non requis au socle)
- Branchement GuidePanel dans le wizard : **reporté pour préserver le socle P2/P3 validé** ; le composant est prêt (intégration additive à faire plus tard, étape proposée).
- Seed démo/scénarios déjà couverts par l'existant ; extensions (GTIN, familles outliers) à planifier en sortie de Module 1.

## Fichiers clés
- Migrations/seeds : `packages/db/src/{migrate-guide-saisie.ts, schema-guide-saisie.sql, seed-guide-saisie.ts, schema/guide.ts}`.
- Backend : `apps/nextjs/src/server/api/routers/guide-router.ts`, `catalog-service.ts` (ORPHAN_VARIANTE).
- UI : `apps/nextjs/src/components/catalogue/GuidePanel.tsx`, page `referentiel/guide/[id]`.
- Docs : `PLAN_PRIORITAIRE_MODULE1_2026.md`, `FICHES_TYPES_ET_REGISTRE_2026.md`, `CONCEPTION_SEED_GUIDE_PHASE1_2026.md`.