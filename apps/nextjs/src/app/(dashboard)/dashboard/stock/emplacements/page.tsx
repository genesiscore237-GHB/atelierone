"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Package,
  Plus,
  Printer,
  Search,
  CornerDownRight,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { EtiquetteEmplacement } from "./_components/EtiquetteEmplacement";
import { ZONES_STOCKAGE, LABELS_ZONE_STOCKAGE, libelleZone } from "~/lib/emplacements";

/**
 * EMPLACEMENTS — l'arborescence réelle du garage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ARBRE ET NON UNE LISTE
 *
 * Le besoin dit : « le garage a 5 magasins, les pièces sont éparpillées
 * partout et dans les bureaux ». Une liste triée par code donne « A-01, A-02,
 * B-01, B-02… » sans jamais dire que A-01 est dans le magasin central et B-01
 * dans le bureau du chef. Or c'est précisément l'information qui manque pour
 * choisir « où je range ça ».
 *
 * On lit donc la même donnée en arbre, via `stock.arborescenceEmplacements`.
 * Le client n'a plus qu'à l'indenter — et l'indentation est calculée par le
 * serveur, qui connaît la vraie profondeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CRÉATION D'UN SOUS-EMPLACEMENT
 *
 * `createEmplacement` acceptait `parentId` mais l'interface ne l'envoyait
 * pas : on ne pouvait créer que des racines. Une arborescence à trois niveaux
 * — magasin › allée › rayon — était donc impossible à saisir, alors même
 * que la colonne `parent_id` existait et que 16 sous-emplacements étaient
 * déjà en base.
 */

interface EmplacementPlat {
  id: number;
  parentId: number | null;
  profondeur: number;
  code: string;
  libelle: string | null;
  type: string;
  zoneStockage: string | null;
  capacite: number | null;
  isActive: boolean | null;
}

interface NoeudEmplacement extends EmplacementPlat {
  enfants: NoeudEmplacement[];
}

/**
 * Empile une liste PLATE en arbre.
 *
 * Le serveur renvoie une liste triée par profondeur puis par code, avec le
 * `parentId` déjà résolu — et non un type récursif, qui ferait exploser
 * l'inférence de tRPC pour tout le projet (29 typecheck en moins dès qu'on
 * a retiré le `Noeud` récursif du router).
 *
 * La profondeur affichée est celle du NOEUD, pas son niveau dans le rendu :
 * si une donnée héritée crée un parent orphelin, l'indentation doit rester
 * celle que la base connaît, sinon l'arbre raconte autre chose que la base.
 */
function empiler(lignes: EmplacementPlat[]): NoeudEmplacement[] {
  const parId = new Map<number, NoeudEmplacement>();
  for (const l of lignes) parId.set(l.id, { ...l, enfants: [] });

  const racines: NoeudEmplacement[] = [];
  for (const n of parId.values()) {
    const parent = n.parentId != null ? parId.get(n.parentId) : null;
    // Un parent absent de l'agence ne doit pas faire disparaître le fils :
    // on le remonte en racine. Le mieux est de le voir.
    if (parent) parent.enfants.push(n);
    else racines.push(n);
  }
  return racines;
}

interface ContenuEmplacementLigne {
  produitId: number;
  titre: string;
  codeArticle: string | null;
  codeBarre: string | null;
  quantite: number;
  valeur: number;
}

