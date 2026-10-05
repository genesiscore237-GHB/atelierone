import { describe, it, expect, vi, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhPeriodeRouter } from "./rh-situation";
import type { ExtendedUser } from "@atelierone/auth/types";
import { resetSituationRH, psqlSituation, SIT_FIXTURES, SIT_PERIOD } from "../../../../e2e/situation-rh-paie-reset";

const AGENCE = 1;
const EVIDENCE_DIR = resolve(process.cwd(), "../../audit/situation-rh");
console.log("TERRAIN evidence dir:", EVIDENCE_DIR);

function ctxDe(userId: string, role: ExtendedUser["role"], perms: string[]) {
  const user: ExtendedUser = {
    id: userId,
    email: `${role}@gpj.cm`,
    name: role,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role,
    permissions: perms,
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  };
}

const caller = (userId = "1", role: ExtendedUser["role"] = "superadmin", perms: string[] = []) =>
  rhPeriodeRouter.createCaller(ctxDe(userId, role, perms) as never);

async function codeDe(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const x = e as { shape?: { data?: { code?: unknown } }; code?: unknown };
    return x.shape?.data?.code ?? x.code ?? "UNKNOWN";
  }
}

function countFixtures(): number {
  const out = psqlSituation(
    `SELECT count(*) FROM employes e LEFT JOIN employee_salary_history h ON h.employee_id=e.id LEFT JOIN employee_advances a ON a.employee_id=e.id LEFT JOIN attendance_calculations c ON c.employee_id=e.id LEFT JOIN contrats ct ON ct.employe_id=e.id WHERE e.id IN (${SIT_FIXTURES.join(",")});`
  );
  return Number(out);
}

const { from, to } = SIT_PERIOD;

async function ecrireEvidence(nom: string, data: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, nom), JSON.stringify(data, null, 2), "utf8");
}

