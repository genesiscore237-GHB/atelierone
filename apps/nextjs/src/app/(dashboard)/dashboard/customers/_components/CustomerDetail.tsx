"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  ArrowLeft,
  Ban,
  Check,
  FileSignature,
  History,
  Lock,
  MapPin,
  MessageSquarePlus,
  Phone,
  Plus,
  Unlock,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_LABELS: Record<string, string> = {
  PART: "Particulier", ENTR: "Entreprise", ADMIN: "Administration", ASSUR: "Assurance", FLOTTE: "Flotte", PROSP: "Prospect",
};
const STATUT_STYLE: Record<string, string> = {
  ACTIF: "bg-success/10 text-success-foreground",
  PROSPECT: "bg-sky-500/10 text-sky-400",
  INACTIF: "bg-muted text-muted-foreground",
  BLOQUE: "bg-destructive/10 text-destructive",
  ARCHIVE: "bg-muted text-muted-foreground line-through",
};

const TABS = [
  { id: "identite", label: "Identité", icon: Users },
  { id: "contacts", label: "Contacts", icon: Phone },
  { id: "adresses", label: "Adresses", icon: MapPin },
  { id: "contrats", label: "Contrats", icon: FileSignature },
  { id: "vehicules", label: "Véhicules", icon: Ban },
  { id: "interactions", label: "Interactions", icon: MessageSquarePlus },
  { id: "historique", label: "Historique", icon: History },
] as const;

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

