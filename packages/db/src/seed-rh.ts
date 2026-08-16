import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { eq, and, desc, like } from "drizzle-orm";
import * as schema from "./schema";

requireLocalOrForced("db:seed:rh (seed-rh.ts)");

/**
 * RH-00 — SEED DES PARAMÈTRES RH PAR DÉFAUT (garage GPJ).
 * Idempotent : n'insère que ce qui manque (agence par agence).
 *
 * Contenu :
 *  1. Cycle « Atelier Standard » : Lun–Ven 07:30–18:00 (pause 13h–14h),
 *     Sam 07:30–12:00, Dim non travaillé
 *  2. Paramètres de présence : tolérance 5 min, arrondi 5 min, pause auto,
 *     plafond 8h/jour
 *  3. Types de congés standards
 *  4. Types de sanctions (échelle de gravité 1→5)
 *  5. Jours fériés camerounais (dates fixes, récurrents annuels)
 *  6. Paramètres généraux (préfixe GPJ + séquence calculée depuis l'existant)
 */

const LEAVE_TYPES = [
  { code: "CONGE_ANNUEL", name: "Congé annuel", isPaid: true, deductBalance: true, requiresDocument: false, color: "#2563eb" },
  { code: "MALADIE", name: "Maladie", isPaid: true, deductBalance: true, requiresDocument: true, color: "#dc2626" },
  { code: "MATERNITE", name: "Maternité", isPaid: true, deductBalance: true, requiresDocument: true, color: "#db2777" },
  { code: "PERMISSION", name: "Permission", isPaid: true, deductBalance: true, requiresDocument: false, color: "#16a34a" },
  { code: "SANS_SOLDE", name: "Sans solde", isPaid: false, deductBalance: true, requiresDocument: false, color: "#64748b" },
  { code: "FORMATION", name: "Formation", isPaid: true, deductBalance: false, requiresDocument: true, color: "#4f46e5" },
  { code: "AUTRE", name: "Autre", isPaid: false, deductBalance: false, requiresDocument: false, color: "#d97706" },
];

const SANCTION_TYPES = [
  { code: "AVERT_ORAL", name: "Avertissement oral", severityLevel: 1 },
  { code: "AVERT_ECRIT", name: "Avertissement écrit", severityLevel: 2 },
  { code: "MISE_A_PIED_1", name: "Mise à pied 1-3 jours", severityLevel: 3 },
  { code: "MISE_A_PIED_2", name: "Mise à pied 4-8 jours", severityLevel: 4 },
  { code: "LICENCIEMENT", name: "Licenciement", severityLevel: 5 },
];

// Fériés camerounais à date fixe (récurrents chaque année)
const PUBLIC_HOLIDAYS = [
  { date: "01-01", name: "Nouvel An" },
  { date: "11-02", name: "Fête de la Jeunesse" },
  { date: "01-05", name: "Fête du Travail" },
  { date: "20-05", name: "Fête Nationale" },
  { date: "15-08", name: "Assomption" },
  { date: "25-12", name: "Noël" },
];

const WEEK_SCHEDULES = [
  // 0 = dimanche … 6 = samedi
  { day: 1, start: "07:30", end: "18:00", breakStart: "13:00", breakEnd: "14:00", hours: "9.5" },
  { day: 2, start: "07:30", end: "18:00", breakStart: "13:00", breakEnd: "14:00", hours: "9.5" },
  { day: 3, start: "07:30", end: "18:00", breakStart: "13:00", breakEnd: "14:00", hours: "9.5" },
  { day: 4, start: "07:30", end: "18:00", breakStart: "13:00", breakEnd: "14:00", hours: "9.5" },
  { day: 5, start: "07:30", end: "18:00", breakStart: "13:00", breakEnd: "14:00", hours: "9.5" },
  { day: 6, start: "07:30", end: "12:00", breakStart: null, breakEnd: null, hours: "4.5" },
];

