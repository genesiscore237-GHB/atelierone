"use client";

import { useMemo, useState } from "react";
import { Search, Users, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { EmptyState } from "~/components/ui/empty-state";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";

/**
 * LOT R5 — Dédoublonnage client (E6).
 *
 * Liste les groupes de clients d'une agence partageant le même téléphone
 * normalisé (« 06 12 34 56 78 » ≡ « 0612345678 »). Pour chaque groupe :
 *   - l'opérateur choisit le client « survivant » (par défaut le plus ancien) ;
 *   - il confirme la fusion (dialogue destructeur) ;
 *   - les références (véhicules, OR, ventes…) sont reportées vers le survivant
 *     et les doublons sont archivés (soft-delete).
 *
 * Aucune fusion automatique : conformément au principe « pas d'invention »
 * (D3), l'UI ne fait que SURFACER les doublons et laisse l'opérateur décider.
 */

type Membre = {
  id: number;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  codeClient: string | null;
  statut: string;
  createdAt: Date | string | null;
};

type Groupe = {
  telNorm: string;
  survivant: Membre;
  membres: Membre[];
};

function dateCourte(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nomComplet(m: Membre): string {
  return `${m.nom}${m.prenom ? ` ${m.prenom}` : ""}`;
}

export default function ClientsDoublonsPage() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  // Par groupe (telNorm) : id du survivant retenu par l'opérateur.
  const [survivants, setSurvivants] = useState<Record<string, number>>({});
  // Groupe en attente de confirmation de fusion.
  const [aFusionner, setAFusionner] = useState<Groupe | null>(null);

  const { data, isLoading } = api.clients.suggestionsClients.useQuery(undefined, { enabled: hasPermission("clients.consulter") });

  const groupes: Groupe[] = useMemo(() => {
    const g = (data?.groupes ?? []) as unknown as Groupe[];
    const needle = q.trim().toLowerCase();
    if (!needle) return g;
    return g.filter((gr) =>
      gr.telNorm.includes(needle) ||
      gr.membres.some((m) => nomComplet(m).toLowerCase().includes(needle) || (m.codeClient ?? "").toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const fusionner = api.clients.fusionner.useMutation({
    onSuccess: (r) => {
      toast.success(`Fusion terminée — ${r.fusionnes} fiche(s) fusionnée(s) vers le client conservé`);
      setAFusionner(null);
      void utils.clients.list.invalidate();
      void utils.clients.suggestionsClients.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!hasPermission("clients.consulter")) {
    return (
      <div className="p-6">
        <EmptyState icon={<ShieldCheck size={32} />} title="Accès refusé" description="Vous n'avez pas la permission de consulter les clients." />
      </div>
    );
  }

  const peutFusionner = hasPermission("clients.modifier");

  const demanderFusion = (g: Groupe) => {
    if (!peutFusionner) {
      toast.error("Vous n'avez pas la permission de fusionner des clients.");
      return;
    }
    const survivantId = survivants[g.telNorm] ?? g.survivant.id;
    const doublonIds = g.membres.map((m) => m.id).filter((id) => id !== survivantId);
    if (!doublonIds.length) {
      toast.error("Choisissez un client différent comme survivant pour fusionner.");
      return;
    }
    setAFusionner({ ...g, survivant: g.membres.find((m) => m.id === survivantId) ?? g.survivant });
  };

  const confirmerFusion = () => {
    if (!aFusionner) return;
    const survivantId = survivants[aFusionner.telNorm] ?? aFusionner.survivant.id;
    const doublonIds = aFusionner.membres.map((m) => m.id).filter((id) => id !== survivantId);
    fusionner.mutate({ survivantId, doublonIds });
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dédoublonnage clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clients partageant le même téléphone (normalisé). Fusionnez explicitement — jamais automatique.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, code, numéro…" className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" /> Chargement des doublons…
        </div>
      ) : groupes.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title={q ? "Aucun doublon trouvé" : "Aucun doublon détecté"}
          description={q ? "Aucun groupe ne correspond à votre recherche." : "Tous les clients de l'agence semblent uniques (téléphone distinct)."}
        />
      ) : (
        <div className="space-y-4">
          {groupes.map((g) => {
            const survivantId = survivants[g.telNorm] ?? g.survivant.id;
            return (
              <div key={g.telNorm} className="rounded-xl border border-border bg-card/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Téléphone {g.telNorm}</span>
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{g.membres.length} fiches</span>
                  </div>
                  {peutFusionner && (
                    <Button size="sm" onClick={() => demanderFusion(g)} disabled={fusionner.isPending}>
                      Fusionner vers le conservé <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {g.membres.map((m) => {
                    const estSurvivant = m.id === survivantId;
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                          estSurvivant ? "border-primary/50 bg-primary/5" : "border-border bg-card/40 hover:border-border/80"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`survivant-${g.telNorm}`}
                          checked={estSurvivant}
                          onChange={() => setSurvivants((p) => ({ ...p, [g.telNorm]: m.id }))}
                          className="mt-0.5 accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{nomComplet(m)}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{m.codeClient ?? "—"}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{m.statut}</span>
                            {estSurvivant && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Conservé</span>}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {m.telephone ?? "—"} · client depuis {dateCourte(m.createdAt)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Le client conservé garde son historique ; les autres sont archivés et leurs références reportées.
                </p>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!aFusionner}
        onClose={() => setAFusionner(null)}
        onConfirm={confirmerFusion}
        title="Fusionner ces clients ?"
        description={
          aFusionner
            ? `Les ${aFusionner.membres.length - 1} autre(s) fiche(s) seront archivée(s) et leurs véhicules, ordres de réparation et ventes reportés vers « ${nomComplet(aFusionner.survivant)} ». Cette action est irréversible.`
            : ""
        }
        confirmText="Fusionner"
        variant="destructive"
      />
    </div>
  );
}
