"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Loader2, CheckCircle2, X, TriangleAlert, ExternalLink } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { FormulaireVehicule } from "~/components/vehicule/FormulaireVehicule";
import { useOrPermissions } from "../../../ordres-reparation/_hooks/useOrPermissions";
import {
  validerReception,
  messageResume,
  type Erreurs,
} from "~/lib/validation-reception";
import { invaliderApresReception } from "~/lib/invalidation-reception";
import { useDebounce } from "~/lib/useDebounce";
import { MOTIF_ENTREE_LABELS } from "~/server/lib/atelier-service";
import { CheckListOutillage } from "./CheckListOutillage";
import { PhotosEtatDesLieux, type PhotoUI } from "./PhotosEtatDesLieux";

/**
 * RÉCEPTION VÉHICULE (MVP) — recherche ou création en même temps.
 * Sections : 1 Véhicule · 2 Client · 3 Chauffeur · 4 Entrée · 5 Check-list
 * outillage (fiche papier) · 6 Pannes & observations · 7 Photos · 8 Validation.
 */

const NIVEAUX_CARBURANT = ["vide", "1/4", "1/2", "3/4", "plein"];
const BROUILLON_KEY = "atelierone:reception:brouillon";

const TYPES_CLIENT = [
  { value: "PART", label: "Particulier" },
  { value: "ENTR", label: "Entreprise" },
  { value: "ADMIN", label: "Administration" },
  { value: "ASSUR", label: "Assurance" },
  { value: "FLOTTE", label: "Flotte" },
] as const;

const TYPES_INTERVENTION = [
  { value: "ATELIER", label: "Atelier" },
  { value: "DEPANNAGE", label: "Dépannage sur site" },
] as const;

/** Date/heure locale au format attendu par `datetime-local`. */
const maintenantLocal = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const etatInitial = () => ({
  vehicule: { typeVehicule: "voiture" },
  client: { typeClient: "PART" },
  chauffeur: {},
  reception: {
    typeIntervention: "ATELIER",
    motEntree: "PANNE",
    priorite: "P3",
    niveauCarburantEntree: "",
    outillage: {},
    photos: [],
    validationVerbale: false,
    dateReception: "",
    datePromesse: "",
  },
});

type DerniereReception = {
  id: number;
  numero: string;
  vehiculeId: number;
  immatriculation: string;
  clientNom: string;
};

/** Nombre ou undefined (jamais 0 ni NaN dans l’payload). */
const numOuUndef = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Champ de formulaire.
 *
 * LOT U4 (E10) — `anchor` pose un `id` sur l'enveloppe : c'est ce qui permet
 * à `allerAuPremierErreur` de défiler jusqu'au bon champ. Un champ sans
 * ancre resterait hors d'atteinte du défilement (il est imbriqué dans une
 * grille de deux colonnes, pas à la racine du document).
 */
