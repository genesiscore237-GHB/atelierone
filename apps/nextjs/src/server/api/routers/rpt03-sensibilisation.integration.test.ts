import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

/**
 * RPT-03 — §36 masquage des données sensibles.
 *
 * Aucun utilisateur réel ne possède `rh.presence.consulter` SANS
 * `rh.salaire.consulter` : le RBAC est donc simulé pour cet unique cas, sans
 * toucher aux droits en base. Le reste du fichier utilise les droits réels.
 */
let salaireAutorise = true;
vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: {
    isSuperAdmin: async () => salaireAutorise,
    hasPermission: (_id: string, code: string) => code !== "rh.salaire.consulter" || salaireAutorise,
  },
}));

import { rhSensibilisationRouter } from "./rh-sensibilisation";
import type { ExtendedUser } from "@atelierone/auth/types";

/**
 * RPT-03 — Intégration DB -> moteur -> API, LECTURE SEULE.
 *
 * Aucune donnée n'est créée, modifiée ou supprimée par ce fichier. Il prouve
 * que la chaîne complète (présences réelles -> heures -> taux historique ->
 * impact ESTIMÉ -> règles -> messages) fonctionne sur la base réelle, et que
 * la RÈGLE ABSOLUE tient : l'estimation n'écrit rien dans la paie.
 */

const AGENCE = 1;
const DEBUT = "2026-09-01";
const FIN = "2026-09-30";

function ctxDe(role: ExtendedUser["role"], userId = "1") {
  const user: ExtendedUser = {
    id: userId,
    email: `${role}@gpj.cm`,
    name: role,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role,
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } };
}

const caller = (role: ExtendedUser["role"] = "superadmin") =>
  rhSensibilisationRouter.createCaller(ctxDe(role) as never);

