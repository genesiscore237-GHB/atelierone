# RAPPORT QA FINAL — MODULE 1 (Catalogue / Référentiel)

- **Date** : 2026-09-08
- **Build testé** : serveur ERP UP sur `http://localhost:3000` (agenceId=1, admin `admin@gpj.cm`), reconstruction `next build` + `next start` effectuée après correction.
- **Portée** : Catalogue & référentiel produits (articles, variantes, références, supersessions, équivalences, substitutions, compatibilités véhicule, positions, stock 6 états, emplacements/transferts, lots/FEFO, unités, fournisseurs, vérifier-avant-commande, kits, outillage/prêts, équipements, services, validations, sécurité, performance, intégrité, UI/responsive)
- **Corrections applicatives effectuées** : oui — les 5 anomalies identifiées lors de la recette ont été corrigées et re-vérifiées (détails §4 → §7).

---

## 1. Verdict unique

> ## 🟢 **MODULE 1 : PRÊT À LIVRER**

Recette fonctionnelle **162/162 (100 %)**, régression G4 **41/41 (100 %)**, UI catalogue **11/11**, responsive **15/15**, et login opérationnel au clic. Les 5 anomalies documentées initialement (3 données/stock, 1 login, 1 responsive) sont **corrigées et re-prouvées**. **Aucune réserve restante sur le périmètre du module 1.**

---

## 2. Matrice de résultats

| Campagne | Outil / script | Avant | Après |
|---|---|---|---|
| Recette fonctionnelle complète | `scripts/qa-module1-full.cjs` | **159 PASS / 3 FAIL / 98.1 %** | **162 PASS / 0 FAIL / 100 %** |
| Régression G4 | `scripts/test-module1-g4.cjs` | 41 PASS / 0 FAIL | **41 PASS / 0 FAIL** |
| UI Catalogue (formulaire wireframe) | `scripts/qa-catalogue-ui-m1.cjs` | 11 PASS / 0 FAIL | **11 PASS / 0 FAIL** |
| Responsive module 1 (3000) | `scripts/qa-responsive-m1.cjs` | 13 PASS / 2 FAIL | **15 PASS / 0 FAIL** |
| Login par clic (UI) | probe Playwright géométrie | BLOQUÉ (IMG 1440×900 intercepte) | **OK** (IMG 128×128, bouton cliquable) |
| Pages (HTTP 200 + HTML) | `qa-module1-full.cjs` (Ph. 28-30) | 10/10 PASS | **10/10 PASS** |

**Score agrégé pondéré : 100 % de PASS** sur la recette fonctionnelle ; régression G4 à 100 %.

---

## 3. Couverture fonctionnelle validée (PASS)

- **Référentiel** : articles PIÈCE/CONSOMMABLE/OUTIL/EQUIPEMENT/SERVICE, séparation de domaine stricte (validations croisées 400), attributs article/variante (positions GAUCHE/DROITE, prix achat/vente, TVA), persistance après relecture, upsert attributs.
- **Références** : add/list/remove, unicité `(variante_id, valeur)` respectée (doublon ignoré), une seule référence principale, restauration `referencePrincipale`.
- **Relations** : supersession (ancienne≠nouvelle, détection, affichée par verifierAvantCommande), équivalence (referencesEquiv + note GF5 fusion auto), substitution (avec protection auto-substitution), compatibilité véhicule + (recherche) / − (bloquée), années 2018-2022, moteur précis.
- **Doublons cascade** : exact, normalisé (espaces/tirets), insensible à la casse, inexistant sans faux positif.
- **Recherche 6 modes** : référence exacte, texte, position, marque, justification fournie, `stockDisponible` dans les résultats, aucun résultat, normalisation.
- **Stock 6 états** : physique/disponible/bloqué/réservé, pointCommande, **seuilAlerte exposé**, suggestion besoin (`besoinNet` = 50 pour besoin 250 sur stock 200), verifierAvantCommande (inutile / Commander N / Aucune référence).
- **Emplacements** : création, liste, **transfert API opérationnel** (stocks_unites alimenté par les entrées), 2e transfert suivi, mouvements tracés, stock global conservé.
- **Lots / FEFO** : création, `stockLots`, lot expirant présent, ordonnancement des dates de péremption.
- **Unités / fournisseurs** : ≥5 unités, création unité, listUnitesMesure, création fournisseur + rejet doublon.
- **Kits** : 2 composants, auto-composant interdit, doublon composant interdit, `listKits`.
- **Outillage / prêts** : niveau EXEMPLAIRE, typeOutil, prixVente null, prêt (décrément), double prêt refusé, retour (restauration stock), retour endommagé sans remarque → 400, `pretsEnCours`, `outillage.list`.
- **Équipements / services** : immo, état, pas de variantes pour l'équipement configuré en EXEMPLAIRE, service sans variantes + `addVariante` refusée.
- **Validations backend** : designation « A », tva 150, prixVente −100, FK inexistante, position invalide (enum).
- **Sécurité** : redirect 302 sans auth, tRPC sans auth refusé, XSS & injection SQL sans crash, IDOR inexistant → erreur explicite, permissions admin (51) cohérentes.
- **Performance** : tous les endpoints majeurs < 2 s (listArticles, recherche, getArticle, stockEtats, detecterDoublons, verifierAvantCommande).
- **Intégrité** : pas d'articles/mouvements/stocks/catégories orphelins créés par le script (les variantes orphelines sont pré-existantes, hors flux de recette).
- **Concurrence** : réservation 4/5 → dispo 1 ; sur-réservation parallèle bloquée (>=1 rejet) ; pas de double allocation ; libération → réserve 0.