function Field({ label, required, error, hint, anchor, children }: { label: string; required?: boolean; error?: string; hint?: string; anchor?: string; children: React.ReactNode }) {
  return (
    <div id={anchor ? `champ-${anchor}` : undefined}>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function ReceptionVehicule() {
  const utils = api.useUtils();
  // Permissions sincères : sans `or.modifier`, `or.receptionner` refusera
  // l'enregistrement. Mieux vaut le dire AVANT que l'agent remplisse tout
  // un formulaire pour découvrir l'erreur au clic final (règle UX n°6).
  const { flags } = useOrPermissions();
  const peutReceptionner = flags.canReception;
  const [q, setQ] = useState("");
  const [modeCreation, setModeCreation] = useState(false);
  const [f, setF] = useState<Record<string, any>>(etatInitial);
  const set = (section: string, k: string, v: any) => setF((p) => ({ ...p, [section]: { ...p[section], [k]: v } }));
  const [outillageNotes, setOutillageNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [derniereReception, setDerniereReception] = useState<DerniereReception | null>(null);
  const [confirmeNouvelleIntervention, setConfirmeNouvelleIntervention] = useState(false);
  const [brouillonDisponible, setBrouillonDisponible] = useState<{ at: string; f: any; outillageNotes: Record<string, string> } | null>(null);
  // RD4 — transparence : client d'origine d'un véhicule chargé (pour détecter
  // un changement de propriétaire et demander confirmation explicite).
  const [vehiculeClientOrigine, setVehiculeClientOrigine] = useState<{ id?: number; nom?: string } | null>(null);

  const qDebounce = useDebounce(q, 300);
  const { data: recherche, isLoading: rechercheLoading, isError: rechercheError } = api.or.rechercherReception.useQuery(
    { q: qDebounce.trim() },
    { enabled: qDebounce.trim().length >= 2 && !modeCreation },
  );
  const receptionner = api.or.receptionner.useMutation({
    onSuccess: (r) => {
      // RD3 — transparence : le véhicule existant a été réutilisé (et non
      // recréé) par plaque normalisée.
      if ((r as any).vehiculeReconcilie) {
        toast.info(`Véhicule existant réutilisé — dossier ${r.numero} créé sur le véhicule déjà enregistré`);
      } else {
        toast.success(`Réception enregistrée — dossier ${r.numero} créé`);
      }
      setDerniereReception({
        id: Number(r.id),
        numero: String(r.numero ?? ""),
        vehiculeId: Number(r.vehiculeId),
        immatriculation: String(f.vehicule.immatriculation ?? ""),
        clientNom: String(f.client.raisonSociale || f.client.nom || ""),
      });
      // LOT U5 (E11, P2-6) — une réception écrit bien plus que « 2 listes » :
      // dossier, véhicule, client, registre parking projeté, KPI garage. La
      // liste complète et ses motifs vivent dans `~/lib/invalidation-reception`.
      void invaliderApresReception(utils);
      reinitialiserFormulaire();
      setModeCreation(false);
      setQ("");
    },
    onError: (e) => {
      // Un refus de doublon n'est pas une panne : c'est une question à poser.
      // Rendre le bandeau de choix, sinon l'agent a masqué l'avertissement en
      // choisissant « nouveau client », reçoit un refus, et n'a plus devant lui
      // que le moyen de le comprendre.
      if ((e as { data?: { code?: string } })?.data?.code === "CONFLICT") {
        setTelDoublonEcarte(null);
      }
      toast.error(e.message);
    },
  });

  const chargerVehicule = (v: any) => {
    setF({
      vehicule: { id: v.id, immatriculation: v.immatriculation, numeroChassis: v.numeroChassis ?? "", typeVehicule: v.typeVehicule ?? "voiture", marque: v.marque ?? "", modele: v.modele ?? "", version: v.version ?? "", annee: v.annee ?? "", couleur: v.couleur ?? "", carburant: v.carburant ?? "", kilometrage: v.kilometrage ?? "", longueur: v.longueur ?? "", largeur: v.largeur ?? "", hauteur: v.hauteur ?? "", poids: v.poids ?? "", dimensionsEstimees: !!v.dimensionsEstimees },
      client: { id: v.clientId ?? undefined, nom: v.clientNom ?? "", prenom: v.clientPrenom ?? "", raisonSociale: v.clientRaisonSociale ?? "", typeClient: v.clientType ?? "PART", telephone: v.clientTelephone ?? "" },
      chauffeur: { nom: v.chauffeurNom ?? "", telephone: v.chauffeurTelephone ?? "" },
      reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false, dateReception: maintenantLocal(), datePromesse: "" },
    });
    // RD4 — mémorise le propriétaire d'origine (pour détecter un changement).
    setVehiculeClientOrigine({ id: v.clientId ?? undefined, nom: v.clientRaisonSociale ?? v.clientNom ?? undefined });
    setPhotosEtatDesLieu([]);
    setOutillageNotes({});
    setErrors({});
    setTelDoublonEcarte(null);
    setConfirmeNouvelleIntervention(false);
    setModeCreation(false);
    setDerniereReception(null);
    setQ("");
    toast.success("Véhicule chargé — complétez la réception");
  };
  const chargerClient = (c: any) => {
    setF((p) => ({
      ...p,
      client: {
        id: c.id,
        nom: c.nom ?? "",
        prenom: c.prenom ?? "",
        raisonSociale: c.raisonSociale ?? "",
        typeClient: c.typeClient ?? "PART",
        telephone: c.telephone ?? "",
        email: c.email ?? "",
        adresse: c.adresse ?? "",
        ville: c.ville ?? "",
      },
    }));
    setErrors({});
    setTelDoublonEcarte(null);
    setQ("");
  };

  // LOT R5 — dédoublonnage (E6) : quand un numéro est saisi pour un NOUVEAU
  // client (pas de client.id), on interroge les clients existants de l'agence
  // au même téléphone normalisé. Si trouvé, on propose (sans imposer) de
  // sélectionner ce client existant au lieu d'en créer un doublon.
  const telNormalise = (f.client.telephone ?? "").replace(/\D+/g, "").replace(/^0/, "");
  const telDebounce = useDebounce(f.client.telephone ?? "", 300);
  // « Continuer avec un nouveau client » : mémorise le numéro écarté pour ne
  // pas re-proposer le même doublon à chaque frappe.
  const [telDoublonEcarte, setTelDoublonEcarte] = useState<string | null>(null);
  const doublonPotentiel = api.clients.doublonParTelephone.useQuery(
    { telephone: telDebounce },
    { enabled: !f.client.id && telNormalise.length >= 9 && !receptionner.isPending }
  );
  const doublonAffiche =
    doublonPotentiel.data?.client && !f.client.id && telDoublonEcarte !== telNormalise
      ? doublonPotentiel.data.client
      : null;

  // LOT U0b — la liste des types de véhicule est désormais gérée par le
  // composant partagé `FormulaireVehicule` (U1 : liste de référence + types
  // rencontrés par l'agence + saisie libre).

  // LOT U0c — état des lieux photographique versionné par visite.
  const [photosEtatDesLieu, setPhotosEtatDesLieu] = useState<PhotoUI[]>([]);

  /**
   * Réinitialisation COMPLÈTE. Le formulaire seul ne suffit pas : les photos,
   * les notes d'outillage, les erreurs et le doublon écarté sont des états
   * séparés. Les oublier attachait les preuves du véhicule A au véhicule B.
   */
  const reinitialiserFormulaire = () => {
    const base = etatInitial();
    base.reception.dateReception = maintenantLocal();
    setF(base);
    setOutillageNotes({});
    setPhotosEtatDesLieu([]);
    setErrors({});
    setTelDoublonEcarte(null);
    setVehiculeClientOrigine(null);
    setConfirmeNouvelleIntervention(false);
    setBrouillonDisponible(null);
    try { sessionStorage.removeItem(BROUILLON_KEY); } catch { /* stockage indisponible */ }
  };

  // Date de réception préremplie à maintenant, sans provoquer de mismatch SSR.
  useEffect(() => {
    setF((p) => p.reception.dateReception ? p : { ...p, reception: { ...p.reception, dateReception: maintenantLocal() } });
  }, []);

  // Brouillon local : le formulaire seul, jamais les photos (base64 trop
  // lourdes pour le stockage navigateur). La restauration est explicite.
  useEffect(() => {
    try {
      const brut = sessionStorage.getItem(BROUILLON_KEY);
      if (!brut) return;
      const parsed = JSON.parse(brut) as { at?: string; f?: any; outillageNotes?: Record<string, string> };
      if (parsed?.f && (parsed.f.vehicule?.immatriculation || parsed.f.client?.nom || parsed.f.reception?.pannesDeclarees)) {
        setBrouillonDisponible({
          at: parsed.at ?? new Date().toISOString(),
          f: parsed.f,
          outillageNotes: parsed.outillageNotes ?? {},
        });
      }
    } catch { /* stockage indisponible ou brouillon illisible */ }
  }, []);

  useEffect(() => {
    const actif =
      !!f.vehicule?.immatriculation ||
      !!f.client?.nom ||
      !!f.client?.telephone ||
      !!f.reception?.pannesDeclarees ||
      photosEtatDesLieu.length > 0;
    if (!actif || receptionner.isPending) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(BROUILLON_KEY, JSON.stringify({
          at: new Date().toISOString(),
          f,
          outillageNotes,
        }));
      } catch { /* quota navigateur */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [f, outillageNotes, photosEtatDesLieu.length, receptionner.isPending]);

  useEffect(() => {
    const dirty =
      !!f.vehicule?.immatriculation ||
      !!f.client?.nom ||
      !!f.reception?.pannesDeclarees ||
      photosEtatDesLieu.length > 0;
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [f, photosEtatDesLieu.length]);

  const restaurerBrouillon = () => {
    if (!brouillonDisponible) return;
    const repris = brouillonDisponible.f ?? {};
    setF({
      ...etatInitial(),
      ...repris,
      vehicule: { typeVehicule: "voiture", ...(repris.vehicule ?? {}) },
      client: { typeClient: "PART", ...(repris.client ?? {}) },
      reception: {
        ...etatInitial().reception,
        ...(repris.reception ?? {}),
        dateReception: repris.reception?.dateReception || maintenantLocal(),
      },
    });
    setOutillageNotes(brouillonDisponible.outillageNotes);
    setPhotosEtatDesLieu([]);
    setBrouillonDisponible(null);
    toast.info("Brouillon restauré — les photos ne sont pas restaurées et doivent être reprises.");
  };

  const ignorerBrouillon = () => {
    setBrouillonDisponible(null);
    try { sessionStorage.removeItem(BROUILLON_KEY); } catch { /* stockage indisponible */ }
  };

  // La saisie de la plaque identifie le véhicule : c'est ce qui alimente la
  // reprise d'état des lieux (U0c) et l'alerte parking (S2).
  const immatRecherchee = (f.vehicule.immatriculation ?? "").trim();
  const immatDebounce = useDebounce(immatRecherchee, 300);
  const vehiculeRecherche = api.or.rechercherReception.useQuery(
    { q: immatDebounce },
    { enabled: immatDebounce.length >= 2 }
  );
  const vehiculeIdConnu = (vehiculeRecherche.data?.vehicules?.[0] as { id?: number } | undefined)?.id ?? null;

  // LOT S2 (E13) — où en est ce véhicule au garage ? (lecture seule)
  const situationParking = api.or.situationParking.useQuery(
    { vehiculeId: vehiculeIdConnu },
    { enabled: vehiculeIdConnu != null }
  );

  // LOT S2 (E13) — trois situations invisibles depuis le formulaire,
  // agrégées en une bannière unique.
  const parking = situationParking.data;
  const alertesParking: { ton: "info" | "warn"; texte: string }[] = [];
  if (parking?.dejaPresent && parking.ligne) {
    const ou = parking.ligne.spotCode
      ? `, place ${parking.ligne.spotCode}${parking.ligne.zoneNom ? ` (${parking.ligne.zoneNom})` : ""}`
      : ", non positionné";
    alertesParking.push({
      ton: "info",
      texte:
        `Ce véhicule est déjà enregistré au garage` +
        `${parking.ligne.numRegistre != null ? ` sous le n° ${parking.ligne.numRegistre}` : ""}` +
        `${ou} — statut « ${parking.ligne.statut ?? "—"} ». Aucune nouvelle place n'est nécessaire.`,
    });
  }
  if (parking?.dossierOuvert && parking.dossier) {
    alertesParking.push({
      ton: "warn",
      texte:
        `Un dossier est DÉJÀ en cours sur ce véhicule (${parking.dossier.numero ?? "sans numéro"}, ` +
        `statut « ${parking.dossier.statut ?? "—"} »). Confirmez qu'il s'agit bien d'une nouvelle intervention.`,
    });
  }
  if (parking?.placeFantome) {
    alertesParking.push({
      ton: "warn",
      texte:
        `Sa place de parking est encore bloquée alors que le véhicule est sorti du registre : ` +
        `place fantôme. Signalez-la au responsable du garage.`,
    });
  }

  // LOT U2 (RD5) — dernier kilométrage connu : celui de la fiche si le
  // véhicule a été chargé, sinon celui trouvé par la saisie de la plaque.
  const dernierKmConnu: number | null = (() => {
    const fiche = f.vehicule.kilometrage;
    if (fiche != null && fiche !== "") return Number(fiche);
    const trouve = vehiculeRecherche.data?.vehicules?.[0] as { kilometrage?: number | null } | undefined;
    const km = trouve?.kilometrage;
    return km != null && km > 0 ? Number(km) : null;
  })();

  // LOT U0c — état des lieux de la visite précédente (pour la reprise).
  const etatDesLieuPrecedent = api.or.etatDesLieuPrecedent.useQuery(
    { vehiculeId: vehiculeIdConnu, avantOrId: 0 },
    { enabled: vehiculeIdConnu != null }
  );
  const precedentPhotos = etatDesLieuPrecedent.data?.disponible
    ? {
        numero: etatDesLieuPrecedent.data.numero,
        dateReception: etatDesLieuPrecedent.data.dateReception,
        // Le tRPC sérialise les dates et rend les champs nullable : on
        // reprojette explicitement sur le type attendu par le composant.
        photos: (etatDesLieuPrecedent.data.photos ?? [])
          .filter((p): p is { id: number; categorie: string; visite: string; repriseDe: number | null; url: string } =>
            typeof p.id === "number" && typeof p.url === "string")
          .map((p) => ({
            id: p.id,
            categorie: p.categorie,
            visite: p.visite,
            repriseDe: p.repriseDe ?? null,
            url: p.url,
          })),
      }
    : null;

  // LOT U4 (E10) — la validation vit dans `~/lib/validation-reception`
  // (fonctions pures, testables, réutilisables) et non ici.
  const valider = (): Erreurs => validerReception(f);

  /** Défile vers le premier champ fautif et y place le focus (E10). */
  const allerAuPremierErreur = (errs: Erreurs) => {
    const premier = Object.keys(errs)[0];
    if (!premier) return;
    const cible = document.getElementById(`champ-${premier}`);
    if (!cible) return;
    cible.scrollIntoView({ behavior: "smooth", block: "center" });
    // Le focus suit le défilement : l'agent peut corriger sans reprendre la
    // souris, et sans que le défilement le ramène ailleurs à la validation
    // suivante.
    const champ = cible.querySelector<HTMLElement>("input, textarea, select, button");
    window.setTimeout(() => champ?.focus?.({ preventScroll: true }), 220);
  };

  // RD4 — le véhicule chargé a un propriétaire et le client saisi est différent.
  const ownerChangeDemande = !!vehiculeClientOrigine?.id && !!f.vehicule.id && (
    (!!f.client.id && vehiculeClientOrigine.id !== f.client.id) ||
    (!f.client.id && !!(f.client.nom?.trim() || f.client.telephone?.trim()))
  );
  const clientVerrouille = !!f.client.id;
  const proprietaireExistant = !!vehiculeClientOrigine?.id;

  const handleSubmit = () => {
    if (!peutReceptionner) {
      toast.error("Permission or.modifier requise pour réceptionner un véhicule.");
      return;
    }
    const errs = valider();
    if (parking?.dossierOuvert && !confirmeNouvelleIntervention) {
      errs.nouvelleIntervention = "Confirmez qu'il s'agit d'une nouvelle intervention.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // E10 — avant, l'échec était TOTALEMENT SILENCIEUX (ni toast, ni
      // message, ni défilement) : l'agent cliquait « Enregistrer » et rien ne
      // se produisait, sans savoir quoi corriger.
      toast.error(messageResume(errs));
      allerAuPremierErreur(errs);
      return;
    }
    // Format INCHANGÉ (RD7) : `{ present, observation }` par élément, en
    // JSONB. L'ancien code écrivait EN PLUS une clé minuscule `autres` qui
    // dupliquait l'observation de `AUTRES` : rien ne la relisait, mais deux
    // clés pour un même fait réinvitent la divergence. Clé unique désormais.
    const outillage = Object.fromEntries(
      Object.entries(f.reception.outillage ?? {}).map(([k, v]) => [k, { present: v, observation: outillageNotes[k] ?? "" }])
    );
    const typeClient = f.client.typeClient ?? "PART";
    receptionner.mutate({
      client: {
        ...f.client,
        nom: f.client.nom?.trim(),
        raisonSociale: f.client.raisonSociale?.trim() || (typeClient !== "PART" ? f.client.nom?.trim() : undefined),
        typeClient,
        telephone: f.client.telephone?.trim() || undefined,
      },
      // Le serveur refuse de créer une fiche quand un client porte déjà ce
      // téléphone, et réclame une confirmation explicite. L'agent l'a déjà
      // donnée en cliquant « Continuer avec un nouveau client » : on la
      // transmet, faute de quoi le formulaire refuserait sa propre décision.
      confirmerClientDoublon: telDoublonEcarte === telNormalise,
      confirmerNouvelleIntervention: confirmeNouvelleIntervention,

      vehicule: { ...f.vehicule, immatriculation: f.vehicule.immatriculation.trim(), marque: f.vehicule.marque?.trim() || undefined, modele: f.vehicule.modele?.trim() || undefined, annee: f.vehicule.annee != null && f.vehicule.annee !== "" ? Number(f.vehicule.annee) : undefined, kilometrage: f.vehicule.kilometrage != null && f.vehicule.kilometrage !== "" ? Number(f.vehicule.kilometrage) : undefined, longueur: numOuUndef(f.vehicule.longueur), largeur: numOuUndef(f.vehicule.largeur), hauteur: numOuUndef(f.vehicule.hauteur), poids: numOuUndef(f.vehicule.poids), dimensionsEstimees: !!f.vehicule.dimensionsEstimees },
      chauffeur: { nom: f.chauffeur.nom?.trim() || undefined, telephone: f.chauffeur.telephone?.trim() || undefined },
      reception: {
        ...f.reception,
        outillage,
        datePromesse: f.reception.datePromesse || undefined,
        // Une absence de km reste une absence : on n'envoie jamais 0 à la
        // place d'un relevé non fait.
        kilometrageEntree: f.reception.kilometrageEntree === "" || f.reception.kilometrageEntree == null
          ? undefined
          : Number(f.reception.kilometrageEntree),
        // LOT U0c — l'état des lieux part désormais par face, avec traçabilité
        // des reprises (une reprise ne remplace pas une prise réelle).
        photos: photosEtatDesLieu
          .filter((p) => !p.reprise)
          .map((p) => ({ categorie: p.categorie, url: p.url })),
        photosReprise: photosEtatDesLieu
          .filter((p) => p.reprise && p.sourceId != null)
          .map((p) => ({ categorie: p.categorie, url: p.url, sourceId: p.sourceId as number })),
      },
    });
  };

  const r = f.reception;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Réception véhicule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recherchez un véhicule/client existant ou créez-les sur le même écran.</p>
        </div>
        <Link href="/dashboard/atelier"><Button variant="outline" size="sm">Retour atelier</Button></Link>
      </div>

      {!peutReceptionner && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Permission <code>or.modifier</code> requise pour réceptionner un véhicule. Le formulaire est en lecture seule.
        </div>
      )}

      {derniereReception && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <CheckCircle2 size={18} className="text-success-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Réception enregistrée — {derniereReception.numero}</p>
            <p className="text-xs text-muted-foreground">
              {derniereReception.immatriculation || "Sans plaque"}
              {derniereReception.clientNom ? ` · ${derniereReception.clientNom}` : " · sans propriétaire"}
            </p>
          </div>
          <Link href={`/dashboard/ordres-reparation/${derniereReception.id}`}>
            <Button size="sm" variant="outline" className="gap-1 text-xs"><ExternalLink size={12} /> Ouvrir l'OR</Button>
          </Link>
          <Link href={`/dashboard/vehicules/${derniereReception.vehiculeId}`}>
            <Button size="sm" variant="outline" className="gap-1 text-xs"><ExternalLink size={12} /> Fiche véhicule</Button>
          </Link>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setDerniereReception(null)}>Nouvelle réception</Button>
        </div>
      )}

      {brouillonDisponible && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <TriangleAlert size={16} className="text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Brouillon de réception trouvé</p>
            <p className="text-xs text-muted-foreground">
              Enregistré le {new Date(brouillonDisponible.at).toLocaleString("fr-FR")} — les photos ne sont pas restaurées.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={restaurerBrouillon}>Restaurer</Button>
          <Button size="sm" variant="ghost" onClick={ignorerBrouillon}>Ignorer</Button>
        </div>
      )}

      {/* Recherche unifiée */}
      {!modeCreation && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <Label className="text-sm font-medium">Recherche rapide (plaque, châssis, nom, téléphone)</Label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex: AA-123-BB, 308, Dupont, 06 12 34 56 78…" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
          </div>
          {rechercheLoading && q.trim().length >= 2 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Recherche…</p>
          )}
          {rechercheError && (
            <p className="mt-2 text-xs text-destructive">La recherche a échoué. Réessayez ou saisissez la fiche manuellement.</p>
          )}
          {recherche && (recherche.vehicules.length > 0 || recherche.clients.length > 0) && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {recherche.vehicules.map((v: any) => (
                <button key={v.id} onClick={() => chargerVehicule(v)} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs hover:border-primary/40">
                  <span className="font-mono font-bold">{v.immatriculation}</span> · {v.marque} {v.modele}
                  <span className="block text-muted-foreground">{v.clientNom ?? ""} {v.clientPrenom ?? ""} {v.clientTelephone ? `· ${v.clientTelephone}` : ""}</span>
                </button>
              ))}
              {recherche.clients.map((c: any) => (
                <button key={c.id} onClick={() => chargerClient(c)} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs hover:border-primary/40">
                  <span className="font-semibold">{c.raisonSociale || c.nom} {c.raisonSociale ? "" : (c.prenom ?? "")}</span>
                  <span className="block text-muted-foreground">
                    {c.telephone ?? c.email ?? ""} — {TYPES_CLIENT.find((t) => t.value === c.typeClient)?.label ?? "client"}
                    {c.statut === "PROVISOIRE" ? " · provisoire" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {recherche && recherche.vehicules.length === 0 && recherche.clients.length === 0 && q.trim().length >= 2 && (
            <p className="mt-2 text-xs text-muted-foreground">Aucun résultat — créez un nouveau véhicule + client.</p>
          )}
          <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs" disabled={!peutReceptionner} onClick={() => { reinitialiserFormulaire(); setDerniereReception(null); setModeCreation(true); }}>
            <Plus size={12} /> Créer un nouveau véhicule + client
          </Button>
        </div>
      )}
      {/* LOT S2 (E13) — alerte « véhicule déjà présent » : visible dès que la
          plaque identifie un véhicule connu, AVANT toute saisie. */}
      {alertesParking.length > 0 && (
        <div className="space-y-2">
          {alertesParking.map((a) => (
            <p
              key={a.ton}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                a.ton === "warn"
                  ? "border-warning/40 bg-warning/10 text-foreground"
                  : "border-primary/30 bg-primary/5 text-foreground"
              }`}
            >
              <TriangleAlert size={14} className={`mt-px shrink-0 ${a.ton === "warn" ? "text-warning" : "text-primary"}`} />
              <span>{a.texte}</span>
            </p>
          ))}
        </div>
      )}
      {vehiculeRecherche.isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          La vérification du véhicule a échoué. Le serveur contrôlera la plaque et le propriétaire à l’enregistrement.
        </p>
      )}
      {situationParking.isError && (
        <p className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          La situation parking n’a pas pu être vérifiée. Le passage sera tout de même contrôlé côté serveur.
        </p>
      )}
      {modeCreation && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-xs">
          <span className="font-semibold text-primary">Mode création : nouveau véhicule + client</span>
          <Button size="sm" variant="ghost" onClick={() => setModeCreation(false)}><X size={12} /> Rechercher plutôt</Button>
        </div>
      )}

      {/* Formulaire principal */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          {/* 1 — Véhicule */}
          <Section title="1 · Véhicule">
            {/* LOT U0b — fiche partagée avec l'écran parc : une seule definition
                des champs, donc plus de divergence possible entre les deux
                points de saisie. */}
            <FormulaireVehicule
              value={f.vehicule}
              onChange={(champ, valeur) => set("vehicule", champ as string, valeur)}
              erreurs={errors}
              avecDimensions
              avecKilometrage={false}
              marqueRequise={false}
              desactive={!peutReceptionner || !!f.vehicule.id}
            />
            {f.vehicule.id && (
              <p className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Identité verrouillée : ce véhicule existe déjà. Une correction d’identité se fait dans le registre parking.
                {" "}
                <Link
                  href={`/dashboard/garage/vehicules?q=${encodeURIComponent(f.vehicule.immatriculation ?? "")}`}
                  className="font-semibold text-primary hover:underline"
                >
                  Corriger dans le parking
                </Link>
              </p>
            )}
            {/* LOT U2 (RD5) — l'agent ne doit pas deviner le km de référence :
                il lui est donné, en lecture seule. */}
            {dernierKmConnu != null && (
              <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Dernier kilométrage connu :{" "}
                <span className="font-semibold text-foreground">
                  {Number(dernierKmConnu).toLocaleString("fr-FR")} km
                </span>{" "}
                — saisi plus bas, en section « Entrée », avec le relevé réel du jour.
              </p>
            )}
          </Section>

          {/* 2 — Client */}
          <Section title="2 · Client / Propriétaire">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Type de client">
                <select
                  value={f.client.typeClient ?? "PART"}
                  onChange={(e) => set("client", "typeClient", e.target.value)}
                  disabled={!peutReceptionner || clientVerrouille}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
                >
                  {TYPES_CLIENT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field
                label={f.client.typeClient && f.client.typeClient !== "PART" ? "Raison sociale" : "Nom / Raison sociale"}
                required={!!f.client.telephone?.trim() || !!f.client.id}
                error={errors.clientNom}
                anchor="clientNom"
                hint="Laisser vide si le propriétaire n'est pas identifié : le véhicule part à wartier"
              >
                <Input
                  value={f.client.typeClient !== "PART" ? (f.client.raisonSociale || f.client.nom || "") : (f.client.nom ?? "")}
                  onChange={(e) => {
                    set("client", "nom", e.target.value);
                    if (f.client.typeClient !== "PART") set("client", "raisonSociale", e.target.value);
                  }}
                  placeholder="Dupont, GPJ Trans…"
                  disabled={!peutReceptionner || clientVerrouille}
                />
              </Field>
              <Field label="Prénom">
                <Input value={f.client.prenom ?? ""} onChange={(e) => set("client", "prenom", e.target.value)} disabled={!peutReceptionner || clientVerrouille} />
              </Field>
              <Field
                label="Téléphone principal"
                required={!!f.client.nom?.trim()}
                error={errors.clientTelephone}
                anchor="clientTelephone"
              >
                <Input value={f.client.telephone ?? ""} onChange={(e) => set("client", "telephone", e.target.value)} placeholder="06 12 34 56 78" disabled={!peutReceptionner || clientVerrouille} />
              </Field>
              <Field label="Email" error={errors.clientEmail} anchor="clientEmail">
                <Input type="email" value={f.client.email ?? ""} onChange={(e) => set("client", "email", e.target.value)} disabled={!peutReceptionner || clientVerrouille} />
              </Field>
              <Field label="Adresse">
                <Input value={f.client.adresse ?? ""} onChange={(e) => set("client", "adresse", e.target.value)} disabled={!peutReceptionner || clientVerrouille} />
              </Field>
              <Field label="Ville">
                <Input value={f.client.ville ?? ""} onChange={(e) => set("client", "ville", e.target.value)} disabled={!peutReceptionner || clientVerrouille} />
              </Field>
            </div>

            {clientVerrouille && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <p>
                  Client existant : les coordonnées sont verrouillées pour ne pas afficher une modification qui ne serait pas enregistrée.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/customers/${f.client.id}`} className="font-semibold text-primary hover:underline">
                    Ouvrir la fiche client
                  </Link>
                  {proprietaireExistant ? (
                    <span className="text-muted-foreground">
                      Changement de propriétaire : passez par la cession depuis la fiche véhicule.
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!peutReceptionner}
                      onClick={() => {
                        setF((p) => ({ ...p, client: { typeClient: "PART" } }));
                        setTelDoublonEcarte(null);
                      }}
                    >
                      Changer de client
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* LOT R5 — dédoublonnage (E6) : un client existant porte déjà ce
                numéro → on propose de le sélectionner au lieu de créer un
                doublon. Proposition, jamais imposée (D3 : pas d'invention). */}
            {doublonPotentiel.isError && (
              <p className="text-xs text-destructive">
                La vérification de doublon est indisponible. Le serveur contrôlera le téléphone à l’enregistrement.
              </p>
            )}
            {doublonAffiche && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                <p className="font-medium text-warning">
                  Un client existe déjà avec ce numéro : « {doublonAffiche.nom}{" "}
                  {doublonAffiche.prenom ?? ""} » ({doublonAffiche.codeClient ?? "—"}).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => chargerClient(doublonAffiche)}>
                    Sélectionner ce client existant
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTelDoublonEcarte(telNormalise)}>
                    Continuer avec un nouveau client
                  </Button>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Créer un second client avec le même numéro risque de dupliquer la fiche. Vous pourrez fusionner plus tard depuis le registre Clients.
                </p>
              </div>
            )}
            {/* Le garage n'a PAS le droit de changer le propriétaire d'un
                véhicule. On ne propose donc plus la case « réassigner » : elle
                offrait une action métier qui n'appartient pas au garage, et
                l'agent repartait avec l'impression d'avoir enregistré la
                réception pour le client choisi alors que le véhicule restait
                rattaché à l'ancien. La règle est expliquée, pas imposée
                silencieusement : l'écran dit pourquoi le dossier sera refusé,
                et quoi faire à la place. */}
            {ownerChangeDemande && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">
                  Ce véhicule appartient déjà à « {vehiculeClientOrigine?.nom ?? "un autre client"} ».
                </p>
                <p className="mt-1 text-muted-foreground">
                  Le garage ne peut pas changer le propriétaire d&apos;un véhicule : la
                  réception sera refusée. Si c&apos;est bien votre client, sélectionnez sa
                  fiche existante ci-dessus. Sinon, c&apos;est un changement de propriété — passez par la
                  procédure de cession de véhicule.
                </p>
              </div>
            )}
          </Section>

          {/* 3 — Chauffeur */}
          <Section title="3 · Chauffeur (si différent du propriétaire)">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nom du chauffeur">
                <Input value={f.chauffeur.nom ?? ""} onChange={(e) => set("chauffeur", "nom", e.target.value)} />
              </Field>
              <Field label="Téléphone du chauffeur">
                <Input value={f.chauffeur.telephone ?? ""} onChange={(e) => set("chauffeur", "telephone", e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* 6 — Pannes, plainte & observations */}
          {/* La section 6 reste SUPPRIMÉE : son contenu est remonté en tête de
              la section 5 « Constats & check-list outillage ». Deux blocs qui
              décrivaient le même constat obligeaient l'agent à choisir où écrire.

              Il n'y a QU'UN SEUL champ : « Pannes déclarées ». Ce que le client
              déclare en déposant son véhicule EST sa plainte — « le moteur
              clignote », « ça vibre depuis la reprise ». Ajouter une zone
              « Plainte du client » à côté creates deux endroits pour le même
              énoncé, et l'agent doit choisir lequel est le vrai. Le serveur
              reporte donc la déclaration sur la colonne historique `plainte`,
              qui alimente la fiche dossier, le planning, les alertes et le
              parc — tous les écrans displaying « Plainte » désignent donc ce
              que le client a effectivement déclaré. */}
        </div>

        <div className="space-y-5 xl:col-span-2">
          {/* 4 — Informations d'entrée */}
          <Section title="4 · Informations d'entrée">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date & heure de réception" hint="Ne peut pas être dans le futur.">
                <Input
                  type="datetime-local"
                  value={r.dateReception ?? ""}
                  onChange={(e) => set("reception", "dateReception", e.target.value)}
                  disabled={!peutReceptionner}
                />
              </Field>
              <Field label="Kilométrage d'entrée" error={errors.kilometrageEntree} anchor="kilometrageEntree" hint="Laisser vide si le compteur n'est pas lisible.">
                <Input
                  type="number"
                  min={0}
                  value={r.kilometrageEntree ?? ""}
                  onChange={(e) => set("reception", "kilometrageEntree", e.target.value ? Number(e.target.value) : "")}
                  disabled={!peutReceptionner}
                />
              </Field>
              <Field label="Niveau de carburant">
                <select value={r.niveauCarburantEntree ?? ""} onChange={(e) => set("reception", "niveauCarburantEntree", e.target.value)} disabled={!peutReceptionner} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60">
                  <option value="">—</option>
                  {NIVEAUX_CARBURANT.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Motif d'entrée">
                <select value={r.motEntree ?? "PANNE"} onChange={(e) => set("reception", "motEntree", e.target.value)} disabled={!peutReceptionner} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60">
                  {Object.entries(MOTIF_ENTREE_LABELS).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                </select>
              </Field>
              <Field label="Type d'intervention">
                <select value={r.typeIntervention ?? "ATELIER"} onChange={(e) => set("reception", "typeIntervention", e.target.value)} disabled={!peutReceptionner} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60">
                  {TYPES_INTERVENTION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Promesse de restitution" error={errors.datePromesse} anchor="datePromesse">
                <Input
                  type="date"
                  value={r.datePromesse ?? ""}
                  min={(r.dateReception ?? "").slice(0, 10) || undefined}
                  onChange={(e) => set("reception", "datePromesse", e.target.value)}
                  disabled={!peutReceptionner}
                />
              </Field>
              {r.typeIntervention === "DEPANNAGE" && (
                <Field label="Lieu d'intervention" required error={errors.lieuDepannage} anchor="lieuDepannage">
                  <Input value={r.lieuDepannage ?? ""} onChange={(e) => set("reception", "lieuDepannage", e.target.value)} placeholder="Ex: Carrefour Bastos, route de Douala…" disabled={!peutReceptionner} />
                </Field>
              )}
              <Field label="Priorité">
                <select value={r.priorite ?? "P3"} onChange={(e) => set("reception", "priorite", e.target.value)} disabled={!peutReceptionner} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60">
                  <option value="P1">P1 — critique</option><option value="P2">P2 — haute</option><option value="P3">P3 — normale</option><option value="P4">P4 — basse</option>
                </select>
              </Field>
            </div>
            {r.typeIntervention === "DEPANNAGE" && (
              <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Dépannage sur site : un OR sera créé, mais aucun passage parking ne sera ouvert tant que le véhicule n'est pas physiquement au garage.
              </p>
            )}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={!!r.clientAttendSurPlace} onChange={(e) => set("reception", "clientAttendSurPlace", e.target.checked)} disabled={!peutReceptionner} className="size-4 accent-primary" />
              Client attend sur place
            </label>
          </Section>

          {/* 5 — Check-list outillage */}
          <Section title="5 · Constats & check-list outillage">
            {/* LOT U3 (E9, RD7) — l'ancienne section 6 est ABSORBÉE ici :
                « Pannes déclarées » (obligatoire) et « Observations » remontent
                en tête du bloc constats : deux blocs qui décrivent le même
                constat obligeaient l'agent à choisir où écrire. Une seule zone
                de saisie, pour un seul concept. */}
            <div className="space-y-4">
              <Field label="Pannes déclarées" required error={errors.pannesDeclarees} anchor="pannesDeclarees">
                <textarea value={r.pannesDeclarees ?? ""} onChange={(e) => set("reception", "pannesDeclarees", e.target.value)} rows={3} disabled={!peutReceptionner} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-60" placeholder="Voyant moteur allumé, bruit à l'accélération…" />
              </Field>
              <Field label="Observations" hint="Facultatif — remarques du déposant, délai souhaité, contraintes…">
                <textarea value={r.observationsReception ?? ""} onChange={(e) => set("reception", "observationsReception", e.target.value)} rows={2} disabled={!peutReceptionner} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-60" placeholder="Client pressé, remarques…" />
              </Field>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Outillage &amp; accessoires
                </p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Cochez ce qui est présent dans le véhicule. Le crayon ouvre l&apos;observation
                  <span className="whitespace-nowrap"> de l&apos;élément </span>concerné.
                </p>
                <CheckListOutillage
                  coches={f.reception.outillage ?? {}}
                  observations={outillageNotes}
                  onToggle={(cle, present) => set("reception", "outillage", { ...(f.reception.outillage ?? {}), [cle]: present })}
                  onObservation={(cle, texte) => setOutillageNotes({ ...outillageNotes, [cle]: texte })}
                  desactive={!peutReceptionner}
                />
              </div>
            </div>
          </Section>

          {/* 6 — État des lieux photographique */}
          <Section title="6 · État des lieux photographique (pièce à conviction)">
            <PhotosEtatDesLieux
              photos={photosEtatDesLieu}
              onChange={(suivants) => setPhotosEtatDesLieu(suivants)}
              visite="ENTREE"
              precedent={precedentPhotos}
              desactive={!peutReceptionner}
            />
            {photosEtatDesLieu.length === 0 && (
              <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                Aucune photo d’entrée : l’état des lieux ne sera pas documenté. Les photos sont recommandées, pas bloquantes.
              </p>
            )}
          </Section>

          {/* 7 — Validation */}
          <Section title="7 · Validation">
            {parking?.dossierOuvert && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                <p className="font-semibold text-warning-foreground">
                  Un dossier est déjà ouvert sur ce véhicule ({parking.dossier?.numero ?? "sans numéro"}).
                </p>
                <label className="mt-2 flex items-start gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmeNouvelleIntervention}
                    onChange={(e) => setConfirmeNouvelleIntervention(e.target.checked)}
                    disabled={!peutReceptionner}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>Je confirme qu’il s’agit d’une nouvelle intervention distincte, pas un doublon de saisie.</span>
                </label>
                {errors.nouvelleIntervention && <p className="mt-1 text-destructive">{errors.nouvelleIntervention}</p>}
              </div>
            )}
            <Field label="Nom du déposant (signature tapée)" required error={errors.signature} anchor="signature" hint="Il s’agit d’un nom saisi, pas d’une signature graphique.">
              <Input value={r.signatureDeposant ?? ""} onChange={(e) => set("reception", "signatureDeposant", e.target.value)} placeholder="Nom du déposant" disabled={!peutReceptionner} />
            </Field>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={!!r.validationVerbale} onChange={(e) => set("reception", "validationVerbale", e.target.checked)} disabled={!peutReceptionner} className="size-4 accent-primary" />
              Validé verbalement (sans signature)
            </label>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border/60 pt-4">
              <Link href="/dashboard/atelier"><Button type="button" variant="outline">Annuler</Button></Link>
              <Button onClick={handleSubmit} disabled={!peutReceptionner || receptionner.isPending}>
                {receptionner.isPending && <Loader2 className="size-4 animate-spin" />}
                <CheckCircle2 className="mr-1.5 size-4" />
                Valider la réception et créer le dossier
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
