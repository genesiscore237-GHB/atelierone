"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { EmptyState } from "~/components/ui/empty-state";
import { Search, Plus, Trash2, Loader2, RefreshCcw, Car, ArrowRight } from "lucide-react";

type FormState = {
  q: string;
  reference: string;
  referenceContient: boolean;
  referenceFournisseur: string;
  marqueVehicule: string;
  modeleVehicule: string;
  motorisation: string;
  position: string;
  codeChassis: string;
  attributs: { cle: string; valeur: string }[];
  limit: number;
};

const INITIAL: FormState = {
  q: "",
  reference: "",
  referenceContient: false,
  referenceFournisseur: "",
  marqueVehicule: "",
  modeleVehicule: "",
  motorisation: "",
  position: "",
  codeChassis: "",
  attributs: [],
  limit: 20,
};

const POSITIONS = ["AVANT", "ARRIERE", "GAUCHE", "DROITE", "CENTRAL", "LES_DEUX"];

export default function RechercheCatalogue() {
  const [f, setF] = useState<FormState>(INITIAL);
  const [soumis, setSoumis] = useState(false);
  const attrs = f.attributs;

  const { data, isLoading, isError, refetch, isFetching } = api.articles.recherche.useQuery(
    {
      q: f.q || undefined,
      reference: f.reference || undefined,
      referenceContient: f.referenceContient || undefined,
      referenceFournisseur: f.referenceFournisseur || undefined,
      marqueVehicule: f.marqueVehicule || undefined,
      modeleVehicule: f.modeleVehicule || undefined,
      motorisation: f.motorisation || undefined,
      position: f.position || undefined,
      codeChassis: f.codeChassis || undefined,
      attributs: attrs.filter((a) => a.cle.trim() && a.valeur.trim()).map((a) => ({ cle: a.cle.trim(), valeur: a.valeur.trim() })),
      limit: f.limit,
    },
    { enabled: soumis }
  );

  const set = (patch: Partial<FormState>) => setF({ ...f, ...patch });
  const lancer = (e?: React.FormEvent) => {
    e?.preventDefault();
    const rien = !f.q.trim() && !f.reference.trim() && !f.referenceFournisseur.trim() && !f.marqueVehicule.trim() && !f.modeleVehicule.trim() && !f.motorisation.trim() && !f.position && !f.codeChassis.trim() && !attrs.some((a) => a.cle.trim() && a.valeur.trim());
    if (rien) { toast.error("Renseignez au moins un critère de recherche."); return; }
    setSoumis(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Recherche catalogue</h1>
        <p className="text-xs text-muted-foreground">Références, OEM, équivalentes, fournisseur, VIN, véhicule, caractéristiques.</p>
      </div>

      <form onSubmit={lancer} className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Texte libre</Label>
            <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Désignation, marque, intitulé…" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Référence</Label>
            <div className="mt-1 flex gap-2">
              <Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="ex. 90915-YZZD1" className="flex-1" />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={f.referenceContient} onChange={(e) => set({ referenceContient: e.target.checked })} className="size-3.5" /> Contient</label>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Référence fournisseur</Label>
            <Input value={f.referenceFournisseur} onChange={(e) => set({ referenceFournisseur: e.target.value })} placeholder="Selon votre fournisseur…" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">VIN / n° de châssis</Label>
            <Input value={f.codeChassis} onChange={(e) => set({ codeChassis: e.target.value })} placeholder="VF1R9B1A5…" className="mt-1 uppercase" />
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Car size={13} /> Véhicule compatible</p>
          <div className="grid gap-2 sm:grid-cols-5">
            <div><Label className="text-xs text-muted-foreground">Marque véhicule</Label><Input value={f.marqueVehicule} onChange={(e) => set({ marqueVehicule: e.target.value })} placeholder="Peugeot" className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Modèle</Label><Input value={f.modeleVehicule} onChange={(e) => set({ modeleVehicule: e.target.value })} placeholder="308" className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Motorisation</Label><Input value={f.motorisation} onChange={(e) => set({ motorisation: e.target.value })} placeholder="ex. 1.6 HDi 115" className="mt-1" /></div>
            <div>
              <Label className="text-xs text-muted-foreground">Position</Label>
              <select value={f.position} onChange={(e) => set({ position: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <select value={f.limit} onChange={(e) => set({ limit: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value={20}>20 résultats max</option>
                <option value={50}>50 résultats max</option>
                <option value={100}>100 résultats max</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Caractéristiques techniques</p>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => set({ attributs: [...attrs, { cle: "", valeur: "" }] })}><Plus size={12} /> Ajouter un critère</Button>
          </div>
          {attrs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ex. Clef « diametre », valeur « 310 » — filtre les résultats par attribut (variante ou article).</p>
          ) : (
            <div className="space-y-2">
              {attrs.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={a.cle} onChange={(e) => set({ attributs: attrs.map((x, j) => (j === i ? { ...x, cle: e.target.value } : x)) })} placeholder="Clé (ex. diametre)" className="w-56 text-xs" />
                  <Input value={a.valeur} onChange={(e) => set({ attributs: attrs.map((x, j) => (j === i ? { ...x, valeur: e.target.value } : x)) })} placeholder="Valeur (ex. 310)" className="w-48 text-xs" />
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => set({ attributs: attrs.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button type="submit" className="gap-1.5" disabled={isFetching}>
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search size={15} />} Rechercher
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setF(INITIAL); setSoumis(false); }}><RefreshCcw size={13} /> Réinitialiser</Button>
        </div>
      </form>

      {!soumis ? (
        <EmptyState
          icon={<Search className="size-8 text-muted-foreground" />}
          title="Lancez une recherche"
          description="Combinez librement référence exacte ou partielle, réf. fournisseur, VIN, véhicule et caractéristiques."
        />
      ) : isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted/50" />
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-4 text-sm text-destructive-foreground">
          <span>La recherche a échoué.</span>
          <Button size="sm" variant="outline" className="ml-auto gap-1 text-xs" onClick={() => refetch()}><RefreshCcw size={12} /> Réessayer</Button>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Search className="size-8 text-muted-foreground" />} title="Aucun résultat" description="Aucune référence ne correspond aux critères saisis." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{data.length} résultat(s)</p>
          {(data ?? []).map((r: any) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/catalog/variante/${r.id}`} className="flex items-center gap-2 text-sm font-bold hover:underline">
                    {r.titre}
                    <ArrowRight size={13} className="text-muted-foreground" />
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.articleDesignation ?? "—"}
                    {r.referencePrincipale && <span className="ml-2 font-mono">{r.referencePrincipale}</span>}
                    {r.positionCote && r.positionCote !== "N_A" && <span className="ml-2 uppercase">{r.positionCote}</span>}
                    {r.positionEssieu && r.positionEssieu !== "N_A" && <span className="ml-1 uppercase">{r.positionEssieu}</span>}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{r.niveau === "EXEMPLAIRE" ? "Exemplaire" : "Variante / SKU"}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{r.typeProduit ?? "—"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.stockDisponible > 0 ? "bg-success/10 text-success-foreground" : "bg-destructive/5 text-destructive"}`}>
                  Stock : {r.stockDisponible}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(r.explications ?? []).map((ex: string, i: number) => (
                  <span key={i} className="rounded bg-primary/5 px-2 py-0.5 text-[10px] text-primary">{ex}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}