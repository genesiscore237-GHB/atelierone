import { eq, and, gte, lte, inArray, desc, asc, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "~/server/db";
import {
  ventes, ventesLignes, produits, clients, utilisateurs, agences, categories, fournisseurs, caisses, sessionsCaisse } from "@atelierone/db";
import {
  REPORT_DIMENSIONS,
  REPORT_MEASURES,
  REPORT_RATIOS,
  type ReportDimensionKey,
  type ReportInput,
  type PeriodeUnite,
} from "./defs";

export type UserScope = { id: string; agenceId: number; role?: string | null };

export interface ReportColumn {
  key: string;
  label: string;
  kind: "dimension" | "measure" | "ratio";
}

export interface CompareValue {
  value: number;
  pct: number | null;
}

export interface ReportRow {
  id: string;
  label: string;
  values: Record<string, number>;
  compare: Record<string, CompareValue>;
}

export interface ReportTotals {
  values: Record<string, number>;
  compare: Record<string, CompareValue>;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportTotals;
  totalCount: number;
  hasCompare: boolean;
  query: {
    dimension: ReportDimensionKey;
    periodeUnite?: PeriodeUnite;
    measures: string[];
    ratios: string[];
    filters: unknown;
    comparePrevious: boolean;
    sortBy: string;
    sortDir: "asc" | "desc";
    limit: number;
    offset: number;
  };
}

type JoinSpec = { table: PgTable; on: SQL<unknown> };

function buildWhere(input: ReportInput, user: UserScope, periodOffsetMs = 0): SQL[] {
  const conds: SQL[] = [eq(ventes.statut, "termine")];
  const f = input.filters;

  const scopeAgences = f?.agences?.length
    ? f.agences
    : user.role === "superadmin"
      ? undefined
      : [user.agenceId];
  if (scopeAgences) conds.push(inArray(ventes.agenceId, scopeAgences));

  if (f?.produits?.length) conds.push(inArray(produits.id, f.produits));
  if (f?.codesBarres?.length) conds.push(inArray(produits.codeBarre, f.codesBarres));
  if (f?.categories?.length) conds.push(inArray(produits.categorieId, f.categories));
  if (f?.typesProduit?.length) conds.push(inArray(produits.typeProduit, f.typesProduit));
  if (f?.fournisseurs?.length) conds.push(inArray(produits.fournisseurId, f.fournisseurs));
  if (f?.clients?.length) conds.push(inArray(ventes.clientId, f.clients));
  if (f?.vendeurs?.length) conds.push(inArray(ventes.operateurId, f.vendeurs));
  if (f?.modesPaiement?.length) conds.push(inArray(ventes.modePaiement, f.modesPaiement));
  if (f?.caisses?.length) conds.push(inArray(sessionsCaisse.caisseId, f.caisses));

  if (f?.dateDebut) conds.push(gte(ventes.createdAt, new Date(Date.parse(f.dateDebut) + periodOffsetMs)));
  if (f?.dateFin) conds.push(lte(ventes.createdAt, new Date(Date.parse(f.dateFin) + periodOffsetMs)));
  return conds;
}

const JOIN_TABLES: Record<string, { table: PgTable; on: SQL<unknown> }> = {
  categories: { table: categories, on: sql`${categories.id} = ${produits.categorieId}` },
  fournisseurs: { table: fournisseurs, on: sql`${fournisseurs.id} = ${produits.fournisseurId}` },
  clients: { table: clients, on: sql`${clients.id} = ${ventes.clientId}` },
  vendeurs: { table: utilisateurs, on: sql`${utilisateurs.id} = ${ventes.operateurId}` },
  agences: { table: agences, on: sql`${agences.id} = ${ventes.agenceId}` },
  sessionsCaisse: { table: sessionsCaisse, on: sql`${sessionsCaisse.id} = ${ventes.sessionCaisseId}` },
  caisses: { table: caisses, on: sql`${caisses.id} = ${sessionsCaisse.caisseId}` },
};

function buildJoins(dimension: ReportDimensionKey, input: ReportInput): JoinSpec[] {
  const needed = new Set<string>();
  const f = input.filters;
  switch (dimension) {
    case "categorie": needed.add("categories"); break;
    case "fournisseur": needed.add("fournisseurs"); break;
    case "client": needed.add("clients"); break;
    case "vendeur": needed.add("vendeurs"); break;
    case "agence": needed.add("agences"); break;
    case "caisse": needed.add("sessionsCaisse"); needed.add("caisses"); break;
    default: break;
  }
  if (f?.categories?.length) needed.add("categories");
  if (f?.fournisseurs?.length) needed.add("fournisseurs");
  if (f?.clients?.length) needed.add("clients");
  if (f?.vendeurs?.length) needed.add("vendeurs");
  if (f?.caisses?.length) { needed.add("sessionsCaisse"); needed.add("caisses"); }

  return [...needed].map((k) => JOIN_TABLES[k]);
}

function periodExpr(input: ReportInput): SQL<string> {
  switch (input.periodeUnite ?? "jour") {
    case "semaine": return sql<string>`to_char(${ventes.createdAt}, 'IYYY-"S"IW')`;
    case "mois": return sql<string>`to_char(${ventes.createdAt}, 'YYYY-MM')`;
    case "trimestre": return sql<string>`to_char(${ventes.createdAt}, 'YYYY-"T"Q')`;
    case "annee": return sql<string>`to_char(${ventes.createdAt}, 'YYYY')`;
    case "jour":
    default: return sql<string>`to_char(${ventes.createdAt}, 'YYYY-MM-DD')`;
  }
}

type SelectCols = Record<string, SQLWrapper>;

interface AggRow {
  dimId: unknown;
  dimLabel: unknown;
  [k: string]: unknown;
}

function baseQuery(input: ReportInput, user: UserScope, periodOffsetMs = 0) {
  const dimension = input.dimension;
  const isPeriod = dimension === "periode";
  const dim = REPORT_DIMENSIONS[dimension];

  const select: SelectCols = {};
  if (isPeriod) {
    select.dimId = periodExpr(input);
    select.dimLabel = periodExpr(input);
  } else {
    const dimSel = dim.select();
    select.dimId = dimSel.dimId as SQL<unknown>;
    select.dimLabel = dimSel.dimLabel as SQL<unknown>;
  }
  for (const k of Object.keys(REPORT_MEASURES)) {
    select[k] = (REPORT_MEASURES[k as keyof typeof REPORT_MEASURES].expr as SQL<unknown>).as(k);
  }

  const where = and(...buildWhere(input, user, periodOffsetMs));
  const joins = buildJoins(dimension, input);
  const groupBy: SQL[] = isPeriod ? [periodExpr(input)] : (dim.groupBy() as SQL[]);

  let q = db
    .select(select as never)
    .from(ventesLignes)
    .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
    .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
    .where(where)
    .groupBy(...groupBy);

  for (const j of joins) q = q.leftJoin(j.table as never, j.on as never) as never;

  return { select, isPeriod, joins };
}

async function fetchAggregates(
  input: ReportInput,
  user: UserScope,
  periodOffsetMs = 0,
  applyLimit = true,
): Promise<{ rows: AggRow[]; count: number }> {
  const { select, isPeriod, joins } = baseQuery(input, user, periodOffsetMs);
  const where = and(...buildWhere(input, user, periodOffsetMs));
  const dimension = input.dimension;
  const dim = REPORT_DIMENSIONS[dimension];
  const groupBy: SQL[] = isPeriod ? [periodExpr(input)] : (dim.groupBy() as SQL[]);

  const measureSort = input.sortBy.startsWith("measure:")
    ? input.sortBy.slice("measure:".length)
    : null;
  const sortIsRatio = measureSort != null && measureSort in REPORT_RATIOS;
  const sortByMeasure = measureSort != null && !sortIsRatio;

  let q = db
    .select(select as never)
    .from(ventesLignes)
    .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
    .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
    .where(where)
    .groupBy(...groupBy);
  for (const j of joins) q = q.leftJoin(j.table as never, j.on as never) as never;

  const buildCount = async () => {
    let cq = db
      .select({ n: sql<number>`count(*)` })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(where)
      .groupBy(...groupBy);
    for (const j of joins) cq = cq.leftJoin(j.table as never, j.on as never) as never;
    const rows = (await cq.execute()) as unknown as { n: number }[];
    return rows.length;
  };

  if (sortByMeasure) {
    const orderExprs: SQL[] = [
      input.sortDir === "asc" ? asc(select[measureSort]) : desc(select[measureSort]),
    ];
    if (isPeriod) orderExprs.unshift(asc(periodExpr(input)));
    const rows = (await q.orderBy(...orderExprs).limit(applyLimit ? input.limit : 100000).offset(applyLimit ? input.offset : 0).execute()) as unknown as AggRow[];
    const count = await buildCount();
    return { rows, count };
  }

  const rows = (await q.execute()) as unknown as AggRow[];
  return { rows, count: rows.length };
}

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

function computeRatios(values: Record<string, number>, ratioKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rk of ratioKeys) {
    if (rk === "tauxMarge") out[rk] = values.ca > 0 ? (values.margeBrute / values.ca) * 100 : 0;
    else if (rk === "panierMoyen") out[rk] = values.nbTickets > 0 ? values.ca / values.nbTickets : 0;
    else if (rk === "tauxRemise") out[rk] = values.ca > 0 ? (values.remises / values.ca) * 100 : 0;
  }
  return out;
}