// RH-01 : référentiels du garage
const DEPARTMENTS = [
  { code: "DIR", name: "Direction" },
  { code: "ATELIER", name: "Atelier / Mécanique" },
  { code: "CARROSSERIE", name: "Carrosserie & Peinture" },
  { code: "MAGASIN", name: "Magasin & Pièces" },
  { code: "ACCUEIL", name: "Accueil & Secrétariat" },
  { code: "FINANCE", name: "Finance & Comptabilité" },
  { code: "RH", name: "Personnel / RH" },
];

const POSITIONS = [
  { code: "DIRECTEUR", name: "Directeur", dept: "DIR" },
  { code: "CHEF_ATELIER", name: "Chef des ateliers", dept: "ATELIER" },
  { code: "TECHNICIEN", name: "Technicien / Mécanicien", dept: "ATELIER" },
  { code: "ELECTRICIEN", name: "Électricien auto", dept: "ATELIER" },
  { code: "CARROSSIER", name: "Carrossier", dept: "CARROSSERIE" },
  { code: "PEINTRE", name: "Peintre", dept: "CARROSSERIE" },
  { code: "MAGASINIER", name: "Magasinier", dept: "MAGASIN" },
  { code: "VENDEUR_PIECES", name: "Vendeur pièces détachées", dept: "MAGASIN" },
  { code: "SECRETAIRE", name: "Secrétaire / Accueil", dept: "ACCUEIL" },
  { code: "COMPTABLE", name: "Comptable", dept: "FINANCE" },
  { code: "RESP_RH", name: "Responsable RH", dept: "RH" },
];

const CONTRACT_TYPES = [
  { code: "CDI", name: "Contrat à durée indéterminée" },
  { code: "CDD", name: "Contrat à durée déterminée" },
  { code: "STAGE", name: "Stage" },
  { code: "APPRENTI", name: "Apprentissage" },
  { code: "JOURNALIER", name: "Journalier" },
  { code: "PRESTATAIRE", name: "Prestataire" },
];

// RH-04 : éléments de paie paramétrables (aucune formule en dur)
const PAYROLL_ITEMS = [
  { code: "PRIME_PRESENCE", name: "Prime de présence", type: "earning", method: "percent", params: { percent: 10, minAttendancePct: 95 }, sortOrder: 10 },
  { code: "PRIME_PERFORMANCE", name: "Prime de performance", type: "earning", method: "manual", params: {}, sortOrder: 20 },
  { code: "HS", name: "Heures supplémentaires (majorées)", type: "earning", method: "hours_x_rate", params: { rate: 1.25 }, sortOrder: 30 },
  { code: "PRIME_TRANSPORT", name: "Prime de transport", type: "earning", method: "fixed", params: { amount: 0 }, sortOrder: 40 },
  { code: "RETENUE_ABSENCE", name: "Absences non justifiées", type: "deduction", method: "absent_days", params: { daysPerMonth: 26 }, sortOrder: 50 },
  { code: "AVANCE", name: "Avance sur salaire", type: "deduction", method: "manual", params: {}, sortOrder: 60 },
  { code: "CNPS_EMPLOYE", name: "CNPS — part salariale", type: "deduction", method: "percent", params: { percent: 4.5 }, sortOrder: 70 },
  { code: "CNPS_EMPLOYEUR", name: "CNPS — part patronale", type: "deduction", method: "percent", params: { percent: 5.6 }, sortOrder: 71 },
  { code: "IRPP", name: "IRPP (barème progressif)", type: "deduction", method: "scale", params: { scale: [
    { max: 40000, rate: 0 },
    { max: 120000, rate: 10 },
    { max: 300000, rate: 15 },
    { max: 500000, rate: 25 },
    { max: null, rate: 35 },
  ] }, sortOrder: 80 },
];

