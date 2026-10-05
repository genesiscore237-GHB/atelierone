import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, clients, vehicules, ordresReparation, ventes, produits, fournisseurs, employes } from "@atelierone/db";
import { and, eq, or, ilike, desc } from "drizzle-orm";
import { RBACService } from "~/server/lib/rbac-service";
import { selectionEmployesRecherche } from "~/server/lib/rh-recherche";

const MAX = 6;

export const rechercheRouter = createTRPCRouter({
  global: protectedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const q = input.q;
      if (!q) return { clients: [], vehicules: [], ordres: [], ventes: [], produits: [], fournisseurs: [], employes: [] };

      const agenceId = ctx.user.agenceId;
      const like = `%${q}%`;

      // P18 — recherche globale : téléphone/email des employés masqués hors lecture RH
      // (un rôle opérationnel n'a pas `rh.employe.consulter` dans la matrice).
      const peutVoirEmployesContact = await RBACService.hasPermission(
        ctx.user.id,
        "rh.employe.consulter",
        String(ctx.user.agenceId ?? "")
      );

      const [cs, vehs, ors, vs, ps, fo, em] = await Promise.all([
        db.select({
          id: clients.id,
          nom: clients.nom,
          prenom: clients.prenom,
          raisonSociale: clients.raisonSociale,
          telephone: clients.telephone,
          whatsapp: clients.whatsapp,
          email: clients.email,
          codeClient: clients.codeClient,
          ville: clients.ville,
          statut: clients.statut,
        })
          .from(clients)
          .where(and(
            eq(clients.agenceId, agenceId),
            or(
              ilike(clients.nom, like),
              ilike(clients.prenom, like),
              ilike(clients.raisonSociale, like),
              ilike(clients.telephone, like),
              ilike(clients.telephoneSecondaire, like),
              ilike(clients.whatsapp, like),
              ilike(clients.codeClient, like),
            ),
          ))
          .orderBy(clients.nom)
          .limit(MAX),

        db.select({
          id: vehicules.id,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          numeroChassis: vehicules.numeroChassis,
          annee: vehicules.annee,
          statutImmobilisation: vehicules.statutImmobilisation,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
        })
          .from(vehicules)
          .leftJoin(clients, eq(vehicules.clientId, clients.id))
          .where(and(
            eq(vehicules.agenceId, agenceId),
            or(
              ilike(vehicules.immatriculation, like),
              ilike(vehicules.numeroChassis, like),
              ilike(vehicules.marque, like),
              ilike(vehicules.modele, like),
              ilike(clients.nom, like),
              ilike(clients.telephone, like),
            ),
          ))
          .orderBy(vehicules.immatriculation)
          .limit(MAX),

        db.select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          dateOuverture: ordresReparation.dateOuverture,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
        })
          .from(ordresReparation)
          .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
          .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
          .where(and(
            eq(ordresReparation.agenceId, agenceId),
            or(
              ilike(ordresReparation.numero, like),
              ilike(vehicules.immatriculation, like),
              ilike(clients.nom, like),
              ilike(clients.prenom, like),
              ilike(clients.raisonSociale, like),
              ilike(clients.telephone, like),
            ),
          ))
          .orderBy(desc(ordresReparation.dateOuverture))
          .limit(MAX),

        db.select({
          id: ventes.id,
          reference: ventes.reference,
          montantTotal: ventes.montantTotal,
          montantPaye: ventes.montantPaye,
          statut: ventes.statut,
          createdAt: ventes.createdAt,
          modePaiement: ventes.modePaiement,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
        })
          .from(ventes)
          .leftJoin(clients, eq(ventes.clientId, clients.id))
          .where(and(
            eq(ventes.agenceId, agenceId),
            or(
              ilike(ventes.reference, like),
              ilike(clients.nom, like),
              ilike(clients.prenom, like),
              ilike(clients.raisonSociale, like),
              ilike(clients.telephone, like),
            ),
          ))
          .orderBy(desc(ventes.createdAt))
          .limit(MAX),

        db.select({
          id: produits.id,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          designationCourte: produits.designationCourte,
          typeProduit: produits.typeProduit,
          prixVente: produits.prixVente,
          statut: produits.statut,
        })
          .from(produits)
          .where(or(
            ilike(produits.titre, like),
            ilike(produits.codeBarre, like),
            ilike(produits.codeArticle, like),
            ilike(produits.designationCourte, like),
          ))
          .orderBy(produits.titre)
          .limit(MAX),

        db.select({
          id: fournisseurs.id,
          nom: fournisseurs.nom,
          telephone: fournisseurs.telephone,
          email: fournisseurs.email,
          ville: fournisseurs.ville,
        })
          .from(fournisseurs)
          .where(and(
            eq(fournisseurs.agenceId, agenceId),
            or(
              ilike(fournisseurs.nom, like),
              ilike(fournisseurs.telephone, like),
              ilike(fournisseurs.email, like),
            ),
          ))
          .orderBy(fournisseurs.nom)
          .limit(MAX),

        db.select(selectionEmployesRecherche(peutVoirEmployesContact))
          .from(employes)
          .where(and(
            eq(employes.agenceId, agenceId),
            or(
              ilike(employes.nom, like),
              ilike(employes.prenom, like),
              ilike(employes.matricule, like),
              ilike(employes.fonction, like),
              ilike(employes.telephone, like),
            ),
          ))
          .orderBy(employes.nom)
          .limit(MAX),
      ]);

      return {
        clients: cs.map((c) => ({
          id: String(c.id),
          titre: c.raisonSociale ?? `${c.prenom ?? ""} ${c.nom}`.trim(),
          sousTitre: c.codeClient ? `${c.codeClient} · ${c.telephone ?? c.whatsapp ?? c.email ?? ""}`.trim() : (c.telephone ?? c.whatsapp ?? c.email ?? ""),
          href: `/dashboard/customers/${c.id}`,
        })),
        vehicules: vehs.map((v) => ({
          id: String(v.id),
          titre: v.immatriculation,
          sousTitre: `${v.marque ?? ""} ${v.modele ?? ""}${v.clientNom ? ` · ${v.clientPrenom ?? ""} ${v.clientNom}` : ""}`.trim(),
          href: `/dashboard/vehicules/${v.id}`,
        })),
        ordres: ors.map((o) => ({
          id: String(o.id),
          titre: o.numero,
          sousTitre: `${o.immatriculation ?? ""}${o.clientNom ? ` · ${o.clientPrenom ?? ""} ${o.clientNom}` : ""}${o.statut ? ` · ${o.statut}` : ""}`.trim(),
          href: `/dashboard/ordres-reparation/${o.id}`,
        })),
        ventes: vs.map((v) => ({
          id: String(v.id),
          titre: v.reference ?? `Vente #${v.id}`,
          sousTitre: `${v.clientNom ? `${v.clientPrenom ?? ""} ${v.clientNom}`.trim() : "—"} · ${Number(v.montantTotal ?? 0).toLocaleString("fr-FR")} F`,
          href: `/dashboard/sales`,
        })),
        produits: ps.map((p) => ({
          id: String(p.id),
          titre: p.titre,
          sousTitre: `${p.codeArticle ?? p.codeBarre ?? ""} ${p.designationCourte ? `· ${p.designationCourte}` : ""}`.trim(),
          href: `/dashboard/catalog/${p.id}`,
        })),
        fournisseurs: fo.map((f) => ({
          id: String(f.id),
          titre: f.nom,
          sousTitre: `${f.telephone ?? ""} ${f.email ?? ""}`.trim(),
          href: `/dashboard/procurement`,
        })),
        employes: em.map((e) => ({
          id: String(e.id),
          titre: `${e.prenom ?? ""} ${e.nom}`.trim(),
          sousTitre: `${e.matricule ?? ""} ${e.fonction ?? ""}`.trim(),
          href: `/dashboard/rh/employes/${e.id}`,
          telephone: e.telephone ?? null,
          emailPersonnel: e.emailPersonnel ?? null,
        })),
      };
    }),
});