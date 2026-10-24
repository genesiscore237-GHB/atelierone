"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  ChevronDown,
  ChevronUp,
  History,
  MessageCircle,
  Receipt,
  Settings2,
} from "lucide-react";
import { Button, buttonVariants } from "~/components/ui/button";
import { ALERTE_META } from "~/server/lib/atelier-service";
import { analyserSuiviRelation } from "~/lib/suivi-relation";
import { useOrPermissions } from "../../_hooks/useOrPermissions";
import { StatutBadge } from "./shared/StatutBadge";
import { PrioriteBadge } from "./shared/PrioriteBadge";
import { StatutSelector } from "./shared/StatutSelector";
import { PrioriteSelector } from "./shared/PrioriteSelector";
import { TechnicienSelector } from "./shared/TechnicienSelector";

interface OrHeaderProps {
  or: any;
  employes: any[];
  onOpenJournal: () => void;
  onOpenRelation: () => void;
}

/**
 * En-tête compact de la fiche OR.
 *
 * Il répond à « quel véhicule, quel client, où en est-on, que faut-il faire ».
 * Les actions de gestion (statut, priorité, technicien) sont repliées derrière
 * « Gérer » ; la facturation détaillée vit dans l'onglet Facture.
 */
export function OrHeader({ or, employes, onOpenJournal, onOpenRelation }: OrHeaderProps) {
  const { flags } = useOrPermissions();
  const [showGestion, setShowGestion] = useState(false);

  const id = Number(or.id);
  const hasAlerte = or.alerte && or.alerte !== "OK";
  const suivi = or.suiviRelation ?? analyserSuiviRelation(or.dateOuverture, or.historique ?? []);
  const reclamationOuverte = !!suivi.reclamation && suivi.reclamation.statut !== "RESOLUE";
  const relationAction = !suivi.reponse || reclamationOuverte;
  const relationLabel = reclamationOuverte
    ? "Réclamation ouverte"
    : "Première réponse à tracer";

  const technicien = or.responsablePrenom
    ? `${or.responsablePrenom} ${or.responsableNom ?? ""}`.trim()
    : "Non assigné";
  const dateEntree = or.dateReception ?? or.dateOuverture;
  const totalTTC = Number(or.totalTTC ?? 0);
  const totalFacture = Number(or.totalFacture ?? 0);
  const resteAFacturer = Math.max(0, totalTTC - totalFacture);
  const canManage =
    flags.canChangerStatut || flags.modifier || flags.canAssignerTechnicien;
  const peutFacturer =
    flags.canFacturation && or.statut === "PRET_A_LIVRER" && !or.venteId;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/ordres-reparation"
              className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={14} /> Liste
            </Link>
            <h2 className="text-lg font-bold text-foreground">OR {or.numero}</h2>
            <PrioriteBadge priorite={or.priorite} />
            <StatutBadge statut={or.statut} />
            {hasAlerte && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${ALERTE_META[or.alerte]?.badge ?? ""}`}>
                {ALERTE_META[or.alerte]?.libelle ?? or.alerte}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            <Car size={12} className="inline" /> {or.immatriculation} — {or.marque} {or.modele}
            {or.clientPrenom && (
              <> · Client : {or.clientPrenom} {or.clientNom}</>
            )}
            {or.clientTelephone && <> · {or.clientTelephone}</>}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Entrée : {dateEntree ? new Date(dateEntree).toLocaleDateString("fr-FR") : "—"}
            {or.datePromesse && <> · Promesse : {new Date(or.datePromesse).toLocaleDateString("fr-FR")}</>}
            {or.joursImmobilisation !== undefined && (
              <> · Immobilisation : <b className="text-warning-foreground">{or.joursImmobilisation} j</b></>
            )}
            {or.retardJours > 0 && <> · <b className="text-destructive">Retard {or.retardJours} j</b></>}
            {or.emplacement && <> · {or.emplacement}</>}
            <> · Technicien : {technicien}</>
          </p>

          {or.plainte && (
            <p className="mt-1 truncate text-sm" title={or.plainte}>
              Plainte : <span className="text-foreground/80">{or.plainte}</span>
            </p>
          )}

          {or.raisonBlocage && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-destructive">
              <AlertTriangle size={12} /> Bloqué : {or.raisonBlocage}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenJournal}
            className="gap-1.5 text-xs"
          >
            <History size={14} /> Journal
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenRelation}
            className={`gap-1.5 text-xs ${
              relationAction ? "border-warning/30 bg-warning/5 text-warning-foreground" : ""
            }`}
            title={relationAction ? relationLabel : "Relation client"}
          >
            <MessageCircle size={14} /> Relation client
            {relationAction && (
              <span className="size-1.5 rounded-full bg-warning" aria-label={relationLabel} />
            )}
          </Button>

          {peutFacturer && (
            <Link
              href={`/dashboard/ordres-reparation/${id}?tab=facture-restitution`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Receipt size={14} className="mr-1.5" /> Facturer
            </Link>
          )}

          {or.statut === "BLOQUE" && canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowGestion(true)}
              className="gap-1.5 text-xs"
            >
              <AlertTriangle size={14} /> Lever le blocage
            </Button>
          )}

          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGestion((v) => !v)}
              className="gap-1.5 text-xs"
              aria-expanded={showGestion}
            >
              <Settings2 size={14} /> Gérer
              {showGestion ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          )}
        </div>
      </div>

      {relationAction && (
        <button
          type="button"
          onClick={onOpenRelation}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-1.5 text-left text-xs text-warning-foreground"
        >
          <AlertTriangle size={13} className="shrink-0" />
          <span>
            <b>Relation client :</b> {relationLabel}. Cliquez pour ouvrir le suivi.
          </span>
        </button>
      )}

      {showGestion && canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Gestion du dossier
          </span>
          {flags.canChangerStatut && <StatutSelector or={or} id={id} />}
          {flags.modifier && <PrioriteSelector or={or} id={id} />}
          {flags.canAssignerTechnicien && <TechnicienSelector or={or} employes={employes} />}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>
          Total TTC : <b className="text-foreground">{totalTTC.toLocaleString("fr-FR")} F</b>
        </span>
        {or.venteId ? (
          <span className="text-success-foreground">
            Facturé {or.venteReference ? `(${or.venteReference})` : ""}
          </span>
        ) : resteAFacturer > 0 ? (
          <span>
            Reste à facturer : <b className="text-foreground">{resteAFacturer.toLocaleString("fr-FR")} F</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}
