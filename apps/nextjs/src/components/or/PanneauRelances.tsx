"use client";

/**
 * RELANCES — le panneau, enfin.
 *
 * ÉTAPE 5, lot 3. La table sait ce qu'une relance est, le routeur sait l'écrire,
 * le service sait ce qui mérite d'être relancé. Aucun écran ne le montrait.
 *
 *
 * POURQUOI DEUX FORMES
 *
 * Une attente n'est pas liée à un onglet. Si le bandeau n'apparaît que dans
 * « Vue d'ensemble », l'agent qui ouvre « Historique » ne voit pas qu'un
 * dossier attend une réponse depuis vingt-cinq jours — et le panneau est
 * inutile précisément quand on en a le plus besoin.
 *
 * Donc :
 *   - `bandeau` : au-dessus des onglets, sur TOUTES les vues, compact ;
 *   - `panneau` : le dossier complet, dans « Vue d'ensemble ».
 *
 *
 * CE QUI EST VOLONTAIREMENT ABSENT
 *
 * Un bouton « Relancer » unique qui enverrait un SMS tout seul. Cela
 * produirait des relances que personne n'a décidées, et le client le sentirait.
 * Ici, on enregistre ce qu'un agent a FAIT — un appel, un SMS, une visite.
 * Le module trace les actes, il n'en prend pas à la place de l'humain.
 */

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  AlertTriangle, CheckCircle2, Clock, History, Loader2, PhoneCall, Send, Lock,
} from "lucide-react";
import { useTempsReel } from "~/hooks/useTempsReel";
import { usePermissions } from "~/hooks/usePermissions";

/** Canaux qu'un agent choisit vraiment — pas ceux que le système produit. */
const CANAUX_AGENT = [
  { value: "APPEL", label: "Appel" },
  { value: "SMS_RECOU", label: "SMS" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EN_VISITE", label: "En visite" },
  { value: "EMAIL", label: "E-mail" },
] as const;

const STATUT_STYLE: Record<string, string> = {
  EN_ATTENTE: "bg-muted/50 text-muted-foreground",
  ENVOYEE: "bg-primary/10 text-primary-foreground",
  LUE: "bg-primary/10 text-primary-foreground",
  REPONDUE: "bg-success/15 text-success-foreground",
  SANS_REPONSE: "bg-warning/15 text-warning-foreground",
  ECHEC: "bg-destructive/15 text-destructive-foreground",
  CLOTUREE: "bg-muted/50 text-muted-foreground",
};

/** Bandeau compact, au-dessus des onglets. */
export function BandeauRelances({ vehiculeId }: { vehiculeId: number }) {
  const { hasPermission } = usePermissions();
  const peut = hasPermission("creances.relancer");

  // 30 s : le module Relances est un poste d'attente, pas un écran de saisie.
  // En dessous, la requête tourne pour rien sur une liste quasi statique.
  const intervalle = useTempsReel(30_000, peut);
  const { data } = api.relances.attendues.useQuery(
    { vehiculeId },
    { enabled: peut, refetchInterval: intervalle },
  );

  const candidats = data?.candidates ?? [];
  if (!peut || candidats.length === 0) return null;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-warning-foreground">
        <Clock size={14} /> À relancer
      </div>
      <ul className="space-y-1">
        {candidats.map((c) => (
          <li key={c.type} className="flex items-start gap-2 text-sm">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
            <span>
              <b>{c.type.replace(/_/g, " ").toLowerCase()}</b> — {c.raison}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {candidats.length === 1 ? "Voir l'onglet « Vue d'ensemble » pour relancer."
          : "Voir l'onglet « Vue d'ensemble » pour relancer."}
      </p>
    </div>
  );
}

/** Panneau complet : quoi relancer, ce qui a déjà été fait, et le formulaire. */
export function PanneauRelances({ vehiculeId, orId }: { vehiculeId: number; orId?: number | null }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const peut = hasPermission("creances.relancer");

  const { data: attendues } = api.relances.attendues.useQuery(
    { vehiculeId },
    { enabled: peut },
  );
  const { data: historique } = api.relances.parVehicule.useQuery(
    { vehiculeId },
    { enabled: peut },
  );
  const [enCours, setEnCours] = useState<string | null>(null);
  const [canal, setCanal] = useState<string>("APPEL");
  const [message, setMessage] = useState("");

  const invalider = () => {
    utils.relances.attendues.invalidate();
    utils.relances.parVehicule.invalidate();
  };

  const creer = api.relances.creer.useMutation({
    onSuccess: () => {
      toast.success("Relance enregistrée");
      setEnCours(null);
      setMessage("");
      invalider();
    },
    onError: (e) => toast.error(e.message),
  });

  const changer = api.relances.changerStatut.useMutation({
    onSuccess: () => {
      toast.success("Relance mise à jour");
      invalider();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!peut) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <Lock size={13} /> Vous n'avez pas la permission de relancer.
      </div>
    );
  }

  const candidats = attendues?.candidates ?? [];

  return (
    <div className="space-y-4">
      {/* ─── Ce qui attend ─── */}
      {candidats.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          Rien à relancer sur ce dossier.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <AlertTriangle size={14} className="text-warning" /> À relancer
          </h3>
          <div className="space-y-2">
            {candidats.map((c) => (
              <div
                key={c.type}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-semibold">{c.type.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-xs text-muted-foreground">{c.raison}</span>
                {enCours === c.type ? (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <select
                      value={canal}
                      onChange={(e) => setCanal(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      aria-label="Canal de la relance"
                    >
                      {CANAUX_AGENT.map((x) => (
                        <option key={x.value} value={x.value}>{x.label}</option>
                      ))}
                    </select>
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Ce qui a été dit"
                      className="h-8 w-48 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={creer.isPending || message.trim().length < 2}
                      onClick={() =>
                        creer.mutate({
                          type: c.type,
                          canal,
                          message: message.trim(),
                          vehiculeId,
                          orId: orId ?? attendues?.orId ?? undefined,
                        })
                      }
                    >
                      {creer.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Enregistrer
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEnCours(null)}>
                      Annuler
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 gap-1.5 text-xs"
                    onClick={() => { setEnCours(c.type); setMessage(""); }}
                  >
                    <PhoneCall size={12} /> Relancer
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Ce qui a déjà été fait ─── */}
      {(historique ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={14} className="text-primary" /> Relances ({(historique ?? []).length})
          </h3>
          <div className="space-y-1.5">
            {(historique ?? []).map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
              >
                <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUT_STYLE[r.statut] ?? "bg-muted/50"}`}>
                  {r.statut?.replace(/_/g, " ")}
                </span>
                <b>{r.type?.replace(/_/g, " ").toLowerCase()}</b>
                <span className="text-muted-foreground">· {r.canal?.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-muted-foreground">· {r.message}</span>
                {/* La date de CRÉATION, pas d'envoi : c'est elle qui dit
                    « on a essayé il y a trois semaines ». `relances` n'a pas de
                    `dateRestitution` — ce serait le champ d'un autre module. */}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString("fr-FR")}
                </span>
                {r.statut !== "REPONDUE" && r.statut !== "CLOTUREE" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-1.5 text-[10px]"
                    disabled={changer.isPending}
                    onClick={() => changer.mutate({ id: r.id, statut: "REPONDUE" })}
                  >
                    <CheckCircle2 size={11} /> Répondu
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}