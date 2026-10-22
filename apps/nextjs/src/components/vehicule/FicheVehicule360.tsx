"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { RestituerVehicule } from "~/components/or/RestituerVehicule";
import { BandeauRelances, PanneauRelances } from "~/components/or/PanneauRelances";
import {
  ArrowLeft, ArrowRight, Car, FileSignature, Gauge, History, Phone, User, Wrench, ClipboardList,
PackageSearch, Receipt, Camera, AlertTriangle, CalendarClock, Timer, MapPin, ChevronRight, Loader2, Image as ImageIcon,
  } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { transitionStatutVehiculeValide, STATUT_LABELS, STATUT_STYLE, STATUTS_IMMOBILISATION } from "~/server/lib/vehicule-service";
import { STATUTS_LIGNE, STATUTS_LIGNE_LIBELLES } from "~/server/lib/atelier-service";
import { STATUT_LABELS as OR_STATUT_LABELS, STATUT_BADGE as OR_STATUT_BADGE, PRIORITE_META, MOTIF_ENTREE_LABELS } from "~/server/lib/atelier-service";
import { usePermissions } from "~/hooks/usePermissions";
import { PhotoLightbox } from "~/components/photos/PhotoLightbox";
import { PiecesCompatibles } from "~/components/vehicule/PiecesCompatibles";
import { photosValides, libellePhotoCategorie } from "~/lib/photos";

const TYPE_CLIENT_LABELS: Record<string, string> = {
  PART: "Particulier", ENTR: "Entreprise", ADMIN: "Administration", ASSUR: "Assurance", FLOTTE: "Flotte", PROSP: "Prospect",
};

const TAB_ICONS: Record<string, any> = {
  "Vue d'ensemble": Gauge, "Véhicule & client": Car, "OR & travaux": Wrench,
  "Diagnostic & devis": ClipboardList, "Pièces": PackageSearch, "Facture": Receipt, "Historique": History,
};

