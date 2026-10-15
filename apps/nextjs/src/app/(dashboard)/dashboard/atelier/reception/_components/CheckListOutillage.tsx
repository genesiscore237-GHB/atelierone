"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { slugifierElement, type ElementOutillage } from "~/lib/outillage";

/**
 * LOT U3 (E9, RD7) + LOT O1/O2 — Check-list « Outillage & accessoires »
 * ===============================================================
 *
 * **Ce que le lot U3 avait réglé.** Avant, 18 cases dans une grille puis 18
 * champs d'observation dans un bloc séparé, libellé répété. Rien ne reliait
 * visuellement une observation à son élément : une observation saisie pour
 * « ROUE DE SECOURS » pouvait être lue comme étant celle d'un autre. Ici,
 * une ligne = case + libellé + observation, et le crayon déplie l'observation
 * **sous la ligne concernée**.
 *
 * **Ce que le lot O1/O2 ajoute.** La liste des outils n'est plus une constante
 * codée en dur : elle vient du serveur, elle est propre à l'agence, et l'agent
 * peut y ajouter, renommer, réordonner ou retirer un élément.
 *
 * Trois décisions de conception qui ne vont pas de soi :
 *
 * 1. **Modifier la liste est un mode, pas un état.** Gérer la nomenclature de
 *    toute l'agence au milieu d'une réception serait une catastrophe : un
 *    appui sur « supprimer » retirerait l'outil des réceptions de tous les
 *    collègues. Le mode gestion s'ouvre explicitement, se referme
 *    explicitement, et affiche ce qu'il va faire.
 *
 * 2. **Renommer ne casse rien.** La clé de l'élément ne bouge pas ; seul le
 *    libellé change. Les réponses déjà enregistrées restent rattachées.
 *
 * 3. **Retirer n'efface rien.** Les dossiers passés conservent leur réponse
 *    et leur libellé ; seules les prochaines réceptions cessent de proposer
 *    l'élément. Le confirm l'énonce, sinon l'agent suppose le pire.
 *
 * Permissions : sans `or.modifier`, les cases sont désactivées et le bouton de
 * gestion est absent. Pas d'erreur surprise à l'enregistrement — c'est la règle
 * UX n°6 du AGENTS.md.
 */

type Element = ElementOutillage;
type Valeur = { present: boolean; observation: string };

interface Props {
  /** Présence par clé. Les observations vivent dans `observations`. */
  coches: Record<string, boolean | unknown>;
  observations: Record<string, string>;
  /** Clés Known hors catalogue, à afficher malgré tout (voir O1 § historique). */
  horsCatalogue?: { cle: string; libelle: string }[];
  onToggle: (cle: string, present: boolean) => void;
  onObservation: (cle: string, texte: string) => void;
  desactive?: boolean;
}

