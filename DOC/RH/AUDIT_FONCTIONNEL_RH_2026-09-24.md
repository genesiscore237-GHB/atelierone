# AUDIT FONCTIONNEL RÉEL — MODULE RH (ATELIERONE / GPJ)

> **Date** : 2026-09-24 · **Type** : audit fonctionnel de bout en bout par navigation utilisateur réelle (lecture seule), recoupé avec la base de données (PostgreSQL `atelierone_erp`).
> **Contexte** : le registre d'exécution (phase 8) reflète des corrections statiques validées par vitest/tsc. Cet audit vérifie que les **36 fonctions attendues** sont réellement exploitables en tant qu'utilisateur.
> **Statut d'entrée** : aucune migration/code modifié pendant l'audit ; seul effet de bord = lignes `audit_logs` du compte admin.
> **Compte test** : `admin@gpj.cm` / `admin123` (super-admin agence). **Login** : attendre l'hydratation avant de soumettre (rate-limiter 5/15 min par clé, reset au succès).
> **Consigné par** : `INFRA-02` du registre. **Tickets ouverts** : `AUD-01`…`AUD-10` (BACKLOG, phase 9 proposée).

---

## VERDICT CENTRAL

### ❌ NON conforme — le test central échoue

Le **test central de l'audit** (« Un salarié présent un mois complet perçoit un bulletin correct, cohérent avec ses présences, sa fiche et les données de paie, sans erreur d'affichage ») **échoue** :

1. L'onglet **Bulletins** de la Paie **plante** systématiquement (`TypeError: Cannot read properties of undefined (reading 'map')`, écran « Une erreur est survenue ») — **26 bulletins invisibles**.
2. **3 autres écrans** (Disciplinaire, Compétences & Formations, Documents RH) affichent la même erreur React.
3. Le module **Analyse de période** renvoie **0 pour toute période** alors que **Mensuel & clôture** et le **Dashboard** affichent 147 jours présents pour septembre.
4. Le **widget « Salaire sur période »** du Pointage n'affiche **aucun montant**.
5. Les **bulletins en base** sont **incohérents** avec les fiches (bases 250 000/300 000/120 000 contre 200 000/200 000/1 000) et **Août = Septembre** à l'identique.
6. Un net de bulletin peut être **négatif** (−4 615,38 F pour l'employé 21), sans garde-fou.
7. Les **historiques de salaires sont vides** et les **fiches** affichent « Date d'embauche inconnue » ou « — » pour le salaire de base.

**Corollaire** : la **traçabilité de la paie est rompue** — impossible de rejouer un bulletin depuis ses données sources via l'UI, ni de vérifier un net.

---

## Méthodologie

- **Mini « Test plan »** : 36 tests couvrant Présences (1–10), Congés (11–16), Avances (17–20), Paie (21–32), Cohérence globale (33–36).
- **Preuves** : captures Playwright (écrans, logs console, réseau), requêtes SQL de recoupement (résumés, bulletins, soldes, masse salariale), scripts de sonde.
- **Serveur** : redémarré 3 fois pendant l'audit (instabilité de l'environnement de dev) ; dernier P-ID : 10400 sur le port 3000.
- **Statuts** : ✅ CONFORME · ⚠️ PARTIEL · ❌ NON CONFORME · ⭕ NON APPLICABLE · 🔎 NON TESTABLE.

---

## §38 — Résultat des 36 tests

