"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SelectSearch } from "~/components/ui/select-search";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { api } from "~/trpc/react";
import { AttributDefLigne } from "./attribut-def-ligne";

const ETATS_PRODUIT = ["NEUF", "OCCASION", "RECONDITIONNE", "REMANUFACTURE"];
const ORIGINES_PRODUIT = ["CONSTRUCTEUR", "OEM", "AFTERMARKET", "ADAPTABLE"];
const LIB_ETATS: Record<string, string> = { NEUF: "Neuf", OCCASION: "Occasion", RECONDITIONNE: "Reconditionné", REMANUFACTURE: "Reusiné (remanufacturé)" };
const LIB_ORIGINES: Record<string, string> = { CONSTRUCTEUR: "Constructeur", OEM: "OEM (équivalent d'origine)", AFTERMARKET: "Après-vente (aftermarket)", ADAPTABLE: "Adaptable" };
const COTES = ["GAUCHE", "DROITE", "CENTRAL", "LES_DEUX", "N_A"];
const ESSIEUX = ["AVANT", "ARRIERE", "N_A"];
const ZONES = ["INTERIEUR", "EXTERIEUR", "SUPERIEUR", "INFERIEUR", "N_A"];
const EMPLACEMENTS_POS = ["MOTEUR", "BOITE", "ROUE", "HABITACLE", "CARROSSERIE", "FREINAGE", "CLIM", "CHASSIS", "N_A"];
const TYPES_OUTIL = ["INDIVIDUEL", "KIT", "JEU", "MACHINE"];
const ETATS_EQUIPEMENT = ["NEUF", "TRES_BON", "BON", "MOYEN", "USE", "ENDOMMAGE", "HORS_SERVICE", "EN_REPARATION"];

export type VarianteForm = {
  marque: string;
  referencePrincipale: string;
  referenceFabricant: string;
  codeArticle: string;
  conditionnement: string;
  etatProduit: string;
  origineProduit: string;
  positionCote: string;
  positionEssieu: string;
  prixAchat: string;
  prixVente: string;
  prixPro: string;
  prixParticulier: string;
  tva: string;
  prixMinimumVente: string;
  uniteStockId: string;
  stockInitial: string;
  emplacementStockId: string;
  seuilAlerte: string;
  stockSecurite: string;
  pointCommande: string;
  qteMinCommande: string;
  fournisseurId: string;
  numeroSerie: string;
  numeroLot: string;
  dateExpiration: string;
  garantieMois: string;
  estCore: boolean;
  valeurCore: string;
  // Bloc comptable & analytique
  compteComptable: string;
  centreDeCout: string;
  methodeValorisation: string;
  // Outillage / équipement
  typeOutil: string;
  etatEquipement: string;
  calibrable: boolean;
  numeroImmobilisation: string;
  valeurAcquisition: string;
  // Attributs différenciants
  attributs: { cle: string; valeur: string; unite: string; statutValeur?: string }[];
  // Conversions d'unités (unité de base + secondaires)
  unites: { uniteId: string; facteurVersBase: string; prixAchat: string; prixVente: string; estUniteBase: boolean; estUniteAchatDefaut: boolean; estUniteVenteDefaut: boolean }[];
  // Fournisseurs secondaires
  fournisseurs: { fournisseurId: string; referenceFournisseur: string; prixAchat: string; delaiApprovisionnement: string; estPrincipal: boolean; uniteConditionnement: string; facteurConditionnement: string }[];
};

export type SectionsVariante = ("identite" | "attributs" | "prix" | "fournisseurs" | "stock")[];