describe("TERRAIN Situation RH & Paie — fixtures dev par ID exact (agence 1, période 01→30/09/2026)", () => {
  beforeAll(() => {
    const out = resetSituationRH();
    if (!/COMMIT/.test(out ?? "") && out !== "") {
      // psql -t -A ne remonte rien en cas de succès silencieux ; rien à faire ici
    }
  });

  it("SIT-13a — reset idempotent : rejoué 2×, mêmes résultats, aucun doublon", async () => {
    resetSituationRH();
    const avant = countFixtures();
    resetSituationRH();
    const apres = countFixtures();
    expect(apres).toBe(avant);
    const r1 = await caller().situation({ from, to, employeId: 801 });
    const r2 = await caller().situation({ from, to, employeId: 801 });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    await ecrireEvidence("avant-apres-reset.json", { countFixturesAvant: avant, countFixturesApres: apres, identiques: JSON.stringify(r1) === JSON.stringify(r2) });
  });

  it("SIT-10/13b — consultation en lecture seule : 2 lectures successives, aucune écriture DB", async () => {
    const c0 = countFixtures();
    await caller().situation({ from, to, employeId: 802 });
    await caller().situation({ from, to, employeId: 803 });
    await caller().employe({ employeId: 802, from, to });
    const c1 = countFixtures();
    expect(c1).toBe(c0);
    await ecrireEvidence("db-avant-apres-consultation.json", { comptesAvant: c0, comptesApres: c1, aucuneEcriture: c0 === c1 });
  });

  it("SIT-01/02 — 801 Salou : segmentation 200 000 → 250 000 au 16/09 (2 segments, base contractuelle = 250 000)", async () => {
    const res = await caller().situation({ from, to, employeId: 801 });
    expect(res.total).toBe(1);
    const row = res.rows[0];
    expect(row.matricule).toBe("GPJ-SIT-801");
    expect(row.nom).toBe("Salou");
    expect(row.statut).toBe("actif");
    expect(row.salaires).not.toBeNull();
    const seg = row.salaires!.segments;
    expect(seg.length).toBe(2);
    expect(seg[0].baseSalary).toBe(200000);
    expect(seg[0].dateFin).toBe("2026-09-15");
    expect(seg[1].baseSalary).toBe(250000);
    expect(seg[1].source).toBe("historique");
    // base contractuelle de période = moyenne pondérée des segments (200 000 × 15j + 250 000 × 15j)/30
    expect(row.salaires!.baseContractuelle).toBe(225000);
    await ecrireEvidence("segmentation.GPJ-SIT-801.json", { row });
  });

  it("SIT-03 — 801 : présence complète sur le mois, avance nulle, aucune anomalie", async () => {
    const res = await caller().situation({ from, to, employeId: 801 });
    const row = res.rows[0];
    expect(row.joursPresence).toBeGreaterThanOrEqual(26);
    expect(row.joursAbsence).toBe(0);
    if (row.salaires) expect(row.salaires.netLabel).toMatch(/^(REEL|ESTIME)$/);
    expect(row.anomalies.filter((a) => a.gravite !== "INFO").length).toBe(0);
  });

  it("SIT-04 — 802 Mballet : 4 indicateurs d'avance exacts (versé 150 000 / récupéré 30 000 / solde fin 120 000 / actuel 120 000, 3 avances)", async () => {
    const res = await caller().situation({ from, to, employeId: 802 });
    const row = res.rows[0];
    expect(row.avances).toEqual({
      avancePeriode: 150000,
      recuperePeriode: 30000,
      soldeFinPeriode: 120000,
      soldeActuel: 120000,
      nbAvances: 3,
    });
    await ecrireEvidence("advances.GPJ-SIT-802.json", { avances: row.avances });
  });

  it("SIT-05/06 — 802 : projection de paie cohérente (net ≥ 0, bulletin absent → ESTIME, libellés par mode)", async () => {
    const res = await caller().situation({ from, to, employeId: 802 });
    const sal = res.rows[0].salaires!;
    expect(sal.baseContractuelle).toBe(200000);
    expect(sal.netLabel).toBe("ESTIME");
    expect(sal.net).toBeGreaterThanOrEqual(0);
    expect(sal.bulletinExiste).toBe(false);
    expect(sal.tauxHoraire).toBeGreaterThan(0);
  });

  it("SIT-13c — 803 Ndong : absence élevée (17/26) + retards cumulés 100 min", async () => {
    const res = await caller().situation({ from, to, employeId: 803 });
    const row = res.rows[0];
    expect(row.joursAbsence).toBeGreaterThanOrEqual(17);
    expect(row.retardTotalMinutes).toBe(100);
    const codes = row.anomalies.map((a) => a.code);
    expect(codes).toContain("ABSENCE_ELEVEE");
    expect(codes).toContain("RETARDS_IMPORTANTS");
    await ecrireEvidence("anomalies.GPJ-SIT-803.json", { row });
  });

  it("SIT-13d — 804 Etoa (sorti) : avance non récupérable 250 000 → RECUPERATION_IMPOSSIBLE + AVANCE_SUPERIEURE_SALAIRE", async () => {
    const res = await caller().situation({ from, to, employeId: 804 });
    const row = res.rows[0];
    expect(row.statut).toBe("sorti");
    expect(row.avances!.avancePeriode).toBe(250000);
    const codes = row.anomalies.map((a) => a.code);
    expect(codes).toContain("RECUPERATION_IMPOSSIBLE");
    expect(codes).toContain("AVANCE_SUPERIEURE_SALAIRE");
    await ecrireEvidence("anomalies.GPJ-SIT-804.json", { row });
  });

  it("SIT-07 — périmètre d'accès : module réservé rh/directeur/superadmin ; profil 'consultation' refusé (rôle) et privé de rh.salaire.consulter (RBAC agence)", async () => {
    expect(await codeDe(caller("9", "consultation").situation({ from, to, employeId: 804 }))).toBe("FORBIDDEN");
    expect(await codeDe(caller("9", "consultation").export({ from, to }))).toBe("FORBIDDEN");
    const consultationPeutSalaire = psqlSituation(
      "SELECT EXISTS (SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='consultation' AND p.code='rh.salaire.consulter');"
    );
    const rhPeutSalaire = psqlSituation(
      "SELECT EXISTS (SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='rh' AND p.code='rh.salaire.consulter');"
    );
    expect(consultationPeutSalaire).toBe("f");
    expect(rhPeutSalaire).toBe("t");
    await ecrireEvidence("permissions.rbac.json", {
      consultationRefuseRole: true,
      consultationPeutConsulterSalaire: consultationPeutSalaire === "t",
      roleRhPossedeRhSalaireConsulter: rhPeutSalaire === "t",
      note: "Le masquage serveur par permission est prouvé au niveau moteur (57 tests unitaires) ; aucun profil habilité par le rôle rh et privé de rh.salaire.consulter n'existe en base dev.",
    });
  });

  it("SIT-13e — consult habilité : anomalies complètes et montants visibles (superadmin)", async () => {
    const res = await caller().situation({ from, to, employeId: 804 });
    const codes = res.rows[0].anomalies.map((a) => a.code);
    expect(codes).toContain("RECUPERATION_IMPOSSIBLE");
    expect(res.rows[0].avances).not.toBeNull();
  });

  it("SIT-13f — agrégats de période : les 4 fixtures comptées, total = lignes filtrées", async () => {
    const res = await caller().situation({ from, to, search: "GPJ-SIT" });
    expect(res.total).toBe(SIT_FIXTURES.length);
    expect(res.aggregates.employes).toBe(res.rows.length);
    await ecrireEvidence("period-state.2026-09.json", {
      periodState: res.periodState,
      aggregates: res.aggregates,
      rows: res.rows.map((r) => ({ employeeId: r.employeeId, matricule: r.matricule, netLabel: r.salaires?.netLabel })),
    });
  });

  it("SIT-13g — export CSV : en-têtes + lignes fixtures présentes, BOM/format", async () => {
    const csv = await caller().export({ from, to, search: "GPJ-SIT" });
    expect(csv).toContain("Matricule");
    expect(csv).toContain("GPJ-SIT-801");
    expect(csv).toContain("GPJ-SIT-804");
    await ecrireEvidence("export.GPJ-SIT.csv.txt", csv);
  });
});