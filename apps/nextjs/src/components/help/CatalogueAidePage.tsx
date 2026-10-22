"use client";

import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import HelpCenter from "~/components/help/HelpCenter";
import { CATALOGUE_HELP_FICHES, CATALOGUE_PAS_A_PAS, PARCOURS_CATALOGUE } from "~/lib/help/catalogue-help";
import { AideSaisiePage } from "~/components/catalogue/aide/AideSaisiePage";

const ONGLETS = [
  { id: "guide", label: "Guide interactif", icone: BookOpen },
  { id: "saisie", label: "Aide à la saisie", icone: Sparkles },
] as const;

export function CatalogueAidePage() {
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]["id"]>("guide");

  return (
    <div className="space-y-4">
      <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-card p-1">
        {ONGLETS.map((o) => {
          const Icone = o.icone;
          const actif = onglet === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOnglet(o.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                actif ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icone size={14} />
              {o.label}
            </button>
          );
        })}
      </div>

      {onglet === "guide" ? (
        <HelpCenter
          titre="Catalogue"
          sousTitre="Guide utilisateur interactif du module : articles, variantes, références, compatibilités, recherche, outillage, import de masse."
          fiches={CATALOGUE_HELP_FICHES}
          pasAapas={CATALOGUE_PAS_A_PAS}
          parcours={PARCOURS_CATALOGUE}
          guideDoc="docs/PLAN-TESTS-REELS.md"
        />
      ) : (
        <AideSaisiePage />
      )}
    </div>
  );
}
