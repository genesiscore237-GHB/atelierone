# 📖 NOTICE — Gestion_Personnel_Garage_Polyvalent_Junior_PRO **V4 / V5**

> **⚠️ DEUX VERSIONS DISPONIBLES — laquelle utiliser ?**
> - **`GPJ_PRO_V5_STRUCTURE_ORIGINALE.xlsx`** ← **RECOMMANDÉE** : VOTRE fichier d'origine, patché en place.
>   Structure 100 % identique (tables structurées `Employes`/`Pointage`, couleurs, séparateurs rouges,
>   mises en forme) + corrections de données + protections. C'est la continuité directe de votre travail.
> - `GPJ_PRO_V4_CORRIGE.xlsx` : reconstruction propre alternative (autre habillage, 500 lignes pré-armées,
>   sans tableaux structurés). Garde-la comme secours/backup.

> Généré le 2026-08-24 depuis votre fichier réel (`Gestion_Personnel_Garage_Polyvalent_Junior_PRO_CORRIGE.xlsx`).
> Mot de passe des feuilles (V4 et V5) : **GPJ2026**.

---

## 0. Ce que le patch V5 a modifié dans votre fichier d'origine (et rien d'autre)

| Correction | Détail |
|---|---|
| 15 dates texte `8/262026` | → vraies dates 26/08/2026 (colonne A Pointage) |
| 13 IDs minuscules | → MAJUSCULES (`emp002`→`EMP002`) |
| Heures réelles | **Préservées à l'identique** (07:15→18:10, etc.) |
| 336 cellules jaunes FFF2CC | Déverrouillées (saisibles sur feuille protégée) |
| Validations ajoutées | IDs employés (liste), codes présence, Oui/Non, contrôle de date |
| 12 feuilles | Protégées `GPJ2026`, sélection libre, formats libres |

Rien d'autre n'a bougé : tables structurées, séparateurs rouges, notes, formules, dispositions — intacts.

## 1. Ce qui a été corrigé automatiquement

| # | Défaut dans l'ancien fichier | Correction appliquée |
|---|---|---|
| 1 | Dates en texte `8/262026` (lignes 35+) | Converties en vraies dates **26/08/2026** (format JJ/MM/AAAA) |
| 2 | IDs minuscules `emp002` (lignes 21+) | Remis en **MAJUSCULES** `EMP002` (RECHERCHEV fonctionne à nouveau) |
| 3 | Lignes vides intercalées (19, 34…) | **Supprimées** — les totaux Paie repartent juste |
| 4 | Heures fantômes `00:00` | Vidées si parasites ; journées codées A/R/HS/P sans heures fiables **reconstituées aux heures standards** (7h30-18h, sam 7h30-12h) |
| 5 | Aucune protection | **12 feuilles protégées** (mot de passe `GPJ2026`) : seules les cellules JAUNES sont modifiables |
| 6 | Pas de validations | Listes déroulantes (IDs employés, codes présence, Oui/Non, types, statuts), contrôles date/heure/salaire |
| 7 | Anomalies invisibles | Ligne **ROSE** = retard > 15 min · ligne **GRISE** = séparateur · HS en vert foncé |
| 8 | EMP014 absent de Contrats/Compétences/Planning | Les 25 lignes pré-armées le couvrent automatiquement |

## 2. Structure (identique à votre habitude)

`00_Dashboard` → `00_Parametres` → `01_Employes` (source de vérité, 14 employés dont Zo'o Mbarga Jean Loic) → `02_Pointage` (500 lignes pré-armées) → `03_Paie` (période B5/D5) → `04_Conges` → `05_Contrats` (alerte ≤ 30 j) → `06_Competences` → `07_Planning` → `08_Sanctions` → `09_Contacts` → `10_Mode_Emploi`.

Les formules utilisent des plages classiques étendues (`'02_Pointage'!$Q$6:$Q$505`…) : **plus besoin de tableau structuré**, ajoutez simplement vos lignes à la suite.

## 3. Installation & utilisation de la macro de maintenance (5 min)

> ⚠️ **Après l'importation, la macro ne s'exécute pas toute seule** — il faut la lancer :

1. Ouvrez le fichier → **Fichier ▸ Enregistrer sous ▸ Type : Classeur Excel (prenant en charge les macros) \*.xlsm**
2. **Alt + F11** → Fichier ▸ **Importer un fichier…** → `MACRO_Correction_GPJ.bas` → fermez l'éditeur
   *(le code apparaît dans un module « MACRO_Correction_GPJ » à gauche ; c'est normal que rien d'autre ne se passe)*
3. **Pour l'exécuter : retournez dans Excel → `Alt + F8` → sélectionnez `Correction_Complete_GPJ` → Exécuter**
   → une boîte de dialogue récapitule les corrections effectuées.
4. Si Excel affiche « ⚠ Les macros ont été désactivées » : cliquez **Activer le contenu**, ou
   Fichier ▸ Options ▸ Centre de gestion de la confidentialité ▸ Paramètres ▸ Paramètres des macros ▸
   « Désactiver les macros avec notification ».

*(Optionnel : Développeur ▸ Insérer ▸ Bouton sur 00_Dashboard ▸ assigner `Correction_Complete_GPJ`.)*

## 3-bis. 🛠️ Dépannage « Je ne peux rien saisir »

| Symptôme | Solution |
|---|---|
| Impossible de cliquer/taper nulle part | C'était le défaut de la **V3** (sélection bloquée). Le fichier **V4** livré le corrige — vérifiez que vous avez bien ouvert `GPJ_PRO_V4_CORRIGE.xlsx` |
| Message « La cellule ou le graphique est protégé… » sur une cellule | Vous visez une cellule **VERTE** (calculée). Saisissez uniquement dans les **JAUNES** |
| Besoin urgent de tout débloquer | **Révision ▸ Ôter la protection de la feuille** ▸ mot de passe `GPJ2026` (feuille par feuille) |
| Le fichier s'ouvre en « Mode protégé » (bandeau jaune) | Cliquez **Activer la modification** |

## 4. Règles d'or (rappel)

1. ❌ Ne coloriez JAMAIS une ligne entière manuellement — les gris/roses sont automatiques.
2. ❌ N'insérez jamais de ligne au milieu — ajoutez EN BAS (500 lignes déjà armées).
3. ✅ Dates `JJ/MM/AAAA` · heures `HH:MM` (7:30, pas 7h30) · IDs `EMP###` majuscules.
4. ✅ Cellules JAUNES = à vous · VERTES = calculées (protégées).
5. ✅ Sauvegarde mensuelle : `GPJ_BACKUP_AAAA_MM.xlsx`.

## 5. Données conservées (contrôle qualité)

- **14 employés** EMP001→EMP014 (salaires réels : 150000 / 100000 / 150000 / 120000 / 80000×9 / 200000 / 80000)
- **41 pointages valides** sur 3 jours (24, 25, 26 août 2026) avec heures réelles préservées
  (ex. EMP001 lun 24 : 07:15→18:10 ; EMP002 : 07:30→19:00 code HS ; EMP003 : 08:00→17:30 retard)
- Paramètres d'origine : Lun-Ven 7h30-18h (pause 1h) · Sam 7h30-12h · Dim repos · taux HS ×1,5 · seuil 9,5 h

---
*Fichier généré programmatiquement (ExcelJS) et vérifié : ordre des onglets, protections actives sur les 12 feuilles, formules clés contrôlées.*
