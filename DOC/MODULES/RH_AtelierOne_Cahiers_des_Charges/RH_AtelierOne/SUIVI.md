# SUIVI DE DÉVELOPPEMENT — MODULE PERSONNEL (RH)

> Source : cahier des charges `RH_AtelierOne/` (index + 10 composantes).
> Ordre strict : une tâche validée avant la suivante. Non-régression avant/après.

## Règles de validation
- [ ] Fonctionnalité testée dans le navigateur (tous les états)
- [ ] Non-régression verte (`node apps/nextjs/scripts/non-regression.cjs`)
- [ ] Build Next.js OK
- [ ] Journal d'audit pour les actions sensibles
- [ ] Aucune constante métier dans le code (tout paramétrable)
- [ ] Documentation mise à jour

---

## RH-00 — Paramétrage RH central (P0, Fondations)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables de paramétrage (schéma drizzle : cycles, horaires, présence, congés, sanctions, jours fériés, général) | ✅ Validée | 7 tables créées en base (`hr_*`) ; non-régression 21/21 verte | `packages/db/src/schema/rh_parametrage.ts` ; db push (prompt contourné par SQL généré) |
| T2 | Seed des valeurs par défaut (garage : 7h30–18h, pause 13h–14h, samedi 7h30–12h) | ✅ Validée | Idempotent (2 agences) ; horaires ✓ (Lun–Ven 9h30, Sam 4h30) ; 7 congés, 5 sanctions, 6 fériés CM, séquence matricule 9009 ; non-régression verte | `packages/db/src/seed-rh.ts` + script `seed:rh` ; `process.exit(0)` ajouté (pool gardait le process vivant) |
| T3 | API tRPC (lecture/écriture des paramètres, permissions Directeur/RH, audit) | ✅ Validée | `rhSettings.getAll` 200 (cycles+schedules, présence, congés, sanctions, fériés, général) ; mutation OK (tolérance 10→5) ; audit auto tracé dans `audit_logs` ; non-régression verte | `src/server/api/routers/rh-settings.ts` (17 procédures) ; `as any` sur les valeurs (typage inféré cassé du schéma, convention projet) |
| T4 | Écrans de configuration (`/dashboard/rh/parametrage`) | ✅ Validée | 6 onglets (Cycles, Présence, Congés, Sanctions, Fériés, Général) ; affichage seed ✓ ; mutation tolérance 5→7→5 avec toast ✓ ; états loading/erreur ✓ | `rh/_components/ParametrageRH.tsx` (remplace le placeholder) ; type local `RhSettingsUI` (inférence tRPC dégradée) |
| T5 | Validation RH-00 (cas de test du cahier) + non-régression | ✅ Validée | Cas 1 cycle ✓ · Cas 2 tolérance → moteur ✓ · Cas 3 type congé créé/supprimé ✓ · Cas 4 férié ajouté/supprimé ✓ · Cas 5 préfixe/séquence ✓ ; build OK ; non-régression 21/21 | Base nettoyée (données de test supprimées) |

