import { z } from "zod";
import { sql, like } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  produits, categories, fournisseurs, clients, utilisateurs, caisses, agences, ventes } from "@atelierone/db";
import { REPORT_DIMENSIONS, REPORT_MEASURES, REPORT_RATIOS, OPTION_RESOURCES, reportInputSchema } from "./defs";
import { runReport, type UserScope } from "./engine";
import { REPORT_TEMPLATES } from "./templates";

function scope(user: { role?: string | null; agenceId: number }) {
  return user.role === "superadmin" ? null : user.agenceId;
}

export const reportsRouter = createTRPCRouter({
  meta: protectedProcedure.query(async () => ({
    dimensions: Object.entries(REPORT_DIMENSIONS).map(([key, d]) => ({
      key,
      label: d.label,
      group: d.group,
    })),
    measures: Object.entries(REPORT_MEASURES).map(([key, m]) => ({
      key,
      label: m.label,
      type: m.type,
    })),
    ratios: Object.entries(REPORT_RATIOS).map(([key, r]) => ({
      key,
      label: r.label,
      type: r.type,
    })),
    filters: [
      { key: "produits", label: "Produits", kind: "resource", resource: "produits" },
      { key: "codesBarres", label: "Codes-barres", kind: "text" },
      { key: "categories", label: "Catégories", kind: "resource", resource: "categories" },
      { key: "typesProduit", label: "Types de produit", kind: "resource", resource: "typesProduit" },
      { key: "fournisseurs", label: "Fournisseurs", kind: "resource", resource: "fournisseurs" },
      { key: "clients", label: "Clients", kind: "resource", resource: "clients" },
      { key: "vendeurs", label: "Vendeurs", kind: "resource", resource: "vendeurs" },
      { key: "caisses", label: "Caisses", kind: "resource", resource: "caisses" },
      { key: "modesPaiement", label: "Modes de paiement", kind: "resource", resource: "modesPaiement" },
      { key: "agences", label: "Agences", kind: "resource", resource: "agences" },
      { key: "dateDebut", label: "Du", kind: "date" },
      { key: "dateFin", label: "Au", kind: "date" },
    ],
    periodUnits: [
      { key: "jour", label: "Jour" },
      { key: "semaine", label: "Semaine" },
      { key: "mois", label: "Mois" },
      { key: "trimestre", label: "Trimestre" },
      { key: "annee", label: "Année" },
    ],
    measureTypes: { currency: "Montant", quantity: "Quantité", count: "Nombre", ratio: "Ratio" },
  })),

  options: protectedProcedure
    .input(z.object({
      resource: z.enum(OPTION_RESOURCES),
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(1000).default(500),
    }))
    .query(async ({ ctx, input }) => {
      const scopedAgence = scope(ctx.user);
      const q = input.search?.trim();

      if (input.resource === "produits") {
        const items = await db.select({ id: produits.id, label: produits.titre, extra: produits.codeBarre })
          .from(produits)
          .where(q ? like(produits.titre, `%${q}%`) : undefined)
          .orderBy(produits.titre)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "", extra: i.extra ?? "" }));
      }

      if (input.resource === "categories") {
        const items = await db.select({ id: categories.id, label: categories.nom })
          .from(categories)
          .where(q ? like(categories.nom, `%${q}%`) : undefined)
          .orderBy(categories.nom)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      if (input.resource === "typesProduit") {
        const items = await db.select({ label: produits.typeProduit })
          .from(produits)
          .groupBy(produits.typeProduit)
          .orderBy(produits.typeProduit)
          .limit(input.limit);
        return items
          .map((i) => ({ id: i.label ?? "", label: i.label ?? "" }))
          .filter((i) => i.label !== "");
      }






      if (input.resource === "fournisseurs") {
        const items = await db.select({ id: fournisseurs.id, label: fournisseurs.nom })
          .from(fournisseurs)
          .where(q ? like(fournisseurs.nom, `%${q}%`) : undefined)
          .orderBy(fournisseurs.nom)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      if (input.resource === "clients") {
        const where = scopedAgence == null
          ? q
            ? sql`${clients.nom} ilike ${`%${q}%`} or ${clients.prenom} ilike ${`%${q}%`}`
            : undefined
          : q
            ? sql`${clients.agenceId} = ${scopedAgence} and (${clients.nom} ilike ${`%${q}%`} or ${clients.prenom} ilike ${`%${q}%`})`
            : sql`${clients.agenceId} = ${scopedAgence}`;
        const items = await db.select({
          id: clients.id,
          label: sql<string>`trim(concat(coalesce(${clients.prenom}, ''), ' ', ${clients.nom}))`,
        })
          .from(clients)
          .where(where)
          .orderBy(clients.nom)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      if (input.resource === "vendeurs") {
        const items = await db.select({
          id: utilisateurs.id,
          label: sql<string>`trim(concat(coalesce(${utilisateurs.prenom}, ''), ' ', ${utilisateurs.nom}))`,
        })
          .from(utilisateurs)
          .where(scopedAgence == null ? undefined : sql`${utilisateurs.agenceId} = ${scopedAgence}`)
          .orderBy(utilisateurs.nom)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      if (input.resource === "caisses") {
        const items = await db.select({ id: caisses.id, label: caisses.libelle })
          .from(caisses)
          .where(scopedAgence == null ? undefined : sql`${caisses.agenceId} = ${scopedAgence}`)
          .orderBy(caisses.libelle)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      if (input.resource === "agences") {
        const items = await db.select({ id: agences.id, label: agences.nom })
          .from(agences)
          .where(scopedAgence == null ? undefined : sql`${agences.id} = ${scopedAgence}`)
          .orderBy(agences.nom)
          .limit(input.limit);
        return items.map((i) => ({ id: String(i.id), label: i.label ?? "" }));
      }

      const items = await db.select({ label: ventes.modePaiement })
        .from(ventes)
        .groupBy(ventes.modePaiement)
        .orderBy(ventes.modePaiement)
        .limit(input.limit);
      return items
        .map((i) => ({ id: i.label ?? "", label: i.label ?? "" }))
        .filter((i) => i.label !== "");
    }),

  run: protectedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => {
      const user: UserScope = { id: String(ctx.user.id), agenceId: ctx.user.agenceId, role: ctx.user.role };
      return runReport(input, user);
    }),

  templates: protectedProcedure.query(async () => REPORT_TEMPLATES.map((t) => ({
    id: t.id,
    nom: t.nom,
    description: t.description,
    groupe: t.groupe,
    params: t.params,
  }))),

  template: protectedProcedure
    .input(z.object({ id: z.string().max(100) }))
    .query(async ({ input }) => {
      const t = REPORT_TEMPLATES.find((x) => x.id === input.id);
      return t ?? null;
    }),
});
