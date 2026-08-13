"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { RefreshCw, Plus, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

const TYPES_AJUSTEMENT = [
  { value: "POSITIF", label: "Augmentation (entrée stock)", color: "text-success-foreground bg-success/10 dark:text-success-foreground dark:bg-success/10" },
  { value: "NEGATIF", label: "Diminution (sortie stock)", color: "text-destructive bg-destructive/10 dark:text-destructive dark:bg-destructive/10" },
] as const;

const TYPES_PERTE = [
  { value: "VOL", label: "Vol" },
  { value: "CASSE", label: "Casse" },
  { value: "AVARIE", label: "Avarie" },
  { value: "REBUT", label: "Rebut" },
] as const;

export default function AjustementManuelPage() {
  const { hasPermission } = usePermissions();
  const [produitSearch, setProduitSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedTitre, setSelectedTitre] = useState("");
  const [typeAjustement, setTypeAjustement] = useState<"POSITIF" | "NEGATIF">("POSITIF");
  const [nature, setNature] = useState<"AJUSTEMENT" | "CASSE_PERTE">("AJUSTEMENT");
  const [typePerte, setTypePerte] = useState<"VOL" | "CASSE" | "AVARIE" | "REBUT">("VOL");
  const [uniteId, setUniteId] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [coutUnitaire, setCoutUnitaire] = useState("");
  const [motif, setMotif] = useState("");
  const [motifAutre, setMotifAutre] = useState("");
  const [emplacementId, setEmplacementId] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const utils = api.useUtils();
  const { data: produits } = api.catalog.listProducts.useQuery();
  const produitsList = produits?.items ?? [];
  const { data: allUnites } = api.reference.listUnitesMesure.useQuery();
  const { data: rayons } = api.stock.listRayons.useQuery();

  const mutation = api.stock.ajustementManuel.useMutation({
    onSuccess: (result) => {
      utils.stock.getDashboard.invalidate();
      setShowSuccess(true);
      resetForm();
      setTimeout(() => setShowSuccess(false), 3000);
      toast.success(`Ajustement ${result.type === "AJUSTEMENT_INVENTAIRE_POSITIF" ? "positif" : result.type === "CASSE_PERTE" ? "casse/perte" : "négatif"} effectué`);
    },
    onError: (e) => toast.error(e.message),
  });

  const declarerPerteMut = api.stock.declarerPerte.useMutation({
    onSuccess: (r) => {
      utils.stock.getDashboard.invalidate();
      utils.marge.getAnalyseLots.invalidate();
      setShowSuccess(true);
      resetForm();
      setTimeout(() => setShowSuccess(false), 3000);
      toast.success(`${r.type} déclaré — ${r.quantite} unité(s) déduites du stock (${r.montantPerte.toLocaleString()} F de perte${r.lotId ? ` sur le lot #${r.lotId}` : ""})`);
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSelectedId("");
    setSelectedTitre("");
    setProduitSearch("");
    setTypeAjustement("POSITIF");
    setNature("AJUSTEMENT");
    setTypePerte("VOL");
    setUniteId("");
    setQuantite(1);
    setCoutUnitaire("");
    setMotif("");
    setMotifAutre("");
    setEmplacementId("");
  }

  const produitsFiltres = produitsList.filter(p =>
    p.titre?.toLowerCase().includes(produitSearch.toLowerCase()) && p.id !== selectedId
  ) ?? [];

  function selectProduit(produitId: string) {
    const p = produitsList.find(p => p.id === produitId);
    if (!p) return;
    setSelectedId(produitId);
    setSelectedTitre(p.titre ?? "");
    setProduitSearch("");
  }

  const peutConfirmer = selectedId && uniteId && quantite > 0 && motif.trim().length > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground dark:text-foreground">Ajustement manuel</h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">Corriger le stock pour inventaire, casse, perte, vol, etc.</p>
      </div>

      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-success/20 dark:bg-success/10 p-3 text-sm text-success-foreground dark:text-success-foreground">
          <CheckCircle size={16} /> Ajustement effectué avec succès
        </div>
      )}

      <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4 space-y-4">
        <div className="relative">
          <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Produit</label>
          <input
            type="text"
            placeholder="Rechercher un produit..."
            className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            value={selectedId ? selectedTitre : produitSearch}
            onChange={(e) => { setProduitSearch(e.target.value); setSelectedId(""); setSelectedTitre(""); }}
            readOnly={!!selectedId}
          />
          {!selectedId && produitSearch && produitsFiltres.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted shadow-lg max-h-48 overflow-y-auto">
              {produitsFiltres.slice(0, 10).map(p => (
                <button
                  key={p.id}
                  className="w-full px-4 py-2 text-left text-sm text-foreground/80 dark:text-foreground/80 hover:bg-accent dark:hover:bg-accent"
                  onClick={() => selectProduit(p.id)}
                >
                  {p.titre}
                </button>
              ))}
            </div>
          )}
          {selectedId && (
            <button
              className="absolute right-2 top-8 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10 transition-colors"
              onClick={resetForm}
              title="Changer de produit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Type d'ajustement</label>
          <div className="flex gap-2">
            {TYPES_AJUSTEMENT.map(t => (
              <button
                key={t.value}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  typeAjustement === t.value
                    ? "border-primary bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary"
                    : "border-border dark:border-border text-muted-foreground dark:text-muted-foreground hover:border-border"
                }`}
                onClick={() => setTypeAjustement(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {typeAjustement === "NEGATIF" && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">
              Nature de la sortie <span className="text-muted-foreground font-normal">— casse/perte/vol déduit le stock du lot et impute la perte au lot</span>
            </label>
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  nature === "AJUSTEMENT"
                    ? "border-primary bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary"
                    : "border-border dark:border-border text-muted-foreground dark:text-muted-foreground hover:border-border"
                }`}
                onClick={() => setNature("AJUSTEMENT")}
              >
                Ajustement d'inventaire
              </button>
              <button
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  nature === "CASSE_PERTE"
                    ? "border-primary bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary"
                    : "border-border dark:border-border text-muted-foreground dark:text-muted-foreground hover:border-border"
                }`}
                onClick={() => setNature("CASSE_PERTE")}
              >
                Casse / Perte / Vol
              </button>
            </div>
          </div>
        )}

        {typeAjustement === "NEGATIF" && nature === "CASSE_PERTE" && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Type d'aléa</label>
            <div className="flex flex-wrap gap-2">
              {TYPES_PERTE.map((t) => (
                <button
                  key={t.value}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    typePerte === t.value
                      ? "border-destructive bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive"
                      : "border-border dark:border-border text-muted-foreground dark:text-muted-foreground hover:border-border"
                  }`}
                  onClick={() => setTypePerte(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Unité</label>
            <select
              className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={uniteId}
              onChange={(e) => setUniteId(e.target.value)}
            >
              <option value="">Sélectionner</option>
              {allUnites?.map(u => <option key={u.id} value={u.id}>{u.libelle} ({u.code})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Quantité</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={quantite || ""}
              onChange={(e) => setQuantite(Number(e.target.value))}
            />
          </div>
        </div>

        {typeAjustement === "POSITIF" && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">
              Coût unitaire (base) <span className="text-muted-foreground font-normal">— pour le calcul CMUP</span>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Optionnel"
              className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={coutUnitaire}
              onChange={(e) => setCoutUnitaire(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">
            Emplacement <span className="text-muted-foreground font-normal">— optionnel</span>
          </label>
          <select
            className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            value={emplacementId}
            onChange={(e) => setEmplacementId(e.target.value)}
          >
            <option value="">Stock général</option>
            {rayons?.map(r => <option key={r.id} value={r.id}>{r.code} - {r.libelle}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">
            Motif <span className="text-destructive">*</span>
          </label>
          <select
            className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          >
            <option value="">Sélectionner un motif</option>
            <option value="Inventaire">Inventaire</option>
            <option value="Casse">Casse</option>
            <option value="Vol">Vol</option>
            <option value="Perte">Perte</option>
            <option value="Erreur de saisie">Erreur de saisie</option>
            <option value="Retour client">Retour client</option>
            <option value="Retour fournisseur">Retour fournisseur</option>
            <option value="Don">Don</option>
            <option value="Échantillon">Échantillon</option>
            <option value="Autre">Autre</option>
          </select>
          {motif === "Autre" && (
            <input
              type="text"
              placeholder="Précisez le motif..."
              className="mt-2 w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={motifAutre}
              onChange={(e) => { setMotifAutre(e.target.value); setMotif(e.target.value); }}
            />
          )}
        </div>
      </div>

      {!peutConfirmer && (
        <div className="flex items-start gap-2 rounded-lg bg-warning/10 dark:bg-warning/5 p-3 text-xs text-warning-foreground dark:text-warning-foreground">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>Sélectionnez un produit, une unité, une quantité et un motif</p>
        </div>
      )}

      {hasPermission("stock.modifier") && (
        <button
          className="w-full rounded-lg bg-gradient-to-r from-primary to-primary py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-colors"
          disabled={!peutConfirmer || mutation.isPending || declarerPerteMut.isPending}
          onClick={async () => {
            try {
              if (nature === "CASSE_PERTE") {
                await declarerPerteMut.mutateAsync({
                  produitId: selectedId,
                  typePerte,
                  uniteId,
                  quantite,
                  motif,
                });
              } else {
                await mutation.mutateAsync({
                  produitId: selectedId,
                  typeAjustement,
                  nature,
                  uniteId,
                  quantite,
                  coutUnitaireBase: coutUnitaire ? parseInt(coutUnitaire) : undefined,
                  motif,
                  emplacementId: emplacementId ? Number(emplacementId) : undefined,
                });
              }
            } catch {}
          }}
        >
          {mutation.isPending || declarerPerteMut.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
              Traitement...
            </span>
          ) : (
            "Confirmer"
          )}
        </button>
      )}

      <div className="rounded-xl border border-border dark:border-border bg-warning/10 dark:bg-warning/5 p-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-warning-foreground dark:text-warning-foreground mb-2">
          <AlertTriangle size={14} /> Types de mouvements générés
        </h4>
        <ul className="text-xs text-warning-foreground dark:text-warning-foreground space-y-1">
          <li><strong>Augmentation</strong> → <code>AJUSTEMENT_INVENTAIRE_POSITIF</code> (entrée stock, recalcule CMUP)</li>
          <li><strong>Diminution (Ajustement)</strong> → <code>AJUSTEMENT_INVENTAIRE_NEGATIF</code> (sortie stock)</li>
          <li><strong>Diminution (Casse / Perte / Vol)</strong> → débit stock du lot (FIFO) + mouvement <code>CASSE_PERTE</code> + perte financière liée au lot (impact sur le bénéfice estimé du lot)</li>
        </ul>
      </div>
    </motion.div>
  );
}
