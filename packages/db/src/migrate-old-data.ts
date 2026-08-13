import "dotenv/config";
import { db } from "./client";
import { sql } from "drizzle-orm";
import {
  organisations,
  agences,
  categories as newCategories,
  editeurs,
  fournisseurs,
  produits,
  utilisateurs,
  comptes,
  caisses,
  mouvementsCaisse,
  roles as newRoles,
  permissions as newPermissions,
  rolePermissions as newRolePermissions,
  clesApi,
  travauxExport,
  clients,
  listesScolaires,
  listeScolaireItems,
  stocks,
  mouvementsStock,
  achats,
  achatsLignes,
  bonsReception,
  lignesBonReception,
  ventes,
  ventesLignes,
  paiements,
  dettesClients,
  remboursementsDettes,
  retours,
  lignesRetour,
  avoirs,
  depenses,
  ecrituresJournal,
  lignesEcritureJournal,
  reglesTarification,
  promotions,
  approbations,
  alertes,
  notifications,
  reglesAutomatisation,
  boiteEnvoi,
  sessionsCaisse,
  inventaires,
  transfertsStock,
  faitsVentesQuotidiens,
  faitsCaisseQuotidiens,
  faitsStockQuotidiens,
  alertesStock,
} from "./schema";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

async function readOld<T extends Record<string, unknown>>(
  table: string,
  orderBy?: string,
): Promise<T[]> {
  const rows = await db.execute(
    sql.raw(
      `SELECT * FROM ${table}${orderBy ? ` ORDER BY ${orderBy}` : ""}`,
    ),
  );
  return rows as unknown as T[];
}

let totalInserted = 0;
let totalErrors = 0;

