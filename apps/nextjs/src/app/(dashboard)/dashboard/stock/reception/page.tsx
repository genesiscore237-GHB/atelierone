"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Copy,
  Loader2,
  PackagePlus,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { BarcodeScanner } from "~/components/stock/BarcodeScanner";

/**
 * RÉCEPTION RAPIDE — « je viens d'acheter des pièces, elles sont là ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE, EN QUATRE MOUVEMENTS
 *
 *     [ fournisseur ▾ ]  [ 🔍 Filtre à huile ]  [12]  [ Magasin ▾ ]  [5 000]  →  +
 *
 * Puis on valide en bas. Un bon de réception n'est pas une formalité :
 * c'est ce qui donne le stock, le lot et la dette fournisseur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PRIX : TROIS CAS, ET UN SEUT EXIGE UNE DÉCISION
 *
 *   · saisi      → c'est le prix que le magasinier connaît ;
 *   · catalogue  → repris de la fiche, signalé comme tel ;
 *   · aucun      → la pièce entre SANS coût.
 *
 * Le troisième cas n'est pas une erreur, mais il a une conséquence qu'il
 * faut voir : la pièce n'entre pas dans la « Valeur du stock ». On le dit
 * dans l'écran, ligne par ligne, plutôt que de laisser un zéro invisible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE LOT N'EST DEMANDÉ QUE S'IL A DU SENS
 *
 * Les champs de lot (numéro, fabrication, péremption) n'apparaissent que
 * pour un article traçable — huile, liquide, produit à date. Demander un
 * numéro de lot pour une rondelle apprend au magasinier à saisir n'importe
 * quoi.
 */

type Ligne = {
  cle: number;
  produitId: number;
  titre: string;
  quantite: number;
  prixUnitaire: number | null;
  uniteId: string | null;
  emplacementId: number | null;
  numeroLot: string;
  dateFabrication: string;
  datePeremption: string;
  dlcJours: number | null;
};

const TOUS_EMPLACEMENTS = -1;

