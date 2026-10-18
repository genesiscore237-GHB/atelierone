"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";

/**
 * TRANSFERT — « cette pièce n'est pas à sa place ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN TRANSFERT EST UNE SEULE OPÉRATION
 *
 * L'ancienne version appelait `stock.transferer` une fois par LIGNE, en
 * parallèle. Si la troisième ligne échouait, les deux premières étaient déjà
 * appliquées dans des transactions séparées : le magasinier lisait
 * « transfert effectué » et le stock ne correspondait plus. Ici, toutes les
 * lignes partent dans UNE transaction : soit tout bouge, soit rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON TRANSFÈRE CE QUI EST RÉELLEMENT AU SOURCE
 *
 * Choisir un emplacement fait apparaître son contenu. Le magasinier
 * transfère donc des pièces qu'il VOIT, et non des quantités imaginées. La
 * quantité disponible est rappelée à chaque ligne, et une quantité
 * supérieure est refusée avant l'envoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUS LES TYPES D'EMPLACEMENT, PAS SEULEMENT LES RAYONS
 *
 * `listRayons` ne renvoyait que les `type = 'RAYON'`. Or le relevé compte des
 * BAC, des CASIER, des ZONE, des ATELIER et un BUREAU — et c'est
 * précisément là que finissent les pièces du garage. Transférer vers un
 * bureau était impossible ; c'est le geste le plus courant du besoin n°6.
 */

type Ligne = {
  cle: number;
  produitId: number;
  titre: string;
  quantite: number;
  uniteId: string | null;
  /** Ce qu'il reste vraiment à la source, au moment de la saisie. */
  disponibleALaSource: number;
};