async function migrateTable<T extends Record<string, unknown>>(
  name: string,
  rows: T[],
  insertFn: (batch: T[]) => Promise<unknown>,
  batchSize = 100,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows (empty)`);
    return;
  }
  let ok = 0;
  let err = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await insertFn(batch);
      ok += batch.length;
    } catch (e) {
      err += batch.length;
      console.error(`  ${name} batch ${i / batchSize}:`, (e as Error).message.slice(0, 200));
    }
  }
  totalInserted += ok;
  totalErrors += err;
  console.log(`  ${name}: ${ok} inserted, ${err} errors`);
}

// ─── 1. organisations ──────────────────────────────────────────────
async function migrateOrganisations() {
  const old = await readOld<{
    id: string; name: string; slug: string; logo_url: string | null;
    phone: string | null; address: string | null; currency_code: string | null;
    timezone: string | null; status: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("organizations");
  await migrateTable("organisations", old, (batch) =>
    db.insert(organisations).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        slug: r.slug,
        logoUrl: r.logo_url,
        telephone: r.phone,
        adresse: r.address,
        devise: r.currency_code ?? "XAF",
        fuseauHoraire: r.timezone ?? "Africa/Douala",
        statut: r.status ?? "actif",
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 2. agences (old: points_of_sale) ──────────────────────────────
async function migrateAgences() {
  const old = await readOld<{
    id: string; organization_id: string; name: string; address: string | null;
    status: string | null; created_at: Date | null; updated_at: Date | null;
  }>("points_of_sale");
  await migrateTable("agences", old, (batch) =>
    db.insert(agences).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        code: slugify(r.name) + "_" + r.id.slice(0, 8),
        adresse: r.address,
        telephone: null as string | null,
        email: null as string | null,
        ville: null as string | null,
        pays: "Bénin",
        isActive: r.status === "active",
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 3. categories ─────────────────────────────────────────────────
async function migrateCategories() {
  const old = await readOld<{
    id: string; name: string; created_at: Date | null; updated_at: Date | null;
  }>("categories");
  await migrateTable("categories", old, (batch) =>
    db.insert(newCategories).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        code: slugify(r.name) + "_" + r.id.slice(0, 8),
        description: null as string | null,
        parentId: null as string | null,
        isActive: true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 4. editeurs (old: publishers) ─────────────────────────────────
async function migrateEditeurs() {
  const old = await readOld<{
    id: string; organization_id: string; name: string;
    contact_email: string | null; contact_phone: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("publishers");
  await migrateTable("editeurs", old, (batch) =>
    db.insert(editeurs).values(
      batch.map((r) => ({
        id: r.id,
        agenceId: null as string | null,
        nom: r.name,
        emailContact: r.contact_email,
        telephoneContact: r.contact_phone,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 5. fournisseurs (old: suppliers) ──────────────────────────────
async function migrateFournisseurs() {
  const old = await readOld<{
    id: string; name: string; contact_name: string | null;
    phone: string | null; email: string | null; address: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("suppliers");
  await migrateTable("fournisseurs", old, (batch) =>
    db.insert(fournisseurs).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        code: slugify(r.name) + "_" + r.id.slice(0, 8),
        contact: r.contact_name,
        telephone: r.phone,
        email: r.email,
        adresse: r.address,
        ville: null as string | null,
        pays: "Bénin",
        agenceId: null as string | null,
        isActive: true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 6. produits (old: products) ───────────────────────────────────
async function migrateProduits() {
  const old = await readOld<{
    id: string; sku: string; barcode: string | null; name: string;
    title: string; isbn: string | null; author: string | null;
    description: string | null; status: string | null;
    default_price: string | null; sale_price: string | null;
    purchase_price: string | null; level: string | null;
    type: string | null; condition: string | null; unit_type: string | null;
    category_id: string | null; publisher_id: string | null;
    image_url: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("products");
  await migrateTable("produits", old, (batch) =>
    db.insert(produits).values(
      batch.map((r) => ({
        id: r.id,
        codeBarre: r.barcode ?? r.sku,
        isbn: r.isbn,
        titre: r.title || r.name,
        auteur: r.author,
        editeur: null as string | null,
        collection: null as string | null,
        niveauScolaire: r.level,
        matiere: null as string | null,
        langue: null as string | null,
        etat: r.condition ?? "neuf",
        description: r.description,
        categorieId: r.category_id,
        fournisseurId: null as string | null,
        prixVente: r.default_price ?? r.sale_price ?? "0",
        prixAchat: r.purchase_price,
        tva: "0",
        seuilAlerte: 5,
        seuilCritique: 2,
        statut: r.status === "active" ? "actif" : r.status ?? "actif",
        uniteVente: r.unit_type ?? "unite",
        uniteAchat: "unite",
        photos: [],
        imageUrl: r.image_url,
        isActive: r.status !== "inactive",
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 7. utilisateurs (old: profiles) ───────────────────────────────
async function migrateUtilisateurs() {
  const old = await readOld<{
    id: string; organization_id: string | null; full_name: string;
    role: string | null; is_super_admin: boolean | null;
    is_active: boolean | null;
    created_at: Date | null; updated_at: Date | null;
  }>("profiles");
  await migrateTable("utilisateurs", old, (batch) =>
    db.insert(utilisateurs).values(
      batch.map((r, idx) => ({
        id: r.id,
        email: `user_${r.id.slice(0, 8)}@migrated.local`,
        loginEmail: null as string | null,
        motDePasse: null as string | null,
        nom: r.full_name,
        prenom: null as string | null,
        telephone: null as string | null,
        agenceId: r.organization_id ?? "00000000-0000-0000-0000-000000000000",
        roleId: null as string | null,
        employeId: null as string | null,
        isActive: r.is_active ?? true,
        status: "actif",
        emailVerified: null as Date | null,
        derniereConnexion: null as Date | null,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 8. comptes (old: accounts) ────────────────────────────────────
async function migrateComptes() {
  const old = await readOld<{
    id: string; organization_id: string; code: string; name: string;
    type: string; is_active: boolean | null; created_at: Date | null;
  }>("accounts");
  await migrateTable("comptes", old, (batch) =>
    db.insert(comptes).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        code: r.code,
        nom: r.name,
        typeCompte: r.type,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 9. caisses (old: cash_registers) ──────────────────────────────
async function migrateCaisses() {
  const old = await readOld<{
    id: string; pos_id: string; name: string; status: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("cash_registers");
  await migrateTable("caisses", old, (batch) =>
    db.insert(caisses).values(
      batch.map((r) => ({
        id: r.id,
        agenceId: r.pos_id,
        libelle: r.name,
        soldeOuverture: "0",
        soldeActuel: "0",
        dateOuverture: null as Date | null,
        dateFermeture: null as Date | null,
        statut: r.status === "open" ? "ouverte" : "fermee",
        ouvertPar: null as string | null,
        fermePar: null as string | null,
        notes: null as string | null,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 10. roles ─────────────────────────────────────────────────────
async function migrateRoles() {
  const old = await readOld<{
    id: string; name: string; description: string | null;
    is_system: boolean | null; created_at: Date | null; updated_at: Date | null;
  }>("roles");
  await migrateTable("roles", old, (batch) =>
    db.insert(newRoles).values(
      batch.map((r) => ({
        id: r.id,
        code: slugify(r.name) + "_" + r.id.slice(0, 8),
        nom: r.name,
        description: r.description,
        niveau: 0,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 11. permissions ───────────────────────────────────────────────
async function migratePermissions() {
  const old = await readOld<{
    id: string; name: string; description: string | null;
    module: string; created_at: Date | null;
  }>("permissions");
  await migrateTable("permissions", old, (batch) =>
    db.insert(newPermissions).values(
      batch.map((r) => ({
        id: r.id,
        code: r.name,
        nom: r.name,
        module: r.module,
        description: r.description,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 12. role_permissions ──────────────────────────────────────────
async function migrateRolePermissions() {
  const old = await readOld<{
    role_id: string; permission_id: string; created_at: Date | null;
  }>("role_permissions");
  await migrateTable("role_permissions", old, (batch) =>
    db.insert(newRolePermissions).values(
      batch.map((r) => ({
        roleId: r.role_id,
        permissionId: r.permission_id,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 13. cles_api (old: api_keys) ──────────────────────────────────
async function migrateClesApi() {
  const old = await readOld<{
    id: string; organization_id: string; name: string; key: string;
    permissions: unknown; is_active: boolean | null;
    expires_at: Date | null; created_at: Date | null; last_used_at: Date | null;
  }>("api_keys");
  await migrateTable("cles_api", old, (batch) =>
    db.insert(clesApi).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        nom: r.name,
        clef: r.key,
        permissions: r.permissions ?? [],
        estActif: r.is_active ?? true,
        expireLe: r.expires_at,
        createdAt: r.created_at ?? new Date(),
        derniereUtilisationLe: r.last_used_at,
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 14. clients ───────────────────────────────────────────────────
async function migrateClients() {
  const old = await readOld<{
    id: string; name: string; phone: string | null; email: string | null;
    address: string | null; is_active: boolean | null;
    created_at: Date | null; updated_at: Date | null;
  }>("customers");
  await migrateTable("clients", old, (batch) =>
    db.insert(clients).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        prenom: null as string | null,
        telephone: r.phone,
        email: r.email,
        adresse: r.address,
        codeClient: null as string | null,
        agenceId: null as string | null,
        isActive: r.is_active ?? true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 15. listes_scolaires (old: school_lists) ──────────────────────
async function migrateListesScolaires() {
  const old = await readOld<{
    id: string; name: string; school_name: string | null;
    description: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("school_lists");
  await migrateTable("listes_scolaires", old, (batch) =>
    db.insert(listesScolaires).values(
      batch.map((r) => ({
        id: r.id,
        nom: r.name,
        anneeScolaire: "2025-2026",
        ministere: "MINESEC",
        agenceId: null as string | null,
        description: r.description || r.school_name,
        isActive: true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 16. liste_scolaire_items (old: school_list_items) ─────────────
async function migrateListeScolaireItems() {
  const old = await readOld<{
    id: string; school_list_id: string; product_id: string;
    quantity_required: number; created_at: Date | null;
  }>("school_list_items");
  await migrateTable("liste_scolaire_items", old, (batch) =>
    db.insert(listeScolaireItems).values(
      batch.map((r) => ({
        id: r.id,
        listeId: r.school_list_id,
        produitId: r.product_id,
        quantiteRequise: r.quantity_required ?? 1,
        priorite: "obligatoire",
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 17. stocks (old: inventory_balances) ──────────────────────────
async function migrateStocks() {
  const old = await readOld<{
    id: string; product_id: string; site_id: string;
    on_hand_qty: string | null;
    created_at: Date | null; updated_at: Date | null;
  }>("inventory_balances");
  await migrateTable("stocks", old, (batch) =>
    db.insert(stocks).values(
      batch.map((r) => ({
        id: r.id,
        produitId: r.product_id,
        agenceId: r.site_id,
        quantite: Math.round(Number(r.on_hand_qty ?? 0)),
        emplacement: null as string | null,
        updatedAt: r.updated_at ?? r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 18. mouvements_stock (old: inventory_movements) ───────────────
async function migrateMouvementsStock() {
  const old = await readOld<{
    id: string; product_id: string | null; site_id: string;
    movement_type: string; quantity_delta: string | null;
    reference_type: string | null; reference_id: string | null;
    reason: string | null; occurred_at: Date | null;
  }>("inventory_movements");
  const qty = (v: string | null | undefined) => Math.round(Number(v ?? 0));
  await migrateTable("mouvements_stock", old, (batch) =>
    db.insert(mouvementsStock).values(
      batch.map((r) => ({
        id: r.id,
        produitId: r.product_id ?? "00000000-0000-0000-0000-000000000000",
        agenceId: r.site_id,
        type: r.movement_type,
        quantite: Math.abs(qty(r.quantity_delta)),
        stockAvant: 0,
        stockApres: qty(r.quantity_delta),
        reference: r.reference_id,
        referenceType: r.reference_type,
        commentaire: r.reason,
        effectuePar: null as string | null,
        dateMouvement: r.occurred_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 19. achats (old: purchase_orders) ─────────────────────────────
async function migrateAchats() {
  const old = await readOld<{
    id: string; supplier_id: string; destination_pos_id: string;
    status: string | null; total_amount: number | null;
    created_at: Date | null; updated_at: Date | null;
    ordered_by: string | null; approved_by: string | null;
    ordered_at: Date | null; expected_delivery_at: Date | null;
  }>("purchase_orders");
  await migrateTable("achats", old, (batch) =>
    db.insert(achats).values(
      batch.map((r) => ({
        id: r.id,
        fournisseurId: r.supplier_id,
        agenceId: r.destination_pos_id,
        reference: r.id.slice(0, 8),
        statut: (r.status ?? "brouillon").toLowerCase(),
        totalHT: r.total_amount ? String(r.total_amount) : null,
        totalTVA: null as string | null,
        totalTTC: r.total_amount ? String(r.total_amount) : null,
        notes: null as string | null,
        creePar: r.ordered_by,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 20. achats_lignes (old: purchase_order_lines) ─────────────────
async function migrateAchatsLignes() {
  const old = await readOld<{
    id: string; purchase_order_id: string; product_id: string;
    quantity_ordered: number; unit_cost: number; line_total: number;
  }>("purchase_order_lines");
  await migrateTable("achats_lignes", old, (batch) =>
    db.insert(achatsLignes).values(
      batch.map((r) => ({
        id: r.id,
        achatId: r.purchase_order_id,
        produitId: r.product_id,
        quantite: r.quantity_ordered,
        prixUnitaire: String(r.unit_cost),
        totalLigne: String(r.line_total),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 21. bons_reception (old: goods_receipts) ──────────────────────
async function migrateBonsReception() {
  const old = await readOld<{
    id: string; purchase_order_id: string; received_by: string | null;
    notes: string | null; received_at: Date | null;
  }>("goods_receipts");
  await migrateTable("bons_reception", old, (batch) =>
    db.insert(bonsReception).values(
      batch.map((r) => ({
        id: r.id,
        achatId: r.purchase_order_id,
        fournisseurId: "00000000-0000-0000-0000-000000000000",
        agenceId: "00000000-0000-0000-0000-000000000000",
        reference: r.id.slice(0, 8),
        statut: "recu",
        notes: r.notes,
        receptionnePar: r.received_by,
        createdAt: r.received_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 22. lignes_bon_reception (old: goods_receipt_lines) ───────────
async function migrateLignesBonReception() {
  const old = await readOld<{
    id: string; goods_receipt_id: string;
    quantity_received: number; actual_unit_cost: number;
  }>("goods_receipt_lines");
  await migrateTable("lignes_bon_reception", old, (batch) =>
    db.insert(lignesBonReception).values(
      batch.map((r) => ({
        id: r.id,
        bonReceptionId: r.goods_receipt_id,
        produitId: "00000000-0000-0000-0000-000000000000",
        quantiteCommandee: r.quantity_received,
        quantiteRecue: r.quantity_received,
        prixUnitaire: String(r.actual_unit_cost),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 23. ventes (old: sales) ───────────────────────────────────────
async function migrateVentes() {
  const old = await readOld<{
    id: string; sale_number: string | null; session_id: string | null;
    organization_id: string; customer_id: string | null;
    total_amount: number; subtotal_amount: number | null;
    tax_amount: number | null; due_amount: number | null;
    paid_amount: number | null; status: string | null;
    void_reason: string | null; voided_at: Date | null;
    voided_by: string | null; created_at: Date | null;
  }>("sales");
  await migrateTable("ventes", old, (batch) =>
    db.insert(ventes).values(
      batch.map((r) => ({
        id: r.id,
        agenceId: r.organization_id,
        reference: r.sale_number ?? r.id.slice(0, 8),
        operateurId: "00000000-0000-0000-0000-000000000000",
        clientId: r.customer_id,
        modePaiement: "especes",
        montantTotal: String(r.total_amount),
        remise: "0",
        montantPaye: r.paid_amount ? String(r.paid_amount) : null,
        statut: r.status === "VOIDED" ? "annule" : r.status?.toLowerCase() ?? "termine",
        notes: r.void_reason,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 24. ventes_lignes (old: sale_items) ───────────────────────────
async function migrateVentesLignes() {
  const old = await readOld<{
    id: string; sale_id: string; product_id: string;
    quantity: number; unit_price: number; total_amount: number;
  }>("sale_items");
  await migrateTable("ventes_lignes", old, (batch) =>
    db.insert(ventesLignes).values(
      batch.map((r) => ({
        id: r.id,
        venteId: r.sale_id,
        produitId: r.product_id,
        quantite: r.quantity,
        prixUnitaire: String(r.unit_price),
        totalLigne: String(r.total_amount),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 25. paiements (old: payments) ─────────────────────────────────
async function migratePaiements() {
  const old = await readOld<{
    id: string; sale_id: string; method: string; amount: number;
    status: string | null; phone_number: string | null;
    provider_reference: string | null; idempotency_key: string | null;
    created_at: Date | null;
  }>("payments");
  await migrateTable("paiements", old, (batch) =>
    db.insert(paiements).values(
      batch.map((r) => ({
        id: r.id,
        venteId: r.sale_id,
        montant: String(r.amount),
        modePaiement: r.method,
        reference: r.provider_reference,
        statut: r.status?.toLowerCase() ?? "initie",
        fournisseurPaiement: null as string | null,
        idReferenceFournisseur: r.idempotency_key,
        estIdempotent: !!r.idempotency_key,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 26. dettes_clients (old: customer_debts) ──────────────────────
async function migrateDettesClients() {
  const old = await readOld<{
    id: string; sale_id: string; customer_id: string | null;
    amount: number; remaining: number; status: string | null;
    due_date: Date | null; created_at: Date | null;
  }>("customer_debts");
  await migrateTable("dettes_clients", old, (batch) =>
    db.insert(dettesClients).values(
      batch.map((r) => ({
        id: r.id,
        venteId: r.sale_id,
        clientId: r.customer_id,
        montantTotal: String(r.amount),
        montantPaye: String(r.amount - r.remaining),
        montantRestant: String(r.remaining),
        statut: r.status?.toLowerCase() ?? "impaye",
        echeanceLe: r.due_date,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 27. remboursements_dettes (old: debt_payments) ────────────────
async function migrateRemboursementsDettes() {
  const old = await readOld<{
    id: string; debt_id: string; amount: number; method: string;
    created_at: Date | null;
  }>("debt_payments");
  await migrateTable("remboursements_dettes", old, (batch) =>
    db.insert(remboursementsDettes).values(
      batch.map((r) => ({
        id: r.id,
        detteId: r.debt_id,
        montant: String(r.amount),
        modePaiement: r.method,
        effectueLe: r.created_at ?? new Date(),
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 28. retours (old: returns) ────────────────────────────────────
async function migrateRetours() {
  const old = await readOld<{
    id: string; sale_id: string; return_type: string; reason: string | null;
    total_amount: number; processed_by: string | null; created_at: Date | null;
  }>("returns");
  await migrateTable("retours", old, (batch) =>
    db.insert(retours).values(
      batch.map((r) => ({
        id: r.id,
        venteId: r.sale_id,
        clientId: null as string | null,
        montantTotal: String(r.total_amount),
        typeRetour: r.return_type,
        statut: "termine",
        motif: r.reason,
        effectuePar: r.processed_by,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 29. lignes_retour (old: return_items) ─────────────────────────
async function migrateLignesRetour() {
  const old = await readOld<{
    id: string; return_id: string; sale_item_id: string;
    quantity_returned: number; reason: string | null;
  }>("return_items");
  await migrateTable("lignes_retour", old, (batch) =>
    db.insert(lignesRetour).values(
      batch.map((r) => ({
        id: r.id,
        retourId: r.return_id,
        produitId: r.sale_item_id,
        quantite: r.quantity_returned,
        prixUnitaire: "0",
        totalLigne: "0",
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 30. avoirs (old: credits) ─────────────────────────────────────
async function migrateAvoirs() {
  const old = await readOld<{
    id: string; return_id: string; customer_id: string | null;
    amount: number; used_amount: number | null; status: string | null;
    expires_at: Date | null; created_at: Date | null;
  }>("credits");
  await migrateTable("avoirs", old, (batch) =>
    db.insert(avoirs).values(
      batch.map((r) => ({
        id: r.id,
        venteId: r.return_id,
        clientId: r.customer_id,
        montantInitial: String(r.amount),
        montantRestant: String(r.amount - (r.used_amount ?? 0)),
        statut: r.status?.toLowerCase() ?? "actif",
        expireLe: r.expires_at,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 31. depenses (old: expenses) ──────────────────────────────────
async function migrateDepenses() {
  const old = await readOld<{
    id: string; pos_id: string | null; category: string; amount: number;
    description: string | null; payment_method: string;
    processed_by: string | null; date: Date | null; created_at: Date | null;
  }>("expenses");
  await migrateTable("depenses", old, (batch) =>
    db.insert(depenses).values(
      batch.map((r) => ({
        id: r.id,
        agenceId: r.pos_id ?? "00000000-0000-0000-0000-000000000000",
        categorie: r.category,
        montant: String(r.amount),
        description: r.description,
        fournisseurId: null as string | null,
        modePaiement: r.payment_method,
        dateDepense: r.date ?? new Date(),
        enregistrePar: r.processed_by,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 32. ecritures_journal (old: journal_entries) ──────────────────
async function migrateEcrituresJournal() {
  const old = await readOld<{
    id: string; organization_id: string; reference_type: string;
    reference_id: string; description: string; date: Date | null;
    created_at: Date | null;
  }>("journal_entries");
  await migrateTable("ecritures_journal", old, (batch) =>
    db.insert(ecrituresJournal).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        reference: r.reference_id?.slice(0, 100) ?? null,
        libelle: r.description,
        dateEcriture: r.date ?? new Date(),
        valideeLe: null as Date | null,
        valideePar: null as string | null,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 33. lignes_ecriture_journal (old: journal_items) ──────────────
async function migrateLignesEcritureJournal() {
  const old = await readOld<{
    id: string; entry_id: string; account_id: string;
    debit: number; credit: number;
  }>("journal_items");
  await migrateTable("lignes_ecriture_journal", old, (batch) =>
    db.insert(lignesEcritureJournal).values(
      batch.map((r) => ({
        id: r.id,
        ecritureId: r.entry_id,
        compteId: r.account_id,
        montant: String(r.debit || r.credit),
        sens: r.debit > 0 ? "debit" : "credit",
        libelle: null as string | null,
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 34. regles_tarification (old: pricing_rules) ──────────────────
async function migrateReglesTarification() {
  const old = await readOld<{
    id: string; organization_id: string; pos_id: string | null;
    name: string; type: string; conditions: unknown; actions: unknown;
    is_active: boolean | null; priority: number | null;
    created_at: Date | null; updated_at: Date | null;
  }>("pricing_rules");
  await migrateTable("regles_tarification", old, (batch) =>
    db.insert(reglesTarification).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        produitId: null as string | null,
        typeRegle: r.type,
        nom: r.name,
        conditions: r.conditions as Record<string, unknown> | null,
        valeur: r.actions ? String((r.actions as Record<string, unknown>).discountPercent ?? "") : null,
        priorite: r.priority ?? 0,
        estActive: r.is_active ?? true,
        dateDebut: null as Date | null,
        dateFin: null as Date | null,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 35. promotions ────────────────────────────────────────────────
async function migratePromotions() {
  const old = await readOld<{
    id: string; organization_id: string; name: string; type: string;
    description: string | null; conditions: unknown;
    discount_value: string | null; discount_type: string | null;
    start_date: Date | null; end_date: Date | null;
    is_active: boolean | null; created_at: Date | null; updated_at: Date | null;
  }>("promotions");
  await migrateTable("promotions", old, (batch) =>
    db.insert(promotions).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        nom: r.name,
        typePromo: r.type,
        conditions: r.conditions as Record<string, unknown> | null,
        valeur: r.discount_value,
        dateDebut: r.start_date ?? new Date(),
        dateFin: r.end_date ?? new Date(),
        estActive: r.is_active ?? true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 36. approbations (old: approvals) ─────────────────────────────
async function migrateApprobations() {
  const old = await readOld<{
    id: string; organization_id: string; sale_id: string | null;
    requested_by: string; approved_by: string | null;
    discount_amount: number; threshold: number; reason: string | null;
    status: string | null; approved_at: Date | null; created_at: Date | null;
  }>("approvals");
  await migrateTable("approbations", old, (batch) =>
    db.insert(approbations).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        typeRessource: "sale",
        ressourceId: r.sale_id,
        demandePar: r.requested_by,
        approuvePar: r.approved_by,
        statut: r.status?.toLowerCase() ?? "en_attente",
        motif: r.reason,
        createdAt: r.created_at ?? new Date(),
        misAJourLe: r.approved_at ?? r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 37. alertes (old: alerts) ─────────────────────────────────────
async function migrateAlertes() {
  const old = await readOld<{
    id: string; organization_id: string; type: string; severity: string | null;
    title: string; message: string; data: unknown;
    is_resolved: boolean | null; resolved_at: Date | null;
    resolved_by: string | null; created_at: Date | null;
  }>("alerts");
  await migrateTable("alertes", old, (batch) =>
    db.insert(alertes).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        type: r.type,
        severite: r.severity === "LOW" ? "FAIBLE" : r.severity === "MEDIUM" ? "MOYENNE" : r.severity === "HIGH" ? "ELEVEE" : r.severity === "CRITICAL" ? "CRITIQUE" : "MOYENNE",
        titre: r.title,
        message: r.message,
        donnees: r.data as Record<string, unknown> | null,
        estResolue: r.is_resolved ?? false,
        resolueLe: r.resolved_at,
        resoluePar: r.resolved_by,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 38. notifications (old: notifications) ────────────────────────
async function migrateNotifications() {
  const old = await readOld<{
    id: string; alert_id: string | null; organization_id: string;
    type: string; recipient: string; subject: string | null;
    message: string; status: string | null; sent_at: Date | null;
    error_message: string | null; created_at: Date | null;
  }>("notifications");
  await migrateTable("notifications", old, (batch) =>
    db.insert(notifications).values(
      batch.map((r) => ({
        id: r.id,
        alerteId: r.alert_id,
        organisationId: r.organization_id,
        type: r.type,
        destinataire: r.recipient,
        sujet: r.subject,
        message: r.message,
        statut: r.status ?? "EN_ATTENTE",
        envoyeeLe: r.sent_at,
        erreurMessage: r.error_message,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 39. regles_automatisation (old: automation_rules) ─────────────
async function migrateReglesAutomatisation() {
  const old = await readOld<{
    id: string; organization_id: string; name: string;
    description: string | null; trigger: string;
    conditions: unknown; actions: unknown;
    is_active: boolean | null; created_at: Date | null; updated_at: Date | null;
  }>("automation_rules");
  await migrateTable("regles_automatisation", old, (batch) =>
    db.insert(reglesAutomatisation).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        nom: r.name,
        description: r.description,
        declencheur: r.trigger,
        conditions: r.conditions as Record<string, unknown> | null,
        actions: r.actions as Record<string, unknown> | null,
        estActive: r.is_active ?? true,
        createdAt: r.created_at ?? new Date(),
        updatedAt: r.updated_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 40. boite_envoi (old: outbox) ─────────────────────────────────
async function migrateBoiteEnvoi() {
  const old = await readOld<{
    id: string; event_type: string; payload: unknown;
    created_at: Date | null; processed_at: Date | null;
  }>("outbox");
  await migrateTable("boite_envoi", old, (batch) =>
    db.insert(boiteEnvoi).values(
      batch.map((r) => ({
        id: r.id,
        typeEvenement: r.event_type,
        corpsJson: r.payload as Record<string, unknown>,
        statut: r.processed_at ? "traite" : "en_attente",
        createdAt: r.created_at ?? new Date(),
        traiteLe: r.processed_at,
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 41. sessions_caisse (old: cash_sessions) ──────────────────────
async function migrateSessionsCaisse() {
  const old = await readOld<{
    id: string; register_id: string; opened_by: string; closed_by: string | null;
    status: string | null;
    opening_amount: string; current_amount: string;
    expected_closing_amount: string | null;
    counted_closing_amount: string | null;
    variance_amount: string | null;
    opened_at: Date | null; closed_at: Date | null; created_at: Date | null;
  }>("cash_sessions");
  await migrateTable("sessions_caisse", old, (batch) =>
    db.insert(sessionsCaisse).values(
      batch.map((r) => ({
        id: r.id,
        caisseId: r.register_id,
        ouvertPar: r.opened_by,
        fermePar: r.closed_by,
        statut: r.status === "open" ? "ouverte" : r.status === "closed" ? "fermee" : "ouverte",
        soldeOuverture: r.opening_amount,
        soldeActuel: r.current_amount,
        soldeAttenduFermeture: r.expected_closing_amount,
        soldeCompteFermeture: r.counted_closing_amount,
        ecart: r.variance_amount,
        ouvertLe: r.opened_at ?? new Date(),
        fermeLe: r.closed_at,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 42. mouvements_caisse (old: cash_movements) ───────────────────
async function migrateMouvementsCaisse() {
  const old = await readOld<{
    id: string; session_id: string;
    movement_type: string; amount: string;
    reference_type: string | null; reference_id: string | null;
    reason: string | null; created_at: Date | null;
  }>("cash_movements");
  await migrateTable("mouvements_caisse", old, (batch) =>
    db.insert(mouvementsCaisse).values(
      batch.map((r) => ({
        id: r.id,
        caisseId: r.session_id,
        type: r.movement_type,
        montant: r.amount,
        motif: r.reason,
        reference: r.reference_id,
        effectuePar: null as string | null,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 43. inventaires (old: inventory_sessions + inventory_counts) ──
async function migrateInventaires() {
  const sessions = await readOld<{
    id: string; pos_id: string;
    started_by: string | null; approved_by: string | null;
    started_at: Date | null; completed_at: Date | null;
    notes: string | null;
  }>("inventory_sessions");
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const counts = await readOld<{
    id: string; session_id: string; product_id: string;
    counted_quantity: number; system_quantity: number;
    discrepancy: number; counted_by: string | null;
    created_at: Date | null;
  }>("inventory_counts");

  if (counts.length === 0) {
    console.log("  inventaires: 0 rows (empty)");
    return;
  }

  const values = counts.map((c) => {
    const s = sessionMap.get(c.session_id);
    return {
      id: c.id,
      produitId: c.product_id,
      agenceId: s?.pos_id ?? "00000000-0000-0000-0000-000000000000",
      quantiteTheorique: c.system_quantity,
      quantiteReelle: c.counted_quantity,
      ecart: c.discrepancy,
      commentaire: s?.notes ?? null,
      effectuePar: c.counted_by ?? s?.started_by ?? null,
      dateInventaire: c.created_at ?? s?.started_at ?? new Date(),
    };
  });

  await migrateTable("inventaires", values, (batch) =>
    db.insert(inventaires).values(batch).onConflictDoNothing(),
  );
}

// ─── 44. transferts_stock (old: stock_transfers) ───────────────────
async function migrateTransfertsStock() {
  const old = await readOld<{
    id: string; organization_id: string; from_pos_id: string; to_pos_id: string;
    product_id: string; quantity: number; status: string | null;
    performed_by: string | null; created_at: Date | null;
  }>("stock_transfers");
  await migrateTable("transferts_stock", old, (batch) =>
    db.insert(transfertsStock).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.organization_id,
        depuisAgenceId: r.from_pos_id,
        versAgenceId: r.to_pos_id,
        produitId: r.product_id,
        quantite: r.quantity,
        statut: r.status ?? "EN_ATTENTE",
        effectuePar: r.performed_by,
        createdAt: r.created_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 45. faits_ventes_quotidiens (old: daily_sales_facts) ──────────
async function migrateFaitsVentesQuotidiens() {
  const old = await readOld<{
    tenant_id: string; site_id: string | null; date: Date;
    qty_sold: string; gross_sales_amount: string;
    discount_amount: string; net_sales_amount: string;
  }>("daily_sales_facts");
  await migrateTable("faits_ventes_quotidiens", old, (batch) =>
    db.insert(faitsVentesQuotidiens).values(
      batch.map((r) => ({
        agenceId: r.site_id ?? r.tenant_id,
        date: r.date,
        totalVentes: Math.round(Number(r.qty_sold)),
        montantTotal: r.gross_sales_amount,
        montantPaye: r.net_sales_amount,
        remiseTotal: r.discount_amount,
        nombreProduits: Math.round(Number(r.qty_sold)),
        calculeLe: new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 46. faits_caisse_quotidiens (old: daily_cash_facts) ───────────
async function migrateFaitsCaisseQuotidiens() {
  const old = await readOld<{
    tenant_id: string; site_id: string | null; register_id: string | null; date: Date;
    cash_in_amount: string; cash_out_amount: string;
    sessions_count: number;
  }>("daily_cash_facts");
  await migrateTable("faits_caisse_quotidiens", old, (batch) =>
    db.insert(faitsCaisseQuotidiens).values(
      batch.map((r) => ({
        agenceId: r.site_id ?? r.tenant_id,
        caisseId: r.register_id,
        date: r.date,
        totalEntrees: r.cash_in_amount,
        totalSorties: r.cash_out_amount,
        operationsCount: r.sessions_count,
        calculeLe: new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 47. faits_stock_quotidiens (old: daily_inventory_facts) ───────
async function migrateFaitsStockQuotidiens() {
  const old = await readOld<{
    tenant_id: string; site_id: string | null; date: Date;
    closing_qty: string; stock_value: string;
  }>("daily_inventory_facts");
  await migrateTable("faits_stock_quotidiens", old, (batch) =>
    db.insert(faitsStockQuotidiens).values(
      batch.map((r) => ({
        agenceId: r.site_id ?? r.tenant_id,
        date: r.date,
        totalProduits: Math.round(Number(r.closing_qty)),
        valeurStock: r.stock_value,
        produitsRupture: 0,
        alerteStock: 0,
        calculeLe: new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 48. alertes_stock (old: stock_alerts) ─────────────────────────
async function migrateAlertesStock() {
  const old = await readOld<{
    id: string; tenant_id: string; site_id: string | null; product_id: string;
    alert_type: string; triggered_at: Date | null;
  }>("stock_alerts");
  await migrateTable("alertes_stock", old, (batch) =>
    db.insert(alertesStock).values(
      batch.map((r) => ({
        id: r.id,
        agenceId: r.site_id ?? r.tenant_id,
        produitId: r.product_id,
        typeAlerte: r.alert_type,
        message: `Alerte: ${r.alert_type}`,
        createdAt: r.triggered_at ?? new Date(),
      })),
    ).onConflictDoNothing(),
  );
}

// ─── 49 travaux_export (old: export_jobs) ───────────────────────────
async function migrateTravauxExport() {
  const old = await readOld<{
    id: string; tenant_id: string; requested_by_user_id: string;
    type: string; filters_json: unknown; status: string | null;
    file_url: string | null; created_at: Date | null; completed_at: Date | null;
  }>("export_jobs");
  await migrateTable("travaux_export", old, (batch) =>
    db.insert(travauxExport).values(
      batch.map((r) => ({
        id: r.id,
        organisationId: r.tenant_id,
        demandeParUserId: r.requested_by_user_id,
        type: r.type,
        filtresJson: r.filters_json as Record<string, unknown> | null,
        statut: r.status?.toLowerCase() ?? "en_attente",
        fichierUrl: r.file_url,
        createdAt: r.created_at ?? new Date(),
        termineLe: r.completed_at,
      })),
    ).onConflictDoNothing(),
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Starting old-to-new data migration...\n");

  console.log("── Parent tables ──");
  await migrateOrganisations();
  await migrateAgences();
  await migrateCategories();
  await migrateEditeurs();
  await migrateFournisseurs();
  await migrateProduits();
  await migrateClients();
  await migrateComptes();
  await migrateCaisses();
  await migrateRoles();
  await migratePermissions();

  console.log("\n── Child tables ──");
  await migrateUtilisateurs();
  await migrateRolePermissions();
  await migrateClesApi();
  await migrateListesScolaires();
  await migrateListeScolaireItems();
  await migrateStocks();
  await migrateMouvementsStock();
  await migrateAchats();
  await migrateAchatsLignes();
  await migrateBonsReception();
  await migrateLignesBonReception();
  await migrateVentes();
  await migrateVentesLignes();
  await migratePaiements();
  await migrateDettesClients();
  await migrateRemboursementsDettes();
  await migrateRetours();
  await migrateLignesRetour();
  await migrateAvoirs();
  await migrateDepenses();
  await migrateEcrituresJournal();
  await migrateLignesEcritureJournal();
  await migrateReglesTarification();
  await migratePromotions();
  await migrateApprobations();
  await migrateAlertes();
  await migrateNotifications();
  await migrateReglesAutomatisation();
  await migrateBoiteEnvoi();
  await migrateSessionsCaisse();
  await migrateMouvementsCaisse();
  await migrateInventaires();
  await migrateTransfertsStock();
  await migrateFaitsVentesQuotidiens();
  await migrateFaitsCaisseQuotidiens();
  await migrateFaitsStockQuotidiens();
  await migrateAlertesStock();
  await migrateTravauxExport();

  console.log(`\n✅ Done. Total: ${totalInserted} inserted, ${totalErrors} errors`);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