export default function ReceptionPage() {
  const utils = api.useUtils();

  const [fournisseurId, setFournisseurId] = useState<number | "">("");
  const [texte, setTexte] = useState("");
  const [quantite, setQuantite] = useState("");
  const [emplacementChoisi, setEmplacementChoisi] = useState<number>(TOUS_EMPLACEMENTS);
  const [prix, setPrix] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [dateFabrication, setDateFabrication] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [cameraOuverte, setCameraOuverte] = useState(false);
  const [produitChoisi, setProduitChoisi] = useState<number | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [cleSuivante, setCleSuivante] = useState(1);
  const refRecherche = useRef<HTMLInputElement | null>(null);
  const refQuantite = useRef<HTMLInputElement | null>(null);

  const { data: fournisseurs } = api.stockReception.fournisseurs.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery();

  const rechercheActive = texte.trim().length >= 2 && produitChoisi === null;
  const { data: recherche, isFetching } = api.stockReception.rechercher.useQuery(
    { query: texte.trim(), limit: 12 },
    { enabled: rechercheActive },
  );

  const articleTrouve = useMemo(
    () => recherche?.resultats.find((r) => r.id === produitChoisi) ?? null,
    [recherche, produitChoisi],
  );
  /** Un article traçable mérite des champs de lot ; un filtre à huile non. */
  const tracable = articleTrouve?.dlcJours != null || numeroLot.trim() !== "";

  const quantiteNombre = Number(quantite);
  const quantiteValide =
    quantite.trim() !== "" && Number.isFinite(quantiteNombre) && quantiteNombre > 0;

  const peutAjouter =
    produitChoisi !== null && quantiteValide && fournisseurId !== "";

  const ajouter = useCallback(() => {
    if (produitChoisi === null || !quantiteValide || !articleTrouve) return;
    setLignes((l) => [
      ...l,
      {
        cle: cleSuivante,
        produitId: produitChoisi,
        titre: articleTrouve.titre,
        quantite: quantiteNombre,
        prixUnitaire: prix.trim() === "" ? null : Number(prix),
        uniteId: null,
        emplacementId: emplacementChoisi === TOUS_EMPLACEMENTS ? null : emplacementChoisi,
        numeroLot: numeroLot.trim(),
        dateFabrication,
        datePeremption,
        dlcJours: articleTrouve.dlcJours,
      },
    ]);
    setCleSuivante((c) => c + 1);
    setTexte("");
    setProduitChoisi(null);
    setQuantite("");
    setPrix("");
    setNumeroLot("");
    setDateFabrication("");
    setDatePeremption("");
    refRecherche.current?.focus();
  }, [
    produitChoisi,
    quantiteValide,
    quantiteNombre,
    articleTrouve,
    prix,
    emplacementChoisi,
    numeroLot,
    dateFabrication,
    datePeremption,
    cleSuivante,
  ]);

  // Aperçu — la prévisualisation ne fait que lire le moteur, elle n'écrit rien.
  const { data: apercu } = api.stockReception.previsualiser.useQuery(
    {
      lignes: lignes.map((l) => ({
        produitId: l.produitId,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        emplacementId: l.emplacementId,
        numeroLot: l.numeroLot || null,
      })),
    },
    { enabled: lignes.length > 0 },
  );

  const recevoir = api.stockReception.recevoir.useMutation({
    onSuccess: async (r) => {
      toast.success(`${r.lignesRecues} ligne(s) reçue(s)`, {
        description: r.reference
          ? `Bon de réception ${r.reference}. Le stock, les lots et la dette fournisseur sont à jour.`
          : "Le stock et les lots sont à jour.",
      });
      setLignes([]);
      setFournisseurId("");
      await Promise.all([
        utils.stock.getDashboard.invalidate(),
        utils.stock.listEmplacements.invalidate(),
        utils.stockRecensement.rechercher.invalidate(),
        utils.stockContenants.scelles.invalidate(),
      ]);
    },
    onError: (e) => toast.error("Réception refusée", { description: e.message }),
  });

  const sansCout = apercu?.totaux.sansCout ?? 0;
  const auDessus = apercu?.totaux.auDessusDuMaximum ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-black tracking-tight">Réception</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enregistrez ce que vous venez d&apos;acheter : quantité, prix, et l&apos;endroit où vous le
          posez.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_110px_170px_110px_auto]">
          <div className="relative">
            <ScanLine
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={refRecherche}
              value={texte}
              onChange={(e) => {
                setTexte(e.target.value);
                setProduitChoisi(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && recherche?.resultats[0]) {
                  e.preventDefault();
                  const p = recherche.resultats[0];
                  setProduitChoisi(p.id);
                  setTexte(p.titre);
                  if (prix === "" && p.prixAchat) setPrix(String(p.prixAchat));
                  window.setTimeout(() => refQuantite.current?.focus(), 50);
                }
              }}
              placeholder="Rechercher ou scanner une pièce achetée…"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Rechercher une pièce"
            />
            <button
              type="button"
              onClick={() => setCameraOuverte((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={cameraOuverte ? "Fermer la caméra" : "Scanner un code-barres"}
            >
              {cameraOuverte ? <X size={18} /> : <ScanLine size={18} />}
            </button>
          </div>

          <input
            ref={refQuantite}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            disabled={produitChoisi === null}
            placeholder="Qté"
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Quantité reçue"
          />

          <select
            value={emplacementChoisi}
            onChange={(e) => setEmplacementChoisi(Number(e.target.value))}
            disabled={produitChoisi === null}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Emplacement"
          >
            <option value={TOUS_EMPLACEMENTS}>Sans emplacement</option>
            {(emplacements ?? [])
              .filter((e: { isActive: boolean | null }) => e.isActive !== false)
              .map((e: { id: number; code: string; libelle: string | null }) => (
                <option key={e.id} value={e.id}>
                  {e.libelle ? `${e.libelle} (${e.code})` : e.code}
                </option>
              ))}
          </select>

          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            disabled={produitChoisi === null}
            placeholder="Prix"
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Prix d'achat unitaire"
          />

          <Button onClick={ajouter} disabled={!peutAjouter}>
            <PackagePlus size={16} /> Ajouter
          </Button>
        </div>

        {/* Fournisseur — hors grille : c'est un cadre, pas un champ de ligne */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="fournisseur">
            Acheté à
          </label>
          <select
            id="fournisseur"
            value={fournisseurId}
            onChange={(e) => setFournisseurId(e.target.value ? Number(e.target.value) : "")}
            className="min-w-64 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— choisir le fournisseur —</option>
            {(fournisseurs ?? []).map((f: { id: number; nom: string }) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
          {!fournisseurId && (
            <span className="text-xs text-muted-foreground">
              obligatoire : c&apos;est lui qui portera la dette
            </span>
          )}
        </div>

        {cameraOuverte && (
          <div className="mt-3">
            <BarcodeScanner
              ouvert={cameraOuverte}
              onClose={() => setCameraOuverte(false)}
              onDetect={(v) => {
                setTexte(v);
                setProduitChoisi(null);
                setCameraOuverte(false);
              }}
            />
          </div>
        )}

        {/* Résultats + garde-fou anti-doublon */}
        {rechercheActive && (
          <div className="mt-3 space-y-2">
            {isFetching && <p className="text-xs text-muted-foreground">Recherche…</p>}
            {recherche?.resultats.length === 0 && !isFetching && (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Aucune fiche pour « {texte.trim()} ». Créez-la d&apos;abord au catalogue : une
                réception sans article ne peut pas créer la pièce.
              </p>
            )}
            {recherche?.resultats.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProduitChoisi(p.id);
                  setTexte(p.titre);
                  if (prix === "" && p.prixAchat) setPrix(String(p.prixAchat));
                  window.setTimeout(() => refQuantite.current?.focus(), 50);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.titre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.codeBarre}
                    {p.prixAchat && ` · ${Number(p.prixAchat).toLocaleString("fr-FR")} F`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block font-mono">{Number(p.quantiteStock)}</span>
                  en stock
                </span>
              </button>
            ))}
            {recherche?.doublonsPossibles && recherche.doublonsPossibles.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Copy size={13} /> Ces articles se ressemblent
                </p>
                <ul className="mt-1 space-y-1">
                  {recherche.doublonsPossibles.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setProduitChoisi(d.id);
                          setTexte(d.titre);
                        }}
                        className="text-left text-xs underline-offset-2 hover:underline"
                      >
                        {d.titre} · {d.score}%
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Lot — seulement si l'article est traçable */}
        {produitChoisi !== null && tracable && (
          <div className="mt-3 grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-3">
            <p className="col-span-full text-xs text-muted-foreground">
              Article traçable — la date de péremption{articleTrouve?.dlcJours
                ? ` est calculée à partir d'un délai de ${articleTrouve.dlcJours} jours`
                : " n&apos;est pas calculée ici, saisissez-la"}
              .
            </p>
            <input
              value={numeroLot}
              onChange={(e) => setNumeroLot(e.target.value)}
              placeholder="N° de lot (fabricant)"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="date"
              value={dateFabrication}
              onChange={(e) => setDateFabrication(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Date de fabrication"
            />
            <input
              type="date"
              value={datePeremption}
              onChange={(e) => setDatePeremption(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Date de péremption"
            />
          </div>
        )}
      </section>

      {lignes.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={40} />}
          title="Aucune ligne préparée"
          description="Choisissez le fournisseur, cherchez une pièce, saisissez la quantité et le prix."
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Article</th>
                <th className="px-3 py-2 text-right">Reçu</th>
                <th className="px-3 py-2 text-right">Prix</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">CMUP après</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => {
                const prevu = apercu?.lignes.find((x) => x.produitId === l.produitId);
                return (
                  <tr key={l.cle} className="bg-background">
                    <td className="px-3 py-2">
                      <span className="block truncate font-medium">{l.titre}</span>
                      {l.numeroLot && (
                        <span className="block text-xs text-muted-foreground">
                          lot {l.numeroLot}
                          {l.datePeremption &&
                            ` · DLC ${new Date(l.datePeremption).toLocaleDateString("fr-FR")}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.quantite}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.prixUnitaire != null ? (
                        `${l.prixUnitaire.toLocaleString("fr-FR")} F`
                      ) : (
                        <span className="text-muted-foreground" title="Aucun coût enregistré">
                          — 
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground sm:table-cell">
                      {prevu?.cmupApres != null
                        ? `${Math.round(prevu.cmupApres).toLocaleString("fr-FR")} F`
                        : "—"}
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
          {sansCout > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {sansCout} ligne(s) sans prix d&apos;achat. Elles entreront en stock sans coût et ne
              compteront pas dans la valeur du stock — renseignez le prix si vous le connaissez.
            </p>
          )}
          {auDessus > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {auDessus} ligne(s) dépassent le stock maximum déclaré sur la fiche.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              Total :{" "}
              <strong>
                {Math.round(apercu?.totaux.valeur ?? 0).toLocaleString("fr-FR")} F
              </strong>{" "}
              · {apercu?.totaux.articles ?? 0} article(s) ·{" "}
              {apercu?.totaux.lotsACreer ?? 0} lot(s)
            </p>
            <Button
              disabled={recevoir.isPending || fournisseurId === ""}
              onClick={() =>
                fournisseurId !== "" &&
                recevoir.mutate({
                  fournisseurId: Number(fournisseurId),
                  lignes: lignes.map((l) => ({
                    produitId: l.produitId,
                    quantite: l.quantite,
                    prixUnitaire: l.prixUnitaire,
                    emplacementId: l.emplacementId,
                    numeroLot: l.numeroLot || null,
                    dateFabrication: l.dateFabrication || null,
                    datePeremption: l.datePeremption || null,
                  })),
                })
              }
            >
              {recevoir.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Enregistrer la réception
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}