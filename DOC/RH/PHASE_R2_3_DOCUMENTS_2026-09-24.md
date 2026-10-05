# PHASE R2.3 — CORRECTION ÉCRAN DOCUMENTS RH (R2)

Date : 2026-09-24 — Branche : refacto RH en cours — Base : http://localhost:3000 — Postgres atelierone_erp
Statut de sortie : VALIDE — Méthode : reproduire AVANT de corriger, cause confirmée par stack d'exécution.

## 1. Résumé

Le module Documents RH (/dashboard/rh/documents) affichait « Une erreur est survenue » et était
inutilisable. Cause : violation des Rules of Hooks dans DocumentsSection (même anti-pattern que les
écrans R2.1/R2.2 déjà corrigés) : les gardes early-return `isLoading`/`isError` s'exécutaient AVANT le
hook `useClientPaging`. Conversion corrigée (4 lignes déplacées : gardes remontées APRÈS tous les hooks
inconditionnels). Aucune donnée modifiée ; données de test créées puis supprimées (document supprimé via
son ID/titre explicite, jamais le premier élément). Non-régression vérifiée sur Dashboard RH, Employés,
fiche employé, Compétences, recherche globale et retour Documents. 0 erreur tsc/eslint sur le périmètre,
tests unitaires moteur 6/6 + 18/18 au total. Le serveur tRPC répondait correctement (batch 200) — la panne
était localisée côté client (rendu), conforme à l'hypothèse « cause côté composants client » du canvas.

## 2. Périmètre de la mission R2.3 — Documents RH

- Objectif : corriger /dashboard/rh/documents (composant DocumentsRH.tsx), en reproduisant la panne
  dans un vrai navigateur AVANT toute modification.
- Règle : ne pas supposer la cause ; capturer pageerror / console / état tRPC ; documenter la chaîne
  UI → hook → tRPC → serveur → retour → rendu.
- Correction minimale : déplacer les gardes après les hooks inconditionnels uniquement.
  Pas de refactoring architectural, pas de migration, pas de modification de données existantes.
- Anomalies hors périmètre : documentées (section 15), non corrigées (notamment PlanningRH.tsx:82).

## 3. Symptôme (avant correction)

- Accès à /dashboard/rh/documents : page « Une erreur est survenue — Le chargement de cette page a
  échoué. Réessayez ou revenez à l'accueil. » (ErrorBoundary de l'app).
- Aucun onglet, aucune recherche, aucun bouton « Ajouter un document » rendus.
- title = « AtelierOne », h1 affiché = « Une erreur est survenue » (1 occurrence).

## 4. Reproduction réelle (AVANT)

Script : r2-documents-before.js → audit r2-documents-before.json/png.

- Console/navigateur :
  - `React has detected a change in the order of Hooks called by %s … Previous render / Next render`
    → composant concerné : **DocumentsSection**.
  - `Error: Rendered more hooks than during the previous render.` — stack react-dom (dev)
    `updateWorkInProgressHook → updateReducer → Object.useState` dans DocumentsSection.
- Réseau tRPC : le batch `rhDocuments.listDocuments + rhDocuments.listDocumentTypes + rh.list`
  répond **200** : le serveur traite correctement les lectures. La panne est bien côté rendu client.
- Constat : h1 « Une erreur est survenue », error-label=1, tabs=000, search=false, add-btn=false.

Chaîne documentée : DocumentsSection (useState x5 + useQuery x3 + mutations + useEffect + useEmployeFromUrl)
→ gardes `if (isLoading) return` puis `if (isError) return` → hook `useClientPaging` appelé
conditionnellement → React compte moins de hooks au 1er render, plus au suivant → flèche « Rendered more
hooks » → ErrorBoundary → écran d'erreur global.

## 5. Cause racine confirmée

- Fichier : apps/nextjs/src/app/(dashboard)/dashboard/rh/_components/DocumentsRH.tsx, fonction
  DocumentsSection (autrefois lignes 120-121).
