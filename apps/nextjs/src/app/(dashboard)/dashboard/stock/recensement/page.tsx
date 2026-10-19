"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  Loader2,
  MapPin,
  Plus,
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
 * RECENSEMENT — « je compte ce que j'ai dans mon garage ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE, EN TROIS MOUVEMENTS
 *
 * Une ligne se saisit ainsi :
 *
 *     [ 🔍 Filtre à huile 15W40 ] [ qté 12 ] [ Magasin central ▾ ]  →  Suivant
 *
 * Un seul champ à remplir quand il y en a deux, et le deuxième se déduit
 * du stock déjà connu. L'écran existe parce que le magasinier est DEBOUT,
 * téléphone en main, devant un rayon — pas assis devant un clavier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE STOCK DÉJÀ CONNU EST AFFICHÉ AVANT LA SAISIE
 *
 * Saisir « 7 » contre du vide ne veut rien dire. Saisir « 7 » en voyant
 * « 4 au magasin, 3 au bureau » se vérifie d'un coup d'œil. Le stock connu
 * n'est pas un hindrance à la saisie : c'est le contrôle de saisie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON NE VALIDE QUE SI ON A DÉCIDÉ
 *
 * Deux modes, tous deux explicites :
 *   · CONSTATER — on note ce qu'on a vu, le stock ne bouge pas. Utile le
 *     premier soir : on relève, on n'applique rien, on regarde les écarts.
 *   · AJUSTER   — les écarts passent par le moteur de mouvements.
 *
 * L'écart de chaque ligne est affiché AVANT la validation, avec le
 * théorique du lieu ET le total. Les confondre est la première cause
 * d'un inventaire faux.
 */

type Ligne = {
  cle: number;
  produitId: number;
  titre: string;
  codeBarre: string | null;
  quantite: number;
  emplacementId: number | null;
  theoLieu: number;
  theoTotal: number;
  note?: string;
};

const TOUS_EMPLACEMENTS = -1; // sentinelle : aucun emplacement choisi

