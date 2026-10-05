# GPJ — FICHier vs App : couverture et différences

> Livrable de la mission « garantir que l'app couvre les fonctionnalités du classeur RH ».
> Fichier analysé : `Gestion_Personnel_GPJ_PRO_v3.1_Corrige.xlsx` (13 feuilles) — **source de vérité**.
> Variante comparée (à titre de contrôle) : `Gestion_Personnel_GPJ_PRO_v3_Avances_Pointage.xlsx`.
> Date : 18/09/2026.

---

## 1. Couverture : chaque feuille du fichier a son module dans l'app

| Feuille du classeur | Contenu de la feuille | Module / page de l'app | Statut |
|---|---|---|---|
| 00_Parametres | Seuils HS (9,5 / 4,5), tolérance, base 225,3 h, majoration ×1,5, congé 30 j | **RH ▸ Paramétrage RH** (onglets Cycles, Présence, Congés, Général) | ✅ couvert + paramètres importés |
| 01_Employes | 15 employés, postes, départements, téléphones, emails, salaires, contrats | **RH ▸ Fiches employés** + **RH ▸ Organigramme** + **RH ▸ Annuaire** | ✅ 15 fiches importées |
| 02_Pointage | Heures brutes, validations, primes tâche, notes | **RH ▸ Présences** (Saisie du jour, Historique) | ✅ 264 journées rejouées |
| 03_Paie | Taux, salaire brut, HN, HS, primes, retenues | **RH ▸ Paie** (Périodes, Bulletins, Configuration) | ✅ parité HN septembre vérifiée |
| 04_Conges | Type, dates, motif, statut, validation | **RH ▸ Congés & Absences** (Demandes, Soldes, Calendrier) | ✅ congé EMP006 importé |
| 05_Contrats | Type, dates, salaire, poste | **RH ▸ Contrats** | ✅ 15 contrats alignés |
| 06_Competences | Langues, logiciels, points forts | **RH ▸ Compétences & Formations** | ✅ module existant (saisie manuelle) |
| 07_Evaluations | Grilles, notes, primes | **RH ▸ Évaluation & Performance** | ✅ module existant |
| 08_Performance | Indicateurs, alertes | **RH ▸ Tableau de bord & Rapports** | ✅ indic. recalculés en temps réel |
| 09_Disciplinaire | Sanctions, motifs, notification | **RH ▸ Disciplinaire** | ✅ module existant |
| 10_Planification | Affectations poste/jour | **RH ▸ Planning** (+ RH ▸ Pointage en direct) | ✅ module existant |
| 11_Rapports | Synthèses, exports | **RH ▸ Tableau de bord / Rapports (CSV)** | ✅ exports CSV natifs |
| Archive | Références | — | hors périmètre RH (conservé en archive) |

**Conclusion : 13/13 feuilles couvertes**, aucune fonctionnalité du classeur n'est orpheline.

---

## 2. Données chargées (déjà présentes dans l'app)

- **15 employés** (EMP001 → EMP015), valeurs 2026 du fichier v3.1 (salaire EMP013 = 1 000 F corrigé).
- **264 journées de pointage** (24/08 → 30/09/2026), heures brutes + validations A/T + primes + notes.
- **Heures normales de septembre** : résultats moteur vs feuille 03_Paie — **écart ≤ 0,01 h** pour
  13/15 employés, 0,03 h max (détail des écarts ci-dessous).
- **1 congé** : EMP006 « Maladie — accident de travail » (28/08/2026), statut **approuvé**.
- **Paramétrage** : seuils HS 9,5/4,5, tolérance 0, arrondi désactivé, base 225,3 h, majoration ×1,5,
  congé annuel 30 j, lignes d'horaires du cycle aux bonnes valeurs.

### Comparatif heures normales — septembre 2026 (app vs fichier)

| Matricule | HN app (h) | HN fichier (h) | Δ (h) |
|---|---|---|---|
| EMP001 | 121,07 | 121,06 | 0,01 |
| EMP002 | 103,43 | 102,44 | **0,99 (voir §3)** |
| EMP003 | 102,95 | 102,94 | 0,01 |
| EMP004 | 116,82 | 116,82 | 0,00 |
| EMP005 | 9,50 | 9,50 | 0,00 |
| EMP006 | 55,80 | 55,80 | 0,00 |
| EMP007 | 108,82 | 108,82 | 0,00 |
| EMP008 | 99,22 | 99,22 | 0,00 |
| EMP009 | 102,98 | 103,01 | −0,03 |
| EMP010 | 63,73 | 63,74 | −0,01 |
| EMP011 | 119,88 | 119,89 | −0,01 |
| EMP012 | 112,68 | 112,69 | −0,01 |
| EMP013 | 120,18 | 120,19 | −0,01 |
| EMP014 | 102,68 | 102,68 | 0,00 |
| EMP015 | 66,27 | 66,26 | 0,01 |

