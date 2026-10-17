"use client";

/**
 * RESTITUTION DU VEHICULE — panneau partage.
 *
 * ETAPE 4. Ce panneau existe parce que la restitution etait captive d'un ecran.
 *
 *
 * LE PROBLEME
 *
 * La restitution vivait dans l'onglet « Facture & Restitution » de la page d'un
 * ordre de reparation. Une seule implementation, donc — mais un seul chemin
 * pour y acceder aussi.
 *
 * La 360 du vehicule, celle que le GARAGE utilise, ne restitue pas. Son onglet
 * « Facture » est en lecture seule. Pour rendre un vehicule, l'agent du garage
 * devait trouver le dossier, l'ouvrir, puis changer d'onglet.
 *
 * Et ca ne s'arrete pas la. Le dossier n'est pas toujours ce que l'agent a sous
 * les yeux : au garage, c'est la plaque, la place, l'etat des lieux. Le chemin
 * « vehicule -> dossier -> onglet » n'est pas un raccourci, c'est un detour.
 *
 *
 * LE DEUXIEME RISQUE, PLUS DISCRET
 *
 * Dupliquer le formulaire dans la 360 aurait ete plus rapide. C'est exactement
 * ce qu'il ne fallait pas faire.
 *
 * Deux formulaires de restitution qui divergent, c'est deux réponses a « le
 * vehicule est-il parti avec le plein ? » — et l'une des deux aura tort sans
 * qu'on le sache. Les deux ecran$s de la reception ont deja diverge une fois ;
 * la reception montre que le piege est reel.
 *
 * Donc : UN panneau, deux points d'entree. Ce fichier.
 */

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  History, Car, KeyRound, Lock, CheckCircle2, Loader2, PackageCheck, Trash2, Star,
} from "lucide-react";
import { useOrPermissions } from "../../app/(dashboard)/dashboard/ordres-reparation/_hooks/useOrPermissions";
import {
  PhotosEtatDesLieux,
  type PhotoUI,
} from "../../app/(dashboard)/dashboard/atelier/reception/_components/PhotosEtatDesLieux";

const CARBURANT_OPTIONS = ["vide", "1/4", "1/2", "3/4", "plein"];
const CARBURANT_LABELS: Record<string, string> = { vide: "Vide", "1/4": "1/4", "1/2": "1/2", "3/4": "3/4", plein: "Plein" };
const MOTIFS_NON_REPARE = ["REFUS_CLIENT", "PIECES_INDISPONIBLES", "ABANDON", "AUTRE"] as const;
const MOTIF_NON_REPARE_LABELS: Record<string, string> = {
  REFUS_CLIENT: "Refus du client",
  PIECES_INDISPONIBLES: "Pièces indisponibles",
  ABANDON: "Abandon du véhicule",
  AUTRE: "Autre motif",
};
const CHECKLIST_SORTIE = [
  "Outillage / accessoires (conformes à l'entrée)",
  "Clés remises",
  "Documents véhicule remis",
  "Anciennes pièces remises au client",
  "Propreté du véhicule",
  "Objets personnels récupérés",
];

/**
 * Note de satisfaction — demandée au moment de la restitution.
 *
 * Séparée du panneau pour une raison de lecture : ce n'est plus une étape du
 * processus de restitution, c'est une question posée au client, et elle se
 * garde dans son propre bloc.
 */