function ContenuEmplacement({
  selected,
  contenu,
}: {
  selected: number;
  contenu: ContenuEmplacementLigne[] | undefined;
}) {
  if (!contenu || contenu.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
        <Package size={28} className="mb-2 opacity-40" />
        <p className="text-sm font-medium text-foreground">Emplacement vide</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Aucun article stocké ici pour le moment.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Article</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qté</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {contenu.map((c: ContenuEmplacementLigne) => (
            <tr key={c.produitId} className="border-t border-border hover:bg-accent/40">
              <td className="px-4 py-2.5 font-medium">{c.titre}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                {c.codeArticle ?? c.codeBarre}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">{c.quantite}</td>
              <td className="px-4 py-2.5 text-right font-mono">
                {Math.round(c.valeur).toLocaleString("fr-FR")} F
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EmplacementsPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [parentChoisi, setParentChoisi] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [plies, setPlies] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    code: "",
    libelle: "",
    type: "RAYON",
    zoneStockage: "NORMAL" as (typeof ZONES_STOCKAGE)[number],
    capacite: "",
  });
  // Étiquette ouverte : c'est l'ID de l'emplacement choisi (le QR de
  // l'étiquette envoie ici même, avec `?p=CODE`).
  const [etiquetteDe, setEtiquetteDe] = useState<number | null>(null);

  const { data: arbre, isLoading, isError, refetch } =
    api.stock.arborescenceEmplacements.useQuery({});

  // Scanner un code et arriver sur la liste : le paramètre ?p=CODE
  // présélectionne l'emplacement visé. Le QR encode exactement cette
  // URL (voir EtiquetteEmplacement).
  const params = useSearchParams();
  useEffect(() => {
    const codeCible = params?.get("p");
    if (!codeCible || !arbre || selected !== null) return;
    const trouve = (arbre as EmplacementPlat[]).find(
      (e) => e.code.toLowerCase() === codeCible.toLowerCase(),
    );
    if (trouve) setSelected(trouve.id);
  }, [params, arbre, selected]);

  const { data: contenu } = api.stock.getEmplacementContenu.useQuery(
    { emplacementId: selected ?? 0 },
    { enabled: !!selected },
  );

  const create = api.stock.createEmplacement.useMutation({
    onSuccess: () => {
      toast.success(parentChoisi ? "Sous-emplacement créé" : "Emplacement créé");
      utils.stock.arborescenceEmplacements.invalidate();
      utils.stock.listEmplacements.invalidate();
      utils.stock.getEmplacementContenu.invalidate();
      setShowForm(false);
      setForm({ code: "", libelle: "", type: "RAYON", zoneStockage: "NORMAL", capacite: "" });
      setParentChoisi(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const update = api.stock.updateEmplacement.useMutation({
    onSuccess: () => {
      toast.success("Emplacement mis à jour");
      utils.stock.arborescenceEmplacements.invalidate();
      utils.stock.listEmplacements.invalidate();
      setShowZoneModif(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const [zoneModifId, setZoneModifId] = useState<number | null>(null);
  const [zoneModif, setZoneModif] = useState<(typeof ZONES_STOCKAGE)[number]>("NORMAL");
  const [showZoneModif, setShowZoneModif] = useState(false);

  /**
   * Applique la recherche à l'ARBRE, pas à une liste.
   *
   * Si « rayon 3 » correspond, on doit voir « rayon 3 » — mais aussi le
   * magasin et l'allée dans lesquels il se trouve, sans quoi l'agent ne sait
   * pas où il va le chercher. Un parent qui ne correspond pas est conservé
   * comme chemin, ses enfants non concordants sont élagués.
   */
  const arbreFiltre = useMemo(() => {
    const racine = empiler((arbre ?? []) as EmplacementPlat[]);
    if (!search.trim()) return racine;
    const q = search.trim().toLowerCase();

    const filtrer = (n: NoeudEmplacement): NoeudEmplacement | null => {
      const enfants = n.enfants.map(filtrer).filter((x): x is NoeudEmplacement => x !== null);
      const correspond =
        n.code.toLowerCase().includes(q) || (n.libelle ?? "").toLowerCase().includes(q);
      if (correspond) return { ...n, enfants: n.enfants };
      // Le parent ne correspond pas mais descendances oui : on garde le
      // chemin. C'est ce qui rend la recherche utilisable dans une arborescence.
      if (enfants.length) return { ...n, enfants };
      return null;
    };
    return racine.map(filtrer).filter((x): x is NoeudEmplacement => x !== null);
  }, [arbre, search]);

  const nombreEmplacements = (arbre ?? []).length;

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError)
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-10 text-center">
        <AlertTriangle size={28} className="mb-2 text-destructive" />
        <p className="text-sm font-medium text-foreground">Erreur de chargement</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Réessayer
        </Button>
      </div>
    );

  const basculer = (id: number) =>
    setPlies((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cheminDe = (id: number): EmplacementPlat | undefined =>
    ((arbre ?? []) as EmplacementPlat[]).find((e) => e.id === id);

  const noeudParent = parentChoisi != null ? cheminDe(parentChoisi) : null;

  const save = () => {
    if (!form.code.trim()) {
      toast.error("Code requis", {
        description: "Format advised : MAG-A-01-03 (zone, allée, rayon, niveau).",
      });
      return;
    }
    const capaciteN = Number(form.capacite);
    create.mutate({
      code: form.code.trim().toUpperCase(),
      libelle: form.libelle.trim() || undefined,
      type: form.type,
      zoneStockage: form.zoneStockage,
      capacite: form.capacite.trim() !== "" && Number.isFinite(capaciteN) && capaciteN >= 1
        ? Math.floor(capaciteN)
        : undefined,
      parentId: parentChoisi ?? undefined,
    });
  };

  const rendreNoeud = (n: NoeudEmplacement, niveau: number) => {
    const aDesEnfants = n.enfants.length > 0;
    const replie = plies.has(n.id);
    return (
      <div key={n.id}>
        <div
          className={`flex items-center justify-between border-b border-border transition-colors hover:bg-accent/50 ${
            selected === n.id ? "bg-accent/70" : ""
          }`}
          style={{ paddingLeft: `${12 + niveau * 18}px` }}
        >
          <button
            type="button"
            onClick={() => setSelected(n.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-2 text-left"
          >
            {aDesEnfants ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={replie ? "Déplier" : "Replier"}
                onClick={(ev) => {
                  ev.stopPropagation();
                  basculer(n.id);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.stopPropagation();
                    basculer(n.id);
                  }
                }}
                className="shrink-0 rounded p-0.5 hover:bg-accent"
              >
                {replie ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <MapPin size={13} className="shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block font-mono text-sm font-semibold text-foreground">
                {n.code}
                {n.isActive === false && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    Inactif
                  </span>
                )}
              </span>
              {n.libelle && <span className="block truncate text-xs text-muted-foreground">{n.libelle}</span>}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2 pl-2">
            {/* La zone FONCTIONNELLE est visible d'un coup d'œil : c'est elle
                qui dit « pas de prise ici » en quarantaine, « périmés » en
                zone PERIMES — le type physique seul ne le dit pas. */}
            {n.zoneStockage && n.zoneStockage !== "NORMAL" && (
              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                {libelleZone(n.zoneStockage)}
              </span>
            )}
            {n.capacite != null && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title="Capacité">
                {n.capacite} max
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
              {n.type}
            </span>
            <button
              type="button"
              onClick={() => setEtiquetteDe(n.id)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Imprimer l'étiquette de ${n.code}`}
              title="Étiquette (code + QR)"
            >
              <Printer size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setParentChoisi(n.id);
                setShowForm(true);
                setForm({ code: "", libelle: "", type: n.type, zoneStockage: "NORMAL", capacite: "" });
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Ajouter un sous-emplacement dans ${n.code}`}
              title="Ajouter un sous-emplacement ici"
            >
              <CornerDownRight size={14} />
            </button>
          </div>
        </div>
        {aDesEnfants && !replie && n.enfants.map((e) => rendreNoeud(e, niveau + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Emplacements & Rayonnage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {nombreEmplacements} emplacement(s) · magasin, allée, rayon, niveau — et les bureaux,
            qui sont des emplacements comme les autres.
          </p>
        </div>
        <Button
          onClick={() => {
            setParentChoisi(null);
            setShowForm((v) => !v);
          }}
          className="gap-2"
        >
          <Plus size={16} /> Nouvel emplacement
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            {noeudParent ? (
              <>
                <CornerDownRight size={14} className="text-primary" />
                Sous-emplacement de {noeudParent.code}
                <span className="font-mono text-xs font-normal normal-case text-muted-foreground">
                  {noeudParent.libelle}
                </span>
              </>
            ) : (
              "Nouvel emplacement racine"
            )}
          </div>
          {noeudParent && (
            <button
              type="button"
              onClick={() => setParentChoisi(null)}
              className="mb-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Créer à la racine plutôt que dans {noeudParent.code}
            </button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Code * (ZONE-ALLEE-RAYON-NIVEAU)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex: MAG-A-01-03"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Libellé</Label>
              <Input
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                placeholder="ex: Allée A, rayon 1, niveau 3"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {/* Les types réellement présents dans les données relevées
                    (ZONE, RAYON, BAC, ATELIER, CASIER, BUREAU…) sont proposés :
                    un vocabulaire restreint à ce que le garage utilise évite
                    d'inventer des emplacements incomparables. */}
                <option value="ZONE">Zone</option>
                <option value="RAYON">Rayon</option>
                <option value="BAC">Bac</option>
                <option value="CASIER">Casier</option>
                <option value="ATELIER">Atelier</option>
                <option value="BUREAU">Bureau</option>
                <option value="SOL">Sol</option>
                <option value="TIROIR">Tiroir</option>
                <option value="FRIGO">Frigo</option>
                <option value="EXTERIEUR">Extérieur</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Zone fonctionnelle</Label>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.zoneStockage}
                onChange={(e) => setForm({ ...form, zoneStockage: e.target.value as (typeof ZONES_STOCKAGE)[number] })}
              >
                {ZONES_STOCKAGE.map((z) => (
                  <option key={z} value={z}>{LABELS_ZONE_STOCKAGE[z]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Capacité (nombre d&apos;articles, optionnel)</Label>
              <Input
                type="number"
                min={1}
                value={form.capacite}
                onChange={(e) => setForm({ ...form, capacite: e.target.value })}
                placeholder="ex: 50"
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2">
              <Check size={14} /> {create.isPending ? "Création..." : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setParentChoisi(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="Rechercher un emplacement (code, libellé)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {nombreEmplacements === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <MapPin size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Aucun emplacement</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Commencez par vos magasins : cinq racines, puis vos allées et rayons en dessous.
              </p>
            </div>
          ) : arbreFiltre.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <Search size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Aucun résultat pour « {search} »</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {arbreFiltre.map((n) => rendreNoeud(n, 0))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={14} className="text-primary" />
            {selected != null ? "Emplacement sélectionné" : "Contenu de l'emplacement"}
          </div>
          {!selected ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <MapPin size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Sélectionnez un emplacement</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pour voir la fiche (zone, capacité, étiquette) et les articles qui y sont stockés.
              </p>
            </div>
          ) : (() => {
            const sel = cheminDe(selected);
            if (!sel) return null;
            return (
              <>
                {/* Fiche : zone fonctionnelle + capacité éditables, avec
                    bouton Enregistrer — jamais de champ libre sans validation. */}
                <div className="mb-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">{sel.code}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => setEtiquetteDe(sel.id)}
                    >
                      <Printer size={13} /> Étiquette
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Zone fonctionnelle</Label>
                      <select
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={sel.zoneStockage ?? "NORMAL"}
                        onChange={(e) => update.mutate({ id: sel.id, zoneStockage: e.target.value as (typeof ZONES_STOCKAGE)[number] })}
                      >
                        {ZONES_STOCKAGE.map((z) => (
                          <option key={z} value={z}>{LABELS_ZONE_STOCKAGE[z]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Capacité (articles)</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1"
                        defaultValue={sel.capacite ?? ""}
                        placeholder="Aucune limite"
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value.trim() === "") {
                            if (sel.capacite != null) update.mutate({ id: sel.id, capacite: null });
                            return;
                          }
                          if (Number.isFinite(n) && n >= 1 && n !== sel.capacite) {
                            update.mutate({ id: sel.id, capacite: Math.floor(n) });
                          }
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {libelleZone(sel.zoneStockage)} — le changement s&apos;enregistre à la sélection,{" "}
                    <span className="whitespace-nowrap">cf.</span> le formulaire initial pour un nouvel emplacement.
                  </p>
                </div>
                <ContenuEmplacement selected={selected} contenu={contenu} />
              </>
            );
          })()}
        </div>
      </div>
      {etiquetteDe != null && (() => {
        const et = ((arbre ?? []) as EmplacementPlat[]).find((e) => e.id === etiquetteDe);
        if (!et) return null;
        return (
          <EtiquetteEmplacement
            emplacement={{
              id: et.id,
              code: et.code,
              libelle: et.libelle,
              type: et.type,
              zoneStockage: et.zoneStockage,
            }}
            fermer={() => setEtiquetteDe(null)}
          />
        );
      })()}
    </div>
  );
}