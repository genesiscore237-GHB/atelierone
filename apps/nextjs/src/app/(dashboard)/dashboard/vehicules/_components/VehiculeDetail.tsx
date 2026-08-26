"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  ArrowLeft, Car, FileSignature, Gauge, History, Phone, User, Wrench, ClipboardList,
  PackageSearch, Receipt, Camera, AlertTriangle, CalendarClock, Timer, MapPin, ChevronRight, Loader2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { transitionStatutVehiculeValide, STATUT_LABELS, STATUT_STYLE, STATUTS_IMMOBILISATION } from "~/server/lib/vehicule-service";
import { STATUT_LABELS as OR_STATUT_LABELS, STATUT_BADGE as OR_STATUT_BADGE, PRIORITE_META, MOTIF_ENTREE_LABELS } from "~/server/lib/atelier-service";
import { usePermissions } from "~/hooks/usePermissions";

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

export function VehiculeDetail({ id }: { id: string }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.vehicules.get.useQuery({ id: Number(id) });
  const { data: clientsData } = api.clients.list.useQuery({ statut: "ACTIF", limit: 200 });
  const { data: contratsData } = api.vehicules.listContratsActifs.useQuery();
  const [tab, setTab] = useState("Vue d'ensemble");
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
      timeline: (data.timeline ?? []) as any[],
      historiqueOR: (data.historiqueOR ?? []) as any[],
      autresVehicules: (data.autresVehicules ?? []) as any[],
      contrats: (data.contrats ?? []) as any[],
    };
  }, [data]);

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data360) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Véhicule introuvable.</p>
        <Link href="/dashboard/vehicules" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft size={14} /> Retour au parc
        </Link>
      </div>
    );
  }

  const { vehicule: v, client, orCourant, responsable, rapport, travaux, demandes, retours, orTermine, facture, factureLignes, photos, alertes, timeline, historiqueOR, autresVehicules, contrats } = data360;
  const clientsList = (clientsData?.clients ?? []) as any[];
  const contratsActifs = (contratsData ?? []) as any[];
  const canModifier = hasPermission("vehicules.modifier");

  const transitions = STATUTS_IMMOBILISATION.filter((s) => transitionStatutVehiculeValide(v.statutImmobilisation, s));
  const displayName = client ? (client.raisonSociale ?? `${client.prenom ?? ""} ${client.nom}`) : null;
  const estFlotte = client?.typeClient === "FLOTTE";
  const joursGarage = orCourant ? joursEntre(orCourant.dateOuverture) : null;
  const joursPromesse = orCourant?.datePromesse ? joursEntre(orCourant.datePromesse) : null;
  const prioMeta = orCourant?.priorite ? PRIORITE_META[orCourant.priorite as keyof typeof PRIORITE_META] : null;
  const devisRefuse = timeline.find((t: any) => t.type === "VALIDATION_DEVIS" && (t.commentaire ?? "").startsWith("Devis refusé"));

  const tabs = Object.keys(TAB_ICONS);
  const Icon = TAB_ICONS[tab];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/vehicules" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-mono text-xl font-bold tracking-tight text-foreground">
              <Car size={18} className="text-primary" /> {v.immatriculation}
            </h1>
            <p className="text-xs text-muted-foreground">
              {v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ""}{v.couleur ? ` · ${v.couleur}` : ""}
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
                    <Link href={`/dashboard/ordres-reparation?or=${orCourant.id}`}>
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
                <Field label="Année" value={v.annee} />
                <Field label="Couleur" value={v.couleur} />
                <Field label="N° châssis" value={v.numeroChassis} />
                <Field label="Kilométrage" value={v.kilometrage !== null && v.kilometrage !== undefined ? `${v.kilometrage.toLocaleString("fr-FR")} km` : "—"} />
                <Field label="Carburant" value={v.carburant} />
                <Field label="Type" value={v.typeVehicule} />
                <Field label="Enregistré le" value={fmtDate(v.createdAt)} />
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
                        <tr key={l.id} className="border-b border-border/50">
                          <td className="py-2 pr-3">{l.libelle}</td>
                          <td className="py-2 pr-3 text-right">{fmt(l.quantite)}</td>
                          <td className="py-2 pr-3 text-right">{fmt(l.prixUnitaire)}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{fmt(Number(l.quantite) * Number(l.prixUnitaire))}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              l.statut === "fait" || l.statut === "valide" ? "bg-success/10 text-success-foreground"
                              : l.statut === "en_cours" ? "bg-sky-500/10 text-sky-400" : "bg-muted text-muted-foreground"
                            }`}>{l.statut}</span>
                          </td>
                        </tr>
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
                  <p className="mt-1 text-xs text-muted-foreground">{devisRefuse.commentaire}</p>
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
                  <Link href={`/dashboard/ordres-reparation?or=${orCourant.id}`}>
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
          </div>
        )}

        {/* ═══════ HISTORIQUE ═══════ */}
        {tab === "Historique" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <CalendarClock size={14} className="text-primary" /> Événements de l'OR en cours ({timeline.length})
              </h3>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement tracé.</p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((t: any, i: number) => (
                    <div key={t.id} className="relative pb-4 pl-5">
                      {i < timeline.length - 1 && <span className="absolute left-[5px] top-2 h-full w-px bg-border" />}
                      <span className="absolute left-0 top-1.5 size-2.5 rounded-full bg-primary" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{fmtDate(t.changeLe ?? t.createdAt)} · {t.type}</p>
                      <p className="text-xs text-foreground">
                        {t.ancienneValeur && <span className="text-muted-foreground line-through">{t.ancienneValeur}</span>}
                        {t.ancienneValeur && t.nouvelleValeur && <span className="text-muted-foreground"> → </span>}
                        {t.nouvelleValeur && <span className="font-semibold">{t.nouvelleValeur}</span>}
                        {t.commentaire && <span className="text-muted-foreground"> — {t.commentaire}</span>}
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