export function CustomerDetail({ id }: { id: string }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("identite");
  const { data, isLoading, isError, refetch } = api.clients.get.useQuery({ id: Number(id) });
  const [contactForm, setContactForm] = useState({ nom: "", telephone: "", email: "", fonction: "" });
  const [interForm, setInterForm] = useState({ type: "APPEL", sujet: "", contenu: "" });
  const [statutMotif, setStatutMotif] = useState("");
  const [confirmStatut, setConfirmStatut] = useState<{ vers: string } | null>(null);

  const changerStatut = api.clients.changerStatut.useMutation({
    onSuccess: (r) => { toast.success(`Client ${r.statut}`); utils.clients.get.invalidate(); utils.clients.list.invalidate(); setConfirmStatut(null); setStatutMotif(""); },
    onError: (e) => toast.error(e.message),
  });
  const archiver = api.clients.archiver.useMutation({
    onSuccess: () => { toast.success("Client archivé"); utils.clients.get.invalidate(); utils.clients.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addContact = api.clients.addContact.useMutation({
    onSuccess: () => { toast.success("Contact ajouté"); utils.clients.get.invalidate(); setContactForm({ nom: "", telephone: "", email: "", fonction: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const addInter = api.clients.addInteraction.useMutation({
    onSuccess: () => { toast.success("Interaction enregistrée"); utils.clients.get.invalidate(); setInterForm({ type: "APPEL", sujet: "", contenu: "" }); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Client introuvable.</p>
        <Link href="/dashboard/customers" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft size={14} /> Retour à la liste
        </Link>
      </div>
    );
  }

  const c = data.client as unknown as {
    id: number; codeClient: string | null; typeClient: string; statut: string;
    civilite: string | null; nom: string; prenom: string | null; raisonSociale: string | null;
    niuNif: string | null; rccm: string | null; sigle: string | null;
    compagnieAssurance: string | null; numeroPolice: string | null; numeroSinistre: string | null;
    telephone: string | null; telephoneSecondaire: string | null; email: string | null;
    adresse: string | null; ville: string | null; delaiPaiementJours: number | null;
    plafondCredit: string | null; remiseDefautPct: string | null; notesInternes: string | null;
  };
  const contacts = (data.contacts ?? []) as any[];
  const adresses = (data.adresses ?? []) as any[];
  const contrats = (data.contrats ?? []) as any[];
  const vehicules = (data.vehiculesClient ?? []) as any[];
  const interactions = (data.interactions ?? []) as any[];
  const historique = (data.historique ?? []) as any[];
  const solde = Number(data.solde ?? 0);

  const displayName = c.typeClient === "PART" ? `${c.prenom ?? ""} ${c.nom}` : (c.raisonSociale ?? c.nom);
  const canModifier = hasPermission("clients.modifier");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/customers" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{c.codeClient}</span>
              {" · "}{TYPE_LABELS[c.typeClient] ?? c.typeClient}
              {c.niuNif && ` · NIU ${c.niuNif}`}
              {c.rccm && ` · RCCM ${c.rccm}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUT_STYLE[c.statut] ?? ""}`}>{c.statut}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-bold text-warning-foreground">
            <Wallet size={11} /> Solde : {fmtFCFA(solde)} F
          </span>
          {canModifier && c.statut === "ACTIF" && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmStatut({ vers: "BLOQUE" })}>
              <Lock size={13} /> Bloquer
            </Button>
          )}
          {canModifier && c.statut === "BLOQUE" && (
            <Button size="sm" variant="outline" className="text-success-foreground" onClick={() => changerStatut.mutate({ id: c.id, nouveauStatut: "ACTIF", motif: "Déblocage" })}>
              <Unlock size={13} /> Débloquer
            </Button>
          )}
          {canModifier && c.statut === "PROSPECT" && (
            <Button size="sm" onClick={() => changerStatut.mutate({ id: c.id, nouveauStatut: "ACTIF", motif: "Conversion prospect → client" })}>
              <Check size={13} /> Convertir en client
            </Button>
          )}
          {canModifier && c.statut !== "ARCHIVE" && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => archiver.mutate({ id: c.id })}>
              Archiver
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {tab === "identite" && (
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {c.typeClient === "PART" ? (
              <>
                <Field label="Civilité" value={c.civilite} />
                <Field label="Nom" value={c.nom} />
                <Field label="Prénom" value={c.prenom} />
              </>
            ) : (
              <>
                <Field label="Raison sociale" value={c.raisonSociale} />
                <Field label="Sigle" value={c.sigle} />
                <Field label="NIU / NIF" value={c.niuNif} />
                <Field label="RCCM" value={c.rccm} />
                {c.typeClient === "ASSUR" && (
                  <>
                    <Field label="Compagnie" value={c.compagnieAssurance} />
                    <Field label="Police" value={c.numeroPolice} />
                    <Field label="Sinistre" value={c.numeroSinistre} />
                  </>
                )}
              </>
            )}
            <Field label="Téléphone" value={c.telephone} />
            <Field label="Téléphone 2" value={c.telephoneSecondaire} />
            <Field label="Email" value={c.email} />
            <Field label="Adresse" value={c.adresse} />
            <Field label="Ville" value={c.ville} />
            <Field label="Délai de paiement" value={c.delaiPaiementJours ? `${c.delaiPaiementJours} j` : "Comptant"} />
            <Field label="Plafond de crédit" value={c.plafondCredit ? `${fmtFCFA(c.plafondCredit)} F` : "0 F"} />
            <Field label="Remise défaut" value={c.remiseDefautPct ? `${c.remiseDefautPct} %` : "0 %"} />
            {c.notesInternes && <Field label="Notes internes" value={c.notesInternes} />}
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-3">
            {contacts.length === 0 && <p className="text-sm text-muted-foreground">Aucun contact.</p>}
            {contacts.map((ct: any) => (
              <div key={ct.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{ct.prenom ? `${ct.prenom} ` : ""}{ct.nom}</span>
                  {ct.estContactPrincipal && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Principal</span>}
                  {ct.estContactFacturation && <span className="ml-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-foreground">Facturation</span>}
                  <div className="text-xs text-muted-foreground">
                    {ct.fonction && <span>{ct.fonction} · </span>}
                    {ct.telephone && <span>{ct.telephone} · </span>}
                    {ct.email}
                  </div>
                </div>
              </div>
            ))}
            {canModifier && (
              <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ajouter un contact</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Input placeholder="Nom *" value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} />
                  <Input placeholder="Fonction" value={contactForm.fonction} onChange={(e) => setContactForm({ ...contactForm, fonction: e.target.value })} />
                  <Input placeholder="Téléphone" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} />
                  <Input placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                </div>
                <Button
                  size="sm"
                  className="mt-3 gap-1.5"
                  disabled={!contactForm.nom.trim()}
                  onClick={() => addContact.mutate({ clientId: c.id, nom: contactForm.nom.trim(), telephone: contactForm.telephone || undefined, email: contactForm.email || undefined, fonction: contactForm.fonction || undefined, estContactPrincipal: contacts.length === 0 })}
                >
                  <UserPlus size={14} /> Ajouter
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "adresses" && (
          <div className="space-y-2">
            {adresses.length === 0 && <p className="text-sm text-muted-foreground">Aucune adresse.</p>}
            {adresses.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{a.type}</span>
                  <span className="ml-2">{a.ligne1}{a.quartier ? `, ${a.quartier}` : ""}{a.ville ? `, ${a.ville}` : ""}{a.pays ? `, ${a.pays}` : ""}</span>
                  {a.estPrincipale && <span className="ml-2 text-[10px] font-bold uppercase text-primary">Principale</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "contrats" && (
          <div className="space-y-2">
            {contrats.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground">Aucun contrat de maintenance.</p>
                <Link href="/dashboard/contrats" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <Plus size={14} /> Créer un contrat
                </Link>
              </div>
            )}
            {contrats.map((ct: any) => (
              <div key={ct.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{ct.libelle}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{ct.numeroContrat}</span>
                  <div className="text-xs text-muted-foreground">{ct.dateDebut} → {ct.dateFin ?? "tacite reconduction"}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  ct.statut === "ACTIF" ? "bg-success/10 text-success-foreground"
                  : ct.statut === "SUSPENDU" ? "bg-warning/10 text-warning-foreground"
                  : ct.statut === "RESILIE" ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
                }`}>{ct.statut}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "vehicules" && (
          <div className="space-y-2">
            {vehicules.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule lié.</p>}
            {vehicules.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span className="font-mono font-semibold">{v.immatriculation}</span>
                <span className="text-muted-foreground">{v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ""}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "interactions" && (
          <div className="space-y-3">
            {interactions.length === 0 && <p className="text-sm text-muted-foreground">Aucune interaction enregistrée.</p>}
            {interactions.map((i: any) => (
              <div key={i.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{i.type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(i.dateHeure).toLocaleString("fr-FR")}</span>
                </div>
                {i.sujet && <p className="mt-1 font-medium">{i.sujet}</p>}
                {i.contenu && <p className="text-xs text-muted-foreground">{i.contenu}</p>}
              </div>
            ))}
            {canModifier && (
              <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nouvelle interaction</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <select value={interForm.type} onChange={(e) => setInterForm({ ...interForm, type: e.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
                    {["APPEL", "VISITE", "EMAIL", "RELANCE", "RECLAMATION", "AUTRE"].map((t) => <option key={t} value={t} className="bg-background">{t}</option>)}
                  </select>
                  <Input placeholder="Sujet" value={interForm.sujet} onChange={(e) => setInterForm({ ...interForm, sujet: e.target.value })} />
                  <Input placeholder="Contenu" value={interForm.contenu} onChange={(e) => setInterForm({ ...interForm, contenu: e.target.value })} />
                </div>
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => addInter.mutate({ clientId: c.id, type: interForm.type as any, sujet: interForm.sujet || undefined, contenu: interForm.contenu || undefined })}>
                  <MessageSquarePlus size={14} /> Enregistrer
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "historique" && (
          <div className="space-y-2">
            {historique.length === 0 && <p className="text-sm text-muted-foreground">Aucun changement de statut.</p>}
            {historique.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs">{h.ancienStatut ?? "—"} → <b>{h.nouveauStatut}</b></span>
                  {h.motif && <span className="ml-2 text-muted-foreground">· {h.motif}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(h.changeLe).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmStatut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmStatut(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Lock size={16} className="text-destructive" /> Bloquer ce client
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {displayName} ne pourra plus ouvrir d'ordre de réparation tant qu'il est bloqué.
            </p>
            <Label className="mt-4 block text-xs text-muted-foreground">Motif (obligatoire)</Label>
            <Input className="mt-1" value={statutMotif} onChange={(e) => setStatutMotif(e.target.value)} placeholder="Impayés, litige…" />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmStatut(null)}>Annuler</Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!statutMotif.trim()}
                onClick={() => changerStatut.mutate({ id: c.id, nouveauStatut: "BLOQUE", motif: statutMotif.trim() })}
              >
                Bloquer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}