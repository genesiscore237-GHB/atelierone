"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  FileText,
  Files,
  Fingerprint,
  History,
  IdCard,
  Loader2,
  LogOut,
  Pencil,
  Phone,
  StickyNote,
  UserRound,
  X,
  Banknote,
  Search,
  Activity,
} from "lucide-react";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { statutBadgeColor, statutLabel, typeLabel } from "~/lib/rh-labels";
import { EmployeeForm } from "./EmployeeForm";
import { AdvancesSection } from "./AdvancesSection";
import { SituationCycleVie } from "./SituationCycleVie";
import { toast } from "sonner";

const effetStatut = (s: string): string => {
  switch (s) {
    case "suspendu":
    case "archive":
      return "Accès compte coupé, prorata paie le cas échéant.";
    case "conge":
      return "Paie et soldes conservés, planning exclu.";
    default:
      return "Accès compte maintenu.";
  }
};

const motifSortieLabels: Record<string, string> = {
  demission: "Démission",
  licenciement: "Licenciement",
  fin_cdd: "Fin de CDD",
  retraite: "Retraite",
  rupture_conventionnelle: "Rupture conventionnelle",
  autre_vie_pro: "Autre motif de vie professionnelle",
};

const modePaieLabels: Record<string, string> = {
  mensuel: "Mensuel",
  horaire: "Horaire",
  journalier: "Journalier",
  commission: "Commission",
};

interface FicheRow {
  id: number;
  matricule: string | null;
  civilite: string | null;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  sexe: string | null;
  emailPersonnel: string | null;
  telephone: string | null;
  telephoneSecondaire: string | null;
  adresse: string | null;
  ville: string | null;
  contactUrgenceNom: string | null;
  contactUrgenceTelephone: string | null;
  typeEmploye: string;
  fonction: string;
  departmentId: number | null;
  departmentName: string | null;
  positionId: number | null;
  positionName: string | null;
  workCycleId: number | null;
  workCycleName: string | null;
  managerId: number | null;
  dateEmbauche: string | null;
  dateFinContrat: string | null;
  periodeEssaiFin: string | null;
  salaireBase: string | null;
  devise: string | null;
  modePaie: string;
  numCnss: string | null;
  niu: string | null;
  numCompteBancaire: string | null;
  banque: string | null;
  typePieceIdentite: string | null;
  numPieceIdentite: string | null;
  pieceExpireLe: string | null;
  diplome: string | null;
  langues: string | null;
  logiciels: string | null;
  pointsFort: string | null;
  axesAmelioration: string | null;
  notes: string | null;
  statut: string;
  photoUrl: string | null;
  dateSortie: string | null;
  motifSortie: string | null;
  detailMotifSortie: string | null;
  reembauchable: boolean | null;
  managerNom: string | null;
  positionHistory: Array<{
    id: number;
    positionId: number | null;
    positionName: string | null;
    departmentId: number | null;
    departmentName: string | null;
    startDate: string;
    endDate: string | null;
    reason: string | null;
  }>;
  salaryHistory: Array<{
    id: number;
    baseSalary: string | null;
    startDate: string;
    endDate: string | null;
    reason: string | null;
  }>;
  statusHistory: Array<{
    id: number;
    statut: string;
    startDate: string;
    endDate: string | null;
    reason: string | null;
  }>;
}

