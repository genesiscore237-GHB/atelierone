"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

/**
 * Barre d'état SAAS (garages configurés) : décompte de licence + synchronisation.
 * Masquée quand le mode SaaS est inactif (LICENCE_MODE != on).
 */
export function SaasStatusBar() {
  const { data: licence, refetch: refetchLicence } = api.licence.etat.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: sync } = api.sync.etat.useQuery(undefined, { refetchInterval: 60_000 });
  const renouveler = api.licence.renouveler.useMutation({
    onSuccess: () => { toast.success("Licence renouvelée"); refetchLicence(); },
    onError: (e) => toast.error(e.message),
  });
  const pousser = api.sync.pousser.useMutation({
    onSuccess: (r) => toast.success(r.envoye > 0 ? `${r.envoye} ligne(s) synchronisée(s)` : "À jour — rien à synchroniser"),
    onError: (e) => toast.error(e.message ?? "Synchronisation impossible (hors-ligne ?)"),
  });
  const [visible, setVisible] = useState(true);
  const [showEnregistrement, setShowEnregistrement] = useState(false);
  const [form, setForm] = useState({ codeSite: "", nomGarage: "", email: "", ville: "", telephone: "" });
  const enregistrer = api.licence.enregistrer.useMutation({
    onSuccess: (r) => { toast.success(`Garage enregistré — essai jusqu'au ${new Date(r.dateFin).toLocaleDateString("fr-FR")}`); refetchLicence(); setShowEnregistrement(false); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!licence || licence.statut === "OFF") return;
    const t = setTimeout(() => setVisible(false), 12_000);
    return () => clearTimeout(t);
  }, [licence]);

  if (!licence || licence.statut === "OFF" || !visible) return null;

  const META: Record<string, { label: string; badge: string; icon: any }> = {
    OK: { label: "Licence active", badge: "bg-success/10 text-success-foreground", icon: ShieldCheck },
    AVERTISSEMENT: { label: `Licence expire dans ${licence.joursRestants} j — renouvelez`, badge: "bg-warning/10 text-warning-foreground", icon: AlertTriangle },
    LECTURE_SEULE: { label: "Abonnement échu — lecture seule (grâce)", badge: "bg-orange-500/10 text-orange-400", icon: ShieldAlert },
    BLOQUE: { label: "Abonnement expiré — application bloquée", badge: "bg-destructive/10 text-destructive", icon: X },
    SANS_LICENCE: { label: "Non enregistré — enregistrez ce garage", badge: "bg-destructive/10 text-destructive", icon: KeyRound },
  };
  const m = META[licence.statut] ?? { label: licence.statut, badge: "bg-muted text-muted-foreground", icon: ShieldCheck };
  const Icon = m.icon;

  return (
    <>
      <div className={`mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${licence.statut === "OK" ? "border-border/60 bg-card/60" : "border-warning/40 bg-warning/5"}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${m.badge}`}>
          <Icon size={12} /> {m.label}
        </span>
        {licence.siteCode && <span className="font-mono text-[10px] text-muted-foreground">Site {licence.siteCode}</span>}
        {licence.dateFin && <span className="text-[10px] text-muted-foreground">échéance {new Date(licence.dateFin).toLocaleDateString("fr-FR")}</span>}
        {licence.mode && <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{licence.mode}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {sync?.actif && (
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={pousser.isPending} onClick={() => pousser.mutate({})}>
              {pousser.isPending ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />} Synchroniser
            </Button>
          )}
          {licence.statut === "SANS_LICENCE" && (
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-primary" onClick={() => setShowEnregistrement(true)}>
              <KeyRound size={11} /> Enregistrer ce garage
            </Button>
          )}
          {(licence.statut === "AVERTISSEMENT" || licence.statut === "LECTURE_SEULE" || licence.statut === "BLOQUE") && (
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-primary" disabled={renouveler.isPending} onClick={() => renouveler.mutate({})}>
              {renouveler.isPending ? <RefreshCw size={11} className="animate-spin" /> : <KeyRound size={11} />} Renouveler
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground" onClick={() => setVisible(false)}>
            <X size={12} />
          </Button>
        </div>
      </div>

      {showEnregistrement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowEnregistrement(false)}>
          <div className="w-full max-w-md rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <KeyRound size={16} className="text-primary" /> Enregistrer ce garage (essai 30 jours)
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Le serveur central crée votre compte et émet une licence d'essai de 30 jours.</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Code du site (unique)</p>
                <Input value={form.codeSite} onChange={(e) => setForm({ ...form, codeSite: e.target.value })} placeholder="ex. GPJ-001" className="mt-1" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nom du garage</p>
                <Input value={form.nomGarage} onChange={(e) => setForm({ ...form, nomGarage: e.target.value })} placeholder="ex. Garage Polyvalent Junior" className="mt-1" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</p>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@garage.cm" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ville</p>
                  <Input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} placeholder="Douala" className="mt-1" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Téléphone</p>
                  <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="6 99 00 00 00" className="mt-1" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEnregistrement(false)}>Annuler</Button>
              <Button disabled={!form.codeSite.trim() || !form.nomGarage.trim() || !form.email.trim() || enregistrer.isPending} onClick={() => enregistrer.mutate(form)}>
                {enregistrer.isPending ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />} Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}