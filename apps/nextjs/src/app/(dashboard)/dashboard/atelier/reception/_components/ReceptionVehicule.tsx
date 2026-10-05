"use client";

import { useState } from "react";
import { Search, Plus, Loader2, CheckCircle2, X } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * RÉCEPTION VÉHICULE (MVP) — recherche ou création en même temps.
 * Sections : 1 Véhicule · 2 Client · 3 Chauffeur · 4 Entrée · 5 Check-list
 * outillage (fiche papier) · 6 Pannes & observations · 7 Photos · 8 Validation.
 */

const OUTILLAGE_ITEMS = [
  "CRIC", "CLÉ DE ROUE", "MANIVELLE", "ROUE DE SECOURS", "EXTINCTEUR", "RADIO", "TRIANGLE", "CD",
  "DOCUMENTS", "PARAPLUIE", "PIÈCES DU VÉHICULE", "NATTES", "BOUGIES", "HUILE DE FREIN", "SACS",
  "BÂCHE DU VÉHICULE", "BOÎTE À PHARMACIE", "AUTRES",
];

const CARBURANTS = ["essence", "diesel", "electrique", "hybride", "gpl"];
const NIVEAUX_CARBURANT = ["vide", "1/4", "1/2", "3/4", "plein"];

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
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

  const { data: recherche } = api.or.rechercherReception.useQuery({ q: q.trim() }, { enabled: q.trim().length >= 2 && !modeCreation });
  const receptionner = api.or.receptionner.useMutation({
    onSuccess: (r) => {
      toast.success(`Réception enregistrée — dossier ${r.numero} créé`);
      utils.or.list.invalidate();
      utils.vehicules.list.invalidate();
      setF({ vehicule: {}, client: {}, chauffeur: {}, reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false } });
      setOutillageNotes({});
      setModeCreation(false);
      setQ("");
      setResultats(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const chargerVehicule = (v: any) => {
    setF({
      vehicule: { id: v.id, immatriculation: v.immatriculation, numeroChassis: v.numeroChassis ?? "", typeVehicule: v.typeVehicule ?? "voiture", marque: v.marque ?? "", modele: v.modele ?? "", version: v.version ?? "", annee: v.annee ?? "", couleur: v.couleur ?? "", carburant: v.carburant ?? "", kilometrage: v.kilometrage ?? "" },
      client: { id: v.clientId ?? undefined, nom: v.clientNom ?? "", prenom: v.clientPrenom ?? "", telephone: v.clientTelephone ?? "" },
      chauffeur: { nom: v.chauffeurNom ?? "", telephone: v.chauffeurTelephone ?? "" },
      reception: { typeIntervention: "ATELIER", motEntree: "PANNE", priorite: "P3", niveauCarburantEntree: "", outillage: {}, photos: [], validationVerbale: false },
    });
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

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const reader = (file: File) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file); });
    Promise.all(Array.from(files).filter((x) => x.size <= 2 * 1024 * 1024).map(reader)).then((imgs) => set("reception", "photos", [...(f.reception.photos ?? []), ...imgs]));
  };

  const valider = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!f.vehicule.immatriculation?.trim()) errs.immatriculation = "Immatriculation requise";
    if (!f.client.nom?.trim()) errs.clientNom = "Client / propriétaire requis";
    if (!f.reception.kilometrageEntree && f.reception.kilometrageEntree !== 0) errs.kilometrageEntree = "Kilométrage d'entrée requis";
    if (!f.reception.pannesDeclarees?.trim()) errs.pannesDeclarees = "Pannes déclarées requises";
    if (!f.reception.signatureDeposant?.trim() && !f.reception.validationVerbale) errs.signature = "Signature du déposant ou validation verbale requise";
    return errs;
  };

  const handleSubmit = () => {
    const errs = valider();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const outillage = Object.fromEntries(
      Object.entries(f.reception.outillage ?? {}).map(([k, v]) => [k, { present: v, observation: outillageNotes[k] ?? "" }])
    );
    if (outillageNotes["AUTRES"]) outillage["autres"] = { present: true, observation: outillageNotes["AUTRES"] };
    receptionner.mutate({
      client: { ...f.client, nom: f.client.nom?.trim(), telephone: f.client.telephone?.trim() || undefined },
      vehicule: { ...f.vehicule, immatriculation: f.vehicule.immatriculation.trim(), marque: f.vehicule.marque?.trim() || undefined, modele: f.vehicule.modele?.trim() || undefined, annee: f.vehicule.annee != null && f.vehicule.annee !== "" ? Number(f.vehicule.annee) : undefined, kilometrage: f.vehicule.kilometrage != null && f.vehicule.kilometrage !== "" ? Number(f.vehicule.kilometrage) : undefined },
      chauffeur: { nom: f.chauffeur.nom?.trim() || undefined, telephone: f.chauffeur.telephone?.trim() || undefined },
      reception: { ...f.reception, outillage, kilometrageEntree: Number(f.reception.kilometrageEntree), photos: f.reception.photos?.length ? f.reception.photos : undefined },
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Immatriculation" required error={errors.immatriculation}>
                <Input value={f.vehicule.immatriculation ?? ""} onChange={(e) => set("vehicule", "immatriculation", e.target.value.toUpperCase())} placeholder="AA-123-BB" className="font-mono uppercase" />
              </Field>
              <Field label="N° de châssis">
                <Input value={f.vehicule.numeroChassis ?? ""} onChange={(e) => set("vehicule", "numeroChassis", e.target.value.toUpperCase())} className="font-mono uppercase" />
              </Field>
              <Field label="Type de véhicule" required>
                <select value={f.vehicule.typeVehicule ?? "voiture"} onChange={(e) => set("vehicule", "typeVehicule", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {["voiture", "utilitaire", "poids_lourd", "moto", "autocar", "autre"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Marque" required>
                <Input value={f.vehicule.marque ?? ""} onChange={(e) => set("vehicule", "marque", e.target.value)} placeholder="Peugeot, Toyota…" />
              </Field>
              <Field label="Modèle">
                <Input value={f.vehicule.modele ?? ""} onChange={(e) => set("vehicule", "modele", e.target.value)} placeholder="308, Corolla…" />
              </Field>
              <Field label="Version / Finition">
                <Input value={f.vehicule.version ?? ""} onChange={(e) => set("vehicule", "version", e.target.value)} placeholder="Allure, Confort…" />
              </Field>
              <Field label="Année">
                <Input type="number" value={f.vehicule.annee ?? ""} onChange={(e) => set("vehicule", "annee", e.target.value ? Number(e.target.value) : "")} />
              </Field>
              <Field label="Couleur">
                <Input value={f.vehicule.couleur ?? ""} onChange={(e) => set("vehicule", "couleur", e.target.value)} />
              </Field>
              <Field label="Énergie">
                <select value={f.vehicule.carburant ?? ""} onChange={(e) => set("vehicule", "carburant", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">—</option>
                  {CARBURANTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Kilométrage">
                <Input type="number" value={f.vehicule.kilometrage ?? ""} onChange={(e) => set("vehicule", "kilometrage", e.target.value ? Number(e.target.value) : "")} />
              </Field>
            </div>
          </Section>

          {/* 2 — Client */}
          <Section title="2 · Client / Propriétaire">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nom / Raison sociale" required error={errors.clientNom}>
                <Input value={f.client.nom ?? ""} onChange={(e) => set("client", "nom", e.target.value)} placeholder="Dupont, GPJ Trans…" />
              </Field>
              <Field label="Prénom">
                <Input value={f.client.prenom ?? ""} onChange={(e) => set("client", "prenom", e.target.value)} />
              </Field>
              <Field label="Téléphone principal" required>
                <Input value={f.client.telephone ?? ""} onChange={(e) => set("client", "telephone", e.target.value)} placeholder="06 12 34 56 78" />
              </Field>
              <Field label="Email">
                <Input type="email" value={f.client.email ?? ""} onChange={(e) => set("client", "email", e.target.value)} />
              </Field>
              <Field label="Adresse">
                <Input value={f.client.adresse ?? ""} onChange={(e) => set("client", "adresse", e.target.value)} />
              </Field>
              <Field label="Ville">
                <Input value={f.client.ville ?? ""} onChange={(e) => set("client", "ville", e.target.value)} />
              </Field>
            </div>
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
          <Section title="6 · Pannes déclarées & observations">
            <Field label="Pannes déclarées" required error={errors.pannesDeclarees}>
              <textarea value={r.pannesDeclarees ?? ""} onChange={(e) => set("reception", "pannesDeclarees", e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Voyant moteur allumé, bruit à l'accélération…" />
            </Field>
            <Field label="Observations">
              <textarea value={r.observationsReception ?? ""} onChange={(e) => set("reception", "observationsReception", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Client pressé, remarques…" />
            </Field>
            <Field label="Travaux demandés / plainte (si différente des pannes)">
              <textarea value={r.plainte ?? ""} onChange={(e) => set("reception", "plainte", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </Field>
          </Section>

          {/* 7 — Photos */}
          <Section title="7 · Photos de réception (fortement recommandé)">
            <div className="flex flex-wrap items-center gap-3">
              {(r.photos ?? []).map((ph: string, i: number) => (
                <div key={i} className="relative">
                  <img src={ph} alt="" className="size-20 rounded-lg border border-border object-cover" />
                  <button type="button" onClick={() => set("reception", "photos", (r.photos ?? []).filter((_: string, j: number) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-background"><X className="size-3" /></button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40">
                <Plus className="size-5" /> Photos
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            </div>
          </Section>
        </div>

        <div className="space-y-5 xl:col-span-2">
          {/* 4 — Informations d'entrée */}
          <Section title="4 · Informations d'entrée">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date & heure de réception">
                <Input type="datetime-local" value={r.dateReception ?? ""} onChange={(e) => set("reception", "dateReception", e.target.value)} />
              </Field>
              <Field label="Kilométrage d'entrée" required error={errors.kilometrageEntree}>
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
          <Section title="5 · Check-list outillage & accessoires (fiche de réception)">
            <div className="grid grid-cols-2 gap-2">
              {OUTILLAGE_ITEMS.map((item) => {
                const key = item === "AUTRES" ? "AUTRES" : item;
                const present = !!f.reception.outillage?.[key];
                return (
                  <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${present ? "border-success/50 bg-success/5" : "border-border"}`}>
                    <input type="checkbox" checked={present} onChange={(e) => set("reception", "outillage", { ...(f.reception.outillage ?? {}), [key]: e.target.checked })} className="size-4 accent-success" />
                    {item}
                  </label>
                );
              })}
            </div>
            <Field label="Observations outillage (ex: autres éléments)" hint="Saisissez les remarques par élément dans le champ correspondant">
              <div className="space-y-1.5">
                {OUTILLAGE_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">{item}</span>
                    <Input value={outillageNotes[item] ?? ""} onChange={(e) => setOutillageNotes({ ...outillageNotes, [item]: e.target.value })} placeholder="observation…" className="h-7 text-xs" />
                  </div>
                ))}
              </div>
            </Field>
          </Section>

          {/* 8 — Validation */}
          <Section title="8 · Validation">
            <Field label="Nom et signature du déposant" required error={errors.signature}>
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