"use client";

import { useState } from "react";
import { Search, Plus, Loader2, CheckCircle2, X } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { FormulaireVehicule } from "~/components/vehicule/FormulaireVehicule";
import {
  validerReception,
  messageResume,
  type Erreurs,
} from "~/lib/validation-reception";
import { invaliderApresReception } from "~/lib/invalidation-reception";
import { CheckListOutillage } from "./CheckListOutillage";
import { PhotosEtatDesLieux, type PhotoUI } from "./PhotosEtatDesLieux";

/**
 * RÉCEPTION VÉHICULE (MVP) — recherche ou création en même temps.
 * Sections : 1 Véhicule · 2 Client · 3 Chauffeur · 4 Entrée · 5 Check-list
 * outillage (fiche papier) · 6 Pannes & observations · 7 Photos · 8 Validation.
 */

const NIVEAUX_CARBURANT = ["vide", "1/4", "1/2", "3/4", "plein"];

/** Nombre ou undefined (jamais 0 ni NaN dans l'payload). */
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
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<{ vehicules: any[]; clients: any[] } | null>(null);
  const [modeCreation, setModeCreation] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    vehicule: {}, client: {}, chauffeur: {}, reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false },
  });
  const set = (section: string, k: string, v: any) => setF((p) => ({ ...p, [section]: { ...p[section], [k]: v } }));
  const [outillageNotes, setOutillageNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // RD4 — transparence : client d'origine d'un véhicule chargé (pour détecter
  // un changement de propriétaire et demander confirmation explicite).
  const [vehiculeClientOrigine, setVehiculeClientOrigine] = useState<{ id?: number; nom?: string } | null>(null);

  const { data: recherche } = api.or.rechercherReception.useQuery({ q: q.trim() }, { enabled: q.trim().length >= 2 && !modeCreation });
  const receptionner = api.or.receptionner.useMutation({
    onSuccess: (r) => {
      // RD3 — transparence : le véhicule existant a été réutilisé (et non
      // recréé) par plaque normalisée.
      if ((r as any).vehiculeReconcilie) {
        toast.info(`Véhicule existant réutilisé — dossier ${r.numero} créé sur le véhicule déjà enregistré`);
      } else {
        toast.success(`Réception enregistrée — dossier ${r.numero} créé`);
      }
      // LOT U5 (E11, P2-6) — une réception écrit bien plus que « 2 listes » :
      // dossier, véhicule, client, registre parking projeté, KPI garage. La
      // liste complète et ses motifs vivent dans `~/lib/invalidation-reception`.
      void invaliderApresReception(utils);
      setF({ vehicule: {}, client: {}, chauffeur: {}, reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false } });
      setOutillageNotes({});
      setPhotosEtatDesLieu([]);
      setModeCreation(false);
      setQ("");
      setResultats(null);
      setVehiculeClientOrigine(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const chargerVehicule = (v: any) => {
    setF({
      vehicule: { id: v.id, immatriculation: v.immatriculation, numeroChassis: v.numeroChassis ?? "", typeVehicule: v.typeVehicule ?? "voiture", marque: v.marque ?? "", modele: v.modele ?? "", version: v.version ?? "", annee: v.annee ?? "", couleur: v.couleur ?? "", carburant: v.carburant ?? "", kilometrage: v.kilometrage ?? "", longueur: v.longueur ?? "", largeur: v.largeur ?? "", hauteur: v.hauteur ?? "", poids: v.poids ?? "", dimensionsEstimees: !!v.dimensionsEstimees },
      client: { id: v.clientId ?? undefined, nom: v.clientNom ?? "", prenom: v.clientPrenom ?? "", telephone: v.clientTelephone ?? "" },
      chauffeur: { nom: v.chauffeurNom ?? "", telephone: v.chauffeurTelephone ?? "" },
      reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false },
    });
    // RD4 — mémorise le propriétaire d'origine (pour détecter un changement).
    setVehiculeClientOrigine({ id: v.clientId ?? undefined, nom: v.clientNom ?? undefined });
    setModeCreation(false);
    setResultats(null);
    setQ("");
    toast.success("Véhicule chargé — complétez la réception");
  };
  const chargerClient = (c: any) => {
    setF((p) => ({ ...p, client: { id: c.id, nom: c.nom, prenom: c.prenom ?? "", telephone: c.telephone ?? "", email: c.email ?? "", adresse: c.adresse ?? "", ville: c.ville ?? "" } }));
    setResultats(null);
    setQ("");
  };

  // LOT R5 — dédoublonnage (E6) : quand un numéro est saisi pour un NOUVEAU
  // client (pas de client.id), on interroge les clients existants de l'agence
  // au même téléphone normalisé. Si trouvé, on propose (sans imposer) de
  // sélectionner ce client existant au lieu d'en créer un doublon.
  const telNormalise = (f.client.telephone ?? "").replace(/\D+/g, "").replace(/^0/, "");
  // « Continuer avec un nouveau client » : mémorise le numéro écarté pour ne
  // pas re-proposer le même doublon à chaque frappe.
  const [telDoublonEcarte, setTelDoublonEcarte] = useState<string | null>(null);
  const doublonPotentiel = api.clients.doublonParTelephone.useQuery(
    { telephone: f.client.telephone ?? "" },
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
  // Remplace l'ancienne liste plate (`reception.photos: string[]`) qui :
  //  - ne savait pas de face il s'agissait ;
  //  - jetait en SILENCE toute photo de plus de 2 Mo (P2-5) ;
  //  - plantait la réception côté serveur (colonnes inexistantes, voir or-router).
  const [photosEtatDesLieu, setPhotosEtatDesLieu] = useState<PhotoUI[]>([]);

  // Reprise intelligente : si le véhicule a déjà un état des lieux constaté,
  // on le propose comme référence pour ne re-photographier que ce qui change.
  const immatRecherchee = (f.vehicule.immatriculation ?? "").trim();
  const vehiculeRecherche = api.or.rechercherReception.useQuery(
    { q: immatRecherchee },
    { enabled: immatRecherchee.length >= 2 }
  );
  const vehiculeIdConnu = (vehiculeRecherche.data?.vehicules?.[0] as { id?: number } | undefined)?.id ?? null;

  // LOT U2 (RD5) — dernier kilométrage connu : celui de la fiche si le
  // véhicule a été chargé, sinon celui trouvé par la saisie de la plaque.
  const dernierKmConnu: number | null = (() => {
    const fiche = f.vehicule.kilometrage;
    if (fiche != null && fiche !== "") return Number(fiche);
    const trouve = vehiculeRecherche.data?.vehicules?.[0] as { kilometrage?: number | null } | undefined;
    const km = trouve?.kilometrage;
    return km != null && km > 0 ? Number(km) : null;
  })();
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
  const ownerChangeDemande = !!vehiculeClientOrigine?.id && !!f.vehicule.id && !!f.client.id && vehiculeClientOrigine.id !== f.client.id;

  const handleSubmit = () => {
    const errs = valider();
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
    receptionner.mutate({
      client: { ...f.client, nom: f.client.nom?.trim(), telephone: f.client.telephone?.trim() || undefined },
      // RD4 — réassignation du propriétaire : uniquement si l'opérateur a
      // coché la case de confirmation (jamais d'écrasement silencieux).
      reassignerClient: ownerChangeDemande && !!f.reception.reassignerClient,
      vehicule: { ...f.vehicule, immatriculation: f.vehicule.immatriculation.trim(), marque: f.vehicule.marque?.trim() || undefined, modele: f.vehicule.modele?.trim() || undefined, annee: f.vehicule.annee != null && f.vehicule.annee !== "" ? Number(f.vehicule.annee) : undefined, kilometrage: f.vehicule.kilometrage != null && f.vehicule.kilometrage !== "" ? Number(f.vehicule.kilometrage) : undefined, longueur: numOuUndef(f.vehicule.longueur), largeur: numOuUndef(f.vehicule.largeur), hauteur: numOuUndef(f.vehicule.hauteur), poids: numOuUndef(f.vehicule.poids), dimensionsEstimees: !!f.vehicule.dimensionsEstimees },
      chauffeur: { nom: f.chauffeur.nom?.trim() || undefined, telephone: f.chauffeur.telephone?.trim() || undefined },
      reception: {
        ...f.reception,
        outillage,
        kilometrageEntree: Number(f.reception.kilometrageEntree),
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

      {/* Recherche unifiée */}
      {!modeCreation && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <Label className="text-sm font-medium">Recherche rapide (plaque, châssis, nom, téléphone)</Label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex: AA-123-BB, 308, Dupont, 06 12 34 56 78…" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
          </div>
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
                  <span className="font-semibold">{c.nom} {c.prenom ?? ""}</span>
                  <span className="block text-muted-foreground">{c.telephone ?? c.email ?? ""} — client (sans véhicule lié)</span>
                </button>
              ))}
            </div>
          )}
          {recherche && recherche.vehicules.length === 0 && recherche.clients.length === 0 && q.trim().length >= 2 && (
            <p className="mt-2 text-xs text-muted-foreground">Aucun résultat — créez un nouveau véhicule + client.</p>
          )}
          <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs" onClick={() => { setModeCreation(true); setResultats(null); }}>
            <Plus size={12} /> Créer un nouveau véhicule + client
          </Button>
        </div>
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
            />
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
              <Field label="Nom / Raison sociale" required error={errors.clientNom} anchor="clientNom">
                <Input value={f.client.nom ?? ""} onChange={(e) => set("client", "nom", e.target.value)} placeholder="Dupont, GPJ Trans…" />
              </Field>
              <Field label="Prénom">
                <Input value={f.client.prenom ?? ""} onChange={(e) => set("client", "prenom", e.target.value)} />
              </Field>
              <Field label="Téléphone principal" required error={errors.clientTelephone} anchor="clientTelephone">
                <Input value={f.client.telephone ?? ""} onChange={(e) => set("client", "telephone", e.target.value)} placeholder="06 12 34 56 78" />
              </Field>
              <Field label="Email" error={errors.clientEmail} anchor="clientEmail">
                <Input type="email" value={f.client.email ?? ""} onChange={(e) => set("client", "email", e.target.value)} />
              </Field>
              <Field label="Adresse">
                <Input value={f.client.adresse ?? ""} onChange={(e) => set("client", "adresse", e.target.value)} />
              </Field>
              <Field label="Ville">
                <Input value={f.client.ville ?? ""} onChange={(e) => set("client", "ville", e.target.value)} />
              </Field>
            </div>
            {/* LOT R5 — dédoublonnage (E6) : un client existant porte déjà ce
                numéro → on propose de le sélectionner au lieu de créer un
                doublon. Proposition, jamais imposée (D3 : pas d'invention). */}
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
            {/* RD4 — transparence : le véhicule chargé a un propriétaire et le
                client saisi est différent → confirmation explicite requise. */}
            {ownerChangeDemande && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                <p className="font-medium text-warning">
                  Ce véhicule est déjà lié au propriétaire « {vehiculeClientOrigine?.nom ?? "inconnu"} ».
                </p>
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!f.reception.reassignerClient}
                    onChange={(e) => set("reception", "reassignerClient", e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Réassigner ce véhicule au nouveau client (remplace le propriétaire actuel)
                </label>
                <p className="mt-1 text-muted-foreground">
                  Sans cette case, le véhicule conserve son propriétaire d'origine.
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

          {/* 6 — Pannes & observations */}
          {/* LOT U3 (E9, RD7) — l'ancienne section 6 « Pannes déclarées &
              observations » est SUPPRIMÉE : son contenu est remonté en tête de
              la section 5 « Constats & check-list outillage ». Deux blocs qui
              décrivaient le même constat à deux endroits obligeaient l'agent à
              choisir où écrire. La 3ᵉ zone de texte (plainte) disparaît aussi :
              le serveur reporte déjà la plainte sur les pannes déclarées. */}
        </div>

        <div className="space-y-5 xl:col-span-2">
          {/* 4 — Informations d'entrée */}
          <Section title="4 · Informations d'entrée">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date & heure de réception">
                <Input type="datetime-local" value={r.dateReception ?? ""} onChange={(e) => set("reception", "dateReception", e.target.value)} />
              </Field>
              <Field label="Kilométrage d'entrée" required error={errors.kilometrageEntree} anchor="kilometrageEntree">
                <Input type="number" value={r.kilometrageEntree ?? ""} onChange={(e) => set("reception", "kilometrageEntree", e.target.value ? Number(e.target.value) : "")} />
              </Field>
              <Field label="Niveau de carburant">
                <select value={r.niveauCarburantEntree ?? ""} onChange={(e) => set("reception", "niveauCarburantEntree", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">—</option>
                  {NIVEAUX_CARBURANT.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Motif d'entrée">
                <select value={r.motEntree ?? "PANNE"} onChange={(e) => set("reception", "motEntree", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {["PANNE", "ENTRETIEN", "DIAGNOSTIC", "CARROSSERIE", "CONTROLE", "AUTRE"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Type d'intervention">
                <select value={r.typeIntervention ?? "ATELIER"} onChange={(e) => set("reception", "typeIntervention", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="ATELIER">Atelier</option>
                  <option value="DEPANNAGE">Dépannage sur site</option>
                  <option value="ENTRETIEN">Entretien</option>
                  <option value="CARROSSERIE">Carrosserie</option>
                </select>
              </Field>
              {r.typeIntervention === "DEPANNAGE" && (
                <Field label="Lieu d'intervention">
                  <Input value={r.lieuDepannage ?? ""} onChange={(e) => set("reception", "lieuDepannage", e.target.value)} placeholder="Ex: Carrefour Bastos, route de Douala…" />
                </Field>
              )}
              <Field label="Priorité">
                <select value={r.priorite ?? "P3"} onChange={(e) => set("reception", "priorite", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="P1">P1 — critique</option><option value="P2">P2 — haute</option><option value="P3">P3 — normale</option><option value="P4">P4 — basse</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!r.clientAttendSurPlace} onChange={(e) => set("reception", "clientAttendSurPlace", e.target.checked)} className="size-4 accent-primary" /> Client attend sur place</label>
          </Section>

          {/* 5 — Check-list outillage */}
          <Section title="5 · Constats & check-list outillage">
            {/* LOT U3 (E9, RD7) — l'ancienne section 6 est ABSORBÉE ici :
                « Pannes déclarées » (obligatoire) et « Observations » remontent
                en tête du bloc constats. La 3ᵉ zone de texte
                (« travaux demandés / plainte ») était redondante : le serveur
                reporte déjà la plainte sur les pannes déclarées. */}
            <div className="space-y-4">
              <Field label="Pannes déclarées" required error={errors.pannesDeclarees} anchor="pannesDeclarees">
                <textarea value={r.pannesDeclarees ?? ""} onChange={(e) => set("reception", "pannesDeclarees", e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Voyant moteur allumé, bruit à l'accélération…" />
              </Field>
              <Field label="Observations" hint="Facultatif — remarques du déposant, délai souhaité, contraintes…">
                <textarea value={r.observationsReception ?? ""} onChange={(e) => set("reception", "observationsReception", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Client pressé, remarques…" />
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
            />
          </Section>

          {/* 7 — Validation */}
          <Section title="7 · Validation">
            <Field label="Nom et signature du déposant" required error={errors.signature} anchor="signature">
              <Input value={r.signatureDeposant ?? ""} onChange={(e) => set("reception", "signatureDeposant", e.target.value)} placeholder="Nom tapé du déposant" />
            </Field>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={!!r.validationVerbale} onChange={(e) => set("reception", "validationVerbale", e.target.checked)} className="size-4 accent-primary" />
              Validé verbalement (sans signature)
            </label>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border/60 pt-4">
              <Link href="/dashboard/atelier"><Button type="button" variant="outline">Annuler</Button></Link>
              <Button onClick={handleSubmit} disabled={receptionner.isPending}>
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