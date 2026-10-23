"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Activity, AlertTriangle, ArrowRight, Car, ChartBar, CheckCircle, Clock, Gauge, MessageCircle, Receipt, Target, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PRIORITE_META, STATUT_BADGE, STATUT_LABELS } from "~/server/lib/atelier-service";
import { usePermissions } from "~/hooks/usePermissions";
import { KPI_DEFAUTS } from "~/lib/kpi-defaults";
import { formatDelaiHeures, type SyntheseRelationClient } from "~/lib/suivi-relation";

const PERIODES = [
  { id: "jour", label: "Jour" },
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "trimestre", label: "Trimestre" },
] as const;

type PeriodeId = (typeof PERIODES)[number]["id"];

const TABS = [
  { id: "direction", label: "Direction", icon: Gauge },
  { id: "sante", label: "Santé du garage", icon: Activity },
  { id: "sav", label: "Qualité & SAV", icon: AlertTriangle },
  { id: "diag", label: "Diagnostic", icon: Clock },
  { id: "competences", label: "Compétences / RH", icon: Users },
  { id: "delais", label: "Compétitivité délais", icon: CheckCircle },
  { id: "facturation", label: "Facturation", icon: Receipt },
] as const;
type TabId = (typeof TABS)[number]["id"];

const POINT_MATINAL = [
  "Tous les P1 ont un technicien assigné aujourd'hui",
  "Aucun véhicule en RETARD n'est sans action prévue",
  "Les BLOQUÉS ont une raison claire et un plan de déblocage",
  "Les promesses de livraison du jour sont tenables",
  "Les techniciens savent sur quel véhicule ils travaillent",
  "Capacité réservée (~20%) pour les urgences de la journée",
  "Les factures en attente de bon de commande ont été relancées",
];

