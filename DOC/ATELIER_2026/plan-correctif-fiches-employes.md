# Plan correctif — Module « Fiches employés » (RH-01)

> Programme de correction vaste, exécuté **bloc par bloc**, étape par étape.
> Étape courante : **Étape 1 — Fiches employés**.
> Chaque lot est exécutable et vérifiable (test visuel + typecheck + `graphify update .`).

## Audit initial (fait le 19/09/2026)

| # | Bloc | État | Détail |
|---|------|------|--------|
| 1 | Identité & photo | ⚠️ Partiel | Champs OK. Photo : `photoUrl` en base mais **aucun upload ni affichage**. |
| 2 | Contact & urgence | ✅ OK | email, tél., tél. 2, adresse, ville, contact urgence. |
| 3 | Identifiants internes | ✅ OK | matricule auto (préfixe+année+séquence), CNSS, NIU, banque, compte, pièces d'identité. |
| 4 | Situation d'emploi actuelle | ⚠️ Partiel | statut, type, département, poste, cycle, manager, dates. **Ancienneté jamais calculée/affichée.** |
| 5 | Contrat | ⚠️ Partiel | dates sur la fiche + page contrats globale. **Aucune vue des contrats depuis la fiche.** |
| 6 | Compétences | ⚠️ Partiel | champs libres + module `rhCompetences` complet. **Pas de lien fiche → matrice/écarts/formations.** |
| 7 | Parcours (poste, salaire, statut) | ❌ Critique | Backend **complet** (`getFiche` → `positionHistory` + `salaryHistory`) mais **aucun composant ne consomme `getFiche`**. **Historique des statuts inexistant (aucune table).** |
| 8 | Documents liés | ⚠️ Partiel | Module `rhDocuments` complet. **Pas de vue depuis la fiche.** |
| 9 | Éléments de paie | ⚠️ Partiel | salaire, mode paie, historique backend prêt. **Pas de permission « Voir salaires » ; fiches de paie non liées.** |
| 10 | Présence & congés | ⚠️ Partiel | Backend complet (rhLeave.getBalances, rhPresence, rhPosture). **Aucun résumé dans la fiche.** |
| 11 | Sortie employé | ❌ Manquant | Aucun flux de sortie (date/motif), 4 statuts seulement, pas de « sorti ». |
| 12 | Notes internes | ✅ OK | champ `notes` éditable. |
| 13 | Actions rapides | ❌ Manquant | Aucune fiche consultable → aucun lien présences/paie/congés/discipline/évaluations. |
| 14 | Recherche & filtrage (liste) | ✅ OK | recherche + filtres statut/type/département + pagination + stats. |
| 15 | Permissions & confidentialité | ⚠️ Partiel | créé/modifier OK. **« Voir sa propre fiche » (non-RH) et « Voir salaires » (Chef Atelier) non gérés.** |

## Lots correctifs

> Ordre recommandé : chaque lot dépend du précédent.

### T1 — Vue Fiche employé ✅ (fait le 19/09/2026, test e2e 9/9 PASS)
- [x] Page `rh/employes/[id]` (`EmployeeDetail.tsx`) consommant `api.rh.getFiche`.
- [x] Blocs de lecture : Identité, Contact & urgence, Identifiants internes, Situation d'emploi (avec **ancienneté**), Contrat, Compétences & profil, Notes, + **historique des postes** et **historique des salaires**.
- [x] Liste : nom cliquable + bouton « Fiche » → `/dashboard/rh/employes/{id}`.
- [x] Bouton « Modifier » conservé dans la liste (panel) et dans la fiche.
- [x] Test : `apps/nextjs/scripts/test-e2e-fiche-employe.cjs` (9/9 PASS) — création → historiques initiaux → changement poste/salaire → nouveaux historiques + ancien refermé → archivage.

### T2 — Historique des statuts ✅ (fait le 19/09/2026)
- [x] Table `employee_status_history` (statut, startDate, endDate, reason, changedBy) — migration `migrate-rh-status-history.ts` exécutée.
- [x] Écriture automatique : `rh.create` insère le statut initial ; `rh.update` referme la ligne ouverte et insère le nouveau statut (motif « Changement de statut »).
- [x] `getFiche` retourne `statusHistory` (ordre chronologique descendant).
- [x] Vue historique dans la fiche (onglet « Historique », timeline groupée par année).

### T3 — Photo employé
- [ ] Upload (stack du projet) + affichage avatar dans la liste et la fiche.

### T4 — Résumés intégrés (onglets sous-modules)
- [x] Restructuration de la fiche en onglets (Identité | Contrat | Paie | Présence | Compétences | Historique | Documents | Notes), en-tête sticky, timeline de parcours, badge ancienneté.
- [x] Onglet Contrat : liste des contrats de l'employé (`rh.listContrats` filtré employeId).
- [x] Onglet Documents : liste des documents (`rh.listDocuments` filtré employeId) + alerte documents expirés.
- [x] Onglet Présence : soldes de congés (`rhLeave.getBalances`), absences (`rh.listAbsences`), pointage du mois (`rhPresence.listSummaries`).
- [x] Onglet Historique : timeline (statuts, postes, salaires) + dossier disciplinaire (`rhDiscipline.getEmployeeDossier`).
- [ ] Vue des fiches de paie de l'employé.
- [x] Permission « Voir salaires » (`rh.salaire.consulter`) : l'onglet Paie n'apparaît pas du tout si non autorisé.

### T5 — Actions rapides ✅ (fait le 19/09/2026)
- [x] Barre d'actions rapides dans la fiche → présences, absences, pointage, paie, compétences, évaluations, discipline, contrats, documents (pré-filtrés `?employeId=`).

### T6 — Sortie employé
- [ ] Flux dédié (date de sortie, motif), statut interne cohérent, cohérence avec le blocage pointage/paie.

### T7 — Permission « Voir salaires »
- [ ] Permission fine + masquage des salaires dans la liste et la fiche si non autorisé (cohérent avec le cahier des charges RH-01).

### T8 — Ancienneté
- [ ] Calcul centralisé (embauche → aujourd'hui) affiché dans la liste et la fiche.

## Vérification de chaque lot
1. Naviguer : liste → fiche → retour ; vérifier les blocs concernés.
2. `pnpm typecheck` (apps/nextjs) — hors échecs connus (geo, `.next/types`).
3. `graphify update .` pour maintenir le graphe.

## Suivi d'exécution

| Lot | Statut | Date | Notes |
|-----|--------|------|-------|
| T1 | ✅ Fait | 19/09/2026 | e2e 9/9 PASS ; typecheck OK sur les fichiers T1 |
| T2 | ✅ Fait | 19/09/2026 | Table + écriture create/update + getFiche + timeline. typecheck OK ; e2e étendu 11/11 PASS |
| T3 | ⬜ | | |
| T4 | 🟡 Presque | 19/09/2026 | Onglets + contrats, documents (expirations), congés, absences, pointage du mois, discipline, timeline branchés. Reste : fiches de paie |
| T5 | ✅ Fait | 19/09/2026 | Barre d'actions rapides vers les sous-modules pré-filtrés |
| T6 | ⬜ | | |
| T7 | 🟡 Partiel | 19/09/2026 | Onglet Paie masqué sans `rh.salaire.consulter` (masquage des salaires dans la liste restant) |
| T8 | ✅ Fait | 19/09/2026 | Ancienneté calculée et affichée dans l'en-tête sticky de la fiche |

---
**Fin plan correctif Fiches employés**