const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  if (isNaN(d.getTime())) return v;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function yearOf(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  if (isNaN(d.getTime())) return v.slice(0, 4);
  return String(d.getFullYear());
}

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00`);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function calcAnciennete(hire: string | null): string {
  if (!hire) return "—";
  const h = new Date(`${hire}T00:00:00`);
  if (isNaN(h.getTime())) return "—";
  const now = new Date();
  let y = now.getFullYear() - h.getFullYear();
  let m = now.getMonth() - h.getMonth();
  if (m < 0) { y--; m += 12; }
  if (y <= 0) return `${m} mois`;
  if (m === 0) return `${y} an${y > 1 ? "s" : ""}`;
  return `${y} an${y > 1 ? "s" : ""} ${m} mois`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <Icon size={14} /> {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-accent/5 px-6 py-12 text-center">
      <Icon className="mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type TimelineEvent = {
  key: string;
  date: string;
  kind: "statut" | "poste" | "salaire" | "avance" | "bulletin" | "presence";
  title: string;
  detail: string | null;
  reason: string | null;
  acteur: string | null;
};

const eventConfig: Record<TimelineEvent["kind"], { icon: React.ElementType; color: string; label: string }> = {
  statut: { icon: UserRound, color: "bg-primary/15 text-primary", label: "Statut" },
  poste: { icon: Fingerprint, color: "bg-accent text-foreground", label: "Poste" },
  salaire: { icon: CreditCard, color: "bg-warning/15 text-warning-foreground", label: "Salaire" },
  avance: { icon: Banknote, color: "bg-success/15 text-success-foreground", label: "Avance" },
  bulletin: { icon: FileText, color: "bg-primary/10 text-primary", label: "Bulletin" },
  presence: { icon: CalendarDays, color: "bg-destructive/10 text-destructive", label: "Présence" },
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      const y = yearOf(e.date);
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(e);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="space-y-6">
      {grouped.map(([year, items]) => (
        <div key={year}>
          <p className="mb-3 text-xs font-black tracking-widest text-muted-foreground">{year}</p>
          <ol className="relative ml-3 border-l border-border">
            {items.map((e) => {
              const cfg = eventConfig[e.kind];
              const Icon = cfg.icon;
              return (
                <li key={e.key} className="mb-4 ml-5 last:mb-0">
                  <span className={`absolute -left-[13px] flex size-6 items-center justify-center rounded-full ${cfg.color}`}>
                    <Icon size={12} />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">{e.title}</p>
                    <span className="text-[10px] font-bold text-muted-foreground">{fmtDate(e.date)}</span>
                    {e.acteur ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">par {e.acteur}</span>
                    ) : null}
                  </div>
                  {e.detail ? <p className="text-xs text-muted-foreground">{e.detail}</p> : null}
                  {e.reason ? <p className="mt-0.5 text-[11px] italic text-muted-foreground">Motif : {e.reason}</p> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

const HISTORIQUE_TYPES = ["statut", "poste", "salaire", "avance", "bulletin", "presence"] as const;
type HistoriqueType = (typeof HISTORIQUE_TYPES)[number];

function HistoriqueSection({ employeId }: { employeId: string }) {
  const { data, isLoading, error } = api.rh.getHistorique.useQuery({ employeeId: Number(employeId) });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<HistoriqueType | "tous">("tous");

  const events: TimelineEvent[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((e) => (typeFilter === "tous" || e.type === typeFilter))
      .filter((e) => {
        if (!q) return true;
        return [e.titre, e.detail ?? "", e.motif ?? "", e.acteur ?? ""].some((t) => t.toLowerCase().includes(q));
      })
      .map((e) => ({
        key: e.id,
        date: (e.date ? String(e.date).slice(0, 10) : ""),
        kind: e.type,
        title: e.titre,
        detail: e.detail,
        reason: e.motif,
        acteur: e.acteur,
      }));
  }, [data, search, typeFilter]);

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <History size={14} /> Parcours de l'employé
      </h3>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (titre, motif, acteur)..."
            className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as HistoriqueType | "tous")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="tous">Tous les types</option>
          {HISTORIQUE_TYPES.map((t) => (
            <option key={t} value={t}>{eventConfig[t].label}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger l'historique : {error.message}</p>
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="Aucun événement" hint="Les changements du parcours de l'employé apparaîtront ici." />
      ) : (
        <Timeline events={events} />
      )}
    </section>
  );
}

interface CongeBalance {
  id: number;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: number;
  acquiredDays: string;
  takenDays: string;
  adjustedDays: string;
  balance: string;
}

function CongesTab({ employeId }: { employeId: string }) {
  const year = new Date().getFullYear();
  const { data, isLoading, error } = api.rhLeave.getBalances.useQuery({ employeeId: Number(employeId), year });
  const rows = (data as unknown as CongeBalance[] | undefined) ?? [];

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <CalendarDays size={14} /> Soldes de congés — {year}
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger les soldes : {error.message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aucun solde" hint="Les soldes de congés de l'employé apparaîtront ici." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-background p-3">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{c.leaveTypeName}</p>
              <p className="mt-1 text-2xl font-black text-foreground">{c.balance}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {c.acquiredDays} acquis · {c.takenDays} pris
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface PresenceSummaryRow {
  id: number;
  employeeId: number;
  year: number;
  month: number;
  totalNormalMinutes: string | null;
  totalOvertimeMinutes: string | null;
  totalLateMinutes: string | null;
  totalTaskBonus: string | null;
  daysPresent: string | null;
  daysAbsent: string | null;
  daysOnLeave: string | null;
  locked: boolean;
}

function formatMinutes(min: string | number | null): string {
  const n = Number(min ?? 0);
  if (!n) return "0";
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}` : `${m} min`;
}