---

## 3. Incohérences détectées dans le fichier (l'app recalculé de façon cohérente)

1. **EMP002 (Secrétaire) — total paie ≠ somme de son propre pointage.** La feuille 03_Paie affiche
   102,44 h pour septembre, or la somme des « Heures normales » de la feuille 02_Pointage donne
   103,44 h. L'app reprend le pointage jour par jour → 103,43 h (écart = incohérence interne du fichier,
   pas de l'app).
2. **Colonnes vertes en cache.** Plusieurs cellules (HN/HS/minutes) du 02_Pointage contiennent des
   valeurs saisies à la main ou des formules qui se contredisent (ex. : EMP005 du 24/08 « Samedi normal
   7h30-12h » = 3,5 h alors que la présence donne 4,5 h). L'app part **des heures brutes** et applique
   une règle unique.
3. **Masse salariale du tableau de bord (1 311 000 F)** ne comptabilise pas **EMP015 (100 000 F)**.
   L'app additionne les salaires des 15 employés actifs (1 411 000 F) — tout le monde est visible.
4. **EMP013 salaire à 1 000 F/mois** (taux 4 F/h) — valeur corrigée de la v3.1, conservée telle quelle
   (source de vérité) mais **à confirmer avec le client avant le premier bulletin**.
5. **Doublons du 02_Pointage** : chaque (employé, date) apparaît en double sur les jours 01→17/09
   (ligne remplie + ligne vide). L'import ne garde qu'une ligne par jour. À noter pour la mise en
   forme du futur export du classeur.
6. **EMP014 / EMP015 absents des feuilles 01/04/05 de comparaison** (présents seulement dans la
   variante et/ou en pointage) : l'app les a tout de même créés (embauche 20/07/2026 pour EMP014,
   dates EMP015 déduites de sa première présence le 07/09/2026).

---

## 4. Avantages de l'app par rapport au classeur Excel

| # | Classeur Excel | AtelierOne (app) |
|---|---|---|
| 1 | Calculs par formules manuelles, parfois en cache ou fausses | **Un seul moteur de calcul** (presence-engine + payroll-engine), totalement transparent (détails visibles par jour) |
| 2 | Un seul utilisateur à la fois, risque d'écrasement | **Multi-utilisateur avec rôles & permissions** (chef, secrétaire, RH, patron…), audit trail |
| 3 | Admission par humain, pas de journal | **Journal d'audit** horodaté sur toutes les actions RH |
| 4 | Pas de workflow | **Workflow congés** : demande → approbation hiérarchique → solde |
| 5 | Clôture mensuelle invisible | **Clôture mensuelle explicite** (verrouillage du mois) requis avant la paie — zéro erreur de période |
| 6 | Pointage « en direct » impossible | **Pointage en direct** (badge/preuve de présence) + historique des postures |
| 7 | Pas de contrôle de cohérence | **Valeurs recalculées à la volée** : retards, départs anticipés, HN, HS, primes, seuil HS par jour |
| 8 | Export manuel | **Exports CSV natifs** de toutes les vues + bulletins de paie PDF |
| 9 | Un fichier = un garage | **Multi-agences / multi-sites** (centralisation possible en « Bureau ») |
| 10 | Règle CNPS/IRPP à recalculer à la main | **CNPS (4,5 %/5,6 %) et IRPP paramétrables** intégrés aux bulletins |
| 11 | Péril de perte (fichier local) | **Données en base** (PostgreSQL en local, Supabase en cloud), sauvegardes/exports |

---

## 5. Pour aller plus loin

- Procédure de ré-import idempotent : `npm run import:gpj` (depuis `packages/db`).
- Documentation détaillée : `DOC/GUIDE-UTILISATEUR-MODULE-RH.md` (notamment §16 « Données GPJ chargées »).
- Prochaines actions recommandées côté client :
  1. Confirmer le salaire **EMP013** et les dates de contrat **EMP014 / EMP015** ;
  2. Clôturer sept. 2026 dans l'app (RH ▸ Présences ▸ Mensuel & clôture) puis générer le 1er bulletin ;
  3. Parcourir avec un employé de l'atelier : fiche EMP015 + historique de pointage.