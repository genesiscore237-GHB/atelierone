"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BellRing, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { EmptyState } from "~/components/ui/empty-state";
import { usePermissions } from "~/hooks/usePermissions";
import { cn } from "~/lib/utils";
import { ALERTE_META } from "~/server/lib/atelier-service";
import { ALERTE_CODE_LABELS } from "~/app/(dashboard)/dashboard/garage/_components/statuts";
import {
  GRAVITE_META,
  SOURCE_META,
  graviteAtelier,
  graviteParking,
  graviteStock,
  graviteSysteme,
  trierAlertes,
  type GraviteAlerte,
  type SourceAlerte,
} from "~/lib/alertes-centrales";

/**
 * P2.2 — une seule file d'alertes, cinq sources.
 *
 * Chaque module avait sa page : atelier, parking, stock, système. Pour savoir
 * ce qui brûle aujourd'hui, il fallait les visiter une par une — et comparer
 * des codes de gravité qui ne se ressemblent pas (`RETARD`, `CRITIQUE`,
 * `rupture`, `HIGH`). Ici, une ligne = une action, avec la même échelle.
 *
 * La page n'écrit rien : elle agrège les procédures existantes, donc elle ne
 * peut pas inventer une alerte que son module ne connaît pas. Les requêtes
 * sont activées selon les permissions de l'utilisateur : un magasinier ne
 * déclenche pas un Forbidden pour voir les alertes du magasin.
 */

type AlerteCentrale = {
  id: string;
  source: SourceAlerte;
  gravite: GraviteAlerte;
  titre: string;
  detail: string;
  proprietaire: string;
  href: string;
  date?: Date | string | null;
  meta?: string;
};

const GRAVITES: GraviteAlerte[] = ["CRITIQUE", "HAUTE", "MOYENNE", "BASSE"];
const SOURCES: SourceAlerte[] = ["atelier", "parking", "stock", "finance", "systeme"];

const STOCK_NIVEAU_LABELS: Record<string, string> = {
  rupture: "Rupture",
  critique: "Critique",
  faible: "Faible",
};

function texte(...valeurs: unknown[]): string {
  return valeurs
    .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    .map(String)
    .join(" · ");
}

