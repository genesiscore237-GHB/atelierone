"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { DashboardShell } from "~/components/ui/dashboard-shell";
import { motion } from "framer-motion";
import { Building2, Store, Users, Plus, Trash2, Banknote, ShieldCheck, UserCheck, Search, Save, Loader2, X, Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

const tabs = [
  { id: "organization", label: "Organisation", icon: Building2 },
  { id: "pos", label: "Points de Vente", icon: Store },
  { id: "caisses", label: "Caisses", icon: Banknote },
  { id: "team", label: "Équipe", icon: Users },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("organization");

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground dark:text-foreground">Paramètres</h1>
        <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">Configurez votre organisation et gérez votre équipe</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-muted p-1 dark:bg-muted/50 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all
              ${activeTab === tab.id
                ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
                : "text-muted-foreground hover:text-foreground/80 dark:text-muted-foreground dark:hover:text-foreground"
              }
            `}
          >
            <tab.icon size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "organization" && <OrganizationTab />}
        {activeTab === "pos" && <POSTab />}
        {activeTab === "caisses" && <CaissesTab />}
        {activeTab === "team" && <TeamTab />}
      </motion.div>
    </DashboardShell>
  );
}

const CHAMP_LABELS: Record<string, { label: string; hint: string }> = {
  telephone: { label: "Téléphone", hint: "Facture et ticket" },
  email: { label: "Email", hint: "Facture et ticket" },
  identifiantsLegaux: { label: "Identifiants légaux", hint: "RC, NIU, IFU, Capital" },
  slogan: { label: "Slogan", hint: "Sous le nom" },
  ville: { label: "Adresse complète", hint: "Adresse + ville" },
  operateur: { label: "Opérateur", hint: "Facture A4" },
  caisse: { label: "Caisse", hint: "Facture A4" },
  remise: { label: "Remise", hint: "Ligne remise" },
  tva: { label: "TVA", hint: "Mention TVA incluse" },
  logoTicket: { label: "Logo sur ticket", hint: "Ticket 80 mm" },
};

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 dark:bg-muted dark:border-border dark:text-foreground";

function OrganizationTab() {
  const { data: org, isLoading } = api.settings.organization.get.useQuery();
  const utils = api.useUtils();
  const { user } = usePermissions();
  const canEdit = user?.role === "superadmin";
  const [synced, setSynced] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [form, setForm] = useState({
    nom: "", slogan: "", adresse: "", ville: "", pays: "", telephone: "", email: "", siteWeb: "",
    rcRccm: "", niu: "", ifu: "", capital: "", devise: "XAF", tvaDefaut: "0", margeDefautManuels: "25", prefixeFacture: "PF",
    mentionPiedFacture: "", mentionPiedTicket: "", politiqueRetour: "", logoUrl: "",
  });
  const [champs, setChamps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (org && !synced) {
      setForm({
        nom: org.nom ?? "",
        slogan: org.slogan ?? "",
        adresse: org.adresse ?? "",
        ville: org.ville ?? "",
        pays: org.pays ?? "",
        telephone: org.telephone ?? "",
        email: org.email ?? "",
        siteWeb: org.siteWeb ?? "",
        rcRccm: org.rcRccm ?? "",
        niu: org.niu ?? "",
        ifu: org.ifu ?? "",
        capital: org.capital ?? "",
        devise: org.devise ?? "XAF",
        tvaDefaut: String(org.tvaDefaut ?? 0),
        margeDefautManuels: String(org.margeDefautManuels ?? 25),
        prefixeFacture: org.prefixeFacture ?? "PF",
        mentionPiedFacture: org.mentionPiedFacture ?? "",
        mentionPiedTicket: org.mentionPiedTicket ?? "",
        politiqueRetour: org.politiqueRetour ?? "",
        logoUrl: org.logoUrl ?? "",
      });
      setChamps({ ...org.champsVisibles });
      setSynced(true);
    }
  }, [org, synced]);

  const updateMutation = api.settings.organization.update.useMutation({
    onSuccess: () => {
      utils.settings.organization.get.invalidate();
      toast.success("Paramètres de l'organisation enregistrés");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetMutation = api.settings.organization.resetFactureConfig.useMutation({
    onSuccess: () => {
      utils.settings.organization.get.invalidate();
      setSynced(false);
      setConfirmReset(false);
      toast.success("Configuration de facturation réinitialisée");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3_000_000) {
      toast.error("Logo trop volumineux (max 3 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (url.startsWith("data:image/")) setForm((f) => ({ ...f, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  const isDirty =
    !!org &&
    (form.nom !== (org.nom ?? "") ||
      form.slogan !== (org.slogan ?? "") ||
      form.adresse !== (org.adresse ?? "") ||
      form.ville !== (org.ville ?? "") ||
      form.pays !== (org.pays ?? "") ||
      form.telephone !== (org.telephone ?? "") ||
      form.email !== (org.email ?? "") ||
      form.siteWeb !== (org.siteWeb ?? "") ||
      form.rcRccm !== (org.rcRccm ?? "") ||
      form.niu !== (org.niu ?? "") ||
      form.ifu !== (org.ifu ?? "") ||
      form.capital !== (org.capital ?? "") ||
      form.devise !== (org.devise ?? "XAF") ||
      form.tvaDefaut !== String(org.tvaDefaut ?? 0) ||
      form.margeDefautManuels !== String(org.margeDefautManuels ?? 25) ||
      form.prefixeFacture !== (org.prefixeFacture ?? "PF") ||
      form.mentionPiedFacture !== (org.mentionPiedFacture ?? "") ||
      form.mentionPiedTicket !== (org.mentionPiedTicket ?? "") ||
      form.politiqueRetour !== (org.politiqueRetour ?? "") ||
      form.logoUrl !== (org.logoUrl ?? "") ||
      JSON.stringify(champs) !== JSON.stringify(org.champsVisibles ?? {}));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !isDirty || !canEdit) return;
    updateMutation.mutate({
      nom: form.nom.trim(),
      slogan: form.slogan.trim() || null,
      adresse: form.adresse.trim(),
      ville: form.ville.trim(),
      pays: form.pays.trim(),
      telephone: form.telephone.trim(),
      email: form.email.trim(),
      siteWeb: form.siteWeb.trim() || null,
      rcRccm: form.rcRccm.trim() || null,
      niu: form.niu.trim() || null,
      ifu: form.ifu.trim() || null,
      capital: form.capital.trim() || null,
      devise: form.devise,
      tvaDefaut: Number(form.tvaDefaut) || 0,
      margeDefautManuels: Number(form.margeDefautManuels) || 25,
      prefixeFacture: form.prefixeFacture.trim() || "PF",
      mentionPiedFacture: form.mentionPiedFacture.trim() || null,
      mentionPiedTicket: form.mentionPiedTicket.trim() || null,
      politiqueRetour: form.politiqueRetour.trim() || null,
      logoUrl: form.logoUrl || null,
      champsVisibles: champs,
    });
  };

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-muted dark:bg-muted" />;

  const apercuAdresse = [form.adresse, form.ville].filter(Boolean).join(", ");
  const apercuLegaux = [
    form.rcRccm ? `RC: ${form.rcRccm}` : "",
    form.niu ? `NIU: ${form.niu}` : "",
    form.ifu ? `IFU: ${form.ifu}` : "",
    form.capital ? `Capital: ${form.capital}` : "",
  ].filter(Boolean).join(" | ");
  const apercuContact = [
    form.telephone ? `Tel: ${form.telephone}` : "",
    form.email ? `Email: ${form.email}` : "",
    form.siteWeb || "",
  ].filter(Boolean).join(" | ");

  return (
    <div className="space-y-5">
      {!canEdit && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Lecture seule : la modification des paramètres de l&apos;organisation est réservée à l&apos;administrateur réseau.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Identité */}
        <section className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-1">Identité</h3>
          <p className="text-xs text-muted-foreground mb-4">Nom, slogan, coordonnées et logo — affichés sur vos documents.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Logo</label>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="h-14 w-14 rounded-lg border border-border object-contain dark:border-border bg-muted/50" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground dark:bg-muted">
                    <Building2 size={22} />
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 hover:bg-accent/30 dark:border-border dark:text-foreground/80 dark:hover:bg-accent transition-colors">
                    <Upload size={13} />
                    {form.logoUrl ? "Changer le logo" : "Téléverser un logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={!canEdit} />
                  </label>
                  {form.logoUrl && (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 dark:border-border transition-colors disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">PNG / JPEG, 3 Mo maximum.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nom *</label>
              <input className={inputCls} value={form.nom} onChange={set("nom")} readOnly={!canEdit} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Slogan</label>
              <input className={inputCls} value={form.slogan} onChange={set("slogan")} readOnly={!canEdit} placeholder="Librairie & Papeterie" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Adresse</label>
              <input className={inputCls} value={form.adresse} onChange={set("adresse")} readOnly={!canEdit} placeholder="125 Rue de la Paix, Bonanjo" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Ville</label>
              <input className={inputCls} value={form.ville} onChange={set("ville")} readOnly={!canEdit} placeholder="Douala" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Pays</label>
              <input className={inputCls} value={form.pays} onChange={set("pays")} readOnly={!canEdit} placeholder="Cameroun" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Téléphone</label>
              <input className={inputCls} value={form.telephone} onChange={set("telephone")} readOnly={!canEdit} placeholder="+237 ..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input type="email" className={inputCls} value={form.email} onChange={set("email")} readOnly={!canEdit} placeholder="contact@..." />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Site web</label>
              <input className={inputCls} value={form.siteWeb} onChange={set("siteWeb")} readOnly={!canEdit} placeholder="https://..." />
            </div>
          </div>
        </section>

        {/* Identifiants légaux */}
        <section className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-1">Identifiants légaux</h3>
          <p className="text-xs text-muted-foreground mb-4">Affichés sur les factures et tickets (si activés dans Documents).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">RC / RCCM</label>
              <input className={inputCls} value={form.rcRccm} onChange={set("rcRccm")} readOnly={!canEdit} placeholder="RC/DLA/2025/B/1234" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">NIU</label>
              <input className={inputCls} value={form.niu} onChange={set("niu")} readOnly={!canEdit} placeholder="M0123456789123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">IFU</label>
              <input className={inputCls} value={form.ifu} onChange={set("ifu")} readOnly={!canEdit} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Capital</label>
              <input className={inputCls} value={form.capital} onChange={set("capital")} readOnly={!canEdit} placeholder="1 000 000 FCFA" />
            </div>
          </div>
        </section>

        {/* Facturation */}
        <section className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-1">Facturation</h3>
          <p className="text-xs text-muted-foreground mb-4">Devise, TVA et préfixe des références de pré-factures.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Devise</label>
              <select className={inputCls} value={form.devise} onChange={set("devise")} disabled={!canEdit}>
                <option value="XAF">XAF (FCFA)</option>
                <option value="CFA">CFA</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">TVA par défaut (%)</label>
              <input type="number" min={0} max={100} step="any" className={inputCls} value={form.tvaDefaut} onChange={set("tvaDefaut")} readOnly={!canEdit} placeholder="19.25" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Marge manuels (%)</label>
              <input type="number" min={0} max={100} step="any" className={inputCls} value={form.margeDefautManuels} onChange={set("margeDefautManuels")} readOnly={!canEdit} placeholder="25" title="Remise fournisseur par défaut sur les manuels scolaires : prix d'achat = prix homologué − remise" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Préfixe facture</label>
              <input className={inputCls} value={form.prefixeFacture} onChange={set("prefixeFacture")} readOnly={!canEdit} placeholder="PF" />
            </div>
          </div>
        </section>

        {/* Documents */}
        <section className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-1">Documents</h3>
          <p className="text-xs text-muted-foreground mb-4">Mentions imprimées et champs affichés sur la facture A4 et le ticket 80 mm.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mention pied de facture</label>
              <textarea rows={2} className={`${inputCls} resize-none`} value={form.mentionPiedFacture} onChange={set("mentionPiedFacture")} readOnly={!canEdit} placeholder="Merci de votre visite !" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mention pied de ticket</label>
              <textarea rows={2} className={`${inputCls} resize-none`} value={form.mentionPiedTicket} onChange={set("mentionPiedTicket")} readOnly={!canEdit} placeholder="Marchandise vendue ne peut être reprise ni échangée" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Politique de retour</label>
              <textarea rows={2} className={`${inputCls} resize-none`} value={form.politiqueRetour} onChange={set("politiqueRetour")} readOnly={!canEdit} />
            </div>
          </div>
          <div className="border-t border-border dark:border-border mt-5 pt-5">
            <p className="text-xs font-medium text-muted-foreground mb-3">Champs affichés sur les documents</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(CHAMP_LABELS).map(([key, cfg]) => (
                <label key={key} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border border-border dark:border-border ${canEdit ? "cursor-pointer hover:bg-muted/40" : ""}`}>
                  <div>
                    <p className="text-sm font-medium text-foreground dark:text-foreground">{cfg.label}</p>
                    <p className="text-[11px] text-muted-foreground">{cfg.hint}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setChamps((c) => ({ ...c, [key]: !(c[key] ?? false) }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${champs[key] ? "bg-success" : "bg-muted"} ${canEdit ? "" : "opacity-50"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-foreground transition-transform ${champs[key] ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Aperçu */}
        <section className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <h3 className="text-sm font-semibold text-foreground dark:text-foreground mb-4">Aperçu de l&apos;en-tête</h3>
          <div className="rounded-lg border border-dashed border-border p-4 dark:border-border">
            <div className="flex items-center gap-3 mb-2">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="h-10 w-10 shrink-0 rounded-lg object-contain border border-border dark:border-border" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-foreground">
                  <Building2 size={18} />
                </div>
              )}
              <div>
                <p className="text-sm font-bold uppercase tracking-tight text-foreground">{form.nom || "Nom de l'organisation"}</p>
                {form.slogan && <p className="text-[11px] text-primary font-medium">{form.slogan}</p>}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-px">
              {apercuAdresse && <p>{apercuAdresse}</p>}
              {apercuContact && <p>{apercuContact}</p>}
              {apercuLegaux && <p>{apercuLegaux}</p>}
              {!apercuAdresse && !apercuContact && !apercuLegaux && <p>Vos coordonnées apparaîtront ici.</p>}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {canEdit && (
            <>
              {confirmReset ? (
                <>
                  <span className="text-xs text-destructive font-medium">Réinitialiser la configuration de facturation ?</span>
                  <button
                    type="button"
                    disabled={resetMutation.isPending}
                    onClick={() => resetMutation.mutate()}
                    className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {resetMutation.isPending ? "Réinitialisation..." : "Confirmer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 hover:bg-accent/30 dark:border-border dark:text-foreground/80 transition-colors"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 dark:border-border transition-colors"
                >
                  <RotateCcw size={14} />
                  Réinitialiser la facturation
                </button>
              )}
              <button
                type="submit"
                disabled={!isDirty || updateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function POSTab() {
  const { data: posList, isLoading } = api.settings.pos.list.useQuery();
  const utils = api.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", address: "" });

  const createMutation = api.settings.pos.create.useMutation({
    onSuccess: () => {
      utils.settings.pos.list.invalidate();
      setShowForm(false);
      setFormData({ name: "", address: "" });
    },
    onError: (e) => alert(e.message),
  });

  const deleteMutation = api.settings.pos.delete.useMutation({
    onSuccess: () => utils.settings.pos.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground dark:text-foreground">Points de Vente</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <form
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}
            className="flex gap-3 flex-wrap"
          >
            <input
              placeholder="Nom du PDV"
              className="flex-1 min-w-[200px] rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <input
              placeholder="Adresse (optionnel)"
              className="flex-1 min-w-[200px] rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Créer
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted dark:bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posList?.map((pos: NonNullable<typeof posList>[number]) => (
            <div
              key={pos.id}
              className="rounded-xl border border-border bg-background p-5 dark:border-border dark:bg-card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground dark:text-foreground">{pos.name}</h3>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">{pos.address ?? "Aucune adresse"}</p>
                  <span className={`inline-block mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pos.status === "active" ? "bg-success/20 text-success-foreground dark:bg-success/10 dark:text-success-foreground" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                  }`}>
                    {pos.status === "active" ? "Actif" : "Inactif"}
                  </span>
                </div>
                <button
                  onClick={() => { if (confirm("Supprimer ce point de vente ?")) deleteMutation.mutate({ id: pos.id }); }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {posList?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground dark:text-muted-foreground">
              Aucun point de vente configuré
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamTab() {
  const { data: members, isLoading } = api.user.list.useQuery();
  const utils = api.useUtils();

  const removeMutation = api.user.deactivate.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground dark:text-foreground">Membres de l&apos;équipe</h2>
        <Link
          href="/dashboard/governance"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Inviter
        </Link>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <p className="text-xs text-blue-600 dark:text-blue-400">
          La création d&apos;utilisateurs suit le processus : <strong>RH → créer l&apos;employé</strong> puis <strong>Gouvernance → inviter</strong>.
          L&apos;utilisateur crée son mot de passe à la première connexion.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted dark:bg-muted" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
          <table className="w-full">
            <thead className="bg-muted/50 dark:bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Rôle</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {members?.map((member: NonNullable<typeof members>[number]) => (
                <tr key={member.id} className="hover:bg-accent/30 dark:hover:bg-accent/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground dark:text-foreground">{member.fullName}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      member.role?.code === "superadmin"
                        ? "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary"
                        : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                    }`}>
                      {member.role?.nom ?? "Inconnu"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => { if (confirm("Supprimer ce membre ?")) removeMutation.mutate({ id: member.id }); }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground dark:text-muted-foreground">
              Aucun membre dans l&apos;équipe
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CaissesTab() {
  const { data: caissesList, isLoading } = api.cash.listCaisses.useQuery();
  const utils = api.useUtils();
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaisseLibelle, setNewCaisseLibelle] = useState("");
  const [search, setSearch] = useState("");

  const createCaisseMut = api.cash.createCaisse.useMutation({
    onSuccess: () => {
      utils.cash.listCaisses.invalidate();
      setShowCreateForm(false);
      setNewCaisseLibelle("");
      toast.success("Caisse créée");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCaisseMut = api.cash.updateCaisse.useMutation({
    onSuccess: () => {
      utils.cash.listCaisses.invalidate();
      toast.success("Modifications enregistrées");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: operators } = api.cash.listOperateurs.useQuery(
    { caisseId: selectedCaisseId! },
    { enabled: !!selectedCaisseId }
  );

  const { data: allUsers } = api.user.list.useQuery();

  const [assignUserId, setAssignUserId] = useState("");
  const [assignPerms, setAssignPerms] = useState({ peutOuvrir: true, peutFermer: false, peutDepenser: false });
  const assignMut = api.cash.assignerOperateur.useMutation({
    onSuccess: () => {
      utils.cash.listCaisses.invalidate();
      utils.cash.listOperateurs.invalidate();
      setAssignUserId("");
      setAssignPerms({ peutOuvrir: true, peutFermer: false, peutDepenser: false });
      toast.success("Opérateur assigné");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeOpMut = api.cash.retirerOperateur.useMutation({
    onSuccess: () => {
      utils.cash.listCaisses.invalidate();
      utils.cash.listOperateurs.invalidate();
      toast.success("Opérateur retiré");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedCaisse = caissesList?.find((x: any) => String(x.id) === selectedCaisseId);

  const [formLibelle, setFormLibelle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formActif, setFormActif] = useState(true);

  useEffect(() => {
    if (selectedCaisse) {
      setFormLibelle(selectedCaisse.libelle);
      setFormNotes(selectedCaisse.notes ?? "");
      setFormActif(selectedCaisse.actif !== false);
    }
  }, [selectedCaisseId, selectedCaisse?.libelle, selectedCaisse?.notes, selectedCaisse?.actif]);

  const formDirty =
    (selectedCaisse?.libelle ?? "") !== formLibelle.trim() ||
    (selectedCaisse?.notes ?? "") !== formNotes.trim() ||
    (selectedCaisse?.actif !== false) !== formActif;

  const filtered = (caissesList ?? []).filter((c: any) =>
    search.trim() === "" || c.libelle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground dark:text-foreground">Caisses enregistreuses</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {caissesList?.length ?? 0} caisse(s) · {(caissesList ?? []).filter((c: any) => c.actif !== false).length} active(s)
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Nouvelle caisse
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-xl border border-border bg-background p-4 dark:border-border dark:bg-card flex gap-3 items-center">
          <input
            autoFocus
            value={newCaisseLibelle}
            onChange={(e) => setNewCaisseLibelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCaisseLibelle.trim() && !createCaisseMut.isPending) {
                createCaisseMut.mutate({ libelle: newCaisseLibelle.trim() });
              }
            }}
            placeholder="Nom de la caisse... (Entrée pour créer)"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 dark:bg-muted dark:border-border"
          />
          <button
            disabled={!newCaisseLibelle.trim() || createCaisseMut.isPending}
            onClick={() => createCaisseMut.mutate({ libelle: newCaisseLibelle.trim() })}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {createCaisseMut.isPending ? "..." : "Créer"}
          </button>
        </div>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une caisse..."
          className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 dark:bg-muted dark:border-border"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Liste des caisses */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-muted dark:bg-muted" />
          ) : (
            filtered.map((c: any) => (
              <div
                key={c.id}
                onClick={() => setSelectedCaisseId(String(c.id))}
                className={`rounded-xl border p-5 cursor-pointer transition-all ${
                  selectedCaisseId === String(c.id)
                    ? "border-primary/30 bg-primary/10 dark:bg-primary/10 shadow-md"
                    : "border-border bg-background dark:border-border dark:bg-card hover:shadow-md"
                } ${c.actif === false ? "opacity-70" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground dark:bg-warning/30 dark:text-warning-foreground">
                    <Banknote size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground dark:text-foreground truncate">{c.libelle}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-px text-[9px] font-semibold ${c.actif === false ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                        {c.actif === false ? "Inactive" : "Active"}
                      </span>
                      {c.session && (
                        <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-2 py-px text-[9px] font-semibold">
                          Session ouverte
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Caisse #{c.id} · {c.operateurCount} opérateur(s)
                      {c.session ? ` · ${Number(c.session.soldeActuel ?? 0).toLocaleString()} F` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground dark:text-muted-foreground rounded-xl border border-dashed border-border dark:border-border">
              {search.trim() ? "Aucune caisse ne correspond à votre recherche" : "Aucune caisse créée"}
            </div>
          )}
        </div>

        {/* Détail caisse sélectionnée */}
        {selectedCaisseId && selectedCaisse && (
          <div className="rounded-xl border border-border bg-background p-5 dark:border-border dark:bg-card space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground dark:text-foreground">
                Paramètres de la caisse
              </h3>
              <button
                onClick={() => setSelectedCaisseId(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                title="Fermer le panneau"
              >
                <X size={16} />
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!formDirty) return;
                updateCaisseMut.mutate({
                  caisseId: selectedCaisseId,
                  libelle: formLibelle.trim(),
                  notes: formNotes.trim() || null,
                  actif: formActif,
                });
              }}
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Libellé *</label>
                <input
                  value={formLibelle}
                  onChange={(e) => setFormLibelle(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 dark:bg-muted dark:border-border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes internes (optionnel)"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 dark:bg-muted dark:border-border resize-none"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 dark:bg-muted/50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground dark:text-foreground">Caisse active</p>
                  <p className="text-xs text-muted-foreground">Les caisses inactives sont masquées au point de vente</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormActif(!formActif)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formActif ? "bg-success" : "bg-muted"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-foreground transition-transform ${formActif ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <button
                type="submit"
                disabled={!formDirty || updateCaisseMut.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {updateCaisseMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {updateCaisseMut.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </form>

            <div className="border-t border-border dark:border-border" />

            <h4 className="font-semibold text-foreground dark:text-foreground flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              Opérateurs assignés ({operators?.length ?? 0})
            </h4>

            <div className="space-y-2">
              {operators?.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun opérateur assigné</p>
              )}
              {operators?.map((op: any) => (
                <div key={op.id} className="flex items-center justify-between rounded-lg bg-muted/50 dark:bg-muted/50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground dark:text-foreground">
                      {op.prenom ?? ""} {op.nom ?? op.email}
                    </p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      {op.peutOuvrir && <span className="text-[10px] bg-success/20 text-success-foreground dark:bg-success/30 dark:text-success-foreground px-1.5 py-0.5 rounded">Ouverture</span>}
                      {op.peutFermer && <span className="text-[10px] bg-destructive/20 text-destructive dark:bg-destructive/30 dark:text-destructive px-1.5 py-0.5 rounded">Fermeture</span>}
                      {op.peutDepenser && <span className="text-[10px] bg-warning/20 text-warning-foreground dark:bg-warning/30 dark:text-warning-foreground px-1.5 py-0.5 rounded">Dépenses</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Retirer cet opérateur de cette caisse ?")) removeOpMut.mutate({ id: String(op.id) });
                    }}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-border dark:border-border pt-4 space-y-3">
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              >
                <option value="">Sélectionner un utilisateur...</option>
                {allUsers?.map((u: any) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.prenom ?? ""} {u.nom ?? u.email ?? u.fullName}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-3 text-xs">
                {(["peutOuvrir", "peutFermer", "peutDepenser"] as const).map((perm) => (
                  <label key={perm} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={assignPerms[perm]}
                      onChange={() => setAssignPerms((p) => ({ ...p, [perm]: !p[perm] }))}
                      className="rounded border-border text-primary focus:ring-ring/20"
                    />
                    <span className="text-muted-foreground dark:text-muted-foreground">
                      {perm === "peutOuvrir" ? "Ouverture" : perm === "peutFermer" ? "Fermeture" : "Dépenses"}
                    </span>
                  </label>
                ))}
              </div>

              <button
                disabled={!assignUserId || assignMut.isPending}
                onClick={() => assignMut.mutate({ caisseId: selectedCaisseId, userId: assignUserId, ...assignPerms })}
                className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <UserCheck size={14} className="inline mr-1" />
                Assigner l&apos;opérateur
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