// RH-05 : grille d'évaluation Technicien (6 critères pondérés) + barème prime
const EVALUATION_GRID_TECHNICIEN = [
  { name: "Qualité technique", weight: 30 },
  { name: "Rapidité d'exécution", weight: 20 },
  { name: "Propreté du poste", weight: 15 },
  { name: "Respect des consignes", weight: 15 },
  { name: "Esprit d'équipe", weight: 10 },
  { name: "Relation client", weight: 10 },
];

const BONUS_RULES = [
  { minScore: 4.5, maxScore: 5.0, bonusAmount: 20000 },
  { minScore: 4.0, maxScore: 4.49, bonusAmount: 15000 },
  { minScore: 3.5, maxScore: 3.99, bonusAmount: 10000 },
  { minScore: 3.0, maxScore: 3.49, bonusAmount: 5000 },
  { minScore: 0, maxScore: 2.99, bonusAmount: 0 },
];

// RH-06 : référentiel de compétences du garage + niveaux requis par poste + catalogue de formations
const SKILLS = [
  { code: "DIAG_ELEC", name: "Diagnostic électronique", category: "Atelier", description: "Lecture et interprétation des calculateurs, valise de diagnostic" },
  { code: "MECA_MOTEUR", name: "Mécanique moteur", category: "Atelier", description: "Réparation et entretien moteurs essence et diesel" },
  { code: "TRANSMISSION", name: "Transmission auto", category: "Atelier", description: "Boîtes de vitesses, embrayages, ponts" },
  { code: "CLIM_AUTO", name: "Climatisation automobile", category: "Atelier", description: "Maintenance et recharge des systèmes de climatisation" },
  { code: "SOUDURE", name: "Soudure", category: "Carrosserie", description: "Soudure à l'arc et MIG sur tôlerie" },
  { code: "PEINTURE", name: "Peinture automobile", category: "Carrosserie", description: "Préparation de surface, cabine et retouches" },
  { code: "ELECTRICITE", name: "Électricité auto", category: "Atelier", description: "Circuits électriques, éclairage, démarreurs" },
  { code: "ACCUEIL_CLIENT", name: "Accueil client", category: "Accueil", description: "Réception client, devis, suivi des dossiers" },
  { code: "FACTURATION", name: "Facturation & encaissement", category: "Finance", description: "Émission de factures, encaissements et clôtures de caisse" },
  { code: "GESTION_STOCK", name: "Gestion du stock", category: "Magasin", description: "Réceptions, inventaires, sorties de pièces" },
];

const POSITION_REQUIRED_SKILLS: Record<string, Array<{ skill: string; level: number }>> = {
  DIRECTEUR: [{ skill: "FACTURATION", level: 3 }],
  CHEF_ATELIER: [
    { skill: "DIAG_ELEC", level: 4 },
    { skill: "MECA_MOTEUR", level: 4 },
    { skill: "TRANSMISSION", level: 3 },
    { skill: "ELECTRICITE", level: 3 },
  ],
  TECHNICIEN: [
    { skill: "DIAG_ELEC", level: 3 },
    { skill: "MECA_MOTEUR", level: 4 },
    { skill: "TRANSMISSION", level: 3 },
    { skill: "CLIM_AUTO", level: 3 },
    { skill: "ELECTRICITE", level: 3 },
  ],
  CARROSSIER: [
    { skill: "SOUDURE", level: 4 },
    { skill: "PEINTURE", level: 3 },
  ],
  MAGASINIER: [{ skill: "GESTION_STOCK", level: 4 }],
  SECRETAIRE: [{ skill: "ACCUEIL_CLIENT", level: 4 }],
  COMPTABLE: [{ skill: "FACTURATION", level: 4 }],
};

