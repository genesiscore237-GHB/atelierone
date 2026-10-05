"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SelectSearch } from "~/components/ui/select-search";
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Loader2, Trash2, Save, Package, BadgeCheck, GitCompareArrows, RefreshCcw, Wrench, LogOut, Pencil, MapPin, Car } from "lucide-react";

const ETAT_LABELS: Record<string, string> = { NEUF: "Neuf", OCCASION: "Occasion", RECONDITIONNE: "Reconditionné", REMANUFACTURE: "Remanufacturé" };
const ORIGINE_LABELS: Record<string, string> = { CONSTRUCTEUR: "Constructeur", OEM: "OEM", AFTERMARKET: "Aftermarket", ADAPTABLE: "Adaptable" };
const TYPE_OUTIL = ["INDIVIDUEL", "KIT", "JEU", "MACHINE"] as const;
const ETATS_EQUIPEMENT = ["NEUF", "BON", "MOYEN", "HORS_USAGE"] as const;
const TYPE_REF_LABELS: Record<string, string> = { FABRICANT: "Fabricant", OEM: "OEM", CONSTRUCTEUR: "Constructeur", FOURNISSEUR: "Fournisseur", EAN: "EAN", UPC: "UPC", GTIN: "GTIN", ANCIENNE: "Ancienne", AUTRE: "Autre" };
const CONF_LABELS: Record<string, string> = { OFFICIEL: "Officiel", HOMOLOGUE: "Homologué", TECHNIQUE: "Technique", COMMERCIAL: "Commercial", MANUELLE: "Manuelle" };