export function CheckListOutillage({
  coches,
  observations,
  horsCatalogue = [],
  onToggle,
  onObservation,
  desactive = false,
}: Props) {
  const utils = api.useUtils();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [texte, setTexte] = useState("");

  // ── Gestion de la nomenclature ────────────────────────────────────────────
  const [gestion, setGestion] = useState(false);
  const [brouillon, setBrouillon] = useState<Element[] | null>(null);
  const [nouveau, setNouveau] = useState("");
  const [renommage, setRenommage] = useState<string | null>(null);
  const [libelleEnCours, setLibelleEnCours] = useState("");
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const catalogue = api.or.getCatalogueOutillage.useQuery();
  const enregistrer = api.or.updateCatalogueOutillage.useMutation({
    onSuccess: (r) => {
      utils.invalidate();
      setGestion(false);
      setBrouillon(null);
      toast.success(
        `Liste enregistrée — ${r.total} élément${r.total > 1 ? "s" : ""}${r.ajoutes ? `, ${r.ajoutes} ajouté${r.ajoutes > 1 ? "s" : ""}` : ""}.`,
      );
    },
    onError: (e) => toast.error(e.message ?? "Enregistrement impossible."),
  });

  const items = useMemo(() => {
    const base = catalogue.data?.items ?? [];
    const connus = new Set(base.map((i) => i.cle));
    // Les éléments retirés du catalogue mais déjà cochés restent affichés :
    // les cacher ferait disparaître une réponse déjà donnée.
    const orphelins = horsCatalogue
      .filter((h) => !connus.has(h.cle))
      .map((h) => ({ cle: h.cle, libelle: h.libelle, ordre: 9999 }));
    return [...base, ...orphelins];
  }, [catalogue.data, horsCatalogue]);

  useEffect(() => {
    if (gestion && catalogue.data?.items) setBrouillon(catalogue.data.items.map((i) => ({ ...i })));
  }, [gestion, catalogue.data]);

  const fermer = (cle: string) => {
    onObservation(cle, texte);
    setOuverte(null);
    setTexte("");
  };

  const basculer = (cle: string) => {
    if (ouverte === cle) return fermer(cle);
    if (ouverte) onObservation(ouverte, texte);
    setOuverte(cle);
    setTexte(observations[cle] ?? "");
  };

  // ── Actions de gestion ────────────────────────────────────────────────────
  const ajouter = () => {
    const libelle = nouveau.trim();
    if (!libelle || !brouillon) return;
    if (brouillon.some((i) => i.libelle.toLowerCase() === libelle.toLowerCase())) {
      toast.error(`« ${libelle} » figure déjà dans la liste.`);
      return;
    }
    const prises = new Set(brouillon.map((i) => i.cle));
    // Même implémentation que celle du serveur (`~/lib/outillage`), pas une
    // copie : deux algorithmes de slugification finissent toujours par
    // diverger, et le serveur refuserait alors la clé que l'écran a produite.
    const cle = slugifierElement(libelle, prises);

    setBrouillon([...brouillon, { cle, libelle, ordre: (brouillon.length + 1) * 10 }]);
    setNouveau("");
  };

  const deplacer = (index: number, delta: number) => {
    if (!brouillon) return;
    const cible = index + delta;
    if (cible < 0 || cible >= brouillon.length) return;
    const copie = [...brouillon];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    setBrouillon(copie.map((i, idx) => ({ ...i, ordre: (idx + 1) * 10 })));
  };

  const supprimer = (cle: string) => {
    if (!brouillon) return;
    setBrouillon(brouillon.filter((i) => i.cle !== cle).map((i, idx) => ({ ...i, ordre: (idx + 1) * 10 })));
  };

  const modifierLibelle = (cle: string, valeur: string) => {
    if (!brouillon) return;
    setBrouillon(brouillon.map((i) => (i.cle === cle ? { ...i, libelle: valeur } : i)));
  };

  const ordreFonce = !desactive && !gestion;

  return (
    <div className="space-y-2">
      {/* ── En-tête : mode gestion ─────────────────────────────────────── */}
      {catalogue.data && !gestion && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {catalogue.data.items.length} éléments de la nomenclature
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-[11px]"
            disabled={desactive}
            onClick={() => setGestion(true)}
            title={desactive ? "Permission requise" : "Ajouter, renommer ou retirer un élément"}
          >
            <Settings2 size={12} /> Gérer la liste
          </Button>
        </div>
      )}

      {desactive && (
        <p className="rounded border border-warning/30 bg-warning/5 px-2 py-1 text-[11px] text-muted-foreground">
          Lecture seule — la permission <code>or.modifier</code> est requise pour saisir l'outillage.
        </p>
      )}

      {/* ── Mode gestion : edition de la nomenclature de l'agence ─────── */}
      {gestion && brouillon && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Cette liste est <strong>commune à toute l&apos;agence</strong>. Elle change ce que les
              prochaines réceptions proposent. Les dossiers déjà remplis conservent leurs réponses.
            </p>
            <button
              type="button"
              onClick={() => {
                setGestion(false);
                setBrouillon(null);
                setRenommage(null);
                setASupprimer(null);
              }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Quitter sans enregistrer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1">
            {brouillon.map((item, idx) => (
              <div key={item.cle} className="rounded border border-border bg-background px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => deplacer(idx, -1)}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Monter"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacer(idx, 1)}
                      disabled={idx === brouillon.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Descendre"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>

                  {renommage === item.cle ? (
                    <Input
                      autoFocus
                      value={libelleEnCours}
                      onChange={(e) => setLibelleEnCours(e.target.value)}
                      onBlur={() => {
                        const v = libelleEnCours.trim();
                        if (v && v !== item.libelle) modifierLibelle(item.cle, v);
                        setRenommage(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = libelleEnCours.trim();
                          if (v) modifierLibelle(item.cle, v);
                          setRenommage(null);
                        }
                        if (e.key === "Escape") setRenommage(null);
                      }}
                      className="h-7 flex-1 text-xs"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs">{item.libelle}</span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setRenommage(item.cle);
                      setLibelleEnCours(item.libelle);
                      setASupprimer(null);
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Renommer (la clé reste la même)"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setASupprimer(aSupprimer === item.cle ? null : item.cle)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    title="Retirer de la liste proposée"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {aSupprimer === item.cle && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5">
                    <p className="text-[11px] text-destructive">
                      Retirer <strong>{item.libelle}</strong> des prochaines réceptions ? Les dossiers
                      existants garderont leur réponse.
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setASupprimer(null)}>
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          supprimer(item.cle);
                          setASupprimer(null);
                        }}
                      >
                        Retirer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
              placeholder="Nouvel élément (ex : cale de nivellement)"
              className="h-7 flex-1 text-xs"
            />
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={ajouter} disabled={!nouveau.trim()}>
              <Plus size={12} /> Ajouter
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setGestion(false);
                setBrouillon(null);
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[11px]"
              disabled={enregistrer.isPending || brouillon.length === 0}
              onClick={() => enregistrer.mutate({ items: brouillon })}
            >
              {enregistrer.isPending ? "Enregistrement…" : "Enregistrer la liste"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Check-list ───────────────────────────────────────────────── */}
      {catalogue.isLoading && !gestion && items.length === 0 ? (
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : (
        <>
          {/* Échec réseau : on affiche la nomenclature par défaut et on le dit.
              Le premier jet affichait un message d'erreur et RIEN d'autre —
              l'agent se retrouvait devant un bloc vide, incapable de saisir
              un état des lieux. Indisponible n'est pas la même chose que vide :
              une nomenclature qui n'arrive pas doit laisser passer le travail. */}
          {catalogue.isError && !gestion && (
            <p className="mb-1.5 rounded border border-warning/40 bg-warning/5 px-2 py-1.5 text-[11px] text-muted-foreground">
              Nomenclature personnalisée indisponible — la liste par défaut est affichée.
              Vos saisies resteront enregistrées.
            </p>
          )}
          <div className="space-y-1">
            {items.map((item) => {
            const present = !!coches[item.cle];
            const active = ouverte === item.cle;
            const observation = observations[item.cle] ?? "";
            const horsCatalogueAffiche = item.ordre === 9999;
            return (
              <div
                key={item.cle}
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
                      disabled={!ordreFonce}
                      onChange={(e) => onToggle(item.cle, e.target.checked)}
                      className="size-4 shrink-0 accent-success"
                    />
                    <span className="truncate">{item.libelle}</span>
                    {horsCatalogueAffiche && (
                      <span className="shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                        hors liste
                      </span>
                    )}
                  </label>

                  <button
                    type="button"
                    disabled={!ordreFonce}
                    onClick={() => basculer(item.cle)}
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
                      disabled={!ordreFonce}
                      onChange={(e) => setTexte(e.target.value)}
                      onBlur={() => fermer(item.cle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          fermer(item.cle);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setOuverte(null);
                          setTexte("");
                        }
                      }}
                      placeholder={`Observation — ${item.libelle.toLowerCase()}`}
                      className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                    />
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </>
      )}
      </div>
    );
  }