export default function TransfertPage() {
  const utils = api.useUtils();

  const [sourceId, setSourceId] = useState<number | "">("");
  const [cibleId, setCibleId] = useState<number | "">("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [cleSuivante, setCleSuivante] = useState(1);

  // Tous les emplacements, pas seulement les rayons : voir l'en-tête.
  const { data: emplacements } = api.stock.arborescenceEmplacements.useQuery({});
  // Le serveur renvoie une liste PLATE (pas un type récursif : voir la note
  // sur `aplatir`). La reconstruction de l'arbre est donc un état du client.
  const tous = useMemo(() => {
    const parId = new Map<number, Noeud>();
    for (const r of emplacements ?? []) parId.set(r.id, { ...r, enfants: [] });
    const racines: Noeud[] = [];
    for (const n of parId.values()) {
      const parent = n.parentId != null ? parId.get(n.parentId) : null;
      // Un parent absent de l'agence ne fait pas disparaître le fils : on le
      // remonte en racine. Le mieux est de le voir.
      if (parent) parent.enfants.push(n);
      else racines.push(n);
    }
    return aplatir(racines);
  }, [emplacements]);

  // Le contenu de la source : c'est la matière première de l'écran.
  const { data: contenu, isFetching: chargementContenu } = api.stock.stockParEmplacement.useQuery(
    { emplacementId: Number(sourceId) || 0 },
    { enabled: sourceId !== "" },
  );

  const transferer = api.stock.transfererLot.useMutation({
    onSuccess: async (r) => {
      toast.success(`${r.lignes} pièce(s) déplacée(s)`, {
        description: "Le stock et les mouvements sont à jour.",
      });
      setLignes([]);
      await Promise.all([
        utils.stock.stockParEmplacement.invalidate(),
        utils.stock.getDashboard.invalidate(),
        utils.stock.arborescenceEmplacements.invalidate(),
      ]);
    },
    onError: (e) => toast.error("Transfert refusé", { description: e.message }),
  });

  const disponibles = useMemo(
    () => (contenu ?? []).filter((c) => c.disponible > 0 && !lignes.some((l) => l.produitId === c.produitId)),
    [contenu, lignes],
  );

  const ajouter = (produitId: number, titre: string, disponible: number) => {
    setLignes((l) => [
      ...l,
      { cle: cleSuivante, produitId, titre, quantite: 1, uniteId: null, disponibleALaSource: disponible },
    ]);
    setCleSuivante((c) => c + 1);
  };

  const sortieExcessive = lignes.filter((l) => l.quantite > l.disponibleALaSource);
  const pret =
    sourceId !== "" && cibleId !== "" && lignes.length > 0 && sortieExcessive.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-black tracking-tight">Transfert</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Déplacez des pièces d&apos;un endroit à un autre. Tout bouge ensemble, ou rien ne bouge.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value ? Number(e.target.value) : "");
              setLignes([]);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Emplacement source"
          >
            <option value="">— d&apos;où ? —</option>
            {tous.map((e) => (
              <option key={e.id} value={e.id}>
                {e.libelle ? `${e.libelle} (${e.code})` : e.code} · {e.type}
              </option>
            ))}
          </select>

          <ArrowLeftRight size={18} className="mx-auto shrink-0 text-muted-foreground" />

          <select
            value={cibleId}
            onChange={(e) => setCibleId(e.target.value ? Number(e.target.value) : "")}
            disabled={sourceId === ""}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Emplacement destination"
          >
            <option value="">— vers où ? —</option>
            {tous
              .filter((e) => e.id !== sourceId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle ? `${e.libelle} (${e.code})` : e.code} · {e.type}
                </option>
              ))}
          </select>
        </div>
      </section>

      {sourceId === "" ? (
        <EmptyState
          icon={<ArrowLeftRight size={40} />}
          title="Choisissez d'où partent les pièces"
          description="Sélectionnez un emplacement : son contenu s'affichera, et vous n'aurez plus qu'à cocher ce qui doit bouger."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Ce qu&apos;il y a à la source
          </h2>

          {chargementContenu ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          ) : disponibles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Cet emplacement ne contient rien de transférable.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {disponibles.map((c) => (
                <button
                  key={c.produitId}
                  type="button"
                  onClick={() => ajouter(c.produitId, c.titre, c.disponible)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.titre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.codeBarre}
                      {c.quantiteReservee > 0 && ` · ${c.quantiteReservee} réservé(s)`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm">{c.disponible}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {lignes.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Pièce</th>
                <th className="px-3 py-2 text-right">Disponible</th>
                <th className="px-3 py-2 text-right">À déplacer</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => {
                const excessif = l.quantite > l.disponibleALaSource;
                return (
                  <tr key={l.cle} className={excessif ? "bg-destructive/5" : "bg-background"}>
                    <td className="px-3 py-2 font-medium">{l.titre}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {l.disponibleALaSource}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={l.quantite || ""}
                        onChange={(e) =>
                          setLignes((x) =>
                            x.map((y) =>
                              y.cle === l.cle ? { ...y, quantite: Number(e.target.value) } : y,
                            ),
                          )
                        }
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label={`Quantité à déplacer pour ${l.titre}`}
                      />
                      {excessif && (
                        <p className="mt-1 text-xs text-destructive">
                          Il n&apos;y a que {l.disponibleALaSource} à la source.
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Retirer ${l.titre}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {lignes.length > 0 && (
        <section className="sticky bottom-0 space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package size={13} />
            {lignes.length} pièce(s) · {lignes.reduce((s, l) => s + l.quantite, 0)} unité(s)
          </p>
          <Button
            className="w-full"
            disabled={!pret || transferer.isPending}
            onClick={() =>
              sourceId !== "" &&
              cibleId !== "" &&
              transferer.mutate({
                emplacementSourceId: Number(sourceId),
                emplacementCibleId: Number(cibleId),
                lignes: lignes.map((l) => ({
                  produitId: l.produitId,
                  quantite: l.quantite,
                  uniteId: l.uniteId,
                })),
              })
            }
          >
            {transferer.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Déplacer {lignes.length} pièce(s)
          </Button>
        </section>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Une quantité supérieure à ce que contient la source est refusée avant l&apos;envoi, et
        l&apos;ensemble est annulé si une seule ligne échoue.
      </p>
    </div>
  );
}

/** Un nœud de l'arborescence des emplacements. */
type Noeud = {
  id: number;
  parentId?: number | null;
  code: string;
  libelle: string | null;
  type: string;
  enfants: Noeud[];
};

/**
 * Aplatit l'arborescence en une liste, en gardant une indentation lisible.
 *
 * `ArborescenceEmplacements` renvoie une liste PLATE triée par profondeur puis
 * par code, avec le `parentId` résolu : c'est le client qui reconstruit
 * l'arbre. Le serveur n'a volontairement pas de type récursif dans la valeur
 * de retour d'un router — cela fait exploser l'inférence de tRPC pour tout le
 * projet (cf. cadrage § 10).
 */
function aplatir(noeuds: Noeud[], prefixe = ""): Omit<Noeud, "enfants">[] {
  const sortie: Omit<Noeud, "enfants">[] = [];
  for (const n of noeuds) {
    const libelle = n.libelle ? `${prefixe}${n.libelle}` : `${prefixe}${n.code}`;
    sortie.push({ id: n.id, code: n.code, libelle, type: n.type });
    sortie.push(...aplatir(n.enfants ?? [], `${prefixe}  `));
  }
  return sortie;
}