function buildCompare(
  current: Record<string, number>,
  previous: Record<string, number> | null,
  keys: string[],
): Record<string, CompareValue> {
  const out: Record<string, CompareValue> = {};
  if (!previous) {
    for (const k of keys) out[k] = { value: current[k] ?? 0, pct: null };
    return out;
  }
  for (const k of keys) {
    const cur = current[k] ?? 0;
    const prev = previous[k] ?? 0;
    out[k] = {
      value: cur - prev,
      pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null,
    };
  }
  return out;
}

function previousPeriod(input: ReportInput): { offsetMs: number } | null {
  const f = input.filters;
  if (!f?.dateDebut || !f?.dateFin) return null;
  const start = Date.parse(f.dateDebut);
  const end = Date.parse(f.dateFin);
  const duration = end - start;
  return { offsetMs: -(duration + 24 * 3600 * 1000) };
}

export async function runReport(input: ReportInput, user: UserScope): Promise<ReportResult> {
  const measureKeys = Object.keys(REPORT_MEASURES);
  const ratioKeys = input.ratios ?? [];
  const dimension = input.dimension;
  const isPeriod = dimension === "periode";
  const dim = REPORT_DIMENSIONS[dimension];

  const { rows, count } = await fetchAggregates(input, user);
  const prev = previousPeriod(input);
  const prevOffsetMs = prev?.offsetMs ?? 0;
  const hasCompare = input.comparePrevious && prev != null;
  const prevRows: AggRow[] = hasCompare
    ? (await fetchAggregates(input, user, prevOffsetMs, false)).rows
    : [];

  const toValues = (r: AggRow): Record<string, number> => {
    const values: Record<string, number> = {};
    for (const k of measureKeys) values[k] = num(r[k]);
    return values;
  };

  const currentRows = rows.map((r) => {
    const values = toValues(r);
    return {
      id: r.dimId == null ? "null" : String(r.dimId),
      label: r.dimLabel == null || String(r.dimLabel).trim() === "" ? "Non renseigné" : String(r.dimLabel),
      values: { ...values, ...computeRatios(values, ratioKeys) },
    };
  });

  const totalValues = currentRows.reduce<Record<string, number>>((acc, r) => {
    for (const k of measureKeys) acc[k] = (acc[k] ?? 0) + r.values[k];
    return acc;
  }, {});
  const totalValuesWithRatios = { ...totalValues, ...computeRatios(totalValues, ratioKeys) };

  const prevMap = new Map<string, Record<string, number>>();
  const prevTotals: Record<string, number> = {};
  if (hasCompare) {
    for (const r of prevRows) {
      const values = toValues(r);
      const key = isPeriod ? String(prevRows.indexOf(r)) : r.dimId == null ? "null" : String(r.dimId);
      prevMap.set(key, { ...values, ...computeRatios(values, ratioKeys) });
      for (const k of measureKeys) prevTotals[k] = (prevTotals[k] ?? 0) + values[k];
    }
    for (const k of measureKeys) prevTotals[k] = prevTotals[k] ?? 0;
    Object.assign(prevTotals, computeRatios(prevTotals, ratioKeys));
  }

  const rowsOut: ReportRow[] = currentRows.map((r, i) => {
    const key = isPeriod ? String(i) : r.id;
    const prevValues = prevMap.get(key) ?? null;
    return {
      id: r.id,
      label: r.label,
      values: r.values,
      compare: buildCompare(r.values, prevValues, [...measureKeys, ...ratioKeys]),
    };
  });

  const totalsCompare = buildCompare(totalValuesWithRatios, hasCompare ? prevTotals : null, [...measureKeys, ...ratioKeys]);

  const measureSortKey = input.sortBy.startsWith("measure:")
    ? input.sortBy.slice("measure:".length)
    : null;
  let finalRows = rowsOut;
  if (input.sortBy === "dimension") {
    finalRows = [...rowsOut].sort((a, b) => a.label.localeCompare(b.label, "fr"));
    if (input.sortDir === "desc") finalRows.reverse();
    finalRows = finalRows.slice(input.offset, input.offset + input.limit);
  } else if (measureSortKey && measureSortKey in REPORT_RATIOS) {
    finalRows = [...rowsOut].sort((a, b) => {
      const cmp = (a.values[measureSortKey] ?? 0) - (b.values[measureSortKey] ?? 0);
      return input.sortDir === "asc" ? cmp : -cmp;
    });
    finalRows = finalRows.slice(input.offset, input.offset + input.limit);
  }

  const columns: ReportColumn[] = [
    { key: "label", label: dim.label, kind: "dimension" },
    ...input.measures.map((k) => ({
      key: k,
      label: REPORT_MEASURES[k].label,
      kind: "measure" as const,
    })),
    ...ratioKeys.map((k) => ({
      key: k,
      label: REPORT_RATIOS[k as keyof typeof REPORT_RATIOS].label,
      kind: "ratio" as const,
    })),
  ];

  return {
    columns,
    rows: finalRows,
    totals: { values: totalValuesWithRatios, compare: totalsCompare },
    totalCount: count,
    hasCompare,
    query: {
      dimension,
      periodeUnite: isPeriod ? (input.periodeUnite ?? "jour") : undefined,
      measures: input.measures,
      ratios: ratioKeys,
      filters: input.filters,
      comparePrevious: input.comparePrevious,
      sortBy: input.sortBy,
      sortDir: input.sortDir,
      limit: input.limit,
      offset: input.offset,
    },
  };
}