export function PerformanceQualite() {
  const params = useSearchParams();
  const initialTab = (params.get("tab") as TabId | null) ?? "direction";
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : "direction");
  const [periode, setPeriode] = useState<PeriodeId>("mois");

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Performance & Qualité</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicateurs décisionnels basés sur les données réelles du cycle véhicule — ponctualité, qualité diagnostic, comebacks, productivité.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
          {PERIODES.map((p) => (
            <button key={p.id} onClick={() => setPeriode(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${periode === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "direction" && <VueDirection periode={periode} />}
        {tab === "sante" && <VueSante periode={periode} />}
        {tab === "sav" && <VueSAV periode={periode} />}
        {tab === "diag" && <VueDiagnostic periode={periode} />}
        {tab === "competences" && <VueCompetences periode={periode} />}
        {tab === "delais" && <VueDelais periode={periode} />}
        {tab === "facturation" && <VueFacturation periode={periode} />}
      </div>
    </div>
  );
}

// ─── Vue Direction (temps réel + point matinal + alertes) ───
function VueDirection({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.or.getDashboard.useQuery();
  const { data: fact } = api.atelierKpi.getFacturation.useQuery({ periode });
  const [checklist, setChecklist] = useState<Record<number, boolean>>({});

  if (isLoading || !data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const kpis = data.kpis as any;
  const repPriorite = (data.repPriorite ?? []) as any[];
  const repStatut = (data.repStatut ?? []) as any[];
  const parc = (data.parc ?? []) as any[];
  const critiques = parc.filter((p: any) => p.alerte === "RETARD" || p.alerte === "BLOQUE" || p.priorite === "P1");
  const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

  return (
    <div className="space-y-4">
      {/* Bandeau temps réel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BandeauKpi label="Véhicules en parc" value={kpis.totalParc} className="text-foreground" />
        <BandeauKpi label="Priorité P1" value={kpis.p1Ouverts} className={kpis.p1Ouverts > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi label="En retard" value={kpis.enRetard} className={kpis.enRetard > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi label="Bloqués" value={kpis.bloques} className={kpis.bloques > 0 ? "text-warning" : "text-success-foreground"} />
        <BandeauKpi label="Prêts à livrer" value={kpis.pretALivrer} className="text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Répartitions */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par priorité</h3>
          <div className="space-y-2">
            {repPriorite.map((r: any) => (
              <div key={r.priorite} className="flex items-center gap-2 text-sm">
                <span className={`w-8 rounded px-1.5 py-0.5 text-center text-[11px] font-black text-white ${r.priorite === "P1" ? "bg-destructive" : r.priorite === "P2" ? "bg-warning" : r.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{r.priorite}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${r.priorite === "P1" ? "bg-destructive" : r.priorite === "P2" ? "bg-warning" : r.priorite === "P3" ? "bg-success" : "bg-muted"}`} style={{ width: `${Math.max(3, r.pourcent)}%` }} />
                </div>
                <span className="w-24 text-right text-xs text-muted-foreground">{r.nombre} · {r.pourcent}%</span>
              </div>
            ))}
          </div>
          <h3 className="mb-3 mt-5 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par statut</h3>
          <div className="flex flex-wrap gap-1.5">
            {repStatut.map((s: any) => (
              <span key={s.statut} className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                {s.libelle} <b className="text-foreground">{s.nombre}</b>
              </span>
            ))}
          </div>
        </div>

        {/* Point matinal */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <CheckCircle size={14} className="text-primary" /> Point matinal ({Object.values(checklist).filter(Boolean).length}/{POINT_MATINAL.length})
          </h3>
          <div className="space-y-2">
            {POINT_MATINAL.map((item, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={!!checklist[i]}
                  onChange={(e) => setChecklist((prev) => ({ ...prev, [i]: e.target.checked }))}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className={checklist[i] ? "text-muted-foreground line-through" : "text-foreground"}>{item}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">🔴 Retards : {kpis.enRetard}</span>
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning-foreground">🟣 Bloqués : {kpis.bloques}</span>
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">🔴 P1 : {kpis.p1Ouverts}</span>
          </div>
        </div>
      </div>

      {/* Alertes critiques — action requise */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <AlertTriangle size={14} className="text-warning" /> Alertes critiques — action requise ({critiques.length})
        </h3>
        {critiques.length === 0 ? (
          <p className="text-sm text-success-foreground">Aucune alerte critique — tout est sous contrôle.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Immat.</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Priorité</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-right">Jours</th>
                  <th className="px-3 py-2 text-right">Retard</th>
                  <th className="px-3 py-2">Alerte</th>
                  <th className="px-3 py-2">Action requise</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {critiques.slice(0, 15).map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs font-bold">{p.immatriculation}</td>
                    <td className="px-3 py-2 text-xs">{p.clientDisplay}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-black text-white ${p.priorite === "P1" ? "bg-destructive" : p.priorite === "P2" ? "bg-warning" : p.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{p.priorite}</span></td>
                    <td className="px-3 py-2 text-xs">{STATUT_LABELS[p.statut] ?? p.statut}</td>
                    <td className="px-3 py-2 text-right text-xs">{p.joursImmobilisation} j</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-destructive">{p.retardJours > 0 ? `${p.retardJours} j` : "—"}</td>
                    <td className="px-3 py-2 text-xs font-bold">{p.alerte}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.alerte === "RETARD" && "Relancer / terminer les travaux"}
                      {p.alerte === "BLOQUE" && `Débloquer : ${p.raisonBlocage ?? "raison non renseignée"}`}
                      {p.alerte !== "RETARD" && p.alerte !== "BLOQUE" && "Priorité critique — avancer immédiatement"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/ordres-reparation/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        Ouvrir <ArrowRight size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vue Facturation ───
function VueFacturation({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getFacturation.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
  const fcfa = (n: number | string | null | undefined) => n == null ? "—" : `${fmtFCFA(n)} F`;
  const ETATS: Record<string, { label: string; badge: string }> = {
    NON_TRANSMISE: { label: "Non transmise", badge: "bg-muted text-muted-foreground" },
    ATTENTE_BON_COMMANDE: { label: "Attente bon de commande", badge: "bg-violet-500/15 text-violet-400" },
    ATTENTE_PAIEMENT: { label: "Attente paiement", badge: "bg-warning/15 text-warning-foreground" },
    AVANCE: { label: "Avance reçue", badge: "bg-sky-500/15 text-sky-400" },
    PAYEE: { label: "Payée", badge: "bg-success/15 text-success-foreground" },
  };
  const etats = (data.etats ?? {}) as Record<string, number>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <BandeauKpi label="Facturé (période)" value={fcfa(data.totalFacture)} className="text-foreground" />
        <BandeauKpi label="Encaissé" value={fcfa(data.totalPaye)} className="text-success-foreground" />
        <BandeauKpi label="Restant dû" value={fcfa(data.totalReste)} className={data.totalReste > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi
          label="Marge pièces"
          value={fcfa(data.totalMargePieces)}
          className="text-primary"
          sub="CA − coût des pièces connues"
        />
        <BandeauKpi
          label="Marge nette"
          value={fcfa(data.totalMargeNette)}
          className={data.totalMargeNette != null && data.totalMargeNette < 0 ? "text-destructive" : "text-success-foreground"}
          sub={!data.margeDisponible
            ? "taux horaire atelier à renseigner"
            : `${data.dossiersMargeComplets} dossier(s) complet(s)`}
        />
        <BandeauKpi
          label="Marge moyenne / dossier"
          value={fcfa(data.margeMoyenneDossier)}
          className="text-foreground"
          sub={data.dossiersMargeIncomplets > 0
            ? `${data.dossiersMargeIncomplets} dossier(s) exclu(s)`
            : "dossiers complets uniquement"}
        />
        <BandeauKpi label="Taux recouvrement" value={data.tauxRecouvrement != null ? `${data.tauxRecouvrement} %` : "—"} className="text-foreground" />
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">États</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(ETATS).map(([k, m]) => (
              <span key={k} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.badge}`}>{m.label} <b>{etats[k] ?? 0}</b></span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Marge par dossier</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {data.tauxHoraireAtelier != null
              ? `taux horaire : ${fmtFCFA(data.tauxHoraireAtelier)} F/h`
              : "taux horaire non renseigné"}
          </span>
        </div>
        {!data.margeDisponible ? (
          <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            La marge nette ne peut pas être calculée sans taux horaire. Renseignez-le dans{" "}
            <Link href="/dashboard/atelier/parametres" className="font-bold underline">
              Paramètres atelier
            </Link>{" "}
            — aucune valeur n'est supposée à votre place.
          </p>
        ) : (data.margeParDossier ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun dossier livré sur la période.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              CA − pièces − (heures SERVICE × taux). Les dossiers dont le coût pièces est inconnu sont exclus de la moyenne,
              jamais comptés à zéro.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">OR</th>
                    <th className="px-3 py-2 text-right">CA</th>
                    <th className="px-3 py-2 text-right">Pièces</th>
                    <th className="px-3 py-2 text-right">MO</th>
                    <th className="px-3 py-2 text-right">Marge nette</th>
                    <th className="px-3 py-2">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {(data.margeParDossier ?? []).slice(0, 12).map((d: any) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 font-mono text-xs font-bold">{d.numero}</td>
                      <td className="px-3 py-2 text-right text-xs">{fcfa(d.chiffreAffaires)}</td>
                      <td className="px-3 py-2 text-right text-xs">{fcfa(d.coutPieces)}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {d.coutMainOeuvre != null
                          ? `${fmtFCFA(d.coutMainOeuvre)} F`
                          : `${d.heuresMainOeuvre ?? 0} h`}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-bold ${d.margeNette != null && d.margeNette < 0 ? "text-destructive" : "text-foreground"}`}>
                        {fcfa(d.margeNette)}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        {d.complet ? "complet" : (d.manques?.join(" · ") ?? "incomplet")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(data.margeParDossier ?? []).length > 12 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                12 dossiers affichés sur {data.margeParDossier.length}. La synthèse ci-dessus porte sur tous les dossiers de la période.
              </p>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Top clients en retard de paiement</h3>
        {(data.topClientsRetard ?? []).length === 0 ? (
          <p className="text-sm text-success-foreground">Aucun client en retard — excellent recouvrement.</p>
        ) : (
          <div className="space-y-2">
            {(data.topClientsRetard ?? []).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <span className="w-5 text-xs font-black text-muted-foreground">{i + 1}</span>
                <span className="font-semibold">{c.client}</span>
                <span className="text-xs text-muted-foreground">{c.ors} OR</span>
                <span className="ml-auto text-xs text-muted-foreground">facturé {fmtFCFA(c.facture)} F</span>
                <span className="text-xs text-success-foreground">payé {fmtFCFA(c.paye)} F</span>
                <span className="w-28 text-right text-xs font-bold text-destructive">reste {fmtFCFA(c.reste)} F</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BandeauKpi({ label, value, className, sub }: { label: string; value: string | number; className?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-black ${className ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const KPI_LABELS: Record<string, string> = {
  PONCTUALITE: "Ponctualité",
  FTQ: "Qualité 1ᵉʳ passage",
  TAUX_RETOUR_SAV: "Taux retour SAV",
  RAPIDITE_DIAG_JOURS: "Rapidité diagnostic",
  FIABILITE_APPRO: "Fiabilité approvisionnement",
  DELAI_PIECES_JOURS: "Délai livraison pièces",
  SATISFACTION_CLIENT: "Satisfaction client",
  // ÉTAPE 6 — le taux de reprises : combien de dossiers ont dû être repris
  // après contrôle qualité. C'est un indicateur de coût double — une reprise,
  // c'est une seconde immobilisation que le client a payée deux fois.
  TAUX_REPRISE: "Taux de reprises",
  TAUX_REACHAT: "Taux de réachat",
  TAUX_TRANSFORMATION_DEVIS: "Taux de transformation devis",
  PRODUCTIVITE_TECHNICIEN: "Productivité technicien",
  // P3.3.1 — marge nette moyenne par dossier livré (pièces + main-d'œuvre).
  MARGE_DOSSIER: "Marge par dossier",
};

/**
 * P2.4 — `atelierKpi.updateCible` existait sans appelant : les cibles étaient
 * donc figées au seed, et « cible : 85 » s'affichait sans qu'aucun responsable
 * ne puisse la définir. Cette section rend la promesse modifiable, avec les
 * deux seuils qui décident de l'orange et du rouge dans `getSanteGarage`.
 */
function CiblesKpi({ codes }: { codes: string[] }) {
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const peutModifier = hasPermission("or.modifier");
  const { data, isLoading, error } = api.atelierKpi.getCibles.useQuery();
  const [brouillon, setBrouillon] = useState<Record<string, { cible: string; orange: string; rouge: string }>>({});

  useEffect(() => {
    if (!data) return;
    const suivant: Record<string, { cible: string; orange: string; rouge: string }> = {};
    for (const c of data) {
      suivant[c.code] = {
        cible: c.cible == null ? "" : String(c.cible),
        orange: c.seuilOrange == null ? "" : String(c.seuilOrange),
        rouge: c.seuilRouge == null ? "" : String(c.seuilRouge),
      };
    }
    setBrouillon(suivant);
  }, [data]);

  const mutation = api.atelierKpi.updateCible.useMutation({
    onSuccess: async () => {
      toast.success("Cible enregistrée");
      await Promise.all([
        utils.atelierKpi.getCibles.invalidate(),
        utils.atelierKpi.getSanteGarage.invalidate(),
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  const ligne = (code: string) => brouillon[code] ?? { cible: "", orange: "", rouge: "" };
  const modifier = (code: string, champ: "cible" | "orange" | "rouge", valeur: string) => {
    setBrouillon((prev) => ({
      ...prev,
      [code]: { ...(prev[code] ?? { cible: "", orange: "", rouge: "" }), [champ]: valeur },
    }));
  };

  const enregistrer = (code: string) => {
    const v = ligne(code);
    const cible = Number(v.cible);
    if (v.cible.trim() === "" || Number.isNaN(cible)) {
      toast.error("La cible doit être un nombre");
      return;
    }
    const orange = v.orange.trim() === "" ? null : Number(v.orange);
    const rouge = v.rouge.trim() === "" ? null : Number(v.rouge);
    if ((orange !== null && Number.isNaN(orange)) || (rouge !== null && Number.isNaN(rouge))) {
      toast.error("Les seuils doivent être des nombres");
      return;
    }
    const existante = data?.find((c) => c.code === code);
    const defaut = KPI_DEFAUTS[code];
    const sensExistant = existante?.sens === "HAUT" || existante?.sens === "BAS" ? existante.sens : undefined;
    mutation.mutate({
      code,
      cible,
      seuilOrange: orange,
      seuilRouge: rouge,
      unite: existante?.unite ?? defaut?.unite,
      sens: sensExistant ?? defaut?.sens,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <Target size={14} /> Cibles & seuils
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        La cible est la valeur visée ; les seuils orange et rouge déclenchent le changement de statut.
        {!peutModifier && " Lecture seule : la permission « or.modifier » est requise pour modifier."}
      </p>

      {isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-muted" />
      ) : error ? (
        <p className="mt-3 text-xs text-destructive">Impossible de charger les cibles : {error.message}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5">Indicateur</th>
                <th className="px-2 py-1.5">Cible</th>
                <th className="px-2 py-1.5">Seuil orange</th>
                <th className="px-2 py-1.5">Seuil rouge</th>
                <th className="px-2 py-1.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {codes.map((code) => {
                const v = ligne(code);
                const variables = mutation.variables as { code?: string } | undefined;
                const enCours = mutation.isPending && variables?.code === code;
                return (
                  <tr key={code} className="text-sm">
                    <td className="px-2 py-1.5 font-medium">{KPI_LABELS[code] ?? code}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="any"
                        value={v.cible}
                        onChange={(e) => modifier(code, "cible", e.target.value)}
                        disabled={!peutModifier}
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                        aria-label={`Cible ${KPI_LABELS[code] ?? code}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="any"
                        value={v.orange}
                        onChange={(e) => modifier(code, "orange", e.target.value)}
                        disabled={!peutModifier}
                        placeholder="—"
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                        aria-label={`Seuil orange ${KPI_LABELS[code] ?? code}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="any"
                        value={v.rouge}
                        onChange={(e) => modifier(code, "rouge", e.target.value)}
                        disabled={!peutModifier}
                        placeholder="—"
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                        aria-label={`Seuil rouge ${KPI_LABELS[code] ?? code}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => enregistrer(code)}
                        disabled={!peutModifier || mutation.isPending}
                        className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {enCours ? "…" : "Enregistrer"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Aucune cible personnalisée : les valeurs par défaut s'appliquent.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vue Santé ───
type OccupationPoint = { debut: string; fin: string; moyenne: number };
type ClientDormant = { clientId: number; nom: string; telephone: string | null; derniereVisite: string; joursDepuis: number };

function jjmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function dateFr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * P3.3.4 — un taux de rétention sans liste d'action ne sert à rien. Ces
 * clients ont une dernière visite vieille de 12 à 24 mois : assez ancienne
 * pour être oubliée, assez récente pour qu'un appel ait une chance d'aboutir.
 * Les SAV sont exclus en amont : rappeler un client mécontent n'est pas une
 * campagne de fidélisation.
 */
function ClientsAReactiver({ clients }: { clients: ClientDormant[] }) {
  if (clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Users size={13} /> Clients à réactiver
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">12 à 24 mois sans visite</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Dernière visite connue, hors SAV. Un appel ou un SMS suffit souvent à faire revenir un client dont le véhicule arrive en entretien.
      </p>
      <div className="mt-3 divide-y divide-border/60">
        {clients.map((c) => (
          <div key={c.clientId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.nom}</p>
              <p className="text-[10px] text-muted-foreground">
                dernière visite le {dateFr(c.derniereVisite)} · il y a {Math.round(c.joursDepuis / 30)} mois
              </p>
            </div>
            {c.telephone ? (
              <a href={`tel:${c.telephone.replace(/[^\d+]/g, "")}`} className="shrink-0 rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
                {c.telephone}
              </a>
            ) : (
              <span className="shrink-0 text-[10px] text-muted-foreground">téléphone absent</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * P3.3.7 — la santé du garage ne montrait que l'occupation du jour. Une barre
 * par semaine complète : un plateau se distingue d'un pic, et une semaine
 * chargée ne se confond plus avec une tendance.
 */
function OccupationAtelier({ points }: { points: OccupationPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.moyenne));
  const vide = points.length === 0 || points.every((p) => p.moyenne === 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ChartBar size={13} /> Occupation atelier
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">dossiers ouverts / jour</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Moyenne quotidienne sur 12 semaines complètes. La semaine en cours est exclue tant qu’elle n’est pas terminée.
      </p>

      {vide ? (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Aucun dossier ouvert sur cette période.
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-24 items-end gap-1">
            {points.map((p) => (
              <div
                key={p.debut}
                className="flex h-full flex-1 items-end"
                title={`${jjmm(p.debut)} → ${jjmm(p.fin)} : ${p.moyenne} dossier${p.moyenne > 1 ? "s" : ""}/jour`}
              >
                <div
                  className="w-full rounded-t bg-primary/70 transition-colors hover:bg-primary"
                  style={{ height: `${(p.moyenne / max) * 100}%`, minHeight: p.moyenne > 0 ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{points.length > 0 ? jjmm(points[0].debut) : ""}</span>
            <span>{points.length > 0 ? jjmm(points[points.length - 1].fin) : ""}</span>
          </div>
        </>
      )}
    </div>
  );
}

function RelationClientSante({ relation }: { relation: SyntheseRelationClient | undefined }) {
  const reponses = relation?.reponses ?? 0;
  const ouvertes = relation?.reclamationsOuvertes ?? 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <MessageCircle size={13} className="text-primary" /> Relation client
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-2.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Délai de première réponse</p>
          <p className="text-lg font-black text-foreground">{formatDelaiHeures(relation?.delaiReponseMoyenHeures ?? null)}</p>
          <p className="text-[10px] text-muted-foreground">
            {reponses > 0 ? `sur ${reponses} dossier${reponses > 1 ? "s" : ""} ouvert${reponses > 1 ? "s" : ""} dans la période` : "aucune réponse tracée sur la période"}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${ouvertes > 0 ? "bg-destructive/5" : "bg-muted/40"}`}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Réclamations ouvertes</p>
          <p className={`text-lg font-black ${ouvertes > 0 ? "text-destructive" : "text-foreground"}`}>{ouvertes}</p>
          <p className="text-[10px] text-muted-foreground">
            {ouvertes > 0 ? "à traiter, même sur un dossier déjà livré" : "aucune réclamation en attente"}
          </p>
        </div>
      </div>
    </div>
  );
}

function VueSante({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getSanteGarage.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const statutColor = (s: string) => s === "VERT" ? "bg-success/15 text-success-foreground" : s === "ORANGE" ? "bg-warning/15 text-warning-foreground" : s === "ROUGE" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.kpis.map((k: any) => (
<div key={k.code} className="rounded-xl border border-border bg-card p-3">
            <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statutColor(k.statut)}`}>{k.statut}</span>
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{KPI_LABELS[k.code] ?? k.code}</p>
            <p className="text-lg font-black">{k.valeur != null ? `${k.valeur}${k.unite === "%" ? " %" : k.unite ? ` ${k.unite}` : ""}` : "-"}</p>
            {/* ÉTAPE 6 — LE DÉNOMINATEUR, sous la valeur.
                Une moyenne sans « sur combien » est une impression.
                « Satisfaction 4,5 / 5 » se lit comme une vérité établie ;
                si une seule personne a répondu, c'est la moyenne d'UNE
                personne, et l'écran ne le disait pas.

                Trois états, pas deux : aucune mesure, mesure insuffisante,
                mesure exploitable. Cacher la valeur sous 3 mesures serait
                aller trop loin — la donnée existe, elle n'est pas encore
                une tendance. */}
            {k.n === 0 ? (
              <p className="text-[10px] font-semibold text-muted-foreground">aucune mesure</p>
            ) : (
              <p className={`text-[10px] ${k.significatif ? "text-muted-foreground" : "text-warning-foreground"}`}>
                sur {k.n} {k.nLabel ?? "dossier"}{k.n > 1 ? "s" : ""}
                {!k.significatif && " — trop peu pour conclure"}
              </p>
            )}
            {k.cible != null && <p className="text-[10px] text-muted-foreground">cible : {k.cible}{k.unite === "%" ? " %" : k.unite ? ` ${k.unite}` : ""}</p>}
            {k.raison && <p className="mt-1 text-[10px] text-warning-foreground">{k.raison}</p>}
          </div>
        ))}
      </div>

      <CiblesKpi codes={data.kpis.map((k: any) => String(k.code))} />

      <RelationClientSante relation={data.relationClient as SyntheseRelationClient | undefined} />

      <OccupationAtelier points={(data.occupation ?? []) as OccupationPoint[]} />

      <ClientsAReactiver clients={(data.clientsDormants ?? []) as ClientDormant[]} />

      {(data.topAnciens ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground"><Car size={13} /> Top anciens du parc</h3>
          <div className="space-y-1.5">
            {data.topAnciens.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs font-bold">{t.immatriculation}</span>
                <span className="text-xs text-muted-foreground truncate max-w-48">{t.clientDisplay}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${PRIORITE_META[t.priorite]?.badge ?? ""}`}>{t.priorite}</span>
                <span className="text-xs font-black text-warning-foreground">{t.joursImmobilisation} j</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue SAV ───
function VueSAV({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getQualiteSAV.useQuery({ periode });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const sav = (data?.sav ?? []) as any[];
  const parMotif = (data?.parMotif ?? {}) as Record<string, number>;
  const MOTIFS: Record<string, string> = { CONSIGNE_NON_RESPECTEE: "Consigne non respectée", MALFACON: "Malfaçon", DIAGNOSTIC_ERRONE: "Diagnostic erroné", PIECE_DEFAILLANTE: "Pièce défaillante", AUTRE: "Autre" };

  return (
    <div className="space-y-4">
      {Object.keys(parMotif).length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(parMotif).map(([m, n]) => (
            <div key={m} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-center">
              <p className="text-[10px] uppercase text-destructive">{MOTIFS[m] ?? m}</p>
              <p className="text-lg font-black text-destructive">{n}</p>
            </div>
          ))}
        </div>
      )}
      {sav.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun retour SAV sur la période — excellente qualité.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-2.5">N° OR SAV</th><th className="px-4 py-2.5">Véhicule</th><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Motif</th><th className="px-4 py-2.5">Responsable OR origine</th><th className="px-4 py-2.5 text-right">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sav.map((s: any) => (
                <tr key={s.id} className="text-sm">
                  <td className="px-4 py-2 font-mono text-xs font-bold">{s.numero}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.immatriculation}</td>
                  <td className="px-4 py-2">{s.clientDisplay}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">{MOTIFS[s.motifRetourSAV] ?? s.motifRetourSAV}</span></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.responsablePrenom ? `${s.responsablePrenom} ${s.responsableNom}` : "—"}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Vue Diagnostic ───
function VueDiagnostic({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getDiagnostics.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Délai moyen diagnostic</p>
          <p className="text-lg font-black text-primary">{data.delaiMoyenJours != null ? `${data.delaiMoyenJours} j` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Précision (sans renvoi)</p>
          <p className="text-lg font-black text-success-foreground">{data.precision != null ? `${data.precision} %` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Diagnostics période</p>
          <p className="text-lg font-black">{data.count}</p>
        </div>
      </div>
      {(data.casProblematiques ?? []).length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-warning-foreground"><Clock size={13} /> Cas les plus longs à diagnostiquer</h3>
          <div className="space-y-1">
            {(data.casProblematiques ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs">{c.numero} · {c.immatriculation}</span>
                <span className="font-bold text-destructive">{c.jours} j</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue Compétences / RH ───
function VueCompetences({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getCompetences.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const fiches = (data.fiches ?? []) as any[];

  const recoBadge = (r: string) =>
    r === "FORMATION_REQUISE" ? "bg-destructive/10 text-destructive" : r === "A_SURVEILLER" ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success-foreground";

  return (
    <div className="space-y-3">
      {fiches.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun technicien actif trouvé.</p>
      ) : (
        fiches.map((f: any) => (
          <div key={f.technicien.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary" />
                <span className="font-bold text-foreground">{f.technicien.prenom} {f.technicien.nom}</span>
                <span className="text-xs text-muted-foreground">{f.technicien.fonction}</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${recoBadge(f.recommandation)}`}>{f.recommandation.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="OR traités" value={f.orResponsabilises} />
              <Stat label="Livrés" value={f.livres} />
              <Stat label="En cours" value={f.enCours} />
              <Stat label="Retouche" value={f.retoucheTaux != null ? `${f.retoucheTaux} %` : "—"} />
              <Stat label="Comebacks imputés" value={f.comebacksImputes} danger={f.comebacksImputes >= 2} />
              <Stat label="1ᵉʳ passage" value={f.premierPassageTaux != null ? `${f.premierPassageTaux} %` : "—"} />
              <Stat label="Productivité" value={f.productivite != null ? `${f.productivite} %` : "—"} />
              <Stat label="Heures vendues" value={f.heuresVendues != null ? `${f.heuresVendues} / ${f.heuresDisponibles} h` : "—"} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Vue Délais vs standards ───
function VueDelais({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getCompetitivite.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const familles = (data.familles ?? []) as any[];
  if (familles.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Aucune livraison sur la période.</p>;

  return (
    <div className="space-y-2">
      {familles.map((f: any) => {
        const dansStd = f.dansStandard ?? 0;
        return (
          <div key={f.famille} className="rounded-lg border border-border bg-card px-4 py-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{f.libelle}</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{f.count} livrés · moyenne {f.delaiMoyenJours} j</span>
                {f.cibleJours != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${dansStd >= 80 ? "bg-success/15 text-success-foreground" : dansStd >= 50 ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>
                    {dansStd} % dans le standard ({f.cibleJours} j)
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${danger ? "bg-destructive/10" : "bg-muted/40"}`}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${danger ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
