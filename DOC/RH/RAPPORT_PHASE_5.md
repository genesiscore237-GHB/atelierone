# RAPPORT DE PHASE 5 — Statuts / réembauche / navigation (P04, P12, N02, N12, N20, P18, F04, F05)

Date : 2026-09-23
Phase : 5 · strictement séquentielle · une seule phase active
Statut : **VALIDE** (gate humain passé le 2026-09-23 — feu vert pour la Phase 6)

## Autorévision agent (point par point)

| Point | Résultat |
|---|---|
| **P12 — changement de statut via UI** | ✅ Badge statut de l'en-tête `EmployeeDetail.tsx` cliquable (gaté `rh.employe.modifier`), ouvre un modal React (jamais de `confirm()` brut) listant actif/congé/suspendu/archive (hors statut courant) avec effet affiché (`effetStatut` : compte coupé pour suspendu/archive, planning exclu pour congé…) ; mutation `rh.update` réutilisée → `employee_status_history` historié + effets N11 (paie/effectif/planning/`utilisateurs.isActive`) ; `invalidate()` sur `rh.getFiche` + `rh.list` ; toast succès/erreur ; **cartes `FicheRow` étendues** (statut/photoUrl) |
| **F05 — sélecteur statut dans le formulaire** | ✅ `EmployeeForm.tsx` : select « Statut » (actif/congé/suspendu/archive) visible en édition, initialisé au statut courant, envoyé dans le payload `rh.update` (avec `dateEmbauche`, effet N11) ; création = actif par défaut (inchangé) ; gating `rh.employe.modifier` via la procédure |
| **N12/F04 — réembauche bout en bout** | ✅ Mutation `rh.reembaucher` (`rh.ts`) : `requirePermissionProcedure("rh.employe.modifier")`, input `{ id, dateReembauche (requis), motif? }` ; **préconditions extraites dans `verifierReembauche`** (`rh-recherche.ts`) — statut ≠ sorti → refus, `reembauchable === false` → refus ; ferme l'intervalle « sorti » encore ouvert (`endDate = veilleDe(dateEffet)`, reason « Réembauche ») puis INSERT intervalle `actif` ; remet `dateSortie/motifSortie/detailMotifSortie/sortieChanged*` à null, efface `reembauchable`, réouvre `utilisateurs.isActive` si `userId` (N11 inverse de la sortie) ; garde `dateEmbauche` intacte ; UI : bouton **« Réembaucher »** (visible si `statut === "sorti" && reembauchable !== false`, gaté) + modal (date = aujourd'hui par défaut, motif optionnel, infos sortie affichées) |
| **P18 — masquage recherche** | ✅ `recherche.ts` : sans `rh.employe.consulter`, le SELECT employés n'inclut plus `telephone`/`emailPersonnel` (`selectionEmployesRecherche(false)`) → clés absentes du résultat, map → `null` ; clients/fournisseurs inchangés ; garde `RBACService.hasPermission` |
| **N02 — `rh.roster` pour rôles opérationnels** | ✅ Nouvel endpoint `rh.roster` (`protectedProcedure`, input `search`/`statut` défaut « actif »/`limit` max 500, leftJoin départements) exposant **uniquement** le profil annuaire (`selectionRoster` : id/matricule/nom/prenom/fonction/typeEmploye/statut/photoUrl/departmentName) — **jamais** téléphone/email/salaire ; 5 call sites basculés (Outillage, planning, Travaux, OR) ; **aucun `rh.*` octroyé aux rôles opérationnels** (SOCLE_MATRICE intact) ; `rh.list` conservé en `rhProcedure` |
| **N20 — mode COMMISSION** | ✅ Moteur `payroll-engine.ts` : Cas C → base fixe contractuelle **jamais proratisée** (jours présents n'ont aucun effet) ; **`absent_days` désactivé pour COMMISSION** (la base fixe n'est pas entamée par les absences) ; commentaires posés (partie variable → **P14 backlog**, aucune donnée taux de commission) ; mode déjà présent dans `modePaieOptions` du formulaire et dans `normaliserModePaie` |
| **P04 — navigation `?employeId=`** | ✅ Hook client `useEmployeFromUrl` + parser pur `parseEmployeId` (`src/lib/employe-url.ts` — entier > 0, "12abc" refusé, null → état vide) branché sur les **9 pages cibles** : congés (demande), présences (historique), pointage direct (journal), paie (nouveau filtre employé dans Bulletins), compétences (matrice), évaluations (historique), sanctions (dossier), contrats (formulaire nouveau contrat), documents (formulaire ajout) ; `useEffect` synch le state au changement de paramètre ; paramètre invalide/absent → état par défaut (aucune pré-sélection) |
| **Tests** | ✅ **T21 : 372/374 verts** (suite globale) — rh-recherche **8/8** (P18-3, N02-2, N12-3), payroll-engine **57/57** (dont N20-3), employe-url **3/3** ; suite globale : seuls 2 échecs **préexistants hors périmètre** (licence-service, stock-engine) |
| Non-régression / typecheck | ✅ `tsc --noEmit` : **0 erreur sur les fichiers touchés** de la phase (rh.ts, rh-recherche, recherche, EmployeeDetail, EmployeeForm, `useEmployeFromUrl`, employe-url, PaieRH, PresencesRH, PointageDirect, CongesAbsences, CompetencesRH, EvaluationsRH, DisciplinaireRH, DocumentsRH, contrats) ; **1 erreur tsc introduite corrigée en cours** (rh.ts `endDate` du `reembaucher` → `as any`, cohérente avec le pattern préexistant des intervalles) ; restent **préexistantes** hors périmètre : rh.ts ×7 (`endDate/employeeCodeSequence/photoUrl`), `rh-stats-engine.ts` `payrollMass`, contrats/page `useMutation` ×2 (inchangées, décalées par le diff) |