export default function VarianteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const varianteId = Number(id);
  const utils = api.useUtils();
  const { data, isLoading } = api.articles.getVariante.useQuery({ varianteId });
  const { data: etats } = api.articles.stockEtats.useQuery({ varianteId });
  const { data: lots } = api.articles.stockLots.useQuery({ varianteId });
  const { data: refs, refetch: refetchRefs } = api.articles.listReferences.useQuery({ varianteId });
  const { data: substitutions, refetch: refetchSubs } = api.articles.listSubstitutions.useQuery({ varianteId });
  const { data: supersessions, refetch: refetchSups } = api.articles.listSupersessions.useQuery({ varianteId });

  const [nvRef, setNvRef] = useState({ typeRef: "EAN", valeur: "", isPrincipale: false });
  const [attributs, setAttributs] = useState<{ cle: string; valeur: string; unite: string }[]>([]);
  const [editingAttributs, setEditingAttributs] = useState(false);
  const [nvSub, setNvSub] = useState({ varianteBId: "", niveauConfiance: "TECHNIQUE", motif: "" });
  const [nvSup, setNvSup] = useState({ ancienneReference: "", motif: "" });
  const [sortieLotOuverte, setSortieLotOuverte] = useState(false);
  const [sortieLot, setSortieLot] = useState({ lotId: "", quantite: "", motif: "" });
  const [editingBasique, setEditingBasique] = useState(false);
  const { hasPermission } = usePermissions();
  const canModifier = hasPermission("stock.modifier");
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: parEmplacement, isLoading: chEmpl, isError: errEmpl, refetch: refetchEmpl } = api.articles.stockParEmplacement.useQuery({ varianteId });
  const [editV, setEditV] = useState<any>(null);

  const updateVariante = api.articles.updateVariante.useMutation({
    onSuccess: async () => {
      toast.success("Variante mise à jour");
      setEditingBasique(false);
      await utils.articles.getVariante.invalidate();
      await utils.articles.getArticle.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const ouvrirEdition = () => {
    setEditV({
      marque: v?.marque ?? "",
      referenceFabricant: v?.referenceFabricant ?? "",
      referencePrincipale: v?.referencePrincipale ?? "",
      conditionnement: v?.conditionnement ?? "",
      codeBarre: v?.codeBarre ?? "",
      codeArticle: v?.codeArticle ?? "",
      fournisseurId: v?.fournisseurId ? String(v.fournisseurId) : "",
      prixAchat: v?.prixAchat ?? "",
      prixVente: v?.prixVente ?? "",
      prixPro: v?.prixPro ?? "",
      prixParticulier: v?.prixParticulier ?? "",
      prixMinimumVente: v?.prixMinimumVente ?? "",
      tva: v?.tva ?? "",
      etatProduit: v?.etatProduit ?? "NEUF",
      origineProduit: v?.origineProduit ?? "AFTERMARKET",
      positionCote: v?.positionCote ?? "N_A",
      positionEssieu: v?.positionEssieu ?? "N_A",
      seuilAlerte: v?.seuilAlerte ?? "",
      stockSecurite: v?.stockSecurite ?? "",
      pointCommande: v?.pointCommande ?? "",
      qteMinCommande: v?.qteMinCommande ?? "",
      numeroSerie: v?.numeroSerie ?? "",
      numeroLot: v?.numeroLot ?? "",
      dateFabrication: v?.dateFabrication ? String(v.dateFabrication).slice(0, 10) : "",
      dateExpiration: v?.dateExpiration ? String(v.dateExpiration).slice(0, 10) : "",
      garantieMois: v?.garantieMois ?? "",
      estCore: v?.estCore ?? false,
      valeurCore: v?.valeurCore ?? "",
      typeOutil: v?.typeOutil ?? "",
      etatEquipement: v?.etatEquipement ?? "",
      calibrable: v?.calibrable ?? false,
      numeroImmobilisation: v?.numeroImmobilisation ?? "",
      valeurAcquisition: v?.valeurAcquisition ?? "",
    });
    setEditingBasique(true);
  };

  const enregistrerEdition = () => {
    const str = (s?: string) => (s !== undefined && s.trim() !== "" ? s.trim() : undefined);
    const num = (s?: string) => (s !== undefined && s !== "" ? Number(s) : undefined);
    updateVariante.mutate({
      varianteId,
      marque: str(editV.marque),
      referenceFabricant: str(editV.referenceFabricant),
      referencePrincipale: str(editV.referencePrincipale),
      conditionnement: str(editV.conditionnement),
      codeBarre: str(editV.codeBarre),
      codeArticle: str(editV.codeArticle),
      fournisseurId: editV.fournisseurId ? Number(editV.fournisseurId) : undefined,
      prixAchat: num(editV.prixAchat),
      prixVente: num(editV.prixVente),
      prixPro: num(editV.prixPro),
      prixParticulier: num(editV.prixParticulier),
      prixMinimumVente: num(editV.prixMinimumVente),
      tva: num(editV.tva),
      etatProduit: editV.etatProduit || undefined,
      origineProduit: editV.origineProduit || undefined,
      positionCote: editV.positionCote && editV.positionCote !== "N_A" ? editV.positionCote : undefined,
      positionEssieu: editV.positionEssieu && editV.positionEssieu !== "N_A" ? editV.positionEssieu : undefined,
      seuilAlerte: num(editV.seuilAlerte),
      stockSecurite: num(editV.stockSecurite),
      pointCommande: num(editV.pointCommande),
      qteMinCommande: num(editV.qteMinCommande),
      numeroSerie: str(editV.numeroSerie),
      numeroLot: str(editV.numeroLot),
      dateFabrication: str(editV.dateFabrication),
      dateExpiration: str(editV.dateExpiration),
      garantieMois: num(editV.garantieMois),
      estCore: editV.estCore,
      valeurCore: editV.estCore ? num(editV.valeurCore) : undefined,
      typeOutil: str(editV.typeOutil),
      etatEquipement: str(editV.etatEquipement),
      calibrable: editV.calibrable,
      numeroImmobilisation: str(editV.numeroImmobilisation),
      valeurAcquisition: num(editV.valeurAcquisition),
    });
  };

  const optFournisseurs = (fournisseurs ?? []).map((f: any) => ({ value: String(f.id), label: f.nom }));

  const sortirLot = api.stock.sortirLotExact.useMutation({
    onSuccess: async () => {
      toast.success("Sortie enregistrée sur ce lot");
      setSortieLotOuverte(false);
      setSortieLot({ lotId: "", quantite: "", motif: "" });
      await utils.articles.stockEtats.invalidate();
      await utils.articles.getVariante.invalidate();
      await utils.articles.stockLots.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addRef = api.articles.addReference.useMutation({
    onSuccess: () => { toast.success("Référence ajoutée"); setNvRef({ typeRef: "EAN", valeur: "", isPrincipale: false }); refetchRefs(); utils.articles.getVariante.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeRef = api.articles.removeReference.useMutation({ onSuccess: () => refetchRefs(), onError: (e) => toast.error(e.message) });
  const setAttributsMut = api.articles.setAttributsVariante.useMutation({
    onSuccess: () => { toast.success("Caractéristiques enregistrées"); setEditingAttributs(false); utils.articles.getVariante.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addSub = api.articles.addSubstitution.useMutation({
    onSuccess: () => { toast.success("Substitution ajoutée"); setNvSub({ varianteBId: "", niveauConfiance: "TECHNIQUE", motif: "" }); refetchSubs(); },
    onError: (e) => toast.error(e.message),
  });
  const removeSub = api.articles.removeSubstitution.useMutation({ onSuccess: () => refetchSubs(), onError: (e) => toast.error(e.message) });
  const addSup = api.articles.addSupersession.useMutation({
    onSuccess: () => { toast.success("Supersession enregistrée"); setNvSup({ ancienneReference: "", motif: "" }); refetchSups(); },
    onError: (e) => toast.error(e.message),
  });
  const removeSup = api.articles.removeSupersession.useMutation({ onSuccess: () => refetchSups(), onError: (e) => toast.error(e.message) });

  const { data: unitesVariante, isLoading: chUnites, isError: errUnites, refetch: refetchUnites } = api.articles.unitesVariante.useQuery({ varianteId });
  const { data: uniteCatalog } = api.catalog.listUnites.useQuery();
  const [nvUnite, setNvUnite] = useState({ uniteId: "", facteur: "1", prixAchat: "", prixVente: "", estBase: false, estAchat: false, estVente: false });
  const [prixEditU, setPrixEditU] = useState<Record<string, { facteur: string; achat: string; vente: string }>>({});
  const [supprUniteId, setSupprUniteId] = useState<string | null>(null);
  const [addUniteOuverture, setAddUniteOuverture] = useState(false);
  const ajouterUnite = api.articles.ajouterUniteVariante.useMutation({
    onSuccess: async () => { toast.success("Unité ajoutée"); setNvUnite({ uniteId: "", facteur: "1", prixAchat: "", prixVente: "", estBase: false, estAchat: false, estVente: false }); setAddUniteOuverture(false); await refetchUnites(); utils.articles.getVariante.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const modifierUnite = api.articles.modifierUniteVariante.useMutation({
    onSuccess: async () => { toast.success("Unité mise à jour"); setPrixEditU({}); await refetchUnites(); },
    onError: (e) => toast.error(e.message),
  });
  const supprimerUnite = api.articles.supprimerUniteVariante.useMutation({
    onSuccess: async () => { toast.success("Unité retirée"); setSupprUniteId(null); await refetchUnites(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: compatVariante, isLoading: chComp, isError: errComp, refetch: refetchComp } = api.articles.compatibilitesVariante.useQuery({ varianteId });
  const [nvComp, setNvComp] = useState({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", position: "" });
  const [supprCompId, setSupprCompId] = useState<number | null>(null);
  const addComp = api.articles.addCompatibilite.useMutation({
    onSuccess: async () => { toast.success("Compatibilité ajoutée"); setNvComp({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", position: "" }); await refetchComp(); },
    onError: (e) => toast.error(e.message),
  });
  const removeComp = api.articles.removeCompatibilite.useMutation({
    onSuccess: async () => { toast.success("Compatibilité retirée"); setSupprCompId(null); await refetchComp(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;
  const v = data?.variante;
  if (!v) return <p className="text-sm text-muted-foreground">Variante introuvable.</p>;

  const estExemplaire = v.niveau === "EXEMPLAIRE";
  const posLabel = [v.positionCote && v.positionCote !== "N_A" ? v.positionCote : null, v.positionEssieu && v.positionEssieu !== "N_A" ? v.positionEssieu : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/catalog/article/${v.articleId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> {v.articleDesignation ?? "Article"}
          </Link>
          <h1 className="text-xl font-bold">{v.titre}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${estExemplaire ? "bg-violet-500/10 text-violet-400" : "bg-muted text-muted-foreground"}`}>{estExemplaire ? "Exemplaire" : "Variante / SKU"}</span>
        </div>
        <div className="flex gap-2">
          {canModifier && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={ouvrirEdition}>
              <Pencil size={13} /> Modifier
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setAttributs((data?.attributs ?? []).map((a: any) => ({ cle: a.cle, valeur: a.valeur ?? "", unite: a.unite ?? "" }))); setEditingAttributs(true); }}>
            <Wrench size={13} /> Caractéristiques
          </Button>
        </div>
      </div>

      {/* ─── Édition des champs ─── */}
      {editingBasique && editV && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Modifier {estExemplaire ? "l'exemplaire" : "la variante"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs text-muted-foreground">Marque</Label><Input value={editV.marque} onChange={(e) => setEditV({ ...editV, marque: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Référence fabricant</Label><Input value={editV.referenceFabricant} onChange={(e) => setEditV({ ...editV, referenceFabricant: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Référence principale</Label><Input value={editV.referencePrincipale} onChange={(e) => setEditV({ ...editV, referencePrincipale: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Conditionnement</Label><Input value={editV.conditionnement} onChange={(e) => setEditV({ ...editV, conditionnement: e.target.value })} placeholder="1 L, jeu de 4…" className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Code article</Label><Input value={editV.codeArticle} onChange={(e) => setEditV({ ...editV, codeArticle: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Code-barres</Label><Input value={editV.codeBarre} onChange={(e) => setEditV({ ...editV, codeBarre: e.target.value })} className="mt-1" /></div>
            <div>
              <Label className="text-xs text-muted-foreground">Fournisseur</Label>
              <SelectSearch value={editV.fournisseurId || null} onChange={(val) => setEditV({ ...editV, fournisseurId: val ? String(val) : "" })} options={optFournisseurs} placeholder="—" searchPlaceholder="Rechercher…" size="sm" className="mt-1" />
            </div>
            <div><Label className="text-xs text-muted-foreground">État</Label>
              <select value={editV.etatProduit} onChange={(e) => setEditV({ ...editV, etatProduit: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {Object.entries(ETAT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Origine</Label>
              <select value={editV.origineProduit} onChange={(e) => setEditV({ ...editV, origineProduit: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {Object.entries(ORIGINE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Prix achat (F)</Label><Input type="number" min={0} value={editV.prixAchat} onChange={(e) => setEditV({ ...editV, prixAchat: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Prix vente (F)</Label><Input type="number" min={0} value={editV.prixVente} onChange={(e) => setEditV({ ...editV, prixVente: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Prix pro (F)</Label><Input type="number" min={0} value={editV.prixPro} onChange={(e) => setEditV({ ...editV, prixPro: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Prix particulier (F)</Label><Input type="number" min={0} value={editV.prixParticulier} onChange={(e) => setEditV({ ...editV, prixParticulier: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Prix mini vente (F)</Label><Input type="number" min={0} value={editV.prixMinimumVente} onChange={(e) => setEditV({ ...editV, prixMinimumVente: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">TVA (%)</Label><Input type="number" min={0} max={100} value={editV.tva} onChange={(e) => setEditV({ ...editV, tva: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Position côté</Label>
              <select value={editV.positionCote} onChange={(e) => setEditV({ ...editV, positionCote: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {["N_A", "GAUCHE", "DROITE", "CENTRAL", "LES_DEUX"].map((t) => <option key={t} value={t}>{t === "N_A" ? "— non applicable —" : t}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Position essieu</Label>
              <select value={editV.positionEssieu} onChange={(e) => setEditV({ ...editV, positionEssieu: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {["N_A", "AVANT", "ARRIERE"].map((t) => <option key={t} value={t}>{t === "N_A" ? "— non applicable —" : t}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Seuil d'alerte</Label><Input type="number" min={0} value={editV.seuilAlerte} onChange={(e) => setEditV({ ...editV, seuilAlerte: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Stock de sécurité</Label><Input type="number" min={0} value={editV.stockSecurite} onChange={(e) => setEditV({ ...editV, stockSecurite: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Point de commande</Label><Input type="number" min={0} value={editV.pointCommande} onChange={(e) => setEditV({ ...editV, pointCommande: e.target.value })} className="mt-1" /></div>
            {!estExemplaire && <div><Label className="text-xs text-muted-foreground">Qté min de commande</Label><Input type="number" min={0} value={editV.qteMinCommande} onChange={(e) => setEditV({ ...editV, qteMinCommande: e.target.value })} className="mt-1" /></div>}
            <div><Label className="text-xs text-muted-foreground">N° série</Label><Input value={editV.numeroSerie} onChange={(e) => setEditV({ ...editV, numeroSerie: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">N° lot</Label><Input value={editV.numeroLot} onChange={(e) => setEditV({ ...editV, numeroLot: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Date fabrication</Label><Input type="date" value={editV.dateFabrication} onChange={(e) => setEditV({ ...editV, dateFabrication: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Date expiration</Label><Input type="date" value={editV.dateExpiration} onChange={(e) => setEditV({ ...editV, dateExpiration: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Garantie (mois)</Label><Input type="number" min={0} value={editV.garantieMois} onChange={(e) => setEditV({ ...editV, garantieMois: e.target.value })} className="mt-1" /></div>
            {estExemplaire && (
              <>
                <div><Label className="text-xs text-muted-foreground">Valeur d'acquisition (F)</Label><Input type="number" min={0} value={editV.valeurAcquisition} onChange={(e) => setEditV({ ...editV, valeurAcquisition: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs text-muted-foreground">N° immobilisation</Label><Input value={editV.numeroImmobilisation} onChange={(e) => setEditV({ ...editV, numeroImmobilisation: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs text-muted-foreground">Type d'outil</Label>
                  <select value={editV.typeOutil} onChange={(e) => setEditV({ ...editV, typeOutil: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {TYPE_OUTIL.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs text-muted-foreground">État physique</Label>
                  <select value={editV.etatEquipement} onChange={(e) => setEditV({ ...editV, etatEquipement: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="">—</option>
                    {ETATS_EQUIPEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!editV.estCore} onChange={(e) => setEditV({ ...editV, estCore: e.target.checked })} className="size-3.5" /> Échange standard</label>
            {editV.estCore && <div className="w-40"><Label className="text-xs text-muted-foreground">Valeur core (F)</Label><Input type="number" min={0} value={editV.valeurCore} onChange={(e) => setEditV({ ...editV, valeurCore: e.target.value })} className="mt-0.5" /></div>}
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!editV.calibrable} onChange={(e) => setEditV({ ...editV, calibrable: e.target.checked })} className="size-3.5" /> Calibration requise</label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditingBasique(false)}>Annuler</Button>
              <Button size="sm" className="gap-1" disabled={updateVariante.isPending} onClick={enregistrerEdition}>
                {updateVariante.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={13} />} Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Identité */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><span className="text-xs text-muted-foreground">Référence principale</span><p className="font-mono font-semibold">{v.referencePrincipale ?? "—"}</p></div>
          <div><span className="text-xs text-muted-foreground">Marque</span><p className="font-medium">{v.marque ?? "—"}</p></div>
          <div><span className="text-xs text-muted-foreground">État / Origine</span><p className="font-medium">{ETAT_LABELS[v.etatProduit] ?? v.etatProduit ?? "—"} · {ORIGINE_LABELS[v.origineProduit] ?? v.origineProduit ?? "—"}</p></div>
          <div><span className="text-xs text-muted-foreground">Position</span><p className="font-medium">{posLabel || "—"}</p></div>
          {!estExemplaire && <div><span className="text-xs text-muted-foreground">Prix vente</span><p className="font-mono">{v.prixVente ? `${Number(v.prixVente).toLocaleString("fr-FR")} F` : "—"}</p></div>}
          {!estExemplaire && <div><span className="text-xs text-muted-foreground">Prix achat</span><p className="font-mono">{v.prixAchat ? `${Number(v.prixAchat).toLocaleString("fr-FR")} F` : "—"}</p></div>}
          {v.garantieMois != null && <div><span className="text-xs text-muted-foreground">Garantie</span><p className="font-medium">{v.garantieMois} mois</p></div>}
          {v.numeroSerie && <div><span className="text-xs text-muted-foreground">N° série</span><p className="font-mono">{v.numeroSerie}</p></div>}
          {v.numeroLot && <div><span className="text-xs text-muted-foreground">N° lot</span><p className="font-mono">{v.numeroLot}</p></div>}
          {v.dateExpiration && <div><span className="text-xs text-muted-foreground">Expiration</span><p>{new Date(v.dateExpiration).toLocaleDateString("fr-FR")}</p></div>}
          {v.estCore && <div><span className="text-xs text-muted-foreground">Échange standard</span><p className="font-medium">Core {v.valeurCore ? `· ${Number(v.valeurCore).toLocaleString("fr-FR")} F` : ""}</p></div>}
        </div>
        {estExemplaire && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase text-muted-foreground">Type : {v.typeOutil ?? "—"}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase text-muted-foreground">État : {v.etatEquipement ?? "—"}</span>
            {v.calibrable && <span className="rounded-full bg-warning/10 px-2 py-0.5 font-bold uppercase text-warning-foreground">Calibration requise</span>}
            {v.numeroImmobilisation && <span className="rounded-full bg-muted px-2 py-0.5 font-mono">Immo : {v.numeroImmobilisation}</span>}
            {v.valeurAcquisition && <span className="rounded-full bg-muted px-2 py-0.5">Valeur : {Number(v.valeurAcquisition).toLocaleString("fr-FR")} F</span>}
          </div>
        )}
      </div>

      {/* Stock 6 états */}
      {!estExemplaire && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={15} className="text-primary" /> Stock
          </h2>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            <div className="rounded-lg bg-muted/50 p-2"><p className="text-xl font-bold">{etats?.physique ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Physique</p></div>
            <div className="rounded-lg bg-muted/50 p-2"><p className="text-xl font-bold">{etats?.reserve ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Réservé / affecté</p></div>
            <div className="rounded-lg bg-destructive/5 p-2"><p className="text-xl font-bold">{etats?.bloque ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Bloqué</p></div>
            <div className="rounded-lg bg-success/10 p-2"><p className="text-xl font-bold text-success-foreground">{etats?.disponible ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Disponible</p></div>
            <div className="rounded-lg bg-warning/5 p-2"><p className="text-xl font-bold">{etats?.enCommande ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">En commande</p></div>
          </div>
          {etats?.suggestion && <p className="mt-2 text-sm font-medium text-success-foreground">🟢 {etats.suggestion}</p>}
          {lots && lots.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-muted-foreground">Détail par lot</p>
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setSortieLotOuverte(!sortieLotOuverte)}>
                  <LogOut size={12} /> Sortie d'un lot précis {sortieLotOuverte ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </Button>
              </div>
              <div className="space-y-1">
                {lots.map((l: any, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="font-mono font-semibold">{l.numeroLot ?? "—"}</span>
                    {l.datePeremption && <span className="text-muted-foreground">exp. {new Date(l.datePeremption).toLocaleDateString("fr-FR")}</span>}
                    <span className="ml-auto font-mono font-bold">{Number(l.quantite ?? 0).toLocaleString("fr-FR")}</span>
                  </div>
                ))}
              </div>
              {sortieLotOuverte && (
                <div className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">
                    Choisir explicitement le lot à consommer (retour fournisseur, rebut qualité…). La sortie FEFO automatique reste privilégiée pour les ventes.
                  </p>
                  <div className="grid grid-cols-12 items-center gap-2">
                    <select
                      value={sortieLot.lotId}
                      onChange={(e) => setSortieLot({ ...sortieLot, lotId: e.target.value })}
                      className="col-span-5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Lot…</option>
                      {(lots ?? []).map((l: any) => (
                        <option key={l.lotId} value={l.lotId}>
                          {l.numeroLot ?? `#${l.lotId}`}{l.datePeremption ? ` (exp. ${new Date(l.datePeremption).toLocaleDateString("fr-FR")})` : ""} — {Number(l.quantite ?? 0)} dispo
                        </option>
                      ))}
                    </select>
                    <Input
                      value={sortieLot.quantite}
                      onChange={(e) => setSortieLot({ ...sortieLot, quantite: e.target.value })}
                      placeholder="Quantité"
                      type="number"
                      min="1"
                      className="col-span-3 text-xs"
                    />
                    <Input
                      value={sortieLot.motif}
                      onChange={(e) => setSortieLot({ ...sortieLot, motif: e.target.value })}
                      placeholder="Motif (ex. retour fournisseur)"
                      className="col-span-4 text-xs"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1 text-xs"
                      disabled={sortirLot.isPending || !sortieLot.lotId || !Number(sortieLot.quantite) || sortieLot.motif.trim().length < 3}
                      onClick={() => sortirLot.mutate({ produitId: String(varianteId), lotId: Number(sortieLot.lotId), quantite: Number(sortieLot.quantite), motif: sortieLot.motif })}
                    >
                      {sortirLot.isPending ? <Loader2 className="size-3 animate-spin" /> : <LogOut size={12} />} Sortir ce lot
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Où se trouve · emplacements */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <MapPin size={15} className="text-primary" /> Où se trouve · {estExemplaire ? "exemplaire" : "emplacements"}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{parEmplacement ? `${parEmplacement.emplacements.length} emplacement(s)` : "—"}</span>
          {chEmpl && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <Button size="sm" variant="ghost" className="ml-auto gap-1 text-xs" onClick={() => refetchEmpl()}><RefreshCcw size={12} /> Actualiser</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {[
            ["Max", parEmplacement?.seuils.stockMax],
            ["Point de commande", parEmplacement?.seuils.pointCommande],
            ["Stock de sécurité", parEmplacement?.seuils.stockSecurite],
            ["Seuil d'alerte", parEmplacement?.seuils.seuilAlerte],
            ["Qté min commande", parEmplacement?.seuils.qteMin],
          ].map(([lbl, val]) => (
            <span key={String(lbl)} className="rounded-full border border-border bg-muted/40 px-2 py-0.5">
              <span className="text-muted-foreground">{lbl}</span>&nbsp;<span className="font-mono font-bold">{val ?? "—"}</span>
            </span>
          ))}
          {!estExemplaire && parEmplacement?.seuils.seuilAlerte != null && parEmplacement.seuils.seuilAlerte > 0 && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning-foreground">Alerte si disponible ≤ seuil</span>
          )}
        </div>
        {errEmpl ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive-foreground">
            <span>Impossible de charger le stock par emplacement.</span>
            <Button size="sm" variant="outline" className="ml-auto gap-1 text-xs" onClick={() => refetchEmpl()}><RefreshCcw size={12} /> Réessayer</Button>
          </div>
        ) : parEmplacement && parEmplacement.emplacements.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {estExemplaire ? "Aucun emplacement enregistré pour cet exemplaire." : "Aucune quantité saisie pour cette variante dans l'agence courante."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(parEmplacement?.emplacements ?? []).map((r: any) => {
              const sousSeuil = !estExemplaire && parEmplacement?.seuils.seuilAlerte != null && r.disponible <= parEmplacement.seuils.seuilAlerte;
              return (
                <div key={r.emplacementId ?? "na"} className={`rounded-lg border px-3 py-2 ${r.rupture || r.disponible === 0 ? "border-destructive/30 bg-destructive/5" : sousSeuil ? "border-warning/30 bg-warning/5" : "border-border bg-muted/30"}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-semibold">{r.chemin}</p>
                      {r.libelle && <p className="text-[11px] text-muted-foreground">{r.libelle}</p>}
                      {r.lots.length > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                          {r.lots.map((l: any) => (
                            <span key={l.lotId} className="rounded bg-background px-1.5 py-0.5 font-mono text-muted-foreground">lot {l.numeroLot} · {l.quantite}</span>
                          ))}
                        </p>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.disponible === 0 ? "bg-destructive/10 text-destructive" : sousSeuil ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success-foreground"}`}>
                      {r.disponible === 0 ? "Rupture" : sousSeuil ? "Sous le seuil" : "OK"}
                    </span>
                    <span className="font-mono text-sm font-bold">{Number(r.quantite).toLocaleString("fr-FR")}</span>
                    <span className="text-[10px] text-muted-foreground">réservé {r.reserve}</span>
                    <span className="text-[10px] text-muted-foreground">bloqué {r.bloque}</span>
                    <span className="w-16 whitespace-nowrap text-right text-[10px] uppercase text-muted-foreground">dispo <b className="font-mono text-xs text-foreground">{r.disponible}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unités & conversions */}
        {!estExemplaire && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <Package size={15} className="text-primary" /> Unités & conversions
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{(unitesVariante?.unites ?? []).length} unité(s)</span>
              {chUnites && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              <div className="ml-auto flex gap-2">
                {canModifier && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAddUniteOuverture(!addUniteOuverture)}>
                    {addUniteOuverture ? <ChevronUp size={12} /> : <Plus size={12} />} Ajouter une unité
                  </Button>
                )}
              </div>
            </div>
            {errUnites ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive-foreground">
                <span>Impossible de charger les unités.</span>
                <Button size="sm" variant="outline" className="ml-auto gap-1 text-xs" onClick={() => refetchUnites()}><RefreshCcw size={12} /> Réessayer</Button>
              </div>
            ) : (unitesVariante?.unites ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aucune unité associée à cette variante.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {(unitesVariante?.unites ?? []).map((u: any) => {
                  const e = prixEditU[u.id] ?? { facteur: u.facteurVersBase ?? "1", achat: u.prixAchat ?? "", vente: u.prixVente ?? "" };
                  const base = unitesVariante?.unites.find((b: any) => b.estUniteBase) ?? unitesVariante?.unites[0];
                  return (
                    <div key={u.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{u.code} <span className="text-xs font-normal text-muted-foreground">{u.libelle}</span></p>
                          <p className="font-mono text-[11px] text-muted-foreground">1 {u.code} × {Number(e.facteur).toLocaleString("fr-FR")} = 1 {base?.code ?? "? base"}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {u.estUniteBase && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold uppercase text-primary">Base · stock</span>}
                          {u.estUniteAchatDefaut && <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase text-muted-foreground">Achat par défaut</span>}
                          {u.estUniteVenteDefaut && <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase text-muted-foreground">Vente par défaut</span>}
                        </div>
                      </div>
                      {canModifier && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <div><Label className="text-[11px] text-muted-foreground">Facteur</Label>
                            <Input type="number" min={0.000001} step="any" value={e.facteur} onChange={(ev) => setPrixEditU({ ...prixEditU, [u.id]: { ...e, facteur: ev.target.value } })} className="mt-0.5 w-24 text-xs" />
                          </div>
                          <div><Label className="text-[11px] text-muted-foreground">Prix achat</Label>
                            <Input type="number" min={0} value={e.achat} onChange={(ev) => setPrixEditU({ ...prixEditU, [u.id]: { ...e, achat: ev.target.value } })} className="mt-0.5 w-28 text-xs" />
                          </div>
                          <div><Label className="text-[11px] text-muted-foreground">Prix vente</Label>
                            <Input type="number" min={0} value={e.vente} onChange={(ev) => setPrixEditU({ ...prixEditU, [u.id]: { ...e, vente: ev.target.value } })} className="mt-0.5 w-28 text-xs" />
                          </div>
                          {!u.estUniteBase && (
                            <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={modifierUnite.isPending} onClick={() => modifierUnite.mutate({ unitesId: u.id, varianteId, estUniteBase: true })}>
                              Définir base
                            </Button>
                          )}
                          <Button size="sm" className="gap-1 text-xs" disabled={modifierUnite.isPending} onClick={() => modifierUnite.mutate({
                            unitesId: u.id,
                            varianteId,
                            facteurVersBase: Number(e.facteur) || undefined,
                            prixAchat: e.achat === "" ? undefined : Number(e.achat),
                            prixVente: e.vente === "" ? undefined : Number(e.vente),
                          })}>
                            {modifierUnite.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={12} />} Enregistrer
                          </Button>
                          {u.estUniteBase ? (
                            <span className="text-[10px] uppercase text-muted-foreground">Unité de stock — non supprimable</span>
                          ) : supprUniteId === u.id ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground">Retirer cette unité ?</span>
                              <Button size="sm" variant="destructive" className="gap-1 text-xs" disabled={supprimerUnite.isPending} onClick={() => supprimerUnite.mutate({ unitesId: u.id })}>Oui</Button>
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => setSupprUniteId(null)}>Non</Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setSupprUniteId(u.id)}><Trash2 size={12} /> Retirer</Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {addUniteOuverture && canModifier && (
              <div className="mt-3 rounded-lg border border-border bg-background p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Label className="text-[11px] text-muted-foreground">Unité</Label>
                    <SelectSearch
                      value={nvUnite.uniteId || null}
                      onChange={(val) => setNvUnite({ ...nvUnite, uniteId: val ? String(val) : "" })}
                      options={(uniteCatalog ?? []).filter((x: any) => !(unitesVariante?.unites ?? []).some((u2: any) => u2.uniteId === x.id)).map((x: any) => ({ value: x.id, label: `${x.code} — ${x.libelle}` }))}
                      placeholder="Choisir…" searchPlaceholder="Rechercher l'unité…" size="sm" className="mt-0.5"
                    />
                  </div>
                  <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Facteur (× base)</Label><Input type="number" min={0.000001} step="any" value={nvUnite.facteur} onChange={(ev) => setNvUnite({ ...nvUnite, facteur: ev.target.value })} className="mt-0.5 text-xs" /></div>
                  <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Prix achat</Label><Input type="number" min={0} value={nvUnite.prixAchat} onChange={(ev) => setNvUnite({ ...nvUnite, prixAchat: ev.target.value })} className="mt-0.5 text-xs" /></div>
                  <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Prix vente</Label><Input type="number" min={0} value={nvUnite.prixVente} onChange={(ev) => setNvUnite({ ...nvUnite, prixVente: ev.target.value })} className="mt-0.5 text-xs" /></div>
                  <div className="flex flex-col sm:col-span-2">
                    <div className="flex flex-col gap-1 py-1 text-[11px]">
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={nvUnite.estBase} onChange={(ev) => setNvUnite({ ...nvUnite, estBase: ev.target.checked })} className="size-3.5" /> Base</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={nvUnite.estAchat} onChange={(ev) => setNvUnite({ ...nvUnite, estAchat: ev.target.checked })} className="size-3.5" /> Achat défaut</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={nvUnite.estVente} onChange={(ev) => setNvUnite({ ...nvUnite, estVente: ev.target.checked })} className="size-3.5" /> Vente défaut</label>
                    </div>
                    <Button size="sm" className="gap-1 text-xs" disabled={ajouterUnite.isPending || !nvUnite.uniteId || !Number(nvUnite.facteur)} onClick={() => ajouterUnite.mutate({
                      varianteId,
                      uniteId: nvUnite.uniteId,
                      facteurVersBase: Number(nvUnite.facteur),
                      prixAchat: nvUnite.prixAchat === "" ? undefined : Number(nvUnite.prixAchat),
                      prixVente: nvUnite.prixVente === "" ? undefined : Number(nvUnite.prixVente),
                      estUniteBase: nvUnite.estBase,
                      estUniteAchatDefaut: nvUnite.estAchat,
                      estUniteVenteDefaut: nvUnite.estVente,
                    })}>
                      {ajouterUnite.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus size={12} />} Ajouter
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compatibilité véhicules */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Car size={15} className="text-primary" /> Compatibilité véhicules
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{(compatVariante ?? []).length} fiche(s)</span>
            {chComp && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            <Button size="sm" variant="ghost" className="ml-auto gap-1 text-xs" onClick={() => refetchComp()}><RefreshCcw size={12} /> Actualiser</Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Liste combinée : compatibilités liées à l'article + celles déclarées pour cette variante exacte.</p>
          {canModifier && (
            <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-12">
              <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Marque *</Label><Input value={nvComp.marque} onChange={(e) => setNvComp({ ...nvComp, marque: e.target.value })} className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Modèle *</Label><Input value={nvComp.modele} onChange={(e) => setNvComp({ ...nvComp, modele: e.target.value })} className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Version</Label><Input value={nvComp.version} onChange={(e) => setNvComp({ ...nvComp, version: e.target.value })} className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-2"><Label className="text-[11px] text-muted-foreground">Motorisation</Label><Input value={nvComp.motorisation} onChange={(e) => setNvComp({ ...nvComp, motorisation: e.target.value })} placeholder="ex. 2.0 TDI 150" className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-1"><Label className="text-[11px] text-muted-foreground">Année de</Label><Input type="number" value={nvComp.anneeDe} onChange={(e) => setNvComp({ ...nvComp, anneeDe: e.target.value })} className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-1"><Label className="text-[11px] text-muted-foreground">Année à</Label><Input type="number" value={nvComp.anneeA} onChange={(e) => setNvComp({ ...nvComp, anneeA: e.target.value })} className="mt-0.5 text-xs" /></div>
              <div className="sm:col-span-1"><Label className="text-[11px] text-muted-foreground">Position</Label>
                <select value={nvComp.position} onChange={(e) => setNvComp({ ...nvComp, position: e.target.value })} className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                  <option value="">—</option>
                  {["AVANT", "ARRIERE", "GAUCHE", "DROITE", "CENTRAL"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end sm:col-span-1">
                <Button size="sm" className="w-full gap-1 text-xs" disabled={addComp.isPending || !nvComp.marque || !nvComp.modele} onClick={() => addComp.mutate({
                  produitId: varianteId,
                  compat: {
                    marque: nvComp.marque,
                    modele: nvComp.modele,
                    version: nvComp.version || undefined,
                    motorisation: nvComp.motorisation || undefined,
                    anneeDe: nvComp.anneeDe ? Number(nvComp.anneeDe) : undefined,
                    anneeA: nvComp.anneeA ? Number(nvComp.anneeA) : undefined,
                    position: nvComp.position || undefined,
                  },
                })}>
                  {addComp.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus size={12} />} Ajouter
                </Button>
              </div>
            </div>
          )}
          {errComp ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive-foreground">
              <span>Impossible de charger les compatibilités.</span>
              <Button size="sm" variant="outline" className="ml-auto gap-1 text-xs" onClick={() => refetchComp()}><RefreshCcw size={12} /> Réessayer</Button>
            </div>
          ) : (compatVariante ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucune fiche de compatibilité pour cet article ou cette variante.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {(compatVariante ?? []).map((c: any) => (
                <div key={c.id} className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${c.portee === "VARIANTE" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{c.portee === "VARIANTE" ? "Variante" : "Article"}</span>
                  <span className="font-semibold">{c.marque} {c.modele}</span>
                  {c.version && <span className="text-muted-foreground">{c.version}</span>}
                  {c.motorisation && <span className="text-muted-foreground">· {c.motorisation}</span>}
                  {(c.anneeDe || c.anneeA) && <span className="font-mono text-[11px]">{c.anneeDe ?? "…"}–{c.anneeA ?? "…"}</span>}
                  {c.position && <span className="uppercase text-muted-foreground">· {c.position}</span>}
                  {c.typeCompat === "NEGATIVE" && <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-bold uppercase text-destructive">Non compatible</span>}
                  {canModifier && (
                    supprCompId === c.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Retirer ?</span>
                        <button type="button" className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-50" disabled={removeComp.isPending} onClick={() => removeComp.mutate({ id: c.id })}>Oui</button>
                        <button type="button" className="rounded bg-muted px-1.5 py-0.5 text-[10px]" onClick={() => setSupprCompId(null)}>Non</button>
                      </span>
                    ) : (
                      <button type="button" className="text-muted-foreground hover:text-destructive" title="Retirer" onClick={() => setSupprCompId(c.id)}><Trash2 size={12} /></button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Références multiples */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <BadgeCheck size={15} className="text-primary" /> Références ({(refs ?? []).length})
        </h2>
        <div className="flex flex-wrap gap-2">
          <select value={nvRef.typeRef} onChange={(e) => setNvRef({ ...nvRef, typeRef: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
            {Object.entries(TYPE_REF_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Input value={nvRef.valeur} onChange={(e) => setNvRef({ ...nvRef, valeur: e.target.value })} placeholder="Valeur de la référence" className="min-w-40 flex-1" />
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={nvRef.isPrincipale} onChange={(e) => setNvRef({ ...nvRef, isPrincipale: e.target.checked })} className="size-3.5" /> Principale</label>
          <Button size="sm" className="gap-1" disabled={addRef.isPending || !nvRef.valeur} onClick={() => addRef.mutate({ varianteId, typeRef: nvRef.typeRef as any, valeur: nvRef.valeur, isPrincipale: nvRef.isPrincipale })}>
            <Plus size={13} /> Ajouter
          </Button>
        </div>
        {(refs ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(refs ?? []).map((r: any) => (
              <span key={r.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono ${r.isPrincipale ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}>
                <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">{TYPE_REF_LABELS[r.typeRef] ?? r.typeRef}</span>
                {r.valeur}{r.isPrincipale ? " ★" : ""}
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeRef.mutate({ id: r.id })}><Trash2 size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Substitutions */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <GitCompareArrows size={15} className="text-primary" /> Substitutions (jamais automatiques)
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input value={nvSub.varianteBId} onChange={(e) => setNvSub({ ...nvSub, varianteBId: e.target.value })} placeholder="Id de la variante de remplacement" className="w-56" />
          <select value={nvSub.niveauConfiance} onChange={(e) => setNvSub({ ...nvSub, niveauConfiance: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
            {Object.entries(CONF_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Button size="sm" className="gap-1" disabled={addSub.isPending || !nvSub.varianteBId} onClick={() => addSub.mutate({ varianteAId: varianteId, varianteBId: Number(nvSub.varianteBId), niveauConfiance: nvSub.niveauConfiance as any, motif: nvSub.motif || undefined })}>
            <Plus size={13} /> Ajouter
          </Button>
        </div>
        {(substitutions ?? []).length > 0 && (
          <div className="mt-2 space-y-1">
            {(substitutions ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className="font-mono">#{s.varianteAId} ↔ #{s.varianteBId}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 uppercase text-muted-foreground">{CONF_LABELS[s.niveauConfiance] ?? s.niveauConfiance}</span>
                {s.motif && <span className="text-muted-foreground">· {s.motif}</span>}
                <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => removeSub.mutate({ id: s.id })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supersessions */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <RefreshCcw size={15} className="text-primary" /> Références remplacées (supersessions)
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input value={nvSup.ancienneReference} onChange={(e) => setNvSup({ ...nvSup, ancienneReference: e.target.value })} placeholder="Ancienne référence → celle-ci est l'actuelle" className="min-w-64 flex-1" />
          <Button size="sm" className="gap-1" disabled={addSup.isPending || !nvSup.ancienneReference} onClick={() => addSup.mutate({ ancienneReference: nvSup.ancienneReference, nouvelleVarianteId: varianteId, nouvelleReference: v.referencePrincipale ?? "", motif: nvSup.motif || undefined })}>
            <Plus size={13} /> Enregistrer
          </Button>
        </div>
        {(supersessions ?? []).length > 0 && (
          <div className="mt-2 space-y-1">
            {(supersessions ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className="font-mono line-through">{s.ancienneReference}</span>
                <span>→</span>
                <span className="font-mono font-semibold">{s.nouvelleReference}</span>
                {s.motif && <span className="text-muted-foreground">· {s.motif}</span>}
                <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => removeSup.mutate({ id: s.id })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attributs différenciants */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Caractéristiques de cette référence</h2>
        {!editingAttributs ? (
          (data?.attributs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune caractéristique spécifique.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.attributs ?? []).map((a: any) => (
                <div key={a.id} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{a.cle}</span>
                  <span className="ml-2">{a.valeur ?? "—"}{a.unite ? ` ${a.unite}` : ""}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="space-y-1.5">
              {attributs.map((a, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                  <input value={a.cle} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, cle: e.target.value } : x)))} placeholder="Clé" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  <input value={a.valeur} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, valeur: e.target.value } : x)))} placeholder="Valeur" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  <input value={a.unite} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, unite: e.target.value } : x)))} placeholder="Unité" className="col-span-3 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setAttributs(attributs.filter((_, idx) => idx !== i))}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAttributs([...attributs, { cle: "", valeur: "", unite: "" }])}><Plus size={12} /> Ligne</Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingAttributs(false)}>Annuler</Button>
                <Button size="sm" className="gap-1" disabled={setAttributsMut.isPending} onClick={() => setAttributsMut.mutate({ varianteId, attributs: attributs.filter((x) => x.cle.trim()).map((x) => ({ cle: x.cle.trim(), valeur: x.valeur, unite: x.unite })) })}>
                  {setAttributsMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={13} />} Enregistrer
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}