export const varianteVide = (): VarianteForm => ({
  marque: "", referencePrincipale: "", referenceFabricant: "", codeArticle: "", conditionnement: "",
  etatProduit: "NEUF", origineProduit: "AFTERMARKET", positionCote: "N_A", positionEssieu: "N_A",
  prixAchat: "", prixVente: "", prixPro: "", prixParticulier: "", tva: "0", prixMinimumVente: "",
  uniteStockId: "", stockInitial: "", emplacementStockId: "", seuilAlerte: "5", stockSecurite: "", pointCommande: "", qteMinCommande: "",
  fournisseurId: "", numeroSerie: "", numeroLot: "", dateExpiration: "", garantieMois: "",
  estCore: false, valeurCore: "",
  compteComptable: "", centreDeCout: "", methodeValorisation: "CUMP",
  typeOutil: "INDIVIDUEL", etatEquipement: "NEUF", calibrable: false,
  numeroImmobilisation: "", valeurAcquisition: "", attributs: [],
  unites: [{ uniteId: "", facteurVersBase: "1", prixAchat: "", prixVente: "", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
  fournisseurs: [],
});

interface VarianteCardProps {
  index: number;
  value: VarianteForm;
  typeArticle: string;
  optUnites: { value: string; label: string }[];
  optEmplacements: { value: string; label: string }[];
  optFournisseurs: { value: string; label: string }[];
  defsVariante?: { cle: string; libelle: string; typeAttribut: string; liste?: string[]; obligatoire?: boolean; aide?: string | null; uniteSymbole?: string | null }[];
  onRemove: () => void;
  onChange: (patch: Partial<VarianteForm>) => void;
  /** Sections affichées (le wizard 8 étapes n'affiche qu'une partie de la carte par étape). */
  sections?: SectionsVariante;
}

/** Carte d'une variante / exemplaire dans le formulaire de création d'article (V3). */
export function VarianteCard({ index, value, typeArticle, optUnites, optEmplacements, optFournisseurs, defsVariante = [], onRemove, onChange, sections }: VarianteCardProps) {
  const estExemplaire = typeArticle === "OUTIL" || typeArticle === "EQUIPEMENT";
  const estPiece = typeArticle === "PIECE" || typeArticle === "CONSOMMABLE";
  const show = (s: SectionsVariante[number]) => !sections || sections.includes(s);
  const set = (patch: Partial<VarianteForm>) => onChange(patch);
  const attrByCle = (cle: string) => value.attributs.find((a) => a.cle === cle);
  const setAttr = (cle: string, patch: Partial<{ valeur: string; unite: string; statutValeur: string }>) => {
    if (attrByCle(cle)) set({ attributs: value.attributs.map((a) => (a.cle === cle ? { ...a, ...patch } : a)) });
    else set({ attributs: [...value.attributs, { cle, valeur: "", unite: "", ...patch }] });
  };
  const setUnite = (i: number, patch: Partial<VarianteForm["unites"][number]>) =>
    set({ unites: value.unites.map((u, idx) => (idx === i ? { ...u, ...patch } : u)) });
  const setFournisseur = (i: number, patch: Partial<VarianteForm["fournisseurs"][number]>) =>
    set({ fournisseurs: value.fournisseurs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });

  const { data: doublons } = api.articles.detecterDoublons.useQuery(
    { reference: value.referencePrincipale.trim() },
    { enabled: !estExemplaire && value.referencePrincipale.trim().length >= 3 }
  );
  const aDesDoublons = !estExemplaire && (doublons?.exacts?.length ?? 0) > 0;
  const titre = `${estExemplaire ? "Exemplaire" : "Variante"} ${index + 1}`;

  const utils = api.useUtils();
  const [showNouvelEmplacement, setShowNouvelEmplacement] = useState(false);
  const [nvCode, setNvCode] = useState("");
  const [nvLibelle, setNvLibelle] = useState("");
  const [nvType, setNvType] = useState("RAYON");
  const [nvParent, setNvParent] = useState("");
  const creerEmplacement = api.stock.createEmplacement.useMutation({
    onSuccess: (r) => {
      toast.success("Emplacement créé");
      utils.stock.listEmplacements.invalidate();
      set({ emplacementStockId: String(r.id) });
      setShowNouvelEmplacement(false);
      setNvCode(""); setNvLibelle(""); setNvParent("");
    },
    onError: (e) => toast.error(e.message),
  });
  const saveEmplacement = () => {
    if (!nvCode.trim()) { toast.error("Code requis (ZONE-ALLEE-RAYON-NIVEAU)"); return; }
    creerEmplacement.mutate({ code: nvCode.trim().toUpperCase(), libelle: nvLibelle.trim() || undefined, type: nvType, parentId: nvParent ? Number(nvParent) : undefined });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{titre}</span>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 size={13} /> Retirer
        </button>
      </div>

      {/* Identification */}
      {show("identite") && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
        <Input value={value.marque} onChange={(e) => set({ marque: e.target.value })} placeholder="Marque * (Bosch, Total…)" />
        <div className="relative">
          <Input value={value.referencePrincipale} onChange={(e) => set({ referencePrincipale: e.target.value })} placeholder="Référence principale * (BP1234…)" />
          {aDesDoublons && (
            <span className="absolute -bottom-4 left-0 flex items-center gap-1 text-[10px] font-semibold text-warning-foreground">
              <AlertTriangle size={10} /> Réf. déjà existante — vérifiée avant l'enregistrement
            </span>
          )}
        </div>
        <Input value={value.referenceFabricant} onChange={(e) => set({ referenceFabricant: e.target.value })} placeholder="Réf. fabricant" />
        <Input value={value.codeArticle} onChange={(e) => set({ codeArticle: e.target.value })} placeholder="Code article" />
          {!estExemplaire && <Input value={value.conditionnement} onChange={(e) => set({ conditionnement: e.target.value })} placeholder="Conditionnement (jeu de 4, 5 L…)" />}
        </div>

        {/* Nature + position */}
        <div className="grid gap-2 sm:grid-cols-4">
        <select value={value.etatProduit} onChange={(e) => set({ etatProduit: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
          {ETATS_PRODUIT.map((t) => <option key={t} value={t}>{LIB_ETATS[t]}</option>)}
        </select>
        <select value={value.origineProduit} onChange={(e) => set({ origineProduit: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
          {ORIGINES_PRODUIT.map((t) => <option key={t} value={t}>{LIB_ORIGINES[t]}</option>)}
        </select>
        <select value={value.positionCote} onChange={(e) => set({ positionCote: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
          {COTES.map((t) => <option key={t} value={t}>{t === "N_A" ? "Côté : N/A" : `Côté : ${t}`}</option>)}
        </select>
        <select value={value.positionEssieu} onChange={(e) => set({ positionEssieu: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
          {ESSIEUX.map((t) => <option key={t} value={t}>{t === "N_A" ? "Essieu : N/A" : `Essieu : ${t}`}</option>)}
        </select>
      </div>
        </>
      )}

      {/* Prix */}
      {show("prix") && (
        <>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="number" min={0} value={value.prixAchat} onChange={(e) => set({ prixAchat: e.target.value })} placeholder="Prix achat (F)" />
        {!estExemplaire && <Input type="number" min={0} value={value.prixVente} onChange={(e) => set({ prixVente: e.target.value })} placeholder="Prix vente (F)" />}
        {!estExemplaire && <Input type="number" min={0} value={value.prixMinimumVente} onChange={(e) => set({ prixMinimumVente: e.target.value })} placeholder="Prix min. vente (F)" />}
        {!estExemplaire && <Input type="number" min={0} value={value.prixPro} onChange={(e) => set({ prixPro: e.target.value })} placeholder="Prix pro (F)" />}
        {!estExemplaire && <Input type="number" min={0} value={value.prixParticulier} onChange={(e) => set({ prixParticulier: e.target.value })} placeholder="Prix particulier (F)" />}
        <Input type="number" min={0} max={100} value={value.tva} onChange={(e) => set({ tva: e.target.value })} placeholder="TVA %" />
      </div>
      {!estExemplaire && value.prixVente !== "" && value.prixAchat !== "" && (() => {
        const marge = Number(value.prixVente) - Number(value.prixAchat);
        const taux = Number(value.prixAchat) > 0 ? Math.round((marge / Number(value.prixAchat)) * 100) : 0;
        return (
          <p className={`text-xs font-semibold ${marge >= 0 ? "text-success-foreground" : "text-destructive"}`}>
            Marge : {marge.toLocaleString("fr-FR")} F ({taux} %)
          </p>
        );
      })()}

      {/* Bloc comptable & analytique */}
      {!estExemplaire && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={value.compteComptable} onChange={(e) => set({ compteComptable: e.target.value })} placeholder="Compte comptable (6072…)" />
          <Input value={value.centreDeCout} onChange={(e) => set({ centreDeCout: e.target.value })} placeholder="Centre de coût" />
          <select value={value.methodeValorisation} onChange={(e) => set({ methodeValorisation: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            <option value="CUMP">Valorisation : CUMP</option>
            <option value="FIFO">Valorisation : FIFO</option>
          </select>
        </div>
      )}
        </>
      )}

      {/* Stock (exemplaires : identité de l'actif, visible à l'étape identification) */}
      {estExemplaire ? (
        show("identite") && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={value.numeroSerie} onChange={(e) => set({ numeroSerie: e.target.value })} placeholder="N° de série" />
            <Input type="number" min={0} value={value.valeurAcquisition} onChange={(e) => set({ valeurAcquisition: e.target.value })} placeholder="Valeur d'acquisition (F)" />
            {typeArticle === "EQUIPEMENT" && (
              <Input value={value.numeroImmobilisation} onChange={(e) => set({ numeroImmobilisation: e.target.value })} placeholder="N° d'immobilisation *" />
            )}
          </div>
        )
      ) : show("stock") ? (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input type="number" min={0} value={value.stockInitial} onChange={(e) => set({ stockInitial: e.target.value })} placeholder="Stock initial" />
            <Input type="number" min={0} value={value.seuilAlerte} onChange={(e) => set({ seuilAlerte: e.target.value })} placeholder="Stock min" />
            <Input type="number" min={0} value={value.stockSecurite} onChange={(e) => set({ stockSecurite: e.target.value })} placeholder="Stock sécurité" />
            <Input type="number" min={0} value={value.pointCommande} onChange={(e) => set({ pointCommande: e.target.value })} placeholder="Point de commande" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectSearch value={value.uniteStockId || null} onChange={(v) => set({ uniteStockId: String(v) })} options={optUnites} placeholder="Unité de stock" searchPlaceholder="Rechercher…" size="sm" />
            <SelectSearch value={value.emplacementStockId || null} onChange={(v) => set({ emplacementStockId: String(v) })} options={optEmplacements} placeholder="Emplacement initial" searchPlaceholder="Magasin › rayon › étagère…" size="sm" />
            <SelectSearch value={value.fournisseurId || null} onChange={(v) => set({ fournisseurId: String(v) })} options={optFournisseurs} placeholder="Fournisseur principal" searchPlaceholder="Rechercher…" size="sm" />
          </div>
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => setShowNouvelEmplacement((v) => !v)}
          >
            <Plus size={11} /> Nouvel emplacement (création à la volée)
          </button>
          {showNouvelEmplacement && (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-border bg-background p-2">
              <div className="grid gap-1.5 sm:grid-cols-4">
                <input value={nvCode} onChange={(e) => setNvCode(e.target.value)} placeholder="Code (MAG-A-01)*" className="rounded border border-border bg-background px-2 py-1 text-xs font-mono" />
                <input value={nvLibelle} onChange={(e) => setNvLibelle(e.target.value)} placeholder="Libellé" className="rounded border border-border bg-background px-2 py-1 text-xs" />
                <select value={nvType} onChange={(e) => setNvType(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
                  {["RAYON", "SOL", "TIROIR", "EXTERIEUR", "FRIGO", "AUTRE"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <SelectSearch value={nvParent || null} onChange={(v) => setNvParent(String(v))} options={optEmplacements} placeholder="Sous (optionnel)…" searchPlaceholder="Rechercher…" size="sm" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!nvCode.trim() || creerEmplacement.isPending}
                  onClick={saveEmplacement}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {creerEmplacement.isPending ? "Création…" : "Créer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNouvelEmplacement(false)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Unités & conversions (bloc 3) */}
      {!estExemplaire && show("stock") && (
        <div className="rounded-lg bg-muted/20 p-2">
          <Label className="text-[10px] text-muted-foreground">Unités & conditionnements — conversions</Label>
          <div className="mt-1 space-y-1">
            {value.unites.map((u, i) => (
              <div key={i} className="rounded-md border border-border/60 bg-background p-1.5">
                <div className="grid grid-cols-12 items-center gap-1">
                  <SelectSearch value={u.uniteId || null} onChange={(v) => setUnite(i, { uniteId: String(v) })} options={optUnites} placeholder="Unité (L, carton, jeu…)" searchPlaceholder="Rechercher…" size="sm" className="col-span-3" />
                  <input type="number" min={0} value={u.facteurVersBase} onChange={(e) => setUnite(i, { facteurVersBase: e.target.value })} placeholder="Facteur (12 = carton de 12)" className="col-span-3 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input type="number" min={0} value={u.prixAchat} onChange={(e) => setUnite(i, { prixAchat: e.target.value })} placeholder="Prix achat/unité" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input type="number" min={0} value={u.prixVente} onChange={(e) => setUnite(i, { prixVente: e.target.value })} placeholder="Prix vente/unité" className="col-span-3 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => set({ unites: value.unites.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={u.estUniteBase} onChange={(e) => setUnite(i, { estUniteBase: e.target.checked })} className="size-3" /> unité de base</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={u.estUniteAchatDefaut} onChange={(e) => setUnite(i, { estUniteAchatDefaut: e.target.checked })} className="size-3" /> achat par défaut</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={u.estUniteVenteDefaut} onChange={(e) => setUnite(i, { estUniteVenteDefaut: e.target.checked })} className="size-3" /> vente par défaut</label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => set({ unites: [...value.unites, { uniteId: "", facteurVersBase: "1", prixAchat: "", prixVente: "", estUniteBase: value.unites.length === 0, estUniteAchatDefaut: value.unites.length === 0, estUniteVenteDefaut: value.unites.length === 0 }] })}>
            <Plus size={11} /> Unité
          </button>
        </div>
      )}

      {/* Fournisseurs (principal + secondaires) */}
      {!estExemplaire && show("fournisseurs") && (
        <div className="rounded-lg bg-muted/20 p-2">
          <Label className="text-[10px] text-muted-foreground">Fournisseurs (principal + secondaires)</Label>
          <div className="mt-1 space-y-1">
            {value.fournisseurs.map((f, i) => (
              <div key={i} className="rounded-md border border-border/60 bg-background p-1.5">
                <div className="grid grid-cols-12 items-center gap-1">
                  <SelectSearch value={f.fournisseurId || null} onChange={(v) => setFournisseur(i, { fournisseurId: String(v) })} options={optFournisseurs} placeholder="Fournisseur" searchPlaceholder="Rechercher…" size="sm" className="col-span-3" />
                  <input value={f.referenceFournisseur} onChange={(e) => setFournisseur(i, { referenceFournisseur: e.target.value })} placeholder="Réf. fournisseur" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input type="number" min={0} value={f.prixAchat} onChange={(e) => setFournisseur(i, { prixAchat: e.target.value })} placeholder="Prix achat" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input type="number" min={0} value={f.delaiApprovisionnement} onChange={(e) => setFournisseur(i, { delaiApprovisionnement: e.target.value })} placeholder="Délai (j)" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input type="number" min={0} value={f.facteurConditionnement} onChange={(e) => setFournisseur(i, { facteurConditionnement: e.target.value })} placeholder="Facteur" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => set({ fournisseurs: value.fournisseurs.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={f.estPrincipal} onChange={(e) => setFournisseur(i, { estPrincipal: e.target.checked })} className="size-3" /> fournisseur principal</label>
                  <SelectSearch value={f.uniteConditionnement || null} onChange={(v) => setFournisseur(i, { uniteConditionnement: String(v) })} options={optUnites} placeholder="Conditionnement…" searchPlaceholder="Rechercher…" size="sm" className="w-40" />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => set({ fournisseurs: [...value.fournisseurs, { fournisseurId: "", referenceFournisseur: "", prixAchat: "", delaiApprovisionnement: "", estPrincipal: false, uniteConditionnement: "", facteurConditionnement: "" }] })}>
            <Plus size={11} /> Fournisseur
          </button>
        </div>
      )}

      {/* Spécifique outillage / équipement */}
      {estExemplaire && show("identite") && (
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={value.typeOutil} onChange={(e) => set({ typeOutil: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            {TYPES_OUTIL.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={value.etatEquipement} onChange={(e) => set({ etatEquipement: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            {ETATS_EQUIPEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={value.calibrable} onChange={(e) => set({ calibrable: e.target.checked })} className="size-4" />
            Soumis à calibration
          </label>
        </div>
      )}

      {/* Traçabilité */}
      {!estExemplaire && show("stock") && (
        <div className="grid gap-2 sm:grid-cols-4">
          <Input value={value.numeroLot} onChange={(e) => set({ numeroLot: e.target.value })} placeholder="N° de lot" />
          <Input type="date" value={value.dateExpiration} onChange={(e) => set({ dateExpiration: e.target.value })} className="text-xs" />
          <Input type="number" min={0} value={value.garantieMois} onChange={(e) => set({ garantieMois: e.target.value })} placeholder="Garantie (mois)" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={value.estCore} onChange={(e) => set({ estCore: e.target.checked })} className="size-4" />
            Échange standard (core)
          </label>
        </div>
      )}

      {/* Attributs différenciants */}
      {show("attributs") && (
      <div className="rounded-lg bg-muted/20 p-2">
        <Label className="text-[10px] text-muted-foreground">Caractéristiques différenciantes (cette référence){defsVariante.length > 0 ? ` — ${defsVariante.length} générée(s) par la catégorie` : ""}</Label>
        {defsVariante.length > 0 && (
          <div className="mt-1 space-y-1">
            {defsVariante.map((d) => {
              const n = attrByCle(d.cle);
              return (
                <AttributDefLigne
                  key={d.cle}
                  def={d}
                  value={n?.valeur ?? ""}
                  unite={n?.unite || d.uniteSymbole}
                  statut={n?.statutValeur ?? "RENSEIGNE"}
                  onStatutChange={(s) => setAttr(d.cle, { statutValeur: s })}
                  onChange={(v) => setAttr(d.cle, { valeur: v, unite: n?.unite || d.uniteSymbole || "" })}
                />
              );
            })}
          </div>
        )}
        <div className="mt-1 space-y-1">
          {value.attributs.filter((a) => !defsVariante.some((d) => d.cle === a.cle)).map((a, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-1">
              <input value={a.cle} onChange={(e) => set({ attributs: value.attributs.map((x, idx) => (idx === i ? { ...x, cle: e.target.value } : x)) })} placeholder="Clé (épaisseur…)" className="col-span-5 rounded border border-border bg-background px-2 py-1 text-xs" />
              <input value={a.valeur} onChange={(e) => set({ attributs: value.attributs.map((x, idx) => (idx === i ? { ...x, valeur: e.target.value } : x)) })} placeholder="Valeur" className="col-span-4 rounded border border-border bg-background px-2 py-1 text-xs" />
              <input value={a.unite} onChange={(e) => set({ attributs: value.attributs.map((x, idx) => (idx === i ? { ...x, unite: e.target.value } : x)) })} placeholder="Unité" className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs" />
              <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => set({ attributs: value.attributs.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => set({ attributs: [...value.attributs, { cle: "", valeur: "", unite: "" }] })}
        >
          <Plus size={11} /> Ligne
        </button>
      </div>
      )}
    </div>
  );
}