import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import {
  employes,
  payrollEntries,
  payrollEntryLines,
  payrollPeriods,
} from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { jsPDF } from "jspdf";

export const dynamic = "force-dynamic";

const fmtFCFA = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

/** RH-04 — PDF du bulletin de paie (modèle camerounais) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  const [entry] = await db
    .select({
      id: payrollEntries.id,
      employeeId: payrollEntries.employeeId,
      baseSalary: payrollEntries.baseSalary,
      normalHours: payrollEntries.normalHours,
      overtimeHours: payrollEntries.overtimeHours,
      daysPresent: payrollEntries.daysPresent,
      daysAbsent: payrollEntries.daysAbsent,
      totalEarnings: payrollEntries.totalEarnings,
      deductions: payrollEntries.deductions,
      cnpsEmployee: payrollEntries.cnpsEmployee,
      cnpsEmployer: payrollEntries.cnpsEmployer,
      netImposable: payrollEntries.netImposable,
      irpp: payrollEntries.irpp,
      netPay: payrollEntries.netPay,
      paymentMethod: payrollEntries.paymentMethod,
      status: payrollEntries.status,
      periodId: payrollEntries.periodId,
      employeNom: employes.nom,
      employePrenom: employes.prenom,
      matricule: employes.matricule,
      fonction: employes.fonction,
      numCnss: employes.numCnss,
      dateEmbauche: employes.dateEmbauche,
    })
    .from(payrollEntries)
    .innerJoin(employes, eq(payrollEntries.employeeId, employes.id))
    .where(and(eq(payrollEntries.id, entryId), eq(employes.agenceId, session.user.agenceId)))
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });
  }

  const e = entry as unknown as {
    id: number;
    baseSalary: string;
    normalHours: string;
    overtimeHours: string;
    daysPresent: number;
    daysAbsent: number;
    totalEarnings: string;
    deductions: string;
    cnpsEmployee: string;
    cnpsEmployer: string;
    netImposable: string;
    irpp: string;
    netPay: string;
    paymentMethod: string;
    status: string;
    periodId: number;
    employeNom: string;
    employePrenom: string;
    matricule: string;
    fonction: string | null;
    numCnss: string | null;
    dateEmbauche: string | null;
  };
  const agenceName = session.user.agenceName ?? "AtelierOne";

  const [period] = await db
    .select({ startDate: payrollPeriods.startDate, endDate: payrollPeriods.endDate })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, e.periodId))
    .limit(1);

  const lines = (await db
    .select()
    .from(payrollEntryLines)
    .where(eq(payrollEntryLines.payrollEntryId, entryId))
    .orderBy(payrollEntryLines.sortOrder)) as unknown as Array<{
    label: string;
    amount: string;
    direction: string;
  }>;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - 14;

  // ── En-tête employeur ──
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("ATELIERONE", 14, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(agenceName, 14, 21);
  doc.text("Yaoundé — Cameroun", 14, 26);

  // ── Titre + période ──
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("BULLETIN DE PAIE", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Période : ${period?.startDate ?? "-"} → ${period?.endDate ?? "-"}`,
    pageWidth / 2,
    22,
    { align: "center" }
  );

  // ── Identité employé ──
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Identité de l'employé", 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${e.employePrenom} ${e.employeNom}`, 14, 45);
  doc.text(`Matricule : ${e.matricule}`, 14, 51);
  doc.text(`Poste : ${e.fonction ?? "-"}`, 14, 57);
  doc.text(`Date d'embauche : ${e.dateEmbauche ?? "-"}`, 14, 63);
  doc.text(`N° CNSS : ${e.numCnss ?? "—"}`, right, 45, { align: "right" });
  doc.text(`Présences : ${e.daysPresent} j | Absences : ${e.daysAbsent} j`, right, 51, { align: "right" });
  doc.text(`Heures normales : ${e.normalHours}h | HS : ${e.overtimeHours}h`, right, 57, { align: "right" });

  // ── Lignes ──
  let y = 74;
  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.line(14, y - 3, right, y - 3);
  doc.setFont("helvetica", "bold");
  doc.text("Désignation", 14, y);
  doc.text("Montant (FCFA)", right, y, { align: "right" });
  doc.line(14, y + 1, right, y + 1);
  y += 8;
  doc.setFont("helvetica", "normal");

  for (const line of lines) {
    const amount = line.direction === "retenue" ? `-${fmtFCFA(line.amount)}` : fmtFCFA(line.amount);
    doc.text(line.label, 14, y);
    doc.text(amount, right, y, { align: "right" });
    y += 6;
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
  }

  // ── Récapitulatif camerounais ──
  doc.setDrawColor(120);
  doc.line(14, y + 1, right, y + 1);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Salaire brut", 14, y);
  doc.text(fmtFCFA(e.totalEarnings), right, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text("Cotisations salariales (CNPS 4,5 %)", 14, y);
  doc.text(`-${fmtFCFA(e.cnpsEmployee)}`, right, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("NET IMPOSABLE", 14, y);
  doc.text(fmtFCFA(e.netImposable), right, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text("IRPP (retenue à la source)", 14, y);
  doc.text(`-${fmtFCFA(e.irpp)}`, right, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("NET À PAYER", 14, y);
  doc.text(`${fmtFCFA(e.netPay)} FCFA`, right, y, { align: "right" });

  // ── Pied : charges patronales + statut ──
  y += 12;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Charges patronales : CNPS 5,6 % = ${fmtFCFA(e.cnpsEmployer)} FCFA (supportées par l'employeur)`, 14, y);
  y += 5;
  doc.text(
    `Mode de paiement : ${e.paymentMethod === "om" ? "Orange Money" : e.paymentMethod === "momo" ? "MTN MoMo" : e.paymentMethod === "virement" ? "Virement" : "Espèces"} | Statut : ${e.status === "paye" ? "PAYÉ" : e.status}`,
    14,
    y
  );
  y += 6;
  doc.text("Document généré par AtelierOne — GPJ. À conserver pour la déclaration CNPS et la DAS.", 14, y);

  const pdf = doc.output("arraybuffer");
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bulletin-${e.matricule}.pdf"`,
    },
  });
}