## RH-01 — Fiches Employés & Organigramme (P0)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Schéma : departments, positions, contract_types, employee_positions, employee_salary_history + 10 colonnes employes (civilite, lieu_naissance, urgence, department_id, position_id, work_cycle_id, manager_id, niu, notes) | ✅ Validée | 5 tables + 10 colonnes + FK vérifiées (psql) | `rh_employes.ts` + `employes.ts` étendus |
| T2 | Seed référentiels garage (7 départements, 11 postes, 6 types de contrat) | ✅ Validée | Idempotent 2 agences (14/22/12 lignes) | ajouté à `seed-rh.ts` |
| T3 | Router : matricule via RH-00 (préfixe+séquence), affectations (cycle/département/poste/manager), historiques auto (salaire, poste), CRUD référentiels, getFiche | ✅ Validée | Référentiels OK ; create → GPJ-2026-9010 (séquence RH-00) ; getFiche complet (cycle/département/poste/historiques) ; update salaire → 2 entrées historique ; manager invalide → BAD_REQUEST ; non-régression verte | `rh.ts` étendu (matricule via `hr_general_settings`, fallback max réel si séquence désynchronisée) |
| T4 | UI : fiche employé complète (Identité/Contrat/Hiérarchie/Historique) + liste enrichie (filtres) | ✅ Validée | Formulaire : civilité, lieu naissance, urgence, NIU, notes, section Affectation (département/poste/cycle/manager en selects API) ; filtre département dans la liste ; création E2E via UI (toast + base) ; typecheck OK | `EmployeeForm.tsx` + `EmployeesPageClient.tsx` enrichis |
| T5 | Organigramme (arbre hiérarchique) | ✅ Validée | `/dashboard/rh/organigramme` : 8 nœuds, dépliables, badges statut, départements ; cas 5 cahier (manager → arbre) OK | `rh/organigramme/page.tsx` + module ajouté au registre (Network) |
| T6 | Validation RH-01 (cas de test cahier + non-régression + build) | ✅ Validée | Cas 1 matricule auto ✓ · Cas 2 cycle ✓ · Cas 3 historique salaire ✓ · Cas 4 statut + manager actif ✓ · Cas 5 organigramme ✓ ; build OK ; non-régression 21/21 | Base nettoyée (employés de test supprimés, séquence 9009) |

## RH-02 — Présences & Temps de travail (P0)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : attendance_entries, overtime_authorizations, attendance_calculations (jsonb détail), attendance_monthly_summaries | ✅ Validée | 4 tables + FK (psql) | `rh_presences.ts` |
| T2 | Moteur de calcul pur + tests unitaires | ✅ Validée | **12/12 vitest** (cas 1-6 cahier + bonus) | `presence-engine.ts` — zéro constante métier ; plafond seed → 8h30 (conforme cas 1) |
| T3 | Router : saveEntry/saveBatch (calcul auto), autorisations HS (demande/décision), closeMonth + résumés, listEntries/listSummaries | ✅ Validée | Flux E2E API : CAS1 510/0/0 ✓ · CAS4 60 HS ✓ · clôture 8 résumés ✓ · résumé 510/60/1 verrouillé ✓ ; non-régression verte | `rh-presence.ts` ; fix jointure closeMonth (champs explicites) |
| T4 | Écrans : saisie quotidienne, autorisations HS, historique, rapport mensuel/clôture | ✅ Validée | UI testée : saisie du jour → entrée en base ✓ ; demande HS ✓ ; historique affiche 8h30 ✓ ; clôture → 8 résumés « VERROUILLÉ » ✓ ; 0 erreur JS | `PresencesRH.tsx` (4 onglets) ; fix toast trompeur « 0 présence(s) » → erreur explicite ; prérequis cycles sur tous les employés |
| T5 | Validation RH-02 (cas 1-7) + non-régression + build | ✅ Validée | Cas 1-6 : tests unitaires 12/12 ✓ ; cas 7 clôture : API + UI ✓ ; build OK (fix lint `module` dans app-nav.tsx) ; non-régression 21/21 | Base nettoyée (cycles conservés sur les employés) |

## RH-03 — Congés & Absences (P1)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : leave_balances, leave_requests (workflow), leave_balance_adjustments + annual_leave_days (RH-00, défaut 30) | ✅ Validée | 3 tables + colonne (psql) | `rh_conges.ts` |
| T2 | Moteur de solde pur + tests unitaires | ✅ Validée | **6/6 vitest** (acquisition 2,5 j/mois, prorata, solde, jours ouvrés lun-sam, chevauchement) | `leave-engine.ts` |
| T3 | Router : soldes auto (prorata 17,5 j pour embauche 2026), demandes + workflow (approuve/refuse/annule), contrôle solde + chevauchement, ajustement tracé, **impact présences (3 j marqués « conge »)** | ✅ Validée | Flux API : solde 17,5 → approbation 3 j → 14,5 ✓ · refus inchangé ✓ · ajustement +2 → 16,5 ✓ · chevauchement refusé ✓ · 3 entrées présences « conge » ✓ ; non-régression verte | `rh-leave.ts` |
| T4 | Écrans : demandes (création + validation), soldes (ajustement), calendrier | ✅ Validée | UI testée : demande → en attente → Approuvé ✓ ; **solde déduit (pris 3,0 → solde 17,0)** ✓ ; calendrier montre les congés ✓ ; 0 erreur JS | `CongesAbsences.tsx` (3 onglets) ; **fix bug : approbation sans solde pré-existant ne déduisait rien → création auto du solde** |
| T5 | Validation RH-03 (cas 1-5) + non-régression + build | ✅ Validée | Cas 1 types RH-00 ✓ · Cas 2 solde diminué ✓ · Cas 3 refus inchangé ✓ · Cas 4 jours « conge » en présences ✓ · Cas 5 ajustement tracé ✓ ; build OK ; non-régression 21/21 | Base nettoyée |

