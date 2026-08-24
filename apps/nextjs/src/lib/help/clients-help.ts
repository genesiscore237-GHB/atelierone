/**
 * CLIENTS & CONTRATS — fiches d'aide (source : module Clients & Contrats).
 * Consommées par le centre d'aide contextuel et la recherche d'aide.
 */

export interface HelpFiche {
  id: string;
  titre: string;
  courte: string;
  priorite: "P1" | "P2" | "P3";
  route: string;
  prerequis: string[];
  fonctionnalites: string[];
  etapes: Array<{ titre: string; detail: string }>;
  regles: Array<{ titre: string; detail: string }>;
  faq: Array<{ q: string; r: string }>;
}

export const CLIENTS_HELP_FICHES: HelpFiche[] = [
  {
    id: "clients-fiche",
    titre: "Clients : fiches par type",
    courte: "Particulier, Entreprise, Administration, Assurance, Flotte, Prospect — champs obligatoires différents selon le type.",
    priorite: "P1",
    route: "/dashboard/customers",
    prerequis: ["Permission clients.consulter (lecture) / clients.creer (création)", "Un agence configurée"],
    fonctionnalites: [
      "Création en moins d'une minute (Particulier : civilité, nom, prénom, téléphone)",
      "Entreprise / Flotte : raison sociale, NIU/NIF, RCCM, contact principal obligatoire",
      "Administration : mêmes bases + délais de paiement longs (relances)",
      "Assurance : compagnie, n° de police, n° de sinistre, expert, franchise",
      "Prospect : conversion explicite PROSPECT → ACTIF",
      "Recherche multicritère : nom, téléphone, code client, NIU, raison sociale",
      "Fiche 360° : identité, contacts, adresses, contrats, véhicules, interactions, historique des statuts",
      "Statuts : PROSPECT, ACTIF, INACTIF, BLOQUÉ, ARCHIVÉ (audit trail complet)",
    ],
    etapes: [
      { titre: "Créer un client", detail: "Clients → Nouveau client → choisir le type → champs obligatoires du type → Créer. Le code CLT-année-XXXX est auto (saisie libre possible, immuable ensuite)." },
      { titre: "Convertir un prospect", detail: "Fiche prospect → « Convertir en client » (action explicite)." },
      { titre: "Bloquer / débloquer", detail: "Fiche client → Bloquer (motif obligatoire). Un client BLOQUÉ ne peut plus ouvrir d'ordre de réparation." },
      { titre: "Consulter la fiche 360°", detail: "Onglets : Identité, Contacts, Adresses, Contrats, Véhicules, Interactions, Historique (changements de statut tracés)." },
    ],
    regles: [
      { titre: "Code client immuable", detail: "Le code client ne peut pas être modifié après création." },
      { titre: "Un seul contact principal", detail: "Obligatoire pour Entreprise / Administration / Flotte ; un seul actif à la fois." },
      { titre: "Soft delete uniquement", detail: "Un client avec un contrat actif ne peut pas être archivé. L'archivage est tracé." },
      { titre: "Client BLOQUÉ", detail: "Plus aucun nouvel OR possible (règle appliquée par le module Ordres de Réparation)." },
    ],
    faq: [
      { q: "Pourquoi la création est refusée ?", r: "Les champs obligatoires du type choisi manquent (ex. NIU pour une entreprise). Le message liste les champs manquants." },
      { q: "Que devient un client archivé ?", r: "Il disparaît des listes actives mais son historique (ventes, OR, contrats) est conservé." },
    ],
  },
  {
    id: "clients-contrats",
    titre: "Contrats de maintenance",
    courte: "Forfait mensuel/annuel, à la demande, préventif programmé — cycle de vie complet et véhicules couverts.",
    priorite: "P1",
    route: "/dashboard/contrats",
    prerequis: ["Un client Entreprise / Administration / Flotte actif", "Permissions contrats.consulter / contrats.creer / contrats.modifier"],
    fonctionnalites: [
      "Numéro auto : CONT-année-XXXXX",
      "Types : forfait mensuel, forfait annuel, à la demande, préventif programmé, mixte",
      "Fréquence de facturation : mensuelle, trimestrielle, annuelle, à la demande",
      "SLA : délai d'intervention en heures ; couverture : pièces + MO, MO seule, préventif",
      "Véhicules couverts : existants ou immatriculation temporaire (avant création dans le module Véhicules)",
      "Cycle de vie : Brouillon → Actif → Suspendu → Résilié ; Renouvellement (prolonge la période)",
      "Statut effectif : un contrat dont la fin est dépassée passe automatiquement EXPIRE",
    ],
    etapes: [
      { titre: "Créer un contrat", detail: "Contrats → Nouveau contrat → client éligible, libellé, type, dates, montant forfait, SLA, couverture → Créer (brouillon ou actif immédiat)." },
      { titre: "Activer", detail: "Un brouillon est activé quand il est prêt (vérifie que la période est valide)." },
      { titre: "Suspendre / Résilier", detail: "Suspendre : pause. Résilier : motif obligatoire — les véhicules couverts sont désactivés." },
      { titre: "Renouveler", detail: "Prolonge la fin de contrat d'une période (1 mois si forfait mensuel, 12 mois sinon) ou saisir une nouvelle fin." },
    ],
    regles: [
      { titre: "Résiliation motivée", detail: "Impossible de résilier un contrat sans motif (min 3 caractères)." },
      { titre: "Contrat ACTIF cohérent", detail: "date de début ≤ aujourd'hui et date de fin nulle ou ≥ aujourd'hui." },
      { titre: "Modification restreinte", detail: "Seul un contrat BROUILLON est modifiable ; après activation, utilisez les actions du cycle de vie." },
    ],
    faq: [
      { q: "Pourquoi je ne peux pas modifier mon contrat ?", r: "Il n'est plus en BROUILLON. Utilisez Suspendre/Résilier/Renouveler, ou créez un avenant (nouveau contrat)." },
      { q: "Un véhicule peut-il être sur le contrat avant sa création ?", r: "Oui : saisissez son immatriculation en temporaire ; il sera rattaché au véhicule lors de sa création." },
    ],
  },
  {
    id: "vehicules-parc",
    titre: "Véhicules & Atelier : parc et cycle d'immobilisation",
    courte: "Chaque véhicule appartient à un client ; statuts suivis de la réception à la sortie ; un OR s'ouvre sur un véhicule.",
    priorite: "P1",
    route: "/dashboard/vehicules",
    prerequis: ["Permissions vehicules.consulter / vehicules.creer / vehicules.modifier", "Clients créés (module Clients & Contrats)"],
    fonctionnalites: [
      "Parc : recherche par immatriculation, marque, modèle ou propriétaire + filtre par statut",
      "Fiche véhicule : châssis, kilométrage, carburant, type, propriétaire, historique des OR, contrats couvrants",
      "Cycle d'immobilisation (11 statuts) : réception → diagnostic → réparation → attente pièce / validation → terminée → sorti",
      "Transitions contrôlées : seules les étapes du workflow sont autorisées",
      "Ouverture d'un OR : le véhicule passe automatiquement EN RÉPARATION",
      "Liaison à un contrat de maintenance actif (ou retrait)",
      "Changement de propriétaire (transfert à un autre client)",
    ],
    etapes: [
      { titre: "Enregistrer un véhicule", detail: "Parc → Nouveau véhicule → immatriculation (unique), propriétaire, marque/modèle, type, carburant, kilométrage → le véhicule entre EN RÉCEPTION." },
      { titre: "Suivre l'immobilisation", detail: "Fiche véhicule → « Changer de statut… » : seules les transitions autorisées sont proposées." },
      { titre: "Ouvrir un OR", detail: "Ordres de Réparation → le véhicule passe EN RÉPARATION automatiquement. Un véhicule SORTI doit être ré-entré (réception) avant un nouvel OR." },
      { titre: "Sortir le véhicule", detail: "Terminée → attente paiement → Sorti : le cycle est clos (ré-entrée possible ensuite)." },
    ],
    regles: [
      { titre: "Véhicule SORTI", detail: "Aucun nouvel OR possible tant que le véhicule n'est pas ré-entré (statut réception)." },
      { titre: "Immatriculation unique", detail: "Une immatriculation ne peut exister qu'une seule fois par agence." },
      { titre: "Contrat couvrant", detail: "Seul un contrat ACTIF peut couvrir un véhicule ; la liaison est retirée à la résiliation." },
    ],
    faq: [
      { q: "Pourquoi je ne peux pas passer un véhicule en diagnostic depuis « terminée » ?", r: "Le workflow est linéaire : chaque statut n'accepte que les étapes suivantes (retour en réparation possible pour retouches)." },
      { q: "Où voir l'historique d'un véhicule ?", r: "Fiche véhicule → panneau « Ordres de réparation » : tous les OR du véhicule avec leurs statuts." },
    ],
  },
];