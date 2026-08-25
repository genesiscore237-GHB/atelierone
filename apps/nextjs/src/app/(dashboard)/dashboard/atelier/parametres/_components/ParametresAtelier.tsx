"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Save, Settings2, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usePermissions } from "~/hooks/usePermissions";

export function ParametresAtelier() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading } = api.or.getParametresAtelier.useQuery();
  const [seuilPromesseJours, setSeuilPromesseJours] = useState(1);
  const [seuilImmobilisationJours, setSeuilImmobilisationJours] = useState(5);
  const [seuilBloqueJours, setSeuilBloqueJours] = useState(3);
  const [emplacements, setEmplacements] = useState<string[]>([]);
  const [raisonsBlocage, setRaisonsBlocage] = useState<string[]>([]);
  const [texteAccuse, setTexteAccuse] = useState("");
  const [newEmpl, setNewEmpl] = useState("");
  const [newRaison, setNewRaison] = useState("");

  useEffect(() => {
    if (!data) return;
    setSeuilPromesseJours(data.seuilPromesseJours);
    setSeuilImmobilisationJours(data.seuilImmobilisationJours);
    setSeuilBloqueJours(data.seuilBloqueJours);
    setEmplacements(data.emplacements ?? []);
    setRaisonsBlocage(data.raisonsBlocage ?? []);
    setTexteAccuse(data.texteAccuseReception ?? "");
  }, [data]);

  const update = api.or.updateParametresAtelier.useMutation({
    onSuccess: () => { toast.success("Paramètres enregistrés"); utils.or.getParametresAtelier.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const canModifier = hasPermission("or.modifier");
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const save = () => {
    update.mutate({
      seuilPromesseJours,
      seuilImmobilisationJours,
      seuilBloqueJours,
      emplacements,
      raisonsBlocage,
      texteAccuseReception: texteAccuse,
    });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Settings2 size={22} className="text-primary" /> Paramètres du parc
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Seuils d'alerte, emplacements, raisons de blocage, accusé de réception.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Seuils d'alerte</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Jours avant promesse → alerte PROCHE</Label>
            <Input type="number" min={0} max={30} disabled={!canModifier} className="mt-1" value={seuilPromesseJours} onChange={(e) => setSeuilPromesseJours(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Jours d'immobilisation → alerte LONG</Label>
            <Input type="number" min={1} max={60} disabled={!canModifier} className="mt-1" value={seuilImmobilisationJours} onChange={(e) => setSeuilImmobilisationJours(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Jours bloqué → escalade Direction</Label>
            <Input type="number" min={1} max={30} disabled={!canModifier} className="mt-1" value={seuilBloqueJours} onChange={(e) => setSeuilBloqueJours(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Emplacements</h2>
          <div className="flex flex-wrap gap-2">
            {emplacements.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {e}
                {canModifier && (
                  <button onClick={() => setEmplacements(emplacements.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive"><X size={11} /></button>
                )}
              </span>
            ))}
          </div>
          {canModifier && (
            <div className="mt-3 flex gap-2">
              <Input value={newEmpl} onChange={(e) => setNewEmpl(e.target.value)} placeholder="ex. Parc C" />
              <Button variant="outline" onClick={() => { if (newEmpl.trim()) { setEmplacements([...emplacements, newEmpl.trim()]); setNewEmpl(""); } }}>Ajouter</Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Raisons de blocage</h2>
          <div className="flex flex-wrap gap-2">
            {raisonsBlocage.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {r}
                {canModifier && (
                  <button onClick={() => setRaisonsBlocage(raisonsBlocage.filter((x) => x !== r))} className="text-muted-foreground hover:text-destructive"><X size={11} /></button>
                )}
              </span>
            ))}
          </div>
          {canModifier && (
            <div className="mt-3 flex gap-2">
              <Input value={newRaison} onChange={(e) => setNewRaison(e.target.value)} placeholder="ex. Attente expert" />
              <Button variant="outline" onClick={() => { if (newRaison.trim()) { setRaisonsBlocage([...raisonsBlocage, newRaison.trim()]); setNewRaison(""); } }}>Ajouter</Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Texte de l'accusé de réception</h2>
        <textarea
          rows={3}
          disabled={!canModifier}
          value={texteAccuse}
          onChange={(e) => setTexteAccuse(e.target.value)}
          className="w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          placeholder="Variables : {IMMATRICULATION}, {OR}, {PROMESSE}"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">Variables disponibles : {"{IMMATRICULATION}"}, {"{OR}"}, {"{PROMESSE}"}.</p>
      </div>

      {canModifier && (
        <Button onClick={save} disabled={update.isPending} className="gap-2">
          <Save size={15} /> Enregistrer les paramètres
        </Button>
      )}
    </div>
  );
}