## RH-04 — Paie (P1)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : payroll_periods, payroll_items_config (params jsonb), payroll_entries, payroll_entry_lines + seed 9 éléments (prime présence 10 % ≥ 95 %, HS ×1,25, transport fixe, absence /26 j, avance, CNPS 4,5/5,6 %, IRPP 0 %) | ✅ Validée | 4 tables + 9 éléments/agence (psql) | `rh_paie.ts` |
| T2 | Moteur de calcul pur + tests unitaires | ✅ Validée | **7/7 vitest** (mois complet, présence < 95 %, HS majorées, absence retenue, taux modifié, prime + avance, prime fixe) | `payroll-engine.ts` |
| T3 | Router : périodes (open/close), **préparation depuis résumés RH-02 clôturés** (refus si non clôturés), bulletins + lignes, ajustement (recalcul, bloqué si payé), marquer payé (MoMo/OM/…), config éléments | ✅ Validée | Flux API : 2 bulletins ✓ ; HS 901,44 = 721,15×1,25 ✓ ; ajustement +10 000 → net 154 151 ✓ ; payé (momo) ✓ ; non-régression verte | `rh-payroll.ts` |
| T4 | Écrans : périodes/préparation, bulletins (détail + ajustement + payé), configuration éléments + **PDF du bulletin (jspdf)** | ✅ Validée | UI testée : période ✓ · calcul 2 bulletins ✓ · détail (Net à payer) ✓ · config ✓ · **PDF 200 (application/pdf, bulletin-GPJ-…pdf)** ✓ ; payé (momo) confirmé en base ; 0 erreur JS | `PaieRH.tsx` + route `api/rh/bulletin-pdf/[id]` |
| T5 | Validation RH-04 (cas 1-6) + non-régression + build | ✅ Validée | Cas 1 clôture→paie ✓ · Cas 2 HS ×1,25 (901,44) ✓ · Cas 3 retenue absence ✓ · Cas 4 taux modifié ✓ · Cas 5 PDF ✓ · Cas 6 payé MoMo ✓ ; build OK ; non-régression 21/21 | Base nettoyée |

## RH-05 — Évaluation & Performance (P2)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : evaluation_grids, criteria (pondération), campaigns, evaluations, scores, performance_bonus_rules + seed grille Technicien (6 critères : 30/20/15/15/10/10) + barème 5 tranches (4,5+→20 000 · 4+→15 000 …) | ✅ Validée | 6 tables, 12 critères (2 agences), 5 tranches | `rh_evaluation.ts` |
| T2 | Moteur : note globale pondérée + prime selon barème (pur + tests) | ✅ Validée | **4/4 vitest** (4,15/5 pondéré, extrêmes, barème 15 000) | `evaluation-engine.ts` |
| T3 | Router : grilles CRUD (contrôle somme pondérations = 100), campagnes, saveEvaluation (calcul auto + upsert + scores), getSuggestedBonus (lien Paie), historique | ✅ Validée | Flux API : grille ✓ · campagne ✓ · note 4,15 ✓ · prime 15 000 ✓ · historique ✓ ; non-régression verte | `rh-evaluation.ts` |
| T4 | Écrans : grilles, campagnes, saisie évaluation, historique, barème | ✅ Validée | UI testée : grille Technicien + critères pondérés ✓ · campagne lancée ✓ · **évaluation via l'UI → note 4,15** ✓ · historique ✓ · barème (20 000 1re tranche) ✓ ; 0 erreur JS | `EvaluationsRH.tsx` (4 onglets) |
| T5 | Validation RH-05 (cas 1-5) + non-régression + build | ✅ Validée | Cas 1 grille 6 critères ✓ · Cas 2 campagne ✓ · Cas 3 note pondérée ✓ · Cas 4 barème 15 000 (suggéré → saisi en paie) ✓ · Cas 5 historique ✓ ; build OK ; non-régression 21/21 | Base nettoyée |

