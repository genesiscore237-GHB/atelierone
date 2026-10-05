"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { CalendarClock, FileDown, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  exportCsv,
  exportPdf,
  exportXlsx,
  fmtDateFR,
  fmtHeures,
  fmtMontant,
  reportMeta,
  slugPeriode,
  type ReportCell,
} from "./report-exports";

/**
 * R9 — Rapport « Historique » : état réel à une date donnée (R7).
 * Consomme exclusivement `rhHistory.etatDate` : pas de lecture de l'état courant,
 * pas de recalcul — la source de vérité historique R7 répond à la question
 * « quelle était la situation à cette date ? ».
 */
export function RapportHistorique() {
  const [employeId, setEmployeId] = useState<number | null>(null);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etat, setEtat] = useState<any | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const employees = api.rh.list.useQuery({ limit: 200 });
  const utils = api.useUtils();

  const afficher = async () => {
    if (!employeId) {
      toast.error("Sélectionnez un employé.");
      return;
    }
    if (!asOf) {
      toast.error("Choisissez une date d'effet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await utils.rhHistory.etatDate.fetch({ employeeId: employeId, date: asOf });
      setEtat(res);
      setGeneratedAt(new Date().toISOString().slice(0, 10));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const emp = employees.data?.employees.find((e) => e.id === employeId) as
    | { id: number; nom: string; prenom: string; matricule: string }
    | undefined;

  const meta = reportMeta(
    emp ? `État de ${emp.prenom} ${emp.nom} (${emp.matricule})` : "État historique",
    asOf,
    asOf
  );

  const lines: Array<{ label: string; value: string }> = useMemo(() => {
    if (!etat) return [];
    const g = (etat.agregats ?? {}) as Record<string, unknown>;
    const out: Array<{ label: string; value: string }> = [];
    out.push({ label: "Date d'effet", value: fmtDateFR(etat.date) });
    out.push({ label: "Situation", value: String(etat.etat ?? "—") });
    out.push({ label: "Aujourd'hui en poste", value: etat.emploiActif ? "Oui" : "Non" });
    out.push({ label: "Statut", value: String(etat.statut ?? "—") });
    out.push({ label: "Source du statut", value: String(etat.sourceStatut ?? "—") });
    if (etat.dateSortieEffective) out.push({ label: "Sortie effective", value: fmtDateFR(etat.dateSortieEffective) });
    if (etat.ancienneteJours !== null && etat.ancienneteJours !== undefined) {
      out.push({ label: "Ancienneté (jours)", value: String(etat.ancienneteJours) });
    }
    const poste = etat.poste;
    if (poste) {
      out.push({ label: "Poste", value: String(poste.poste ?? poste.position ?? "—") });
      out.push({ label: "Département", value: String(poste.departement ?? "—") });
      if (poste.dateEffet) out.push({ label: "Poste depuis", value: fmtDateFR(poste.dateEffet) });
    }
    const salaire = etat.salaire;
    if (salaire && (salaire.baseSalary !== null && salaire.baseSalary !== undefined)) {
      out.push({ label: "Salaire base", value: fmtMontant(salaire.baseSalary) });
    }
    if (salaire && salaire.modePaie) out.push({ label: "Mode de paie", value: String(salaire.modePaie) });
    if (salaire && salaire.forfaitHebdomadaire !== null && salaire.forfaitHebdomadaire !== undefined) {
      out.push({ label: "Forfait hebdo", value: fmtMontant(salaire.forfaitHebdomadaire) });
    }
    if (!etat.salaire) out.push({ label: "Salaire base", value: "— (masqué ou non renseigné)" });
    const contrat = etat.contrat;
    if (contrat) {
      out.push({ label: "Type de contrat", value: String(contrat.typeContrat ?? "—") });
      out.push({ label: "Statut contrat", value: String(contrat.statut ?? "—") });
      out.push({ label: "Version contrat", value: String(contrat.version ?? "—") });
      if (contrat.dureeMois) out.push({ label: "Durée (mois)", value: String(contrat.dureeMois) });
      if (contrat.dateDebut) out.push({ label: "Début contrat", value: fmtDateFR(contrat.dateDebut) });
      if (contrat.dateFin) out.push({ label: "Fin contrat", value: fmtDateFR(contrat.dateFin) });
    }
    const situations = etat.situationsActives ?? [];
    if (situations.length) {
      const libs = situations.map((s) => String(s.type ?? s.libelle ?? s.statut ?? "situation")).join(" · ");
      out.push({ label: "Situations actives", value: libs });
    }
    const pm = g.presenceMois as { locked?: boolean; daysPresent?: number; daysAbsent?: number; totalNormalMinutes?: number; totalOvertimeMinutes?: number } | null;
    if (pm) {
      out.push({ label: "Présences mois (verrouillé)", value: pm.locked ? "Oui" : "Non" });
      out.push({ label: "Jours présents (mois)", value: String(pm.daysPresent ?? 0) });
      out.push({ label: "Jours absents (mois)", value: String(pm.daysAbsent ?? 0) });
      out.push({ label: "Heures normales", value: fmtHeures(pm.totalNormalMinutes ?? 0) });
      out.push({ label: "Heures sup.", value: fmtHeures(pm.totalOvertimeMinutes ?? 0) });
    }
    const db = g.dernierBulletin as
      | { periodStart?: string; periodEnd?: string; status?: string; netPay?: number | null; versionUtilisee?: number | null }
      | null;
    if (db) {
      out.push({ label: "Dernier bulletin", value: `${fmtDateFR(db.periodStart)} → ${fmtDateFR(db.periodEnd)} (${db.status ?? "—"})` });
      out.push({ label: "Net (bulletin)", value: db.netPay === null || db.netPay === undefined ? "—" : fmtMontant(db.netPay) });
      out.push({ label: "Version snapshot", value: String(db.versionUtilisee ?? "—") });
    }
    const av = g.avances as Array<{ reference?: string; montant?: number; soldeRestant?: number; statut?: string }> | null;
    if (av?.length) {
      av.forEach((a) =>
        out.push({ label: `Avance ${a.reference ?? ""}`, value: `${fmtMontant(a.montant ?? 0)} · reste ${fmtMontant(a.soldeRestant ?? 0)} · ${a.statut ?? "—"}` })
      );
    }
    const cong = g.soldeConges as Array<{ leaveTypeId?: number; balance?: number }> | null;
    if (cong?.length) {
      cong.forEach((c) => out.push({ label: `Solde congé #${c.leaveTypeId}`, value: String(c.balance ?? 0) }));
    }
    const san = g.sanctions as Array<{ typeSanction?: string; motif?: string; dateDebutEffet?: string; dateFinEffet?: string }> | null;
    if (san?.length) {
      san.forEach((s) =>
        out.push({
          label: `Sanction ${s.typeSanction ?? "—"}`,
          value: `${fmtDateFR(s.dateDebutEffet)} → ${s.dateFinEffet ? fmtDateFR(s.dateFinEffet) : "…"} · ${s.motif ?? "—"}`,
        })
      );
    }
    return out;
  }, [etat]);

  const table = (): { headers: string[]; rows: ReportCell[][] } => ({
    headers: ["Élément", "Valeur"],
    rows: lines.map((l) => [l.label, l.value]),
  });

  const doCsv = () => exportCsv(`GPJ_RH_Historique_${slugPeriode(asOf, asOf)}.csv`, table());
  const doXlsx = async () => exportXlsx(`GPJ_RH_Historique_${slugPeriode(asOf, asOf)}.xlsx`, table());
  const doPdf = async () =>
    exportPdf(`GPJ_RH_Historique_${slugPeriode(asOf, asOf)}.pdf`, { ...meta, periodLine: `Date d'effet : ${fmtDateFR(asOf)} · ${lines.length} éléments` }, table());

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          #rapports-preview table thead { display: table-header-group; }
          #rapports-preview tr { break-inside: avoid; }
        }
      `}</style>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Employé</label>
            <select
              value={employeId ?? ""}
              onChange={(e) => setEmployeId(e.target.value ? Number(e.target.value) : null)}
              className="h-10 min-w-64 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="">— Choisir un employé —</option>
              {(employees.data?.employees ?? []).map((e) => (
                <option key={e.id} value={e.id} className="bg-background">
                  {e.matricule} · {e.prenom} {e.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Date d&apos;effet</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={afficher}
            disabled={loading}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
            {loading ? "Lecture…" : "Afficher l'état"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          État reconstruit à partir de l&apos;historique R7 (segments salaire/contrat, statuts, avances, congés, sanctions, dernière paie) — les dates d&apos;effet sont respectées.
        </p>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      {etat && (
        <div id="rapports-preview" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">{meta.title}</h2>
              <p className="text-xs text-muted-foreground">{meta.periodLine}</p>
              <p className="text-xs text-muted-foreground">{meta.generatedLine}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent">
                <Printer size={14} /> Imprimer
              </button>
              <button onClick={doPdf} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent">
                <FileText size={14} /> PDF
              </button>
              <button onClick={doXlsx} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={doCsv} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent">
                <FileDown size={14} /> CSV
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
              Aucune information connue pour cet employé à cette date.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse bg-card text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground">Élément</th>
                    <th className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold text-muted-foreground">{l.label}</td>
                      <td className="px-3 py-1.5 text-xs text-foreground">{l.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}