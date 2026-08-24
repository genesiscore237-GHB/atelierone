/**
 * REGISTRE D'AIDE — MODULE PERSONNEL (RH)
 * Source unique du contenu d'aide in-app : utilisée par le bouton "?"
 * (aide contextuelle) et par le Centre d'aide (/dashboard/rh/aide).
 * Chaque fiche décrit un sous-module avec prérequis, fonctionnalités,
 * étapes, règles métier et FAQ.
 */

export interface HelpFiche {
  id: string;
  titre: string;
  courte: string; // description courte (liste, hub)
  priorite: "P0" | "P1" | "P2";
  route: string; // page du module
  prerequis: string[]; // à savoir avant d'utiliser
  fonctionnalites: string[]; // liste exhaustive
  etapes: { titre: string; detail: string }[]; // pas-à-pas
  regles: { titre: string; detail: string }[]; // règles métier
  faq: { q: string; r: string }[];
}

export const RH_HELP_FICHES: HelpFiche[] = [
  {
    id: "rh-dashboard",
    titre: "Tableau de bord & Rapports",
    courte: "Vue d'ensemble des effectifs, présence, masse salariale, alertes et exports.",
    priorite: "P1",
    route: "/dashboard/rh/tableau-de-bord",
    prerequis: [
      "Avoir des employés créés (RH-01)",
      "Avoir clôturé au moins un mois de présences pour le taux de présence",
    ],
    fonctionnalites: [
      "6 indicateurs : effectif total (actifs/inactifs), taux de présence du mois, masse salariale, évaluations en retard, formations réalisées/planifiées, absences du mois",
      "3 alertes automatiques : contrats expirant sous 30 jours, documents expirés, soldes de congés négatifs",
      "Répartition des effectifs par département (barres proportionnelles)",
      "4 rapports exportables en CSV : liste des employés, présences mensuelles (par mois), matrice de compétences, registre disciplinaire",
      "Sélecteur de période pour le rapport de présences",
    ],
    etapes: [
      { titre: "Consulter les KPI", detail: "Ouvrez Tableau de bord RH : les 6 indicateurs s'affichent avec le nombre d'alertes." },
      { titre: "Voir les alertes", detail: "Le panneau Alertes affiche les compteurs. Cliquez sur les liens pour aller corriger (ex. : Documents RH)." },
      { titre: "Exporter un rapport", detail: "Onglet Rapports → choisissez le mois → cliquez sur CSV du rapport souhaité. Le fichier est téléchargé." },
    ],
    regles: [
      { titre: "Taux de présence", detail: "Calculé sur les résumés mensuels clôturés (RH-02) : jours présents / jours ouvrés (lun-sam hors fériés)." },
      { titre: "Masse salariale", detail: "Somme des salaires de base ; si des bulletins existent, leur net est utilisé." },
      { titre: "Accès restreint", detail: "Le registre disciplinaire exporté n'est accessible qu'au RH et au Directeur." },
    ],
    faq: [
      { q: "Le taux de présence affiche 0 %, pourquoi ?", r: "Le mois n'est pas encore clôturé dans Présences (RH-02), ou il n'y a pas de résumé mensuel." },
      { q: "Comment ouvrir le CSV avec les accents ?", r: "Le fichier est généré avec BOM UTF-8 : double-cliquez, il s'ouvre correctement dans Excel." },
    ],
  },
  {
    id: "rh-parametrage",
    titre: "Paramétrage RH (configuration initiale)",
    courte: "Horaires, cycles, tolérances, congés, sanctions, fériés, matricule — la base de tout.",
    priorite: "P0",
    route: "/dashboard/rh/parametrage",
    prerequis: ["Aucun — c'est le premier module à configurer avant toute utilisation"],
    fonctionnalites: [
      "Onglet Cycles : horaires par jour (début, fin, pause, heures attendues), création de plusieurs cycles, jour non travaillé",
      "Onglet Présence : tolérance de retard, arrondi, déduction pause, plafond heures/jour, arrivée anticipée",
      "Onglet Congés : types de congés paramétrables (payé, décompte solde, justificatif, couleur), création/suppression",
      "Onglet Sanctions : types de sanctions avec niveau de gravité 1-5",
      "Onglet Fériés : jours fériés annuels reconduits chaque année",
      "Onglet Général : préfixe + séquence matricule, fuseau horaire, devise, acquisition congés (30 j), fenêtre disciplinaire, activation évaluations",
    ],
    etapes: [
      { titre: "Vérifier les cycles", detail: "Onglet Cycles : le cycle « Atelier Standard » est pré-rempli (lun-ven 07:30-18:00, sam 07:30-12:00). Adaptez si besoin puis Enregistrer." },
      { titre: "Vérifier les règles de présence", detail: "Onglet Présence : tolérance 5 min, plafond 8h30 par défaut. Modifiez puis Enregistrer." },
      { titre: "Vérifier congés et sanctions", detail: "Les 7 types de congés et 5 types de sanctions sont pré-remplis. Ajoutez/supprimez selon vos besoins." },
      { titre: "Vérifier fériés et général", detail: "Les 6 fériés camerounais sont présents. Le préfixe de matricule est GPJ." },
    ],
    regles: [
      { titre: "Tout est paramétrable", detail: "Aucune valeur métier n'est codée en dur : horaires, taux, types, seuils se modifient ici et s'appliquent immédiatement." },
      { titre: "Matricule automatique", detail: "Préfixe + séquence (ex. : GPJ-9001). La séquence se répare automatiquement si désynchronisée." },
      { titre: "Fenêtre disciplinaire", detail: "Le nombre de mois (défaut 12) sert au calcul de la récidive dans le module Disciplinaire." },
    ],
    faq: [
      { q: "Mes modifications s'appliquent-elles aux calculs en cours ?", r: "Oui, immédiatement pour les prochains calculs de présences et de paie." },
      { q: "Comment créer un cycle pour le personnel administratif ?", r: "Onglet Cycles → + Nouveau cycle → nommez, définissez les horaires, Enregistrez, puis affectez-le aux employés dans leurs fiches." },
    ],
  },
  {
    id: "rh-employes",
    titre: "Fiches Employés",
    courte: "Création et gestion des fiches complètes (identité, contrat, affectation, historique).",
    priorite: "P0",
    route: "/dashboard/rh/employes",
    prerequis: [
      "Paramétrage RH configuré (RH-00) : cycles, types de contrat",
      "Le matricule est généré automatiquement — rien à saisir",
    ],
    fonctionnalites: [
      "Création de fiche : civilité, nom, prénom, naissance, contacts, urgence, NIU",
      "Contrat : type (CDI, CDD, Stage, Temporaire, Prestation), salaire de base, N° CNPS, date d'embauche",
      "Affectation : département, poste, cycle de travail, supérieur hiérarchique",
      "Notes internes",
      "Liste avec recherche plein texte et filtre par département",
      "Historique automatique des salaires et des postes",
      "Statuts : actif, congé, suspendu, archive",
    ],
    etapes: [
      { titre: "Créer un employé", detail: "Cliquez sur + Nouvel employé, remplissez Identité, Contrat, Affectation puis Enregistrer. Le matricule (ex. : GPJ-9010) est attribué automatiquement." },
      { titre: "Modifier un salaire", detail: "Modifiez le salaire dans la fiche → l'historique des salaires enregistre l'ancienne valeur automatiquement." },
      { titre: "Affecter un cycle", detail: "Dans Affectation, choisissez le cycle de travail (issu de RH-00). Obligatoire pour pointer." },
      { titre: "Rechercher", detail: "Utilisez la barre de recherche ou le filtre par département." },
    ],
    regles: [
      { titre: "Matricule unique", detail: "Format préfixe + séquence, généré automatiquement, jamais en double." },
      { titre: "Manager actif", detail: "Le supérieur hiérarchique doit être un employé actif, sinon la saisie est refusée." },
      { titre: "Historique des salaires", detail: "Toute modification du salaire de base crée une entrée d'historique (ancien, nouveau, date)." },
      { titre: "Employé inactif", detail: "Un employé au statut suspendu/archive ne peut plus pointer ni être payé." },
    ],
    faq: [
      { q: "Pourquoi le matricule est-il vide ?", r: "Il est attribué à l'enregistrement. S'il reste vide, vérifiez le préfixe/séquence dans le Paramétrage RH → Général." },
      { q: "Comment archiver un ancien employé ?", r: "Modifiez sa fiche → Statut → archive. Il reste consultable mais n'apparaît plus dans les listes actives." },
    ],
  },
  {
    id: "rh-organigramme",
    titre: "Organigramme",
    courte: "Arbre hiérarchique du garage : qui dépend de qui.",
    priorite: "P0",
    route: "/dashboard/rh/organigramme",
    prerequis: ["Employés créés avec un supérieur hiérarchique (RH-01)"],
    fonctionnalites: [
      "Vue arborescente de la hiérarchie (rapporte à)",
      "Nœuds dépliables/repliables",
      "Badges de statut et départements visibles",
      "Vérification rapide des affectations",
    ],
    etapes: [
      { titre: "Consulter l'arbre", detail: "Ouvrez Organigramme : chaque employé apparaît sous son manager." },
      { titre: "Réaffecter un manager", detail: "Modifiez la fiche de l'employé (section Affectation → supérieur hiérarchique)." },
    ],
    regles: [
      { titre: "Manager actif requis", detail: "Le rattachement à un manager inactif est refusé (cohérent avec RH-01)." },
    ],
    faq: [
      { q: "Un employé n'apparaît pas dans l'organigramme ?", r: "Il n'a pas de supérieur hiérarchique défini, ou son statut est inactif." },
    ],
  },
  {
    id: "rh-presences",
    titre: "Présences & Temps de travail",
    courte: "Saisie des heures, heures supplémentaires autorisées, historique, clôture mensuelle.",
    priorite: "P0",
    route: "/dashboard/rh/presences",
    prerequis: [
      "Chaque employé a un cycle de travail affecté (RH-01 + RH-00)",
      "Paramétrage des tolérances et plafond d'heures (RH-00)",
    ],
    fonctionnalites: [
      "Saisie du jour : heure d'arrivée/départ + marquage rapide (Présent, Absent, Congé, Maladie, Mission)",
      "Prime de tâche (FCFA) saisie jour par jour — reprise en paie",
      "Recalcul en direct pendant la frappe : heures travaillées, HN, HS, code présence (A/HS/R/P)",
      "Validations admin par ligne : « arrivée anticipée » et « départ tardif » (défaut NON → heures plafonnées)",
      "Règles MVP : anticipation/tardivité non comptées sauf validation, retards et départs anticipés déduits, pause déduite si plage couverte",
      "Heures normales = MIN(travaillées, seuil journalier 9,5 h) ; HS = MAX(0, travaillées − seuil) — automatiques",
      "Heures supplémentaires : demandes avec motif, approbation (plafond), sinon comptage automatique",
      "Historique : consultation avec codes colorés et détail à la demande (retard, primes, validations)",
      "Clôture mensuelle : verrouillage + résumé par employé (présents, absents, heures, retards, primes de tâche)",
    ],
    etapes: [
      { titre: "Saisir une journée", detail: "Onglet Saisie du jour → date → arrivée/départ (ou statut) → prime de tâche éventuelle → Enregistrer la journée. Les heures se calculent pendant la frappe." },
      { titre: "Valider un extra", detail: "Dépliez la ligne (chevron) → cochez « Valider arrivée anticipée » ou « Valider départ tardif » si l'extra doit compter." },
      { titre: "Autoriser des HS", detail: "Onglet Heures supplémentaires → + Demande → employé, date, heures, motif → un responsable approuve (plafonne) ou refuse (bloque)." },
      { titre: "Corriger un oubli", detail: "Onglet Historique → détail de la journée → modifiez et ré-enregistrez (avant clôture)." },
      { titre: "Clôturer le mois", detail: "Onglet Mensuel & clôture → mois → Clôturer. Les résumés (avec primes de tâche) sont verrouillés." },
    ],
    regles: [
      { titre: "Seuil HS journalier (specs MVP)", detail: "HN = MIN(travaillées, seuil) ; HS = MAX(0, travaillées − seuil). Seuil : 9,5 h semaine, 4,5 h samedi (paramétrable)." },
      { titre: "Anticipations plafonnées", detail: "Arrivée avant l'heure de début et départ après l'heure de fin ne comptent pas, sauf validation admin (ligne) ou paramètre global." },
      { titre: "Codes présence", detail: "A = absent · HS = journée avec heures supp. · R = retard · P = présent — affichés en couleurs." },
      { titre: "Clôture obligatoire avant paie", detail: "La préparation de la paie est refusée si les présences du mois ne sont pas clôturées." },
      { titre: "Après clôture", detail: "Plus aucune modification possible : le résumé mensuel est verrouillé." },
    ],
    faq: [
      { q: "Pourquoi mon départ à 19h ne donne pas de HS ?", r: "Le départ tardif n'est pas compté par défaut : dépliez la ligne et cochez « Valider départ tardif », ou activez le paramètre global." },
      { q: "Que signifient les codes A, HS, R, P ?", r: "A absent, HS journée avec heures supp., R retard, P présent. Ils sont calculés et affichés en couleurs." },
      { q: "Où sont mes primes de tâche ?", r: "Saisies jour par jour dans la grille (colonne Prime FCFA), reprises dans le résumé mensuel et le bulletin de paie." },
    ],
  },
  {
    id: "rh-absences",
    titre: "Congés & Absences",
    courte: "Soldes, demandes de congés, validations, calendrier des absences.",
    priorite: "P1",
    route: "/dashboard/rh/absences",
    prerequis: [
      "Types de congés configurés (RH-00)",
      "Employés créés (RH-01)",
      "Acquisition annuelle paramétrée (RH-00, défaut 30 j)",
    ],
    fonctionnalites: [
      "Demandes de congés : type, dates, motif, calcul automatique des jours ouvrés",
      "Circuit de validation : Approuver / Refuser (solde déduit ou conservé)",
      "Contrôles automatiques : solde insuffisant, chevauchement avec une demande approuvée",
      "Prorata d'acquisition selon la date d'embauche (ex. : 17,5 j pour une embauche en juin)",
      "Soldes par employé/type : acquis, pris, ajusté, restant",
      "Ajustement manuel tracé (motif + auteur)",
      "Calendrier des absences de l'équipe",
      "Impact présences : les jours approuvés sont marqués « congé » dans les présences",
      "Impact paie : congé payé sans retenue, sans solde retenu",
    ],
    etapes: [
      { titre: "Créer une demande", detail: "Onglet Demandes → + Nouvelle demande → employé, type, dates, motif → Enregistrer. La demande passe en En attente." },
      { titre: "Valider", detail: "Approuver (le solde est déduit, les jours sont marqués congé) ou Refuser (rien ne change)." },
      { titre: "Ajuster un solde", detail: "Onglet Soldes → Ajuster → montant + motif → Enregistrer. L'ajustement est tracé." },
      { titre: "Consulter le calendrier", detail: "Onglet Calendrier : visualisez les absences de l'équipe." },
    ],
    regles: [
      { titre: "Solde insuffisant", detail: "La demande est refusée automatiquement si le solde ne couvre pas la durée." },
      { titre: "Chevauchement", detail: "Une demande chevauchant un congé approuvé est refusée." },
      { titre: "Congé ≠ absence", detail: "Les jours de congé approuvés ne comptent pas dans les absences non justifiées." },
    ],
    faq: [
      { q: "Combien de jours un employé acquiert-il ?", r: "30 jours par an (paramétrable) soit 2,5 j/mois, au prorata de la date d'embauche." },
      { q: "Un congé approuvé marque-t-il les présences ?", r: "Oui : les jours sont automatiquement marqués « congé » dans les présences." },
    ],
  },
  {
    id: "rh-paie",
    titre: "Paie & Bulletins",
    courte: "Préparation de la paie depuis les présences clôturées, bulletins camerounais, PDF, paiements.",
    priorite: "P1",
    route: "/dashboard/rh/paie",
    prerequis: [
      "Présences du mois clôturées (RH-02) — obligatoire",
      "Employés avec salaire de base (RH-01)",
      "Éléments de paie configurés (RH-04 Configuration, 9 éléments par défaut)",
    ],
    fonctionnalites: [
      "Périodes de paie par intervalle de dates (ouverture, clôture)",
      "Préparation automatique : un bulletin par employé salarié, calculé depuis les résumés de présences",
      "Paie sur heures réelles (specs MVP) : brut = heures normales × taux horaire + HS × taux majoré + Σ primes de tâche",
      "Taux horaire = salaire ÷ 225,3 h (paramétrable RH-00) ; taux HS = taux horaire × 1,5",
      "Primes de tâche saisies jour par jour dans le pointage, agrégées sur la période",
      "Calcul camerounais : CNPS salariale 4,5 %, patronale 5,6 %, net imposable, IRPP barème progressif (5 tranches)",
      "Lignes de bulletin : HN, HS ×1,5, prime présence 10 % (≥ 95 %), prime performance (RH-05), retenues absence /26 j, avance",
      "Ajustement de bulletin (recalcul, bloqué si payé)",
      "Génération PDF du bulletin (prêt à imprimer)",
      "Marquer payé : Espèces, Orange Money, MTN MoMo, Virement",
      "Configuration des éléments de paie : taux et barèmes modifiables (aucune formule en dur)",
    ],
    etapes: [
      { titre: "Ouvrir une période", detail: "Onglet Périodes & préparation → dates début/fin → Ouvrir la période." },
      { titre: "Calculer la paie", detail: "Cliquez sur Calculer la paie : les bulletins sont générés (refus si présences non clôturées)." },
      { titre: "Vérifier les bulletins", detail: "Onglet Bulletins → détail, ajustement si nécessaire, téléchargement PDF." },
      { titre: "Payer", detail: "Marquer payé → choisir le mode de paiement → confirmer. Le bulletin est verrouillé." },
      { titre: "Configurer les éléments", detail: "Onglet Configuration → modifier taux/montants → Enregistrer (appliqué au prochain calcul)." },
    ],
    regles: [
      { titre: "Clôture des présences requise", detail: "Sans résumés clôturés, la préparation de la paie est refusée." },
      { titre: "Logique de calcul (specs MVP)", detail: "Taux horaire = salaire ÷ 225,3 h ; HN = MIN(travaillées, seuil 9,5 h) ; HS = MAX(0, travaillées − seuil) ; brut = HN × taux + HS × taux × 1,5 + primes de tâche." },
      { titre: "Mode mensuel fixe", detail: "Un employé en modePaie « mensuel » garde son salaire de base fixe (override) au lieu du calcul sur heures." },
      { titre: "IRPP barème progressif", detail: "0-40k : 0 % · 40-120k : 10 % · 120-300k : 15 % · 300-500k : 25 % · >500k : 35 % (cumulatif par tranche)." },
      { titre: "Bulletin payé = verrouillé", detail: "Un bulletin marqué payé ne peut plus être ajusté." },
      { titre: "Audit", detail: "Chaque calcul, ajustement et paiement est horodaté et tracé." },
    ],
    faq: [
      { q: "Pourquoi la préparation est refusée ?", r: "Clôturez d'abord les présences du mois (Présences → Mensuel & clôture)." },
      { q: "Comment corriger un bulletin ?", r: "Tant qu'il n'est pas payé : Bulletins → Ajuster → saisir le nouveau montant → le recalcul est automatique." },
      { q: "Où est le PDF du bulletin ?", r: "Bulletins → bouton PDF : téléchargeable à tout moment (réédition possible)." },
    ],
  },
  {
    id: "rh-evaluations",
    titre: "Évaluation & Performance",
    courte: "Grilles par poste, campagnes, notes pondérées, prime de performance.",
    priorite: "P2",
    route: "/dashboard/rh/evaluations",
    prerequis: ["Employés créés (RH-01)", "Module évaluation activé (RH-00 → Général)"],
    fonctionnalites: [
      "Grilles d'évaluation par poste : critères pondérés (somme = 100 %)",
      "Grille Technicien par défaut : 6 critères (30/20/15/15/10/10)",
      "Campagnes d'évaluation par période (nom, dates)",
      "Saisie : note par critère (1-5) + appréciation, note globale pondérée calculée",
      "Barème de prime paramétrable (ex. : 4,5+ → 20 000 · 4,0+ → 15 000 · 3,5+ → 10 000 · 3,0+ → 5 000)",
      "Prime suggérée disponible à la paie (RH-04)",
      "Historique complet des évaluations par employé",
    ],
    etapes: [
      { titre: "Créer/ajuster une grille", detail: "Onglet Grilles → + Nouvelle grille → critères + pondérations (total 100 %) → Enregistrer." },
      { titre: "Lancer une campagne", detail: "Onglet Campagnes & saisie → + Lancer une campagne → période." },
      { titre: "Évaluer", detail: "Pour chaque employé : grille → note par critère → la note globale est calculée automatiquement." },
      { titre: "Utiliser la prime", detail: "La prime suggérée (ex. : 4,15 → 15 000 F) est reprise lors de la préparation de la paie." },
    ],
    regles: [
      { titre: "Somme des pondérations = 100 %", detail: "La création d'une grille est refusée si le total diffère de 100." },
      { titre: "Note pondérée", detail: "Chaque critère compte selon sa pondération, normalisée sur l'échelle (5)." },
      { titre: "Barème paramétrable", detail: "Modifiez les tranches/montants : le prochain calcul de prime les utilise." },
    ],
    faq: [
      { q: "Comment une note 4,15 est-elle calculée ?", r: "Moyenne pondérée des notes par critère : ex. [4, 5, 3, 4, 5, 4] sur la grille Technicien." },
      { q: "La prime est-elle automatique en paie ?", r: "Elle est suggérée au moment de préparer la paie ; le RH peut l'accepter ou la modifier." },
    ],
  },
  {
    id: "rh-competences",
    titre: "Compétences & Formations",
    courte: "Référentiel, matrice par employé, écarts détectés, plan de formation.",
    priorite: "P2",
    route: "/dashboard/rh/competences",
    prerequis: ["Employés avec poste affecté (RH-01)", "Compétences seedées par défaut (10)"],
    fonctionnalites: [
      "Référentiel de compétences (10 par défaut, 5 catégories) : code unique, catégorie, description, recherche",
      "Exigences par poste : compétence + niveau requis (1-5), ajout/retrait",
      "Matrice employés : niveau actuel (1-5) par compétence, évaluation horodatée et tracée",
      "Détection des écarts : requis vs actuel, badge CRITIQUE si écart ≥ 2",
      "Formations suggérées automatiquement selon les écarts (tri par impact)",
      "Catalogue de formations (5 par défaut) : titre, type interne/externe, durée, compétences ciblées",
      "Sessions planifiées : dates, lieu, statut (planifiée/en cours/terminée/annulée)",
      "Inscription des participants, statuts (inscrit/présent/validé/absent), note",
      "Alertes : employés jamais formés ou sans formation depuis 6 mois",
    ],
    etapes: [
      { titre: "Consulter le référentiel", detail: "Onglet Référentiel : liste des compétences, recherche, création (+ Nouvelle compétence)." },
      { titre: "Voir les écarts d'un employé", detail: "Onglet Matrice employés → sélectionner l'employé : écarts critiques et formations suggérées s'affichent." },
      { titre: "Évaluer un niveau", detail: "Dans la matrice, cliquez sur 1-5 pour la compétence : enregistrement immédiat." },
      { titre: "Planifier une formation", detail: "Onglet Formations → Planifier une session → dates + lieu." },
      { titre: "Inscrire des participants", detail: "Onglet Plan & historique → Inscrire un employé → session + employé." },
    ],
    regles: [
      { titre: "Écart critique", detail: "Un écart de 2 niveaux ou plus (requis − actuel) est marqué CRITIQUE." },
      { titre: "Suggestions", detail: "Les formations sont suggérées en fonction des compétences en écart, triées par impact cumulé." },
      { titre: "Alerte 6 mois", detail: "Un employé sans formation depuis 6 mois (ou jamais formé) déclenche une alerte." },
    ],
    faq: [
      { q: "Comment créer une compétence ?", r: "Onglet Référentiel → + Nouvelle compétence → code (unique), nom, catégorie → Enregistrer." },
      { q: "Pourquoi une alerte « jamais formé » apparaît ?", r: "L'employé n'a aucune participation à une session. Inscrivez-le à une formation." },
    ],
  },
  {
    id: "rh-sanctions",
    titre: "Disciplinaire",
    courte: "Sanctions, dossier disciplinaire, détection de récidive. Accès RH & Direction uniquement.",
    priorite: "P2",
    route: "/dashboard/rh/sanctions",
    prerequis: [
      "Types de sanctions configurés (RH-00, 5 types par défaut)",
      "Accès réservé au Responsable RH et au Directeur",
    ],
    fonctionnalites: [
      "Registre des sanctions : recherche, type, gravité, décision, suppression confirmée",
      "Nouveau record : employé, type (RH-00), faits/motif, date, décision (notifiée/non), dates d'effet, durée, montant, document",
      "Notification horodatée automatique quand la décision est « notifiée »",
      "Dossier disciplinaire par employé : historique complet, auteur de la décision, documents",
      "KPI du dossier : records, avertissements dans la fenêtre, ALERTE RÉCIDIVE",
      "Récidive : comptage des avertissements (gravité 1-2 notifiés) sur période glissante paramétrable (12 mois, ≥ 2)",
      "Fenêtre modifiable dans RH-00 → Général",
    ],
    etapes: [
      { titre: "Enregistrer une sanction", detail: "Onglet Nouveau record → employé, type, motif, date, décision → Enregistrer." },
      { titre: "Consulter le dossier", detail: "Onglet Dossier employé → sélectionner l'employé : historique + alerte récidive." },
      { titre: "Joindre un document", detail: "Renseignez le champ Document (URL/chemin) lors de la création." },
    ],
    regles: [
      { titre: "Accès restreint", detail: "Seuls RH et Directeur peuvent voir et gérer les sanctions." },
      { titre: "Récidive", detail: "≥ 2 avertissements notifiés dans la fenêtre (défaut 12 mois) → ALERTE RÉCIDIVE affichée dans le dossier." },
      { titre: "Proportionnalité", detail: "La gravité vient du type de sanction (RH-00) : 1 = léger, 5 = licenciement." },
    ],
    faq: [
      { q: "Que signifie « Notifiée » ?", r: "La sanction a été officiellement notifiée à l'employé ; l'heure de notification est enregistrée." },
      { q: "Comment changer la période de récidive ?", r: "Paramétrage RH → Général → Fenêtre disciplinaire (mois)." },
    ],
  },
  {
    id: "rh-documents",
    titre: "Documents RH",
    courte: "Contrats, pièces d'identité, certificats, alertes d'expiration.",
    priorite: "P2",
    route: "/dashboard/rh/documents",
    prerequis: ["Employés créés (RH-01)", "Types de documents configurés (8 par défaut)"],
    fonctionnalites: [
      "Liste des documents : recherche (employé, type, titre), statut d'expiration affiché",
      "Ajout de document : employé, type, titre, fichier (PDF/image), dates émission/expiration, notes, auteur tracé",
      "Types de documents paramétrables (8 par défaut) : code, nom, « requiert une expiration »",
      "Activer/désactiver un type, supprimer un type",
      "Alertes d'expiration : documents expirés ou expirant sous 30 jours, triés par urgence (jours restants)",
      "Liens directs vers les fichiers",
    ],
    etapes: [
      { titre: "Ajouter un document", detail: "Onglet Documents → + Ajouter un document → employé, type, fichier, dates → Enregistrer." },
      { titre: "Créer un type", detail: "Onglet Types → + Nouveau type → code, nom, case « requiert expiration » → Enregistrer." },
      { titre: "Suivre les expirations", detail: "Onglet Alertes expiration : renouvelez les pièces avant échéance." },
    ],
    regles: [
      { titre: "Statut d'expiration", detail: "Expiré (date dépassée) · Expire bientôt (≤ 30 j) · Valide · Sans expiration (type sans expiration)." },
      { titre: "Auteur tracé", detail: "L'utilisateur qui ajoute un document est enregistré (audit)." },
      { titre: "Types paramétrables", detail: "Les types sont gérés dans l'onglet Types — aucun codage en dur." },
    ],
    faq: [
      { q: "Pourquoi un document est marqué « Expiré » ?", r: "Sa date d'expiration est dépassée. Voir Alertes expiration pour agir." },
      { q: "Quels types requièrent une expiration ?", r: "Par défaut : Contrat de travail et CIN/Passeport. Modifiable dans Types." },
    ],
  },
  {
    id: "rh-planning",
    titre: "Planning hebdomadaire",
    courte: "Affectations par employé et par jour (Lundi→Samedi) : Atelier, Magasin, Accueil, Congé, Formation…",
    priorite: "P1",
    route: "/dashboard/rh/planning",
    prerequis: [
      "Employés actifs (RH-01)",
      "Permission rh.utilisateur.modifier pour enregistrer",
    ],
    fonctionnalites: [
      "Grille employés × Lundi→Samedi avec affectations en sélecteur coloré",
      "« Reprendre la semaine précédente » : pré-remplissage en un clic",
      "Détection de conflit : cellule rouge si un congé approuvé chevauche une affectation",
      "Sauvegarde en lot (une ligne par employé + jour), toast + liste rafraîchie",
      "Affectations types : Atelier-Pont 1/2, Magasin, Accueil, Congé, Formation, Extérieur, Carrosserie, Diagnostic, Autre",
    ],
    etapes: [
      { titre: "Choisir la semaine", detail: "Navigation ← Semaine → ou « Aujourd'hui »." },
      { titre: "Saisir les affectations", detail: "Un sélecteur par case ; la légende donne la couleur de chaque affectation." },
      { titre: "Enregistrer", detail: "« Enregistrer la semaine » : toute la grille est écrite d'un coup (invalidate + toast)." },
    ],
    regles: [
      { titre: "Specs MVP 07_Planning", detail: "Une ligne = un employé + un jour. Les congés approuvés sont signalés en rouge sur la grille." },
    ],
    faq: [
      { q: "Les congés approuvés sont-ils dans le planning ?", r: "Ils sont détectés : si un employé a un congé approuvé sur un jour où il est affecté, la cellule passe en rouge (conflit)." },
      { q: "Puis-je saisir une affectation libre ?", r: "Oui : la liste propose les affectations types ; « Autre » couvre les cas particuliers." },
    ],
  },
];

/** Recherche plein texte dans les fiches (titre, courte, fonctionnalités, étapes, règles, FAQ) */
export function searchHelpFiches(query: string, fiches: HelpFiche[] = RH_HELP_FICHES): HelpFiche[] {
  const q = query.trim().toLowerCase();
  if (!q) return fiches;
  return fiches.filter((f) => {
    const haystack = [
      f.titre,
      f.courte,
      f.priorite,
      ...f.prerequis,
      ...f.fonctionnalites,
      ...f.etapes.map((e) => `${e.titre} ${e.detail}`),
      ...f.regles.map((r) => `${r.titre} ${r.detail}`),
      ...f.faq.map((x) => `${x.q} ${x.r}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Fiche correspondant à une route (aide contextuelle) */
export function findHelpFicheByRoute(
  pathname: string,
  fiches: HelpFiche[] = RH_HELP_FICHES
): HelpFiche | null {
  const match = fiches.find((f) => pathname.startsWith(f.route));
  return match ?? null;
}