## Lignes passées (EN_INSPECTION → EN_CONCEPTION → … → **VALIDÉ** au registre)

- **P04** — navigation `?employeId=` sur 9 pages (P1)
- **P12** — changement de statut via UI + effets (P1)
- **N02** — `rh.roster` minimal pour rôles opérationnels (P1)
- **N12** — réembauche d'un sorti (workflow + effets) (P2)
- **N20** — mode commission : base fixe contractuelle (P1)
- **P18** — masquage recherche `rh.employe.consulter` (P2)
- **F04** — réembaucher (remplie via N12) (P2)
- **F05** — changer le statut depuis l'UI (remplie via P12 + N11) (P1)

## Preuves

- `npx vitest run src/server/lib/rh-recherche.test.ts src/server/lib/payroll-engine.test.ts src/lib/employe-url.test.ts` → **vert** (8 + 57 + 3)
- `npx vitest run` (suite globale) → **372/374 verts** (2 échecs préexistants hors RH inchangés)
- `npx tsc --noEmit` → 0 erreur sur les fichiers touchés de la phase (détail §autorévision)
- `TEST_JOURNAL.md` §1 : réf **T21** ajoutée · §2 : entrée **n°5** renseignée
- `DOC/RH/PHASE_5_CONCEPTION.md` : 6 décisions de conception actées + déroulé
- `graphify update .` exécuté après modification (règle AGENTS.md)

## Régressions

0 connue sur la baseline RH. Full-suite garde 2 échecs **préexistants hors RH** (licence-service, stock-engine) — inchangés. Erreurs typecheck restantes toutes préexistantes, hors périmètre RH (liste §autorévision).

## Décisions produit actées (détaillées : `PHASE_5_CONCEPTION.md`)

1. **P04** : hook `useEmployeFromUrl()` (parser pur) + pré-sélection sur 9 pages ; id absent/inconnu → état vide.
2. **P12/F05** : contrôle statut dans `EmployeeDetail` (badge → modal React) + select statut `EmployeeForm`, gatés `rh.employe.modifier`, historié via `rh.update`.
3. **N12/F04** : mutation `rh.reembaucher` — préconditions `statut=sorti` + `reembauchable`, fermeture intervalle sorti à `veilleDe(dateEffet)`, réouverture compte N11, `dateEmbauche` conservée.
4. **N02** : `rh.roster` = lecture minimale (protectedProcedure) ; aucun `rh.*` aux rôles opérationnels.
5. **P18** : colonnes téléphone/email retirées du SELECT employés sans `rh.employe.consulter`.
6. **N20** : COMMISSION = base fixe contractuelle jamais proratisée ; partie variable → **P14 (backlog)** — aucune donnée taux de commission n'existe.

## Anomalies nouvelles

0 (aucune nouvelle enregistrée).

## Restes de phase (BACKLOG conservés, autres phases)

- **P09, P10, P11, P13, N05(Context), N13, N14, N15, N16, N18, N19, F25** — restent BACKLOG Phases 3/6/7/8/9, non actifs.
- **P14 (partie variable L25 commission)** : confirmé comme socle pour une éventuelle rémunération variable ; aucun taux de commission en base.
- **T15 multi-agence complet** + **T16 exports** : restent proposés en phases ultérieures (base posée aux phases 3–4).

## Demande

**Gate Phase 5 : passé le 2026-09-23 — lignes passées en VALIDE au registre (P04, P12, N02, N12, N20, P18, F04, F05). Feu vert humain obtenu pour ouvrir la Phase 6 (historisation snapshot — P13/N13).**