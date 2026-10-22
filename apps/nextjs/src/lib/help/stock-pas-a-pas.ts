import type { EtapeGuide } from "~/components/help/GuideInteractif";

export const STOCK_PAS_A_PAS: EtapeGuide[] = [
  {
    id: "stock-p0-catalogue",
    titre: "S'assurer que les articles existent (ou les créer)",
    ou: "Catalogue > Articles",
    route: "/dashboard/catalog",
    quoi: [
      "Ouvrez Catalogue > Articles et cherchez l'article visé.",
      "S'il n'existe pas, cliquez Nouvel article et suivez les écrans du formulaire.",
      "Notez que le catalogue n'a jamais de quantité : c'est normal.",
    ],
    attendu: "l'article existe dans la liste et sa fiche s'ouvre.",
    astuce:
      "Un article n'est vendable que s'il a au moins une variante grand public.",
  },
  {
    id: "stock-p1-emplacements",
    titre: "Créer les emplacements du magasin",
    ou: "Stock > Emplacements",
    route: "/dashboard/stock/emplacements",
    quoi: [
      "Cliquez Nouvel emplacement.",
      "Saisissez un code au format ZONE-ALLEE-RAYON-NIVEAU (ex. MAG-A-01-03).",
      "Donnez un libellé clair (ex. Rayon filtres huile), choisissez le type et enregistrez.",
    ],
    attendu:
      "le code apparaît dans la liste et la saisie d'un code identique est refusée.",
    astuce:
      "Le format du code garantit un emplacement unique et parlant pour toute l'équipe — un code identique est refusé.",
  },
  {
    id: "stock-p2-entree",
    titre: "Faire une entrée de stock (fournisseur / réception)",
    ou: "Stock > Mouvements > Entrée",
    route: "/dashboard/stock/mouvements",
    quoi: [
      "Ouvrez Stock > Mouvements puis l'onglet Entrée.",
      "Choisissez l'article, saisissez la quantité, l'emplacement et le prix d'achat unitaire.",
      "Enregistrez.",
    ],
    attendu:
      "le stock de l'article augmente et un mouvement récent est visible dans l'historique avec sa référence.",
    astuce:
      "Le prix saisi fait évoluer le coût unitaire moyen : la valorisation de la pièce suivra le prix réel du magasin.",
  },
  {
    id: "stock-p3-ranger",
    titre: "Ranger : mise en rayon et transferts",
    ou: "Stock > Mise en rayon / Transfert",
    route: "/dashboard/stock/mise-en-rayon",
    quoi: [
      "Mise en rayon : article + quantité — le stock passe du stock général au rayon.",
      "Transfert : article + emplacement source + emplacement destination + quantité.",
      "Vérifiez le contenu de l'emplacement source après transfert.",
    ],
    attendu:
      "l'emplacement affiche l'article avec sa quantité ; les deux mouvements du transfert sont liés dans l'historique.",
  },
  {
    id: "stock-p4-consommer",
    titre: "Consommer : OR, retour et vente",
    ou: "Ordres de réparation > onglet Pièces · Caisse POS",
    route: "/dashboard/ordres-reparation",
    quoi: [
      "Sur une fiche OR : Réserver la pièce (le disponible baisse, le stock ne bouge pas).",
      "Puis Sortir la pièce (le stock actuel descend).",
      "Si inutilisée : Retour de pièce (le stock est réintégré).",
      "Pour la vente au comptoir : Caisse POS, ajouter la pièce, finaliser.",
    ],
    attendu:
      "chaque action crée un mouvement tracé rattaché à l'OR ou à la vente ; aucune action n'est possible sur un OR clos.",
  },
  {
    id: "stock-p5-recensement",
    titre: "Recenser ce qui reste en fin de journée",
    ou: "Stock > Recensement",
    route: "/dashboard/stock/recensement",
    quoi: [
      "Filtrez l'article, saisissez la quantité vue, choisissez la zone de rangement.",
      "Le stock déjà connu s'affiche à côté de votre saisie — il sert de contrôle.",
      "Validez ligne par ligne ; finissez par la validation de l'ensemble.",
    ],
    attendu:
      "les lignes validées passent en vert et les écarts (vu vs système) restent visibles avant la validation finale.",
    astuce:
      "Le mode strict refuse de passer à la ligne suivante tant que la quantité n'est pas saisie.",
  },
  {
    id: "stock-p6-inventaire",
    titre: "Contrôler périodiquement par l'inventaire",
    ou: "Stock > Inventaire",
    route: "/dashboard/stock/inventaire",
    quoi: [
      "Créez une session (statut Brouillon) puis cliquez Démarrer.",
      "Saisissez les quantités physiques de la zone à comptabiliser.",
      "Cliquez Valider pour appliquer les écarts au stock.",
    ],
    attendu:
      "des mouvements d'ajustement référencés apparaissent dans l'historique et la session passe Validée.",
  },
  {
    id: "stock-p7-contenants",
    titre: "Gérer les fûts : ouverture et DLC",
    ou: "Stock > Contenants",
    route: "/dashboard/stock/contenants",
    quoi: [
      "Cherchez le fût : le programme recommande d'ouvrir le plus ancien fût ouvert d'abord.",
      "Cliquez Ouverture sur le fût choisi — l'heure est enregistrée.",
      "Regardez la DLC proposée pour les prélèvements de ce fût.",
    ],
    attendu:
      "la DLC des bidons sortis se déduit normalement de l'heure d'ouverture : un fût ouvert hier donne une DLC plus longue qu'un fût ouvert depuis des mois.",
    astuce:
      "Le nombre de bidons dans le fût est calculé par le programme — jamais demandé à la saisie.",
  },
  {
    id: "stock-p8-deconditionnement",
    titre: "Extraire des unités (déconditionnement / reconditionnement)",
    ou: "Stock > Déconditionnement / Reconditionnement",
    route: "/dashboard/stock/deconditionnement",
    quoi: [
      "Déconditionnement : choisissez le contenant ouvert + la quantité à retirer (ex. 2 bidons de 5 L).",
      "La quantité retirée est calculée depuis les tables d'unités et affichée pour contrôle.",
      "Reconditionnement : article source (fût) + article/cible (bidon) + quantité + motif.",
    ],
    attendu:
      "les mouvements sortent deux par deux (source + cible) : soit les deux sont créés, soit aucun ; tirer plus que le contenu du fût est refusé.",
  },
  {
    id: "stock-p9-reajuster",
    titre: "Corriger le stock (ajustements, pertes)",
    ou: "Stock > Ajustement manuel",
    route: "/dashboard/stock/ajustement-manuel",
    quoi: [
      "Nature Perte ou Casse puis quantité et motif obligatoire (3 caractères minimum).",
      "Ajustement +/− pour une correction d'erreur avec motif clair.",
    ],
    attendu:
      "une saisie sans motif est refusée ; la perte financière est tracée ; jamais de suppression — on corrige par un mouvement inverse.",
  },
  {
    id: "stock-p10-piloter",
    titre: "Piloter le magasin (aperçu, prévisions, alertes)",
    ou: "Stock > Aperçu / Prévisions / Chercher avant de commander",
    route: "/dashboard/stock/apercu",
    quoi: [
      "Aperçu : six indicateurs, panneau des articles sans emplacement, panneau d'alertes.",
      "Prévisions : articles qui vont descendre, urgence et coût estimé de commande.",
      "Chercher avant de commander : regarder les autres agences avant d'engager l'achat.",
    ],
    attendu:
      "les décisions du jour (commander, transférer, recharger les seuils) se prennent depuis ces 3 écrans sans devoir visiter une autre page.",
  },
];
