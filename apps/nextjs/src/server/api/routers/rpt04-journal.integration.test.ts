import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

/**
 * RPT-04 — Integration DB -> RPT-01 -> moteur -> API, sur la base REELLE.
 *
 * LECTURE : ne cree rien. Elle consomme les evenements produits par RPT-01
 * (`attendance_entries`, `attendance_calculations`, `absences`).
 *
 * ECRITURE : uniquement le workflow RPT-04 (`rh_absence_justifications`,
 * `rh_absence_justification_decisions`, `rh_audit_logs`). Ni `attendance_entries`,
 * ni `absences`, ni les projections ne sont reecrites : c'est verifie par comptage
 * avant/apres. Toutes les lignes de test sont supprimees en fin de fichier.
 *
 * L'habilitation est simulee (aucun role reel ne peut a la fois deposer et
 * decider pour ce test de separation des pouvoirs) ; le tenant, la cloture, les
 * contraintes FK et le moteur, eux, sont REELS.
 */

const droits = new Set<string>();
let roleCourant: "rh" | "consultation" | "superadmin" = "rh";

vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: {
    isSuperAdmin: async () => roleCourant === "superadmin",
    hasPermission: async (_id: string, code: string) => roleCourant === "superadmin" || droits.has(code),
  },
}));

import { and, eq, inArray } from "drizzle-orm";
import {
  absences,
  attendanceEntries,
  rhAbsenceJustificationDecisions,
  rhAbsenceJustifications,
  rhAuditLogs,
} from "@atelierone/db";
import type { ExtendedUser } from "@atelierone/auth/types";

import { db } from "~/server/db";
import { rhJournalRouter } from "./rh-journal";

const AGENCE = 1;
const EMPLOYE = 14;
const MATRICULE = "GPJ-2026-9018";
const DATE_OUVERTE = "2026-08-28"; // aout 2026 : 0 resume verrouille
const DATE_CLOTUREE = "2026-09-15"; // septembre 2026 : 30/30 resumes verrouilles
const DEBUT_AOUT = "2026-08-01";
const FIN_AOUT = "2026-08-31";
const EVENT_ID = `journal:${EMPLOYE}:${DATE_OUVERTE}`;

/** Utilisateurs REELS de l'agence 1 (FK `utilisateurs.id` sur depose_par / acteur_id). */
const ID_RH = "8"; // depot
const ID_DIRECTEUR = "2"; // decision
const ID_LECTEUR = "9"; // lecture seule

const PERMISSIONS_RH = ["rh.presence.consulter", "rh.absence.justifier", "rh.absence.valider"];

