"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  Ban,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Unlock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_LABELS: Record<string, string> = {
  PART: "Particulier",
  ENTR: "Entreprise",
  ADMIN: "Administration",
  ASSUR: "Assurance",
  FLOTTE: "Flotte",
  PROSP: "Prospect",
};

const STATUT_STYLE: Record<string, string> = {
  ACTIF: "bg-success/10 text-success-foreground",
  PROSPECT: "bg-sky-500/10 text-sky-400",
  INACTIF: "bg-muted text-muted-foreground",
  BLOQUE: "bg-destructive/10 text-destructive",
  ARCHIVE: "bg-muted text-muted-foreground line-through",
};

const EMPTY_FORM = {
  typeClient: "PART",
  civilite: "M",
  nom: "",
  prenom: "",
  raisonSociale: "",
  sigle: "",
  niuNif: "",
  rccm: "",
  compagnieAssurance: "",
  telephone: "",
  email: "",
  adresse: "",
  ville: "",
  delaiPaiementJours: 0,
  plafondCredit: "",
  remiseDefautPct: "",
  codeClient: "",
  contactNom: "",
  contactTel: "",
  contactEmail: "",
  contactFonction: "",
};

export function CustomersListClient() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = api.clients.list.useQuery({
    search: search || undefined,
    typeClient: typeFilter || undefined,
    statut: statutFilter || undefined,
    limit: 100,
  });
  const create = api.clients.create.useMutation({
    onSuccess: (r) => {
      toast.success(`Client ${r.codeClient} créé`);
      utils.clients.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });
  const changerStatut = api.clients.changerStatut.useMutation({
    onSuccess: (r) => {
      toast.success(`Statut mis à jour : ${r.statut}`);
      utils.clients.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (data?.clients ?? []) as unknown as Array<{
    id: number; codeClient: string | null; typeClient: string; statut: string;
    nom: string; prenom: string | null; raisonSociale: string | null;
    telephone: string | null; email: string | null; niuNif: string | null;
  }>;

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    list.forEach((c) => { s[c.typeClient] = (s[c.typeClient] ?? 0) + 1; });
    return s;
  }, [list]);

  const canModifier = hasPermission("clients.modifier") || hasPermission("clients.creer");

  const submit = () => {
    const payload: Record<string, unknown> = {
      typeClient: form.typeClient,
      civilite: form.typeClient === "PART" ? form.civilite : undefined,
      nom: form.typeClient === "PART" ? form.nom : undefined,
      prenom: form.typeClient === "PART" ? form.prenom : undefined,
      raisonSociale: ["ENTR", "ADMIN", "ASSUR", "FLOTTE"].includes(form.typeClient) ? form.raisonSociale : undefined,
      niuNif: ["ENTR", "ADMIN", "FLOTTE"].includes(form.typeClient) ? form.niuNif : undefined,
      rccm: ["ENTR", "ADMIN"].includes(form.typeClient) ? form.rccm : undefined,
      compagnieAssurance: form.typeClient === "ASSUR" ? form.compagnieAssurance : undefined,
      telephone: form.telephone || undefined,
      email: form.email || undefined,
      adresse: form.adresse || undefined,
      ville: form.ville || undefined,
      delaiPaiementJours: Number(form.delaiPaiementJours) || 0,
      plafondCredit: form.plafondCredit ? Number(form.plafondCredit) : undefined,
      remiseDefautPct: form.remiseDefautPct ? Number(form.remiseDefautPct) : undefined,
      codeClient: form.codeClient || undefined,
      contactPrincipal: form.contactNom ? {
        nom: form.contactNom,
        telephone: form.contactTel || undefined,
        email: form.contactEmail || undefined,
        fonction: form.contactFonction || undefined,
      } : undefined,
    };
    create.mutate(payload as any);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Particuliers, entreprises, administrations, assurances, flottes et prospects — source unique de vérité.
          </p>
        </div>
        {canModifier && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={16} /> Nouveau client
          </Button>
        )}
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{list.length} clients</span>
          {Object.entries(stats).map(([t, n]) => (
            <span key={t} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {TYPE_LABELS[t] ?? t} : {n}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, téléphone, code, NIU, raison sociale…"
            className="w-80 pl-9"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-background">{v}</option>)}
        </select>
        <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous les statuts</option>
          {["ACTIF", "PROSPECT", "INACTIF", "BLOQUE", "ARCHIVE"].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Client</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Contact</th>
              <th className="px-4 py-2.5 text-center">Statut</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                Aucun client. Créez votre premier client en 1 minute.
              </td></tr>
            ) : (
              list.map((c) => (
                <tr key={c.id} className="text-sm text-foreground hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:text-primary">
                      {c.typeClient === "PART" ? `${c.prenom ?? ""} ${c.nom}` : (c.raisonSociale ?? c.nom)}
                    </Link>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{c.codeClient}</span>
                    {c.niuNif && <span className="ml-2 text-[10px] text-muted-foreground">NIU {c.niuNif}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {TYPE_LABELS[c.typeClient] ?? c.typeClient}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {c.telephone ?? "—"}
                    {c.email && <span className="ml-2 truncate">{c.email}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_STYLE[c.statut] ?? STATUT_STYLE.ACTIF}`}>{c.statut}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/dashboard/customers/${c.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Fiche</Link>
                      {canModifier && c.statut === "ACTIF" && (
                        <button
                          onClick={() => changerStatut.mutate({ id: c.id, nouveauStatut: "BLOQUE", motif: "Blocage depuis la liste" })}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          title="Bloquer (impayés, litige)"
                        >
                          <Lock size={12} /> Bloquer
                        </button>
                      )}
                      {canModifier && c.statut === "BLOQUE" && (
                        <button
                          onClick={() => changerStatut.mutate({ id: c.id, nouveauStatut: "ACTIF", motif: "Déblocage depuis la liste" })}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-success-foreground hover:bg-success/10"
                        >
                          <Unlock size={12} /> Débloquer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Building2 size={18} className="text-primary" /> Nouveau client
              </h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-accent">✕</button>
            </div>

            <div className="mb-4">
              <Label className="text-xs text-muted-foreground">Type de client *</Label>
              <select value={form.typeClient} onChange={(e) => setForm({ ...form, typeClient: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {form.typeClient === "PART" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Civilité *</Label>
                  <select value={form.civilite} onChange={(e) => setForm({ ...form, civilite: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="M">M.</option><option value="Mme">Mme</option><option value="Dr">Dr</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Nom *</Label>
                  <Input className="mt-1" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Prénom *</Label>
                  <Input className="mt-1" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Téléphone principal *</Label>
                  <Input className="mt-1" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Raison sociale *</Label>
                    <Input className="mt-1" value={form.raisonSociale} onChange={(e) => setForm({ ...form, raisonSociale: e.target.value })} />
                  </div>
                  {form.typeClient !== "ASSUR" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">NIU / NIF *</Label>
                      <Input className="mt-1" value={form.niuNif} onChange={(e) => setForm({ ...form, niuNif: e.target.value })} />
                    </div>
                  )}
                  {["ENTR", "ADMIN"].includes(form.typeClient) && (
                    <div>
                      <Label className="text-xs text-muted-foreground">RCCM</Label>
                      <Input className="mt-1" value={form.rccm} onChange={(e) => setForm({ ...form, rccm: e.target.value })} />
                    </div>
                  )}
                  {form.typeClient === "ASSUR" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Compagnie d'assurance *</Label>
                      <Input className="mt-1" value={form.compagnieAssurance} onChange={(e) => setForm({ ...form, compagnieAssurance: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Téléphone *</Label>
                    <Input className="mt-1" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email *</Label>
                    <Input className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  {["ENTR", "ADMIN", "FLOTTE"].includes(form.typeClient) && (
                    <div className="col-span-2 rounded-lg border border-dashed border-border p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact principal (obligatoire)</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input placeholder="Nom du contact" value={form.contactNom} onChange={(e) => setForm({ ...form, contactNom: e.target.value })} />
                        <Input placeholder="Fonction" value={form.contactFonction} onChange={(e) => setForm({ ...form, contactFonction: e.target.value })} />
                        <Input placeholder="Téléphone" value={form.contactTel} onChange={(e) => setForm({ ...form, contactTel: e.target.value })} />
                        <Input placeholder="Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Adresse</Label>
                <Input className="mt-1" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ville</Label>
                <Input className="mt-1" value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Délai de paiement (jours)</Label>
                <select value={form.delaiPaiementJours} onChange={(e) => setForm({ ...form, delaiPaiementJours: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value={0}>Comptant (0 j)</option>
                  <option value={7}>7 jours</option>
                  <option value={15}>15 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={45}>45 jours</option>
                  <option value={60}>60 jours</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Plafond de crédit (FCFA)</Label>
                <Input type="number" min={0} className="mt-1" value={form.plafondCredit} onChange={(e) => setForm({ ...form, plafondCredit: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Remise par défaut (%)</Label>
                <Input type="number" min={0} step="0.5" className="mt-1" value={form.remiseDefautPct} onChange={(e) => setForm({ ...form, remiseDefautPct: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Code client (optionnel — auto sinon)</Label>
                <Input className="mt-1" value={form.codeClient} onChange={(e) => setForm({ ...form, codeClient: e.target.value })} placeholder="CLT-2026-XXXX" />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={submit} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
                Créer le client
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}