function PresenceSummary({ employeId }: { employeId: string }) {
  const now = new Date();
  const { data, isLoading, error } = api.rhPresence.listSummaries.useQuery({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const sum = (data as unknown as PresenceSummaryRow[] | undefined)?.find((s) => s.employeeId === Number(employeId));

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <Fingerprint size={14} /> Pointage du mois — {monthNames[now.getMonth()]}
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger le pointage : {error.message}</p>
      ) : !sum ? (
        <EmptyState icon={Fingerprint} title="Aucun pointage ce mois-ci" hint="Le résumé mensuel apparaîtra une fois les présences saisies." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Jours présents</p>
            <p className="mt-1 text-2xl font-black text-success-foreground">{sum.daysPresent ?? "0"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Absences</p>
            <p className="mt-1 text-2xl font-black text-destructive">{sum.daysAbsent ?? "0"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Congés</p>
            <p className="mt-1 text-2xl font-black text-foreground">{sum.daysOnLeave ?? "0"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Heures sup.</p>
            <p className="mt-1 text-2xl font-black text-foreground">{formatMinutes(sum.totalOvertimeMinutes)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Retard : {formatMinutes(sum.totalLateMinutes)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

interface AbsenceRow {
  id: number;
  typeAbsence: string;
  dateDebut: string;
  dateFin: string | null;
  dureeJours: number | null;
  motif: string | null;
  justifie: boolean | null;
  statut: string | null;
}

function AbsencesTab({ employeId }: { employeId: string }) {
  const { data, isLoading, error } = api.rh.listAbsences.useQuery({ employeId: Number(employeId) });
  const rows = (data as unknown as AbsenceRow[] | undefined) ?? [];

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <CalendarDays size={14} /> Absences
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger les absences : {error.message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aucune absence" hint="Les absences de l'employé apparaîtront ici." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                <th className="py-2 pr-3 text-left">Type</th>
                <th className="px-3 py-2 text-left">Du</th>
                <th className="px-3 py-2 text-left">Au</th>
                <th className="px-3 py-2 text-left">Jours</th>
                <th className="px-3 py-2 text-left">Motif</th>
                <th className="px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-sm font-medium text-foreground">{a.typeAbsence}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(a.dateDebut)}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(a.dateFin)}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{a.dureeJours ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{a.motif || "—"}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.justifie ? "bg-success/15 text-success-foreground" : "bg-warning/15 text-warning-foreground"}`}>
                      {a.justifie ? "Justifiée" : "Non justifiée"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DisciplineRecord {
  id: number;
  typeSanction: string;
  sanctionTypeName: string | null;
  severityLabel: string | null;
  motif: string | null;
  dateSanction: string;
  decision: string | null;
  appliquee: boolean | null;
}

interface DisciplineDossier {
  employe: { fullName: string };
  records: DisciplineRecord[];
  recidivism?: unknown;
}

function DisciplineTab({ employeId }: { employeId: string }) {
  const { data, isLoading, error } = api.rhDiscipline.getEmployeeDossier.useQuery({ employeId: Number(employeId) });
  const dossier = data as unknown as DisciplineDossier | undefined;
  const records = dossier?.records ?? [];

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <BadgeCheck size={14} /> Dossier disciplinaire
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger le dossier disciplinaire : {error.message}</p>
      ) : records.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Aucune sanction" hint="Le dossier disciplinaire de l'employé apparaîtra ici." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                <th className="py-2 pr-3 text-left">Date</th>
                <th className="px-3 py-2 text-left">Sanction</th>
                <th className="px-3 py-2 text-left">Sévérité</th>
                <th className="px-3 py-2 text-left">Motif</th>
                <th className="px-3 py-2 text-left">État</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-sm">{fmtDate(r.dateSanction)}</td>
                  <td className="px-3 py-2 text-sm font-medium text-foreground">{r.sanctionTypeName ?? r.typeSanction}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{r.severityLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{r.motif || "—"}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.appliquee ? "bg-destructive/15 text-destructive" : "bg-muted/15 text-muted-foreground"}`}>
                      {r.appliquee ? "Appliquée" : "Notifiée"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const TAB_IDS = ["identite", "contrat", "cycleVie", "paie", "avances", "presence", "competences", "historique", "documents", "notes"] as const;
  const [tab, setTab] = useState<string>(() => {
    const t = searchParams.get("tab");
    return t && (TAB_IDS as readonly string[]).includes(t) ? t : "identite";
  });
  const [sortieMotif, setSortieMotif] = useState("demission");
  const [sortieDate, setSortieDate] = useState(new Date().toISOString().split("T")[0]);
  const [sortieDetail, setSortieDetail] = useState("");
  const [sortieOpen, setSortieOpen] = useState(false);
  const [sortieReembauchable, setSortieReembauchable] = useState(true);
  const [sortieEnCours, setSortieEnCours] = useState(false);
  const [statutOpen, setStatutOpen] = useState(false);
  const [statutCible, setStatutCible] = useState("");
  const [reembaucheOpen, setReembaucheOpen] = useState(false);
  const [reembaucheDate, setReembaucheDate] = useState(new Date().toISOString().split("T")[0]);
  const [reembaucheMotif, setReembaucheMotif] = useState("");
  const utils = api.useUtils();
  const { data, isLoading, error, refetch } = api.rh.getFiche.useQuery({ id: employeeId });
  const { hasPermission } = usePermissions();

  const sortir = api.rh.sortir.useMutation({
    onSuccess: () => {
      setSortieOpen(false);
      toast.success("Employé sorti", { description: "Le dossier reste consultable." });
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const changerStatut = api.rh.update.useMutation({
    onSuccess: () => {
      setStatutOpen(false);
      toast.success("Statut mis à jour", { description: effetStatut(statutCible) });
      void refetch();
      utils.rh.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reembaucher = api.rh.reembaucher.useMutation({
    onSuccess: () => {
      setReembaucheOpen(false);
      toast.success("Employé réembauché", { description: "Statut repassé à actif." });
      void refetch();
      utils.rh.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="animate-in fade-in duration-500 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-16 rounded-full bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-muted animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
        <div className="h-9 w-full max-w-md rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((s) => <div key={s} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data && !error) {
    return <div className="p-6 text-sm text-muted-foreground">Chargement de la fiche…</div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        {error ? (
          <>
            <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
            <p>{error.message}</p>
          </>
        ) : (
          <p>Employé introuvable.</p>
        )}
        <Link href="/dashboard/rh/employes" className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-accent/30">
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Retour à la liste
        </Link>
      </div>
    );
  }

  const d = data as unknown as FicheRow;
  const initials = `${d.prenom?.charAt(0) ?? ""}${d.nom?.charAt(0) ?? ""}`.toUpperCase();
  const age = calcAge(d.dateNaissance);
  const dev = d.devise || "XOF";
  const canPaie = hasPermission("rh.salaire.consulter");

  const saved = () => {
    setEditOpen(false);
    utils.rh.getFiche.invalidate();
    utils.rh.list.invalidate();
    refetch();
  };

  const confirmerSortie = () => {
    if (!employeeId) return;
    if (!sortieDate) {
      toast.error("Date de sortie requise");
      return;
    }
    sortir.mutate({
      id: employeeId,
      dateSortie: sortieDate,
      motifSortie: sortieMotif as "demission" | "licenciement" | "fin_cdd" | "retraite" | "rupture_conventionnelle" | "autre_vie_pro",
      detailMotif: sortieDetail || undefined,
      reembauchable: sortieReembauchable,
    });
  };

  const tabs: Array<{ id: string; label: string; icon: React.ElementType }> = [
    { id: "identite", label: "Identité", icon: UserRound },
    { id: "contrat", label: "Contrat", icon: FileText },
    { id: "cycleVie", label: "Cycle de vie", icon: Activity },
    ...(canPaie ? [{ id: "paie", label: "Paie", icon: CreditCard }] : []),
    ...(canPaie ? [{ id: "avances", label: "Avances", icon: Banknote }] : []),
    { id: "presence", label: "Présence", icon: CalendarDays },
    { id: "competences", label: "Compétences", icon: BadgeCheck },
    { id: "historique", label: "Historique", icon: History },
    { id: "documents", label: "Documents", icon: Files },
    { id: "notes", label: "Notes", icon: StickyNote },
  ];

  return (
    <div className="animate-in fade-in duration-500 p-6">
      {/* En-tête sticky */}
      <div className="sticky -top-6 z-10 -mx-6 mb-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <Link href="/dashboard/rh/employes" className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} /> Retour à la liste des employés
            </Link>
            <div className="flex items-center gap-4">
              {d.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.photoUrl} alt={`${d.prenom} ${d.nom}`} className="size-16 shrink-0 rounded-full border border-border object-cover" />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-xl font-black text-primary">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black text-foreground">
                  {d.civilite ? `${d.civilite} ` : ""}{d.prenom} {d.nom}
                </h1>
                <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground">
                  {d.fonction || d.positionName || "—"}
                  {d.departmentName ? ` · ${d.departmentName}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">{d.matricule}</span>
                  {d.statut !== "sorti" && hasPermission("rh.employe.modifier") ? (
                    <button
                      onClick={() => {
                        setStatutCible("");
                        setStatutOpen(true);
                      }}
                      title="Changer le statut"
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-transform hover:scale-105 ${statutBadgeColor(d.statut)}`}
                    >
                      {statutLabel(d.statut)}
                    </button>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statutBadgeColor(d.statut)}`}>
                      {statutLabel(d.statut)}
                    </span>
                  )}
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {typeLabel(d.typeEmploye)}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {d.dateEmbauche ? `Depuis le ${fmtDate(d.dateEmbauche)} · ${calcAnciennete(d.dateEmbauche)}` : "Date d'embauche inconnue"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.statut === "sorti" && d.reembauchable !== false && hasPermission("rh.employe.modifier") && (
              <button
                onClick={() => setReembaucheOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-bold text-success-foreground transition-colors hover:bg-success/20"
              >
                <UserRound size={14} /> Réembaucher
              </button>
            )}
            {d.statut !== "sorti" && hasPermission("rh.employe.modifier") && (
              <button
                onClick={() => setSortieOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/15"
              >
                <LogOut size={14} /> Sortir
              </button>
            )}
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
            >
              <Pencil size={14} /> Modifier
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div role="tablist" aria-label="Sections de la fiche employé" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id);
                  router.replace(`?tab=${t.id}`, { scroll: false });
                }}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions rapides */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { href: `/dashboard/rh/presences?employeId=${d.id}`, label: "Présences", icon: CalendarDays },
          { href: `/dashboard/rh/absences?employeId=${d.id}`, label: "Absences", icon: CalendarDays },
          { href: `/dashboard/rh/pointage-en-direct?employeId=${d.id}`, label: "Pointage", icon: Fingerprint },
          { href: `/dashboard/rh/paie?employeId=${d.id}`, label: "Paie", icon: CreditCard },
          { href: `/dashboard/rh/situation?employeId=${d.id}`, label: "Situation", icon: Activity },
          { href: `/dashboard/rh/competences?employeId=${d.id}`, label: "Compétences", icon: BadgeCheck },
          { href: `/dashboard/rh/evaluations?employeId=${d.id}`, label: "Évaluations", icon: BadgeCheck },
          { href: `/dashboard/rh/sanctions?employeId=${d.id}`, label: "Discipline", icon: AlertTriangle },
          { href: `/dashboard/rh/contrats?employeId=${d.id}`, label: "Contrats", icon: FileText },
          { href: `/dashboard/rh/documents?employeId=${d.id}`, label: "Documents", icon: Files },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-accent/5 px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground">
              <Icon size={14} /> {q.label}
            </Link>
          );
        })}
      </div>

      {/* Panneaux */}
      <div role="tabpanel" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tab === "identite" && (
          <>
            <Section title="Identité" icon={UserRound}>
              <Field label="Prénom" value={d.prenom} />
              <Field label="Nom" value={d.nom} />
              <Field label="Civilité" value={d.civilite} />
              <Field label="Sexe" value={d.sexe === "M" ? "Masculin" : d.sexe === "F" ? "Féminin" : null} />
              <Field label="Né(e) le" value={d.dateNaissance ? `${fmtDate(d.dateNaissance)}${age ? ` (${age} ans)` : ""}` : null} />
              <Field label="Lieu de naissance" value={d.lieuNaissance} />
            </Section>
            <Section title="Contact & urgence" icon={Phone}>
              <Field label="Email personnel" value={d.emailPersonnel} />
              <Field label="Téléphone" value={d.telephone} />
              <Field label="Téléphone secondaire" value={d.telephoneSecondaire} />
              <Field label="Adresse" value={d.adresse} />
              <Field label="Ville" value={d.ville} />
              <Field label="Contact urgence — nom" value={d.contactUrgenceNom} />
              <Field label="Contact urgence — téléphone" value={d.contactUrgenceTelephone} />
            </Section>
            <Section title="Identifiants internes" icon={IdCard}>
              <Field label="Matricule" value={d.matricule} />
              <Field label="N° CNSS" value={d.numCnss} />
              <Field label="N° NIU" value={d.niu} />
              <Field label="Pièce d'identité" value={d.typePieceIdentite ? `${d.typePieceIdentite} — ${d.numPieceIdentite}` : null} />
              <Field label="Pièce expire le" value={d.pieceExpireLe ? fmtDate(d.pieceExpireLe) : null} />
              <Field label="Diplôme / Qualification" value={d.diplome} />
            </Section>
          </>
        )}

        {tab === "contrat" && (
          <>
            <Section title="Contrat" icon={FileText}>
              <Field label="Type de contrat" value={typeLabel(d.typeEmploye)} />
              <Field label="Date d'embauche" value={d.dateEmbauche ? fmtDate(d.dateEmbauche) : null} />
              <Field label="Fin de contrat" value={d.dateFinContrat ? fmtDate(d.dateFinContrat) : null} />
              <Field label="Fin période d'essai" value={d.periodeEssaiFin ? fmtDate(d.periodeEssaiFin) : null} />
            </Section>
            <Section title="Situation d'emploi" icon={Fingerprint}>
              <Field label="Fonction" value={d.fonction} />
              <Field label="Poste" value={d.positionName} />
              <Field label="Département / Service" value={d.departmentName} />
              <Field label="Cycle de travail" value={d.workCycleName} />
              <Field label="Supérieur hiérarchique" value={d.managerNom} />
              <Field label="Ancienneté" value={calcAnciennete(d.dateEmbauche)} />
            </Section>
            <ContratsTab employeId={String(d.id)} canPaie={canPaie} />
          </>
        )}

        {tab === "cycleVie" && (
          <div className="md:col-span-2">
            <SituationCycleVie employeeId={Number(d.id)} onChanged={refetch} />
          </div>
        )}

        {tab === "paie" && canPaie && (
          <>
            <Section title="Rémunération" icon={CreditCard}>
              <Field label="Salaire de base" value={d.salaireBase ? `${d.salaireBase} ${dev}` : null} />
              <Field label="Devise" value={dev} />
              <Field label="Mode de paie" value={modePaieLabels[d.modePaie] ?? d.modePaie} />
              <Field label="N° compte bancaire" value={d.numCompteBancaire} />
              <Field label="Banque" value={d.banque} />
            </Section>
            <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
              <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
                <CreditCard size={14} /> Historique des salaires
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                      <th className="py-2 pr-3 text-left">Du</th>
                      <th className="px-3 py-2 text-left">Au</th>
                      <th className="px-3 py-2 text-left">Salaire de base</th>
                      <th className="px-3 py-2 text-left">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.salaryHistory.length === 0 ? (
                      <tr><td colSpan={4} className="py-4 text-center text-sm text-muted-foreground">Aucun historique de salaire.</td></tr>
                    ) : d.salaryHistory.map((s) => (
                      <tr key={s.id} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-sm">{fmtDate(s.startDate)}</td>
                        <td className="px-3 py-2 text-sm">{fmtDate(s.endDate)}</td>
                        <td className="px-3 py-2 text-sm font-semibold text-foreground">{s.baseSalary ? `${s.baseSalary} ${dev}` : "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{s.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "avances" && canPaie && (
          <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
              <Banknote size={14} /> Avances sur salaire
            </h3>
            <AdvancesSection employeId={String(d.id)} devise={dev} canModifier={hasPermission("rh.paie.modifier")} />
          </section>
        )}

        {tab === "presence" && (
          <>
            <CongesTab employeId={String(d.id)} />
            <AbsencesTab employeId={String(d.id)} />
            <PresenceSummary employeId={String(d.id)} />
          </>
        )}

        {tab === "competences" && (
          <Section title="Compétences & profil" icon={BadgeCheck}>
            <Field label="Langues" value={d.langues} />
            <Field label="Logiciels maîtrisés" value={d.logiciels} />
            <Field label="Points forts" value={d.pointsFort} />
            <Field label="Axes d'amélioration" value={d.axesAmelioration} />
            <Field label="Diplôme / Qualification" value={d.diplome} />
          </Section>
        )}

        {tab === "historique" && (
          <>
            <HistoriqueSection employeId={String(d.id)} />
            <DisciplineTab employeId={String(d.id)} />
          </>
        )}

        {tab === "documents" && (
          <DocumentsTab employeId={String(d.id)} />
        )}

        {tab === "notes" && (
          <Section title="Notes internes" icon={StickyNote}>
            <div className="col-span-2 sm:col-span-3">
              <p className="text-sm whitespace-pre-wrap text-foreground">{d.notes || "—"}</p>
            </div>
          </Section>
        )}
      </div>

      {sortieOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-foreground">Sortie de l'employé</h2>
              <button onClick={() => setSortieOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Motif de sortie *</label>
                <select
                  value={sortieMotif}
                  onChange={(e) => setSortieMotif(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="demission">Démission</option>
                  <option value="licenciement">Licenciement</option>
                  <option value="fin_cdd">Fin de CDD</option>
                  <option value="retraite">Retraite</option>
                  <option value="rupture_conventionnelle">Rupture conventionnelle</option>
                  <option value="autre_vie_pro">Autre motif de départ</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Date de sortie *</label>
                <input
                  type="date"
                  value={sortieDate}
                  onChange={(e) => setSortieDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Détail (optionnel)</label>
                <textarea
                  value={sortieDetail}
                  onChange={(e) => setSortieDetail(e.target.value)}
                  rows={3}
                  placeholder="Précisions sur la sortie…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  defaultChecked
                  onChange={(e) => setSortieReembauchable(e.target.checked)}
                  className="accent-primary"
                />
                Réembauchable
              </label>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSortieOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSortie}
                  disabled={sortieEnCours}
                  className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-white hover:bg-destructive/90 disabled:opacity-50"
                >
                  {sortieEnCours ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                  Valider la sortie
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-foreground">Changer le statut</h2>
              <button onClick={() => setStatutOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Statut actuel : <span className="font-bold text-foreground">{statutLabel(d.statut)}</span>
              </p>
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Nouveau statut *</label>
                <select
                  value={statutCible}
                  onChange={(e) => setStatutCible(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>Choisir…</option>
                  {(["actif", "archive"] as const).map((s) => (
                    <option key={s} value={s} disabled={s === d.statut}>{statutLabel(s)}</option>
                  ))}
                </select>
              </div>
              {statutCible && (
                <div className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
                  Effet : <span className="font-semibold text-foreground">{effetStatut(statutCible)}</span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStatutOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30"
                >
                  Annuler
                </button>
                <button
                  onClick={() => statutCible && changerStatut.mutate({ id: employeeId, statut: statutCible as "actif" | "conge" | "suspendu" | "archive" })}
                  disabled={!statutCible || changerStatut.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {changerStatut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reembaucheOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-foreground">Réembaucher l'employé</h2>
              <button onClick={() => setReembaucheOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Sorti le {fmtDate(d.dateSortie)}{d.detailMotifSortie ? ` · ${d.detailMotifSortie}` : ""}.
              </p>
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Date de réembauche *</label>
                <input
                  type="date"
                  value={reembaucheDate}
                  onChange={(e) => setReembaucheDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Motif (optionnel)</label>
                <textarea
                  value={reembaucheMotif}
                  onChange={(e) => setReembaucheMotif(e.target.value)}
                  rows={3}
                  placeholder="Rappel du contexte de la réembauche…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setReembaucheOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (!reembaucheDate) {
                      toast.error("Date de réembauche requise");
                      return;
                    }
                    reembaucher.mutate({ id: employeeId, dateReembauche: reembaucheDate, motif: reembaucheMotif.trim() || undefined });
                  }}
                  disabled={!reembaucheDate || reembaucher.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-xs font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
                >
                  {reembaucher.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Valider la réembauche
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EmployeeForm
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        employeeId={employeeId}
        onSaved={saved}
      />
    </div>
  );
}

interface ContratRow {
  id: number;
  typeContrat: string;
  dateDebut: string;
  dateFin: string | null;
  dureeMois: number | null;
  finPeriodeEssai: string | null;
  salaireBase: string | null;
  poste: string | null;
  statut: string | null;
  renouvellement: boolean | null;
}

const contratTypeLabels: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  contrat_professionnel: "Contrat pro",
};

function ContratsTab({ employeId, canPaie }: { employeId: string; canPaie: boolean }) {
  const { data, isLoading, error } = api.rh.listContrats.useQuery({ employeId: Number(employeId) });
  const rows = (data as unknown as ContratRow[] | undefined) ?? [];

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
        <FileText size={14} /> Contrats
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Impossible de charger les contrats : {error.message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun contrat" hint="Les contrats signés de l'employé apparaîtront ici." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                <th className="py-2 pr-3 text-left">Type</th>
                <th className="px-3 py-2 text-left">Début</th>
                <th className="px-3 py-2 text-left">Fin</th>
                <th className="px-3 py-2 text-left">Poste</th>
                {canPaie && <th className="px-3 py-2 text-left">Salaire</th>}
                <th className="px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-sm font-medium text-foreground">{contratTypeLabels[c.typeContrat] ?? c.typeContrat}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(c.dateDebut)}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(c.dateFin)}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{c.poste || "—"}</td>
                  {canPaie && <td className="px-3 py-2 text-sm text-muted-foreground">{c.salaireBase ? `${c.salaireBase}` : "—"}</td>}
                  <td className="px-3 py-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.statut === "actif" ? "bg-success/15 text-success-foreground" : "bg-muted/15 text-muted-foreground"}`}>
                      {c.statut === "actif" ? "Actif" : (c.statut ?? "—")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DocumentRow {
  id: number;
  typeDocument: string;
  titre: string | null;
  dateEmission: string | null;
  dateExpiration: string | null;
  statut: string | null;
}

const docTypeLabels: Record<string, string> = {
  CNI: "CNI",
  passeport: "Passeport",
  diplome: "Diplôme",
  contrat: "Contrat",
  cnss: "CNSS",
  etre_naissance: "Extrait de naissance",
  casier: "Casier judiciaire",
  photo: "Photo",
  autre: "Autre",
};

function isExpired(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

function DocumentsTab({ employeId }: { employeId: string }) {
  const { data, isLoading, error } = api.rh.listDocuments.useQuery({ employeId: Number(employeId) });
  const rows = (data as unknown as DocumentRow[] | undefined) ?? [];
  const expirations = rows.filter((r) => isExpired(r.dateExpiration));

  return (
    <>
      {expirations.length > 0 && (
        <div className="md:col-span-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {expirations.length} document{expirations.length > 1 ? "s" : ""} expiré{expirations.length > 1 ? "s" : ""} : à renouveler.
        </div>
      )}
      <section className="rounded-xl border border-border bg-accent/5 p-4 md:col-span-2">
        <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
          <Files size={14} /> Documents
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((s) => <div key={s} className="h-10 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Impossible de charger les documents : {error.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Files} title="Aucun document" hint="Les pièces jointes (contrat signé, CNSS, diplômes) seront rattachables ici." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="py-2 pr-3 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Titre</th>
                  <th className="px-3 py-2 text-left">Émis le</th>
                  <th className="px-3 py-2 text-left">Expire le</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => {
                  const expired = isExpired(doc.dateExpiration);
                  return (
                    <tr key={doc.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-sm font-medium text-foreground">{docTypeLabels[doc.typeDocument] ?? doc.typeDocument}</td>
                      <td className="px-3 py-2 text-sm">{doc.titre || "—"}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{fmtDate(doc.dateEmission)}</td>
                      <td className={`px-3 py-2 text-sm ${expired ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                        {fmtDate(doc.dateExpiration)}{expired ? " (expiré)" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
