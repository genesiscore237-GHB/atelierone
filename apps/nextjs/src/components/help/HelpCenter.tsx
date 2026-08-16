"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  HelpCircle,
  Rocket,
} from "lucide-react";
import { RH_HELP_FICHES, searchHelpFiches, type HelpFiche } from "~/lib/help/rh-help";
import { FicheDetail, HelpSearch } from "~/components/help/HelpButton";

const PRIORITE_ORDER = ["P0", "P1", "P2"] as const;
const PRIORITE_BADGE: Record<string, string> = {
  P0: "bg-destructive/10 text-destructive",
  P1: "bg-warning/10 text-warning-foreground",
  P2: "bg-info/10 text-info-foreground",
};

/**
 * CENTRE D'AIDE — MODULE PERSONNEL (RH)
 * Sommaire structuré par priorité, recherche plein texte, fiches
 * détaillées avec prérequis/fonctionnalités/étapes/règles/FAQ et
 * parcours de prise en main guidé.
 */
export default function HelpCenter() {
  const [selected, setSelected] = useState<HelpFiche | null>(null);
  const [result, setResult] = useState<HelpFiche[]>(RH_HELP_FICHES);

  const grouped = PRIORITE_ORDER.map((p) => ({
    priorite: p,
    fiches: result.filter((f) => f.priorite === p),
  })).filter((g) => g.fiches.length > 0);

  const totalFiches = RH_HELP_FICHES.length;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Centre d'aide — Personnel (RH)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guide utilisateur complet du module : parcours de prise en main, fiches par sous-module, recherche.
        </p>
      </div>

      {/* Parcours de prise en main (didacticiel) */}
      <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
          <Rocket size={15} /> Parcours de prise en main (15 minutes)
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Suivez ces étapes dans l'ordre pour voir le module fonctionner de bout en bout.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "1. Vérifier le paramétrage", route: "/dashboard/rh/parametrage" },
            { label: "2. Créer un employé", route: "/dashboard/rh/employes" },
            { label: "3. Pointer une présence", route: "/dashboard/rh/presences" },
            { label: "4. Demander un congé", route: "/dashboard/rh/absences" },
            { label: "5. Clôturer le mois", route: "/dashboard/rh/presences" },
            { label: "6. Calculer la paie", route: "/dashboard/rh/paie" },
            { label: "7. Consulter le tableau de bord", route: "/dashboard/rh/tableau-de-bord" },
          ].map((s) => (
            <Link
              key={s.label}
              href={s.route}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Compass size={12} className="text-primary" />
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recherche */}
      <div className="mt-5 max-w-xl">
        <HelpSearch onQuery={setResult} />
        {result.length !== totalFiches && (
          <p className="mt-2 text-xs text-muted-foreground">
            {result.length} fiche{result.length > 1 ? "s" : ""} trouvée{result.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {selected ? (
        /* Fiche sélectionnée */
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight size={14} className="rotate-180" />
            Retour au sommaire
          </button>
          <div className="max-w-3xl">
            <FicheDetail fiche={selected} />
          </div>
        </div>
      ) : result.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
          <HelpCircle size={32} className="mb-2 opacity-40" />
          <p className="text-sm font-medium text-foreground">Aucun résultat</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Essayez d'autres mots-clés (matricule, congé, IRPP, récidive, CSV, clôture…).
          </p>
        </div>
      ) : (
        /* Sommaire par priorité */
        <div className="mt-6 space-y-6">
          {grouped.map((g) => (
            <div key={g.priorite}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${PRIORITE_BADGE[g.priorite]}`}>
                  Priorité {g.priorite}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.priorite === "P0" ? "Fondations — à configurer en premier" : g.priorite === "P1" ? "Usage courant" : "Perfectionnement"}
                </span>
              </div>
              <div className="space-y-2">
                {g.fiches.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelected(f)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <BookOpen size={14} className="shrink-0 text-primary" />
                        {f.titre}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.courte}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">
                        {f.fonctionnalites.length} fonctionnalités
                      </span>
                      <ArrowRight size={14} className="text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Renvoi vers le guide complet */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">Guide utilisateur complet (document)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le guide de formation détaillé (règles métier, exemples chiffrés, FAQ, glossaire) est disponible dans le
                dossier <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">DOC/GUIDE-UTILISATEUR-MODULE-RH.md</code> du projet.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