## RH-06 — Compétences & Formations (P2)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : skills, position_skills, employee_skills, trainings (skill_ids jsonb), training_sessions, training_participations | ✅ Validée | 6 tables + 12 FK créées en base (SQL généré — prompt drizzle contourné par `archives` comme RH-00) | `rh_competences.ts` |
| T2 | Seed : 10 compétences garage (Atelier/Carrosserie/Accueil/Finance/Magasin), niveaux requis par poste (Technicien : DIAG_ELEC 3, MECA_MOTEUR 4, TRANSMISSION 3, CLIM_AUTO 3, ELECTRICITE 3), catalogue 5 formations (40 h diagnostic, 24 h clim, 30 h soudure, 12 h accueil, 16 h stock) | ✅ Validée | Idempotent 2 agences (20 skills, 30 exigences, 10 formations) | ajouté à `seed-rh.ts` |
| T3 | Moteur pur : skillGaps (écart + critique si ≥2), suggestTrainings (couverture des écarts, tri par impact), categoryMastery, monthsSinceLastTraining | ✅ Validée | **11/11 vitest** (4 écarts, 3 suggestions, 1 catégorie, 3 alerte) | `skills-engine.ts` |
| T4 | Router : référentiel CRUD (contrôle doublon code), exigences poste (upsert/remove), matrice employé (upsert/remove, audit évaluateur), getGaps (moteur : écarts + suggestions), catalogue formations CRUD, sessions CRUD, participations CRUD, getTrainingLapse (alerte ≥6 mois) | ✅ Validée | Flux API : createSession ✓ · addParticipation ✓ · updateParticipation (valide, note 15) ✓ · historique E5 ✓ · évaluer DIAG_ELEC 3 → écart résolu ✓ · gaps Technicien : 5 gaps critiques + 2 suggestions ✓ · alerte 6 employés jamais formés ✓ ; non-régression verte | `rh-competences.ts` (18 procédures) ; fix : sous-requête scalaire drizzle → 2 requêtes (getTrainingLapse) |
| T5 | Écrans : 5 onglets (Référentiel avec recherche + création, Matrice employés avec gaps/suggestions + évaluation 1-5, Exigences par poste, Formations avec planification de sessions, Plan & historique avec alertes + inscription) | ✅ Validée | UI testée (Playwright) : 5 onglets rendus sans erreur JS, 0 API 4xx/5xx ; référentiel 10 compétences ✓ · matrice sélection ✓ · exigences Technicien ✓ · catalogue 5 formations + planifier ✓ · inscription + alertes ✓ | `CompetencesRH.tsx` (remplace le placeholder) ; confirm() → dialogue React (charte) |
| T6 | Validation RH-06 (cas 1-4) + non-régression + build | ✅ Validée | Cas 1 compétence requise niveau 4 Technicien ✓ · Cas 2 employé niveau 2 → écart + suggestion ✓ · Cas 3 formation suivie → historique ✓ · Cas 4 matrice consultable ✓ ; build OK ; non-régression 21/21 ; vitest 57/57 | Base nettoyée (sessions/participations/évaluations de test supprimées) |