const TRAININGS = [
  { title: "Formation diagnostic électronique embarqué", description: "Valise de diagnostic, codes défauts, oscilloscope", provider: "externe", durationHours: 40, skills: ["DIAG_ELEC"] },
  { title: "Formation climatisation automobile", description: "Réglementation des fluides, recharge, fuites", provider: "externe", durationHours: 24, skills: ["CLIM_AUTO"] },
  { title: "Formation soudure MIG/TIG", description: "Techniques de soudure sur tôlerie mince", provider: "interne", durationHours: 30, skills: ["SOUDURE"] },
  { title: "Formation accueil et relation client", description: "Standards d'accueil, devis, suivi client", provider: "interne", durationHours: 12, skills: ["ACCUEIL_CLIENT"] },
  { title: "Formation gestion des stocks", description: "Inventaire, réceptions, outils du magasin", provider: "interne", durationHours: 16, skills: ["GESTION_STOCK"] },
];

// RH-08 : types de documents RH paramétrables
const DOCUMENT_TYPES = [
  { code: "CONTRAT", name: "Contrat de travail", hasExpiration: true },
  { code: "AVENANT", name: "Avenant", hasExpiration: false },
  { code: "PIECE_IDENTITE", name: "CIN / Passeport", hasExpiration: true },
  { code: "CNPS", name: "Attestation CNPS", hasExpiration: false },
  { code: "ATTESTATION", name: "Attestation", hasExpiration: false },
  { code: "CERTIFICAT_FORMATION", name: "Certificat de formation", hasExpiration: false },
  { code: "COURRIER_DISCIPLINAIRE", name: "Courrier disciplinaire", hasExpiration: false },
  { code: "AUTRE", name: "Autre", hasExpiration: false },
];

