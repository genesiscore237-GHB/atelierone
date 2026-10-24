/**
 * LOT U4 (E10) — Validation de la réception.
 *
 * Avant ce lot (P1-6 / P2-4) :
 *  - `valider()` ne contrôlait que 5 champs, alors que 9 sont marqués d'un
 *    astérisque dans l'interface (marque, type, téléphone ne l'étaient pas) :
 *    l'interface mentait sur ce qu'elle exigeait ;
 *  - en cas d'erreur, `handleSubmit` faisait `return` SANS RIEN : ni toast,
 *    ni message d'erreur, ni défilement. L'agent cliquait « Enregistrer »,
 *    rien ne se passait, et il ne savait pas quoi corriger (P1-6).
 *
 * Les règles vivent ici, dans des fonctions PURES, et non dans le composant :
 * elles sont testables sans DOM, et un second écran pourra les réutiliser
 * sans les recopier — c'est la leçon de U0a (les règles dupliquées divergent).
 */

export type Erreurs = Record<string, string>;

export type DonneesReception = {
  vehicule?: {
    immatriculation?: string;
    marque?: string;
    typeVehicule?: string;
    numeroChassis?: string;
    [k: string]: unknown;
  };
  client?: {
    nom?: string;
    telephone?: string;
    email?: string;
    [k: string]: unknown;
  };
  chauffeur?: { nom?: string; telephone?: string; [k: string]: unknown };
  reception?: {
    kilometrageEntree?: number | string | null;
    pannesDeclarees?: string;
    signatureDeposant?: string;
    validationVerbale?: boolean;
    dateReception?: string;
    [k: string]: unknown;
  };
};

/** Un téléphone est saisi librement ; on n'exige qu'un minimum de chiffres. */
const chiffres = (v: string) => v.replace(/\D+/g, "");

export const telephoneSaisissable = (v: string): boolean => {
  const n = chiffres(v);
  // 6 chiffres minimum (numéro court), 15 maximum (format international).
  return n.length >= 6 && n.length <= 15;
};

export const emailValide = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const immatriculationValide = (v: string): boolean => {
  // 3 caractères minimum (plaques hors série peuvent être courtes) ; on
  // refuse les espaces internes qui trahissent deux saisies collées.
  const s = (v ?? "").trim();
  return s.length >= 3 && !/\s{2,}/.test(s);
};

/**
 * Contrôle l'ensemble de la réception.
 *
 * L'ordre d'insertion des clés est celui du formulaire : le premier message
 * retourné est donc celui du champ le plus haut, ce qui permet à l'appelant
 * de défiler vers la VRAIE première erreur plutôt que vers une erreur arbitraire.
 */
export function validerReception(d: DonneesReception): Erreurs {
  const e: Erreurs = {};
  const v = d.vehicule ?? {};
  const c = d.client ?? {};
  const r = d.reception ?? {};

  // ── Véhicule ──
  if (!v.immatriculation?.trim()) {
    e.immatriculation = "Immatriculation requise";
  } else if (!immatriculationValide(v.immatriculation)) {
    e.immatriculation = "Immatriculation invalide (3 caractères minimum, sans espaces multiples)";
  }

  // La marque est facultative : une plaque et un type suffisent à ouvrir un
  // dossier. Le serveur accepte aussi l'absence de marque (imports, véhicules
  // dont le badge est illisible).

  if (!v.typeVehicule?.trim()) {
    e.typeVehicule = "Type de véhicule requis";
  }

  if (v.annee != null && v.annee !== "") {
    const a = Number(v.annee);
    if (!Number.isInteger(a) || a < 1900 || a > 2100) {
      e.annee = "Année invalide (entre 1900 et 2100)";
    }
  }

  // ── Client ──
  // Le client est facultatif : un véhicule peut arriver sans propriétaire
  // identifié, il part alors « à wartier ». On n'invente pas une fiche pour
  // décrire ce qu'on ne sait pas — ni en base, ni dans un message d'erreur
  // qui exigerait un nom qu'on n'a pas.
  //
  // Dès qu'un nom est saisi, en revanche, le téléphone est exigé : une fiche
  // client sans numéro n'est pas retrouvable, et c'est le moyen de rappel
  // principal du garage.
  const clientSaisi = !!c.nom?.trim();

  // Un numéro seul n'identifie personne : il serait perdu dans un dossier
  // « à wartier ». On exige le nom dès qu'un téléphone est saisi.
  if (!clientSaisi && c.telephone?.trim()) {
    e.clientNom = "Nom requis dès qu'un téléphone est saisi";
  } else if (clientSaisi && !c.telephone?.trim()) {
    e.clientTelephone = "Téléphone requis";
  } else if (c.telephone?.trim() && !telephoneSaisissable(c.telephone)) {
    e.clientTelephone = "Téléphone incomplet (6 chiffres minimum)";
  }

  if (c.email?.trim() && !emailValide(c.email)) {
    e.clientEmail = "Adresse e-mail invalide";
  }

  // ── Entrée ──
  // Le km est FACULTATIF : un véhicule peut arriver sans compteur lisible.
  // Une absence reste une absence ; on ne la remplace jamais par 0.
  const km = r.kilometrageEntree;
  if (km != null && km !== "" && (!Number.isFinite(Number(km)) || Number(km) < 0)) {
    e.kilometrageEntree = "Kilométrage invalide (0 ou positif)";
  }

  if (!r.pannesDeclarees?.trim()) {
    e.pannesDeclarees = "Pannes déclarées requises";
  }

  if (String(r.typeIntervention ?? "") === "DEPANNAGE" && !String(r.lieuDepannage ?? "").trim()) {
    e.lieuDepannage = "Lieu d'intervention requis pour un dépannage sur site";
  }

  const dateReception = typeof r.dateReception === "string" ? r.dateReception : "";
  const datePromesse = typeof r.datePromesse === "string" ? r.datePromesse : "";
  if (dateReception && datePromesse && datePromesse < dateReception.slice(0, 10)) {
    e.datePromesse = "La promesse ne peut pas précéder la réception";
  }

  // ── Validation du déposant ──
  if (!r.signatureDeposant?.trim() && !r.validationVerbale) {
    e.signature = "Signature du déposant ou validation verbale requise";
  }

  return e;
}

/** Message court destiné au toast, énonçant le nombre d'erreurs restantes. */
export function messageResume(erreurs: Erreurs): string {
  const n = Object.keys(erreurs).length;
  if (n === 0) return "";
  const premier = Object.values(erreurs)[0];
  return n === 1
    ? premier
    : `${premier} — et ${n - 1} autre${n > 2 ? "s" : ""} champ${n > 2 ? "s" : ""} à corriger.`;
}
