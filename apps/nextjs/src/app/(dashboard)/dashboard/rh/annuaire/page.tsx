"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Download, Phone, Mail, Printer, Search, Users } from "lucide-react";
import { statutLabel } from "~/lib/rh-labels";
import { usePermissions } from "~/hooks/usePermissions";
import { downloadCsv } from "../_components/csv-download";
import { PaginationBar } from "../_components/ClientPagination";

/** RH — Annuaire interne (specs MVP 09_Contacts) : généré depuis les employés actifs. */
export default function AnnuairePage() {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;
  const { hasPermission } = usePermissions();

  const { data: departments } = api.rh.listDepartments.useQuery();
  const { data, isLoading, isError, refetch } = api.rh.list.useQuery({
    page,
    limit,
    search: search || undefined,
    exclureArchives: true,
    departmentId: dept ? Number(dept) : undefined,
  });
  const canExport = hasPermission("rh.employe.consulter");
  const exportEmployes = api.rhDashboard.exportEmployes.useQuery(
    {
      search: search || undefined,
      departmentId: dept ? dept : undefined,
      exclureArchives: true,
    },
    { enabled: false }
  );

  useEffect(() => { setPage(1); }, [search, dept]);

  const emps = (data?.employees ?? []) as unknown as Array<{
    id: number; matricule: string; nom: string; prenom: string; fonction: string;
    telephone: string | null; emailPersonnel: string | null; statut: string | null;
    departmentId: number | null; departmentName: string | null;
  }>;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const initials = (prenom: string, nom: string) => `${(prenom?.[0] ?? "").toUpperCase()}${(nom?.[0] ?? "").toUpperCase()}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Annuaire interne</h1>
        <p className="mt-1 text-sm text-muted-foreground">Contacts automatiques — générés depuis les fiches employés actives (téléphone, email, département).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, prénom, matricule)…"
            className="h-10 w-72 rounded-lg border border-border bg-accent/30 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous les départements</option>
          {(departments ?? []).map((d) => <option key={d.id} value={d.id} className="bg-background">{d.name}</option>)}
        </select>
        {canExport && (
          <button
            onClick={async () => {
              if (!exportEmployes.data) await exportEmployes.refetch();
              downloadCsv(exportEmployes.data, "annuaire.csv");
            }}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-accent"
          >
            <Download size={15} /> Exporter
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-accent print:hidden"
        >
          <Printer size={15} /> Imprimer
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Impossible de charger l&apos;annuaire.</p>
          <button onClick={() => refetch()} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent">Réessayer</button>
        </div>
      ) : emps.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Users size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{search || dept ? "Aucun contact ne correspond à la recherche." : "Aucun contact. Créez des employés actifs dans le module Employés."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {emps.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initials(e.prenom, e.nom) || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{e.prenom} {e.nom}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.fonction} · {e.departmentName ?? "—"} · {statutLabel(e.statut)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {e.telephone && (
                  <a href={`tel:${e.telephone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-primary">
                    <Phone size={13} /> {e.telephone}
                  </a>
                )}
                {e.emailPersonnel && (
                  <a href={`mailto:${e.emailPersonnel}`} className="flex items-center gap-2 truncate hover:text-primary">
                    <Mail size={13} /> {e.emailPersonnel}
                  </a>
                )}
                {!e.telephone && !e.emailPersonnel && <span className="italic">Aucun contact renseigné</span>}
              </div>
              <Link
                href={`/dashboard/rh/employes/${e.id}`}
                className="mt-3 block rounded-lg border border-primary/30 px-3 py-1.5 text-center text-xs font-bold text-primary transition-colors hover:bg-primary/10"
              >
                Ouvrir la fiche
              </Link>
            </div>
          ))}
        </div>
      )}

      <PaginationBar page={page} totalPages={totalPages} total={total} onPage={setPage} label="contact(s)" empty={true} />
    </div>
  );
}