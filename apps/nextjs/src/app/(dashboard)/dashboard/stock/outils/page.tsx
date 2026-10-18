"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hand,
  Loader2,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";

/**
 * LE PARC D'OUTILS — « j'ai quatre clés, elles sont numérotées 1 à 4 »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 *
 * Le stock ne sait dire qu'une chose : combien. « 4 clés dynamométriques ».
 * Il ne sait pas que la n° 3 est sur l'établi du Michelin, que la n° 1 est
 * à l'étalonnage, et que la n° 2 a été perdue dans une fuite de liquide de
 * frein. Sans cela, un magasinier voit « 4 disponibles » et prête la
 * quatrième clé — déjà partie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SUIVI EST UN CHOIX, PAS UNE DÉFAUT
 *
 * Suivre chaque pièce coûte un numéro à saisir et un état à maintenir. Pour
 * un jeu de tournevis, c'est absurde ; pour une clé étalonnée dont on doit
 * rendre compte au client, c'est obligatoire. D'où le bouton « Suivre
 * pièce par pièce » : c'est le gestionnaire qui décide, outil par outil.
 *
 * Tant qu'un outil n'est pas suivi, on montre son STOCK, pas un parc : ce ne
 * sont pas les mêmes nombres et l'écran ne doit pas laisser croire que si.
 */

const ETAT_LABELS: Record<string, string> = {
  DISPONIBLE: "Disponible",
  PRETE: "Prêtée",
  REPARATION: "En réparation",
  USE: "Usée",
  CASSE: "Cassée",
  PERDU: "Perdue",
  VOLE: "Volée",
  REFORME: "Réformée",
};

/**
 * Le nombre de pièces hors service est affiché, pas recalculé ici : c'est
 * `outillage.parc` qui sait décompter les états, et le faire à deux endroits
 * ferait diverger les chiffres à la première evolution.
 */

export default function ParcOutilsPage() {
  const { hasPermission } = usePermissions();
  const peutGerer = hasPermission("stock.utiliser") || hasPermission("stock.modifier");
  const peutConsulter = hasPermission("stock.consulter");
  const utils = api.useUtils();

  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [suiviEnCours, setSuiviEnCours] = useState<number | null>(null);

  const liste = api.outillage.list.useQuery(
    { type: "OUTIL", limit: 300 },
    { enabled: peutConsulter },
  );
  const parc = api.outillage.parc.useQuery(undefined, { enabled: peutConsulter });
  const exemples = api.outillage.exemplesParProduit.useQuery(
    { produitIds: ouvert ? [ouvert] : [] },
    { enabled: ouvert !== null },
  );

  const outils = useMemo(() => {
    const tous = liste.data ?? [];
    const q = recherche.trim().toLowerCase();
    if (!q) return tous;
    return tous.filter(
      (o) =>
        o.titre.toLowerCase().includes(q) ||
        (o.codeBarre ?? "").toLowerCase().includes(q) ||
        (o.codeArticle ?? "").toLowerCase().includes(q),
    );
  }, [liste.data, recherche]);

  const compteParProduit = useMemo(() => {
    const m = new Map<number, { total: number; disponibles: number; pretes: number; horsService: number; suivi: boolean }>();
    for (const p of parc.data ?? []) m.set(p.produitId, p);
    return m;
  }, [parc.data]);

  function invalider() {
    return Promise.all([
      utils.outillage.list.invalidate(),
      utils.outillage.parc.invalidate(),
      utils.outillage.exemplesParProduit.invalidate(),
      utils.outillage.pretsEnCours.invalidate(),
      utils.outillage.get.invalidate(),
    ]);
  }

  const initierSuivi = api.outillage.initialiserExemplaires.useMutation({
    onSuccess: async (r) => {
      toast.success(
        r.crees > 0
          ? `${r.crees} pièce(s) enregistrée(s)`
          : "Les pièces sont déjà enregistrées",
        {
          description:
            r.dejaLa > 0
              ? `${r.dejaLa} numéro(s) existaient déjà.`
              : "Elles sont maintenant suivies une par une.",
        },
      );
      await invalider();
    },
    onError: (e) => toast.error("Suivi impossible", { description: e.message }),
  });

  const changerEtat = api.outillage.setEtatExemplaire.useMutation({
    onSuccess: async () => {
      toast.success("État enregistré");
      await invalider();
    },
    onError: (e) => toast.error("État refusé", { description: e.message }),
  });

  const setSuivi = api.outillage.setSuivi.useMutation({
    onSuccess: async () => {
      toast.success("Suivi individuel désactivé");
      setOuvert(null);
      await invalider();
    },
    onError: (e) => toast.error("Impossible", { description: e.message }),
  });

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter l&apos;outillage.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-xl font-black tracking-tight">Parc d&apos;outils</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivez les pièces une par une là où ça compte : clés étalonnées, matériel
          coûteux, outils qu&apos;on doit pouvoir facturer.
        </p>
      </header>

      {/* Recherche — obligatoire dès que la liste dépasse une dizaine d'outils. */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un outil…"
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Rechercher un outil"
        />
      </div>

      {liste.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : liste.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Le parc n&apos;a pas pu être chargé.</p>
          <p className="mt-1 text-muted-foreground">{liste.error.message}</p>
        </div>
      ) : outils.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Wrench size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium">
            {recherche ? "Aucun outil ne correspond" : "Aucun outil enregistré"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {recherche
              ? "Essayez un autre terme, ou effacez la recherche."
              : "Créez d'abord vos outils depuis le catalogue, en type OUTIL."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {outils.map((o) => {
            const c = compteParProduit.get(o.id);
            const estOuvert = ouvert === o.id;
            return (
              <li key={o.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setOuvert(estOuvert ? null : o.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.titre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {o.codeBarre}
                      {o.typeOutil ? ` · ${o.typeOutil}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {c?.suivi ? (
                      <span className="text-sm">
                        <strong className="font-mono">{c.disponibles}</strong>
                        <span className="text-muted-foreground"> / {c.total}</span>
                        <span className="block text-xs text-muted-foreground">pièces prêtes</span>
                      </span>
                    ) : (
                      <span className="text-sm">
                        <strong className="font-mono">{Number(o.stockTotal ?? 0)}</strong>
                        <span className="block text-xs text-muted-foreground">en stock</span>
                      </span>
                    )}
                  </span>
                </button>

                {estOuvert && (
                  <div className="space-y-3 border-t border-border bg-muted/20 px-3 py-3">
                    {!c?.suivi ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                          Suivi « en gros » : l&apos;outil compte {Number(o.stockTotal ?? 0)} pièce(s),
                          sans numéro. On ne saura pas laquelle est partie.
                        </p>
                        <Button
                          size="sm"
                          disabled={!peutGerer || initierSuivi.isPending || Number(o.stockTotal ?? 0) <= 0}
                          onClick={() => {
                            setSuiviEnCours(o.id);
                            initierSuivi.mutate({
                              produitId: o.id,
                              emplacementId: o.emplacementPrincipalId ?? null,
                            });
                          }}
                        >
                          {initierSuivi.isPending && suiviEnCours === o.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Plus size={14} />
                          )}
                          Suivre pièce par pièce
                        </Button>
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-1">
                          {(exemples.data ?? []).map((e) => (
                            <li
                              key={e.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="font-mono text-sm font-semibold">{e.numero}</span>
                                <span
                                  className={
                                    e.etat === "DISPONIBLE"
                                      ? "text-xs text-emerald-600 dark:text-emerald-400"
                                      : "text-xs text-muted-foreground"
                                  }
                                >
                                  {ETAT_LABELS[e.etat] ?? e.etat}
                                </span>
                                {e.emplacementCode && (
                                  <span className="text-xs text-muted-foreground">
                                    · {e.emplacementCode}
                                  </span>
                                )}
                              </span>

                              {peutGerer && !e.pretId && (
                                <select
                                  value={e.etat}
                                  onChange={(ev) =>
                                    changerEtat.mutate({
                                      exemplaireId: e.id,
                                      etat: ev.target.value as never,
                                    })
                                  }
                                  disabled={changerEtat.isPending}
                                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                                  aria-label={`État de la pièce ${e.numero}`}
                                >
                                  <option value="DISPONIBLE">Disponible</option>
                                  <option value="REPARATION">En réparation</option>
                                  <option value="USE">Usée</option>
                                  <option value="CASSE">Cassée</option>
                                  <option value="PERDU">Perdue</option>
                                  <option value="VOLE">Volée</option>
                                  <option value="REFORME">Réformée</option>
                                </select>
                              )}
                              {e.pretId && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Hand size={12} /> chez un technicien
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>

                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          Une pièce {c.disponibles} sur {c.total} est encore déplaçable.
                          {c.pretes > 0 && ` ${c.pretes} sont prêtées.`}
                          {c.horsService > 0 && ` ${c.horsService} sont hors service.`}
                        </p>

                        {peutGerer && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSuivi.mutate({ produitId: o.id, suivi: false })}
                            disabled={setSuivi.isPending}
                          >
                            <X size={14} /> Arrêter le suivi individuel
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
        Les numéros sont proposés d&apos;après le stock réel. Un numéro déjà pris
        n&apos;est pas recréé : relancer l&apos;opération ne fait pas de doublon.
      </p>
    </div>
  );
}