function ctxDe(userId: string, role: ExtendedUser["role"] = "rh") {
  const user: ExtendedUser = {
    id: userId,
    email: `${userId}@gpj.cm`,
    name: `User ${userId}`,
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

const deposant = () => rhJournalRouter.createCaller(ctxDe(ID_RH) as never);
const decideur = () => rhJournalRouter.createCaller(ctxDe(ID_DIRECTEUR) as never);
const lecteur = () => rhJournalRouter.createCaller(ctxDe(ID_LECTEUR) as never);

async function nettoyer() {
  const ids = await db
    .select({ id: rhAbsenceJustifications.id })
    .from(rhAbsenceJustifications)
    .where(
      and(
        eq(rhAbsenceJustifications.agenceId, AGENCE),
        eq(rhAbsenceJustifications.employeeId, EMPLOYE),
        eq(rhAbsenceJustifications.date, DATE_OUVERTE)
      )
    );
  const liste = ids.map((r) => r.id);
  if (liste.length > 0) {
    await db
      .delete(rhAbsenceJustificationDecisions)
      .where(
        and(
          eq(rhAbsenceJustificationDecisions.agenceId, AGENCE),
          inArray(rhAbsenceJustificationDecisions.justificationId, liste)
        )
      );
    await db
      .delete(rhAbsenceJustifications)
      .where(
        and(
          eq(rhAbsenceJustifications.agenceId, AGENCE),
          eq(rhAbsenceJustifications.employeeId, EMPLOYE),
          eq(rhAbsenceJustifications.date, DATE_OUVERTE)
        )
      );
  }
  await db
    .delete(rhAuditLogs)
    .where(
      and(
        eq(rhAuditLogs.agenceId, AGENCE),
        eq(rhAuditLogs.entityType, "rh_absence_justification")
      )
    );
}

async function compterSources() {
  const [entrees, lignesAbsence, decisions, audits] = await Promise.all([
    db.select({ id: attendanceEntries.id }).from(attendanceEntries),
    db.select({ id: absences.id }).from(absences),
    db.select({ id: rhAbsenceJustificationDecisions.id }).from(rhAbsenceJustificationDecisions),
    db
      .select({ id: rhAuditLogs.id })
      .from(rhAuditLogs)
      .where(eq(rhAuditLogs.entityType, "rh_absence_justification")),
  ]);
  return {
    entries: entrees.length,
    absences: lignesAbsence.length,
    decisions: decisions.length,
    audits: audits.length,
  };
}

let avantSources: Awaited<ReturnType<typeof compterSources>>;

beforeAll(async () => {
  avantSources = await compterSources();
  await nettoyer();
});

afterAll(async () => {
  await nettoyer();
  const apres = await compterSources();
  // Les sources canoniques sont INTACTES : le workflow n'a rien reecrit.
  expect(apres.entries).toBe(avantSources.entries);
  expect(apres.absences).toBe(avantSources.absences);
  expect(apres.decisions).toBe(avantSources.decisions);
  expect(apres.audits).toBe(avantSources.audits);
});

beforeEach(async () => {
  await nettoyer();
  roleCourant = "rh";
  droits.clear();
  for (const p of PERMISSIONS_RH) droits.add(p);
});

// ─── §1 Lecture : le journal consomme RPT-01 ──────────────────────────────

describe("RPT-04 API — lecture du journal (base reelle)", () => {
  it("expose les lignes de la periode reelle, paginees", async () => {
    const res = await lecteur().liste({
      from: DEBUT_AOUT,
      to: FIN_AOUT,
      filtres: {},
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 50,
      avecReference: false,
    });

    expect(res.periode).toEqual({ from: DEBUT_AOUT, to: FIN_AOUT });
    expect(res.total).toBeGreaterThan(0);
    expect(res.lignes.length).toBeLessThanOrEqual(50);
    expect(res.pageCount).toBeGreaterThanOrEqual(1);
    for (const l of res.lignes) {
      expect(l.eventId).toBe(`journal:${l.employeeId}:${l.date}`);
      expect(l.rapportEventIds.length).toBeGreaterThan(0);
    }
  });

  it("la ligne reelle de l'employe 14 signale la validation fantome de l'absence", async () => {
    const res = await lecteur().liste({
      from: DEBUT_AOUT,
      to: FIN_AOUT,
      filtres: { employeeIds: [EMPLOYE] },
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 200,
      avecReference: false,
    });

    const ligne = res.lignes.find((l) => l.eventId === EVENT_ID);
    expect(ligne).toBeDefined();
    expect(ligne!.employeeId).toBe(EMPLOYE);
    expect(ligne!.matricule).toBe(MATRICULE);
    expect(ligne!.date).toBe(DATE_OUVERTE);
    expect(ligne!.justificatifStatut).toBe("AUCUN");
    // `absences.justifie = true` et `valide_par = null` : signale, jamais reecrit.
    expect(ligne!.anomalies.some((a) => a.code === "ANOMALIE_VALIDATION_SANS_AUTEUR")).toBe(true);
  });

  it("la reference RPT-03 est un bloc par employe, jamais un champ par ligne", async () => {
    const res = await lecteur().liste({
      from: DEBUT_AOUT,
      to: FIN_AOUT,
      filtres: {},
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 10,
      avecReference: true,
    });

    for (const l of res.lignes) {
      expect(l).not.toHaveProperty("sensibilisationImpact");
      expect(l).not.toHaveProperty("impactPercent");
    }
    expect(res.referenceSensibilisation.length).toBeGreaterThan(0);
    for (const ref of res.referenceSensibilisation) {
      expect(ref).toHaveProperty("estimatedImpact");
      expect(ref).toHaveProperty("impactPercent");
      expect(ref).toHaveProperty("salariesVisible");
    }
  });

  it("le detail d'une ligne est coherent avec la liste et n'a pas d'historique", async () => {
    const detail = await lecteur().detail({ eventId: EVENT_ID });
    expect(detail.eventId).toBe(EVENT_ID);
    expect(detail.employeeId).toBe(EMPLOYE);
    expect(detail.justificatifStatut).toBe("AUCUN");
    expect(detail.historique).toEqual([]);
  });

  it("un identifiant de journal mal forme est refuse", async () => {
    await expect(lecteur().detail({ eventId: "journal:14" })).rejects.toThrow(/invalide/i);
    await expect(lecteur().detail({ eventId: "journal:abc:2026-08-28" })).rejects.toThrow(/invalide/i);
  });

  it("la lecture reste possible sur une periode close (septembre 2026)", async () => {
    const res = await lecteur().liste({
      from: "2026-09-01",
      to: "2026-09-30",
      filtres: {},
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 20,
      avecReference: false,
    });
    expect(res.periode.to).toBe("2026-09-30");
    expect(res.total).toBeGreaterThan(0);
  });

  it("sans permission de lecture, l'API refuse l'appel", async () => {
    droits.clear();
    await expect(
      lecteur().liste({
        from: DEBUT_AOUT,
        to: FIN_AOUT,
        filtres: {},
        tri: "date",
        sens: "desc",
        page: 1,
        pageSize: 10,
        avecReference: false,
      })
    ).rejects.toThrow(/Permission manquante/);
  });

  it("sans permission justificatif, les pieces sont masquees mais le statut reste visible", async () => {
    roleCourant = "consultation";
    droits.clear();
    droits.add("rh.presence.consulter");

    const res = await lecteur().liste({
      from: DEBUT_AOUT,
      to: FIN_AOUT,
      filtres: { employeeIds: [EMPLOYE] },
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 50,
      avecReference: false,
    });

    const ligne = res.lignes.find((l) => l.eventId === EVENT_ID)!;
    expect(ligne.justificatifStatut).toBe("AUCUN");
    expect(ligne.justificatifMasque).toBe(true);
    expect(ligne.motif).toBeNull();
    expect(ligne.justificatifUrl).toBeNull();
  });

  it("avec permission justificatif, les pieces sont visibles", async () => {
    const res = await lecteur().liste({
      from: DEBUT_AOUT,
      to: FIN_AOUT,
      filtres: { employeeIds: [EMPLOYE] },
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 50,
      avecReference: false,
    });
    const ligne = res.lignes.find((l) => l.eventId === EVENT_ID)!;
    expect(ligne.justificatifMasque).toBe(false);
  });
});

// ─── §2 Workflow : depot -> decision -> historique ───────────────────────

describe("RPT-04 API — workflow du justificatif (aout 2026, periode ouverte)", () => {
  it("un depot passe le justificatif a FOURNI, sans decision", async () => {
    const res = await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifCode: "MALADIE",
      motifLibelle: "Certificat medical",
      justificatifReference: "RPT04-TEST-001",
      justificatifType: "PDF",
    });
    expect(res.statut).toBe("FOURNI");

    const detail = await decideur().detail({ eventId: EVENT_ID });
    expect(detail.justificatifStatut).toBe("FOURNI");
    expect(detail.deposePar).toBe(Number(ID_RH));
    expect(detail.deposeAt).not.toBeNull();
    expect(detail.decisionPar).toBeNull();
    expect(detail.decisionAt).toBeNull();
    expect(detail.historique).toHaveLength(1);
    expect(detail.historique[0].action).toBe("DEPOT");
    expect(detail.historique[0].ancienStatut).toBeNull();
    expect(detail.historique[0].nouveauStatut).toBe("FOURNI");
    expect(detail.historique[0].acteurId).toBe(Number(ID_RH));
  });

  it("le deposant ne peut PAS statuer sur son propre justificatif", async () => {
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat medical",
    });
    await expect(
      deposant().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE })
    ).rejects.toThrow(/[Ss]eparation des pouvoirs/);
    await expect(
      deposant().rejectJustificatif({
        employeeId: EMPLOYE,
        date: DATE_OUVERTE,
        refusMotif: "Document illisible",
      })
    ).rejects.toThrow(/[Ss]eparation des pouvoirs/);
  });

  it("un second decideur valide : decision_par et decision_at sont ports", async () => {
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat medical",
      justificatifReference: "RPT04-TEST-002",
    });
    const res = await decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE });
    expect(res.statut).toBe("VALIDE");

    const detail = await decideur().detail({ eventId: EVENT_ID });
    expect(detail.justificatifStatut).toBe("VALIDE");
    expect(detail.decisionPar).toBe(Number(ID_DIRECTEUR));
    expect(detail.decisionAt).not.toBeNull();
    expect(detail.historique.map((h) => h.action)).toEqual(["DEPOT", "VALIDATION"]);
  });

  it("un refus exige un motif et conserve le refus dans l'historique", async () => {
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat medical",
    });
    await expect(
      decideur().rejectJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE, refusMotif: "" })
    ).rejects.toThrow();

    const res = await decideur().rejectJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      refusMotif: "Document illisible",
    });
    expect(res.statut).toBe("REFUSE");

    const detail = await decideur().detail({ eventId: EVENT_ID });
    expect(detail.refusMotif).toBe("Document illisible");
    expect(detail.historique.map((h) => h.action)).toEqual(["DEPOT", "REFUS"]);
    expect(detail.historique[1].motif).toBe("Document illisible");
    expect(detail.historique[1].ancienStatut).toBe("FOURNI");
    expect(detail.historique[1].nouveauStatut).toBe("REFUSE");
  });

  it("un second depot est une CORRECTION : l'historique n'est jamais ecrase", async () => {
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat medical",
    });
    await decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE });
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat de remplacement",
    });

    const detail = await decideur().detail({ eventId: EVENT_ID });
    expect(detail.justificatifStatut).toBe("FOURNI");
    expect(detail.decisionPar).toBeNull();
    expect(detail.historique.map((h) => h.action)).toEqual(["DEPOT", "VALIDATION", "CORRECTION"]);
    expect(detail.historique[1].nouveauStatut).toBe("VALIDE");
    expect(detail.historique[2].ancienStatut).toBe("VALIDE");
    expect(detail.historique[2].motif).toBe("Certificat de remplacement");
  });

  it("les decisions deja prises restent identiques apres une nouvelle decision", async () => {
    await deposant().submitJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE, motifLibelle: "A" });
    await decideur().rejectJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      refusMotif: "Mauvais document",
    });
    const apresRefus = await decideur().detail({ eventId: EVENT_ID });
    const prefixeRefus = JSON.stringify(apresRefus.historique.slice(0, 2));

    await deposant().submitJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE, motifLibelle: "B" });
    await decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE });

    const final = await decideur().detail({ eventId: EVENT_ID });
    expect(final.historique).toHaveLength(4);
    expect(JSON.stringify(final.historique.slice(0, 2))).toBe(prefixeRefus);
    expect(final.historique.map((h) => h.action)).toEqual([
      "DEPOT",
      "REFUS",
      "CORRECTION",
      "VALIDATION",
    ]);
  });

  it("decider sans justificatif existant est refuse", async () => {
    await expect(
      decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE })
    ).rejects.toThrow(/[Aa]ucun justificatif/);
    await expect(
      decideur().rejectJustificatif({
        employeeId: EMPLOYE,
        date: DATE_OUVERTE,
        refusMotif: "Document illisible",
      })
    ).rejects.toThrow(/[Aa]ucun justificatif/);
  });

  it("deposer pour un employe d'une autre agence est refuse (tenant)", async () => {
    await expect(
      deposant().submitJustificatif({ employeeId: 999999, date: DATE_OUVERTE, motifLibelle: "X" })
    ).rejects.toThrow(/introuvable/i);
  });

  it("deposer ou decider sans la permission est refuse", async () => {
    roleCourant = "consultation";
    droits.clear();
    droits.add("rh.presence.consulter");
    await expect(
      deposant().submitJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE, motifLibelle: "X" })
    ).rejects.toThrow(/Permission manquante/);
    await expect(
      decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE })
    ).rejects.toThrow(/Permission manquante/);
  });

  it("chaque mutation laisse une trace dans rh_audit_logs", async () => {
    await deposant().submitJustificatif({
      employeeId: EMPLOYE,
      date: DATE_OUVERTE,
      motifLibelle: "Certificat medical",
    });
    await decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_OUVERTE });

    const logs = await db
      .select()
      .from(rhAuditLogs)
      .where(
        and(
          eq(rhAuditLogs.agenceId, AGENCE),
          eq(rhAuditLogs.entityType, "rh_absence_justification")
        )
      );

    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l) => l.action === "JUSTIFICATIF_DEPOT")).toBe(true);
    expect(logs.some((l) => l.action === "JUSTIFICATIF_VALIDE")).toBe(true);
    for (const l of logs) {
      expect(l.motif.trim().length).toBeGreaterThan(0);
      expect(l.userId).not.toBeNull();
    }
  });
});

