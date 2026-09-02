/**
 * RÉFÉRENTIEL DES CATÉGORIES DE STOCK — Garage / Atelier mécanique.
 * Source : DOC (fichier de référence) — 16 familles, sous-familles, articles.
 * Chaque article devient une catégorie feuille sur laquelle se rattachent les produits.
 * Codes générés : G01… (famille), G0101… (sous-famille), G010101… (article).
 */

export type ArticleRef = { nom: string };
export type SousFamilleRef = { nom: string; articles: string[] };
export type FamilleRef = {
  nom: string;
  typeBranche: "PIECE" | "CONSOMMABLE" | "OUTIL";
  sous?: SousFamilleRef[];
  articles?: string[];
};

export const REFERENTIEL_GARAGE: FamilleRef[] = [
  // ─── 1. PIÈCES MOTEUR ───
  {
    nom: "Pièces moteur",
    typeBranche: "PIECE",
    sous: [
      { nom: "Filtres", articles: ["Filtre à huile", "Filtre à air", "Filtre à carburant", "Filtre habitacle / pollen", "Filtre boîte de vitesses automatique", "Filtre hydraulique"] },
      { nom: "Allumage & Préchauffage", articles: ["Bougie d'allumage", "Bougie de préchauffage", "Bobine d'allumage", "Fils de bougie / faisceau d'allumage", "Module d'allumage", "Capteur de position vilebrequin", "Capteur d'arbre à cames"] },
      { nom: "Distribution & Courroies", articles: ["Courroie de distribution", "Kit de distribution (courroie + galets + pompe à eau)", "Chaîne de distribution", "Kit chaîne de distribution", "Courroie d'accessoires / serpentine", "Galet tendeur", "Galet enrouleur", "Poulie damper / poulie vilebrequin"] },
      { nom: "Joints & Étanchéité", articles: ["Joint de culasse", "Joint de cache-culbuteurs", "Joint de carter d'huile", "Joint de collecteur d'admission", "Joint de collecteur d'échappement", "Joint spi / bagues d'étanchéité", "Joint de pompe à eau", "Joint de thermostat"] },
      { nom: "Refroidissement", articles: ["Radiateur", "Pompe à eau", "Thermostat", "Durite de radiateur", "Durite de turbo", "Bouchon de radiateur", "Vase d'expansion", "Ventilateur / moto-ventilateur", "Sonde de température d'eau"] },
      { nom: "Admission & Échappement moteur", articles: ["Collecteur d'admission", "Turbo / turbocompresseur", "Échangeur air-air (intercooler)", "Vanne EGR", "Sonde lambda / sonde à oxygène", "Capteur de pression turbo (MAP)", "Debitmetre d'air (MAF)"] },
      { nom: "Autres pièces moteur", articles: ["Pompe à huile", "Carter d'huile", "Culasse", "Piston + segments", "Bielles", "Vilebrequin", "Support moteur", "Silentbloc moteur"] },
    ],
  },
  // ─── 2. FREINAGE ───
  {
    nom: "Freinage",
    typeBranche: "PIECE",
    sous: [
      { nom: "Plaquettes & Disques", articles: ["Plaquettes de frein avant", "Plaquettes de frein arrière", "Disques de frein avant", "Disques de frein arrière", "Kit plaquettes + disques"] },
      { nom: "Étriers & Cylindres", articles: ["Étrier de frein", "Cylindre de roue", "Maître-cylindre", "Servofrein / amplificateur de freinage"] },
      { nom: "Flexibles & Tuyauterie", articles: ["Flexible de frein", "Tuyau de frein rigide", "Raccord de frein"] },
      { nom: "Frein à main & Accessoires", articles: ["Câble de frein à main", "Levier de frein à main", "Tambour de frein", "Mâchoires de frein"] },
      { nom: "Liquide & Capteurs", articles: ["Liquide de frein (DOT 4, DOT 5.1…)", "Capteur d'usure de plaquettes", "Capteur ABS", "Centrale ABS / module ABS"] },
    ],
  },
  // ─── 3. FILTRES, HUILES & LIQUIDES ───
  {
    nom: "Filtres, huiles & liquides",
    typeBranche: "CONSOMMABLE",
    sous: [
      { nom: "Huiles moteur", articles: ["Huile moteur 5W30", "Huile moteur 5W40", "Huile moteur 0W20", "Huile moteur 10W40", "Huile moteur spécifique constructeur (LongLife, etc.)"] },
      { nom: "Autres lubrifiants", articles: ["Huile de boîte manuelle", "Huile de boîte automatique (ATF)", "Huile de pont / différentiel", "Huile de direction assistée", "Graisse multipurpose", "Graisse pour cardans / joints homocinétiques"] },
      { nom: "Liquides", articles: ["Liquide de refroidissement / antigel", "Liquide de frein", "Liquide de direction assistée", "Liquide lave-glace", "Liquide de climatisation (gaz + huile PAG)"] },
      { nom: "Additifs & Produits d'entretien", articles: ["Additif nettoyant injecteurs", "Additif anti-fumée", "Additif FAP / DPF", "Nettoyant circuit de refroidissement", "Dégrippant", "Spray freins", "Nettoyant contact électrique"] },
    ],
  },
  // ─── 4. EMBRAYAGE & BOÎTE DE VITESSES ───
  {
    nom: "Embrayage & boîte de vitesses",
    typeBranche: "PIECE",
    sous: [
      { nom: "Embrayage", articles: ["Kit d'embrayage (disque + mécanisme + butée)", "Disque d'embrayage", "Mécanisme d'embrayage", "Butée d'embrayage / roulement de butée", "Volant moteur (bimasse ou monomasse)", "Cylindre récepteur d'embrayage", "Cylindre émetteur d'embrayage", "Câble d'embrayage", "Fourchette d'embrayage"] },
      { nom: "Boîte de vitesses & Transmission", articles: ["Boîte de vitesses (complète)", "Synchroniseurs", "Arbres de boîte", "Joint de sortie de boîte", "Cardan / arbre de transmission", "Joint homocinétique", "Soufflet de cardan", "Différentiel", "Embrayage de pont"] },
    ],
  },
  // ─── 5. DIRECTION / SUSPENSION / TRAIN ROULANT ───
  {
    nom: "Direction / Suspension / Train roulant",
    typeBranche: "PIECE",
    sous: [
      { nom: "Direction", articles: ["Crémaillère de direction", "Rotule de direction", "Biellette de direction", "Rotule axiale", "Pompe de direction assistée", "Flexible de direction", "Colonne de direction", "Cardan de direction"] },
      { nom: "Suspension", articles: ["Amortisseur avant", "Amortisseur arrière", "Ressort de suspension", "Coupelle d'amortisseur", "Butée de suspension", "Silentbloc de triangle", "Triangle de suspension / bras de suspension", "Biellette de barre stabilisatrice", "Barre stabilisatrice", "Roulement de coupelle"] },
      { nom: "Train roulant & Roulements", articles: ["Roulement de roue", "Moyeu de roue", "Fusée de roue", "Rotule de suspension inférieure / supérieure"] },
    ],
  },
  // ─── 6. DÉMARRAGE & ÉLECTRIQUE ───
  {
    nom: "Démarrage & Électrique",
    typeBranche: "PIECE",
    sous: [
      { nom: "Démarrage & Charge", articles: ["Batterie", "Alternateur", "Démarreur", "Régulateur d'alternateur", "Poulie d'alternateur (à roue libre)"] },
      { nom: "Éclairage", articles: ["Ampoule H1 / H4 / H7 / LED", "Phare avant (optique)", "Feu arrière", "Feu antibrouillard", "Clignotant", "Feu de plaque", "Projecteur LED additionnel"] },
      { nom: "Capteurs & Électronique", articles: ["Capteur ABS", "Capteur de pression des pneus (TPMS)", "Capteur de niveau d'huile", "Capteur de régime", "Capteur de température", "Boîtier fusibles", "Relais", "Faisceau électrique", "Calculateur (ECU) - échange standard"] },
      { nom: "Accessoires électriques", articles: ["Moteur d'essuie-glace", "Pompe de lave-glace", "Moteur de lève-vitre", "Centrale de verrouillage", "Klaxon / avertisseur", "Prise allume-cigare / USB"] },
    ],
  },
  // ─── 7. ÉCHAPPEMENT ───
  {
    nom: "Échappement",
    typeBranche: "PIECE",
    articles: ["Silencieux / pot d'échappement", "Tube intermédiaire", "Collecteur d'échappement", "Catalyseur", "Filtre à particules (FAP / DPF)", "Sonde lambda", "Collier d'échappement", "Silentbloc d'échappement", "Joint de collecteur", "Vanne EGR (côté échappement)"],
  },
  // ─── 8. CLIMATISATION & THERMIQUE ───
  {
    nom: "Climatisation & Thermique",
    typeBranche: "PIECE",
    articles: ["Compresseur de climatisation", "Condenseur", "Évaporateur", "Détendeur / valve de détente", "Filtre déshydrateur / bouteille déshydratante", "Pulseur d'habitacle", "Radiateur de chauffage", "Pressostat de clim", "Courroie de clim", "Gaz réfrigérant (R134a / R1234yf)", "Huile PAG pour clim"],
  },
  // ─── 9. ESSUYAGE & VISIBILITÉ ───
  {
    nom: "Essuyage & Visibilité",
    typeBranche: "PIECE",
    articles: ["Balai d'essuie-glace avant", "Balai d'essuie-glace arrière", "Bras d'essuie-glace", "Moteur d'essuie-glace", "Pompe de lave-glace", "Réservoir de lave-glace", "Gicleur de lave-glace", "Capteur de pluie"],
  },
  // ─── 10. HABITACLE & INTÉRIEUR ───
  {
    nom: "Habitacle & Intérieur",
    typeBranche: "PIECE",
    articles: ["Siège (complet ou élément)", "Ceinture de sécurité", "Volant", "Tableau de bord (éléments)", "Poignée de porte intérieure", "Lève-vitre (mécanisme)", "Joint de porte / joint de vitre", "Tapis de sol", "Ciel de toit", "Console centrale"],
  },
  // ─── 11. CARROSSERIE / VITRES / PEINTURE ───
  {
    nom: "Carrosserie / Vitres / Peinture",
    typeBranche: "PIECE",
    sous: [
      { nom: "Éléments de carrosserie", articles: ["Pare-chocs avant", "Pare-chocs arrière", "Aile avant", "Aile arrière", "Capot", "Coffre / hayon", "Porte", "Rétroviseur complet", "Coque de rétroviseur", "Calandre", "Bas de caisse", "Passage de roue"] },
      { nom: "Vitrage", articles: ["Pare-brise", "Vitre latérale", "Lunette arrière", "Petit vitre / custode"] },
      { nom: "Peinture & Consommables carrosserie", articles: ["Peinture (base + vernis)", "Apprêt / primer", "Mastic de carrosserie", "Papier abrasif", "Diluant", "Film de protection", "Rénovateur plastique"] },
    ],
  },
  // ─── 12. ÉQUIPEMENTS ROUE & PNEUMATIQUES ───
  {
    nom: "Équipements roue & pneumatiques",
    typeBranche: "PIECE",
    articles: ["Pneu tourisme", "Pneu 4x4 / SUV", "Pneu utilitaire / camionnette", "Chambre à air", "Jante tôle", "Jante alliage", "Écrou / boulon de roue", "Enjoliveur", "Valve de pneu", "Capteur TPMS", "Chaînes à neige", "Chaussettes à neige", "Équilibreuse (consommables : plombs)"],
  },
  // ─── 13. OUTILLAGE D'ATELIER ───
  {
    nom: "Outillage d'atelier",
    typeBranche: "OUTIL",
    sous: [
      { nom: "Outillage à main", articles: ["Clés plates / clés mixtes", "Clés à pipe", "Clés Allen / Torx", "Tournevis (plat, cruciforme, Torx)", "Pinces (universelle, multiprise, étau)", "Marteau / maillet", "Extracteur", "Douilles et cliquets", "Cric hydraulique / cric bouteille", "Chandelles", "Clé dynamométrique"] },
      { nom: "Outillage électroportatif & pneumatique", articles: ["Perceuse / visseuse", "Meuleuse", "Clé à chocs", "Clé dynamométrique électrique", "Compresseur d'air", "Pistolet à peinture", "Soufflette"] },
      { nom: "Outils de diagnostic & Spécifiques", articles: ["Valise de diagnostic multimarque", "Oscilloscope", "Multimètre", "Manomètre de pression", "Refractomètre (liquide de refroidissement)", "Station de climatisation", "Arrache-moyeu / arrache-rotule", "Compresseur de ressort", "Outil de calage distribution"] },
      { nom: "Équipements de levage & Sécurité", articles: ["Pont élévateur (pièces détachées)", "Cric de fosse", "Supports de sécurité", "Gants de protection", "Lunettes de protection", "Chaussures de sécurité", "Extincteur"] },
    ],
  },
  // ─── 14. CONSOMMABLES & FOURNITURES D'ATELIER ───
  {
    nom: "Consommables & fournitures d'atelier",
    typeBranche: "CONSOMMABLE",
    articles: ["Visserie et boulonnerie diverse", "Colliers de serrage", "Colliers de durite", "Rilsan / colliers plastiques", "Ruban adhésif / scotch technique", "Joint silicone / pâte à joint", "Frein filet (bleu / rouge)", "Nettoyant frein (spray)", "Dégrippant", "Graisse en spray", "Chiffons / non-tissé", "Sacs poubelle atelier", "Produits de nettoyage sol", "Gants jetables", "Masques", "Papier de protection"],
  },
  // ─── 15. PIÈCES DE RÉEMPLOI / OCCASION / ÉCHANGE STANDARD ───
  {
    nom: "Pièces de réemploi / occasion / échange standard",
    typeBranche: "PIECE",
    articles: ["Moteur échange standard", "Boîte de vitesses échange standard", "Turbo échange standard", "Alternateur échange standard", "Démarreur échange standard", "Compresseur de clim échange standard", "Pièces de réemploi (PIEC) carrosserie", "Pièces de réemploi mécanique"],
  },
  // ─── 16. ACCESSOIRES & DIVERS ───
  {
    nom: "Accessoires & divers",
    typeBranche: "PIECE",
    articles: ["Tapisserie / housses", "Barres de toit", "Attelage", "Porte-vélos", "Alarme / antivol", "Caméra de recul", "Capteurs de stationnement", "Chargeur de batterie", "Câbles de démarrage", "Triangles et gilet de sécurité", "Trousse de secours"],
  },
];