function NoteSatisfaction({ or }: { or: any }) {
  const utils = api.useUtils();
  const [note, setNote] = useState<number>(or.satisfactionNote ?? 0);
  const [commentaire, setCommentaire] = useState("");
  const dejaNotee = or.satisfactionNote != null;

  const noter = api.atelierKpi.noterSatisfaction.useMutation({
    onSuccess: () => {
      toast.success("Merci — la satisfaction est enregistrée");
      utils.atelierKpi.invalidate();
      utils.vehicules.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <Star size={15} className="text-primary" /> Satisfaction du client
      </h3>
      {dejaNotee ? (
        <p className="text-sm text-muted-foreground">
          Noté <b className="text-foreground">{or.satisfactionNote} / 5</b>
          {or.satisfactionCommentaire ? ` — « ${or.satisfactionCommentaire} »` : ""}.
          <span className="block text-xs">Redites possibles en toute honnêteté : un client qui revient le dire vaut mieux qu'un 5 de façade.</span>
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Demandez-la maintenant, pendant que le client est là : une note
           collectée plus tard ne vaut plus rien.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                onClick={() => setNote(n)}
                className={`rounded-lg border px-2.5 py-1 text-sm font-bold transition-colors ${
                  note >= n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {n} ★
              </button>
            ))}
          </div>
          <Input
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ce qu'il a dit (facultatif)"
            className="mt-2"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="text-xs"
              disabled={note === 0 || noter.isPending}
              onClick={() => noter.mutate({ orId: Number(or.id), note, commentaire: commentaire.trim() || undefined })}
            >
              {noter.isPending ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
              Enregistrer la note
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Restitution, clôture définitive et historique des restitutions d'un dossier.
 *
 * Ne dépend que de `or.id`, `or.kilometrageEntree` et `or.statut` : c'est ce
 * qui permet de l'accrocher aussi bien à la page d'un ordre de réparation
 * qu'à la 360 d'un véhicule.
 */
export function RestituerVehicule({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const peutRestituer = flags.canRestitution;
  // T0.2 : la sortie exceptionnelle exige or.valider (côté serveur aussi).
  const peutException = peutRestituer && flags.valider;

  // ÉTAPE 4 — ces deux requêtes sont sous `or.consulter`. La 360 est aussi
  // affichée au GARAGE, dont les profils n'ont pas forcément cette permission :
  // sans `enabled`, la page empoisonnerait deux requêtes en Forbidden pour
  // afficher un panneau qu'ils ne peuvent pas utiliser de toute façon.
  //
  // Le permission est le serveur qui décide ; ici on évite seulement de poser
  // une question dont on connaît déjà la réponse.
  const { data: restitutions } = api.or.listerRestitutions.useQuery(
    { orId: id },
    { enabled: flags.consult },
  );

  // LOT U0c — comparaison entrée / sortie de CETTE visite. C'est la pièce à
  // conviction : on compare l'état constaté à l'entrée avec celui constaté au
  // moment où le véhicule repart, pas avec un état ancien.
  const { data: comparaison } = api.or.comparerPhotosEtatDesLieu.useQuery(
    { orId: id },
    { enabled: flags.consult },
  );
  const [photosSortie, setPhotosSortie] = useState<PhotoUI[]>([]);

  const [restitForm, setRestitForm] = useState({
    kilometrageSortie: "",
    niveauCarburantSortie: "",
    recuperateurNom: "",
    signatureClient: "",
    observations: "",
    motifNonRepare: "AUTRE",
    travauxNonRealises: "",
    sortieExceptionnelle: false,
    motifException: "",
    commentaireException: "",
    checklist: CHECKLIST_SORTIE.map((l) => ({ libelle: l, ok: false, observation: "" })),
  });

  // LOT U2 (RD5) — invariant kilométrage, calculé côté client pour informer
  // AVANT la soumission. Le serveur le revérifie systématiquement.
  const kmEntree = or.kilometrageEntree != null ? Number(or.kilometrageEntree) : null;
  const kmSortieIncoherente =
    kmEntree != null && restitForm.kilometrageSortie !== "" && Number(restitForm.kilometrageSortie) < kmEntree;

  const restituer = api.or.restituerVehicule.useMutation({
    onSuccess: () => {
      toast.success("Véhicule restitué — OR livré");
      utils.or.getById.invalidate();
      // La 360 se relit elle-même : le statut du véhicule passe à `sorti`.
      // Sans ça, l'agent voit « restitué » et « en réparation » au même écran.
      utils.vehicules.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const fermer = api.or.fermerDefinitivement.useMutation({
    onSuccess: () => {
      toast.success("Dossier fermé définitivement");
      utils.or.getById.invalidate();
      utils.vehicules.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const restitChecklist = (i: number, patch: Partial<{ ok: boolean; observation: string }>) => {
    setRestitForm((f) => ({
      ...f,
      checklist: f.checklist.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  };

  const soumettreRestitution = () => {
    if (restitForm.kilometrageSortie === "") { toast.error("Kilométrage de sortie requis"); return; }
    // LOT U2 (RD5) — l'IHM prévient avant l'appel ; le serveur reste la
    // seule garantie (ce contrôle client n'est pas une sécurité).
    if (kmSortieIncoherente) {
      toast.error(`Kilométrage de sortie inférieur au km d'entrée (${Number(kmEntree).toLocaleString("fr-FR")} km)`);
      return;
    }
    if (restitForm.recuperateurNom.trim().length < 2) { toast.error("Récupérateur requis"); return; }
    if (restitForm.signatureClient.trim().length < 2) { toast.error("Signature (nom tapé) requise"); return; }
    if (restitForm.sortieExceptionnelle) {
      if (!flags.valider) { toast.error("Sortie exceptionnelle : la permission « or.valider » est requise."); return; }
      if (restitForm.motifException.trim().length < 3) { toast.error("Motif de sortie exceptionnelle requis"); return; }
      if (restitForm.commentaireException.trim().length < 3) { toast.error("Commentaire requis pour la sortie exceptionnelle"); return; }
    }
    const checklist = restitForm.checklist.map((c) => ({ libelle: c.libelle, ok: c.ok, observation: c.observation || undefined }));
    restituer.mutate({
      orId: id,
      kilometrageSortie: Number(restitForm.kilometrageSortie),
      niveauCarburantSortie: restitForm.niveauCarburantSortie || undefined,
      checklist,
      // LOT U0c — état des lieux de sortie (par face), comparé à l'entrée.
      photos: photosSortie.map((p) => ({ categorie: p.categorie, url: p.url })),
      recuperateurNom: restitForm.recuperateurNom.trim(),
      signatureClient: restitForm.signatureClient.trim(),
      observations: restitForm.observations.trim() || undefined,
      motifNonRepare: restitForm.motifNonRepare as any,
      travauxNonRealises: restitForm.travauxNonRealises.trim() || undefined,
      sortieExceptionnelle: restitForm.sortieExceptionnelle || undefined,
      motifException: restitForm.motifException.trim() || undefined,
      commentaireException: restitForm.commentaireException.trim() || undefined,
    });
  };

  const restitue = or.statut === "LIVRE";
  const peutCloturer = flags.canRestitution && restitue && or.statut !== "ferme_definitif";

  return (
    <div className="space-y-4">
      {/* ─── Restitution ─── */}
      {!restitue && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <KeyRound size={15} className="text-primary" /> Restitution du véhicule
          </h3>
          {!peutRestituer && (
            <p className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <Lock size={13} /> Vous n'avez pas la permission de restituer le véhicule.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Kilométrage sortie *</Label>
              <Input
                type="number"
                min={kmEntree ?? 0}
                value={restitForm.kilometrageSortie}
                onChange={(e) => setRestitForm({ ...restitForm, kilometrageSortie: e.target.value })}
                placeholder="Ex : 45 320"
                className="mt-1"
                disabled={!peutRestituer}
              />
              {/* LOT U2 (RD5) — invariant affiché AVANT la soumission : le km
                  de sortie ne peut pas être inférieur au km relevé à l'entrée. */}
              {kmSortieIncoherente ? (
                <p className="mt-1 text-xs text-destructive">
                  Inférieur au km d&apos;entrée ({Number(kmEntree).toLocaleString("fr-FR")} km) : le véhicule ne peut
                  pas avoir perdu de kilomètres.
                </p>
              ) : (
                kmEntree != null && <p className="mt-1 text-xs text-muted-foreground">Minimum relevé à l&apos;entrée : {Number(kmEntree).toLocaleString("fr-FR")} km</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Niveau carburant sortie</Label>
              <select value={restitForm.niveauCarburantSortie} onChange={(e) => setRestitForm({ ...restitForm, niveauCarburantSortie: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" disabled={!peutRestituer}>
                <option value="">—</option>
                {CARBURANT_OPTIONS.map((n) => <option key={n} value={n}>{CARBURANT_LABELS[n]}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Motif si non / partiellement réparé</Label>
              <select value={restitForm.motifNonRepare} onChange={(e) => setRestitForm({ ...restitForm, motifNonRepare: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" disabled={!peutRestituer}>
                {MOTIFS_NON_REPARE.map((m) => <option key={m} value={m}>{MOTIF_NON_REPARE_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {restitForm.checklist.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={c.ok} onChange={(e) => restitChecklist(i, { ok: e.target.checked })} disabled={!peutRestituer} className="size-4" />
                  {c.libelle}
                </label>
                <input value={c.observation} onChange={(e) => restitChecklist(i, { observation: e.target.value })} placeholder="Observation" className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs" disabled={!peutRestituer} />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Récupérateur (peut différer du propriétaire) *</Label>
              <Input value={restitForm.recuperateurNom} onChange={(e) => setRestitForm({ ...restitForm, recuperateurNom: e.target.value })} placeholder="Nom du récupérateur" className="mt-1" disabled={!peutRestituer} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Signature (nom tapé) *</Label>
              <Input value={restitForm.signatureClient} onChange={(e) => setRestitForm({ ...restitForm, signatureClient: e.target.value })} placeholder="Nom signé par le client" className="mt-1" disabled={!peutRestituer} />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Travaux non réalisés (si partiel)</Label>
              <textarea value={restitForm.travauxNonRealises} onChange={(e) => setRestitForm({ ...restitForm, travauxNonRealises: e.target.value })} rows={2} placeholder="Liste des travaux non réalisés…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" disabled={!peutRestituer} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observations client</Label>
              <textarea value={restitForm.observations} onChange={(e) => setRestitForm({ ...restitForm, observations: e.target.value })} rows={2} placeholder="Observations…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" disabled={!peutRestituer} />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3">
            <label className="flex items-start gap-2 text-xs font-medium text-foreground">
              <input type="checkbox" className="mt-0.5 size-4" checked={restitForm.sortieExceptionnelle && peutException}
                onChange={(e) => setRestitForm({ ...restitForm, sortieExceptionnelle: e.target.checked })}
                disabled={!peutException} />
              <span>
                <b>Sortie exceptionnelle</b> — véhicule sort malgré QC non validé, travaux non terminés ou facture non soldée (le motif, le commentaire et le reste dû restent tracés sur le dossier).
              </span>
            </label>
            {peutRestituer && !flags.valider && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sortie exceptionnelle réservée aux profils avec la permission « or.valider » — demandez-la à votre responsable.
              </p>
            )}
            {restitForm.sortieExceptionnelle && peutException && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Motif de la sortie exceptionnelle *</Label>
                  <Input value={restitForm.motifException} onChange={(e) => setRestitForm({ ...restitForm, motifException: e.target.value })} placeholder="Ex : formuleur autorisée malgré refus du client" className="mt-1" disabled={!peutRestituer} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Commentaire *</Label>
                  <Input value={restitForm.commentaireException} onChange={(e) => setRestitForm({ ...restitForm, commentaireException: e.target.value })} placeholder="Ex : montant restant 150 000 F encaissé sous 30 jours" className="mt-1" disabled={!peutRestituer} />
                </div>
              </div>
            )}
          </div>
          {peutRestituer && (
            <div className="mt-4 rounded-xl border border-border bg-card/50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                État des lieux de sortie
              </p>
              {(() => {
                const faces = comparaison?.lignes?.filter((l) => l.entree || l.sortie) ?? [];
                return (
                  <>
                    {faces.length > 0 && (
                      <p className="mb-3 text-[11px] text-muted-foreground">
                        L&apos;état constaté à l&apos;entrée de ce dossier — comparez-le avant de valider la restitution.
                      </p>
                    )}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {faces.map((l) => (
                        <div key={l.categorie} className="overflow-hidden rounded-lg border border-border">
                          <p className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                            {comparaison?.libelles?.[l.categorie] ?? l.categorie}
                          </p>
                          <div className="grid grid-cols-2 gap-px bg-border">
                            {(["entree", "sortie"] as const).map((etape) => {
                              const p = l[etape] as { url?: string } | null;
                              return (
                                <div key={etape} className="bg-background">
                                  <p className="px-1 pt-1 text-[9px] uppercase text-muted-foreground">
                                    {etape === "entree" ? "Entrée" : "Sortie"}
                                  </p>
                                  {p?.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={p.url} alt={`${l.categorie} ${etape}`} className="aspect-[4/3] w-full object-cover" />
                                  ) : (
                                    <div className="flex aspect-[4/3] w-full items-center justify-center text-[9px] text-muted-foreground">
                                      —
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
              <PhotosEtatDesLieux
                photos={photosSortie}
                onChange={setPhotosSortie}
                visite="SORTIE"
                desactive={!peutRestituer}
                afficherManquantes={false}
              />
            </div>
          )}
          {peutRestituer && (
            <div className="mt-4 flex justify-end">
              <Button className="gap-1.5 text-xs" disabled={restituer.isPending} onClick={soumettreRestitution}>
                {restituer.isPending ? <Loader2 className="size-3 animate-spin" /> : <PackageCheck size={14} />}
                Restituer le véhicule
              </Button>
            </div>
          )}
        </div>
      )}

      {restitue && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="text-success-foreground" />
          Véhicule restitué — OR livré.
        </div>
      )}

      {/* ─── Satisfaction client (étape 6, P3.2) ───
          ICI, et seulement ici.

          La note n'a de sens que si elle est demandée pendant que le client
          est devant vous. Un formulaire ouvert trois jours plus tard ne
          produit qu'un nombre inventé — et ce nombre, moyenné sur dix
          dossiers, devient une « satisfaction client 4,2 / 5 » que personne
          ne peut contester parce qu'elle sort d'un tableau de bord.

          Le serveur existait déjà (`atelierKpi.noterSatisfaction`, protégé
          par `or.modifier`) et n'était appelé par AUCUN écran : le KPI
          SATISFACTION_CLIENT était donc voué au tiret éternel. Une colonne
          qu'on lit et qu'on ne peut pas remplir — le même défaut que la
          table `relances` avant l'étape 5. */}
      <NoteSatisfaction or={or} />

      {/* ─── Clôture définitive ─── */}
      {peutCloturer && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Lock size={15} className="text-primary" /> Clôture définitive
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Le véhicule est restitué et le solde réglé (ou crédit validé) : la clôture définitive fige le dossier (plus aucune modification).
          </p>
          <Button variant="outline" className="gap-1.5 text-xs" disabled={fermer.isPending} onClick={() => fermer.mutate({ id, motif: "Clôture définitive" })}>
            {fermer.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 size={14} />}
            Fermer définitivement
          </Button>
        </div>
      )}

      {/* ─── Historique des restitutions ─── */}
      {(restitutions ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Historique des restitutions
          </h3>
          <div className="space-y-1.5">
            {(restitutions ?? []).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <Car size={12} className="text-primary" />
                <span>Km {r.kilometrageSortie ?? "—"}{r.niveauCarburantSortie ? ` · ${CARBURANT_LABELS[r.niveauCarburantSortie]}` : ""}</span>
                <span className="text-muted-foreground">· {r.recuperateurNom}</span>
                {r.motifNonRepare && <span className="text-muted-foreground">· {MOTIF_NON_REPARE_LABELS[r.motifNonRepare]}</span>}
                <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.dateRestitution).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}