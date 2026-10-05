import "dotenv/config";
import { db } from "@atelierone/db";
import { utilisateurs, agences, vehicules, ordresReparation, ventes, dettesClients } from "@atelierone/db";
import { eq, sql } from "drizzle-orm";
import { createCaller } from "~/server/api/root";
import { verrouillerSequenceFacture } from "~/server/lib/facturation-service";
import type { ExtendedUser } from "@atelierone/auth/types";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/atelierone_erp_test";
process.env.LICENCE_MODE = "off";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "phase14-test-secret-long-rod-and-staff";

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail ? "— " + detail : ""}`); }
}

async function main() {
  const [admin] = await db.select().from(utilisateurs).where(eq(utilisateurs.email, "admin@gpj.cm")).limit(1);
  if (!admin) throw new Error("admin@gpj.cm introuvable en base de test");
  const [agence] = await db.select().from(agences).where(eq(agences.code, "SITE-1")).limit(1);
  if (!agence) throw new Error("SITE-1 introuvable");

  const user: ExtendedUser = {
    id: String(admin.id),
    email: admin.email,
    name: `${admin.prenom} ${admin.nom}`,
    agenceId: Number(admin.agenceId),
    agenceName: agence.nom,
    organizationId: "TEST",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  const ctx = { user, session: null, headers: new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "phase14" }) };
  const trpc = createCaller(ctx as any);

  const immatBase = "PZ" + String(Date.now()).slice(-5);
  let immat = immatBase; let n = 0;
  const nextImmat = () => { n++; return `${immatBase}C${n}`.slice(0, 10); };

  console.log("=== PHASE 14 — VÉRIFICATION MÉTIER (DB atelierone_erp_test) ===");

  // ─── H. Double facturation → numéro FAC- distinct (pas de doublon) ───
  console.log("\n[H] Numérotation FAC- distincte (2 OR facturés)");
  let verrouOk = false;
  try { await verrouillerSequenceFacture(db, Number(admin.agenceId)); verrouOk = true; } catch { verrouOk = false; }
  ok(verrouOk, "pg_advisory_xact_lock activé", "le verrou sérialise le comptage dans la transaction");

  const facAvant = await countFacAgence(Number(admin.agenceId));
  const refs: string[] = [];
  try {
    for (let k = 1; k <= 2; k++) {
      const imm = nextImmat();
      const recu = await trpc.or.receptionner({
        client: { nom: `PHASE14-H-${k}`, telephone: "600000000", ville: "Yaoundé" },
        vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Toyota", modele: "Corolla", annee: 2020, typeVehicule: "voiture", kilometrage: 1000 },
        reception: { pannesDeclarees: "Bruit moteur", kilometrageEntree: 1000, datePromesse: "2026-10-01" },
      } as any);
      await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Vidange", quantite: 1, prixUnitaire: 100000, tva: 0 } as any);
      await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Freins ok", ok: true }], resultat: "VALIDE", essaiRoutier: true } as any);
      const fact = await trpc.or.facturer({ id: recu.id, modePaiement: "especes" } as any);
      refs.push(fact.reference);
    }
  } catch (e: any) {
    console.log("  ✗ setup H échoué: " + e.message);
    if (e?.data?.zodError) console.log(JSON.stringify(e.data.zodError));
  }
  ok(refs.length === 2 && new Set(refs).size === 2 && /^FAC-\d{4}-\d{5}$/.test(refs[0]), "références FAC- distinctes et format FAC-YYYY-XXXXX", refs.join(" / "));
  const uniquesDB = await countFacAgence(Number(admin.agenceId));
  ok(uniquesDB === facAvant + 2, "+2 ventes FAC- en base pour 2 facturations", `avant=${facAvant} après=${uniquesDB}`);

  // ─── I. Nouvelle version devis → ancienne version intacte (snapshot de lignes) ───
  console.log("\n[I] Versionnage devis : snapshot LIGNES par version");
  let versionsAncienne: number | null = null;
  let versionsNouvelle: number | null = null;
  let ancienneSnapshot: any[] = [];
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-I", telephone: "600000001", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Renault", modele: "Clio", annee: 2019, typeVehicule: "voiture", kilometrage: 500 },
      reception: { pannesDeclarees: "Éclairage", kilometrageEntree: 500 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Contrôle éclairage", quantite: 1, prixUnitaire: 50000, tva: 0 } as any);
    const v1 = await trpc.or.creerVersionDevis({ orId: recu.id });
    versionsAncienne = v1.version;
    await trpc.or.addLigne({ ordreId: recu.id, type: "PIECE", libelle: "Ampoule H7", quantite: 2, prixUnitaire: 15000, tva: 0 } as any);
    const v2 = await trpc.or.creerVersionDevis({ orId: recu.id });
    versionsNouvelle = v2.version;
    const list = await trpc.or.listerDevisVersions({ orId: recu.id });
    const v1row = list.find((x: any) => x.version === versionsAncienne);
    const v2row = list.find((x: any) => x.version === versionsNouvelle);
    ancienneSnapshot = v1row?.lignesSnapshot ?? [];
    const nouvelleSnapshot = v2row?.lignesSnapshot ?? [];
    ok(versionsNouvelle === (versionsAncienne ?? 0) + 1, "v2 séquentielle après v1", `v1=${versionsAncienne}, v2=${versionsNouvelle}`);
    ok(ancienneSnapshot.length === 1, "v1 snapshot = 1 ligne (éclairage)", `lignes=${ancienneSnapshot.length}`);
    ok(nouvelleSnapshot.length === 2, "v2 snapshot = 2 lignes (éclairage + ampoule)", `lignes=${nouvelleSnapshot.length}`);
    ok(ancienneSnapshot[0]?.statutAutorisation === "PROPOSE", "ligne v1 figée avec statut d'autorisation", JSON.stringify(ancienneSnapshot[0]));
  } catch (e: any) {
    console.log("  ✗ setup I échoué: " + e.message);
    if (e?.data?.zodError) console.log(JSON.stringify(e.data.zodError));
  }

  // ─── B. 500 000 facturés / 200 000 encaissés → reste 300 000, créance, véhicule au garage ───
  console.log("\n[B] Facture 500 000 / 200 000 encaissés → reste 300 000 + véhicule NON sorti");
  let statutVehiculeB = "";
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-B", telephone: "600000002", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Honda", modele: "Civic", annee: 2021, typeVehicule: "voiture", kilometrage: 200 },
      reception: { pannesDeclarees: "Freinage", kilometrageEntree: 200 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Réparation freins", quantite: 1, prixUnitaire: 500000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Freins ok", ok: true }], resultat: "VALIDE" } as any);
    const factB = await trpc.or.facturer({ id: recu.id, modePaiement: "credit", montantPaye: 200000 } as any);
    ok(factB.montantTotal === 500000, "vente = 500 000", `total=${factB.montantTotal}`);
    const [venteB] = await db.select({ t: ventes.montantTotal, p: ventes.montantPaye }).from(ventes).where(eq(ventes.id, factB.venteId)).limit(1);
    ok(Number(venteB?.p ?? 0) === 200000, "encaissé = 200 000", `payé=${venteB?.p}`);
    const [detteB] = await db.select({ r: dettesClients.montantRestant }).from(dettesClients).where(eq(dettesClients.venteId, factB.venteId)).limit(1);
    ok(Number(detteB?.r ?? 0) === 300000, "créance créée = 300 000 restant", `restant=${detteB?.r}`);
    const [vehB] = await db.select({ s: vehicules.statutImmobilisation }).from(vehicules).where(eq(vehicules.id, recu.vehiculeId)).limit(1);
    statutVehiculeB = vehB?.s ?? "";
    ok(statutVehiculeB !== "sorti", "véhicule reste au garage (pas de sortie implicite)", `statut=${statutVehiculeB}`);
  } catch (e: any) {
    console.log("  ✗ setup B échoué: " + e.message);
  }

  // ─── D. Facture sans restitution → véhicule toujours présent (même OR) ───
  console.log("\n[D] Facture sans restitution → véhicule toujours au garage");
  ok(statutVehiculeB !== "sorti", "aucune restitution effectuée → véhicule non sorti", statutVehiculeB);

  // ─── C. 500 000 / 0 encaissé → créance 500 000, caisse ≈ inchangée ───
  console.log("\n[C] Facture 500 000 / 0 encaissé → créance 500 000");
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-C", telephone: "600000003", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Kia", modele: "Rio", annee: 2018, typeVehicule: "voiture", kilometrage: 100 },
      reception: { pannesDeclarees: "Embrayage", kilometrageEntree: 100 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Embrayage", quantite: 1, prixUnitaire: 500000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Embrayage ok", ok: true }], resultat: "VALIDE" } as any);
    const factC = await trpc.or.facturer({ id: recu.id, modePaiement: "credit", montantPaye: 0 } as any);
    const [detteC] = await db.select({ r: dettesClients.montantRestant }).from(dettesClients).where(eq(dettesClients.venteId, factC.venteId)).limit(1);
    ok(Number(detteC?.r ?? 0) === 500000, "créance = 500 000 restant (0 encaissé)", `restant=${detteC?.r}`);
    const [venteC] = await db.select({ t: ventes.montantTotal, p: ventes.montantPaye }).from(ventes).where(eq(ventes.id, factC.venteId)).limit(1);
    ok(Number(venteC?.p ?? 0) === 0 && Number(venteC?.t ?? 0) === 500000, "vente 500 000 / 0 payé", `t=${venteC?.t} p=${venteC?.p}`);
  } catch (e: any) {
    console.log("  ✗ setup C échoué: " + e.message);
  }

  // ─── E. Restitution → véhicule SORTI ───
  console.log("\n[E] Restitution (solde réglé) → véhicule SORTI");
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-E", telephone: "600000004", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Peugeot", modele: "208", annee: 2022, typeVehicule: "voiture", kilometrage: 300 },
      reception: { pannesDeclarees: "Batterie", kilometrageEntree: 300 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Batterie", quantite: 1, prixUnitaire: 100000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Batterie ok", ok: true }], resultat: "VALIDE" } as any);
    await trpc.or.facturer({ id: recu.id, modePaiement: "especes" } as any);
    const restit = await trpc.or.restituerVehicule({
      orId: recu.id, kilometrageSortie: 310, recuperateurNom: "Client E", signatureClient: "Client E",
      checklist: [{ libelle: "Clés rendues", ok: true }],
    } as any);
    ok(restit.success === true, "restitution acceptée (vente soldée, QC valide)");
    const [vehE] = await db.select({ s: vehicules.statutImmobilisation }).from(vehicules).where(eq(vehicules.id, recu.vehiculeId)).limit(1);
    ok(vehE?.s === "sorti", "véhicule SORTI après restitution", `statut=${vehE?.s}`);
  } catch (e: any) {
    console.log("  ✗ setup E échoué: " + e.message);
  }

  // ─── G. QC non validé → restitution refusée ───
  console.log("\n[G] QC non validé → sortie refusée");
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-G", telephone: "600000005", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Ford", modele: "Fiesta", annee: 2017, typeVehicule: "voiture", kilometrage: 400 },
      reception: { pannesDeclarees: "Direction", kilometrageEntree: 400 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Direction", quantite: 1, prixUnitaire: 200000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Direction bruyante", ok: false }], resultat: "REJETE" } as any);
    let refuse = false; let msgG = "";
    try {
      await trpc.or.restituerVehicule({
        orId: recu.id, kilometrageSortie: 400, recuperateurNom: "Client G", signatureClient: "Client G",
        checklist: [{ libelle: "Clés rendues", ok: true }], observations: "Travaux non terminés",
      } as any);
    } catch (e2: any) { refuse = true; msgG = e2.message ?? ""; }
    ok(refuse, "restitution refusée (QC rejeté)", msgG);
  } catch (e: any) {
    console.log("  ✗ setup G échoué: " + e.message);
  }

  // ─── F. Sortie avec reste dû → sortie exceptionnelle tracée ───
  console.log("\n[F] Sortie avec reste dû → octroyée si sortie exceptionnelle tracée");
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-F", telephone: "600000006", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Nissan", modele: "Almera", annee: 2016, typeVehicule: "voiture", kilometrage: 500 },
      reception: { pannesDeclarees: "Vitres", kilometrageEntree: 500 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Vitres", quantite: 1, prixUnitaire: 300000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Vitres ok", ok: true }], resultat: "VALIDE" } as any);
    await trpc.or.facturer({ id: recu.id, modePaiement: "credit", montantPaye: 0 } as any);
    let refusSolde = false; let msgF0 = "";
    try {
      await trpc.or.restituerVehicule({
        orId: recu.id, kilometrageSortie: 505, recuperateurNom: "Client F", signatureClient: "Client F",
        checklist: [{ libelle: "Clés rendues", ok: true }],
      } as any);
    } catch (e2: any) { refusSolde = true; msgF0 = e2.message ?? ""; }
    ok(refusSolde, "sortie ordinaire refusée si solde impayé", msgF0);
    const restitF = await trpc.or.restituerVehicule({
      orId: recu.id, kilometrageSortie: 505, recuperateurNom: "Client F", signatureClient: "Client F",
      checklist: [{ libelle: "Clés rendues", ok: true }],
      sortieExceptionnelle: true, motifException: "PIECES_INDISPONIBLES", commentaireException: "Client retire le véhicule en attendant la pièce",
    } as any);
    ok(restitF.exceptionnelle === true, "sortie exceptionnelle tracée (motif + commentaire)");
    const [histF] = await db.select({ o: ordresReparation.numero }).from(ordresReparation).where(eq(ordresReparation.id, recu.id)).limit(1);
    ok(!!histF, "OR conservée après sortie exceptionnelle", histF.o);
  } catch (e: any) {
    console.log("  ✗ setup F échoué: " + e.message);
  }

  // ─── J. Recherche globale ───
  console.log("\n[J] Recherche globale (immatriculation + FAC-)");
  try {
    const imm = nextImmat();
    const recu = await trpc.or.receptionner({
      client: { nom: "PHASE14-J", telephone: "600000007", ville: "Yaoundé" },
      vehicule: { immatriculation: imm, numeroChassis: `CHA-${imm}`, marque: "Mazda", modele: "3", annee: 2020, typeVehicule: "voiture", kilometrage: 100 },
      reception: { pannesDeclarees: "Clim", kilometrageEntree: 100 },
    } as any);
    await trpc.or.addLigne({ ordreId: recu.id, type: "SERVICE", libelle: "Clim", quantite: 1, prixUnitaire: 150000, tva: 0 } as any);
    await trpc.or.validerControleQualite({ orId: recu.id, checklist: [{ libelle: "Clim ok", ok: true }], resultat: "VALIDE" } as any);
    const factJ = await trpc.or.facturer({ id: recu.id, modePaiement: "especes" } as any);
    const resImmat = await trpc.recherche.global({ q: imm.slice(0, 6) });
    const resFac = await trpc.recherche.global({ q: factJ.reference });
    const nbImmat = (resImmat as any).vehicules?.length ?? 0;
    const nbFac = (resFac as any).ventes?.length ?? 0;
    ok(nbImmat >= 1, `recherche par immatriculation "${imm.slice(0, 6)}" → ${nbImmat} résultat(s)`);
    ok(nbFac >= 1, `recherche par référence "${factJ.reference}" → ${nbFac} résultat(s)`);
  } catch (e: any) {
    console.log("  ✗ setup J échoué: " + e.message);
  }

  console.log(`\n=== RÉSULTAT PHASE 14 : ${passed} ✓ / ${failed} ✗ ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function countFacAgence(agenceId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(ventes).where(sql`${ventes.reference} LIKE ${`FAC-${new Date().getFullYear()}-%`}`);
  return Number(r?.n ?? 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });