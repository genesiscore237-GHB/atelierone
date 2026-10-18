"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Droplets,
  Loader2,
  Lock,
  PackageOpen,
  Repeat,
} from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";

/**
 * CONTENANTS — l'huile en fût.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN RÉPOND À DEUX QUESTIONS, ET RIEN D'AUTRE
 *
 *   1. « Ces fûts sont fermés. Lequel j'ouvre ? »
 *   2. « Ceux que j'ai ouverts, il en reste combien, et jusqu'à quand ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DLC EST LE POINT QUI CHANGE TOUT
 *
 * Un fût fermé se garde des années. Un fût ouvert s'oxyde : il ne tient
 * généralement que quelques mois. Le même Bidon n'a donc pas la même date
 * limite selon qu'il sort du fond du magasin ou d'un fût décapsulé hier.
 *
 * C'est pour cela que l'ouverture est une ACTION, et non un champ :
 * elle horodate le contenant, et tout ce qui en découle — la DLC des
 * bidons, l'ordre de consommation, l'alerte — se déduit de cette date.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FACTEUR N'EST JAMAIS DEMANDÉ À L'UTILISATEUR
 *
 * « Combien de bidons dans ce fût ? » se CALCULE, depuis les tables
 * d'unités. Le laisser saisir ce nombre serait inviter à saisir 208 bidons
 * dans un fût de 208 litres, ou 1 — et les deux sont acceptables par le
 * système. Une quantité calculée puis affichée, validée d'un coup d'œil,
 * ne se saisit pas.
 */

function joursRestants(dlc: string | null): number | null {
  if (!dlc) return null;
  const cible = new Date(`${dlc}T00:00:00`);
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  return Math.round((cible.getTime() - auj.getTime()) / 86_400_000);
}

/**
 * Panneau de déconditionnement d'un fût.
 *
 * Deux choix seulement — l'article qui reçoit, et l'unité voulue. Le
 * NOMBRE EST CALCULÉ et affiché avant validation : un contenu que
 * l'utilisateur vérifie d'un coup d'œil ne se saisit pas. Saisir « combien
 * de bidons » pour une opération entièrement déterminée par le
 * conditionnement serait inviter à taper 208 bidons dans un fût de
 * 208 litres… ou 1.
 */