| # | Test | Statut | Constat |
|---|---|---|---|
| 1 | Saisie du jour (pointage) | ✅ | Fonctionne (le 24/09) |
| 2 | Pointage en direct | ✅ | Route `/dashboard/rh/pointage-en-direct` opérationnelle (la route `/pointage` renvoie 404) |
| 3 | Présents (analyse de période) | ❌ | **0 partout** (Sept + Août) malgré 147 présents résumés |
| 4 | Absents (analyse de période) | ❌ | **0 partout** ; jours non comptés, seuls jours théoriques affichés |
| 5 | Heures travaillées | ❌ | **0 h** pour tous les employés toutes périodes |
| 6 | Retards / absences | ❌ | **0** partout (incroyant) |
| 7 | Heures supplémentaires | ❌ | **0** partout (aucune HS comptée) |
| 8 | Suivi HS (en UI) | ⚠️ | Le suivi global ne montre que ce que l'analyse renvoie (0) ; onglet ni présent ni visible |
| 9 | Résumé mensuel & clôture | ✅ | Affiche les vrais résumés : Symphonien 121h04/14 j/1 absence, Arnaud 120h11/14 j/1 absence ; 23 lignes |
| 10 | Clôture mensuelle | 🔎 | Impossible à déclencher via UI sans risque de mutation |
| 11 | Nouvelle demande de congé | ✅ | Formulaire 29 employés / 7 types de congé opérationnel |
| 12 | Validation d'une demande | ⚠️ | Une demande approuvée (Jean Vinny, Maladie, 1 j, « accident de travail ») mais **non débitée des soldes** |
| 13 | Soldes par type | ✅ | Tableau ~120 lignes (employé × 4 types) : Congé annuel, Maternité, Sans solde, Permission |
| 14 | Solde reflète le congé pris | ❌ | **PRIS = 0 partout** ; type « Maladie » absent du tableau des soldes |
| 15 | Calendrier des congés | ⭕ | Non testable en navigation (fonctionnalité non visible dans ce périmètre) |
| 16 | Absences justifiées | ⚠️ | Voie légitime unique = congés ; cellule d'absence justifiée non maîtrisée |
| 17 | Avance (flux complet) | 🔎 | Non testable en navigation (flow de création non visible sans mutation) |
| 18 | Lecture des avances | ✅ | Onglet Avances : « Aucune avance enregistrée pour cet employé. » (état vide correct) |
| 19 | Récupérations | ⭕ | Non visible dans le périmètre testé |
| 20 | Retenue sur bulletin | ⭕ | Non visible (bulletins inaccessibles, cf. test 27) |
| 21 | Salaire de base (fiche) | ⚠️ | Fiche 9 = 200 000 F (SALAIRE_HORAIRE), fiche 21 = 1 000 F (SALAIRE_HORAIRE), fiche 60 = « — » (SALAIRE_MENSUEL) |
| 22 | Mode de paie | ⚠️ | Énum bruts affichés (« SALAIRE_HORAIRE », « SALAIRE_MENSUEL ») |
| 23 | Historique des salaires | ⚠️ | « Aucun historique » partout |
| 24 | Cohérence fiche ↔ bulletins | ❌ | Bases bulletin ≠ fiches (250 k vs 200 k ; 300 k vs 200 k ; 120 k vs 1 k) |
| 25 | Périodes / clôture paie | ⚠️ | Deux périodes ; Août = Sept identiques en bulletins |
| 26 | Calcul de paie | 🔎 | Non testable (aucun bulletin lisible) ; vérifié en base → incohérences (test 27) |
| 27 | Bulletins (onglet Paie) | ❌ | **Crash** `TypeError … reading 'map'` (PaieRH.tsx:837) ; 26 bulletins invisibles |
| 28 | Détail d'un bulletin | 🔎 | Non testable (bulletins invisibles) ; vérifié en base (voir §38 bis) |
| 29 | Widget salaire sur période | ❌ | Aucun montant après sélection employé + dates (2016-09-01 → 09-24) |
| 30 | Vérification d'un net | 🔎 | Impossible via UI ; net négatif en base (−4 615,38 F, emp. 21) |
| 31 | Clôture + CNPS | ⚠️ | Paramètres présents (4,5 % / 5,6 % sur durée), calcul non vérifiable (bulletins invisibles) |
| 32 | Export (CSV / PDF) | ⚠️ | Boutons présents et gatés ; PDF bulletin inatteignable (bulletins invisibles) |
| 33 | Dashboard cohérent | ❌ | KPI présents (147/416 = 35,3 % ; 15 absences ; 1 171 000 masse) mais contredits par l'analyse de période (test 3) |
| 34 | Recherche / filtres | ✅ | Employés : recherche « Ntsoli » → 1 résultat ; filtre statut SORTI → 3 résultats |
| 35 | Écrans sans erreur | ❌ | 5 écrans en erreur (Bulletins + sanctions + compétences + documents) |
| 36 | Montants financiers cohérents | ❌ | −4 615,38 F ; HS 0,5 h sans autorisation ; masses contradictoires |

### Synthèse §39

| Statut | Nombre | Détail |
|---|---|---|
| ✅ CONFORME | 8 | 1, 2, 9, 11, 13, 18, 34 (et lecture) |
| ⚠️ PARTIEL | 8 | 8, 12, 16, 21, 22, 23, 25, 31, 32 |
| ❌ NON CONFORME | 12 | 3, 4, 5, 6, 7, 14, 24, 27, 29, 33, 35, 36 |
| ⭕ NON APPLICABLE | 4 | 15, 19, 20 |
| 🔎 NON TESTABLE | 4 | 10, 17, 26, 28, 30 |
| **Total** | **36** | **Verdict** : échec du test central |

---

## §38 bis — Erreurs de calcul / incohérences de paie (vérifiées en base)