export default function RecensementPage() {
  const utils = api.useUtils();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [libelleSession, setLibelleSession] = useState("");
  const chargeRef = useRef(false);
  const cleLocaleRef = useRef(-1);

  // ── Champ de saisie ────────────────────────────────────────────────────────
  const [texte, setTexte] = useState("");
  const [quantite, setQuantite] = useState("");
  const [emplacementChoisi, setEmplacementChoisi] = useState<number>(TOUS_EMPLACEMENTS);
const [cameraOuverte, setCameraOuverte] = useState(false);
const [produitChoisi, setProduitChoisi] = useState<number | null>(null);
const [modeEnCours, setModeEnCours] = useState<"constater" | "ajuster">("ajuster");
const refQuantite = useRef<HTMLInputElement | null>(null);
const refRecherche = useRef<HTMLInputElement | null>(null);

  // ── Emplacements ───────────────────────────────────────────────────────────
  const { data: emplacements } = api.stock.listEmplacements.useQuery(
    undefined,
    { enabled: sessionId !== null },
  );
  const emplacementsActifs = useMemo(
    () => (emplacements ?? []).filter((e: { isActive: boolean }) => e.isActive !== false),
    [emplacements],
  );

  // ── Recherche ──────────────────────────────────────────────────────────────
  const rechercheActive = texte.trim().length >= 2 && produitChoisi === null;
  const { data: recherche, isFetching: rechercheEnCours } =
    api.stockRecensement.rechercher.useQuery(
      { query: texte.trim(), limit: 12 },
      { enabled: rechercheActive },
    );

  // Le détail de l'article sélectionné : c'est lui qui propose le stock déjà
  // connu et le facteur d'unité. On lit directement la donnée de la query —
  // pas une copie dans un état, qui pourrait diverger d'un rechargement.
  const detailQuery = api.stockRecensement.preparerLigne.useQuery(
    { produitId: produitChoisi ?? 0 },
    { enabled: produitChoisi !== null },
  );
  const detail = produitChoisi !== null ? (detailQuery.data ?? null) : null;
  const chargementDetail =
    produitChoisi !== null && detailQuery.isLoading && !detailQuery.data;

  const sessionOuverte = sessionId !== null;

  // ── Session ────────────────────────────────────────────────────────────────
  const ouvrir = api.stockRecensement.ouvrirSession.useMutation({
    onSuccess: (r) => {
      setSessionId(r.sessionId);
      setLibelleSession(r.libelle);
      refRecherche.current?.focus();
      toast.success("Recensement ouvert", {
        description: "Saisissez vos lignes, puis validez en bas de l'écran.",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const valider = api.stockRecensement.valider.useMutation({
    onSuccess: async (r) => {
      toast.success(
        modeEnCours === "constater"
          ? `${r.lignesEnregistrees} ligne(s) notée(s)`
          : `${r.lignesEnregistrees} ligne(s) enregistrée(s), ${r.ecroutes} ajustement(s)`,
        { description: "Le stock et les mouvements sont à jour." },
      );
      setLignes([]);
      setTexte("");
      setQuantite("");
      setProduitChoisi(null);
      setEmplacementChoisi(TOUS_EMPLACEMENTS);
      // Le stock a bougé : tout ce qui l'affiche doit le savoir.
      // lignesSession aussi : les lignes en attente ont été consommées.
      await Promise.all([
        utils.stock.getDashboard.invalidate(),
        utils.stockRecensement.rechercher.invalidate(),
        utils.stockRecensement.sessions.invalidate(),
        utils.stockRecensement.lignesSession.invalidate(),
        utils.stock.listEmplacements.invalidate(),
      ]);
    },
    onError: (e) => {
      setModeEnCours("ajuster");
      toast.error("Enregistrement refusé", { description: e.message });
    },
  });

  const sessions = api.stockRecensement.sessions.useQuery(undefined, {
    enabled: sessionOuverte,
  });

  // ── Lignes persistées — la ligne existe AU MOMENT de la saisie ────────────
  // Étape 1 du Lot 1 : le comptage fait sur site ne disparaît plus quand
  // l'écran se ferme. La reprise (`lignesSession`) sert ce qui a déjà été
  // compté dans la session — appliqué ou non.
  const lignesSessionQuery = api.stockRecensement.lignesSession.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled: sessionId !== null },
  );

  const enregistrerLigneApi = api.stockRecensement.enregistrerLigne.useMutation({
    onError: (e) => toast.error("Ligne non enregistrée", { description: e.message }),
  });
  const retirerLigneApi = api.stockRecensement.retirerLigne.useMutation({
    onMutate: async (vars: { ligneId: number }) => {
      setLignes((l) => l.filter((x) => x.cle !== vars.ligneId));
    },
    onSuccess: () => {
      utils.stockRecensement.lignesSession.invalidate();
    },
    onError: () => {
      toast.error("Retrait impossible", { description: "Rechargez la page pour retrouver la ligne." });
      utils.stockRecensement.lignesSession.invalidate();
    },
  });

  useEffect(() => {
    // Reprise d'une session : les lignes déjà comptées COMPTENT — on les fait
    // réapparaître une seule fois par session ouverte.
    if (sessionId === null) {
      chargeRef.current = false;
      return;
    }
    if (chargeRef.current) return;
    if (!lignesSessionQuery.data || lignesSessionQuery.isLoading) return;
    setLignes(
      lignesSessionQuery.data
        .filter((l) => !l.appliquee)
        .map((l) => ({
          cle: l.id,
          produitId: l.produitId,
          titre: l.titre,
          codeBarre: null,
          quantite: Number(l.quantiteReelle),
          emplacementId: l.emplacementId,
          theoLieu: l.emplacementId != null && Number.isFinite(Number(l.quantiteTheorique))
            ? Number(l.quantiteTheorique)
            : 0,
          theoTotal: Number.isFinite(Number(l.quantiteTheorique)) ? Number(l.quantiteTheorique) : 0,
          note: l.note ?? undefined,
        })),
    );
    chargeRef.current = true;
  }, [sessionId, lignesSessionQuery.data, lignesSessionQuery.isLoading]);

  // ── Saisie d'une ligne ─────────────────────────────────────────────────────
  const selectionnerProduit = useCallback((p: { id: number; titre: string; codeBarre: string | null }) => {
    setProduitChoisi(p.id);
    setTexte(p.titre);
    // Le curseur va directement à la quantité : c'est le prochain geste,
    // et il n'y a rien à choisir entre les deux.
    window.setTimeout(() => refQuantite.current?.focus(), 50);
  }, []);

  const quantiteNombre = Number(quantite);
  const quantiteValide =
    quantite.trim() !== "" && Number.isFinite(quantiteNombre) && quantiteNombre >= 0;

  const emplacementConnu = useMemo(() => {
    if (!detail || emplacementChoisi === TOUS_EMPLACEMENTS) return null;
    return (
      detail.parEmplacement.find(
        (l: { emplacementId: number | null }) => l.emplacementId === emplacementChoisi,
      ) ?? null
    );
  }, [detail, emplacementChoisi]);

  const peutAjouter = produitChoisi !== null && quantiteValide;

  const ajouterLigne = useCallback(() => {
    if (produitChoisi === null || !quantiteValide || !detail) return;
    if (sessionId === null) return; // impossible : l'écran n'existe qu'en session

    // Clé locale négative (provisoire) ; remplacée par l'identifiant base
    // dès que l'insertion est confirmée. « retirer » vise toujours la
    // denrée persistée une fois la ligne arrivée au serveur.
    const cleLocale = --cleLocaleRef.current;
    const ligne: Ligne = {
      cle: cleLocale,
      produitId: produitChoisi,
      titre: detail.produit.titre,
      codeBarre: detail.produit.codeBarre,
      quantite: quantiteNombre,
      emplacementId: emplacementChoisi === TOUS_EMPLACEMENTS ? null : emplacementChoisi,
      theoLieu: emplacementConnu?.quantite ?? 0,
      theoTotal: detail.stockConnu.quantite,
    };
    setLignes((l) => [...l, ligne]);

    // La ligne est ENREGISTRÉE tout de suite : une fermeture d'écran, une
    // perte de réseau ne détruisent pas le comptage fait sur site.
    enregistrerLigneApi.mutate(
      {
        sessionId,
        ligne: {
          produitId: produitChoisi,
          emplacementId: ligne.emplacementId,
          quantite: quantiteNombre,
          note: null,
        },
      },
      {
        onSuccess: (r) => {
          setLignes((l) =>
            l.map((x) => (x.cle === cleLocale ? { ...x, cle: r.ligneId } : x)),
          );
        },
      },
    );

    // On vide, on ne quitte pas l'écran : on compte une étagère après
    // l'autre. Le magasinier ne doit pas lever le doigt pour l'action suivante.
    setTexte("");
    setProduitChoisi(null);
    setQuantite("");
    refRecherche.current?.focus();
  }, [
    produitChoisi,
    quantiteValide,
    detail,
    quantiteNombre,
    emplacementChoisi,
    emplacementConnu,
    sessionId,
    enregistrerLigneApi,
  ]);

  const retirerLigne = (cle: number) => {
    // Une ligne identifiable du base (id > 0) part du serveur ; une ligne
    // non encore confirmée part du local en attendant un retour.
    if (cle > 0) {
      retirerLigneApi.mutate({ ligneId: cle });
    } else {
      setLignes((l) => l.filter((x) => x.cle !== cle));
    }
  };

  const totaux = useMemo(() => {
    const articles = new Set(lignes.map((l) => l.produitId)).size;
    const quantiteTotale = lignes.reduce((s, l) => s + l.quantite, 0);
    const ecarts = lignes.filter((l) => l.quantite !== l.theoTotal).length;
    return { articles, quantiteTotale, ecarts };
  }, [lignes]);

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (!sessionOuverte) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-xl font-black tracking-tight">Recenser le garage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enregistrez les pièces que vous possédez déjà, avec l&apos;emplacement où elles se
            trouvent.
          </p>
        </header>

        {sessions && sessions.data && sessions.data.some((s) => s.statut === "en_cours") && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h2 className="text-sm font-semibold">Recensements en cours</h2>
            <div className="mt-2 space-y-2">
              {sessions.data
                .filter((s) => s.statut === "en_cours")
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{s.libelle}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSessionId(s.id);
                        setLibelleSession(s.libelle ?? "Recensement");
                        toast.success("Recensement repris", {
                          description: "Vos lignes déjà comptées se rechargent dans un instant.",
                        });
                      }}
                    >
                      Reprendre
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Nouveau recensement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nommez-le pour le retrouver : « Recensement magasin + bureaux », « Ondulation du
            rayon huile »…
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={libelleSession}
              onChange={(e) => setLibelleSession(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && libelleSession.trim()) ouvrir.mutate({ libelle: libelleSession.trim() });
              }}
              placeholder="Nom du recensement"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              onClick={() => ouvrir.mutate({ libelle: libelleSession.trim() || "Recensement" })}
              disabled={ouvrir.isPending}
            >
              {ouvrir.isPending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
              Ouvrir
            </Button>
          </div>
        </div>

        <Button variant="ghost" asChild>
          <a href="/dashboard/stock/apercu">
            <ArrowRight size={16} className="rotate-180" /> Retour à la vue d&apos;ensemble
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">{libelleSession}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lignes.length} ligne(s) · {totaux.articles} article(s) · {totaux.quantiteTotale} unité(s)
          </p>
        </div>
        {sessionId && (
          <Button variant="ghost" size="sm" asChild>
            <a href={`/dashboard/stock/recensement/session/${sessionId}`}>Voir mes lignes</a>
          </Button>
        )}
      </header>

      {/* ── Saisie : le cœur de l'écran ───────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_110px_180px_auto]">
          {/* Recherche / scan */}
          <div className="relative">
            <ScanLine size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                  selectionnerProduit(recherche.resultats[0]);
                }
              }}
              placeholder="Rechercher ou scanner une pièce…"
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

          {/* Quantité */}
          <input
            ref={refQuantite}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && peutAjouter) {
                e.preventDefault();
                ajouterLigne();
              }
            }}
            disabled={produitChoisi === null}
            placeholder="Qté"
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Quantité comptée"
          />

          {/* Emplacement */}
          <select
            value={emplacementChoisi}
            onChange={(e) => setEmplacementChoisi(Number(e.target.value))}
            disabled={produitChoisi === null}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Emplacement"
          >
            <option value={TOUS_EMPLACEMENTS}>Sans emplacement</option>
            {emplacementsActifs.map((e: { id: number; code: string; libelle: string | null }) => (
              <option key={e.id} value={e.id}>
                {e.libelle ? `${e.libelle} (${e.code})` : e.code}
              </option>
            ))}
          </select>

          <Button onClick={ajouterLigne} disabled={!peutAjouter}>
            <Plus size={16} /> Ajouter
          </Button>
        </div>

        {cameraOuverte && (
          <div className="mt-3">
            <BarcodeScanner
              ouvert={cameraOuverte}
              onClose={() => setCameraOuverte(false)}
              onDetect={(valeur) => {
                setTexte(valeur);
                setProduitChoisi(null);
                setCameraOuverte(false);
                toast.info("Code lu", { description: valeur });
              }}
            />
          </div>
        )}

        {/* Résultats — avec le garde-fou anti-doublon */}
        {rechercheActive && (
          <div className="mt-3 space-y-2">
            {rechercheEnCours && (
              <p className="text-xs text-muted-foreground">Recherche…</p>
            )}

            {recherche?.resultats.length === 0 && !rechercheEnCours && (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm">
                <p className="font-medium">Aucune fiche pour « {texte.trim()} »</p>
                <p className="mt-1 text-muted-foreground">
                  Vérifiez le code-barre saisi, ou créez la fiche pour pouvoir compter cette pièce.
                </p>
              </div>
            )}

            {recherche?.resultats.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectionnerProduit(p)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.titre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.codeBarre ?? "—"}
                    {p.estReparti && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <MapPin size={11} /> {p.nbEmplacements} emplacements
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-mono">{Number(p.quantiteStock)}</span>
                  <span className="block text-xs text-muted-foreground">en stock</span>
                </span>
              </button>
            ))}

            {/* Doublons possibles : on SIGNALE, on ne fusionne jamais */}
            {recherche?.doublonsPossibles && recherche.doublonsPossibles.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Copy size={13} /> Ces articles se ressemblent
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vérifiez avant d&apos;ajouter une nouvelle fiche : deux articles au libellé proche
                  peuvent être des pièces différentes.
                </p>
                <ul className="mt-2 space-y-1">
                  {recherche.doublonsPossibles.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => selectionnerProduit(d)}
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

        {/* Fiche sélectionnée : le stock déjà connu */}
        {produitChoisi !== null && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            {chargementDetail ? (
              <p className="text-xs text-muted-foreground">Chargement du stock connu…</p>
            ) : detail ? (
              <>
                <p className="text-sm font-medium">{detail.produit.titre}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Stock connu : <strong>{detail.stockConnu.quantite}</strong> sur{" "}
                  {detail.stockConnu.nbEmplacements} emplacement(s)
                  {detail.stockConnu.nbLots > 0 && ` · ${detail.stockConnu.nbLots} lot(s)`}
                </p>
                {detail.parEmplacement.filter((l) => l.emplacementId != null).length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {detail.parEmplacement
                      .filter((l: { emplacementId: number | null }) => l.emplacementId != null)
                      .map((l: { emplacementId: number; libelle: string | null; quantite: number }) => (
                        <li
                          key={l.emplacementId}
                          className="rounded bg-background px-2 py-1 text-xs"
                        >
                          {l.libelle ?? `#${l.emplacementId}`} : <strong>{Number(l.quantite)}</strong>
                        </li>
                      ))}
                  </ul>
                )}
                {detail.lots.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Lots : {detail.lots.map((l) => l.numeroLot).join(", ")}
                  </p>
                )}
              </>
            ) : null}
          </div>
        )}
      </section>

      {/* ── Lignes saisies ─────────────────────────────────────────────────── */}
      {lignes.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={40} />}
          title="Aucune ligne saisie"
          description="Cherchez une pièce ci-dessus, indiquez la quantité et l'emplacement. Appuyez sur Entrée pour enchaîner."
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Article</th>
                <th className="px-3 py-2 text-right">Compté</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">Connu</th>
                <th className="px-3 py-2 text-right">Écart</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => {
                const ecart = l.quantite - l.theoTotal;
                return (
                  <tr key={l.cle} className="bg-background">
                    <td className="px-3 py-2">
                      <span className="block truncate font-medium">{l.titre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.codeBarre ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.quantite}</td>
                    <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground sm:table-cell">
                      {l.theoTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {ecart === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={ecart > 0 ? "text-success-foreground" : "text-destructive"}>
                          {ecart > 0 ? "+" : ""}
                          {Math.round(ecart * 100) / 100}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => retirerLigne(l.cle)}
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

      {/* ── Validation ─────────────────────────────────────────────────────── */}
      {lignes.length > 0 && (
        <section className="sticky bottom-0 rounded-xl border border-border bg-card p-3 shadow-lg">
          {totaux.ecarts > 0 && (
            <p className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {totaux.ecarts} ligne(s) presenting un écart avec le stock connu. « Constater »
              enregistre votre relevé sans toucher au stock ; « Ajuster » corrige le stock et
              trace un mouvement par écart.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              disabled={valider.isPending}
              onClick={() => {
                setModeEnCours("constater");
                sessionId &&
                  valider.mutate({
                    sessionId,
                    mode: "constater",
                    lignes: lignes.map((l) => ({
                      produitId: l.produitId,
                      quantite: l.quantite,
                      emplacementId: l.emplacementId,
                    })),
                  });
              }}
            >
              Constater
            </Button>
            <Button
              className="flex-1"
              disabled={valider.isPending}
              onClick={() => {
                setModeEnCours("ajuster");
                sessionId &&
                  valider.mutate({
                    sessionId,
                    mode: "ajuster",
                    lignes: lignes.map((l) => ({
                      produitId: l.produitId,
                      quantite: l.quantite,
                      emplacementId: l.emplacementId,
                    })),
                  });
              }}
            >
              {valider.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Ajuster le stock
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}