- Les deux instructions `if (isLoading) return` / `if (isError) return` précédaient l'appel du hook
  `useClientPaging(list, 25)` : un hook après un early-return = violation Rules of Hooks.
- Identique aux causes R2.1 (DisciplinaireRH) et R2.2 (CompetencesRH) — cause racine commune.
- Les sections TypesSection et AlertesSection ne présentent PAS de violation (aucun hook après leurs
  gardes, vérifié à la lecture et à l'exécution).

## 6. Correction appliquée (minimale)

- Déplacement des 2 gardes APRÈS `useClientPaging` (nouveau positionnement lignes 130-131 ; le hook est
  appelé lignes 128 de manière inconditionnelle avec `list` issue d'un calcul pur).
- Aucun autre changement : pas d'opérateur ?, pas de valeur par défaut arbitraire, pas de try/catch,
  pas de suppression de composant, pas de modification serveur/schéma/données.
- Note de contexte git : le fichier portait déjà des modifications non commitées de la branche
  (pagination `useClientPaging/PaginationBar` sur `pageItems`, pré-sélection `?employeId=` via
  useEmployeFromUrl) ; la correction R2.3 se limite au déplacement des gardes. Le diff complet du
  fichier est montré, la part R2.3 est isolée (4 lignes déplacées).

## 7. Preuve après correction (états UX)

Script : r2-documents-after.js → audit r2-documents-after.json/png (+ after-alertes.png).

- h1 « Documents RH » ; 3 onglets « Documents | Types | Alertes expiration » rendus.
- Recherche « Rechercher (employé, type, titre)... » présente ; bouton « Ajouter un document » présent.
- État vide (aucun document en base) : EmptyState « Aucun document ».
- Onglet Types : 8 lignes (ex. ATTESTATION… / COURRIER_DISCIPLINAIRE) — serveur listDocumentTypes OK.
- Onglet Alertes : « 0 document(s) nécessitent une action », EmptyState « Aucune alerte ».
- 0 pageerror / 0 erreur hooks sur tout le parcours.

## 8. Tests fonctionnels — CRUD Documents

Script : r2-documents-crud.js → audit r2-documents-crud.json/png (+ -alertes.png, -delete.png).

- CRÉATION (UI) : formulaire « Nouveau document » — employé « Arnaud Nague Zemdjui », type
  « CIN / Passeport », titre « DOC R2.3 1790258886625 », URL /docs/test-r2-3-1790258886625.pdf,
  émission 2026-09-24, expiration 2026-10-15. Toast « Document ajouté » en 425 ms.
  Ligne rendue : Arnaud Nague Zemdjui | CIN / Passeport | DOC R2.3 … | 2026-09-24 | 2026-10-15 |
  badge « EXPIRE BIENTÔT » | lien fichier test-r2-3-….pdf.
- ID cible : récupéré via l'API (id est explicitement identifié, titre unique) — id=1 ; jamais de .first().
- RECHERCHE client : sans correspondance → EmptyState + 0 ligne ; par titre → 1 ; par employé « Arnaud »
  → 1 ; par type « Passeport » → 1.
- MODIFICATION : aucune action d'édition dans l'UI (constat, cf. §16) — le contrat tRPC
  `rhDocuments.updateDocument` est testé directement (mutation réelle authentifiée) : HTTP 200
  {success:true} et valeur `notes = notes update R2.3 1790258886625` relue depuis listDocuments → persistée.
- ALERTES : l'onglet « Alertes expiration » liste le document (21 jours restants, badge EXPIRE BIENTÔT).
- SUPPRESSION (UI) : ligne ciblée par son titre unique (1 row), modal « Supprimer le document »,
  bouton « Supprimer », toast « Document supprimé » en 548 ms, retour à l'état vide (0 ligne + EmptyState).
- Base après test : documents_employes = 0 (aucune donnée résiduelle) ; boucle de test totalement close.

## 9. Tests fonctionnels — Navigation & ?employeId

Script : r2-documents-navigation.js + r2-documents-navigation2.js/3.js
→ audit r2-documents-navigation.json (+ nav2), r2-documents-navigation.png.

- Fiche employé 21 : 9 onglets rendus (… Documents) ; onglet Documents → EmptyState « Aucun document ».
- /dashboard/rh/documents?employeId=21 : en ouvrant le formulaire, l'employé est pré-sélectionné
  (select value=21, libellé « Arnaud Nague Zemdjui ») — le paramètre est réellement consommé.
- /dashboard/rh/documents sans paramètre : select neutre (value=0) — comportement attendu.
- Réouverture finale de la page Documents après le parcours : OK (aucune erreur).

## 10. Tests fonctionnels — Permissions (UI + API/tRPC)

Script : r2-documents-permissions.js → audit r2-documents-permissions.json/png (dir + cons).

- Rôle DIRECTEUR (lecture autorisée par rhProcedure [rh, superadmin, directeur]) :
  - lecture : page Documents chargée (données visibles).
  - création UI : bouton visible (constat UI §16) ; soumission → toast error « Permission manquante:
    rh.document.modifier » en 410 ms ; 0 ligne ajoutée.
  - API : POST rhDocuments.createDocument → HTTP 403 TRPCError FORBIDDEN
    (message identique). Refus serveur conforme au router (requirePermissionProcedure).
- Rôle CONSULTATION seule (aucun accès lecture rh) :
  - UI : module sans action de modification (bouton absent) ; page invalide pour ce rôle.
  - API : batch `listDocuments,listDocumentTypes,rh.list` → HTTP 403 ; POST createDocument → 403
    « Permission manquante: rh.document.modifier ».
- SUPERADMIN : bypass `user.role === "superadmin"` (trpc.ts:176) — le CRUD administrateur des tests
  §8 s'est exécuté avec succès.
- Référence RBAC : la permission `rh.document.modifier` est déclarée dans packages/db/src/security-socle.ts
  (l.96) et programmée dans le router, mais est ABSENTE de la table permissions de la base (seul
  rh.document.consulter existe) → aucun rôle non-superadmin ne peut valider ces mutations. Ceci est un
  état de données (provisioning/seed) documenté en anomalie (cf. §15), hors périmètre de la cause.

## 11. Non-régression transversale

- Dashboard RH : page chargée (« Chargement… » → contenu ; h1 rendu différé côté client), 0 erreur hooks.
- Liste Employés : 30 lignes ; recherche « Arnaud » → 1 ligne.
- Fiche employé 21 : 9 onglets (présence du module Documents dans la fiche).
- Compétences (R2.2) : page « Compétences & Formations » charge, aucun pageerror ; Référentiel :
  page 1 = 10/20 compétences (pagination 10, non-régression du correctif R2.2) ; recherche par
  nom/catégorie : « PEINTURE » → 1 ligne ; « DIAG_ELEC » → 0 (le code n'étant pas indexé par le
  filtre — limite connue documentée en R2.2, aucun changement de comportement).
- Recherche globale Ctrl+K : « Arnaud Nague Zemdjui — GPJ-2026-9025 — Assistant Administratif » trouvée.
- Retour à /dashboard/rh/documents : OK.
- Compteur global du parcours e2e : 0 pageerror / 0 erreur « hooks » hors provenance volontaire §4.

## 12. Tests techniques

- Unitaires (vitest, apps/nextjs) : documents-engine 6/6 ; rh-scope 4/4 ; rh-recherche 8/8
  (18 tests, 3 fichiers) — moteur d'expiration/alertes inchangé et couvert.
- ESLint DocumentsRH.tsx : 0 erreur, 1 warning préexistant non lié (import FileText inutilisé, ligne 11).
- TypeScript `tsc --noEmit` : aucune erreur rattachée à rh-documents / DocumentsRH / documents-engine.
  (des erreurs hors périmètre préexistent sur d'autres modules de la branche : cash, transferts, etc.)

## 13. Intégrité des données & traçabilité

- Baseline initiale : hr_document_types = 16 (8 agence 1) ; documents_employes = 0 (total et agence 1).
- Après le cycle de test CRUD : documents_employes = 0 ; hr_document_types = 16 (inchangé).
- Toutes les données de test ont un identifiant explicite (titre unique « DOC R2.3 <ts> ») et ont été
  supprimées par l'interface ; aucune donnée de production n'a été touchée.
- Audit : 3 mutations tracées dans audit_logs (rhDocuments.createDocument / updateDocument /
  deleteDocument) — activité de test conforme et traçable.

## 14. GATE R2.3 — 28 cases

| # | Case | Statut |
|---|------|--------|
| 1 | Reproduction réelle AVANT correction (navigateur + console) | ✔ |
| 2 | Preuve pageerror « Rendered more hooks » ciblant DocumentsSection | ✔ |
| 3 | Vérification réseau : le serveur répond (batch tRPC 200) | ✔ |
| 4 | Cause racine identifiée et non supposée (stack d'exécution) | ✔ |
| 5 | Correction minimale : gardes après hooks uniquement | ✔ |
| 6 | Aucune donnée modifiée (baseline types=16, documents=0 identiques) | ✔ |
| 7 | États UX : loading/empty/data traités | ✔ |
| 8 | État erreur (ErrorState) lorsque le serveur refuse (rôle lecture) | ✔ |
| 9 | Liste Documents affichée et opérationnelle | ✔ |
| 10 | Création d'un document depuis le formulaire (toast + ligne) | ✔ |
| 11 | Recherche/filtres (nom, titre, type + sans résultat) | ✔ |
| 12 | ID de test explicite pour la suppression (jamais premier élément) | ✔ |
| 13 | Suppression confirmée + reflétée immédiatement dans la liste | ✔ |
| 14 | Modification : endpoint testé (API) ; absence d'action UI documentée | ✔ |
| 15 | Alertes d'expiration (document à 21 j listé) | ✔ |
| 16 | ?employeId réellement pris en compte (pré-sélection 21) | ✔ |
| 17 | Sans paramètre, état neutre (value 0) | ✔ |
| 18 | Onglet Documents de la fiche employé : fonctionnel (vide) | ✔ |
| 19 | Permissions UI vérifiées (constats documentés, sans modification) | ✔ |
| 20 | Permissions API/tRPC vérifiées (403 Directeur / Consultation) | ✔ |
| 21 | Refus serveur clair (toast « Permission manquante… ») | ✔ |
| 22 | Dashboard RH non régressé | ✔ |
| 23 | Liste Employés + recherche non régressées | ✔ |
| 24 | Fiche employé non régressée (onglet Documents) | ✔ |
| 25 | Module Compétences non régressé (R2.2 intact) | ✔ |
| 26 | Recherche globale (Ctrl+K) non régressée | ✔ |
| 27 | Tests techniques : vitest 18/18, eslint 0, tsc 0 (périmètre) | ✔ |
| 28 | Preuves/artefacts nommés r2-documents-* + rapport + registre | ✔ |

## 15. Anomalies hors périmètre (documentées, non corrigées)

- **PlanningRH.tsx:82** : même anti-pattern (gardes avant useClientPaging) — correctif à programmer en
  revue ultérieure (signalé, refus de l'étendre ici : hors périmètre R2.3).
- **RBAC / provision**: la permission `rh.document.modifier` manque dans la table permissions (présente
  dans security-socle.ts et requise par le router) → les rôles non-superadmin (dont Directeur et RH) ne
  peuvent pas créer/modifier/supprimer les documents ou leurs types malgré l'UI visible. Bonne nouvelle :
  le bypass superadmin permet à l'administration de fonctionner. État de données (seed), hors périmètre
  (aucune modification de données autorisée par la mission R2.3).
- **updateDocument exposé sans action UI** : l'endpoint existe et fonctionne (testé §8) mais aucun point
  d'appel dans DocumentsRH ni DocumentsTab de la fiche employé.
- Erreurs tsc globales préexistantes de la branche (cash, transferts, treasury…) : non traitées.
- Warning eslint FileText inutilisé (DocumentsRH.tsx:11) : préexistant, non lié.

## 16. Constats & limites UX (non bloquants)

- Les boutons du module ne sont pas masqués pour les rôles sans :rh.document.modifier: (constaté avec
  Directeur : bouton visible, refus au moment de la soumission avec toast clair). Conforme à la règle
  « refus serveur explicite », mais non au « masquage UI » — à arbitrer.
- Filtre de recherche DocumentsRH : recherche sur nom employé, titre et type — pas sur l'URL du fichier
  ni le statut (comportement actuel, cohérent).
- Le référentiel Compétences recherche par nom/catégorie, pas par code (limite documentée en R2.2 §8.2).

## 17. Preuves

Artefacts dans <temp>/opencode/audit/r2 :
- r2-documents-before.json/.png (repro page d'erreur + stack + batch 200)
- r2-documents-after.json/.png, r2-documents-after-alertes.png (guérison + 3 onglets)
- r2-documents-crud.json/.png, r2-documents-crud-alertes.png, r2-documents-crud-delete.png
- r2-documents-navigation.json (fiche/onglets/?employeId), r2-documents-navigation2.json
  (employés 30 lignes, recherche), r2-documents-navigation.png, r2-documents-regression.png
- r2-documents-regression-tables.json (Référentiel 10/20, sous-onglets, input recherche)
- r2-documents-permissions.json/.png (dir + .png cons) : refus UI/API détaillés
Scripts : r2-documents-before/after/crud/navigation(+2/3)/tables/permissions.js

## 18. Conclusion & statut

- Cause confirmée à l'exécution, correction minimale appliquée, aucun effet de bord.
- Toutes les 28 cases du GATE R2.3 sont vertes.
- RELANCE : OUI — le bug bloquant Documents RH est corrigé et vérifié de bout en bout.

## 19. REPRISE GATE — 24/09/2026

Contexte : après la validation initiale de R2.3, une **reprise ciblée** a été demandée pour lever 3 écarts :
il n'existait aucune action UI de modification de document, l'UI n'était pas alignée sur les permissions
réelles, et la permission `rh.document.modifier` n'existait pas en base. Traitement ci-dessous
(problème / décision / correction / preuve / résultat), sans ouvrir R2.4 et sans toucher aux autres modules RH.

### 19.1 Écart 1 — Modification d'un document : périmètre & implémentation

- **Problème** : `updateDocument` exposé côté backend mais aucune action UI (seule la suppression par ligne).
- **Décision** : la modification fait partie du périmètre fonctionnel du droit « Gérer les documents et
  types de documents RH » (`rh.document.modifier`, security-socle.ts:96) ; corriger la date d'expiration,
  le titre ou les notes d'un document sans le supprimer est un besoin métier naturel, et le formulaire de
  création existant fournit exactement les mêmes champs. Implémentation minimale retenue : bouton
  **Modifier** par ligne réutilisant le formulaire pré-rempli → `updateDocument` → toast → invalidate.
- **Correction** : `DocumentsRH.tsx` — état `editId`, `startEdit(d)` pré-remplit employé/type/titre/URL/
  dates/notes depuis la ligne, `save()` bascule entre create et update, le formulaire affiche
  « Modifier le document », « Annuler » réinitialise l'édition.
- **Preuve** : `audit/r2/r2-reprise-modif.js` — flux réel (admin) : création (toast « Document ajouté »,
  ligne, id=6) → clic Modifier → formulaire « Modifier le document » pré-rempli (selects `21`/`3`,
  titre, dates) → titre modifié + `dateExpiration` 2026-11-02 → toast « Document modifié » → ligne à jour
  sans reload (`new=1 old=0`) → persistance API (`titre`, `dateEmission`, `dateExpiration` relues) →
  reload : ligne toujours présente → suppression (toast, liste vide).
- **Résultat** : modification fonctionnelle réelle démontrée **création → modification → refresh →
  persistance**.

### 19.2 Écart 2 — Cohérence permissions UI/API

- **Problème** : boutons de création/suppression visibles pour tout rôle authentifié alors que le serveur
  refuse l'écriture (`rh.document.modifier`).
- **Décision (règle attendue — modèle de référence `SOCLE_MATRICE`, security-socle.ts)** : seul `rh`
  (Responsable RH) + `superadmin` écrivent les documents ; `directeur` est en lecture seule
  (`RH_CONSULTATION`) ; `consultation` n'a aucun droit RH. L'UI doit **masquer** les actions non autorisées ;
  le contrôle serveur est conservé sans modification.
- **Correction** : gating UI via `usePermissions()` / `hasPermission("rh.document.modifier")` dans
  DocumentsSection et TypesSection — bouton « Ajouter un document », colonne Action, boutons
  Modifier/Supprimer par ligne, « Nouveau type » : masqués si refusé ; toggles de types désactivés
  (title « Permission manquante »).
- **Preuve** : `audit/r2/r2-reprise-perms.js` (un contexte Playwright par rôle, sans fuite de cookies) :
  - **Responsable RH** : boutons visibles, création UI reelle (toast + ligne), API create `{created:true}` ;
  - **Directeur** : `add=0`, `actionHeader=0`, `editBtns=0`, `delBtns=0`, `newTypeBtn=0`, toggles
    `disabled=8`/`enabled=0` ; API create → **403 code -32003** « Permission manquante: rh.document.modifier » ;
  - **Consultation** : aucune action en UI ; API create → **403 -32003**.
- **Résultat** : autorisé → action visible et fonctionnelle ; non autorisé → action indisponible en UI et
  API protégée.

### 19.3 Écart 3 — Permission `rh.document.modifier` : seed périmé

- **Problème** : la table `permissions` ne contenait aucune permission RH `.modifier` (les 8 de
  `RH_ECRITURE` manquaient, dont `rh.document.modifier`) ; seules les consultations RH + utilisateurs
  existaient. La base n'avait pas été resynchronisée avec `security-socle.ts` après l'ajout du bloc
  `RH_ECRITURE` : le Responsable RH ne pouvait pas écrire, seuls refus et bypass superadmin s'appliquaient.
- **Décision** : la configuration attendue est celle de `SOCLE_MATRICE` (source de vérité existante) :
  `rh` → consultation + écriture RH ; `directeur` → consultation RH seule ; `superadmin` → tout ;
  `consultation` → aucun droit RH. Aucune règle métier inventée ; aucune permission modifiée sans référence.
- **Correction** : exécution du script officiel additif/idempotent `seed:socle` (`packages/db/src/seed-socle.ts`
  → `ensureSecuritySocle`) : **9 permissions créées, 18 associations créées**. Sécurité : `onConflictDoNothing`
  + insertion des seules associations manquantes — aucun DELETE ni UPDATE.
- **Preuve** : matrice réelle après correction (requête `role_permissions`) — Directeur : `rh.document.consulter`
  seul ; **Responsable RH : `rh.document.modifier` + consulter** (+ autres `.modifier` RH) ; Super Admin :
  tout ; Consultation : rien. Comportement vérifié par flux réels (19.2).
- **Résultat** : configuration conforme au modèle documenté, vérifiée en base et au comportement.

### 19.4 Écarts de reprise : aucun autre

- **Non-régression** : dashboard RH (h1 « Personnel (RH) »), Employés (30 lignes, recherche « Arnaud »→1),
  fiche 21 (onglets Documents présents, DocumentsTab vide), `?employeId=21` (select pré-rempli `21`),
  recherche documents (titre=1 / nom=1 / type=1 / no-match→empty), états loading/empty/**erreur+Réessayer**
  (interception réseau aborted), Alertes expiration (0), Compétences (10/20 page 1 + pagination), palette
  Ctrl+K (Arnaud / GPJ-2026-9025 retrouvés).
- **Intégrité** : `documents_employes` 0 avant ↔ 0 après ; `hr_document_types` 16 inchangés ;
  `permissions` 66→75, `role_permissions` 206→224 (= uniquement insertions seed) ; données de test créées
  avec identifiant explicite puis toutes supprimées.
- **Techniques** : vitest `documents-engine` **6/6** ; eslint `DocumentsRH.tsx` 0 erreur (1 warn préexistant
  `FileText` inutilisé) ; `tsc --noEmit` 0 erreur sur le périmètre (les erreurs restantes cash/garage/… sont
  préexistantes et hors périmètre).

## 20. GATE FINALE REPRISE — 19 cases

| # | Case | Résultat |
|---|------|----------|
| 1 | Crash corrigé | ✅ — pageerror hooks DocumentsSection reproduite puis guérie ; 0 pageerror aux re-tests |
| 2 | Aucune violation Rules of Hooks | ✅ — guards déplacées après `useClientPaging` ; aucun pageerror « Rendered more hooks » |
| 3 | Liste | ✅ — rendue + pagination 25 |
| 4 | Recherche | ✅ — titre / nom employé / type / no-match |
| 5 | Création | ✅ — admin + Responsable RH (UI + API `created:true`) |
| 6 | **Modification fonctionnelle** | ✅ — §19.1 : création→modification→refresh→persistance (id=6) |
| 7 | Suppression | ✅ — modal « Supprimer le document », toast, liste mise à jour |
| 8 | Navigation fiche employé → Documents | ✅ — DocumentsTab fiche 21 |
| 9 | `?employeId=` | ✅ — select pré-sélectionné `21` ; sans paramètre → 0 |
| 10 | Permissions UI | ✅ — §19.2 : masquage pour Directeur/Consultation, visibles pour RH/Superadmin |
| 11 | Permissions API | ✅ — §19.2/19.3 : 403 -32003 pour rôles sans le droit ; RH autorisé |
| 12 | Configuration permissions conforme au modèle | ✅ — §19.3 : matrice = SOCLE_MATRICE, RH = `modifier` |
| 13 | Données intactes | ✅ — §19.4 : 0 doc / 16 types ; seuls ajouts = seed permissions |
| 14 | Refresh / persistance | ✅ — §19.1 : valeurs relues par API + après reload complet |
| 15 | Non-régression | ✅ — §19.4 : Dashboard, Employés, Fiche, Compétences, palette |
| 16 | Tests techniques | ✅ — vitest 6/6, eslint 0 erreur, tsc 0 erreur périmètre |
| 17 | Preuves | ✅ — `audit/r2/r2-reprise-*` (modif, perms, regress, palette) |
| 18 | Rapport | ✅ — présente section (REPRISE GATE) |
| 19 | Registre | ✅ — ligne R2.3 = VALIDE (REPRISE GATE 19/19) |

**STATUT : R2.3 = VALIDE (GATE INITIAL 28 cases + GATE REPRISE 19 cases). STOP immédiat — pas d'ouverture de R2.4, pas de correction de `PlanningRH.tsx:82` (signalé, hors périmètre).**
- Statut : **VALIDE** (reporté au registre RH_EXECUTION_REGISTER.md).