---

## 4. Anomalies identifiées PUIS corrigées (avant → après)

### 4.1 🔴 CRITIQUE-bloquant — Conditionnement : perte de données → ✅ **Corrigé**
- **Avant** : valeur de `conditionnement` non persistée, API → `null` ; champ mappé sur `designationCourte`. Colonne absente de la table `produits` (Drizzle ignorait silencieusement la clé), `articles-router.ts:327`/`595` lus `produits.designationCourte`.
- **Correction** :
  - `packages/db/src/schema/produits.ts` : ajout de la colonne `conditionnement` (`varchar(200)`).
  - `ALTER TABLE produits ADD COLUMN IF NOT EXISTS conditionnement varchar(200)` appliqué sur `atelierone_erp`.
  - `articles-router.ts` (getArticle L327, getVariante L595) : `conditionnement: produits.conditionnement`.
- **Après** : `[PASS] Conditionnement persisté (colonne dédiée)` → `conditionnement="boîte de 4"` restitué.

### 4.2 🟠 MAJEUR — `seuilAlerte` persisté mais jamais exposé → ✅ **Corrigé**
- **Avant** : `seuil_alerte` = 5 en DB mais absent de `stockEtats`/`getArticle`/`getVariante`.
- **Correction** : `articles-router.ts` — `stockEtats` sélectionne et renvoie `seuilAlerte` ; `getVariante` sélectionne `seuilAlerte`.
- **Après** : `[PASS] seuilAlerte exposé par stockEtats`.

### 4.3 🟠 MAJEUR — Transfert de stock : échec systématique → ✅ **Corrigé**
- **Avant** : `stockInitial`/`ajouterStock` → `enregistrerMouvement` ne mettait à jour **que `stocks`**, jamais `stocks_unites` ; `transferer` lit `stocks_unites` → « 0 < 10 ».
- **Correction** : `stock-engine.ts` — option `synchroniserStocksUnites` sur `enregistrerMouvement` : upsert `stocks_unites` (produit/agence/unité) en plus de `stocks` (contrôle de non-négativité). Activée sur les **entrées** : `creerVariante` (stock initial, articles-router) et `ajouterStock` (stock). Les transferts/ventes (qui gèrent déjà les deux tables) restent inchangés.
- **Après** : `[PASS] Transfert créé via API (stocks_unites alimenté par les entrées)`, `[PASS] 2e transfert OK`, `[PASS] Stock global conservé (aucune perte)`, `[PASS] Mouvements transfert (>=2)`.

### 4.4 🔴 CRITIQUE — Page de login : logo plein écran bloquait tout clic → ✅ **Corrigé (environnement)**
- **Avant** : probe Playwright mesurait l'`IMG` du logo sur **1440×900** (toute la viewport) → bouton « Se Connecter » non cliquable.
- **Diagnostic** : **pas un défaut de source** — la page était servie **sans CSS** : le serveur `next start` (PID 12620) tournait sur une **version .next expirée** (BUILD_ID servi `WWG3DO6…` ≠ disque `wqRwxkpBdqxJ4Z-OlmxAO`, chunk CSS demandé `31a07baf…` inexistant → MIME `text/html`). Sans CSS, la classe `relative` (conteneur logo) n'était pas appliquée → le `fill` se résolvait contre l'ancêtre plein écran.
- **Correction** : reconstruction `next build` + redémarrage `next start`. Le conteneur logo (`relative mx-auto h-20 w-20 sm:h-32 sm:w-32`) est déjà correct dans la source.
- **Après** : probe géométrie → `IMG {x:656,y:155,w:128,h:128, container:relative}`, `elementFromPoint` au centre du bouton → `BUTTON` (cliquable).

