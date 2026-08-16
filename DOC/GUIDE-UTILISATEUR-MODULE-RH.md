# GUIDE UTILISATEUR — MODULE PERSONNEL (RH)
## AtelierOne — Garage Polyvalent Junior (GPJ)

> **Version :** 1.0 — couvre les modules RH-00 à RH-09 (module Personnel complet)
> **Public :** Directeur, Responsable RH, Chefs d'atelier, Comptables, Employés
> **Prérequis techniques :** aucun — ce guide explique tout, y compris la configuration initiale.

---

## Sommaire

1. [Vue d'ensemble du module Personnel](#1-vue-densemble-du-module-personnel)
2. [Prise en main rapide (parcours 15 minutes)](#2-prise-en-main-rapide-parcours-15-minutes)
3. [Configuration initiale obligatoire — RH-00 (à faire avant toute utilisation)](#3-configuration-initiale-obligatoire--rh-00)
4. [Fiches Employés & Organigramme — RH-01](#4-fiches-employés--organigramme--rh-01)
5. [Présences & Temps de travail — RH-02](#5-présences--temps-de-travail--rh-02)
6. [Congés & Absences — RH-03](#6-congés--absences--rh-03)
7. [Paie — RH-04](#7-paie--rh-04)
8. [Évaluation & Performance — RH-05](#8-évaluation--performance--rh-05)
9. [Compétences & Formations — RH-06](#9-compétences--formations--rh-06)
10. [Disciplinaire — RH-07](#10-disciplinaire--rh-07)
11. [Documents RH — RH-08](#11-documents-rh--rh-08)
12. [Tableau de bord & Rapports — RH-09](#12-tableau-de-bord--rapports--rh-09)
13. [Règles métier transverses (référence)](#13-règles-métier-transverses--référence)
14. [FAQ globale](#14-faq-globale)
15. [Glossaire](#15-glossaire)

---

## 1. Vue d'ensemble du module Personnel

### 1.1 À quoi sert ce module ?

Le module **Personnel (RH)** est le système de gestion des ressources humaines du garage. Il couvre **tout le cycle de vie d'un employé**, de son recrutement à son départ :

| Domaine | Ce que le module gère |
|---|---|
| **Paramétrage** | Horaires, cycles de travail, tolérances, types de congés, sanctions, jours fériés, matricule |
| **Employés** | Fiches complètes, affectations, hiérarchie, historiques de salaire et de poste |
| **Temps de travail** | Présences quotidiennes, heures supplémentaires, retards, clôture mensuelle |
| **Congés** | Soldes annuels, demandes, validations, calendrier des absences |
| **Paie** | Bulletins mensuels, CNPS, IRPP camerounais, paiements (Espèces/MoMo/OM), PDF |
| **Performance** | Grilles d'évaluation, campagnes, notes pondérées, prime de performance |
| **Compétences** | Référentiel, matrice par employé, détection des écarts, plan de formation |
| **Discipline** | Sanctions, dossier disciplinaire, détection de récidive |
| **Documents** | Contrats, pièces d'identité, certificats + alertes d'expiration |
| **Pilotage** | Tableau de bord, alertes, rapports exportables |

### 1.2 Les 11 sous-modules et leurs priorités

| Sous-module | Page | Priorité | Rôle principal |
|---|---|---|---|
| Tableau de bord RH | `/dashboard/rh/tableau-de-bord` | P1 | Vue d'ensemble + rapports |
| Paramétrage RH | `/dashboard/rh/parametrage` | **P0 — Fondations** | Tout configurer avant utilisation |
| Fiches employés | `/dashboard/rh/employes` | P0 | Référentiel des employés |
| Organigramme | `/dashboard/rh/organigramme` | P0 | Arbre hiérarchique |
| Présences | `/dashboard/rh/presences` | P0 | Pointage et heures |
| Congés & Absences | `/dashboard/rh/absences` | P1 | Soldes et demandes |
| Paie | `/dashboard/rh/paie` | P1 | Bulletins et paiements |
| Évaluation & Performance | `/dashboard/rh/evaluations` | P2 | Notes et primes |
| Compétences & Formations | `/dashboard/rh/competences` | P2 | Matrice et formations |
| Disciplinaire | `/dashboard/rh/sanctions` | P2 | Sanctions et récidive |
| Documents RH | `/dashboard/rh/documents` | P2 | Contrats et expirations |

> **Ordre recommandé de découverte :** Paramétrage → Fiches employés → Présences → Congés → Paie → puis les modules P2 (Évaluation, Compétences, Disciplinaire, Documents) → Tableau de bord.

### 1.3 Les rôles et leurs permissions (qui peut faire quoi ?)

| Action | Directeur | Responsable RH | Chef d'atelier | Secrétaire | Comptable | Employé |
|---|---|---|---|---|---|---|
| Configurer le paramétrage RH | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Créer / modifier une fiche employé | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Voir les salaires | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ (sa fiche seulement) |
| Saisir les présences | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Autoriser les heures sup. | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Clôturer le mois de présences | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Valider une demande de congé | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Préparer et valider la paie | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Voir son propre bulletin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gérer l'évaluation et la discipline | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Exporter les rapports | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |

> Les boutons et menus auxquels vous n'avez pas accès sont **masqués ou désactivés** automatiquement. Le serveur vérifie toujours les permissions (aucun contournement possible).

### 1.4 Principes de fonctionnement importants

1. **Tout est paramétrable** : aucune valeur métier n'est codée en dur. Horaires, taux de paie, types de congés, sanctions, grilles — tout se configure dans le Paramétrage RH et s'applique immédiatement.
2. **Les présences alimentent la paie** : on ne peut pas calculer la paie d'un mois sans avoir **clôturé les présences** de ce mois.
3. **Les congés approuvés alimentent les présences** : un congé validé marque automatiquement les jours correspondants en « congé » dans les présences.
4. **Les évaluations alimentent la paie** : la note globale peut déclencher automatiquement une prime de performance.
5. **Toute action sensible est tracée** (journal d'audit) : qui a modifié un salaire, validé un congé, clôturé un mois, etc.
6. **Des alertes vous préviennent** : documents expirés, contrats arrivant à échéance, récidive disciplinaire, évaluations en retard.

---

## 2. Prise en main rapide (parcours 15 minutes)

Ce parcours vous permet de voir le module fonctionner de bout en bout. Chaque étape est détaillée dans sa section dédiée.

| # | Étape | Où | Section |
|---|---|---|---|
| 1 | **Se connecter** avec votre compte (ex. : directeur@gpj.cm) | Page de connexion | — |
| 2 | Ouvrir **Personnel (RH)** depuis le Bureau ou la barre latérale | `/dashboard/rh` | — |
| 3 | Vérifier le **Paramétrage RH** (les valeurs par défaut du garage sont déjà pré-remplies) | Paramétrage RH | [Section 3](#3-configuration-initiale-obligatoire--rh-00) |
| 4 | Créer un **employé** (le matricule est généré automatiquement) | Fiches employés | [Section 4](#4-fiches-employés--organigramme--rh-01) |
| 5 | Saisir la **présence du jour** pour cet employé | Présences | [Section 5](#5-présences--temps-de-travail--rh-02) |
| 6 | Créer une **demande de congé** et la valider | Congés & Absences | [Section 6](#6-congés--absences--rh-03) |
| 7 | Clôturer le mois de présences | Présences → Mensuel & clôture | [Section 5](#5-présences--temps-de-travail--rh-02) |
| 8 | **Préparer la paie** et télécharger un bulletin PDF | Paie | [Section 7](#7-paie--rh-04) |
| 9 | Consulter le **Tableau de bord RH** (KPI + alertes) | Tableau de bord RH | [Section 12](#12-tableau-de-bord--rapports--rh-09) |

> 💡 **Besoin d'aide à tout moment ?** Cliquez sur le bouton **« ? »** en haut à droite de l'écran : il affiche l'aide de la page où vous vous trouvez.

---

## 3. Configuration initiale obligatoire — RH-00

> ⚠️ **IMPORTANT — à faire AVANT toute utilisation.** Le paramétrage détermine le comportement de tout le module. Les valeurs par défaut (garage) sont déjà pré-remplies lors de l'installation, mais vous devez les **vérifier et les adapter** à votre organisation.

**Accès :** Personnel (RH) → **Paramétrage RH** (`/dashboard/rh/parametrage`)

Le paramétrage contient **6 onglets**. Voici ce que chacun contient, pourquoi c'est important, et les valeurs par défaut.

### 3.1 Onglet « Cycles » — les horaires de travail

Un **cycle de travail** est un planning hebdomadaire (un emploi du temps par jour de la semaine).

**Pourquoi c'est important :** le système calcule automatiquement les heures de présence, les retards et les heures supplémentaires **en fonction du cycle affecté à chaque employé**.

**Valeur par défaut — Cycle « Atelier Standard » :**

| Jour | Heure début | Heure fin | Pause | Heures attendues |
|---|---|---|---|---|
| Lundi | 07:30 | 18:00 | 13:00 – 14:00 | 9 h 30 |
| Mardi | 07:30 | 18:00 | 13:00 – 14:00 | 9 h 30 |
| Mercredi | 07:30 | 18:00 | 13:00 – 14:00 | 9 h 30 |
| Jeudi | 07:30 | 18:00 | 13:00 – 14:00 | 9 h 30 |
| Vendredi | 07:30 | 18:00 | 13:00 – 14:00 | 9 h 30 |
| Samedi | 07:30 | 12:00 | — | 4 h 30 |
| Dimanche | — | — | — | Non travaillé |

**Comment faire :**
1. Modifiez les heures d'un jour en cliquant sur l'heure correspondante, puis **Enregistrer**.
2. Pour créer un cycle différent (ex. : « Cycle administratif », « Cycle magasin »), cliquez sur **+ Nouveau cycle**, nommez-le, définissez ses horaires, puis Enregistrer.
3. Vous pourrez affecter ce cycle à chaque employé dans sa fiche (Section 4).

### 3.2 Onglet « Présence » — tolérances et règles de calcul

Ce sont les règles qui pilotent le calcul automatique des présences.

| Paramètre | Défaut | Explication |
|---|---|---|
| **Tolérance de retard** | 5 minutes | Au-delà de 5 min d'arrivée tardive, l'employé est marqué « retard » |
| **Arrondi des heures** | 5 minutes | Les heures sont arrondies au multiple de 5 min |
| **Déduction automatique de la pause** | Oui | La pause du cycle est retirée automatiquement du temps de présence |
| **Plafond d'heures normales / jour** | 8 h 30 | Au-delà, le temps n'est compté qu'en heures sup. (si autorisées) |
| **Compter l'arrivée anticipée** | Oui | Les minutes avant l'heure de début comptent dans le temps de présence |

**Comment faire :** modifiez une valeur puis cliquez sur **Enregistrer**. Les changements s'appliquent immédiatement aux prochains calculs.

### 3.3 Onglet « Congés » — les types de congés

Liste des types de congés disponibles. **Par défaut (7 types) :**

| Type | Payé ? | Décompte du solde ? | Justificatif requis ? | Couleur |
|---|---|---|---|---|
| Congé annuel | ✅ | ✅ | ❌ | Bleu |
| Maladie | ✅ | ✅ | ✅ | Rouge |
| Maternité | ✅ | ✅ | ✅ | Rose |
| Permission | ✅ | ✅ | ❌ | Vert |
| Sans solde | ❌ | ✅ | ❌ | Gris |
| Formation | ✅ | ❌ | ✅ | Indigo |
| Autre | ❌ | ❌ | ❌ | Orange |

**Pourquoi c'est important :** chaque demande de congé doit choisir un de ces types. Le système utilise ces réglages pour calculer le solde et l'impact sur la paie.

**Comment faire :** cliquez sur **+ Nouveau type**, remplissez les champs, Enregistrer. Vous pouvez aussi supprimer un type non utilisé.

### 3.4 Onglet « Sanctions » — les sanctions disciplinaires

Types de sanctions disponibles, **classés par gravité (1 à 5)**. Par défaut :

| Code | Type | Gravité |
|---|---|---|
| AVERT_ORAL | Avertissement oral | 1 (légère) |
| AVERT_ECRIT | Avertissement écrit | 2 |
| MISE_A_PIED_1 | Mise à pied 1-3 jours | 3 |
| MISE_A_PIED_2 | Mise à pied 4-8 jours | 4 |
| LICENCIEMENT | Licenciement | 5 (maximale) |

**Pourquoi c'est important :** le module Disciplinaire (Section 10) utilise la gravité pour détecter les **récidives** et proportionner les sanctions.

### 3.5 Onglet « Fériés » — le calendrier des jours fériés

Jours fériés officiels du Cameroun, **reconduits chaque année** (par défaut 6) :

| Date | Fête |
|---|---|
| 01 janvier | Nouvel An |
| 11 février | Fête de la Jeunesse |
| 01 mai | Fête du Travail |
| 20 mai | Fête Nationale |
| 15 août | Assomption |
| 25 décembre | Noël |

**Pourquoi c'est important :** les jours fériés sont exclus du calcul des jours ouvrés (taux de présence, acquisition de congés).

**Comment faire :** ajoutez un férié avec **+ Ajouter un férié** (date + nom), supprimez un férié si nécessaire.

### 3.6 Onglet « Général » — matricule et paramètres généraux

| Paramètre | Défaut | Explication |
|---|---|---|
| **Préfixe de matricule** | GPJ | Le matricule des employés commencera par GPJ |
| **Séquence matricule** | calculée automatiquement | Le prochain matricule sera GPJ-9001, puis GPJ-9002… |
| **Fuseau horaire** | Africa/Douala | Heure de référence du garage |
| **Devise** | XAF (FCFA) | Devise affichée dans le module |
| **Acquisition annuelle de congés** | 30 jours | Base du prorata des soldes (2,5 j/mois) |
| **Fenêtre disciplinaire (récidive)** | 12 mois | Période glissante pour compter les avertissements |
| **Évaluations activées** | Oui | Active le module Évaluation |

**Matricule automatique :** chaque nouvel employé reçoit un matricule unique de la forme **GPJ-9XXX** sans aucune action de votre part. Si une séquence a été désynchronisée, le système reprend automatiquement le numéro le plus élevé existant.

---

## 4. Fiches Employés & Organigramme — RH-01

### 4.1 Objectif

Gérer le référentiel complet des employés : identité, contrat, poste, hiérarchie, historique. **Tous les autres modules (présences, paie, évaluation…) s'appuient sur les fiches employés.**

### 4.2 Fiches employés (`/dashboard/rh/employes`)

**Créer un employé :**
1. Cliquez sur **+ Nouvel employé**.
2. Remplissez le formulaire — **sections** :

| Section | Champs |
|---|---|
| **Identité** | Civilité (M./Mme), nom, prénom, date et lieu de naissance, téléphone, email, personne à contacter en cas d'urgence, NIU |
| **Contrat** | Type de contrat (CDI, CDD, Stage, Temporaire, Prestation), salaire de base, N° CNPS, date d'embauche |
| **Affectation** | Département, poste, **cycle de travail** (issu du paramétrage RH-00), supérieur hiérarchique (manager) |
| **Notes** | Notes internes |

3. Cliquez sur **Enregistrer**. Le matricule (ex. : GPJ-9010) est attribué automatiquement.

**Fonctionnalités de la liste :**
- **Recherche** par texte (nom, prénom, matricule)
- **Filtre par département** pour n'afficher qu'une équipe
- Colonnes : matricule, nom, prénom, poste, département, statut, salaire

**Règles métier à connaître :**
- Le **matricule est unique et automatique** (préfixe + séquence du paramétrage).
- Le **manager doit être un employé actif** (sinon la saisie est refusée).
- **Toute modification du salaire de base crée automatiquement une entrée d'historique** (qui, quand, ancien/nouveau salaire).
- Un employé peut avoir un statut : actif, congé, suspendu, archive.

### 4.3 Organigramme (`/dashboard/rh/organigramme`)

- Vue **arborescente de la hiérarchie** : chaque employé apparaît sous son manager (« rapporte à »).
- Nœuds **dépliables/repliables**, badges de statut, départements visibles.
- Utile pour vérifier la chaîne de commandement et les affectations.

---

## 5. Présences & Temps de travail — RH-02

### 5.1 Objectif

Vous saisissez les **heures brutes** (arrivée, départ). Le système **calcule tout le reste** selon les paramètres RH-00 : heures normales, retards, heures supplémentaires (uniquement si autorisées), absences.

> **Prérequis :** chaque employé doit avoir un **cycle de travail affecté** dans sa fiche (Section 4). Sans cycle, la saisie est impossible.

**Accès :** Personnel (RH) → **Présences** (`/dashboard/rh/presences`) — 4 onglets.

### 5.2 Onglet « Saisie du jour »

1. Choisissez la **date**.
2. Pour chaque employé, saisissez l'**heure d'arrivée** et l'**heure de départ**, **ou** utilisez le marquage rapide : **Présent / Absent / Congé / Maladie / Mission**.
3. Cliquez sur **Enregistrer la journée**.

> 💡 La liste affiche tous les employés actifs, groupés par poste/département.

### 5.3 Onglet « Heures supplémentaires »

Les heures sup. ne sont comptées **que si une autorisation approuvée existe** pour ce jour.

1. Cliquez sur **+ Demande d'heures supplémentaires**.
2. Sélectionnez l'employé, la date, le nombre d'heures et le **motif** (obligatoire).
3. La demande apparaît comme **En attente** — un chef d'atelier ou le Directeur doit l'**approuver** (bouton Approuver / Refuser).
4. Sans approbation : les minutes au-delà de l'heure de fin sont **ignorées** (0 HS).

### 5.4 Onglet « Historique »

- Consultez les présences passées par employé ou par période.
- **Corrigez** une journée avant la clôture du mois (modifiez les heures puis Enregistrer).
- Le détail du calcul est transparent : heures normales, HS, retards.

### 5.5 Onglet « Mensuel & clôture » — l'étape clé pour la paie

1. Sélectionnez le mois (ex. : août 2026).
2. **Clôturer le mois** : le système verrouille les présences du mois et génère un **résumé mensuel par employé** :
   - Jours présents, jours absents, jours de congé
   - Heures normales totales, heures supplémentaires totales, retards
3. Une fois clôturé, le résumé est **verrouillé** (badge « VERROUILLÉ ») : plus aucune modification possible.

> ⚠️ **La clôture est obligatoire avant la paie.** Sans résumés clôturés, la préparation de la paie est refusée.

### 5.6 Exemple de calcul (cas concret)

Employé avec cycle Atelier Standard (08:00-17:30 attendu = 8h30, tolérance 5 min) :

| Situation | Heures saisies | Résultat calculé |
|---|---|---|
| Journée standard | 07:30 – 18:00 | 8h30 normales, 0 retard, 0 HS |
| Arrivée à 08:00 | 08:00 – 18:00 | Retard 25 min, temps réduit en conséquence |
| Départ 19:00 SANS autorisation | 07:30 – 19:00 | 8h30 normales, **0 HS** (minutes ignorées) |
| Départ 19:00 AVEC autorisation 2h | 07:30 – 19:00 | 8h30 normales + **1h HS** validée |

---

## 6. Congés & Absences — RH-03

### 6.1 Objectif

Gérer les **soldes de congés**, les **demandes** (avec circuit de validation) et le **calendrier des absences**. Les congés approuvés alimentent automatiquement les présences.

**Accès :** Personnel (RH) → **Congés & Absences** (`/dashboard/rh/absences`) — 3 onglets.

### 6.2 Onglet « Demandes »

**Créer une demande :**
1. Cliquez sur **+ Nouvelle demande**.
2. Employé, **type de congé** (issu du paramétrage RH-00), dates de début et fin, motif.
3. Le système calcule automatiquement le **nombre de jours ouvrés** (lundi-samedi, hors fériés).
4. **Enregistrer** → la demande passe en **En attente**.

**Valider une demande (RH / manager / Directeur) :**
- Bouton **Approuver** : le solde est déduit automatiquement et les jours sont marqués **« congé »** dans les présences.
- Bouton **Refuser** : le solde reste inchangé.

**Règles de contrôle automatiques :**
- **Solde insuffisant** → la demande est refusée.
- **Chevauchement** avec une autre demande approuvée → refusée.
- Le **prorata** est appliqué : un employé embauché en cours d'année acquiert des jours au prorata (ex. : embauché en mars → 30 j × 10/12 = 25 j ; embauché en juin → 17,5 j).

### 6.3 Onglet « Soldes »

- Tableau des soldes par employé et par type de congé : **acquis, pris, ajusté, solde restant**.
- **Ajustement manuel** (ex. : don de jours, erreur) : bouton **Ajuster**, montant + motif. L'ajustement est **tracé** (audit).
- Un **solde négatif** déclenche une alerte dans le tableau de bord RH.

### 6.4 Onglet « Calendrier »

- Vue calendrier des absences de l'équipe (congés approuvés affichés par employé).
- Permet d'anticiper les périodes d'absence et de planifier.

### 6.5 Impact sur la paie

- Congé **payé** (ex. : annuel, maladie, maternité, permission) : pas de retenue sur le salaire.
- Congé **sans solde** : retenue calculée dans la paie.
- Les jours de congé **ne sont pas des absences** : ils n'entrent pas dans le compteur d'absences non justifiées.

---

## 7. Paie — RH-04

### 7.1 Objectif

Calculer la rémunération mensuelle de chaque employé et produire un **bulletin de paie conforme au modèle camerounais** (CNPS + IRPP progressif), avec génération **PDF** et suivi des paiements.

> **Prérequis obligatoire :** les **présences du mois doivent être clôturées** (Section 5.5). La paie est calculée depuis les résumés mensuels.

**Accès :** Personnel (RH) → **Paie** (`/dashboard/rh/paie`) — 3 onglets.

### 7.2 Onglet « Périodes & préparation »

**Créer une période de paie :**
1. Sélectionnez les dates de début et de fin de la période (par intervalle de dates — ex. : 01/08/2026 → 31/08/2026).
2. Cliquez sur **Ouvrir la période**.
3. La période apparaît dans la liste avec le statut **OUVERTE**.

**Préparer la paie :**
1. Cliquez sur **Calculer la paie** sur la période.
2. Le système génère un **bulletin pour chaque employé ayant un salaire de base**, à partir :
   - des **présences clôturées** (heures normales, HS autorisées, absences),
   - des **congés approuvés** (jours payés / non payés),
   - de la **prime de performance** suggérée par l'évaluation (RH-05) si applicable,
   - des **éléments de paie configurés** (Section 7.4).
3. Vérifiez les bulletins (onglet Bulletins), puis **Clôturer** la période.

### 7.3 Onglet « Bulletins »

**Structure d'un bulletin de paie (modèle camerounais) :**

```
Salaire de base                400 000,00
+ Heures supplémentaires ×1,25    4 807,69
+ Prime de présence (10 % si ≥95 %)
+ Prime de performance (évaluation)
= BRUT                            404 807,69
− CNPS salariale (4,5 % du brut)   18 216,35
= NET IMPOSABLE                   386 591,34
− IRPP (barème progressif)         56 647,84
= NET À PAYER                     329 943,50
```

**Actions disponibles sur un bulletin :**
- **Voir le détail** : toutes les lignes de gains et retenues.
- **Ajuster** : modifier un bulletin avant paiement (ex. : ajouter une prime exceptionnelle) — le recalcul est automatique ; un bulletin **payé** est bloqué.
- **PDF** : télécharger le bulletin au format PDF (prêt à imprimer / envoyer).
- **Marquer payé** : choisir le mode de paiement — **Espèces, Orange Money, MTN MoMo, Virement** — et confirmer. Le paiement est enregistré et horodaté.

### 7.4 Onglet « Configuration » — les éléments de paie (paramétrables)

**9 éléments pré-configurés par défaut :**

| Code | Libellé | Règle par défaut |
|---|---|---|
| PRIME_PRESENCE | Prime de présence | 10 % du salaire si taux de présence ≥ 95 % |
| HS | Heures supplémentaires | Majoration ×1,25 |
| TRANSPORT | Prime de transport | Montant fixe |
| ABSENCE | Retenue absence | Salaire / 26 jours par jour d'absence |
| AVANCE | Avance sur salaire | Montant saisi |
| CNPS | CNPS salariale | 4,5 % du brut |
| CNPS_PATRONALE | CNPS patronale | 5,6 % du brut |
| IRPP | Impôt sur le revenu | Barème progressif (voir 13.2) |
| (autres) | Personnalisables | — |

**Comment faire :**
1. Onglet Configuration → **Modifier** un élément.
2. Changez le taux, le montant, la formule (le cas échéant).
3. **Enregistrer** — le prochain calcul de paie utilise la nouvelle valeur.

> ⚠️ **Aucune formule n'est codée en dur** : tous les taux et barèmes se modifient ici.

### 7.5 Exemples chiffrés (pour comprendre et vérifier)

**Exemple 1 — Directeur (salaire 400 000 F, 2 h HS autorisées, présence ≥ 95 %) :**
- HS : 400 000 / 208 h × 2 h × 1,25 = **4 807,69 F**
- Brut = 404 807,69 F
- CNPS salariale 4,5 % = 18 216,35 F
- Net imposable = 386 591,34 F
- IRPP = 8 000 + 27 000 + 25 % × (386 591,34 − 300 000) = **56 647,84 F**
- **Net à payer = 329 943,50 F** ✔

**Exemple 2 — Technicien (salaire 150 000 F, prime de performance 15 000 F) :**
- Brut = 165 000 F
- CNPS 4,5 % = 7 425 F → net imposable 157 575 F
- IRPP (10 % sur 117 575) = 11 757,50 F
- **Net = 143 938,75 F** ✔

---

## 8. Évaluation & Performance — RH-05

### 8.1 Objectif

Évaluer périodiquement les employés selon des **critères pondérés**, historiser les notes, et déclencher une **prime de performance** selon un barème.

**Accès :** Personnel (RH) → **Évaluation & Performance** (`/dashboard/rh/evaluations`) — 4 onglets.

### 8.2 Onglet « Grilles »

- Les grilles définissent les **critères d'évaluation par poste** avec leur pondération (la somme doit être **100 %**).
- **Par défaut — grille « Technicien »** (6 critères) :

| Critère | Pondération |
|---|---|
| Qualité technique | 30 % |
| Rapidité d'exécution | 20 % |
| Propreté du poste | 15 % |
| Respect des consignes | 15 % |
| Esprit d'équipe | 10 % |
| Relation client | 10 % |

- **+ Nouvelle grille** : nom, critères + pondérations, Enregistrer (contrôle : somme = 100 %).

### 8.3 Onglet « Campagnes & saisie »

1. **+ Lancer une campagne** : nom, période (ex. : Campagne août 2026, 01/08 → 31/08).
2. Pour chaque employé à évaluer : choisir la **grille**, saisir une **note par critère** (échelle 1 à 5) + appréciation.
3. Le système calcule automatiquement la **note globale pondérée** (ex. : 4,15 / 5).

### 8.4 Onglet « Barème de prime »

Barème de prime de performance (paramétrable) — **par défaut :**

| Note minimale | Note maximale | Prime |
|---|---|---|
| 4,5 | 5,0 | 20 000 F |
| 4,0 | 4,49 | 15 000 F |
| 3,5 | 3,99 | 10 000 F |
| 3,0 | 3,49 | 5 000 F |
| 0 | 2,99 | 0 F |

- La **prime suggérée** (ex. : note 4,15 → 15 000 F) est proposée lors de la préparation de la paie.
- Vous pouvez modifier les tranches ou les montants ; le prochain calcul les utilise.

### 8.5 Onglet « Historique »

- Toutes les évaluations passées par employé (note, appréciation, campagne, date).
- Le dossier d'évaluation alimente le module Paie (prime) et le suivi de performance.

---

## 9. Compétences & Formations — RH-06

### 9.1 Objectif

Cartographier les **compétences requises par poste** et **maîtrisées par chaque employé**, détecter les **écarts**, et planifier des **formations** pour les combler.

**Accès :** Personnel (RH) → **Compétences & Formations** (`/dashboard/rh/competences`) — 5 onglets.

### 9.2 Onglet « Référentiel »

- Liste des compétences du garage (**10 par défaut**), classées par catégorie :
  - **Atelier** : Diagnostic électronique, Mécanique moteur, Transmission auto, Climatisation, Électricité auto
  - **Carrosserie** : Soudure, Peinture
  - **Accueil** : Accueil client · **Finance** : Facturation & encaissement · **Magasin** : Gestion du stock
- **Recherche** par nom/catégorie.
- **+ Nouvelle compétence** : code, nom, catégorie, description (code unique obligatoire).

### 9.3 Onglet « Matrice employés »

1. Sélectionnez un **employé**.
2. Le panneau **Écarts de compétences** affiche, pour le poste de l'employé :
   - les compétences **requises** (avec niveau requis) vs **niveau actuel** ;
   - l'**écart** et le badge **CRITIQUE** si l'écart est ≥ 2 niveaux ;
   - les **formations suggérées** pour combler les écarts.
3. Le tableau des compétences évaluées permet de saisir/mettre à jour le **niveau (1 à 5)** d'un employé sur chaque compétence (cliquez sur 1-5, enregistrement immédiat).

> **Exemple :** Technicien avec « Mécanique moteur » requise niveau 4 et évalué niveau 2 → **écart 2 (CRITIQUE)** + suggestion de la formation correspondante.

### 9.4 Onglet « Exigences par poste »

- Tableau des **compétences requises par poste** (niveau 1-5).
- **Ajouter une exigence** : poste + compétence + niveau requis → Ajouter.
- Retirer une exigence avec le bouton de suppression.

### 9.5 Onglet « Formations » (catalogue + sessions)

**Catalogue (5 formations par défaut) :**

| Formation | Type | Durée | Compétences ciblées |
|---|---|---|---|
| Diagnostic électronique embarqué | Externe | 40 h | Diagnostic électronique |
| Climatisation automobile | Externe | 24 h | Climatisation |
| Soudure MIG/TIG | Interne | 30 h | Soudure |
| Accueil et relation client | Interne | 12 h | Accueil client |
| Gestion des stocks | Interne | 16 h | Gestion du stock |

- **+ Nouvelle formation** : titre, description, type (interne/externe), durée, compétences ciblées.
- **Planifier une session** : formation + dates + lieu → la session apparaît dans « Sessions planifiées » avec son statut (planifiée / en cours / terminée / annulée).

### 9.6 Onglet « Plan & historique »

- **Alertes de formation** : employés **jamais formés** ou **sans formation depuis 6 mois ou plus** (seuil paramétrable).
- **Inscrire un employé à une session** (sélecteurs session + employé → Inscrire).
- Tableau des **participations** : statut (inscrit / présent / validé / absent), note, bouton **Valider** (attestation de suivi).

---

## 10. Disciplinaire — RH-07

### 10.1 Objectif

Enregistrer, suivre et historiser les **incidents et sanctions disciplinaires**, en cohérence avec le règlement intérieur, avec **traçabilité** et **proportionnalité**.

> 🔒 **Accès restreint :** ce module est réservé au **Responsable RH** et au **Directeur** (les autres rôles n'y ont pas accès).

**Accès :** Personnel (RH) → **Disciplinaire** (`/dashboard/rh/sanctions`) — 3 onglets.

### 10.2 Onglet « Registre »

- Liste complète des sanctions avec **recherche** (employé, type) : employé, type, motif, date, gravité, décision.
- Badges : gravité (Léger / Moyen / Grave / Très grave / Licenciement) et décision (**Notifiée / Non notifiée**).
- Suppression d'un record (avec confirmation) — l'action est tracée.

### 10.3 Onglet « Nouveau record »

1. **Employé** (liste des employés actifs).
2. **Type de sanction** — sélection parmi les types paramétrés dans RH-00 (ex. : Avertissement écrit, Mise à pied 1-3 jours…).
3. **Description des faits / motif** (obligatoire).
4. **Date des faits** (obligatoire).
5. **Décision** : Notifiée (la notification est horodatée automatiquement) ou Non notifiée.
6. Champs optionnels : dates d'effet, durée (jours), détails financiers, **document joint** (courrier, PV…).
7. **Enregistrer** → le record apparaît dans le registre et dans le dossier de l'employé.

### 10.4 Onglet « Dossier employé »

- Sélectionnez un employé pour consulter son **dossier disciplinaire complet**.
- **KPI du dossier :** employé, nombre de records, **récidive**.
- **Alerte récidive** : le système compte les **avertissements (gravité 1-2) notifiés** sur une **période glissante paramétrable (12 mois par défaut)**. Dès **2 avertissements** dans la fenêtre → **ALERTE RÉCIDIVE** (carte rouge).
- Tableau historique : date, type, motif, gravité, décision, **auteur de la décision**, document.

> **Exemple :** Technicien avec un avertissement écrit (juin 2026) + un avertissement oral (août 2026) → 2 avertissements dans les 12 mois → **ALERTE RÉCIDIVE**.

### 10.5 Personnalisation

La **fenêtre de récidive** (nombre de mois) se modifie dans le **Paramétrage RH → Général** (champ « Fenêtre disciplinaire »).

---

## 11. Documents RH — RH-08

### 11.1 Objectif

Centraliser **tous les documents du personnel** (contrats, pièces d'identité, attestations, certificats, courriers) et être **alerté avant leur expiration**.

**Accès :** Personnel (RH) → **Documents RH** (`/dashboard/rh/documents`) — 3 onglets.

### 11.2 Onglet « Documents »

- Liste des documents avec **recherche** (employé, type, titre) : employé, type, titre, dates, **statut d'expiration** (Expiré / Expire bientôt / Valide / Sans expiration), lien vers le fichier.
- **+ Ajouter un document** :
  1. Employé + **type de document** (issu du paramétrage — Section 11.3).
  2. Titre, **URL/chemin du fichier** (PDF, image).
  3. Dates d'émission et d'expiration (si le type en requiert une).
  4. Notes → **Enregistrer** (l'utilisateur qui a ajouté le document est tracé).
- Suppression avec confirmation.

### 11.3 Onglet « Types » — les types de documents paramétrables

**8 types par défaut :**

| Type | Requiert une expiration ? |
|---|---|
| Contrat de travail | ✅ |
| Avenant | ❌ |
| CIN / Passeport | ✅ |
| Attestation CNPS | ❌ |
| Attestation | ❌ |
| Certificat de formation | ❌ |
| Courrier disciplinaire | ❌ |
| Autre | ❌ |

- **+ Nouveau type** : code, nom, « requiert une expiration » (case à cocher).
- **Activer/désactiver** un type (bouton rond), supprimer un type.

### 11.4 Onglet « Alertes expiration »

- Liste des documents **expirés ou expirant sous 30 jours** (seuil paramétrable), triés par urgence :
  - **Jours restants** (négatif = expiré depuis N jours),
  - Statut (EXPIRÉ / EXPIRE BIENTÔT),
  - Employé, type, titre, lien vers le fichier.
- C'est l'endroit à consulter régulièrement : **renouvelez les pièces avant expiration** (CIN, passeports, contrats CDD).

---

## 12. Tableau de bord & Rapports — RH-09

### 12.1 Objectif

Donner au Directeur et au RH une **vision claire et actualisée** de la situation du personnel, avec alertes et rapports exportables.

**Accès :** Personnel (RH) → **Tableau de bord RH** (`/dashboard/rh/tableau-de-bord`) — 2 onglets.

### 12.2 Onglet « Tableau de bord » — les indicateurs

| Indicateur | Description |
|---|---|
| **Effectif total** | Nombre d'employés (actifs / inactifs) |
| **Taux de présence** | % de présence du mois (jours présents / jours ouvrés, calculé sur les résumés RH-02) |
| **Masse salariale** | Somme des salaires de base (ou des bulletins du mois s'ils existent) |
| **Évaluations en retard** | Employés actifs non évalués sur l'année |
| **Formations** | Formations réalisées / planifiées |
| **Absences du mois** | Total des jours d'absence |

**Alertes automatiques (3 types) :**
- 🔴 **Contrats expirant sous 30 jours**
- 🔴 **Documents expirés**
- 🔴 **Soldes de congés négatifs**

**Répartition par département** : barres proportionnelles (nombre d'employés par service).

### 12.3 Onglet « Rapports » — exports CSV

4 rapports téléchargeables (format CSV, ouvrable dans Excel avec accents corrects) :

| Rapport | Contenu |
|---|---|
| **Liste des employés** | Matricule, nom, prénom, fonction, département, statut, salaire |
| **Présences mensuelles** | Résumés RH-02 du mois choisi (jours présents/absents/congé, heures, retards, verrouillé) |
| **Matrice de compétences** | Niveaux actuels vs requis par poste (RH-06) |
| **Registre disciplinaire** | Sanctions et décisions (accès restreint RH/Direction) |

**Comment faire :**
1. Choisissez le **mois** (pour le rapport de présences).
2. Cliquez sur **CSV** du rapport souhaité → le fichier est téléchargé.

---

## 13. Règles métier transverses (référence)

### 13.1 CNPS (Cameroun)

| Cotisation | Taux | Base |
|---|---|---|
| CNPS salariale (retenue employé) | **4,5 %** | Brut |
| CNPS patronale (charge employeur) | **5,6 %** | Brut |

### 13.2 IRPP — barème progressif paramétrable

| Tranche de revenu imposable | Taux |
|---|---|
| 0 – 40 000 F | 0 % |
| 40 000 – 120 000 F | 10 % |
| 120 000 – 300 000 F | 15 % |
| 300 000 – 500 000 F | 25 % |
| > 500 000 F | 35 % |

**Calcul (cumulatif par tranche)** : ex. net imposable 386 591,34 F → 0 + 8 000 (40→120k à 10 %) + 27 000 (120→300k à 15 %) + 25 % × (386 591,34 − 300 000) = **56 647,84 F**.

### 13.3 Acquisition des congés (prorata)

- Base : **30 jours par an** (paramétrable) → **2,5 jours par mois** d'ancienneté.
- Embauché en juin 2026 → acquis ≈ **17,5 jours** au 31 décembre 2026.
- Congé annuel : décompte sur le solde ; **payé** ; jours marqués « congé » en présences (≠ absence).

### 13.4 Heures supplémentaires

- **Uniquement si autorisées** (demande approuvée) — sinon ignorées.
- Majoration paramétrable : **×1,25 par défaut**.
- Calcul : (salaire / 208 h) × heures × taux.

### 13.5 Récidive disciplinaire

- Comptage des **avertissements (gravité 1-2) notifiés** sur **12 mois glissants** (paramétrable).
- **≥ 2 avertissements** dans la fenêtre → **ALERTE RÉCIDIVE**.

### 13.6 Matricule

- Format : **préfixe (GPJ) + séquence** (GPJ-9001, GPJ-9002…).
- Attribution **automatique** à la création ; séquence auto-réparée si désynchronisée.

### 13.7 Jours ouvrés

- Lundi → samedi inclus ; **dimanche non travaillé** ; **jours fériés exclus**.

---

## 14. FAQ globale

### Connexion & accès
**Q1. Je n'ai pas accès à un module — pourquoi ?**
Chaque rôle a des permissions définies (Section 1.3). Les boutons non autorisés sont masqués. Contactez votre administrateur si vous estimez avoir besoin d'un accès.

**Q2. Quels comptes existent par défaut ?**
directeur@gpj.cm, chef.atelier@gpj.cm, secretaire@gpj.cm, magasinier@gpj.cm, technicien@gpj.cm, comptable@gpj.cm, rh@gpj.cm, consultation@gpj.cm — mot de passe par défaut fourni par l'administrateur.

### Employés
**Q3. Comment est généré le matricule ?**
Automatiquement (préfixe + séquence), ex. : GPJ-9010. Vous n'avez rien à saisir.

**Q4. Comment changer le salaire d'un employé ?**
Modifiez le salaire dans sa fiche → l'ancienne valeur est conservée dans l'historique des salaires (traçabilité).

**Q5. Un employé est parti — que faire ?**
Passez son statut à « archive » (ou suspendu). Il ne pourra plus pointer ni être payé.

### Présences
**Q6. Pourquoi les heures sup. saisies ne comptent pas ?**
Les HS ne comptent que si une **autorisation approuvée** existe pour ce jour (Section 5.3).

**Q7. J'ai oublié de pointer un jour, que faire ?**
Avant la clôture du mois : Historique → corrigez la journée (heure arrivée/départ) → Enregistrer.

**Q8. La clôture est-elle obligatoire ?**
Oui, avant chaque paie. Après clôture, le mois est verrouillé.

### Congés
**Q9. Un employé veut poser plus de jours que son solde ?**
La demande est refusée automatiquement (solde insuffisant).

**Q10. Comment corriger un solde erroné ?**
Onglet Soldes → Ajuster (montant + motif). L'ajustement est tracé.

### Paie
**Q11. Pourquoi la préparation de la paie est refusée ?**
Le mois de présences n'est **pas clôturé**. Clôturez d'abord (Section 5.5).

**Q12. Comment payer un employé ?**
Bulletin → Marquer payé → choisir le mode (Espèces / MoMo / OM / Virement).

**Q13. Où trouver un bulletin ?**
Paie → Bulletins → PDF (téléchargeable à tout moment, réédition possible).

**Q14. Comment modifier les taux (HS, CNPS, IRPP) ?**
Paie → Configuration → modifier l'élément → Enregistrer. Le prochain calcul l'utilise.

### Évaluation & Compétences
**Q15. Comment lancer une évaluation ?**
Évaluations → Campagnes & saisie → Lancer une campagne → saisir les notes par critère.

**Q16. Où voir les compétences manquantes d'un employé ?**
Compétences → Matrice employés → sélectionner l'employé : écarts + formations suggérées.

### Documents & alertes
**Q17. Pourquoi un document est marqué « Expiré » ?**
Sa date d'expiration est dépassée. Consultez Alertes expiration pour renouveler à temps.

**Q18. Comment savoir si un contrat arrive à échéance ?**
Le Tableau de bord RH affiche l'alerte « Contrats expirant sous 30 jours ».

### Divers
**Q19. Que signifie « ALERTE RÉCIDIVE » ?**
L'employé a cumulé au moins 2 avertissements notifiés dans la période glissante (12 mois).

**Q20. Puis-je exporter les données ?**
Oui : Tableau de bord RH → Rapports → 4 exports CSV (employés, présences, compétences, discipline).

---

## 15. Glossaire

| Terme | Définition |
|---|---|
| **CNPS** | Caisse Nationale de Prévoyance Sociale (Cameroun) — cotisation sociale salariale 4,5 % et patronale 5,6 % |
| **IRPP** | Impôt sur le Revenu des Personnes Physiques — barème progressif paramétrable |
| **Matricule** | Numéro d'identification unique de l'employé (ex. : GPJ-9010) |
| **Solde de congés** | Jours de congé restants = acquis − pris ± ajustements |
| **Prorata** | Calcul proportionnel (acquisition de congés selon le mois d'embauche) |
| **Cycle de travail** | Planning hebdomadaire (horaires par jour) affecté à un employé |
| **Heures supplémentaires (HS)** | Heures au-delà du temps normal, majorées, uniquement si autorisées |
| **Clôture mensuelle** | Verrouillage des présences d'un mois + génération des résumés (requis avant la paie) |
| **Période glissante** | Fenêtre de N mois (ex. : 12) utilisée pour compter les avertissements (récidive) |
| **Récidive** | ≥ 2 avertissements notifiés dans la période glissante |
| **Grille d'évaluation** | Jeu de critères pondérés (somme = 100 %) par poste |
| **Campagne d'évaluation** | Période de saisie des évaluations (ex. : août 2026) |
| **Barème de prime** | Tranches note → montant de prime de performance |
| **Référentiel de compétences** | Liste paramétrée des compétences du garage, avec niveaux requis par poste |
| **Session de formation** | Une occurrence planifiée d'une formation (dates, lieu, participants) |
| **Matrice de compétences** | Tableau niveau actuel de chaque employé par compétence |
| **Record disciplinaire** | Enregistrement d'une sanction (faits, type, décision, auteur) |
| **Décision notifiée** | Sanction officiellement notifiée à l'employé (horodatée) |
| **Export CSV** | Fichier de données ouvrable dans Excel |

---

*Fin du guide — AtelierOne, module Personnel (RH). Pour toute question, utilisez le bouton « ? » dans l'application ou contactez votre administrateur.*
