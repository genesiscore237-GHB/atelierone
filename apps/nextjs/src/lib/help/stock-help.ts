/**
 * REGISTRE D'AIDE — MODULE STOCK & MAGASIN
 * Source unique du contenu d'aide in-app : utilisée par le bouton "?"
 * (aide contextuelle) et par le Centre d'aide (/dashboard/stock/aide).
 * Chaque fiche décrit un sous-module avec prérequis, fonctionnalités,
 * étapes, règles métier et FAQ.
 */

import type { HelpFiche } from "~/lib/help/rh-help";

export const STOCK_HELP_FICHES: HelpFiche[] = [
  {
    id: "stock-apercu",
    titre: "Vue d'ensemble du stock",
    courte: "KPI valeur du stock, ruptures, stocks bas, surstock, mouvements du jour, alertes.",
    priorite: "P1",
    route: "/dashboard/stock/apercu",
    prerequis: [
      "Des articles créés dans le catalogue (Articles / Catalogue)",
      "Des mouvements ou un inventaire initial pour avoir du stock",
    ],
    fonctionnalites: [
      "6 indicateurs : produits en stock, valeur du stock (PMP), ruptures, stocks bas, surstock, mouvements du jour",
      "Liste des alertes (rupture = rouge, critique, faible)",
      "Articles à achalander (stock sans emplacement / pas en rayon)",
      "Alertes anti-vol (ajustements suspects sur 7 jours)",
      "Stocks dormants (sans mouvement depuis X jours, avec valeur)",
      "10 mouvements récents + accès rapide aux actions (mouvements, déconditionnement, inventaire, ajustement)",
    ],
    etapes: [
      { titre: "Consulter les KPI", detail: "Ouvrez Vue d'ensemble : les 6 indicateurs s'affichent en haut." },
      { titre: "Voir les alertes", detail: "Le panneau Alertes Stock liste les articles sous le seuil (niveau critique/faible)." },
      { titre: "Mettre en rayon", detail: "Le panneau À achalander montre les articles stockés sans emplacement → Mise en rayon." },
    ],
    regles: [
      { titre: "Valeur du stock", detail: "Somme (quantité × coût unitaire moyen) sur toutes les lignes de stock." },
      { titre: "Niveaux d'alerte", detail: "Rupture : quantité ≤ 0 · Critique : ≤ seuil critique · Faible : ≤ seuil d'alerte · Surstock : > stock max." },
      { titre: "Dormants", detail: "Articles avec stock > 0 sans sortie depuis 90 jours (paramétrable)." },
    ],
    faq: [
      { q: "La valeur du stock affiche 0, pourquoi ?", r: "Les lignes de stock n'ont pas de coût unitaire moyen (CMUP). Il se met à jour lors des réceptions valorisées." },
      { q: "Comment voir les articles en surstock ?", r: "Le KPI Surstock indique le nombre ; la liste complète est accessible dans le catalogue avec le filtre approprié." },
    ],
  },
  {
    id: "stock-articles",
    titre: "Articles / Catalogue",
    courte: "Référentiel des pièces : code, désignation, catégorie, unités, seuils, prix.",
    priorite: "P0",
    route: "/dashboard/catalog",
    prerequis: [
      "Catégories et sous-catégories créées (gérées dans le catalogue)",
      "Unités de mesure définies (PCE, LIT, BID, FUT...)",
    ],
    fonctionnalites: [
      "Création d'article : code, désignation, catégorie, marque, référence constructeur",
      "Unités de base + unités d'achat/vente avec facteurs de conversion",
      "Prix : vente, minimum de vente, achat, référence",
      "Seuils : seuil d'alerte, seuil critique, stock maximum",
      "Emplacement principal, article reconditionnable",
      "Cycle de vie : BROUILLON → ACTIF → SUSPENDU / DISCONTINUE → ARCHIVE",
      "Recherche par code, désignation, référence",
      "Filtres : catégorie, stock bas, statut",
    ],
    etapes: [
      { titre: "Créer un article", detail: "Articles / Catalogue → + Nouveau → remplir code, désignation, catégorie, prix, seuils, unités → Enregistrer." },
      { titre: "Configurer les unités", detail: "Définissez l'unité de base (facteur 1) et les unités dérivées (ex. fût = 200 L)." },
      { titre: "Définir les seuils", detail: "Seuil d'alerte (stock bas), seuil critique, stock maximum (surstock)." },
      { titre: "Marquer reconditionnable", detail: "Cochez « reconditionnable » pour les huiles en fût → disponible dans le module Reconditionnement." },
    ],
    regles: [
      { titre: "Code unique", detail: "Chaque article a un code barre unique (généré ou saisi)." },
      { titre: "Une unité de base", detail: "Un seul facteur = 1 (RG-012) ; une seule unité d'achat et une seule de vente par défaut (RG-013/14)." },
      { titre: "Cycle de vie", detail: "Un article suspendu/discontinué ne peut plus être commandé mais son stock reste gérable." },
    ],
    faq: [
      { q: "Comment ajouter une unité de conversion ?", r: "Dans la fiche article, onglet unités → ajouter (ex. FUT avec facteur 200 pour un fût de 200 L)." },
      { q: "Où voir le stock d'un article ?", r: "La fiche article affiche le stock total ; Emplacements permet de voir la répartition par emplacement." },
    ],
  },
  {
    id: "stock-mouvements",
    titre: "Mouvements de stock",
    courte: "Entrées, sorties, ajustements : tout mouvement est tracé et jamais supprimable.",
    priorite: "P0",
    route: "/dashboard/stock/mouvements",
    prerequis: [
      "Articles créés avec stock initial (inventaire initial ou réception)",
      "Permission stock.modifier pour créer un mouvement",
    ],
    fonctionnalites: [
      "Historique complet des mouvements : type, sens, quantité, stock avant/après, utilisateur, date",
      "Filtres : article, type de mouvement, période",
      "Types : entrée (réception), sortie (OR/vente), transfert, ajustement +/-, reconditionnement, perte/vol/casse, retour",
      "Traçabilité : chaque mouvement porte un groupe d'opération (opérations liées) et un document de référence",
      "Annulation par mouvement inverse (aucune suppression physique)",
    ],
    etapes: [
      { titre: "Consulter l'historique", detail: "Mouvements de stock → filtres article/type/période → liste avec stock avant/après." },
      { titre: "Comprendre un mouvement", detail: "Chaque ligne montre le type, la référence (ex. INV-INIT-1) et l'utilisateur." },
    ],
    regles: [
      { titre: "Append-only", detail: "Aucun mouvement ne peut être supprimé (trigger base de données)." },
      { titre: "Stock jamais négatif", detail: "Une sortie est refusée si le stock est insuffisant." },
      { titre: "Motif obligatoire", detail: "Perte, vol, casse et ajustements exigent un motif écrit (min. 3 caractères)." },
    ],
    faq: [
      { q: "J'ai fait une erreur de saisie, comment corriger ?", r: "Créez un mouvement inverse (ajustement) avec le motif « Erreur de saisie »." },
      { q: "Pourquoi une sortie est refusée ?", r: "Le stock disponible est inférieur à la quantité demandée (pas de stock négatif)." },
    ],
  },
  {
    id: "stock-inventaire",
    titre: "Inventaire (initial & cyclique)",
    courte: "Comptage physique, écarts théorique vs réel, ajustements automatiques.",
    priorite: "P0",
    route: "/dashboard/stock/inventaire",
    prerequis: [
      "Articles créés (catalogue)",
      "Permission stock.inventaire (magasinier, admin, directeur)",
    ],
    fonctionnalites: [
      "Session d'inventaire : libellé, statut (en cours → validé), responsable",
      "Inventaire initial : crée le stock de départ avec mouvements historisés (ref INV-INIT-*)",
      "Comptage ligne par ligne : quantité théorique vs quantité physique, écart calculé",
      "Validation : génère automatiquement les ajustements (+/-) et les pertes si écart négatif",
      "Historique des sessions et des écarts",
    ],
    etapes: [
      { titre: "Inventaire initial", detail: "Inventaire → Nouvelle session « Initial » → saisir les quantités physiques → Valider. Les mouvements sont générés automatiquement." },
      { titre: "Inventaire cyclique", detail: "Comptez une zone/catégorie → saisissez les quantités → les écarts sont calculés." },
      { titre: "Valider", detail: "La validation applique les écarts au stock et historise les ajustements." },
    ],
    regles: [
      { titre: "Écart = physique − théorique", detail: "Positif = ajustement +, négatif = ajustement − (avec perte financière tracée)." },
      { titre: "Historisation", detail: "Chaque validation génère des mouvements AJUSTEMENT_INVENTAIRE référencés INV-{session}." },
      { titre: "Objectif < 5 % d'écart", detail: "Après 2 cycles, l'écart physique vs théorique doit être < 5 % (indicateur de fiabilité)." },
    ],
    faq: [
      { q: "Quelle est la différence entre initial et cyclique ?", r: "L'initial crée le stock de départ ; le cyclique vérifie une partie du stock (zone, catégorie)." },
      { q: "Que se passe-t-il si l'écart est négatif ?", r: "Un ajustement négatif est créé et une perte financière est enregistrée (traçabilité)." },
    ],
  },
  {
    id: "stock-reconditionnement",
    titre: "Reconditionnement (fût → unités)",
    courte: "Transforme une grande unité (fût 200L) en unités utilisables (bidons 5L).",
    priorite: "P1",
    route: "/dashboard/stock/reconditionnement",
    prerequis: [
      "Article source marqué reconditionnable (fût) avec unités définies",
      "Article cible (bidon) avec unités définies",
      "Stock suffisant de l'article source",
    ],
    fonctionnalites: [
      "Reconditionnement inter-articles : fût 200L → bidons 5L (ratio dérivé des facteurs d'unités)",
      "Quantité générée calculée automatiquement (ex. 1 fût = 40 bidons)",
      "Deux mouvements liés atomiquement (sortie fût + entrée bidons) avec le même groupe d'opération",
      "Historique complet : source, cible, quantités, ratio, motif, date",
      "Refus si stock insuffisant ou ratio invalide",
      "Motif recommandé (min. 3 caractères)",
    ],
    etapes: [
      { titre: "Préparer les articles", detail: "Créez le fût (unité FUT = 200 L) et le bidon (unité BID = 5 L) avec leurs unités." },
      { titre: "Reconditionner", detail: "Reconditionnement → article source (fût), quantité, article cible (bidon) → motif → Confirmer." },
      { titre: "Vérifier", detail: "Le stock du fût diminue, celui du bidon augmente. Deux mouvements liés apparaissent dans l'historique." },
    ],
    regles: [
      { titre: "Atomicité", detail: "Les deux mouvements (source + cible) sont créés ensemble : soit les deux, soit aucun." },
      { titre: "Ratio", detail: "Quantité générée = (quantité source × facteur source) / facteur cible, arrondie à l'unité inférieure." },
      { titre: "Traçabilité", detail: "L'opération est liée par un groupe d'opération commun aux deux mouvements." },
    ],
    faq: [
      { q: "Pourquoi ma quantité générée est-elle 0 ?", r: "Le ratio source/cible est trop faible ou les unités ne sont pas définies. Vérifiez les facteurs dans la fiche article." },
      { q: "Peut-on reconditionner sur le même article ?", r: "Oui : si l'article cible n'est pas précisé, la transformation se fait dans les unités du même article (compatibilité)." },
    ],
  },
  {
    id: "stock-ajustement",
    titre: "Ajustement manuel & pertes",
    courte: "Corriger un stock ou déclarer une perte / un vol / une casse avec motif.",
    priorite: "P1",
    route: "/dashboard/stock/ajustement-manuel",
    prerequis: [
      "Articles créés",
      "Permission stock.modifier",
    ],
    fonctionnalites: [
      "Ajustement positif / négatif (correction d'erreur, réintégration)",
      "Déclaration de perte / vol / casse / avarie / rebut avec type et motif obligatoire",
      "Décrément du stock + enregistrement de la perte financière (montant = quantité × coût)",
      "Mouvement historisé avec référence et motif",
    ],
    etapes: [
      { titre: "Ajuster", detail: "Ajustement manuel → article, type (+/-), quantité, unité, motif → Enregistrer." },
      { titre: "Déclarer une perte", detail: "Ajustement manuel → nature Perte/Casse → type (vol, casse, avarie, rebut) → motif obligatoire → Enregistrer." },
    ],
    regles: [
      { titre: "Motif obligatoire", detail: "Perte, vol, casse et ajustements exigent un motif écrit (min. 3 caractères)." },
      { titre: "Pas de suppression", detail: "Un ajustement ne peut pas être supprimé : corrigez par un mouvement inverse." },
      { titre: "Impact valorisation", detail: "Les pertes impactent la valeur du stock (perte financière tracée)." },
    ],
    faq: [
      { q: "J'ai saisi une mauvaise quantité, que faire ?", r: "Faites un ajustement inverse avec le motif « Erreur de saisie »." },
      { q: "Comment traiter une pièce cassée ?", r: "Déclarez-la en perte (type Casse) avec motif — le stock et la valeur sont ajustés." },
    ],
  },
  {
    id: "stock-emplacements",
    titre: "Emplacements & Rayonnage",
    courte: "Structure du magasin codifiée ZONE-ALLEE-RAYON-NIVEAU, contenu par emplacement.",
    priorite: "P1",
    route: "/dashboard/stock/emplacements",
    prerequis: ["Articles avec du stock (pour voir le contenu d'un emplacement)"],
    fonctionnalites: [
      "Création d'emplacements au format ZONE-ALLEE-RAYON-NIVEAU (ex. MAG-A-01-03, EXT-PNEU)",
      "Types : rayon, sol, tiroir, extérieur, frigo, autre",
      "Recherche par code ou libellé",
      "Consultation du contenu d'un emplacement : article, quantité, valeur",
      "Base pour la mise en rayon et les transferts",
    ],
    etapes: [
      { titre: "Créer un emplacement", detail: "Emplacements → Nouvel emplacement → code au format ZONE-ALLEE-RAYON-NIVEAU + libellé + type → Enregistrer." },
      { titre: "Consulter un emplacement", detail: "Cliquez sur un emplacement pour voir les articles qui y sont stockés." },
      { titre: "Ranger les pièces", detail: "Utilisez la Mise en rayon et les Transferts pour affecter les articles aux emplacements." },
    ],
    regles: [
      { titre: "Format codifié", detail: "Le code doit suivre ZONE-ALLEE-RAYON-NIVEAU (majuscules + tirets)." },
      { titre: "Code unique", detail: "Un emplacement avec le même code est refusé." },
      { titre: "Rangement intelligent", detail: "Lourd en bas, forte rotation à hauteur d'homme, fluides isolés, batteries sur support." },
    ],
    faq: [
      { q: "Comment structurer mon magasin ?", r: "Créez des emplacements par zone (MAG, EXT, BUR...) puis allée-rayon-niveau (ex. MAG-A-01-03)." },
      { q: "Un emplacement peut-il avoir des sous-emplacements ?", r: "Oui, la structure supporte la hiérarchie (parent/enfant)." },
    ],
  },
  {
    id: "stock-transfert",
    titre: "Transfert & mise en rayon",
    courte: "Déplacer du stock entre emplacements et sortir les articles du stock général vers le rayon.",
    priorite: "P1",
    route: "/dashboard/stock/transfert",
    prerequis: ["Au moins deux emplacements créés", "Stock disponible sur l'emplacement source"],
    fonctionnalites: [
      "Transfert entre emplacements (4 mouvements liés, tracés)",
      "Mise en rayon : stock général → rayon (incrément de la quantité en rayon)",
      "Historique consultable",
    ],
    etapes: [
      { titre: "Transférer", detail: "Transfert → article, emplacement source, emplacement destination, quantité → Enregistrer." },
      { titre: "Mettre en rayon", detail: "Mise en rayon → article + quantité → le stock passe du général au rayon." },
    ],
    regles: [
      { titre: "Stock suffisant", detail: "Le transfert est refusé si la source n'a pas assez de stock." },
      { titre: "Traçabilité", detail: "Chaque transfert crée des mouvements liés par un groupe d'opération." },
    ],
    faq: [
      { q: "Quelle différence entre transfert et mise en rayon ?", r: "Le transfert déplace entre deux emplacements ; la mise en rayon sort le stock du stock général vers un rayon." },
    ],
  },
];