describe("RPT-03 API de sensibilisation — septembre 2026 (reel)", () => {
  beforeEach(() => {
    salaireAutorise = true;
  });

  it("repond sur la periode demandee sans aucune ecriture", async () => {
    const res = await caller().indicateurs({ from: DEBUT, to: FIN });
    expect(res.periode).toEqual({ from: DEBUT, to: FIN });
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.standardMonthlyHours).toBeGreaterThan(0);
  });

  it("les 7 regles exigees sont chargees, aucune manquante (§19/§20)", async () => {
    const { regles, manquantes } = await caller().regles();
    expect(regles).toHaveLength(7);
    expect(manquantes).toEqual([]);
    expect(regles.every((r) => r.active)).toBe(true);
  });

  it("chaque indicateur expose ses indicateurs de presence (§8)", async () => {
    const { rows } = await caller().indicateurs({ from: DEBUT, to: FIN });
    for (const r of rows) {
      expect(r.absenceHours).toBeGreaterThanOrEqual(0);
      expect(r.totalNotWorkedHours).toBeGreaterThanOrEqual(0);
      expect(r.retardMinutes).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.totalNotWorkedHours)).toBe(true);
    }
  });

  it("totalNotWorkedHours = absenceHours + retardHours (§6)", async () => {
    const { rows } = await caller().indicateurs({ from: DEBUT, to: FIN });
    for (const r of rows) {
      expect(r.totalNotWorkedHours).toBeCloseTo(r.absenceHours + r.retardHours, 1);
    }
  });

  it("l'estimation ne modifie AUCUNE retenue de paie (§0/§41)", async () => {
    const { rows } = await caller().indicateurs({ from: DEBUT, to: FIN });
    const totauxEstimes = rows.reduce((a, r) => a + (r.estimatedImpact ?? 0), 0);
    const totauxRetenus = rows.reduce((a, r) => a + r.actualPayrollDeduction, 0);
    // L'estimation est non nulle sur la periode reelle...
    expect(totauxEstimes).toBeGreaterThan(0);
    // ...alors que la base ne contient toujours aucune retenue sur ces criteres.
    expect(totauxRetenus).toBe(0);
  });

  it("multi-employes : les totaux equipe valent la somme des lignes (§15)", async () => {
    const { rows, equipe } = await caller().indicateurs({ from: DEBUT, to: FIN });
    expect(equipe.effectif).toBe(rows.length);
    expect(equipe.absenceHours).toBeCloseTo(
      rows.reduce((a, r) => a + r.absenceHours, 0),
      1
    );
    expect(equipe.retardMinutes).toBeCloseTo(
      rows.reduce((a, r) => a + r.retardMinutes, 0),
      1
    );
    // Le ratio equipe est un ratio de sommes.
    if (equipe.heuresTheoriques > 0) {
      expect(equipe.tauxPresenceHeures).toBeCloseTo(
        (equipe.heuresTravaillees / equipe.heuresTheoriques) * 100,
        1
      );
    } else {
      expect(equipe.tauxPresenceHeures).toBeNull();
    }
  });

  it("multi-mois : la somme des periodes ne double aucun calcul de presence", async () => {
    const aout = await caller().indicateurs({ from: "2026-08-01", to: "2026-08-31" });
    const sept = await caller().indicateurs({ from: "2026-09-01", to: "2026-09-30" });
    expect(aout.rows.length).toBe(sept.rows.length);

    // Un mois plein a plus d'heures theoriques qu'une periode de 2 jours.
    const deuxJours = await caller().indicateurs({ from: "2026-09-01", to: "2026-09-02" });
    const sommeSept = sept.rows.reduce((a, r) => a + r.heuresTheoriques, 0);
    const sommeDeuxJours = deuxJours.rows.reduce((a, r) => a + r.heuresTheoriques, 0);
    expect(sommeDeuxJours).toBeLessThan(sommeSept);
  });

  it("filtre par employe : une seule ligne, coherente avec la periode complete", async () => {
    const tous = await caller().indicateurs({ from: DEBUT, to: FIN });
    const cible = tous.rows[0];
    const un = await caller().indicateurs({ from: DEBUT, to: FIN, employeId: cible.employeeId });
    expect(un.rows).toHaveLength(1);
    expect(un.rows[0].employeeId).toBe(cible.employeeId);
    expect(un.rows[0].absenceHours).toBe(cible.absenceHours);
    expect(un.rows[0].estimatedImpact).toBe(cible.estimatedImpact);
  });

  it("superadmin voit les montants ; un role sans permission ne voit que le non-salaire", async () => {
    salaireAutorise = true;
    const admin = await caller("superadmin");
    const avec = await admin.indicateurs({ from: DEBUT, to: FIN });
    expect(avec.salariesVisible).toBe(true);
    expect(avec.rows[0].salariesVisible).toBe(true);
    expect(avec.rows[0].estimatedImpact).not.toBeNull();

    salaireAutorise = false;
    const sans = await caller("magasinier");
    const sansSalaire = await sans.indicateurs({ from: DEBUT, to: FIN });
    expect(sansSalaire.salariesVisible).toBe(false);
    for (const r of sansSalaire.rows) {
      expect(r.estimatedImpact).toBeNull();
      expect(r.impactPercent).toBeNull();
      expect(r.salaireBaseReference).toBeNull();
      expect(r.segments).toBeNull();
      // Les indicateurs de presence, eux, restent la.
      expect(typeof r.absenceHours).toBe("number");
      expect(typeof r.totalNotWorkedHours).toBe("number");
    }
  });

  it("les messages sont structures et deterministes (§17)", async () => {
    const r = await caller().indicateurs({ from: DEBUT, to: FIN });
    const premier = r.rows.find((x) => (x.messages?.length ?? 0) > 0);
    expect(premier).toBeDefined();
    for (const m of premier!.messages!) {
      expect(m.code).toBeTruthy();
      expect(["INFO", "WARNING", "CRITICAL"]).toContain(m.niveau);
      expect(m.message).toBeTruthy();
      expect(m.raison).toBeTruthy();
      expect(m.actionRecommandee).toBeTruthy();
      expect(typeof m.seuilApplique).toBe("number");
    }
    const second = await caller().indicateurs({ from: DEBUT, to: FIN });
    expect(second.rows.find((x) => (x.messages?.length ?? 0) > 0)!.messages!.map((m) => m.code)).toEqual(
      premier!.messages!.map((m) => m.code)
    );
  });

  it("periode invalide : refusee en amont, rien n'est calcule", async () => {
    await expect(caller().indicateurs({ from: FIN, to: DEBUT })).rejects.toThrow();
  });

  it("le role employe ne peut pas appeler une mutation : aucune n'existe", () => {
    const procedures = Object.keys(rhSensibilisationRouter._def.procedures);
    expect(procedures.every((p) => !p.startsWith("creer") && !p.startsWith("modifier") && !p.startsWith("supprimer"))).toBe(true);
  });
});
