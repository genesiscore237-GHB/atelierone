"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Search, ArrowDown, ArrowUp, Filter } from "lucide-react";

type Groupe = { id: string; label: string; types: string[] | null };

const GROUPES: Groupe[] = [
  { id: "TOUS", label: "Tous", types: null },
  { id: "ENTREES", label: "Entrées", types: ["ACHAT_RECEPTION", "TRANSFERT_ENTREE", "APPROVISIONNEMENT_BUREAU_ENTREE", "RETOUR_ATELIER", "RETOUR_CLIENT", "RETOUR_FOURNISSEUR", "RETOUR_OUTIL", "RECONDITIONNEMENT_ENTREE", "AJUSTEMENT_INVENTAIRE_POSITIF"] },
  { id: "SORTIES", label: "Sorties", types: ["VENTE", "SORTIE_OR", "TRANSFERT_SORTIE", "APPROVISIONNEMENT_BUREAU_SORTIE", "DOTATION_CONSOMMABLE", "SORTIE_OUTIL", "DECONDITIONNEMENT_SORTIE", "RECONDITIONNEMENT_SORTIE", "AJUSTEMENT_INVENTAIRE_NEGATIF", "PERTE", "VOL", "CASSE", "CASSE_PERTE"] },
  { id: "BUREAU", label: "Bureau & outillage", types: ["APPROVISIONNEMENT_BUREAU_SORTIE", "APPROVISIONNEMENT_BUREAU_ENTREE", "DOTATION_CONSOMMABLE", "SORTIE_OUTIL", "RETOUR_OUTIL"] },
  { id: "OR", label: "Ordres de réparation", types: ["SORTIE_OR", "RETOUR_ATELIER", "RESERVATION", "LIBERATION_RESERVATION"] },
  { id: "TRANSFERTS", label: "Transferts", types: ["TRANSFERT_SORTIE", "TRANSFERT_ENTREE"] },
  { id: "PERTES", label: "Pertes & casse", types: ["PERTE", "VOL", "CASSE", "CASSE_PERTE"] },
  { id: "INVENTAIRE", label: "Inventaire", types: ["AJUSTEMENT_INVENTAIRE_POSITIF", "AJUSTEMENT_INVENTAIRE_NEGATIF"] },
  { id: "ACHATS", label: "Achats & fournisseurs", types: ["ACHAT_RECEPTION", "RETOUR_FOURNISSEUR"] },
  { id: "VENTES", label: "Ventes", types: ["VENTE", "RETOUR_CLIENT"] },
];

const TYPE_LABELS: Record<string, string> = {
  ACHAT_RECEPTION: "Réception achat",
  DECONDITIONNEMENT_SORTIE: "Déconditionnement (sortie)",
  DECONDITIONNEMENT_ENTREE: "Déconditionnement (entrée)",
  RECONDITIONNEMENT_SORTIE: "Reconditionnement (sortie)",
  RECONDITIONNEMENT_ENTREE: "Reconditionnement (entrée)",
  TRANSFERT_SORTIE: "Transfert (sortie)",
  TRANSFERT_ENTREE: "Transfert (entrée)",
  APPROVISIONNEMENT_BUREAU_SORTIE: "Approvisionnement bureau (sortie)",
  APPROVISIONNEMENT_BUREAU_ENTREE: "Approvisionnement bureau (entrée)",
  DOTATION_CONSOMMABLE: "Dotation consommable",
  VENTE: "Vente",
  RETOUR_CLIENT: "Retour client",
  RETOUR_FOURNISSEUR: "Retour fournisseur",
  AJUSTEMENT_INVENTAIRE_POSITIF: "Inventaire (+)",
  AJUSTEMENT_INVENTAIRE_NEGATIF: "Inventaire (−)",
  CASSE_PERTE: "Casse / perte",
  PERTE: "Perte",
  VOL: "Vol",
  CASSE: "Casse",
  SORTIE_OR: "Sortie pour OR",
  RETOUR_ATELIER: "Retour atelier",
  SORTIE_OUTIL: "Prêt d'outil",
  RETOUR_OUTIL: "Retour d'outil",
  RESERVATION: "Réservation",
  LIBERATION_RESERVATION: "Libération réservation",
};

const badgeParGroupe = (type: string): string => {
  const t = GROUPES.find((g) => g.types?.includes(type));
  switch (t?.id) {
    case "ENTREES": return "bg-success/15 text-success-foreground";
    case "SORTIES": return "bg-destructive/15 text-destructive";
    case "BUREAU": return "bg-sky-500/15 text-sky-400";
    case "OR": return "bg-primary/15 text-primary";
    case "TRANSFERTS": return "bg-violet-500/15 text-violet-400";
    case "PERTES": return "bg-destructive/20 text-destructive";
    case "INVENTAIRE": return "bg-warning/15 text-warning-foreground";
    case "ACHATS": return "bg-warning/15 text-warning-foreground";
    case "VENTES": return "bg-success/15 text-success-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function MouvementsPage() {
  const [groupe, setGroupe] = useState("TOUS");
  const [search, setSearch] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const groupeActif = GROUPES.find((g) => g.id === groupe)!;
  const { data: mouvements, isLoading } = api.stock.getMouvements.useQuery({
    types: groupeActif.types ?? undefined,
    dateDebut: dateDebut || undefined,
    dateFin: dateFin || undefined,
    limit: 200,
  });

  const liste = (mouvements ?? []).filter(
    (m: any) => !search || (m.produitTitre ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher par produit..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none"
          />
          <span className="self-center text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Filter size={14} className="mt-2.5 shrink-0 text-muted-foreground" />
        {GROUPES.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupe(g.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              groupe === g.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Produit</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Quantité</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">Stock avant</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">Stock après</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-muted" /></td></tr>
                ))
              ) : liste.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="font-medium">Aucun mouvement</p>
                  </td>
                </tr>
              ) : (
                liste.map((m: any) => (
                  <tr key={m.id} className="transition-colors hover:bg-accent">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {m.dateMouvement ? new Date(m.dateMouvement).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{m.produitTitre ?? `#${m.produitId}`}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeParGroupe(m.type)}`}>
                        {m.sens === "E" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                        {TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold">{m.quantite}</td>
                    <td className="hidden px-4 py-3 text-right text-sm text-muted-foreground md:table-cell">{m.stockAvant}</td>
                    <td className="hidden px-4 py-3 text-right font-mono text-sm md:table-cell">{m.stockApres}</td>
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-sm text-muted-foreground lg:table-cell">{m.motif ?? m.commentaire ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}