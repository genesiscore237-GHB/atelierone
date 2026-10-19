"use client";

import { useEffect, useMemo, useState } from "react";
import { FileImage, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";

/**
 * PANNEAU NOUVELLE PIÈCE — créer la fiche SANS quitter le comptage.
 *
 * Le magasinier tient une pièce : elle n'existe pas dans le système, la
 * recherche est vide, le comptage attend. Deux modes :
 *
 *   · ESSENTIEL — titre, quantité, emplacement : la fiche naît et le
 *     comptage s'écrit dans la même transaction (`creerPieceEtCompter`).
 *   · COMPLET   — marque, réfs, code-barres, photo, famille : la famille
 *     ouvre les champs de l'ontologie (`getDefinitionsForCategory`) —
 *     on ne demande à l'écran que ce que cette famille décide.
 *
 * Tout ce qui bouge passe par le serveur : le garde anti-doublon tourne
 * AVANT l'écriture ; rien de ce que le panneau saisit ne peut créer une
 * fiche orpheline.
 */
export type ResultatPieceCreee = {
  produitId: number;
  articleId: number;
  ligneId: number | null;
  titre: string;
  quantite: number;
  emplacementId: number | null;
  codeBarre: string | null;
};

export function PanneauNouvellePiece({
  ouvert,
  fermer,
  sessionId,
  preRemplissage,
  onCreee,
}: {
  ouvert: boolean;
  fermer: () => void;
  /** NULL = fiche crée sans comptage (hors session de recensement). */
  sessionId: number | null;
  /** Ce que l'écran connaît déjà : le texte cherché (titre), le code éventuellement scanné. */
  preRemplissage: { titre: string; codeBarre: string | null };
  onCreee: (r: ResultatPieceCreee) => void;
}) {
  const { hasPermission } = usePermissions();
  const peutCreer = hasPermission("stock.modifier");

  const [mode, setMode] = useState<"essentiel" | "complet">("essentiel");
  const [titre, setTitre] = useState("");
  const [quantite, setQuantite] = useState("");
  const [typeProduit, setTypeProduit] = useState("PIECE");
  const [emplacementId, setEmplacementId] = useState("");
  const [codeBarre, setCodeBarre] = useState("");
  const [marque, setMarque] = useState("");
  const [refOem, setRefOem] = useState("");
  const [referenceFabricant, setReferenceFabricant] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [note, setNote] = useState("");
  const [familleId, setFamilleId] = useState("");
  const [sousCategorieId, setSousCategorieId] = useState("");
  const [article3Id, setArticle3Id] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [conflit, setConflit] = useState<string | null>(null);
  const [accepterDoublon, setAccepterDoublon] = useState(false);
  const [motifReemploi, setMotifReemploi] = useState("");

  // Réinitialisation propre quand le panneau s'ouvre avec un prÉremplissage.
  const cle = `${preRemplissage.titre}\u0000${preRemplissage.codeBarre ?? ""}`;
  useEffect(() => {
    if (!ouvert) return;
    setTitre(preRemplissage.titre);
    setCodeBarre(preRemplissage.codeBarre ?? "");
    setConflit(null);
    setAccepterDoublon(false);
    setMotifReemploi("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, cle]);

  const categorieSelectionnee = Number(article3Id || sousCategorieId || familleId) || undefined;

  // ── Emplacements — même liste que l'écran du comptage ─────────────────────
  const { data: emplacements } = api.stock.listEmplacements.useQuery(undefined, {
    enabled: ouvert,
  });
  const emplacementsActifs = useMemo(
    () => (emplacements ?? []).filter((e: { isActive: boolean }) => e.isActive !== false),
    [emplacements],
  );

  // ── Classification (mode complet) — famille → sous-catégorie → article3 ──
  const { data: categories } = api.catalog.listCategories.useQuery(undefined, {
    enabled: ouvert && mode === "complet",
  });
  const familles = useMemo(
    () => (categories ?? []).filter((c: any) => !c.parentId && c.typeBranche),
    [categories],
  );
  const sousCategories = useMemo(
    () => (categories ?? []).filter((c: any) => String(c.parentId) === String(familleId)),
    [categories, familleId],
  );
  const articles3 = useMemo(
    () => (categories ?? []).filter((c: any) => String(c.parentId) === String(sousCategorieId)),
    [categories, sousCategorieId],
  );

  // ── Champs pilotés par la famille — l'ontologie décide ────────────────────
  const { data: defsRaw } = api.ontology.getDefinitionsForCategory.useQuery(
    { categorieId: categorieSelectionnee ?? -1, portee: "VARIANTE" as const },
    { enabled: ouvert && mode === "complet" && categorieSelectionnee != null },
  );
  const defs = useMemo(
    () => (defsRaw?.definitions ?? []).filter((d: any) => d.isActive !== false),
    [defsRaw],
  );
  const [valeursAttr, setValeursAttr] = useState<Record<string, string>>({});

  const creer = api.stockRecensement.creerPieceEtCompter.useMutation({
    onSuccess: (r) => {
      toast.success(
        sessionId != null ? "Pièce créée et comptée" : "Pièce créée",
        {
          description:
            "La fiche est dans le système — la recherche la trouve dès maintenant.",
        },
      );
      onCreee({
        produitId: r.produitId,
        articleId: r.articleId,
        ligneId: r.ligneId,
        titre: titre.trim(),
        quantite: Number(quantite) || 0,
        emplacementId: emplacementId ? Number(emplacementId) : null,
        codeBarre: codeBarre.trim() || null,
      });
      setTitre("");
      setQuantite("");
      setCodeBarre("");
      setMarque("");
      setRefOem("");
      setReferenceFabricant("");
      setPrixAchat("");
      setNote("");
      setPhotoUrl("");
      setConflit(null);
      setAccepterDoublon(false);
      setMotifReemploi("");
      fermer();
    },
    onError: (e) => {
      const message = e.message ?? "";
      if (message.startsWith("Cette pièce semble déjà exister")) {
        setConflit(message);
        return;
      }
      toast.error("Pièce non créée", { description: message });
    },
  });

  const quantiteNombre = Number(quantite);
  const quantiteValide = quantite.trim() === "" || (Number.isFinite(quantiteNombre) && quantiteNombre >= 0);
  const titreValide = titre.trim().length >= 2;
  const motifValide = !accepterDoublon || motifReemploi.trim().length >= 10;
  const champObligatoireVide = defs
    .filter((d: { obligatoire: boolean }) => !!d.obligatoire)
    .some((d: { cle: string }) => (valeursAttr[d.cle] ?? "").trim() === "");
  const peutValider =
    peutCreer && titreValide && quantiteValide && motifValide && !champObligatoireVide && !creer.isPending;

  const envoyer = () => {
    if (!peutValider) return;
    creer.mutate({
      sessionId: sessionId ?? undefined,
      titre: titre.trim(),
      typeProduit: typeProduit,
      quantite: quantite.trim() === "" ? 0 : quantiteNombre,
      emplacementId: emplacementId ? Number(emplacementId) : undefined,
      codeBarre: codeBarre.trim() || undefined,
      prixAchat: prixAchat.trim() ? Number(prixAchat) : undefined,
      note: note.trim() || undefined,
      marque: marque.trim() || undefined,
      refOem: refOem.trim() || undefined,
      referenceFabricant: referenceFabricant.trim() || undefined,
      categorieId: categorieSelectionnee,
      attributs: mode === "complet" && defs.length
        ? defs
            .filter((d: { cle: string }) => (valeursAttr[d.cle] ?? "").trim() !== "")
            .map((d: any) => ({
              cle: d.cle,
              valeur: valeursAttr[d.cle]!.trim(),
              unite: d.uniteCode ?? undefined,
              typeAttribut: d.typeAttribut ?? undefined,
            }))
        : undefined,
      photos: photoUrl ? [photoUrl] : undefined,
      accepterDoublon: accepterDoublon || undefined,
      motifReemploi: accepterDoublon ? motifReemploi.trim() : undefined,
    });
  };

  const choisirPhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoEnCours(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "articles");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Échec de l'upload");
      setPhotoUrl(data.url);
      toast.success("Photo ajoutée");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec de l'upload");
    } finally {
      setPhotoEnCours(false);
    }
  };

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={fermer}
        aria-label="Fermer le panneau"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div>
            <h2 className="text-base font-bold">Nouvelle pièce</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              La fiche naît ici, et le comptage s&apos;écrit avec — d&apos;un geste.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fermer} aria-label="Fermer">
            <X size={16} />
          </Button>
        </div>

        <div className="flex gap-1 border-b border-border p-2">
          {(["essentiel", "complet"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
                (mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")
              }
            >
              {m === "essentiel" ? "Essentiel" : "Identification complète"}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 p-4">
          {champLibelle("Titre*", titre, setTitre, "Filtre à air Dyna RT30")}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Quantité comptée
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Emplacement
              </label>
              <select
                value={emplacementId}
                onChange={(e) => setEmplacementId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Sans emplacement</option>
                {emplacementsActifs.map((e: { id: number; code: string; libelle: string | null }) => (
                  <option key={e.id} value={e.id}>
                    {e.libelle ? `${e.libelle} (${e.code})` : e.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {mode === "complet" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Type
                </label>
                <select
                  value={typeProduit}
                  onChange={(e) => {
                    setTypeProduit(e.target.value);
                    setFamilleId("");
                    setSousCategorieId("");
                    setArticle3Id("");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["PIECE", "CONSOMMABLE", "OUTIL", "EQUIPEMENT", "SERVICE", "FOURNITURE", "KIT"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Famille
                </label>
                {familles.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground">
                    Aucune famille de classification n&apos;existe pour « {typeProduit} » — la pièce
                    sera créée sans famille ; classez-la plus tard depuis le catalogue.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Selection value={familleId} onChange={setFamilleId} options={familles.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Choisir une famille" />
                    {sousCategories.length > 0 && (
                      <Selection value={sousCategorieId} onChange={(v) => { setSousCategorieId(v); setArticle3Id(""); }} options={sousCategories.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Sous-catégorie" />
                    )}
                    {article3Id.length > 0 && articles3.length > 0 && (
                      <Selection value={article3Id} onChange={setArticle3Id} options={articles3.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Détail" />
                    )}
                  </div>
                )}
              </div>

              {defs.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold">
                    Champs de la famille {labelFamille(familles, familleId)}
                  </p>
                  {defs.map((d: any) => (
                    <div key={`${d.cle}::${d.portee}`} className="mt-2">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        {d.libelle}
                        {d.obligatoire && <span className="ml-1 text-destructive">*</span>}
                        {d.uniteCode ? ` (${d.uniteCode})` : ""}
                      </label>
                      {d.liste?.length ? (
                        <select
                          value={valeursAttr[d.cle] ?? ""}
                          onChange={(e) => setValeursAttr((v) => ({ ...v, [d.cle]: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">—</option>
                          {d.liste.map((o: string) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={d.typeAttribut === "NOMBRE" ? "number" : "text"}
                          inputMode={d.typeAttribut === "NOMBRE" ? "decimal" : undefined}
                          step="any"
                          min={d.min ?? undefined}
                          max={d.max ?? undefined}
                          value={valeursAttr[d.cle] ?? ""}
                          onChange={(e) => setValeursAttr((v) => ({ ...v, [d.cle]: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      )}
                      {d.aide && <p className="mt-0.5 text-[11px] text-muted-foreground">{d.aide}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {champLibelle("Code-barres", codeBarre, setCodeBarre, "Scanné ou tapé", true)}
                {champLibelle("Prix d'achat", prixAchat, setPrixAchat, "0", false, true)}
              </div>
              {champLibelle("Marque", marque, setMarque, "Mann")}
              {champLibelle("Réf. fabricant", referenceFabricant, setReferenceFabricant, "W712/92")}
              {champLibelle("Réf. OEM", refOem, setRefOem, "03C 115 562 B")}
              {champLibelle("Note libre", note, setNote, "Travaillée le long du trépan")}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Photo
                </label>
                {photoUrl ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileImage size={14} /> Photo enregistrée —
                    <button type="button" className="underline" onClick={() => setPhotoUrl("")}>
                      enlever
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40">
                    {photoEnCours ? <Loader2 size={14} className="animate-spin" /> : <FileImage size={14} />}
                    Choisir une photo (JPG, PNG)
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => choisirPhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>
            </>
          )}

          {conflit && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
              <p className="font-semibold">Cette pièce semble déjà exister</p>
              <p className="mt-1 text-muted-foreground">{conflit}</p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={accepterDoublon}
                  onChange={(e) => setAccepterDoublon(e.target.checked)}
                />
                <span>C&apos;est une pièce DISTINCTE (nom redondant assumé, réassort).</span>
              </label>
              {accepterDoublon && (
                <textarea
                  rows={2}
                  value={motifReemploi}
                  onChange={(e) => setMotifReemploi(e.target.value)}
                  placeholder="Pourquoi cette pièce est distincte (10 caractères minimum)"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>
          )}

          {!peutCreer && (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
              Votre rôle n&apos;a pas la permission « Créer / modifier les stocks ». La
              création de fiche est refusée par le serveur — demandez-la au gestionnaire.
            </p>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-border bg-card/95 p-3 backdrop-blur">
          <Button className="w-full" disabled={!peutValider} onClick={envoyer}>
            {creer.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {sessionId != null ? "Créer la fiche et compter" : "Créer la fiche"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function champLibelle(
  libelle: string,
  valeur: string,
  maj: (v: string) => void,
  placeholder: string,
  largeurTotale = false,
  nombre = false,
) {
  const champ = (cls: string) => (
    <div className={cls} key={libelle}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{libelle}</label>
      <input
        type={nombre ? "number" : "text"}
        inputMode={nombre ? "decimal" : undefined}
        min={nombre ? 0 : undefined}
        step={nombre ? "any" : undefined}
        value={valeur}
        onChange={(e) => maj(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
  return largeurTotale ? champ("space-y-0") : champ("");
}

function Selection({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function labelFamille(familles: any[], familleId: string) {
  return familles.find((f) => String(f.id) === String(familleId))?.nom ?? "";
}
