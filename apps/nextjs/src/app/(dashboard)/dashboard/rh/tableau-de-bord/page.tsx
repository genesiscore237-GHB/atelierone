"use client";

import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Users,
  UserCheck,
  CalendarOff,
  Wallet,
  FileSignature,
  Gavel,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount));
}

export default function RHDashboard() {
  const { data: employes, isLoading } = api.rh.list.useQuery({ limit: 100 });
  const { data: absences, isLoading: absencesLoading } = api.rh.listAbsences.useQuery();
  const { data: contrats, isLoading: contratsLoading } = api.rh.listContrats.useQuery();
  const { data: sanctions, isLoading: sanctionsLoading } = api.rh.listSanctions.useQuery();

  const effectif = employes?.total ?? 0;
  const actifs = employes?.employees.filter((e) => e.statut === "actif").length ?? 0;
  const enConge = employes?.employees.filter((e) => e.statut === "conge").length ?? 0;
  const masseSalariale =
    employes?.employees.reduce((sum, e) => sum + Number(e.salaireBase ?? 0), 0) ?? 0;

  const absencesEnAttente = (absences ?? []).filter((a) => a.statut === "en_attente").length;
  const derniereAbsences = (absences ?? []).slice(0, 6);

  const contratsExpirants = (contrats ?? [])
    .filter((c) => c.dateFin && new Date(c.dateFin).getTime() >= Date.now())
    .sort(
      (a, b) =>
        new Date(a.dateFin as string).getTime() - new Date(b.dateFin as string).getTime()
    )
    .slice(0, 5);

  const kpis = [
    { label: "Effectif total", value: isLoading ? "-" : effectif, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Employés actifs", value: isLoading ? "-" : actifs, icon: UserCheck, color: "text-success-foreground", bg: "bg-success/10" },
    { label: "En congé", value: isLoading ? "-" : enConge, icon: CalendarOff, color: "text-warning-foreground", bg: "bg-warning/10" },
    { label: "Masse salariale", value: isLoading ? "-" : `${formatFCFA(masseSalariale)} F`, icon: Wallet, color: "text-info-foreground", bg: "bg-info/10" },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-black tracking-tight text-foreground">Tableau de bord RH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Effectifs, présence, alertes et masse salariale
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <motion.div
            key={kpi.label}
            variants={item}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-lg ${kpi.bg} ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Absences récentes */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Absences récentes
            </h2>
            <Link href="/dashboard/rh/absences" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Voir tout <ArrowRight size={12} />
            </Link>
          </div>
          {absencesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : derniereAbsences.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune absence enregistrée</p>
          ) : (
            <div className="space-y-2">
              {derniereAbsences.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        a.statut === "valide"
                          ? "bg-success"
                          : a.statut === "rejete"
                            ? "bg-destructive"
                            : "bg-warning"
                      }`}
                    />
                    <p className="truncate text-sm text-foreground/80">
                      {a.employePrenom} {a.employeNom}
                    </p>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      · {a.typeAbsence}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.dateDebut).toLocaleDateString("fr-FR")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        a.statut === "valide"
                          ? "bg-success/10 text-success-foreground"
                          : a.statut === "rejete"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning-foreground"
                      }`}
                    >
                      {a.statut ?? "en_attente"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alertes */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <AlertTriangle size={16} className="text-warning-foreground" />
              Alertes
            </h2>
            <div className="space-y-2">
              {sanctionsLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-foreground/80">
                      <Gavel size={14} className="text-destructive" />
                      Sanctions enregistrées
                    </span>
                    <span className="text-sm font-bold">{sanctions?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-foreground/80">
                      <CalendarOff size={14} className="text-warning-foreground" />
                      Absences en attente
                    </span>
                    <span className="text-sm font-bold">{absencesEnAttente}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contrats expirants */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <FileSignature size={16} className="text-primary" />
                Contrats expirants
              </h2>
              <Link href="/dashboard/rh/contrats" className="text-xs text-primary hover:underline">
                Tous
              </Link>
            </div>
            {contratsLoading ? (
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            ) : contratsExpirants.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun contrat proche de l&apos;échéance
              </p>
            ) : (
              <div className="space-y-2">
                {contratsExpirants.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <p className="truncate text-sm text-foreground/80">{c.typeContrat}</p>
                    <span className="shrink-0 text-xs font-semibold text-warning-foreground">
                      {new Date(c.dateFin as string).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