function dateLisible(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CentreAlertes() {
  const { hasPermission, hasAnyPermission, user, isLoading: permissionsEnCours } = usePermissions();

  const peutAtelier = hasPermission("or.consulter");
  const peutParking = hasPermission("parking.consulter");
  const peutStock = hasPermission("stock.consulter");
  // `finance.getDebts` est gardé par un rôle, pas seulement par une permission :
  // un profil « consultation » possède `comptabilite.rapport` sans pouvoir
  // appeler la procédure. Sans ce filtre, la page afficherait un 403 permanent.
  const roleFinance = ["comptable", "superadmin", "directeur"].includes(user?.role ?? "");
  const peutFinance = roleFinance && hasAnyPermission(["comptabilite.rapport", "comptabilite.depense.lire"]);

  const atelier = api.or.getAlertes.useQuery(undefined, {
    enabled: !permissionsEnCours && peutAtelier,
    refetchInterval: 30_000,
  });
  const parking = api.garage.alertes.useQuery(
    { statut: "OUVERTE", limit: 200 },
    { enabled: !permissionsEnCours && peutParking, refetchInterval: 30_000 },
  );
  const stock = api.stock.getAlertes.useQuery(undefined, {
    enabled: !permissionsEnCours && peutStock,
    refetchInterval: 30_000,
  });
  const prets = api.outillage.pretsEnCours.useQuery(undefined, {
    enabled: !permissionsEnCours && peutStock,
    refetchInterval: 30_000,
  });
  const dlc = api.stock.dlcAlertes.useQuery(
    { seuilJours: 30 },
    { enabled: !permissionsEnCours && peutStock, refetchInterval: 60_000 },
  );
  const antivol = api.stock.getAlertesAntiVol.useQuery(undefined, {
    enabled: !permissionsEnCours && peutStock,
    refetchInterval: 60_000,
  });
  const dettes = api.finance.getDebts.useQuery(
    { status: "OVERDUE" },
    { enabled: !permissionsEnCours && peutFinance, refetchInterval: 60_000 },
  );
  const systeme = api.alert.getActiveAlerts.useQuery(undefined, { refetchInterval: 60_000 });

  const [q, setQ] = useState("");
  const [fGravite, setFGravite] = useState<GraviteAlerte | "">("");
  const [fSource, setFSource] = useState<SourceAlerte | "">("");

  const alertes = useMemo<AlerteCentrale[]>(() => {
    const sortie: AlerteCentrale[] = [];

    // ── Atelier : un dossier peut figurer dans enRetard, bloques, p1 et
    //    proches. On le garde une fois, avec tous ses codes.
    const parOr = new Map<number, any>();
    const brutesAtelier = [
      ...(atelier.data?.enRetard ?? []),
      ...(atelier.data?.bloques ?? []),
      ...(atelier.data?.p1NonTermines ?? []),
      ...(atelier.data?.proches ?? []),
    ] as any[];
    for (const l of brutesAtelier) {
      if (typeof l.id !== "number") continue;
      const deja = parOr.get(l.id);
      if (deja) {
        deja.alertes = [...new Set([...(deja.alertes ?? []), ...(l.alertes ?? [])])];
      } else {
        parOr.set(l.id, { ...l, alertes: [...(l.alertes ?? [])] });
      }
    }
    for (const l of parOr.values()) {
      const codes = (l.alertes ?? []) as string[];
      const alertesLisible = codes
        .map((c) => ALERTE_META[c as keyof typeof ALERTE_META]?.libelle ?? c)
        .join(", ");
      const responsable = [l.responsablePrenom, l.responsableNom].filter(Boolean).join(" ").trim();
      sortie.push({
        id: `atelier:${l.id}`,
        source: "atelier",
        gravite: graviteAtelier(codes),
        titre: `${l.numero ?? "OR"} · ${l.immatriculation ?? "—"}`,
        detail:
          texte(
            l.clientDisplay,
            l.plainte,
            l.raisonBlocage ? `Blocage : ${l.raisonBlocage}` : null,
          ) || "Dossier d'atelier à traiter.",
        proprietaire: responsable || "Atelier",
        href: `/dashboard/ordres-reparation/${l.id}`,
        date: l.datePromesse ?? l.dateOuverture ?? null,
        meta: texte(
          l.joursImmobilisation != null ? `Immobilisé ${l.joursImmobilisation} j` : null,
          l.retardJours > 0 ? `Retard ${l.retardJours} j` : null,
          alertesLisible,
        ),
      });
    }

    // ── Parking
    for (const a of (parking.data?.alertes ?? []) as any[]) {
      sortie.push({
        id: `parking:${a.id}`,
        source: "parking",
        gravite: graviteParking(a.niveau),
        titre: `${ALERTE_CODE_LABELS[a.code] ?? a.code} · #${a.vehicule?.numRegistre ?? "—"}`,
        detail: a.message || "Alerte parking à traiter.",
        proprietaire: "Parking",
        href: `/dashboard/garage/vehicules/${a.vehicleId}`,
        date: a.declencheeLe ?? null,
        meta: texte(
          a.vehicule?.immatriculation,
          [a.vehicule?.marque, a.vehicule?.modele].filter(Boolean).join(" "),
        ),
      });
    }

    // ── Stock : ruptures/critiques/faibles
    for (const a of (stock.data ?? []) as any[]) {
      sortie.push({
        id: `stock:${a.id}`,
        source: "stock",
        gravite: graviteStock(a.niveau),
        titre: `${STOCK_NIVEAU_LABELS[a.niveau] ?? a.niveau ?? "Stock"} · ${a.titre}`,
        detail: `Stock ${a.quantite} / seuil ${a.seuilAlerte}${a.seuilCritique ? ` (critique ${a.seuilCritique})` : ""}.`,
        proprietaire: "Magasinier",
        href: "/dashboard/stock/alertes",
        meta: texte(a.categorie, a.codeBarre),
      });
    }

    // ── Outillage prêté en retard (les prêts à l'heure ne sont pas des alertes)
    for (const p of (prets.data ?? []) as any[]) {
      if (!p.enRetard) continue;
      sortie.push({
        id: `prets:${p.id}`,
        source: "stock",
        gravite: "HAUTE",
        titre: `Outil non rendu · ${p.outilTitre ?? "—"}`,
        detail: `Prêté à ${[p.technicienPrenom, p.technicienNom].filter(Boolean).join(" ") || "un technicien"} depuis ${p.joursEcoules ?? "?"} j.`,
        proprietaire: "Magasinier",
        href: "/dashboard/stock/outillage",
        date: p.dateSortie ?? null,
        meta: p.orId ? `OR #${p.orId}` : undefined,
      });
    }

    // ── DLC : 30 j de visibilité, plus urgent sous 7 j
    for (const d of (dlc.data ?? []) as any[]) {
      const jours = d.datePeremption
        ? Math.ceil((new Date(d.datePeremption).getTime() - Date.now()) / 86400000)
        : null;
      sortie.push({
        id: `dlc:${d.lotId}`,
        source: "stock",
        gravite: d.statut === "perime" || (jours != null && jours <= 0) ? "CRITIQUE" : jours != null && jours <= 7 ? "HAUTE" : "MOYENNE",
        titre: `Péremption · ${d.titre ?? "Produit"}`,
        detail: `Lot ${d.numeroLot ?? "—"} · ${d.quantite} unité(s) · périme ${dateLisible(d.datePeremption) ?? "—"}.`,
        proprietaire: "Magasinier",
        href: "/dashboard/stock/alertes",
        date: d.datePeremption ?? null,
        meta: jours != null ? `${jours} j` : undefined,
      });
    }

    // ── Anti-vol : ajustements sans motif, répétés, sorties massives
    for (const a of (antivol.data ?? []) as any[]) {
      sortie.push({
        id: `antivol:${a.id}`,
        source: "stock",
        gravite: "CRITIQUE",
        titre: `Anomalie anti-vol · ${a.titre ?? "Stock"}`,
        detail: a.message || "Mouvement de stock anormal.",
        proprietaire: "Magasinier",
        href: "/dashboard/stock/alertes",
        date: a.date ?? null,
        meta: a.type?.replaceAll("_", " "),
      });
    }

    // ── Finance : créances échues
    for (const d of (dettes.data ?? []) as any[]) {
      if (!d.isOverdue) continue;
      const jours = d.dueDate
        ? Math.max(0, Math.floor((Date.now() - new Date(d.dueDate).getTime()) / 86400000))
        : null;
      sortie.push({
        id: `finance:${d.id}`,
        source: "finance",
        gravite: jours != null && jours > 30 ? "CRITIQUE" : "HAUTE",
        titre: `Créance en retard · ${d.customerName ?? "Client"}`,
        detail: `${new Intl.NumberFormat("fr-FR").format(Number(d.remaining ?? 0))} F restant sur ${d.reference ?? "une vente"}.`,
        proprietaire: "Comptabilité",
        href: "/dashboard/creances",
        date: d.dueDate ?? null,
        meta: jours != null ? `${jours} j de retard` : undefined,
      });
    }

    // ── Système : anomalies de vente et alertes custom. Les STOCK_LOW sont
    //    déjà couvertes par la source stock, on ne les compte pas deux fois.
    for (const a of (systeme.data ?? []) as any[]) {
      if (a.type === "STOCK_LOW") continue;
      sortie.push({
        id: `systeme:${a.id}`,
        source: "systeme",
        gravite: graviteSysteme(a.severite),
        titre: a.titre ?? "Alerte système",
        detail: a.message ?? "",
        proprietaire: "Direction",
        href: "/dashboard/alerts",
        date: a.createdAt ?? null,
        meta: a.type?.replaceAll("_", " "),
      });
    }

    return trierAlertes(sortie);
  }, [atelier.data, parking.data, stock.data, prets.data, dlc.data, antivol.data, dettes.data, systeme.data]);

  const parGravite = useMemo(() => {
    const compte: Record<GraviteAlerte, number> = { CRITIQUE: 0, HAUTE: 0, MOYENNE: 0, BASSE: 0 };
    for (const a of alertes) compte[a.gravite]++;
    return compte;
  }, [alertes]);

  const parSource = useMemo(() => {
    const compte: Record<SourceAlerte, number> = { atelier: 0, parking: 0, stock: 0, finance: 0, systeme: 0 };
    for (const a of alertes) compte[a.source]++;
    return compte;
  }, [alertes]);

  const filtrees = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return alertes.filter((a) => {
      if (fGravite && a.gravite !== fGravite) return false;
      if (fSource && a.source !== fSource) return false;
      if (!terme) return true;
      return [a.titre, a.detail, a.proprietaire, a.meta]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(terme));
    });
  }, [alertes, q, fGravite, fSource]);

  const erreurs = [
    atelier.error && `Atelier : ${atelier.error.message}`,
    parking.error && `Parking : ${parking.error.message}`,
    stock.error && `Stock : ${stock.error.message}`,
    prets.error && `Outillage : ${prets.error.message}`,
    dlc.error && `DLC : ${dlc.error.message}`,
    antivol.error && `Anti-vol : ${antivol.error.message}`,
    dettes.error && `Finance : ${dettes.error.message}`,
    systeme.error && `Système : ${systeme.error.message}`,
  ].filter((e): e is string => Boolean(e));

  const chargement = permissionsEnCours || atelier.isLoading || parking.isLoading || stock.isLoading;
  const actualiser = () => {
    const taches: Array<Promise<unknown>> = [systeme.refetch()];
    if (peutAtelier) taches.push(atelier.refetch());
    if (peutParking) taches.push(parking.refetch());
    if (peutStock) taches.push(stock.refetch(), prets.refetch(), dlc.refetch(), antivol.refetch());
    if (peutFinance) taches.push(dettes.refetch());
    void Promise.all(taches);
  };
  // Ne pas afficher « Actualisation… » pour une source que l'utilisateur ne
  // peut pas interroger : le bouton resterait bloqué sur une requête refusée.
  const rafraichit = (peutAtelier && atelier.isFetching)
    || (peutParking && parking.isFetching)
    || (peutStock && (stock.isFetching || prets.isFetching || dlc.isFetching || antivol.isFetching))
    || (peutFinance && dettes.isFetching)
    || systeme.isFetching;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <BellRing size={22} className="text-destructive" /> Centre d'alertes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atelier, parking, stock, finance et système — une seule file, triée par gravité réelle et par propriétaire de l'action.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={actualiser} disabled={rafraichit}>
          {rafraichit ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Actualiser
        </Button>
      </div>

      {erreurs.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          <p className="font-semibold">Certaines sources sont indisponibles :</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {erreurs.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GRAVITES.map((g) => {
          const actif = fGravite === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setFGravite(actif ? "" : g)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                actif ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {GRAVITE_META[g].label}
              </p>
              <p className={cn("mt-1 text-2xl font-bold", g === "CRITIQUE" && parGravite[g] > 0 ? "text-destructive" : "text-foreground")}>
                {parGravite[g]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFSource("")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            fSource === "" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Toutes les sources
        </button>
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFSource(fSource === s ? "" : s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              fSource === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {SOURCE_META[s].label} ({parSource[s]})
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un véhicule, un client, un produit, un responsable…"
          className="pl-9"
        />
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Chargement des alertes…
        </div>
      ) : filtrees.length === 0 ? (
        <EmptyState
          icon={alertes.length === 0 ? <ShieldCheck className="size-8" /> : <Search className="size-8" />}
          title={alertes.length === 0 ? "Aucune alerte" : "Aucun résultat"}
          description={
            alertes.length === 0
              ? "Aucune action en attente sur les sources accessibles. Tout est à jour."
              : "Aucune alerte ne correspond à ces filtres."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtrees.map((a) => {
            const date = dateLisible(a.date);
            return (
              <Link
                key={a.id}
                href={a.href}
                className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", GRAVITE_META[a.gravite].badge)}>
                        {GRAVITE_META[a.gravite].label}
                      </span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", SOURCE_META[a.source].badge)}>
                        {SOURCE_META[a.source].label}
                      </span>
                      <span className="font-semibold text-foreground">{a.titre}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
                  </div>
                  <ArrowRight size={15} className="mt-1 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground/80">Propriétaire : {a.proprietaire}</span>
                  {a.meta && <span>{a.meta}</span>}
                  {date && <span>Échéance / date : {date}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle size={12} /> Les alertes restent gérées dans leur module : cette page les lit, elle ne les clôture pas.
      </p>
    </div>
  );
}