### 4.5 🟡 MOYEN — Régressions responsive mobile (2 pages liste) → ✅ **Corrigé (environnement)**
- **Avant** : `/dashboard/catalog` overflow 123 px et `/dashboard/catalog/articles` overflow 85 px en mobile.
- **Diagnostic** : même cause racine qu'en 4.4 — build expiré ; la source contient déjà les conteneurs `overflow-x-auto` (`catalog/page.tsx:250`, `articles/page.tsx:43`…).
- **Correction** : reconstruction + redémarrage (idempotent).
- **Après** : `[PASS] MOBILE/TABLETTE/DESKTOP` × 5 pages = **15 PASS / 0 FAIL** (seuil overflow ≤ 4 px).

### 4.6 ℹ️ Information — hors périmètre (environnement)
- `scripts/test-responsive-pw.cjs` complet échoue en `fetch failed` car l'instance SaaS **`localhost:3001` est arrêtée** (+ crash libuv) : non lié au module 1. Le probe responsive rejoue sur la seule instance ERP (3000).
- Avertissement console résiduel : Google Fonts refusé par CSP (polices distantes) — cosmétique, sans impact fonctionnel.

---

## 5. Corrections applicatives (récapitulatif)

| Fichier | Modification |
|---|---|
| `packages/db/src/schema/produits.ts` | + colonne `conditionnement` (`varchar(200)`) |
| DB `atelierone_erp` | `ALTER TABLE produits ADD COLUMN IF NOT EXISTS conditionnement varchar(200)` |
| `apps/nextjs/.../articles-router.ts` | mapping `conditionnement: produits.conditionnement` (getArticle/getVariante) ; `seuilAlerte` exposé par `stockEtats` + `getVariante` ; `synchroniserStocksUnites: true` sur le stock initial de `creerVariante` |
| `apps/nextjs/src/server/lib/stock-engine.ts` | option `synchroniserStocksUnites` sur `enregistrerMouvement` (upsert `stocks_unites` + contrôle non-négatif) |
| `apps/nextjs/.../stock.ts` | `ajouterStock` active `synchroniserStocksUnites` |
| `scripts/qa-module1-full.cjs` | intitulés des assertions mise à jour (plus de mention « BUG »), Phase 16 étendue (2e transfert) |
| `scripts/test-module1-g4.cjs` | nettoyage : suppression de `stocks_unites` avant `produits` (FK) |

Typecheck : `npx tsc --noEmit` → **257 erreurs (baseline identique, aucune nouvelle)**. Build production : ✅ `next build` EXIT 0.

---

## 6. Preuves (logs, après correction)

| Fichier | Contenu |
|---|---|
| `apps/nextjs/qa-run11.log` | Run complet recette : **162 PASS / 0 FAIL / 100 %** |
| `apps/nextjs/g4-run.log` | Régression G4 : **41 PASS / 0 FAIL** |
| `apps/nextjs/probe-catalogue-m2.log` | UI catalogue : **11 PASS / 0 FAIL** |
| `apps/nextjs/probe-responsive-m2.log` | Responsive (3000) : **15 PASS / 0 FAIL** |
| probe géométrie login (session) | `IMG 128×128 container:relative`, bouton cliquable |
| `apps/nextjs/probe-catalogue-m1.log`, `probe-responsive-m1.log`, `overflow-dbg.log`, `dlg-diag2.log` | Probes « avant correction » (référence) |
| `apps/nextjs/qa-run9.log` | Run recette « avant » : 159 PASS / 3 FAIL / 98.1 % (référence) |

---

## 7. Conclusion

Le **Module 1 (Catalogue/Référentiel)** est **corrigé et re-vérifié** : recette complète **162/162 (100 %)**, régression G4 **41/41**, UI formulaire **11/11**, responsive **15/15**, login opérationnel au clic. Les 5 anomalies initiales sont résolues :
1. **Conditionnement** — colonne + mapping corrigés (plus de perte de données).
2. **seuilAlerte** — exposé par `stockEtats`/`getVariante`.
3. **Transfert stock** — les entrées peuplent `stocks_unites` ; transfert API opérationnel.
4. **Login overlay** — artefact de build expiré (CSS manquant) ; résolu par reconstruction.
5. **Responsive** — artefact du même build ; 15/15 après reconstruction.

Le module peut être **livré en production** pour son périmètre. Note d'environnement : l'instance SaaS (3001) reste arrêtée hors périmètre ; le serveur ERP (3000) doit être redémarré après un `npm run build` (toute reconstruction) pour servir le build courant.