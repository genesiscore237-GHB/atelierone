"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "~/lib/utils";

/**
 * LOT U3 (E9, RD7) — Check-list d'outillage : une ligne = case + libellé +
 * observation, sur la MÊME ligne.
 *
 * Avant (P2-1) : 18 cases dans une grille, puis 18 champs d'observation dans
 * un bloc séparé en dessous, avec un libellé répété. Rien ne relie
 * visuellement une observation à son élément : l'agent devait faire l'aller-
 * retour entre deux listes, et une observation saisie pour « ROUE DE SECOURS »
 * pouvait être lue comme étant celle d'un autre élément.
 *
 * Le bouton crayon déplie l'observation sous la ligne concernée — la ligne
 * concernée, pas « la liste ». Le format stocké est INCHANGÉ
 * (`{present, observation}` en JSONB) : pas de migration.
 */

export const OUTILLAGE_ITEMS = [
  "CRIC",
  "CLÉ DE ROUE",
  "MANIVELLE",
  "ROUE DE SECOURS",
  "EXTINCTEUR",
  "RADIO",
  "TRIANGLE",
  "CD",
  "DOCUMENTS",
  "PARAPLUIE",
  "PIÈCES DU VÉHICULE",
  "NATTES",
  "BOUGIES",
  "HUILE DE FREIN",
  "SACS",
  "BÂCHE DU VÉHICULE",
  "BOÎTE À PHARMACIE",
  "AUTRES",
] as const;

interface CheckListOutillageProps {
  /** Éléments cochés (booléens). Les observations vivent dans `observations`. */
  coches: Record<string, boolean | unknown>;
  observations: Record<string, string>;
  onToggle: (cle: string, present: boolean) => void;
  onObservation: (cle: string, texte: string) => void;
  desactive?: boolean;
}

export function CheckListOutillage({
  coches,
  observations,
  onToggle,
  onObservation,
  desactive = false,
}: CheckListOutillageProps) {
  // Une seule ligne ouverte à la fois : c'est l'intérêt de l'UX (pas 18
  // champs à la fois), l'agent voit toujours où il se trouve.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [texte, setTexte] = useState("");

  const fermer = (cle: string) => {
    onObservation(cle, texte);
    setOuverte(null);
    setTexte("");
  };

  const basculer = (cle: string) => {
    if (ouverte === cle) {
      fermer(cle);
      return;
    }
    if (ouverte) onObservation(ouverte, texte);
    setOuverte(cle);
    setTexte(observations[cle] ?? "");
  };

  return (
    <div className="space-y-1">
      {OUTILLAGE_ITEMS.map((item) => {
        const present = !!coches[item];
        const active = ouverte === item;
        const observation = observations[item] ?? "";
        return (
          <div
            key={item}
            className={cn(
              "rounded-lg border transition-colors",
              present ? "border-success/40 bg-success/5" : "border-border",
              active && "ring-1 ring-primary/40",
            )}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={present}
                  disabled={desactive}
                  onChange={(e) => onToggle(item, e.target.checked)}
                  className="size-4 shrink-0 accent-success"
                />
                <span className="truncate">{item}</span>
              </label>

              <button
                type="button"
                disabled={desactive}
                onClick={() => basculer(item)}
                title={observation ? "Modifier l'observation" : "Ajouter une observation"}
                aria-expanded={active}
                className={cn(
                  "shrink-0 rounded p-1 transition-colors",
                  observation || active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Pencil size={12} />
              </button>
            </div>

            {/* Observation repliée : affichée en ligne pour rester lisible
                même quand la ligne est fermée. */}
            {!active && observation && (
              <p className="border-t border-border/50 px-2 py-1 text-[11px] text-muted-foreground">
                {observation}
              </p>
            )}

            {active && (
              <div className="border-t border-border/50 px-2 py-1.5">
                <input
                  autoFocus
                  value={texte}
                  disabled={desactive}
                  onChange={(e) => setTexte(e.target.value)}
                  onBlur={() => fermer(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fermer(item);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setOuverte(null);
                      setTexte("");
                    }
                  }}
                  placeholder={`Observation — ${item.toLowerCase()}`}
                  className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
