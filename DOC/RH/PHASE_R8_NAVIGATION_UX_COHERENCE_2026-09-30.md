# PHASE R8 — NAVIGATION / UX / COHÉRENCE — RAPPORT DE PHASE (candidat GATE)

- **Ouverture :** 2026-09-29 — **Clôture à valider :** 2026-09-30
- **Domaine :** RH (Personnel) AtelierOne/GPJ — Next.js App Router + tRPC + Drizzle
- **Statut :** **VALIDÉE** (décision utilisateur 2026-09-30 — R8 = VALIDE, passer au STOP)
- Preuves détaillées : `audit/r8/r8-preflight.md` (inspection+carroyage), `audit/r8/r8-implementation.md`
  (corrections+preuves), `audit/r8/r8-model.md` (conventions), captures `audit/r8/fonctionnels/*.png`.

---

## 1. Rappels d'intention (§0)
Consolider la navigation et la cohérence du module RH à partir des fonctionnalités **réelles** R1-R7.
UN DOSSIER, UNE HISTOIRE, UNE SOURCE DE VÉRITÉ. Fiche employé = **hub contextuel**. Ne pas refaire de
domaine, pas de renommage massif, pas de refonte graphique/schéma, R9 interdit.

## 2. Périmètre exécuté (§1)
- Navigation cohérente & fiche employé hub contextuel
- Breadcrumbs, liste → fiche → retour, liens contextuels inter-modules
- Cohérence des libellés, des statuts R6, des actions/boutons, des états UX
- Recherche / filtres, deep-links, navigateur (back/forward/refresh), cohérence visuelle
- Périodes, KPI dashboard → écran, permissions de navigation, tenant, performance
- Matrice de cohérence §20, scénarios Playwright A-J §21, tests techniques §22, non-régression §23

## 3. Corrections livrées (§5-9)
1. **Permissions (bloquant)** : `rh.discipline.consulter` ajouté au socle DB + resynchronisé
   (`db:seed:socle` : 1 perm créée, 3 assoc.) ; matrice client RH complétée
   (`rh.discipline.consulter`, `rh.situation.consulter`, `rh.situation.modifier`,
   `rh.employe.sortie`, `rh.employe.reembauche`).
2. **Fiche employé / hub** : onglets URL-synchronisés (`?tab=` validé), refresh/back/forward conservés ;
   action rapide **Situation** ajoutée.
3. **Liste employés** : filtres `?statut`/`?type` réflétés dans l'URL ; stats cliquables.
4. **Contrats** : `?employeId=` filtre la liste + bannière « Effacer le filtre employé ».
5. **Documents** : idem + bannière.
6. **Situation RH & Paie** : lit et écrit `?employeId=`, présélection + analyse auto en deep-link,
   actions d'analyse cliquables (`<Link>`).
7. **KPI tableau de bord** : cartes navigables vers les écrans cibles.
8. **Annuaire** : « Ouvrir la fiche » par employé.

## 4. Tests (§21-22) — résultats
| Contrôle | Résultat |
|---|---|
| tsc filtre R8 | ✅ `R8_FILTER_CLEAN` (992 erreurs préexistantes inchangées, 0 nouvelle) |
| Vitest `src/server` (DB locale) | ✅ **527 / 529** — identique baseline R7 ; 2 échecs **PRÉEXISTANTS** (licence-service, stock-engine) |
| Playwright navigateur (Chrome, dev :3000) | ✅ **10/10** (A→J) |
| Matrice §20 | ✅ (r8-preflight §5) |
| Cohérence données/périodes/tenant | ✅ (aucun accès cross-tenant touché ; périodes inchangées) |

## 5. Matrice ✅ / ⚠️ / ❌ (§27)
| Domaine | Verdict | Commentaire |
|---|---|---|
| Navigation & deep-links | ✅ | A, B, C, E, F, G, H validés navigateur |
| Back / forward / refresh | ✅ | D, I validés |
| KPI → écran | ✅ | A validé |
| Permissions menu/page/action/API | ✅ | J validé après sync socle ; matrice OK |
| Cohérence libellés/statuts R6 | ✅ | Retours listes + tooltips assumés |
| Cohérence visuelle | ⚠️ | Bande nav secondaire dupliquée dans `main` → **reportée A1** (hors périmètre refonte) |
| Performance | ⚠️ | Compilation Next à la volée en dev (temps navigateur) ; non bloquant |
| Tenant isolation | ✅ | Intégration RBAC inchangée, aucun accès élargi |
| Recherche/états UX | ✅ | Filtres listes + empty/loading existants conservés |

## 6. Anomalies reportées (backlog, non bloquantes)
A1 — bande nav secondaire dupliquée dans `main` ; A2 — compteur « Congé » statique (assumé, tooltip) ;
A3 — fiches « sorti » en lecture seule (conforme R7) ; A4 — KPI simulations/périodes non contextualisées.

## 7. GATE R8 — 25 points
1. Fiche employé accessible comme hub depuis liste et annuaire ✅
2. Actions rapides de la fiche = liens réels (dont Situation) ✅
3. Onglets fiche reflétés dans l'URL et survivent au refresh ✅
4. Back/forward navigateur préservent fiche+onglet ✅
5. Liste employés : retour depuis fiche (breadcrumb) ✅
6. Liste employés : recherche texte présente ✅
7. Filtres statut/type reflétés dans l'URL ✅
8. Stats effectifs cliquables et cohérentes avec les filtres ✅
9. KPI dashboard → écran cible avec filtre ✅
10. Contrats : deep-link employé filtre la liste (bannière) ✅
11. Contrats : « Effacer le filtre employé » restaure la liste ✅
12. Documents : deep-link employé filtre la liste (bannière) ✅
13. Documents : effacement du filtre ✅
14. Situation : lit `?employeId=` (deep-link fiche→situation) ✅
15. Situation : écrit `?employeId=` à l'analyse (URL partageable) ✅
16. Situation : actions d'analyse cliquables (au lieu de `<span>`) ✅
17. Annuaire : accès fiche par employé ✅
18. Permissions UI/API cohérentes (ex. registre disciplinaire syncé) ✅
19. Socle & matrice client synchronisés (db:seed:socle) ✅
20. Aucun nouveau typecheck (tsc filtre R8 clean) ✅
21. Aucune régression vitest (527/529 = baseline) ✅
22. Playwright A-J verts (10/10) ✅
23. États UX (loading/empty/error/toast) respectés sur les écrans touchés ✅
24. Cohérence libellés/statuts R6 conservée ✅
25. Anomalies hors périmètre classées/documentées/reportées ✅

**→ 25/25.**

## 8. Décision attendue — STOP (§28)
Phase R8 prête pour validation finale. **Ne PAS commencer R9** tant que la décision STOP n'est pas rendue.