## RH-07 — Disciplinaire (P2)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Schéma : enrichissement `sanctions` (sanction_type_id→RH-00, decision, notified_at, document_url, created_by) + paramètre `disciplinary_window_months` (défaut 12) dans `hr_general_settings` | ✅ Validée | 5 colonnes + 2 FK + paramètre créés en base (DO block — ADD CONSTRAINT IF NOT EXISTS non supporté par PG) | `absences.ts` + `rh_parametrage.ts` |
| T2 | Moteur pur : compteur avertissements (severity 1-2 notifiés) sur période glissante, détection récidive (≥2), fenêtre paramétrable, gravité | ✅ Validée | **9/9 vitest** (comptage, fenêtre, seuil 2/3, fenêtre 3 mois, sévérité, tous employés) | `disciplinary-engine.ts` |
| T3 | Router : listSanctionTypes (RH-00), getSettings/updateSettings (période glissante), listRecords (filtres employé/type/période/recherche), createRecord (type RH-00 validé, notification auto), updateRecord (décision/document), deleteRecord, getEmployeeDossier (historique + récidive moteur + auteur), getOverview (tous les employés) | ✅ Validée | Flux API : 5 types ✓ · création → type RH-00 ✓ · **2 avertissements → récidive ALERTE (fenêtre 12 mois)** ✓ · document joint ✓ · dossier complet avec auteur ✓ · overview 8 employés ✓ ; non-régression verte | `rh-discipline.ts` (10 procédures) ; fix : `$count` drizzle au lieu de sous-requête (getOverview) |
| T4 | Écrans : 3 onglets (Registre avec recherche + suppression confirmée, Nouveau record avec types RH-00 en select + document, Dossier employé avec KPI + alerte récidive + historique) | ✅ Validée | UI testée (Playwright) : 3 onglets rendus sans erreur JS, 0 API 4xx/5xx ; registre 2 records ✓ · nouveau record formulaire ✓ · dossier + alerte ✓ | `DisciplinaireRH.tsx` (remplace la page Sanctions existante) |
| T5 | Validation RH-07 (cas 1-4) + non-régression + build | ✅ Validée | Cas 1 avertissement écrit → dossier ✓ · Cas 2 type RH-00 disponible ✓ · Cas 3 historique complet ✓ · Cas 4 permissions (rhProcedure = RH/Directeur/superadmin) ✓ ; build OK ; non-régression 21/21 ; vitest 66/66 | Base nettoyée (records de test supprimés) |

## RH-08 — Documents RH (P2)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Tables : `hr_document_types` (paramétrables : code, name, has_expiration) + enrichissement `documents_employes` (document_type_id→types, uploaded_by, notes, updated_at) | ✅ Validée | 1 table + 4 colonnes + 3 FK créés en base | `rh_documents.ts` + `absences.ts` |
| T2 | Seed 8 types (Contrat, Avenant, CIN/Passeport, CNPS, Attestation, Certificat formation, Courrier disciplinaire, Autre) — Contrat et CIN avec expiration | ✅ Validée | Idempotent 2 agences (16 types) | ajouté à `seed-rh.ts` |
| T3 | Moteur pur : daysUntilExpiry (UTC calendaire), expiryStatus (expire/expire_bientot/valide/sans), expiryAlerts (tri urgence), latestValid (versioning) | ✅ Validée | **6/6 vitest** | `documents-engine.ts` ; fix : parsing ISO → Date.UTC (décalage fuseau) |
| T4 | Router : CRUD types (contrôle doublon), CRUD documents (type RH-08 validé, uploader auto, statut expiration calculé), getExpirationAlerts (moteur, tri urgence) | ✅ Validée | Flux API : 8 types ✓ · upload contrat rattaché ✓ · **CIN expiré (-6 j) + contrat expirant (+4 j) détectés** ✓ · liste avec statut ✓ ; non-régression verte | `rh-documents.ts` (9 procédures) |
| T5 | Écrans : 3 onglets (Documents avec recherche + upload, Types paramétrables avec toggle actif, Alertes expiration avec jours restants) | ✅ Validée | UI testée (Playwright) : 3 onglets rendus sans erreur JS, 0 API 4xx/5xx ; liste 2 docs ✓ · types 8 ✓ · alertes 2 ✓ | `DocumentsRH.tsx` (remplace la page existante) |
| T6 | Validation RH-08 (cas 1-3) + non-régression + build | ✅ Validée | Cas 1 upload contrat → rattaché ✓ · Cas 2 expiration → alerte ✓ · Cas 3 type configurable ✓ ; build OK ; non-régression 21/21 ; vitest 72/72 | Base nettoyée (documents de test supprimés) |

## RH-09 — Tableau de bord & Reporting RH (P1)