const fmt = (n: number | string | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "—";

const joursEntre = (d: string | Date | null | undefined) => {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
};

/**
 * FICHE VEHICULE 360 — composant PARTAGE (atelier ET parking).
 *
 * Elle vivait dans pp/(dashboard)/dashboard/vehicules/ alors que le parking en
 * a besoin aussi. Un composant metier dans le dossier d'un seul ecran n'est pas
 * un detail d'organisation : le jour ou l'ecran bouge, l'autre point d'entree
 * casse — pour une raison purement materielle.
 *
 * Meme jeu d'onglets des deux cotes ; le parking ajoute les SIENS. Un onglet de
 * plus selon le point d'entree, et le meme corps partout : une seule chose a
 * corriger quand la fiche evolue.
 */
export function FicheVehicule360({
  id,
  contexte = "atelier",
}: {
  id: string;
  contexte?: "atelier" | "garage";
}) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const router = useRouter();
  const { data, isLoading, isError } = api.vehicules.get.useQuery({ id: Number(id) });
  // Toutes les fiches client, y compris PROVISOIRE : en production, les 31
  // fiches issues du parking sont provisoires. Filtrer sur ACTIF vidait le
  // sélecteur de propriétaire et empêchait de rattacher un véhicule à son
  // vrai client.
  const { data: clientsData } = api.clients.list.useQuery({ limit: 200 });
  const { data: contratsData } = api.vehicules.listContratsActifs.useQuery();
  // Lot 3 — lien croisé 360° : emplacement parking du véhicule canonique lié.
  const { data: parking } = api.garage.vehiculeParCanonique.useQuery(
    { vehiculeId: Number(id) },
    { enabled: Number.isFinite(Number(id)) && Number(id) > 0, retry: false },
  );
  const [tab, setTab] = useState("Vue d'ensemble");
  // Galerie photos — même source que le parking, donc même vérité.
  const [photoOuverte, setPhotoOuverte] = useState<number | null>(null);
  const { data: photosData } = api.vehicules.photos.useQuery(
    { id: Number(id) },
    { enabled: Number.isFinite(Number(id)) && Number(id) > 0, retry: false, staleTime: 60_000 },
  );
  // PHOTOS PARKING — distinctes des photos d'etat des lieux de l'OR que
  // renvoie deja la fiche 360 (photos plus bas). Un constat avant travaux et
  // la photo de facade du meme vehicule ne disent pas la meme chose : les
  // confondre en une seule galerie perdrait l'une des deux.
  const photosParking = photosValides(photosData?.photos);
  // Techniciens pour le selecteur de reassignation. staleTime long : la
  // liste des employs de l agence bouge rarement, et la recharger a chaque
  // ouverture de fiche serait du travail pour rien.
  const { data: techData } = api.vehicules.techniciens.useQuery(undefined, { staleTime: 300_000 });
  const techniciens = (techData?.techniciens ?? []) as any[];
  // Journal unifie : source UNIQUE de l'historique. La 360 avait son propre
  // `timeline`, limite au dossier en cours et sans auteur — deux chemins pour la
  // meme donnee, donc deux verites. Celui-la est mort ; celui-ci fait foi.
  const { data: journalData } = api.vehicules.journal.useQuery(
    { id: Number(id) },
    { enabled: Number.isFinite(Number(id)) && Number(id) > 0, retry: false },
  );
  const journal = journalData?.entrees ?? [];
  const [clientId, setClientId] = useState(0);
  const [contratId, setContratId] = useState(0);
  const [statutMotif, setStatutMotif] = useState("");
  const [chauffeurNom, setChauffeurNom] = useState("");
  const [chauffeurTel, setChauffeurTel] = useState("");

  useEffect(() => {
    if (data?.vehicule) {
      setChauffeurNom((data.vehicule as any).chauffeurNom ?? "");
      setChauffeurTel((data.vehicule as any).chauffeurTelephone ?? "");
    }
  }, [data?.vehicule]);

  const changerStatut = api.vehicules.changerStatut.useMutation({
    onSuccess: (r) => { toast.success(`Statut : ${STATUT_LABELS[r.statut] ?? r.statut}`); utils.vehicules.get.invalidate(); utils.vehicules.list.invalidate(); setStatutMotif(""); },
    onError: (e) => toast.error(e.message),
  });
  const update = api.vehicules.update.useMutation({
    onSuccess: () => { toast.success("Véhicule mis à jour"); utils.vehicules.get.invalidate(); utils.vehicules.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const lierContrat = api.vehicules.lierContrat.useMutation({
    onSuccess: () => { toast.success("Véhicule couvert par le contrat"); utils.vehicules.get.invalidate(); setContratId(0); },
    onError: (e) => toast.error(e.message),
  });
  const retirerContrat = api.vehicules.retirerContrat.useMutation({
    onSuccess: () => { toast.success("Véhicule retiré du contrat"); utils.vehicules.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const creerOR = api.or.create.useMutation({
    onSuccess: (r) => {
      utils.vehicules.get.invalidate();
      utils.vehicules.list.invalidate();
      toast.success(`Ordre de réparation ${r.numero} créé`);
      router.push(`/dashboard/ordres-reparation/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const data360 = useMemo(() => {
    if (!data) return null;
    const v = data.vehicule as any;
    return {
      vehicule: v,
      client: data.client as any,
      orCourant: data.orCourant as any,
      responsable: data.responsable as any,
      rapport: data.rapportDiagnostic as any,
      travaux: (data.lignesTravaux ?? []) as any[],
      demandes: (data.demandesPieces ?? []) as any[],
      retours: (data.retours ?? []) as any[],
      orTermine: data.orTermine as boolean,
      facture: data.facture as any,
      factureLignes: (data.factureLignes ?? []) as any[],
      photos: (data.photos ?? []) as any[],
      alertes: (data.alertes ?? []) as any[],
      historiqueOR: (data.historiqueOR ?? []) as any[],
      autresVehicules: (data.autresVehicules ?? []) as any[],
      contrats: (data.contrats ?? []) as any[],
    };
  }, [data]);

  const hrefRetour = contexte === "garage" ? "/dashboard/garage/vehicules" : "/dashboard/vehicules";

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data360) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Véhicule introuvable.</p>
        <Link href={hrefRetour} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft size={14} /> Retour au parc
        </Link>
      </div>
    );
  }

  const { vehicule: v, client, orCourant, responsable, rapport, travaux, demandes, retours, orTermine, facture, factureLignes, photos, alertes, historiqueOR, autresVehicules, contrats } = data360;
  const clientsList = (clientsData?.clients ?? []) as any[];
  const contratsActifs = (contratsData ?? []) as any[];
  const canModifier = hasPermission("vehicules.modifier");

  // Visionneuse des photos parking, ouverte depuis la galerie.
  const photoLightbox = (
    <PhotoLightbox
      photos={photosParking}
      index={photoOuverte}
      onIndexChange={setPhotoOuverte}
      onClose={() => setPhotoOuverte(null)}
      nomFichierBase={v?.immatriculation ?? "vehicule"}
    />
  );

  const transitions = STATUTS_IMMOBILISATION.filter((s) => transitionStatutVehiculeValide(v.statutImmobilisation, s));
  const displayName = client ? (client.raisonSociale ?? `${client.prenom ?? ""} ${client.nom}`) : null;
  const estFlotte = client?.typeClient === "FLOTTE";
  const joursGarage = orCourant ? joursEntre(orCourant.dateOuverture) : null;
  const joursPromesse = orCourant?.datePromesse ? joursEntre(orCourant.datePromesse) : null;
  const prioMeta = orCourant?.priorite ? PRIORITE_META[orCourant.priorite as keyof typeof PRIORITE_META] : null;
  // Le refus de devis se lit désormais dans le JOURNAL, comme tout le reste.
// Tant qu'il était lu dans `timeline`, ce bloc justifiait à lui seul de garder
// une deuxième requête pour la même donnée — et donc une deuxième vérité.
  const devisRefuse = journal.find(
    (e: any) => e.source === "evenement" && e.type === "VALIDATION_DEVIS" && (e.detail ?? "").startsWith("Devis refusé"),
  );

// Les onglets du garage s'ajoutent à ceux de l'atelier, mêmes règles d'onglet,
// un seul rendu.
  //
  // Calcul direct, PAS de `useMemo` : ce composant a des retours précoces
  // (chargement, erreur) plus haut, et un hook appelé après un retour est une
  // violation des règles de hooks — l'ordre d'appel change d'un rendu à
  // l'autre. Un tableau de chaînes se calcule pour trois fois rien.
  const tabs =
    contexte === "garage"
      ? [...Object.keys(TAB_ICONS), "Position", "Alertes"]
      : Object.keys(TAB_ICONS);
  const Icon = TAB_ICONS[tab];

  return (
    <div className="space-y-5">
      {photoLightbox}
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={hrefRetour} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-mono text-xl font-bold tracking-tight text-foreground">
              <Car size={18} className="text-primary" /> {v.immatriculation ?? "Sans plaque"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {v.marque} {v.modele}{v.version ? ` · ${v.version}` : ""}{v.annee ? ` · ${v.annee}` : ""}{v.couleur ? ` · ${v.couleur}` : ""}
              {v.carburant ? ` · ${v.carburant}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estFlotte && (
            <span className="inline-block rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-bold uppercase text-violet-400">
              Flotte {client.raisonSociale ? `· ${client.raisonSociale}` : ""}
            </span>
          )}
          {client?.statut === "PROVISOIRE" && (
            <span className="inline-block rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-bold uppercase text-warning-foreground" title="Fiche client issue du parking, à confirmer">
              Client provisoire
            </span>
          )}
          {v.isActive === false && (
            <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
              Fiche inactive
            </span>
          )}
          {orCourant?.priorite && prioMeta && (
            <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${prioMeta.badge}`}>
              Priorité {orCourant.priorite}
            </span>
          )}
          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUT_STYLE[v.statutImmobilisation] ?? ""}`}>
            {STATUT_LABELS[v.statutImmobilisation] ?? v.statutImmobilisation}
          </span>
          {canModifier && (
            <select
              value=""
              onChange={(e) => e.target.value && changerStatut.mutate({ id: v.id, nouveauStatut: e.target.value as any, motif: statutMotif || undefined })}
              className="h-8 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none"
            >
              <option value="">Changer de statut…</option>
              {transitions.map((s) => <option key={s} value={s} className="bg-background">{STATUT_LABELS[s] ?? s}</option>)}
            </select>
          )}
          {hasPermission("or.creer") && (
            <Button type="button" size="sm" className="gap-1.5" disabled={creerOR.isPending} onClick={() => creerOR.mutate({ vehiculeId: v.id })}>
              {creerOR.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />} Créer un OR
            </Button>
          )}
        </div>
      </div>

      {/* ── Raison d'immobilisation / blocage ── */}
      {(orCourant?.raisonBlocage || v.notes) && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            {orCourant?.raisonBlocage && (
              <p><span className="font-semibold">Raison du statut {orCourant.statut === "BLOQUE" ? "(OR bloqué)" : ""} :</span> {orCourant.raisonBlocage}</p>
            )}
            {v.notes && <p className="whitespace-pre-line text-xs text-muted-foreground">{v.notes}</p>}
          </div>
        </div>
      )}

      {/* ── Relances (étape 5) : au-dessus des ONGLETS, pas dans un onglet.
          Une attente n'est pas liée à une vue. Si le bandeau n'apparaît que
          dans « Vue d'ensemble », l'agent qui ouvre « Historique » ne voit pas
          qu'un dossier attend une réponse depuis vingt-cinq jours — et le
          panneau est inutile précisément quand on en a le plus besoin. */}
      <BandeauRelances vehiculeId={v.id} />

      {/* ── Onglets ── */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5">
        {tabs.map((t) => {
          const TIcon = TAB_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <TIcon size={13} /> {t}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {/* ═══════ VUE D'ENSEMBLE ═══════ */}
        {tab === "Vue d'ensemble" && (
          <>
            {/* ── Relances (étape 5) : le dossier complet ── */}
            <PanneauRelances vehiculeId={v.id} orId={orCourant?.id ?? null} />

            {alertes.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
                {alertes.map((a: any) => (
                  <p key={a.id} className="flex items-center gap-2 text-xs font-semibold text-warning-foreground">
                    <AlertTriangle size={13} /> {a.titre} — {a.message}
                  </p>
                ))}
              </div>
            )}

            {orCourant ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                    <Gauge size={14} className="text-primary" /> {orTermine ? "Dernier ordre de réparation (terminé)" : "Ordre de réparation en cours"}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${OR_STATUT_BADGE[orCourant.statut] ?? "bg-muted text-muted-foreground"}`}>
                      {OR_STATUT_LABELS[orCourant.statut] ?? orCourant.statut}
                    </span>
                    <Link href={`/dashboard/ordres-reparation/${orCourant.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs">Ouvrir la fiche <ChevronRight size={13} /></Button>
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                  <Field label="N° OR" value={orCourant.numero} mono />
                  <Field label="Mot d'entrée" value={MOTIF_ENTREE_LABELS[orCourant.motEntree] ?? orCourant.motEntree} />
                  <Field label="Priorité" value={orCourant.priorite} />
                  <Field label="Responsable" value={responsable ? `${responsable.prenom ?? ""} ${responsable.nom}` : "—"} />
                  <Field label="Date d'entrée" value={fmtDate(orCourant.dateOuverture)} />
                  <Field label="Au garage depuis" value={joursGarage !== null ? `${joursGarage} j` : "—"} />
                  <Field label="Promesse de restitution" value={fmtDate(orCourant.datePromesse)} warn={joursPromesse !== null && joursPromesse > 0} />
                  <Field label="Client attend sur place" value={orCourant.clientAttendSurPlace ? "Oui" : "Non"} />
                  <Field label="Total estimé" value={fmt(orCourant.totalTTC)} />
                  <Field label="Devis" value={orCourant.devisAccepte ? "Accepté" : orCourant.statut === "EN_ATTENTE_VALIDATION" ? "En attente client" : "—"} />
                </div>

                {orCourant.plainte && (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plaintes du client</p>
                    <p className="mt-1 text-sm text-foreground">{orCourant.plainte}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <Gauge size={20} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">Aucun ordre de réparation en cours — le véhicule est disponible.</p>
                {historiqueOR.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Dernier passage : {fmtDate(historiqueOR[0].dateOuverture)} ({historiqueOR[0].numero})</p>}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                  <Car size={14} className="text-primary" /> Véhicule & propriétaire
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Field label="Propriétaire" value={displayName ? `${displayName} (${client?.codeClient})` : "—"} />
                  <Field label="Statut client" value={client?.statut ? (client.statut === "PROVISOIRE" ? "Provisoire" : client.statut) : "—"} />
                  <Field label="Type de client" value={client ? (TYPE_CLIENT_LABELS[client.typeClient] ?? client.typeClient) : "—"} />
                  <Field label="Chauffeur" value={v.chauffeurNom} />
                  <Field label="Téléphone propriétaire" value={client?.telephone ?? "—"} />
                </div>
                {client?.telephone && (
                  <a href={`tel:${client.telephone}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20">
                    <Phone size={13} /> Appeler le propriétaire
                  </a>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                  <Camera size={14} className="text-primary" /> Photos ({photos.length})
                </h3>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune photo sur l'OR en cours.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {photos.slice(0, 8).map((p: any) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-border">
                        {p.type === "PHOTO" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square items-center justify-center bg-muted text-lg">🎬</div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lot 3 — emplacement parking (lien croisé fiche parking) */}
            {parking && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                    <MapPin size={14} className="text-primary" /> Emplacement parking
                  </h3>
                  <div className="flex items-center gap-2">
                    {parking.alertesOuvertes > 0 && (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-black uppercase text-destructive">
                        {parking.alertesOuvertes} alerte(s)
                      </span>
                    )}
                    <Link href={`/dashboard/garage/vehicules/${parking.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs">Fiche parking <ChevronRight size={13} /></Button>
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Field label="Site" value={parking.siteNom ? `${parking.siteNom}${parking.siteCode ? ` (${parking.siteCode})` : ""}` : "—"} />
                  <Field label="Zone" value={parking.zoneNom ?? "—"} />
                  <Field label="Emplacement" value={parking.spotCode ?? "—"} mono />
                  <Field label="Statut parking" value={parking.statut} />
                </div>
                {!parking.positionne && (
                  <p className="mt-2 text-xs text-warning-foreground">Véhicule non positionné sur le plan (panneau « À placer »).</p>
                )}
<Link href="/dashboard/garage/carte" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                    Voir sur la carte parking <ArrowRight size={11} />
                  </Link>
                </div>
              )}

              {/* ─── PHOTOS ───────────────────────────────────────────────
                  Alimentation par la MÊME source que le parking et que la
                  vignette de la liste : `vehicules.photos`, qui résout la ligne
                  de registre la plus récente. Une seule source, donc un clic
                  sur un véhicule ne peut pas montrer une photo différente de
                  celle affichée deux secondes plus tôt.

                  L'arbre de rendu n'était PAS dans le `parking && (...)` : un
                  véhicule absent du registre n'a pas de photos, mais il peut
                  en avoir ailleurs (état des lieux d'un dossier). Conditionner
                  l'affichage à `parking` aurait masqué des photos existantes. */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <ImageIcon size={14} className="text-primary" /> Photos du véhicule
                    {photosParking.length > 0 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                        {photosParking.length}
                      </span>
                    )}
                  </h3>
                  {photosParking.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setPhotoOuverte(0)}>
                      Ouvrir la visionneuse
                    </Button>
                  )}
                </div>

                {photosParking.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    Aucune photo. Elles se prennent depuis la fiche parking ou depuis l'état des lieux d'un dossier.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {photosParking.map((p, i) => (
                        <button
                          key={`${p.url}-${i}`}
                          type="button"
                          onClick={() => setPhotoOuverte(i)}
                          title={`${libellePhotoCategorie(p.categorie)}${p.date ? ` — ${fmtDate(p.date)}` : ""}${p.auteur ? ` — ${p.auteur}` : ""}`}
                          className="group relative h-20 w-28 overflow-hidden rounded-lg border border-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={libellePhotoCategorie(p.categorie)} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 text-[9px] font-semibold text-white">
                            {libellePhotoCategorie(p.categorie)}
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* Qui a photographié quoi, et quand — sans quoi une photo
                        n'est qu'une image sans auteur ni date. */}
                    <ul className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
                      {photosParking.map((p, i) => (
                        <li key={`meta-${i}`} className="truncate">
                          {libellePhotoCategorie(p.categorie)}
                          {p.date ? ` — ${fmtDate(p.date)}` : ""}
                          {p.auteur ? ` — ${p.auteur}` : " — auteur inconnu"}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}

        {/* ═══════ VÉHICULE & CLIENT ═══════ */}
        {tab === "Véhicule & client" && (
          <>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Fiche véhicule</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Field label="Immatriculation" value={v.immatriculation} mono />
                <Field label="Marque / Modèle" value={v.marque && v.modele ? `${v.marque} ${v.modele}` : (v.marque ?? v.modele)} />
                <Field label="Version / finition" value={v.version} />
                <Field label="Année" value={v.annee} />
                <Field label="Couleur" value={v.couleur} />
                <Field label="N° châssis" value={v.numeroChassis} />
                <Field label="Kilométrage" value={v.kilometrage !== null && v.kilometrage !== undefined ? `${v.kilometrage.toLocaleString("fr-FR")} km` : "—"} />
                <Field label="Carburant" value={v.carburant} />
                <Field label="Type" value={v.typeVehicule} />
                <Field
                  label="Dimensions (L × l × H)"
                  value={
                    v.longueur || v.largeur || v.hauteur
                      ? [v.longueur, v.largeur, v.hauteur].map((x) => (x != null ? `${x} m` : "—")).join(" × ")
                      : "—"
                  }
                />
                <Field label="Poids" value={v.poids != null ? `${Number(v.poids).toLocaleString("fr-FR")} kg` : "—"} />
                <Field label="Enregistré le" value={fmtDate(v.createdAt)} />
                <Field label="Mis à jour le" value={fmtDate(v.updatedAt)} />
              </div>

              {canModifier && (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transférer à un autre client</label>
                    <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className="mt-1 h-9 rounded-lg border border-border bg-background px-3 text-sm">
                      <option value={0}>Choisir un client…</option>
                      {clientsList.map((cl: any) => <option key={cl.id} value={cl.id}>{cl.raisonSociale ?? `${cl.prenom ?? ""} ${cl.nom}`}</option>)}
                    </select>
                  </div>
                  <Button size="sm" variant="outline" disabled={!clientId} onClick={() => update.mutate({ id: v.id, clientId })}>
                    Transférer
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <User size={14} className="text-primary" /> Chauffeur du véhicule
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nom du chauffeur</label>
                  <input
                    value={chauffeurNom}
                    onChange={(e) => setChauffeurNom(e.target.value)}
                    disabled={!canModifier}
                    placeholder="ex. Jean Kouamé"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Téléphone du chauffeur</label>
                  <input
                    value={chauffeurTel}
                    onChange={(e) => setChauffeurTel(e.target.value)}
                    disabled={!canModifier}
                    placeholder="ex. 6 99 00 11 22"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 disabled:opacity-60"
                  />
                </div>
              </div>
              {canModifier && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={(chauffeurNom === (v.chauffeurNom ?? "")) && (chauffeurTel === (v.chauffeurTelephone ?? ""))}
                    onClick={() => update.mutate({ id: v.id, chauffeurNom: chauffeurNom || null, chauffeurTelephone: chauffeurTel || null })}
                  >
                    Enregistrer le chauffeur
                  </Button>
                  {chauffeurTel && (
                    <a href={`tel:${chauffeurTel}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20">
                      <Phone size={13} /> Appeler le chauffeur
                    </a>
                  )}
                </div>
              )}
            </div>

            {autresVehicules.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Autres véhicules du même client ({autresVehicules.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {autresVehicules.map((av: any) => (
                    <Link key={av.id} href={`/dashboard/vehicules/${av.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs hover:border-primary/40">
                      <span className="font-mono font-bold">{av.immatriculation}</span>
                      <span className="text-muted-foreground">{av.marque} {av.modele}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUT_STYLE[av.statutImmobilisation] ?? ""}`}>
                        {STATUT_LABELS[av.statutImmobilisation] ?? av.statutImmobilisation}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <FileSignature size={14} className="text-primary" /> Contrats de maintenance couvrant ce véhicule
              </h3>
              {contrats.length === 0 && <p className="text-sm text-muted-foreground">Aucun contrat actif sur ce véhicule.</p>}
              <div className="space-y-2">
                {contrats.map((ct: any) => (
                  <div key={ct.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{ct.libelle}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{ct.numeroContrat}</span>
                      <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success-foreground">{ct.statutContrat}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">fin : {fmtDate(ct.dateFin)}</span>
                    </div>
                    {canModifier && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => retirerContrat.mutate({ id: ct.id })}>
                        Retirer
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {canModifier && contratsActifs.length > 0 && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                  <div className="min-w-64 flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Couvrir par un contrat actif</label>
                    <select value={contratId} onChange={(e) => setContratId(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                      <option value={0}>Choisir un contrat…</option>
                      {contratsActifs.map((ct: any) => <option key={ct.id} value={ct.id}>{ct.numeroContrat} — {ct.libelle}</option>)}
                    </select>
                  </div>
                  <Button size="sm" disabled={!contratId} onClick={() => lierContrat.mutate({ vehiculeId: v.id, contratId })}>
                    Lier
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════ OR & TRAVAUX ═══════ */}
        {tab === "OR & travaux" && (
          <>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <Timer size={14} className="text-primary" /> Travaux de l'OR en cours
              </h3>
              {travaux.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune ligne de travail pour l'OR en cours.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3">Désignation</th>
                        <th className="py-2 pr-3 text-right">Qté</th>
                        <th className="py-2 pr-3 text-right">Prix unitaire</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                        <th className="py-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {travaux.map((l: any) => (
                        <Fragment key={l.id}>
                          <LigneTravailEditable ligne={l} techniciens={techniciens} />
                          {orCourant && (
                            <tr className="border-b border-border/40 bg-muted/10">
                              <td colSpan={5} className="px-3 pb-3 pt-0">
                                <ConstatLigne ligne={l} vehiculeId={v.id} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <History size={14} className="text-primary" /> Historique des passages ({historiqueOR.length})
              </h3>
              {historiqueOR.length === 0 && <p className="text-sm text-muted-foreground">Aucun OR sur ce véhicule.</p>}
              <div className="space-y-2">
                {historiqueOR.map((or: any) => (
                  <div key={or.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold">{or.numero}</span>
                      {or.priorite && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black text-white ${or.priorite === "P1" ? "bg-destructive" : or.priorite === "P2" ? "bg-warning" : or.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{or.priorite}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${OR_STATUT_BADGE[or.statut] ?? "bg-muted text-muted-foreground"}`}>
                        {OR_STATUT_LABELS[or.statut] ?? or.statut}
                      </span>
                      {or.responsable && <span className="text-[10px] text-muted-foreground">resp. {or.responsable.prenom ?? ""} {or.responsable.nom}</span>}
                      <span className="ml-auto text-xs font-semibold">{fmt(or.totalTTC)} F</span>
                    </div>
                    {or.plainte && <p className="mt-1 truncate text-xs text-muted-foreground" title={or.plainte}>{or.plainte}</p>}
                    {or.raisonBlocage && <p className="mt-0.5 text-xs text-warning">Bloqué : {or.raisonBlocage}</p>}
                    <p className="text-[10px] text-muted-foreground">Entrée {fmtDate(or.dateOuverture)}{or.dateCloture ? ` · Sortie ${fmtDate(or.dateCloture)}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══════ DIAGNOSTIC & DEVIS ═══════ */}
        {tab === "Diagnostic & devis" && (
          <>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <ClipboardList size={14} className="text-primary" /> Rapport de diagnostic
              </h3>
              {!rapport ? (
                <p className="text-sm text-muted-foreground">Aucun diagnostic n'a encore été établi pour l'OR en cours.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      rapport.statut === "VALIDE" ? "bg-success/10 text-success-foreground"
                      : rapport.statut === "SOUMIS" ? "bg-sky-500/10 text-sky-400"
                      : rapport.statut === "RETOURNE" ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      {rapport.statut === "VALIDE" ? "Validé" : rapport.statut === "SOUMIS" ? "Soumis pour validation" : rapport.statut === "RETOURNE" ? "Renvoyé au technicien" : "Brouillon"}
                    </span>
                    {rapport.technicien && <span className="text-xs text-muted-foreground">par {rapport.technicien.prenom ?? ""} {rapport.technicien.nom}</span>}
                    {rapport.dateSoumission && <span className="text-xs text-muted-foreground">· soumis le {fmtDate(rapport.dateSoumission)}</span>}
                    <ModificateurDiagnostic rapport={rapport} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Constat</p>
                      <p className="mt-1 text-sm whitespace-pre-line">{rapport.constat || "—"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cause présumée</p>
                      <p className="mt-1 text-sm whitespace-pre-line">{rapport.cause || "—"}</p>
                    </div>
                  </div>
                  {rapport.statut === "VALIDE" && (
                    <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                      <span className="font-bold text-success-foreground">✔ Validé par {rapport.validateur ? `${rapport.validateur.prenom ?? ""} ${rapport.validateur.nom}` : "le chef d'atelier"} le {fmtDate(rapport.valideLe)}</span>
                      {rapport.commentaireValidateur && <p className="mt-1 text-xs text-muted-foreground">« {rapport.commentaireValidateur} »</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <Receipt size={14} className="text-primary" /> Devis client
              </h3>
              {!orCourant ? (
                <p className="text-sm text-muted-foreground">Aucun OR en cours — pas de devis.</p>
              ) : orCourant.devisAccepte ? (
                <p className="text-sm font-semibold text-success-foreground">✔ Devis accepté par le client — travaux en cours.</p>
              ) : orCourant.statut === "EN_ATTENTE_VALIDATION" ? (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <p className="font-semibold text-warning-foreground">⏳ Devis soumis — en attente de validation par le client.</p>
                </div>
              ) : devisRefuse ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <p className="font-semibold text-destructive">✖ Devis refusé par le client.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{devisRefuse.detail}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun devis soumis pour cet OR. Le devis devient soumissible une fois le diagnostic validé.</p>
              )}
            </div>
          </>
        )}

        {/* ═══════ PIÈCES ═══════ */}
        {tab === "Pièces" && (
          <>
            {/* Le pont catalogue ↔ voiture : ce qui va à CETTE voiture d'abord. */}
            <PiecesCompatibles vehiculeId={Number(id)} />

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <PackageSearch size={14} className="text-primary" /> Demandes de pièces ({demandes.length})
              </h3>
              {demandes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune demande de pièces pour l'OR en cours.</p>
              ) : (
                <div className="space-y-3">
                  {demandes.map((d: any) => (
                    <div key={d.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold">DEM-{String(d.id).padStart(4, "0")}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          d.statut === "SERVIE" ? "bg-success/10 text-success-foreground"
                          : d.statut === "PARTIELLE" ? "bg-warning/10 text-warning-foreground"
                          : d.statut === "MANQUANTE" ? "bg-destructive/10 text-destructive"
                          : d.statut === "ANNULEE" ? "bg-muted text-muted-foreground"
                          : "bg-sky-500/10 text-sky-400"
                        }`}>{d.statut}</span>
                        <span className="text-[10px] text-muted-foreground">demandée le {fmtDate(d.createdAt)}</span>
                      </div>
                      {d.motif && <p className="mt-1 text-xs text-warning">Motif : {d.motif}</p>}
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="py-1 pr-3">Pièce</th>
                            <th className="py-1 pr-3 text-right">Qté demandée</th>
                            <th className="py-1 pr-3 text-right">Qté servie</th>
                            <th className="py-1 pr-3 text-right">Prix estimé</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lignes.map((l: any) => (
                            <tr key={l.id} className="border-b border-border/40">
                              <td className="py-1 pr-3 font-medium">{l.produitLibelle ?? l.produitRef ?? `Produit #${l.produitId}`}</td>
                              <td className="py-1 pr-3 text-right">{fmt(l.quantite)}</td>
                              <td className="py-1 pr-3 text-right">{fmt(l.quantiteServie)}</td>
                              <td className="py-1 pr-3 text-right">{l.prixEstime !== null && l.prixEstime !== undefined ? `${fmt(l.prixEstime)} F` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <PackageSearch size={14} className="text-primary" /> Retours fournisseur ({retours.length})
              </h3>
              {retours.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun retour fournisseur pour cet OR.</p>
              ) : (
                <div className="space-y-2">
                  {retours.map((r: any) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <div>
                        <span className="font-mono text-xs font-bold">RET-{String(r.id).padStart(4, "0")}</span>
                        <span className="ml-2 font-medium">{r.fournisseurNom ?? "Fournisseur inconnu"}</span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.statut === "CLOTURE" ? "bg-success/10 text-success-foreground"
                          : r.statut === "REMPLACE" ? "bg-sky-500/10 text-sky-400"
                          : "bg-destructive/10 text-destructive"
                        }`}>{r.statut}</span>
                      </div>
                      {r.motif && <span className="text-xs text-muted-foreground">{r.motif}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════ FACTURE ═══════ */}
        {tab === "Facture" && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Receipt size={14} className="text-primary" /> Facture
            </h3>
            {!facture ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center">
                <Receipt size={20} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  {orCourant ? "Cet OR n'est pas encore facturé." : "Aucune facture pour ce véhicule."}
                </p>
                {orCourant && (
                  <Link href={`/dashboard/ordres-reparation/${orCourant.id}`}>
                    <Button size="sm" variant="outline" className="mt-2 text-xs">Facturer depuis la fiche OR</Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Field label="Référence" value={facture.reference} mono />
                  <Field label="Montant total" value={`${fmt(facture.montantTotal)} F`} />
                  <Field label="Statut" value={facture.statut} />
                  <Field label="Date" value={fmtDate(facture.createdAt)} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3">Désignation</th>
                        <th className="py-2 pr-3 text-right">Qté</th>
                        <th className="py-2 pr-3 text-right">Prix unitaire</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factureLignes.map((l: any) => (
                        <tr key={l.id} className="border-b border-border/50">
                          <td className="py-2 pr-3">{l.libelle}</td>
                          <td className="py-2 pr-3 text-right">{fmt(l.quantite)}</td>
                          <td className="py-2 pr-3 text-right">{fmt(l.prixUnitaire)}</td>
                          <td className="py-2 text-right font-semibold">{fmt(l.totalLigne ?? Number(l.quantite) * Number(l.prixUnitaire))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="py-2 text-right font-bold uppercase">Total facture</td>
                        <td className="py-2 text-right font-black">{fmt(facture.montantTotal)} F</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ─── Restitution — ÉTAPE 4 ───
                Le garage vit ici, dans la 360. Avant ce lot, rendre un véhicule
                exigeait de retrouver le dossier, de l'ouvrir, puis de changer
                d'onglet : un détour, alors qu'au garage ce qu'on a sous les
                yeux c'est la plaque et la place.

                Le panneau est le MÊME que celui de la page OR — importé, pas
                recopié. Deux formulaires de restitution qui divergent donneraient
                deux réponses à « le véhicule est-il parti avec le plein ? », et
                l'une des deux aurait tort sans qu'on le sache. */}
            {orCourant && (
              <div className="mt-5 border-t border-border pt-5">
                <RestituerVehicule or={orCourant} />
              </div>
            )}
          </div>
        )}

        {/* ═══════ HISTORIQUE ═══════ */}
        {tab === "Historique" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <CalendarClock size={14} className="text-primary" /> Journal du véhicule ({journal.length})
              </h3>
              {journal.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement tracé.</p>
              ) : (
                <div className="space-y-0">
                  {journal.map((t: any, i: number) => (
                    <div key={`${t.source}-${t.quand}-${i}`} className="relative pb-4 pl-5">
                      {i < journal.length - 1 && <span className="absolute left-[5px] top-2 h-full w-px bg-border" />}
                      <span className="absolute left-0 top-1.5 size-2.5 rounded-full bg-primary" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t.quand ? fmtDate(t.quand) : <span className="italic normal-case">date inconnue</span>}
                        {" — "}{t.libelle}
                        {t.orNumero ? ` · ${t.orNumero}` : ""}
                      </p>
                      <p className="text-xs text-foreground">
                        {t.ancien && <span className="text-muted-foreground line-through">{t.ancien}</span>}
                        {t.ancien && t.nouveau && <span className="text-muted-foreground"> → </span>}
                        {t.nouveau && <span className="font-semibold">{t.nouveau}</span>}
                        {t.detail && <span className="text-muted-foreground"> — {t.detail}</span>}
                        {/* L'auteur est la raison d'être de ce journal. Son absence
                            se DIT, elle ne se masque pas : une saisie incomplète
                            qu'on cache devient une erreur invisible. */}
                        <span className="ml-1 font-semibold normal-case">
                          {" — "}
                          {t.auteur ?? <span className="italic text-warning-foreground">auteur inconnu</span>}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <MapPin size={14} className="text-primary" /> Emplacement & photos
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Field label="Statut garage" value={STATUT_LABELS[v.statutImmobilisation] ?? v.statutImmobilisation} />
                <Field label="Emplacement" value={v.emplacementId ? `Emplacement #${v.emplacementId}` : "—"} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Aucune photo enregistrée.</p>}
                {photos.map((p: any) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-border">
                    {p.type === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-lg">🎬</div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Onglet PARKING : position de registre ──────────────────────────
            Le registre a une notion que l'atelier n'a pas : la place dans le
            plan, et le statut de gestion qui lui est propre. Les montrer ici
            evite d'ouvrir une seconde fiche pour savoir OU est le vehicule. */}
        {contexte === "garage" && tab === "Position" && (
          <div className="space-y-4">
            {!parking ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Ce véhicule n'a pas de ligne au registre parking.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                  <MapPin size={14} className="text-primary" /> Position au registre
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                  <Field label="N° registre" value={parking.numRegistre} mono />
                  <Field label="Site" value={parking.siteNom ?? "—"} />
                  <Field label="Zone" value={parking.zoneNom ?? "—"} />
                  <Field label="Emplacement" value={parking.spotCode ?? "—"} mono />
                  <Field label="Statut registre" value={parking.statut ?? "—"} />
                  <Field label="Entrée" value={fmtDate(parking.dateEntree)} />
                </div>
                {!parking.positionne && (
                  <p className="mt-3 text-xs text-warning-foreground">
                    Véhicule non positionné sur le plan. Click « à placer » sur la carte du parking.
                  </p>
                )}
                <Link href="/dashboard/garage/carte" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  Voir sur la carte parking <ArrowRight size={11} />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ─── Onglet PARKING : alertes de gestion ───────────────────────────
            Distinguées des alertes atelier : celles-ci parlent d'un dossier,
            celles-là d'une immobilisation prolongée ou d'un dépassement de seuil
            parking. Les confondre ferait croire qu'un véhicule est en défaut
            alors qu'il ne fait qu'attendre sa date de restitution. */}
        {contexte === "garage" && tab === "Alertes" && (
          <div className="space-y-4">
            {parking && parking.alertesOuvertes > 0 ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-destructive">
                  <AlertTriangle size={14} /> {parking.alertesOuvertes} alerte(s) ouverte(s)
                </h3>
                <Link href="/dashboard/garage/alertes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  Traiter les alertes <ArrowRight size={11} />
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Aucune alerte ouverte sur ce véhicule.
              </div>
            )}
            {alertes.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">
                  Notifications d'atelier ({alertes.length})
                </h3>
                <ul className="space-y-2">
                  {alertes.map((a: any) => (
                    <li key={a.id} className="text-xs">
                      <span className="font-semibold">{a.titre}</span>
                      <span className="text-muted-foreground"> — {a.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * COMPTE RENDU D'INTERVENTION — ce que le technicien a vu, fait, et prévu.
 *
 * Étape 7, lot 1 : `or_interventions` est en ajout seul. L'écran ne propose donc
 * ni modification ni suppression : un compte rendu qu'on peut corriger n'est
 * plus un compte rendu. La série reste lisible, le suivant corrige sans effacer.
 *
 * L'historique n'est chargé qu'à l'ouverture : une ligne de travail n'a pas
 * besoin de N requêtes pour afficher la fiche.
 */
function ConstatLigne({ ligne, vehiculeId }: { ligne: any; vehiculeId: number }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [ouvert, setOuvert] = useState(false);
  const [intervention, setIntervention] = useState("");
  const [constat, setConstat] = useState("");
  const [suite, setSuite] = useState("");

  const peutLire = hasPermission("or.consulter");
  const peutEcrire = hasPermission("or.intervenir");

  const { data: historique } = api.interventions.parLigne.useQuery(
    { ligneId: ligne.id },
    { enabled: ouvert && peutLire },
  );

  const ecrire = api.interventions.ecrire.useMutation({
    onSuccess: () => {
      toast.success("Compte rendu enregistré.");
      setIntervention("");
      setConstat("");
      setSuite("");
      setOuvert(false);
      void utils.interventions.parLigne.invalidate({ ligneId: ligne.id });
      void utils.interventions.dernierConstat.invalidate({ vehiculeId });
      void utils.interventions.parVehicule.invalidate({ vehiculeId });
      void utils.vehicules.get.invalidate();
      void utils.vehicules.journal.invalidate();
      void utils.revueParc.file.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!peutLire && !peutEcrire) return null;

  const enregistrer = () => {
    if (!intervention.trim() && !constat.trim() && !suite.trim()) {
      toast.error("Un compte rendu vide n'apprend rien : dites au moins ce que vous avez constaté.");
      return;
    }
    ecrire.mutate({
      ligneId: ligne.id,
      intervention: intervention.trim() || undefined,
      constat: constat.trim() || undefined,
      suite: suite.trim() || undefined,
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Compte rendu
        </span>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="ml-auto rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {ouvert ? "Fermer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="mt-2 space-y-2">
          {peutLire && historique && historique.length > 0 && (
            <div className="space-y-1 border-b border-border/60 pb-2">
              {historique.map((h: any) => (
                <div key={h.id} className="text-xs">
                  <span className="text-[10px] text-muted-foreground">
                    {fmtDate(h.createdAt)}
                    {h.technicien?.nom ? ` · ${h.technicien.nom}` : ""}
                  </span>
                  {h.constat && <p><span className="font-semibold">Constat :</span> {h.constat}</p>}
                  {h.intervention && <p><span className="font-semibold">Intervention :</span> {h.intervention}</p>}
                  {h.suite && <p><span className="font-semibold">Suite :</span> {h.suite}</p>}
                </div>
              ))}
            </div>
          )}
          {peutLire && historique && historique.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun compte rendu pour cette ligne.</p>
          )}

          {peutEcrire && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Constat</label>
                  <textarea value={constat} onChange={(e) => setConstat(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="Ce que j'ai vu…" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Intervention</label>
                  <textarea value={intervention} onChange={(e) => setIntervention(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="Ce que j'ai fait…" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suite</label>
                  <textarea value={suite} onChange={(e) => setSuite(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="Ce qu'il faut pour la suite…" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={enregistrer} disabled={ecrire.isPending}>
                  {ecrire.isPending ? "Enregistrement…" : "Enregistrer le compte rendu"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * LIGNE DE TRAVAIL ÉDITABLE — statut, technicien, blocage.
 *
 * Étape 2 de la demande : « et pouvoir les mettre à jour ». La fiche était en
 * lecture seule — il fallait repartir vers un autre écran pour changer un statut
 * de travail, ce qui, en pratique, veut dire que l'agent ne le fait pas et que
 * le tableau ment sur l'avancement réel.
 *
 * `or.updateLigne` existe déjà, et il est mieux protégé que cette interface :
 * énumération des statuts (P0.3), contrôle de transition, refus si le dossier
 * est fermé, recalcul des totaux, et journalisation avec `changePar`. L'écran
 * ne fait qu'appeler — il ne reditige pas la règle. C'est le bon sens.
 *
 * Deux garde-fous côté écran, qui n'ont rien à voir avec le serveur :
 *
 *  - le bouton disparaît sans la permission, et non pas « désactivé » : un
 *    agent voit ce qu'il ne peut pas faire au lieu de Decodeur pourquoi il ne
 *    peut rien faire ;
 *  - chaque écriture invalide la fiche ET le journal. Sans cela, l'agent voit
 *    sa ligne changer puis, au rechargement, revenir à l'ancienne valeur.
 */
function LigneTravailEditable({ ligne, techniciens }: { ligne: any; techniciens: any[] }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [ouvert, setOuvert] = useState(false);
  const editable = hasPermission("or.modifier");

  const majStatut = api.or.updateLigne.useMutation({
    onSuccess: (r: any) => {
      if (!r?.success) toast.error("Mise à jour refusée.");
      else toast.success("Ligne mise à jour.");
      setOuvert(false);
      // La fiche ET le journal : sans ça, la ligne change puis « revient ».
      void utils.vehicules.get.invalidate();
      void utils.vehicules.journal.invalidate();
      void utils.or.getDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const enregistrer = (corps: Record<string, unknown>) => majStatut.mutate({ id: ligne.id, ...corps });

  return (
    <tr className="border-b border-border/50 align-middle">
      <td className="py-2 pr-3">
        <span className="font-medium text-foreground">{ligne.libelle}</span>
        {ligne.raisonBlocageLigne && (
          <div className="mt-0.5 text-[10px] text-warning-foreground">Bloquée : {ligne.raisonBlocageLigne}</div>
        )}
      </td>
      <td className="py-2 pr-3 text-right">{fmt(ligne.quantite)}</td>
      <td className="py-2 pr-3 text-right">{fmt(ligne.prixUnitaire)}</td>
      <td className="py-2 pr-3 text-right font-semibold">{fmt(Number(ligne.quantite) * Number(ligne.prixUnitaire))}</td>
      <td className="py-2">
        {ouvert && editable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={ligne.statut ?? "a_faire"}
              onChange={(e) => enregistrer({ statut: e.target.value })}
              disabled={majStatut.isPending}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {STATUTS_LIGNE.map((s) => (
                <option key={s} value={s}>{STATUTS_LIGNE_LIBELLES[s] ?? s}</option>
              ))}
            </select>
            <select
              value={ligne.technicienId ?? ""}
              onChange={(e) => enregistrer({ technicienId: e.target.value ? Number(e.target.value) : null })}
              disabled={majStatut.isPending}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              title="Technicien responsable"
            >
              <option value="">— Non attribué —</option>
              {techniciens.map((t: any) => (
                <option key={t.id} value={t.id}>{`${t.prenom ?? ""} ${t.nom ?? ""}`.trim()}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              ligne.statut === "fait" || ligne.statut === "valide" ? "bg-success/10 text-success-foreground"
              : ligne.statut === "en_cours" ? "bg-sky-500/10 text-sky-400" : "bg-muted text-muted-foreground"
            }`}>
              {STATUTS_LIGNE_LIBELLES[ligne.statut] ?? ligne.statut}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => setOuvert((o) => !o)}
                title="Modifier cette intervention"
                className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {ouvert ? "Fermer" : "Modifier"}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * MODIFIER UN CONSTAT DE DIAGNOSTIC — depuis la 360.
 *
 * Le constat se posait une fois, à la création. Un technicien qui se trompe de
 * formulation, ou qui complète après avoir vu la voiture sur le pont, devait
 * rouvrir un dossier. Il ne le fait pas — et le diagnostic reste faux.
 *
 * ## Un rapport VALIDÉ n'est pas modifiable, et l'écran le dit
 *
 * La machine ne permet aucune transition depuis `VALIDE` : valider engage la
 * responsabilité du validateur. Un rapport validé est donc hors de portée — et
 * l'interface le DIT au lieu d'afficher un bouton qui échouerait. Un bouton
 * qui refuse est pire que pas de bouton : l'agent retry, puis croit à un bug.
 *
 * ## Le statut ne se change pas ici
 *
 * Il passe par les transitions habituelles (soumettre / valider / retourner).
 * Deux portes sur la même machine d'états, et la machine n'en est plus une.
 */
function ModificateurDiagnostic({ rapport }: { rapport: any }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [ouvert, setOuvert] = useState(false);
  const editable = hasPermission("or.modifier");

  const vide = !rapport?.constat;
  const [constat, setConstat] = useState(rapport?.constat ?? "");
  const [cause, setCause] = useState(rapport?.cause ?? "");
  const [codesDTC, setCodesDTC] = useState(rapport?.codesDTC ?? "");
  const [tests, setTests] = useState(rapport?.tests ?? "");

  const sauver = api.or.modifierDiagnostic.useMutation({
    onSuccess: (r: any) => {
      if (!r?.modifie) {
        toast.info("Aucune modification à enregistrer.");
      } else {
        toast.success("Diagnostic mis à jour.");
      }
      setOuvert(false);
      void utils.vehicules.get.invalidate();
      void utils.vehicules.journal.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (vide || rapport?.statut === "VALIDE" || !editable) return null;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="ml-auto rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Modifier le constat
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3">
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Constat</label>
        <textarea
          value={constat}
          onChange={(e) => setConstat(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cause</label>
          <input value={cause} onChange={(e) => setCause(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Codes défaut (DTC)</label>
          <input value={codesDTC} onChange={(e) => setCodesDTC(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tests effectués</label>
        <input value={tests} onChange={(e) => setTests(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOuvert(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => sauver.mutate({ id: rapport.id, constat, cause, codesDTC, tests })}
          disabled={sauver.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {sauver.isPending && <Loader2 size={12} className="animate-spin" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, mono, warn }: { label: string; value: string | number | null | undefined; mono?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} ${warn ? "font-bold text-warning" : "text-foreground"}`}>{value ?? "—"}</p>
    </div>
  );
}