async function main() {
  const agences = await db.select().from(schema.agences).where(eq(schema.agences.isActive, true)).orderBy(schema.agences.id);
  if (agences.length === 0) {
    console.error("Aucune agence active — exécutez d'abord db:seed:install");
    process.exit(1);
  }

  for (const agence of agences) {
    console.log(`\n=== Paramètres RH — ${agence.nom} (id ${agence.id}) ===`);

    // 1. Cycle Atelier Standard + horaires
    const [existingCycle] = await db
      .select({ id: schema.hrWorkCycles.id })
      .from(schema.hrWorkCycles)
      .where(and(eq(schema.hrWorkCycles.agenceId, agence.id), eq(schema.hrWorkCycles.isDefault, true)))
      .limit(1);

    let cycleId: number;
    if (existingCycle) {
      cycleId = existingCycle.id;
      console.log("Cycle Atelier Standard : déjà présent, inchangé.");
    } else {
      const [cycle] = await db
        .insert(schema.hrWorkCycles)
        .values({ name: "Atelier Standard", description: "Cycle par défaut du garage (Lun–Ven 07h30–18h, Sam 07h30–12h)", isDefault: true, active: true, agenceId: agence.id })
        .returning();
      cycleId = cycle.id;
      console.log("Cycle Atelier Standard créé.");

      for (const s of WEEK_SCHEDULES) {
        await db.insert(schema.hrWorkSchedules).values({
          cycleId,
          dayOfWeek: s.day,
          startTime: s.start,
          endTime: s.end,
          breakStart: s.breakStart,
          breakEnd: s.breakEnd,
          expectedHours: s.hours,
          isWorkingDay: true,
        });
      }
      console.log("Horaires de la semaine insérés (5×9h30 + samedi 4h30).");
    }

    // 2. Paramètres de présence (un seul par agence)
    const [existingAttendance] = await db
      .select({ id: schema.hrAttendanceSettings.id })
      .from(schema.hrAttendanceSettings)
      .where(eq(schema.hrAttendanceSettings.agenceId, agence.id))
      .limit(1);
    if (!existingAttendance) {
      await db.insert(schema.hrAttendanceSettings).values({
        agenceId: agence.id,
        lateToleranceMinutes: 5,
        roundToMinutes: 5,
        autoDeductBreak: true,
        countEarlyArrival: false,
        maxNormalHoursPerDay: "8.5",
      });
      console.log("Paramètres de présence créés (tolérance 5 min, arrondi 5 min, plafond 8h30).");
    } else {
      await db
        .update(schema.hrAttendanceSettings)
        .set({ maxNormalHoursPerDay: "8.5" })
        .where(eq(schema.hrAttendanceSettings.id, existingAttendance.id));
      console.log("Paramètres de présence vérifiés (plafond 8h30).");
    }

    // 3. Types de congés
    for (const lt of LEAVE_TYPES) {
      const [existing] = await db
        .select({ id: schema.hrLeaveTypes.id })
        .from(schema.hrLeaveTypes)
        .where(and(eq(schema.hrLeaveTypes.agenceId, agence.id), eq(schema.hrLeaveTypes.code, lt.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.hrLeaveTypes).values({ ...lt, agenceId: agence.id });
      }
    }
    console.log(`Types de congés vérifiés (${LEAVE_TYPES.length} standards).`);

    // 4. Types de sanctions
    for (const st of SANCTION_TYPES) {
      const [existing] = await db
        .select({ id: schema.hrSanctionTypes.id })
        .from(schema.hrSanctionTypes)
        .where(and(eq(schema.hrSanctionTypes.agenceId, agence.id), eq(schema.hrSanctionTypes.code, st.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.hrSanctionTypes).values({ ...st, agenceId: agence.id });
      }
    }
    console.log(`Types de sanctions vérifiés (${SANCTION_TYPES.length} standards).`);

    // 5. Jours fériés (récurrents annuels, année courante)
    const year = new Date().getFullYear();
    for (const h of PUBLIC_HOLIDAYS) {
      const fullDate = `${year}-${h.date}`;
      const [existing] = await db
        .select({ id: schema.hrPublicHolidays.id })
        .from(schema.hrPublicHolidays)
        .where(and(eq(schema.hrPublicHolidays.agenceId, agence.id), eq(schema.hrPublicHolidays.date, fullDate)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.hrPublicHolidays).values({ date: fullDate, name: h.name, isRecurringYearly: true, agenceId: agence.id });
      }
    }
    console.log(`Jours fériés vérifiés (${PUBLIC_HOLIDAYS.length} fixes ${year}).`);

    // 6. Paramètres généraux : préfixe + séquence calculée depuis l'existant
    const [existingGeneral] = await db
      .select({ id: schema.hrGeneralSettings.id })
      .from(schema.hrGeneralSettings)
      .where(eq(schema.hrGeneralSettings.agenceId, agence.id))
      .limit(1);

    const [maxMatricule] = await db
      .select({ matricule: schema.employes.matricule })
      .from(schema.employes)
      .where(like(schema.employes.matricule, `GPJ-${year}-%`))
      .orderBy(desc(schema.employes.matricule))
      .limit(1);
    let nextSequence = 1;
    if (maxMatricule?.matricule) {
      const seq = Number(maxMatricule.matricule.split("-").pop() ?? 0);
      if (!Number.isNaN(seq)) nextSequence = seq + 1;
    }

    if (existingGeneral) {
      await db
        .update(schema.hrGeneralSettings)
        .set({ employeeCodeSequence: nextSequence, updatedAt: new Date() })
        .where(eq(schema.hrGeneralSettings.id, existingGeneral.id));
      console.log(`Paramètres généraux mis à jour (séquence matricule → ${nextSequence}).`);
    } else {
      await db.insert(schema.hrGeneralSettings).values({
        agenceId: agence.id,
        employeeCodePrefix: "GPJ",
        employeeCodeSequence: nextSequence,
        timezone: "Africa/Douala",
        currency: agence.devise || "XAF",
        evaluationEnabled: true,
        evaluationFrequency: "trimestrielle",
      });
      console.log(`Paramètres généraux créés (préfixe GPJ, séquence → ${nextSequence}).`);
    }

    // 7. RH-01 : départements
    const deptIds = new Map<string, number>();
    for (const d of DEPARTMENTS) {
      const [existing] = await db
        .select({ id: schema.departments.id })
        .from(schema.departments)
        .where(and(eq(schema.departments.agenceId, agence.id), eq(schema.departments.code, d.code)))
        .limit(1);
      if (existing) {
        deptIds.set(d.code, existing.id);
      } else {
        const [row] = await db
          .insert(schema.departments)
          .values({ ...d, agenceId: agence.id })
          .returning();
        deptIds.set(d.code, row.id);
      }
    }
    console.log(`Départements vérifiés (${DEPARTMENTS.length}).`);

    // 8. RH-01 : postes (liés au département)
    for (const p of POSITIONS) {
      const [existing] = await db
        .select({ id: schema.positions.id })
        .from(schema.positions)
        .where(and(eq(schema.positions.agenceId, agence.id), eq(schema.positions.code, p.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.positions).values({
          code: p.code,
          name: p.name,
          departmentId: deptIds.get(p.dept) ?? null,
          agenceId: agence.id,
        });
      }
    }
    console.log(`Postes vérifiés (${POSITIONS.length}).`);

    // 9. RH-01 : types de contrat
    for (const c of CONTRACT_TYPES) {
      const [existing] = await db
        .select({ id: schema.contractTypes.id })
        .from(schema.contractTypes)
        .where(and(eq(schema.contractTypes.agenceId, agence.id), eq(schema.contractTypes.code, c.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.contractTypes).values({ ...c, agenceId: agence.id });
      }
    }
    console.log(`Types de contrat vérifiés (${CONTRACT_TYPES.length}).`);

    // 10. RH-04 : éléments de paie paramétrables
    for (const item of PAYROLL_ITEMS) {
      const [existing] = await db
        .select({ id: schema.payrollItemsConfig.id })
        .from(schema.payrollItemsConfig)
        .where(and(eq(schema.payrollItemsConfig.agenceId, agence.id), eq(schema.payrollItemsConfig.code, item.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.payrollItemsConfig).values({ ...item, agenceId: agence.id } as any);
      } else if (item.code === "IRPP") {
        // mise à jour du barème IRPP (méthode scale)
        await db
          .update(schema.payrollItemsConfig)
          .set({ method: "scale", params: item.params } as any)
          .where(eq(schema.payrollItemsConfig.id, existing.id));
      }
    }
    console.log(`Éléments de paie vérifiés (${PAYROLL_ITEMS.length}).`);

    // 11. RH-05 : grille d'évaluation Technicien + critères pondérés
    const [techGrid] = await db
      .select({ id: schema.evaluationGrids.id })
      .from(schema.evaluationGrids)
      .where(and(eq(schema.evaluationGrids.agenceId, agence.id), eq(schema.evaluationGrids.name, "Technicien")))
      .limit(1);
    let gridId: number | null = null;
    if (techGrid) {
      gridId = techGrid.id;
    } else {
      const [grid] = await db
        .insert(schema.evaluationGrids)
        .values({ name: "Technicien", scale: "1-5", agenceId: agence.id })
        .returning();
      gridId = grid.id;
    }
    if (gridId !== null) {
      for (const [i, c] of EVALUATION_GRID_TECHNICIEN.entries()) {
        const [existing] = await db
          .select({ id: schema.evaluationCriteria.id })
          .from(schema.evaluationCriteria)
          .where(and(eq(schema.evaluationCriteria.gridId, gridId), eq(schema.evaluationCriteria.name, c.name)))
          .limit(1);
        if (!existing) {
          await db.insert(schema.evaluationCriteria).values({
            gridId,
            name: c.name,
            weight: String(c.weight),
            maxScore: "5",
            sortOrder: i,
          } as any);
        }
      }
    }
    console.log(`Grille d'évaluation « Technicien » vérifiée (${EVALUATION_GRID_TECHNICIEN.length} critères).`);

    // 12. RH-05 : barème de prime de performance
    for (const rule of BONUS_RULES) {
      const [existing] = await db
        .select({ id: schema.performanceBonusRules.id })
        .from(schema.performanceBonusRules)
        .where(
          and(
            eq(schema.performanceBonusRules.agenceId, agence.id),
            eq(schema.performanceBonusRules.minScore, String(rule.minScore)),
          )
        )
        .limit(1);
      if (!existing) {
        await db.insert(schema.performanceBonusRules).values({
          minScore: String(rule.minScore),
          maxScore: String(rule.maxScore),
          bonusAmount: String(rule.bonusAmount),
          agenceId: agence.id,
        } as any);
      }
    }
    console.log(`Barème de prime de performance vérifié (${BONUS_RULES.length} tranches).`);

    // 13. RH-06 : référentiel de compétences
    const skillIds: Record<string, number> = {};
    for (const s of SKILLS) {
      const [existing] = await db
        .select({ id: schema.skills.id })
        .from(schema.skills)
        .where(and(eq(schema.skills.agenceId, agence.id), eq(schema.skills.code, s.code)))
        .limit(1);
      if (existing) {
        skillIds[s.code] = existing.id;
      } else {
        const [row] = await db.insert(schema.skills).values({
          code: s.code,
          name: s.name,
          category: s.category,
          description: s.description,
          agenceId: agence.id,
        } as any).returning() as any;
        skillIds[s.code] = row.id;
      }
    }
    console.log(`Référentiel de compétences vérifié (${SKILLS.length}).`);

    // 14. RH-06 : compétences requises par poste
    const positionByCode: Record<string, number> = {};
    const allPositions = await db.select({ id: schema.positions.id, code: schema.positions.code })
      .from(schema.positions)
      .where(eq(schema.positions.agenceId, agence.id));
    for (const p of allPositions) positionByCode[p.code] = p.id;

    for (const [posCode, reqs] of Object.entries(POSITION_REQUIRED_SKILLS)) {
      const positionId = positionByCode[posCode];
      if (!positionId) continue;
      for (const r of reqs) {
        const skillId = skillIds[r.skill];
        if (!skillId) continue;
        const [existing] = await db
          .select({ id: schema.positionSkills.id })
          .from(schema.positionSkills)
          .where(and(eq(schema.positionSkills.positionId, positionId), eq(schema.positionSkills.skillId, skillId)))
          .limit(1);
        if (!existing) {
          await db.insert(schema.positionSkills).values({
            positionId,
            skillId,
            requiredLevel: r.level,
          } as any);
        }
      }
    }
    console.log("Compétences requises par poste vérifiées.");

    // 15. RH-06 : catalogue de formations
    for (const t of TRAININGS) {
      const [existing] = await db
        .select({ id: schema.trainings.id })
        .from(schema.trainings)
        .where(and(eq(schema.trainings.agenceId, agence.id), eq(schema.trainings.title, t.title)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.trainings).values({
          title: t.title,
          description: t.description,
          provider: t.provider,
          durationHours: String(t.durationHours),
          skillIds: t.skills.map((c) => skillIds[c]).filter(Boolean),
          agenceId: agence.id,
        } as any);
      }
    }
    console.log(`Catalogue de formations vérifié (${TRAININGS.length}).`);

    // 16. RH-08 : types de documents paramétrables
    for (const dt of DOCUMENT_TYPES) {
      const [existing] = await db
        .select({ id: schema.hrDocumentTypes.id })
        .from(schema.hrDocumentTypes)
        .where(and(eq(schema.hrDocumentTypes.agenceId, agence.id), eq(schema.hrDocumentTypes.code, dt.code)))
        .limit(1);
      if (!existing) {
        await db.insert(schema.hrDocumentTypes).values({
          code: dt.code,
          name: dt.name,
          hasExpiration: dt.hasExpiration,
          agenceId: agence.id,
        } as any);
      }
    }
    console.log(`Types de documents vérifiés (${DOCUMENT_TYPES.length}).`);
  }

  console.log("\n=== Seed RH terminé ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