// ─── §3 Protection de cloture (septembre 2026 verrouille) ────────────────

describe("RPT-04 API — protection de cloture", () => {
  it("aucune mutation n'est acceptee sur le mois verrouille", async () => {
    await expect(
      deposant().submitJustificatif({ employeeId: EMPLOYE, date: DATE_CLOTUREE, motifLibelle: "X" })
    ).rejects.toThrow(/clotur/i);
    await expect(
      decideur().validateJustificatif({ employeeId: EMPLOYE, date: DATE_CLOTUREE })
    ).rejects.toThrow(/clotur/i);
    await expect(
      decideur().rejectJustificatif({
        employeeId: EMPLOYE,
        date: DATE_CLOTUREE,
        refusMotif: "Document illisible",
      })
    ).rejects.toThrow(/clotur/i);
  });

  it("aucun justificatif n'a ete ecrit sur la periode close", async () => {
    const rows = await db
      .select()
      .from(rhAbsenceJustifications)
      .where(
        and(
          eq(rhAbsenceJustifications.agenceId, AGENCE),
          eq(rhAbsenceJustifications.employeeId, EMPLOYE),
          eq(rhAbsenceJustifications.date, DATE_CLOTUREE)
        )
      );
    expect(rows).toHaveLength(0);
  });
});