| Fait | Valeur | Source |
|---|---|---|
| Base bulletin emp. 9 (Symphonien) | **250 000** | Fiche = 200 000 |
| Base bulletin emp. 11 | **300 000** | Fiche = 200 000 |
| Base bulletin emp. 21 (Arnaud) | **120 000** | Fiche = 1 000 |
| Net emp. 9 (1 j présent, 9,5 h) | **10 067,13 F** | — |
| Net emp. 11 (1 j, 9,5 h, 0,5 h HS) | **13 034,29 F** | HS non justifiable (aucune autorisation) |
| Net emp. 21 (0 j, 1 absence) | **−4 615,38 F** | Retenue « base/26 j » — **plancher absent** |
| Bulletin Août vs Septembre | **identiques** | Données non rejouables |
| Historique des salaires | **vide** | « Aucun historique » |
| Fiche emp. 60 | **« — »** | Salaire non renseigné en base |

**Note** : le moteur applique des bases/modes contradictoires et aucune **snapshot de la base au moment du calcul** ne permet de rejouer le bulletin — traçabilité rompue (§38 quinquies).

---

## §38 ter — Navigation / UX

- **Mensuel & clôture** : tableau exploitable (résumés corrects) ✓
- **Pointage en direct** : saisie fonctionnelle ✓
- **Employés** : recherche + filtres statut fonctionnels ✓
- **Congés** : formulaire complet (29 employés, 7 types), solder par type présent ✓

---

## §38 quater — Permissions

Audit conduit en **super-admin** : les branches de permission (rôles restreints, refus FORBIDDEN) **n'ont pas pu être exercées**. Elles restent couvertes par les tests unitaires du registre (vitest) — non re-vérifiées « à la main » ici. Les boutons gatés au niveau serveur (export CSV, impression, historique…) ne peuvent être validés en navigation super-admin que par absence d'erreur, pas par le refus.

---

## §38 quinquies — Traçabilité

- Historiques de salaires **vides** (test 23).
- Bulletins **non rejouables** : les données lues en base ne correspondent pas aux fiches, et la période Août est identique à Septembre.
- Aucun lien visible (base snapshot, autorisation d'absence, générateur de net) entre le bulletin et ses données source.
- **Verdict partiel** : les mécanismes de snapshot existent (P13), mais **rien ne les relie** à ce que l'UI affiche ou permet de vérifier.

---

## §38 sexies — Risques

1. **Cash** : bulletin illisible ⇒ risque de payer faux (mauvaises bases, net négatif).
2. **Conformité CNPS** : assiette non vérifiable, HS non appuyées.
3. **Exactitude** : sources de présence multiples (analyse vs résumé) contradictoires — données en double.
4. **Discipline / compétences / docs** : écrans en erreur = module RH partiellement inutilisable.
5. **Démo** : bases de démonstration incohérentes (embauches inconnues, salaires manquants).

---

## §38 septies — Recommandations (ordre de priorité)

1. **Réparer Bulletins** (AUD-01, P0) — crash `map` à l'onglet.
2. **Réparer les 3 écrans en erreur React** (AUD-02).
3. **Aligner les sources de présence** (AUD-03) — résumés / analyse / dashboard / widget.
4. **Plancher de net** ou différé de retenue (AUD-04, P0).
5. **Rendre les bulletins rejouables** (AUD-05) : base snapshot au calcul + lien présences.
6. **Widget salaire sur période** (AUD-06).
7. **Soldes cohérents avec les demandes approuvées** (AUD-07).
8. **Harmoniser libellés / énum / statuts / données de démo** (AUD-08 à AUD-10).

---

## §39 — Reproduire (pré-requis « test plan »)

- Login hydraté (15 s, retry 20 s) ; serveur stable (port 3000).
- 1 kj présent sur Septembre existant (Symphonien/Arnaud).
- 1 employé avec présence de base NULL.

---

## Preuves (artefacts)

| Artefact | Description |
|---|---|
| `paie-bulletins-crash.png` | Capture écran « Une erreur est survenue » (onglet Bulletins) |
| `sanctions-probe-final.txt` | Sonde page Disciplinaire (erreur React) |
| `probeall-summary.json` | Récapitulatif des sondes des écrans |
| `walk2-evidence.json` | Parcours navigation + captures |
| `interact*.log` / `interact-*.txt` | Journaux Playwright (présences, congés, paie, pointage) |

---

## Intégration au registre

- Tickets : **AUD-01 … AUD-10** (BACKLOG, priorité P0–P2, phase 9 proposée) — voir `RH_EXECUTION_REGISTER.md`.
- Périmètre & règles : inchangés (source des lignes P01…F27 / N01…N20 : rapport `DOC/MODULES/AUDIT/rapport-audit-module-rh-2026-09-23.md`).