function PanneauDeconditionnement({
  lotId,
  numeroLot,
  onClose,
  onFait,
}: {
  lotId: number;
  numeroLot: string;
  onClose: () => void;
  onFait: () => void;
}) {
  const { data: options, isLoading } = api.stockContenants.optionsDeconditionnement.useQuery({ lotId });
  const [uniteSource, setUniteSource] = useState("");
  const [produitCible, setProduitCible] = useState<number | "">("");
  const [uniteCible, setUniteCible] = useState("");

  const mutation = api.stockContenants.deconditionner.useMutation({
    onSuccess: (r) => {
      toast.success("Unités produites et tracées", {
        description: r.dlcCible
          ? `Rattachées au lot ${numeroLot}, valables jusqu'au ${r.dlcCible}.`
          : `Rattachées au lot ${numeroLot}.`,
      });
      onFait();
    },
    onError: (e) => toast.error("Déconditionnement refusé", { description: e.message }),
  });

  if (isLoading) {
    return <div className="mt-2 h-16 animate-pulse rounded-lg bg-muted" />;
  }
  if (!options) return null;

  const uniteSrc = options.unitesSource.find((u) => u.id === uniteSource);
  const cible = options.cibles.find((c) => c.produitId === produitCible);
  const uniteCibleChoisie = cible?.unites.find((u) => u.id === uniteCible);

  /** Unités cible par unité source — la même formule que le service. */
  const facteur = uniteSrc && uniteCibleChoisie ? uniteSrc.facteur / uniteCibleChoisie.facteur : null;
  const quantiteCible = facteur ? Math.round(facteur * 100) / 100 : null;

  const incomplet = options.lot.produitId === produitCible ? true : false;
  const pret =
    uniteSrc != null && uniteCibleChoisie != null && facteur != null && !incomplet;

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Contenu de <strong className="font-mono">{numeroLot}</strong> —rez le nombre de bidons,
        il est calculé.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="text-muted-foreground">Unité du fût</span>
          <select
            value={uniteSource}
            onChange={(e) => setUniteSource(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {options.unitesSource.map((u) => (
              <option key={u.id} value={u.id}>
                {u.libelle}
                {u.facteur > 1 && ` (${u.facteur} L)`}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-muted-foreground">Article produit</span>
          <select
            value={produitCible}
            onChange={(e) => {
              setProduitCible(e.target.value ? Number(e.target.value) : "");
              setUniteCible("");
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {options.cibles.map((c) => (
              <option key={c.produitId} value={c.produitId}>
                {c.titre}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-muted-foreground">Unité obtenue</span>
          <select
            value={uniteCible}
            onChange={(e) => setUniteCible(e.target.value)}
            disabled={!cible}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">—</option>
            {(cible?.unites ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.libelle}
              </option>
            ))}
          </select>
        </label>
      </div>

      {quantiteCible != null && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          1 × {uniteSrc?.libelle} → <strong>{quantiteCible}</strong> ×{" "}
          {uniteCibleChoisie?.libelle} ·{" "}
          <span className="text-muted-foreground">
            ce lot portera sa date d&apos;ouverture et sa propre DLC
          </span>
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!pret || mutation.isPending}
          onClick={() =>
            mutation.mutate({
              lotId,
              uniteSourceId: uniteSource,
              uniteCibleId: uniteCible,
              produitCibleId:
                produitCible === "" || incomplet ? undefined : Number(produitCible),
              quantiteSource: 1,
            })
          }
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
          Déconditionner
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

export default function ContenantsPage() {
  const utils = api.useUtils();

  const { data: scelles, isLoading } = api.stockContenants.scelles.useQuery();
  const { data: ouverts, isLoading: chargementOuverts } = api.stockContenants.ouverts.useQuery();

  const [ouvert, setOuvert] = useState(false);
  const [periode, setPeriode] = useState("180");
  const [reference, setReference] = useState("");
  const [contenu, setContenu] = useState("");
  const [contenuLot, setContenuLot] = useState<number | null>(null);
  const [sortirLot, setSortirLot] = useState<number | null>(null);

  const ouvrirMutation = api.stockContenants.ouvrir.useMutation({
    onSuccess: async (r) => {
      if (r.dejaOuvert) {
        toast.info("Déjà ouvert", {
          description: `Date d'ouverture conservée : ${r.dateOuverture}. Rien n'a été modifié.`,
        });
      } else {
        toast.success(`Contenant ${r.numeroLot ?? ""} ouvert`.trim() || "Contenant ouvert", {
          description: r.dlc
            ? `Les unités qui en sortiront seront valables jusqu'au ${r.dlc}.`
            : undefined,
        });
      }
      setOuvert(false);
      setContenuLot(null);
      await Promise.all([
        utils.stockContenants.scelles.invalidate(),
        utils.stockContenants.ouverts.invalidate(),
        utils.stock.dlcAlertes.invalidate(),
      ]);
    },
    onError: (e) => toast.error("Ouverture refusée", { description: e.message }),
  });


  const lotsUtilisables = (scelles ?? []).filter((l) => Number(l.quantiteEnStock) > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl font-black tracking-tight">Contenants & DLC</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ouvrir un fût change la date limite de son contenu. Un fût fermé se garde des années ;
          une fois ouvert, il s&apos;oxyde.
        </p>
      </header>

      {/* ── Contenants ouverts : l'info du jour ─────────────────────────── */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <CalendarClock size={15} className="text-primary" />
          Contenants ouverts
        </h2>

        {chargementOuverts ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : !ouverts || ouverts.length === 0 ? (
          <EmptyState
            icon={<Droplets size={36} />}
            title="Aucun contenant ouvert"
            description="Ouvrez un fût ci-dessous pour que ses bidons soient tracés et datés."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Article / lot</th>
                  <th className="hidden px-3 py-2 text-left sm:table-cell">Ouvert le</th>
                  <th className="px-3 py-2 text-right">Restant</th>
                  <th className="px-3 py-2 text-right">DLC effective</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ouverts.map((c) => {
                  const reste = joursRestants(String(c.dlc_effective ?? ""));
                  const epuise = c.statut === "epuise";
                  return (
                    <tr key={String(c.lot_id)} className={c.est_bloque ? "bg-destructive/5" : "bg-background"}>
                      <td className="px-3 py-2">
                        <span className="block font-medium">{String(c.titre)}</span>
                        <span className="block text-xs text-muted-foreground">
                          lot {String(c.numero_lot)}
                          {c.lot_source_id != null && " · issu d'un fût"}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                        {c.date_ouverture
                          ? new Date(String(c.date_ouverture)).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {c.contenu_restant != null ? (
                          <>
                            {c.contenu_restant} L
                            {c.contenu_source != null && (
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                / {c.contenu_source}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">{Number(c.quantite_en_stock)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.est_bloque ? (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <Lock size={12} /> bloqué
                          </span>
                        ) : reste == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : reste < 0 ? (
                          <span className="font-semibold text-destructive">
                            périmé depuis {Math.abs(reste)} j
                          </span>
                        ) : reste <= 30 ? (
                          <span className="font-semibold text-warning-foreground">
                            {reste} j
                          </span>
                        ) : epuise ? (
                          <span className="text-muted-foreground">vide</span>
                        ) : (
                          <span className="text-muted-foreground">{reste} j</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Contenants scellés : l'action ───────────────────────────────── */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <PackageOpen size={15} className="text-primary" />
          Fûts à ouvrir
        </h2>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : lotsUtilisables.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Aucun fût scellé en stock. Un fût apparaît ici après une réception avec numéro de lot.
          </div>
        ) : (
          <div className="space-y-2">
            {lotsUtilisables.map((l) => (
              <div key={l.lotId} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.titre}</p>
                    <p className="text-xs text-muted-foreground">
                      lot {l.numeroLot} · {Number(l.quantiteEnStock)} en stock
                      {l.datePeremption &&
                        ` · DLC fabricant ${new Date(l.datePeremption).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                  {!ouvert || contenuLot !== l.lotId ? (
                    <Button
                      size="sm"
                      disabled={l.estBloque || ouvrirMutation.isPending}
                      onClick={() => {
                        setContenuLot(l.lotId);
                        setOuvert(true);
                      }}
                    >
                      Ouvrir
                    </Button>
                  ) : null}
                </div>

                {l.estBloque && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <Lock size={12} className="mt-0.5 shrink-0" />
                    {l.motifBlocage ?? "Lot bloqué"} — impossible d'ouvrir un lot rappelé.
                  </p>
                )}

                {/* Ouverture : ondate, on PERIODICITE et sa SOURCE */}
                {ouvert && contenuLot === l.lotId && (
                  <div className="mt-3 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      La DLC du contenant <strong>fermé</strong> reste celle du fabricant. C&apos;est
                      la date d&apos;ouverture qui détermine celle des bidons.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block text-xs">
                        <span className="text-muted-foreground">Ouvert le</span>
                        <input
                          type="date"
                          defaultValue={new Date().toISOString().slice(0, 10)}
                          onChange={() => undefined}
                          id={`ouv-${l.lotId}`}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="text-muted-foreground">Tient après ouverture (jours)</span>
                        <input
                          type="number"
                          min={1}
                          value={periode}
                          onChange={(e) => setPeriode(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="text-muted-foreground">Contenu (litres)</span>
                        <input
                          type="number"
                          min={1}
                          value={contenu}
                          onChange={(e) => setContenu(e.target.value)}
                          placeholder="208"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                    <label className="block text-xs">
                      <span className="text-muted-foreground">
                        D&apos;où vient ce délai (notice, constructeur, usage)
                      </span>
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="ex. Castrol — notice constructeur Renault"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={ouvrirMutation.isPending}
                        onClick={() =>
                          ouvrirMutation.mutate({
                            lotId: l.lotId,
                            dateOuverture:
                              (document.getElementById(`ouv-${l.lotId}`) as HTMLInputElement | null)
                                ?.value || undefined,
                            periodiciteJours: Number(periode) || undefined,
                            reference: reference.trim() || undefined,
                            contenuSource: contenu ? Number(contenu) : undefined,
                          })
                        }
                      >
                        {ouvrirMutation.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Confirmer l&apos;ouverture
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOuvert(false);
                          setContenuLot(null);
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}

                {/* Déconditionnement — accessible une fois ouvert */}
                <div className="mt-2 border-t border-border pt-2">
                  {sortirLot === l.lotId ? (
                    <PanneauDeconditionnement
                      lotId={l.lotId}
                      numeroLot={l.numeroLot}
                      onClose={() => setSortirLot(null)}
                      onFait={() => {
                        setSortirLot(null);
                        void Promise.all([
                          utils.stockContenants.scelles.invalidate(),
                          utils.stockContenants.ouverts.invalidate(),
                          utils.stock.getDashboard.invalidate(),
                        ]);
                      }}
                    />
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setSortirLot(l.lotId)}>
                      <Repeat size={14} /> Déconditionner
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Un contenant déjà ouvert conserve sa date d&apos;ouverture : rouvrir nevtkdoit pas
        accorder plusieurs mois de conservation par erreur.
      </p>
    </div>
  );
}