| # | Tâche | Statut | Tests | Notes |
|---|-------|--------|-------|-------|
| T1 | Moteur stats pur : presenceRate, repartition, payrollMass, toCsv (RFC 4180), workingDaysInMonth (lun-sam hors fériés) | ✅ Validée | **8/8 vitest** (taux, répartition, masse, CSV échappement, jours ouvrés avec férié) | `rh-stats-engine.ts` ; fix : août 2026 = 26 j ouvrés |
| T2 | Router : getKpis (effectifs, taux présence via résumés RH-02, masse salariale, évaluations en retard, formations, alertes contrats/docs/soldes, répartitions), exports CSV (employés, présences par mois, matrice compétences, registre disciplinaire) | ✅ Validée | Flux API : KPI 8 employés / présence / masse 1 290 000 F ✓ · alertes docs expirés 1 ✓ · 4 exports CSV générés (BOM UTF-8) ✓ ; non-régression verte | `rh-dashboard.ts` (5 procédures) |
| T3 | Écrans : 2 onglets (Tableau de bord : 6 KPI + alertes + répartition par département avec barres ; Rapports : 4 exports CSV avec sélecteur de période) | ✅ Validée | UI testée (Playwright) : 2 onglets rendus sans erreur JS, 0 API 4xx/5xx ; KPI ✓ · alerte docs 1 ✓ · rapports ✓ | `DashboardRH.tsx` (remplace l'ancien dashboard) |
| T4 | Validation RH-09 (cas 1-4) + non-régression + build + **clôture du module RH** | ✅ Validée | Cas 1 effectif correct ✓ · Cas 2 alerte docs expirés visible ✓ · Cas 3 taux présence cohérent RH-02 ✓ · Cas 4 export CSV fonctionnel ✓ ; build OK ; non-régression 21/21 ; vitest 80/80 | Base nettoyée |

---

## ✅ MODULE PERSONNEL (RH) — TERMINÉ (RH-00 → RH-09)

Toutes les composantes du module Personnel sont implémentées et validées :
- RH-00 Paramétrage · RH-01 Fiches/Organigramme · RH-02 Présences · RH-03 Congés · RH-04 Paie (IRPP barème camerounais, PDF) · RH-05 Évaluation · RH-06 Compétences & Formations · RH-07 Disciplinaire · RH-08 Documents · RH-09 Tableau de bord & Reporting
- **80 tests vitest** · **non-régression 21/21** · **build OK** · test d'intégration 33/33
- Critères globaux du module : tout paramétrable en base ✓ · permissions par rôle ✓ · audit des actions sensibles ✓ · rapports RH disponibles ✓

---

## Journal des itérations

### 2026-08-14 — Cadre + découpage RH-00
- Créé le script de non-régression (`apps/nextjs/scripts/non-regression.cjs`) — 21 vérifications, TOUT VERT
- Créé le processus (`DOC/QA/PROCESSUS.md`)
- Découpé RH-00 en 5 tâches (T1→T5)
- **T1 ✅** : 7 tables `hr_*` créées en base (schéma `rh_parametrage.ts`), non-régression verte
- **T2 ✅** : seed idempotent (`seed-rh.ts`) — horaires garage, congés, sanctions, fériés CM, paramètres généraux ; non-régression verte
- **T3 ✅** : API `rhSettings` (17 procédures : cycles, présence, congés, sanctions, fériés, général) — lecture/écriture testées, audit auto ; non-régression verte
- ⚠️ Incident résolu : BOM ajouté à `packages/db/package.json` par `Set-Content` (cassait le workspace pnpm) — réécrit sans BOM
- **T4 ✅** : écrans de configuration complets (6 onglets) — remplace le placeholder
- **T5 ✅** : les 5 cas de test RH-00 validés ; build OK ; non-régression 21/21
- **RH-00 TERMINÉ ✔**
- **RH-01 TERMINÉ ✔** — T1 schéma (5 tables + 10 colonnes) · T2 seed référentiels (7 dépts, 11 postes, 6 contrats) · T3 router (matricule RH-00, historiques auto, getFiche, référentiels) · T4 formulaire + liste enrichis · T5 organigramme · T6 validation (5 cas du cahier, build, non-régression 21/21)
- **RH-02 TERMINÉ ✔** — T1 tables (4) · T2 moteur pur + 12 tests unitaires · T3 router (saisie/lot, HS, clôture) · T4 écrans (4 onglets) · T5 validation (cas 1-7, build, non-régression)
- ⚠️ Correctifs découverts en route : inputs optionnels tRPC (listOvertime/listEntries/listSummaries 400/500), jointure closeMonth, toast trompeur, variable `module` (lint bloquant tous les builds)
- **RH-03 TERMINÉ ✔** — T1 tables (3 + annual_leave_days) · T2 moteur de solde + 6 tests · T3 router (workflow, soldes auto avec prorata, impact présences) · T4 écrans (3 onglets) · T5 validation (cas 1-5, build, non-régression) — **fix : création auto du solde à l'approbation**
- **RH-04 TERMINÉ ✔** — T1 tables (4) + seed 9 éléments paie · T2 moteur + 7 tests · T3 router (périodes, préparation depuis présences clôturées, bulletins, ajustements, payé) · T4 écrans (3 onglets) + **PDF bulletin** · T5 validation (cas 1-6, build, non-régression)
- **Améliorations RH-04 (retour utilisateur) ✔**
  - **Période par intervalle de dates** (start_date/end_date au lieu de année/mois) — paie agrégée sur l'intervalle ; UI avec 2 date pickers
  - **Bulletin conforme au modèle camerounais** : net imposable, IRPP au **barème progressif paramétrable** (0–40k : 0 % · 40–120k : 10 % · 120–300k : 15 % · 300–500k : 25 % · >500k : 35 %), CNPS sur le brut (4,5 % salariale / 5,6 % patronale), mentions N° CNSS, date d'embauche, période ; PDF enrichi
  - Tests : 9/9 vitest (barème IRPP inclus) ; validation API : brut 300 000 → IRPP 32 975 exact ✓ ; build OK ; non-régression 21/21
- **RH-05 TERMINÉ ✔** — T1 tables (6) + seed grille Technicien + barème · T2 moteur note pondérée + 4 tests · T3 router (grilles, campagnes, évaluations auto-calculées, prime suggérée) · T4 écrans (4 onglets) · T5 validation (cas 1-5, build, non-régression)
- **TEST D'INTÉGRATION COMPLET ✔ (33/33)** — `scripts/test-workflow-complet.cjs` : RH-00→05 de bout en bout avec 5 employés réels (fiches, présences avec HS autorisées/non, absence, congé approuvé, clôture, évaluation 4,15 → prime 15 000, 5 bulletins avec calculs camerounais exacts vérifiés à la main, paiements MoMo/OM, PDF). Cohérence confirmée : prorata solde congés, HS sans autorisation = 0, congé ≠ absence, IRPP barème exact.
- **RH-06 TERMINÉ ✔** — T1 tables (6) · T2 seed (10 compétences, exigences par poste, 5 formations) · T3 moteur pur + 11 tests · T4 router (18 procédures : référentiel, matrice, gaps/suggestions, formations, sessions, participations, alertes) · T5 écrans (5 onglets) · T6 validation (cas 1-4, build, non-régression 21/21)
- **RH-07 TERMINÉ ✔** — T1 schéma enrichi (5 colonnes + période glissante) · T2 moteur récidive + 9 tests · T3 router (10 procédures : registre, création avec types RH-00, dossier, récidive, overview) · T4 écrans (3 onglets) · T5 validation (cas 1-4, build, non-régression 21/21)
- **RH-08 TERMINÉ ✔** — T1 types paramétrables + colonnes docs · T2 seed 8 types · T3 moteur expiration + 6 tests · T4 router (9 procédures : CRUD types/docs, alertes) · T5 écrans (3 onglets) · T6 validation (cas 1-3, build, non-régression 21/21)
- **RH-09 TERMINÉ ✔** — T1 moteur stats + 8 tests · T2 router (KPI + 4 exports CSV) · T3 écrans (2 onglets) · T4 validation (cas 1-4, build, non-régression)
- **MODULE PERSONNEL (RH) TERMINÉ ✔ — RH-00 → RH-09 complet** (80 tests vitest, 21/21 non-régression, 33/33 intégration, build OK)