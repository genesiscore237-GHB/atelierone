import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { db } from "./client";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import { sql, eq, and } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("db:seed (seed-full.ts)");
const DATA_FILE = path.resolve(__dirname, "../data/old-products.json");
const EDITORS_FILE = path.resolve(__dirname, "../data/old-editeurs.json");

const rolesData = [
  { code: "admin_reseau", nom: "Administrateur Réseau", description: "Super administrateur avec tous les droits", niveau: 1 },
  { code: "responsable_agence", nom: "Responsable d'Agence", description: "Gère l'agence et supervise les opérations", niveau: 2 },
  { code: "operateur_pos", nom: "Opérateur POS", description: "Effectue les ventes au point de vente", niveau: 3 },
  { code: "caissier", nom: "Caissier", description: "Gère la caisse et les encaissements", niveau: 4 },
  { code: "magasinier", nom: "Magasinier", description: "Gère les stocks et inventaires", niveau: 5 },
  { code: "gestionnaire_achats", nom: "Gestionnaire Achats", description: "Gère les commandes fournisseurs", niveau: 6 },
  { code: "comptable", nom: "Comptable", description: "Gère la comptabilité", niveau: 7 },
  { code: "rh", nom: "Ressources Humaines", description: "Gère le personnel", niveau: 8 },
  { code: "consultation", nom: "Consultation", description: "Accès en lecture seule", niveau: 9 },
];

const agenceData = {
  nom: "Site Principal - Atelier",
  code: "AG-001",
  adresse: "Yaoundé, Cameroun",
  telephone: "+237 123 456 789",
  email: "contact@atelierone.cm",
  ville: "Yaoundé",
  pays: "Cameroun",
};

const modules = ["pos", "stock", "caisse", "achats", "rh", "comptabilite", "admin"];

const permissionsData = [
  { code: "pos.vente.creer", nom: "Créer une vente", module: "pos" },
  { code: "pos.vente.lire", nom: "Consulter les ventes", module: "pos" },
  { code: "pos.vente.annuler", nom: "Annuler une vente", module: "pos" },
  { code: "pos.vente.rembourser", nom: "Rembourser une vente", module: "pos" },
  { code: "stock.consulter", nom: "Consulter le stock", module: "stock" },
  { code: "stock.modifier", nom: "Modifier le stock", module: "stock" },
  { code: "stock.inventaire", nom: "Effectuer un inventaire", module: "stock" },
  { code: "caisse.ouvrir", nom: "Ouvrir la caisse", module: "caisse" },
  { code: "caisse.fermer", nom: "Fermer la caisse", module: "caisse" },
  { code: "caisse.mouvement", nom: "Enregistrer un mouvement", module: "caisse" },
  { code: "caisse.consulter", nom: "Consulter la caisse", module: "caisse" },
  { code: "achats.commander", nom: "Créer une commande", module: "achats" },
  { code: "achats.recevoir", nom: "Réceptionner une commande", module: "achats" },
  { code: "achats.consulter", nom: "Consulter les achats", module: "achats" },
  { code: "rh.utilisateur.creer", nom: "Créer un utilisateur", module: "rh" },
  { code: "rh.utilisateur.modifier", nom: "Modifier un utilisateur", module: "rh" },
  { code: "rh.utilisateur.lire", nom: "Consulter les utilisateurs", module: "rh" },
  { code: "comptabilite.depense.creer", nom: "Enregistrer une dépense", module: "comptabilite" },
  { code: "comptabilite.depense.lire", nom: "Consulter les dépenses", module: "comptabilite" },
  { code: "comptabilite.rapport", nom: "Générer des rapports", module: "comptabilite" },
  { code: "admin.parametres", nom: "Configurer les paramètres", module: "admin" },
  { code: "admin.agence.gerer", nom: "Gérer les agences", module: "admin" },
  { code: "admin.roles.gerer", nom: "Gérer les rôles", module: "admin" },
  { code: "admin.permissions.gerer", nom: "Gérer les permissions", module: "admin" },
  { code: "admin.logs.consulter", nom: "Consulter les logs", module: "admin" },
];

const rolePermissionsMap: Record<string, string[]> = {
  admin_reseau: permissionsData.map((p) => p.code),
  responsable_agence: [
    "pos.vente.lire", "stock.consulter", "stock.inventaire", "caisse.ouvrir", "caisse.fermer",
    "caisse.consulter", "caisse.mouvement", "achats.consulter", "achats.commander", "achats.recevoir",
    "rh.utilisateur.lire", "comptabilite.depense.lire", "comptabilite.rapport",
    "admin.parametres", "admin.logs.consulter",
  ],
  operateur_pos: ["pos.vente.creer", "pos.vente.lire", "pos.vente.annuler", "stock.consulter", "caisse.consulter", "caisse.ouvrir", "caisse.fermer", "caisse.mouvement"],
  caissier: ["caisse.ouvrir", "caisse.fermer", "caisse.mouvement", "caisse.consulter", "pos.vente.lire", "pos.vente.creer"],
  magasinier: ["stock.consulter", "stock.modifier", "stock.inventaire", "achats.recevoir"],
  gestionnaire_achats: ["achats.commander", "achats.recevoir", "achats.consulter", "stock.consulter", "fournisseur.consulter"],
  comptable: ["comptabilite.depense.creer", "comptabilite.depense.lire", "comptabilite.rapport", "pos.vente.lire", "achats.consulter", "caisse.consulter"],
  rh: ["rh.utilisateur.creer", "rh.utilisateur.modifier", "rh.utilisateur.lire"],
  consultation: ["pos.vente.lire", "stock.consulter", "achats.consulter", "caisse.consulter", "comptabilite.depense.lire", "rh.utilisateur.lire"],
};

const rootCategories = [
  { nom: "Manuels Scolaires", code: "MAN-SCO", description: "Livres et manuels pour le primaire, secondaire et université" },
  { nom: "Littérature & Loisirs", code: "LIT-LOI", description: "Romans, BD, mangas, poésie, théâtre" },
  { nom: "Dictionnaires & Encyclopédies", code: "DIC-ENC", description: "Dictionnaires de langues, encyclopédies" },
  { nom: "Papeterie & Écriture", code: "PAP-ECR", description: "Cahiers, stylos, papier, classement" },
  { nom: "Fournitures Scolaires", code: "FOU-SCO", description: "Sacs, trousses, protège-cahiers, géométrie" },
  { nom: "Mobilier & Bureau", code: "MOB-BUR", description: "Mobilier, lampes, horloges" },
  { nom: "Multimédia & Informatique", code: "MUL-INF", description: "Clés USB, cartouches, calculatrices" },
  { nom: "Jeux & Jouets Éducatifs", code: "JEU-EDU", description: "Jeux de société, puzzles, jouets" },
  { nom: "Impression & Services", code: "IMP-SER", description: "Photocopie, impression, plastification" },
  { nom: "Divers & Accessoires", code: "DIV-ACC", description: "Cadeaux, emballages, marque-pages" },
];

const subCategories = [
  { nom: "Maternelle", code: "MAN-SCO-MAT", parentCode: "MAN-SCO" },
  { nom: "Primaire", code: "MAN-SCO-PRI", parentCode: "MAN-SCO" },
  { nom: "Secondaire Général", code: "MAN-SCO-SEC", parentCode: "MAN-SCO" },
  { nom: "Secondaire Technique", code: "MAN-SCO-TEC", parentCode: "MAN-SCO" },
  { nom: "Anglophone (GCE)", code: "MAN-SCO-ANG", parentCode: "MAN-SCO" },
  { nom: "Université & Supérieur", code: "MAN-SCO-UNI", parentCode: "MAN-SCO" },
  { nom: "Scientifique", code: "MAN-SCO-SCI", parentCode: "MAN-SCO" },
  { nom: "Littéraire", code: "MAN-SCO-LIT", parentCode: "MAN-SCO" },
  { nom: "Romans & Fictions", code: "LIT-LOI-ROM", parentCode: "LIT-LOI" },
  { nom: "Bandes Dessinées & Mangas", code: "LIT-LOI-BD", parentCode: "LIT-LOI" },
  { nom: "Poésie & Théâtre", code: "LIT-LOI-POE", parentCode: "LIT-LOI" },
  { nom: "Jeunesse & Éveil", code: "LIT-LOI-JEU", parentCode: "LIT-LOI" },
  { nom: "Essais & Documents", code: "LIT-LOI-ESS", parentCode: "LIT-LOI" },
  { nom: "Dictionnaires Français", code: "DIC-ENC-FR", parentCode: "DIC-ENC" },
  { nom: "Dictionnaires Bilingues", code: "DIC-ENC-BIL", parentCode: "DIC-ENC" },
  { nom: "Encyclopédies & Atlas", code: "DIC-ENC-ATL", parentCode: "DIC-ENC" },
  { nom: "Cahiers & Copies Doubles", code: "PAP-ECR-CAH", parentCode: "PAP-ECR" },
  { nom: "Stylos & Écriture", code: "PAP-ECR-STY", parentCode: "PAP-ECR" },
  { nom: "Papier & Enveloppes", code: "PAP-ECR-PAP", parentCode: "PAP-ECR" },
  { nom: "Classement & Archives", code: "PAP-ECR-CLA", parentCode: "PAP-ECR" },
  { nom: "Correcteurs & Gommes", code: "PAP-ECR-COR", parentCode: "PAP-ECR" },
  { nom: "Agrafeuses & Agrafes", code: "PAP-ECR-AGR", parentCode: "PAP-ECR" },
  { nom: "Colle & Adhésifs", code: "PAP-ECR-COL", parentCode: "PAP-ECR" },
  { nom: "Ciseaux & Cutters", code: "PAP-ECR-CIS", parentCode: "PAP-ECR" },
  { nom: "Règles & Mesures", code: "PAP-ECR-REG", parentCode: "PAP-ECR" },
  { nom: "Papeterie Générale", code: "PAP-GEN", parentCode: "PAP-ECR" },
  { nom: "Sacs & Cartables", code: "FOU-SCO-SAC", parentCode: "FOU-SCO" },
  { nom: "Trousses & Accessoires", code: "FOU-SCO-TRO", parentCode: "FOU-SCO" },
  { nom: "Géométrie & Dessin", code: "FOU-SCO-GEO", parentCode: "FOU-SCO" },
  { nom: "Protège-cahiers & Couvertures", code: "FOU-SCO-PRO", parentCode: "FOU-SCO" },
  { nom: "Mobilier de Bureau", code: "MOB-BUR-MOB", parentCode: "MOB-BUR" },
  { nom: "Éclairage & Lampes", code: "MOB-BUR-ECL", parentCode: "MOB-BUR" },
  { nom: "Clés USB & Stockage", code: "MUL-INF-USB", parentCode: "MUL-INF" },
  { nom: "Cartouches & Toners", code: "MUL-INF-CAR", parentCode: "MUL-INF" },
  { nom: "Calculatrices", code: "MUL-INF-CAL", parentCode: "MUL-INF" },
  { nom: "Accessoires Informatiques", code: "MUL-INF-ACC", parentCode: "MUL-INF" },
  { nom: "Jeux de Société", code: "JEU-EDU-SOC", parentCode: "JEU-EDU" },
  { nom: "Puzzles & Construction", code: "JEU-EDU-PUZ", parentCode: "JEU-EDU" },
  { nom: "Cadeaux & Emballages", code: "DIV-ACC-CAD", parentCode: "DIV-ACC" },
  { nom: "Marque-pages & Accessoires", code: "DIV-ACC-MAR", parentCode: "DIV-ACC" },
];

async function seed() {
  console.log("=== SEED COMPLET: Librairie-Papeterie ===");

  // 0. Donnees de reference du systeme educatif camerounais (idempotent)
  const educationSql = fs.readFileSync(path.resolve(__dirname, "seed-education.sql"), "utf-8");
  const statements = educationSql.split(";").filter(s => s.trim() && !s.trim().startsWith("--") && !s.trim().startsWith("SELECT"));
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt.trim()));
    } catch (e: any) {
      if (e?.message && (e.message.includes("already exists") || e.message.includes("duplicate"))) continue;
    }
  }
  console.log("Donnees educatives: OK");

  await db.execute(sql`TRUNCATE TABLE utilisateurs, verification_tokens, user_roles, role_permissions, agences, roles, permissions, categories, fournisseurs, produits, codes_barres, stocks, inventaires, ventes, ventes_lignes, achats, achats_lignes, clients, caisses, mouvements_caisse, depenses, audit_logs RESTART IDENTITY CASCADE`);

  const insertedRoles = await db.insert(schema.roles).values(rolesData).returning();
  console.log(`Roles: ${insertedRoles.length}`);

  const insertedAgence = await db.insert(schema.agences).values(agenceData).returning();
  console.log(`Agence: ${insertedAgence[0].nom}`);

  const insertedPermissions = await db.insert(schema.permissions).values(permissionsData).returning();
  const permByCode: Record<string, string> = {};
  for (const perm of insertedPermissions) permByCode[perm.code] = perm.id;

  const rolePermValues: { roleId: string; permissionId: string }[] = [];
  for (const role of insertedRoles) {
    const codes = rolePermissionsMap[role.code];
    if (codes) for (const code of codes) if (permByCode[code]) rolePermValues.push({ roleId: role.id, permissionId: permByCode[code] });
  }
  if (rolePermValues.length > 0) await db.insert(schema.rolePermissions).values(rolePermValues);

  const adminRole = insertedRoles.find((r) => r.code === "admin_reseau")!;
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await db.insert(schema.utilisateurs).values({
    email: "admin@atelierone.cm",
    loginEmail: "admin@atelierone.cm",
    motDePasse: hashedPassword,
    nom: "Admin",
    prenom: "Super",
    telephone: "+237 123 456 789",
    agenceId: insertedAgence[0].id,
    roleId: adminRole.id,
    isActive: true,
    status: "active",
    emailVerified: new Date(),
  });
  console.log("Admin: admin@atelierone.cm / admin123");

  // 1b. Employés RH + utilisateurs invités (conformes au process : RH → Gouvernance)
  const testUsers = [
    { email: "operateur@atelierone.cm", role: "operateur_pos", nom: "Operateur", prenom: "Test", fonction: "Opérateur POS" },
    { email: "caissier@atelierone.cm", role: "caissier", nom: "Caissier", prenom: "Test", fonction: "Caissier" },
    { email: "magasinier@atelierone.cm", role: "magasinier", nom: "Magasinier", prenom: "Test", fonction: "Magasinier" },
    { email: "comptable@atelierone.cm", role: "comptable", nom: "Comptable", prenom: "Test", fonction: "Comptable" },
    { email: "rh@atelierone.cm", role: "rh", nom: "RH", prenom: "Test", fonction: "Gestionnaire RH" },
    { email: "consultation@atelierone.cm", role: "consultation", nom: "Consultation", prenom: "Test", fonction: "Consultant" },
    { email: "responsable@atelierone.cm", role: "responsable_agence", nom: "Responsable", prenom: "Agence", fonction: "Responsable d'Agence" },
    { email: "achats@atelierone.cm", role: "gestionnaire_achats", nom: "Achats", prenom: "Test", fonction: "Gestionnaire Achats" },
  ];

  let empNum = 9001;
  const createdEmployees: { id: number; email: string; role: string; nom: string; prenom: string }[] = [];

  for (const u of testUsers) {
    const matricule = `AO-${new Date().getFullYear()}-${String(empNum).padStart(4, "0")}`;
    empNum++;
    const [emp] = await db.insert(schema.employes).values({
      matricule,
      nom: u.nom,
      prenom: u.prenom,
      emailPersonnel: u.email,
      telephone: "+237 600 000 000",
      fonction: u.fonction,
      typeEmploye: "permanent",
      agenceId: insertedAgence[0].id,
      dateEmbauche: new Date("2026-01-01"),
      statut: "actif",
    } as any).returning() as any;
    if (emp) createdEmployees.push({ id: emp.id, email: u.email, role: u.role, nom: u.nom, prenom: u.prenom });
  }
  console.log(`Employés RH créés: ${createdEmployees.length}`);

  let invitedCount = 0;
  for (const emp of createdEmployees) {
    const role = insertedRoles.find((r) => r.code === emp.role);
    if (!role) continue;
    const insertedUsers = await db.insert(schema.utilisateurs).values({
      email: emp.email,
      loginEmail: emp.email,
      motDePasse: hashedPassword,
      nom: emp.nom,
      prenom: emp.prenom,
      telephone: "+237 600 000 000",
      agenceId: insertedAgence[0].id,
      roleId: role.id,
      isActive: true,
      status: "active",
      emailVerified: new Date(),
      employeId: emp.id,
    }).onConflictDoNothing({ target: schema.utilisateurs.email }).returning() as any;
    if (insertedUsers.length > 0) {
      const user = insertedUsers[0];
      await db.update(schema.employes)
        .set({ userId: user.id } as any)
        .where(eq(schema.employes.id, emp.id));
      invitedCount++;
    }
  }
  console.log(`Utilisateurs créés: ${invitedCount} (liés aux employés, mot de passe: admin123)`);

  // 2. CATEGORIES
  const insertedRootCats = await db.insert(schema.categories).values(rootCategories.map(c => ({ ...c, parentId: null }))).returning();
  const catMap: Record<string, string> = {};
  for (const c of insertedRootCats) catMap[c.code] = c.id;

  const insertedSubCats = await db.insert(schema.categories).values(
    subCategories.filter(sc => catMap[sc.parentCode]).map(sc => ({ nom: sc.nom, code: sc.code, parentId: catMap[sc.parentCode] }))
  ).returning();
  for (const c of insertedSubCats) catMap[c.code] = c.id;
  console.log(`Catégories: ${insertedRootCats.length} racines + ${insertedSubCats.length} sous-catégories`);

  // 3. FOURNISSEURS
  const editeursRaw = JSON.parse(fs.readFileSync(EDITORS_FILE, "utf-8"));
  const fournisseurNames = new Set<string>();
  const fournisseurValues: { nom: string; code: string; telephone: string; email: string; adresse: string }[] = [];

  for (const ed of editeursRaw) {
    const name = (ed.name || "").trim();
    if (!name || name === "Non Applicable" || name.length < 2) continue;
    if (fournisseurNames.has(name)) continue;
    fournisseurNames.add(name);
    const code = name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "_");
    fournisseurValues.push({ nom: name, code, telephone: "", email: "", adresse: "" });
  }

  const essentialSuppliers = [
    { nom: "Maped", code: "MAPED" },
    { nom: "Bic", code: "BIC" },
    { nom: "Oxford", code: "OXFORD" },
    { nom: "Clairefontaine", code: "CLAIREFONTAINE" },
    { nom: "Elba", code: "ELBA" },
    { nom: "Staples", code: "STAPLES" },
    { nom: "Tann's", code: "TANNS" },
    { nom: "Gallimard", code: "GALLIMARD" },
    { nom: "Seuil", code: "SEUIL" },
  ];
  for (const s of essentialSuppliers) {
    if (!fournisseurNames.has(s.nom)) {
      fournisseurNames.add(s.nom);
      fournisseurValues.push({ nom: s.nom, code: s.code, telephone: "", email: "", adresse: "" });
    }
  }

  const insertedFournisseurs = await db.insert(schema.fournisseurs).values(fournisseurValues).returning();
  const fMap: Record<string, string> = {};
  for (const f of insertedFournisseurs) fMap[f.nom] = f.id;

  const fCodeMap: Record<string, string> = {};
  for (const f of insertedFournisseurs) fCodeMap[f.code] = f.id;

  // 4. PRODUITS
  const oldProducts = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const total = oldProducts.length;
  console.log(`Produits à importer: ${total}`);

  const [pceUnite] = await db.select().from(schema.unitesMesure).where(eq(schema.unitesMesure.code, "PCE")).limit(1);
  const pceId = pceUnite?.id ?? null;

  const isManuelCategory = (code: string) =>
    code && (code.startsWith("MAN-SCO"));
  const isLivreCategory = (code: string) =>
    code && (code.startsWith("LIT-LOI") || code.startsWith("DIC-ENC"));

  const BATCH_SIZE = 100;
  const allInsertedProducts: any[] = [];

  const AUTEURS = ["Paul Biya","Mongo Beti","Calixthe Beyala","Ferdinand Oyono","Ahmadou Kourouma","Mariama Bâ","Cheikh Hamidou Kane","Amadou Hampâté Bâ","Léonora Miano","Alain Mabanckou","Véronique Tadjo","Tierno Monénembo","Emmanuel Dongala","Henri Lopès","Sony Labou Tansi","Boris Gamaleya","Jean-Marie Adiaffi","Werewere Liking","Aminata Sow Fall","Boubacar Boris Diop","David Diop","Fatou Diome","Moussa Konaté","Patrice Nganang","Djaïli Amadou Amal","Hemley Boum","Max Lobe","Eugène Ebodé","Charles Nokan","Bernard Nanga","Camara Laye","Ousmane Sembène","Yambo Ouologuem","Nazaire Baga","Félix Couchoro"];
  const MARQUES = ["Maped","Bic","Oxford","Clairefontaine","Elba","Staples","Tann's","Rhodia","Leuchtturm","Moleskine","Faber-Castell","Stabilo","Sharpie","Pilot","Uni-ball","Pelikan","Lamy","Waterman","Parker","Eagle","Canson","Rötring","Koh-i-Noor","Derwent","Lylac","Cellogra","Lino"];
  const COULEURS = ["Noir","Bleu","Rouge","Vert","Blanc","Jaune","Orange","Violet","Rose","Gris","Marron","Bordeaux","Turquoise","Beige","Argent","Doré"];
  const FORMATS = ["A4","A5","A3","A6","AUTRE"];
  const COLLECTIONS = ["Classiques Africains","Jeunesse","Espace Francophone","Poche","Études Africaines","Patrimoine","Littératures du Monde","Essais & Documents","Sciences Humaines","Pédagogie","Réussite Scolaire","Les Grands Textes","Méthodes & Techniques","Ateliers","Les Indispensables","Parcours","Objectif Réussite","Les Incontournables","Savoirs & Compétences"];
  const LANGUES = ["FR","EN","FR/EN","ES","DE","LA"];

  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickDeterministic<T>(arr: T[], seed: string): T {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    return arr[Math.abs(hash) % arr.length];
  }

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = oldProducts.slice(i, i + BATCH_SIZE);
    const isLibrairie = (code: string) => code && (code.startsWith("MAN-SCO") || code.startsWith("LIT-LOI") || code.startsWith("DIC-ENC"));
    const values = batch.map((p: any) => {
      const isBook = isLibrairie(p.categorieCode);
      const isAnglophone = p.categorieCode === "MAN-SCO-ANG";
      const isPaper = p.categorieCode?.startsWith("PAP-") || p.categorieCode?.startsWith("FOU-");
      return {
        titre: p.titre,
        codeBarre: p.codeBarre,
        isbn: isBook ? (() => { const h = Array.from(p.codeBarre).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0); return `978${String(Math.abs(h)).padStart(10, "0").slice(0, 10)}`; })() : null,
        auteur: isBook ? (p.auteur || pickDeterministic(AUTEURS, p.codeBarre)) : null,
        editeur: p.editeur || null,
        collection: isBook ? pickDeterministic(COLLECTIONS, p.codeBarre) : null,
        niveauScolaire: p.niveauScolaire || null,
        matiere: p.matiere || null,
        langue: isBook ? (isAnglophone ? "EN" : "FR") : null,
        etat: p.etat || "neuf",
        description: `Produit de qualité professionnelle. ${p.titre} - Idéal pour ${isBook ? "les études et la lecture" : "le bureau et l'école"}.`,
        typeProduit: isBook ? "MANUEL" : "FOURNITURE",
        statutCycleVie: p.statut === "actif" ? "ACTIF" : "BROUILLON",
        categorieId: catMap[p.categorieCode] || null,
        fournisseurId: p.editeur ? (fMap[p.editeur] || null) : null,
        prixVente: p.prixVente || "0",
        prixAchat: p.prixAchat || null,
        tva: p.tva || "18",
        seuilAlerte: p.seuilAlerte || 5,
        statut: p.statut || "actif",
        uniteVente: "unite",
        uniteAchat: "unite",
        uniteBaseId: pceId,
        marque: isBook ? null : pickDeterministic(MARQUES, p.codeBarre),
        referenceFabricant: isBook ? null : `REF-${p.codeBarre?.slice(0, 15)}`,
        couleur: isBook ? null : (isPaper ? pickDeterministic(COULEURS, p.codeBarre) : null),
        format: isBook ? null : (isPaper ? pickDeterministic(FORMATS, p.codeBarre) : null),
        matiereComposition: isBook ? null : (isPaper ? "Matériaux de haute qualité, résistant à l'usage quotidien" : null),
        photos: [`https://placehold.co/200x200/1e293b/ffffff?text=${encodeURIComponent(p.titre?.slice(0, 2) || "PR")}`],
        imageUrl: null,
        isActive: true,
      };
    });

    const inserted = await db.insert(schema.produits).values(values).returning();
    allInsertedProducts.push(...inserted);

    if ((i / BATCH_SIZE) % 5 === 0) {
      console.log(`  Produits: ${Math.min(i + BATCH_SIZE, total)}/${total}`);
    }
  }
  console.log(`Produits importés: ${allInsertedProducts.length}`);

  // 4b. PRODUITS SYNTHÉTIQUES (couvrent tous les états manquants)
  const synProductDefs = [
    // SUSPENDU
    { titre: "Calculatrice Scientifique HS", codeBarre: "SYNTH-SUSP-001", categorieCode: "MUL-INF-CAL", typeProduit: "FOURNITURE", statutCycleVie: "SUSPENDU", statut: "suspendu", etat: "occasion", uniteVente: "unite", uniteAchat: "unite", prixVente: "15000", prixAchat: "9000" },
    { titre: "Roman 'Le Silence des Ombres' (Retour éditeur)", codeBarre: "SYNTH-SUSP-002", categorieCode: "LIT-LOI-ROM", typeProduit: "MANUEL", statutCycleVie: "SUSPENDU", statut: "suspendu", etat: "neuf", uniteVente: "unite", uniteAchat: "unite", prixVente: "4500", prixAchat: "2700" },
    // DISCONTINUE
    { titre: "Calculatrice FX-92 (Discontinuée)", codeBarre: "SYNTH-DIS-001", categorieCode: "MUL-INF-CAL", typeProduit: "FOURNITURE", statutCycleVie: "DISCONTINUE", statut: "actif", etat: "neuf", uniteVente: "unite", uniteAchat: "unite", prixVente: "12000", prixAchat: "7200" },
    { titre: "Manuel SVT 4ème (Ancien programme)", codeBarre: "SYNTH-DIS-002", categorieCode: "MAN-SCO-SCI", typeProduit: "MANUEL", statutCycleVie: "DISCONTINUE", statut: "actif", etat: "occasion", uniteVente: "unite", uniteAchat: "unite", prixVente: "5500", prixAchat: "3300" },
    // ARCHIVE
    { titre: "Horloge Murale Ancien Modèle", codeBarre: "SYNTH-ARC-001", categorieCode: "MOB-BUR-ECL", typeProduit: "FOURNITURE", statutCycleVie: "ARCHIVE", statut: "archive", etat: "vieux", uniteVente: "unite", uniteAchat: "unite", prixVente: "8000", prixAchat: "4000" },
    { titre: "Encyclopédie 2000 (Édition épuisée)", codeBarre: "SYNTH-ARC-002", categorieCode: "DIC-ENC-ATL", typeProduit: "MANUEL", statutCycleVie: "ARCHIVE", statut: "archive", etat: "vieux", uniteVente: "unite", uniteAchat: "unite", prixVente: "25000", prixAchat: "15000" },
    // statut variants (avec ACTIF lifecycle)
    { titre: "Pack Stylos Bic (Rupture)", codeBarre: "SYNTH-RUP-001", categorieCode: "PAP-ECR-STY", typeProduit: "FOURNITURE", statutCycleVie: "ACTIF", statut: "rupture", etat: "neuf", uniteVente: "pack", uniteAchat: "carton", prixVente: "2500", prixAchat: "1500" },
    { titre: "Ramette A4 (À Commander)", codeBarre: "SYNTH-CMD-001", categorieCode: "PAP-ECR-PAP", typeProduit: "FOURNITURE", statutCycleVie: "ACTIF", statut: "a_commander", etat: "neuf", uniteVente: "carton", uniteAchat: "carton", prixVente: "12000", prixAchat: "7200" },
    { titre: "Cahier 200p (Bloqué qualité)", codeBarre: "SYNTH-BLQ-001", categorieCode: "PAP-ECR-CAH", typeProduit: "FOURNITURE", statutCycleVie: "ACTIF", statut: "bloque", etat: "neuf", uniteVente: "douzaine", uniteAchat: "douzaine", prixVente: "18000", prixAchat: "11000" },
    // MANUEL type
    { titre: "Guide Pédagogique Maths 6ème", codeBarre: "SYNTH-MAN-001", categorieCode: "MAN-SCO-MAT", typeProduit: "MANUEL", statutCycleVie: "ACTIF", statut: "actif", etat: "neuf", uniteVente: "unite", uniteAchat: "unite", prixVente: "8000", prixAchat: "4800" },
    { titre: "Guide Pédagogique Français 3ème", codeBarre: "SYNTH-MAN-002", categorieCode: "MAN-SCO-LIT", typeProduit: "MANUEL", statutCycleVie: "BROUILLON", statut: "actif", etat: "neuf", uniteVente: "unite", uniteAchat: "unite", prixVente: "7500", prixAchat: "4500" },
    // Unite variants
    { titre: "Gommes Blanches (Pack de 10)", codeBarre: "SYNTH-PCK-001", categorieCode: "PAP-ECR-COR", typeProduit: "FOURNITURE", statutCycleVie: "ACTIF", statut: "actif", etat: "neuf", uniteVente: "pack", uniteAchat: "pack", prixVente: "5000", prixAchat: "3000" },
    { titre: "Crayons HB (Douzaine)", codeBarre: "SYNTH-DOU-001", categorieCode: "PAP-ECR-COR", typeProduit: "FOURNITURE", statutCycleVie: "ACTIF", statut: "actif", etat: "neuf", uniteVente: "douzaine", uniteAchat: "douzaine", prixVente: "3600", prixAchat: "2000" },
  ];

  const synInserted = await db.insert(schema.produits).values(synProductDefs.map(p => {
    const isSynBook = p.typeProduit === "MANUEL";
    const isSynFourniture = p.typeProduit === "FOURNITURE";
    return {
      titre: p.titre,
      codeBarre: p.codeBarre,
      isbn: isSynBook ? (() => { const h = Array.from(p.codeBarre).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0); return `978${String(Math.abs(h)).padStart(10, "0").slice(0, 10)}`; })() : null,
      auteur: isSynBook ? (p.titre.includes("Pédagogique") ? "Ministère Éducation" : "Auteur Référence") : null,
      editeur: isSynBook ? "Éditions Test" : null,
      collection: isSynBook ? "Collection Test" : null,
      niveauScolaire: p.categorieCode?.startsWith("MAN-") ? "6e" : null,
      matiere: p.categorieCode === "MAN-SCO-MAT" ? "Mathématiques" : (p.categorieCode === "MAN-SCO-LIT" ? "Français" : null),
      langue: isSynBook ? "FR" : null,
      etat: p.etat,
      description: `Produit synthétique ${p.typeProduit} - ${p.statutCycleVie}/${p.statut}. ${p.titre}`,
      typeProduit: p.typeProduit,
      statutCycleVie: p.statutCycleVie,
      statutOfficiel: isSynBook ? "OFFICIEL" : "OFFICIEL",
      categorieId: catMap[p.categorieCode] || null,
      fournisseurId: null,
      prixVente: p.prixVente,
      prixAchat: p.prixAchat,
      tva: "18",
      seuilAlerte: 5,
      statut: p.statut,
      uniteVente: p.uniteVente,
      uniteAchat: p.uniteAchat,
      uniteBaseId: pceId,
      marque: isSynFourniture ? "Marque Test" : null,
      referenceFabricant: isSynFourniture ? `REF-${p.codeBarre}` : null,
      couleur: isSynFourniture ? (p.categorieCode?.startsWith("PAP-") ? "Blanc" : "Noir") : null,
      format: isSynFourniture ? (p.categorieCode === "PAP-ECR-PAP" ? "A4" : "A5") : null,
      matiereComposition: isSynFourniture ? "Matériaux de haute qualité" : null,
      photos: [`https://placehold.co/200x200/1e293b/ffffff?text=${encodeURIComponent(p.titre.slice(0, 2))}`],
      imageUrl: null,
      isActive: p.statutCycleVie !== "ARCHIVE",
    };
  })).returning();
  allInsertedProducts.push(...synInserted);
  console.log(`Produits synthétiques: ${synInserted.length}`);

  // 5. CODES-BARRES
  const produitByBarcode: Record<string, string> = {};
  for (const prod of allInsertedProducts) produitByBarcode[prod.codeBarre] = prod.id;

  const codesBarresValues = allInsertedProducts.map(p => ({
    produitId: p.id,
    type: "SYSTEME" as const,
    valeur: p.codeBarre,
    estDefaut: true,
  }));

  for (let i = 0; i < codesBarresValues.length; i += BATCH_SIZE) {
    await db.insert(schema.codesBarres).values(codesBarresValues.slice(i, i + BATCH_SIZE));
  }
  console.log(`Codes-barres: ${codesBarresValues.length}`);

  // 5b. Enrichissement post-produits (statutOfficiel, ministere, prixReglemente)
  const ministeresList = await db.select({ id: schema.ministeres.id, code: schema.ministeres.code }).from(schema.ministeres);
  const ministereMinesec = ministeresList.find(m => m.code === "MINESEC")?.id;
  const ministereMinedub = ministeresList.find(m => m.code === "MINEDUB")?.id;
  const officielTypes = ["OFFICIEL", "RECOMMANDE", "COMPLEMENTAIRE"];

  for (const p of allInsertedProducts) {
    const isManuel = p.typeProduit === "MANUEL";
    if (isManuel && !p.statutOfficiel) {
      const officiel = pickDeterministic(officielTypes, p.codeBarre);
      await db.update(schema.produits).set({ statutOfficiel: officiel } as any).where(eq(schema.produits.id, p.id));
    }
    if (isManuel && p.typeProduit === "MANUEL" && ministereMinesec) {
      await db.update(schema.produits).set({ ministereId: ministereMinesec } as any).where(eq(schema.produits.id, p.id));
    }
    if (isManuel && Math.random() < 0.15) {
      const pv = Number(p.prixVente || 0);
      if (pv > 0) {
        const reglemente = Math.round(pv * 0.95);
        await db.update(schema.produits).set({ prixReglemente: true, prixReglementeValeur: String(reglemente) } as any).where(eq(schema.produits.id, p.id));
      }
    }
  }
  console.log(`Enrichissement: statutOfficiel/ministere/prixReglemente mis à jour`);

  // 5c. Lier les produits MANUEL aux références éducatives (filtres catalogue)
  const [sousSystemesList, niveauxList, classesList, matieresList, anneesList] = await Promise.all([
    db.select().from(schema.sousSystemes),
    db.select().from(schema.niveaux),
    db.select().from(schema.classes),
    db.select().from(schema.matieres),
    db.select().from(schema.anneesScolaires),
  ]);
  const ssByCode: Record<string, string> = {};
  for (const ss of sousSystemesList) ssByCode[ss.code] = ss.id;
  const niveauByCode: Record<string, string> = {};
  for (const n of niveauxList) niveauByCode[n.code] = n.id;
  const classeByCode: Record<string, string> = {};
  for (const c of classesList) classeByCode[c.code] = c.id;
  const matiereByLibelle: Record<string, string> = {};
  for (const m of matieresList) matiereByLibelle[m.libelle.toLowerCase()] = m.id;
  const anneeCourante = anneesList.find(a => a.isCurrent)?.id || anneesList[0]?.id;

  // Old niveauScolaire → niveauId mapping
  const niveauByOld: Record<string, string | undefined> = {
    "Maternelle": niveauByCode["MAT"],
    "Primaire": niveauByCode["PRIM"],
    "6e": niveauByCode["SEC"], "5e": niveauByCode["SEC"], "4e": niveauByCode["SEC"], "3e": niveauByCode["SEC"],
    "2nde": niveauByCode["SEC"], "2nd": niveauByCode["SEC"],
    "1ere": niveauByCode["SEC"], "1ère": niveauByCode["SEC"], "1re": niveauByCode["SEC"],
    "Tle": niveauByCode["SEC"], "Terminale": niveauByCode["SEC"],
    "Nursery": niveauByCode["NURSERY"],
    "Primary 1": niveauByCode["PRIMARY"], "Primary 2": niveauByCode["PRIMARY"],
    "Primary 3": niveauByCode["PRIMARY"], "Primary 4": niveauByCode["PRIMARY"],
    "Primary 5": niveauByCode["PRIMARY"], "Primary 6": niveauByCode["PRIMARY"],
    "Form 1": niveauByCode["SECONDARY"], "Form 2": niveauByCode["SECONDARY"],
    "Form 3": niveauByCode["SECONDARY"], "Form 4": niveauByCode["SECONDARY"],
    "Form 5": niveauByCode["SECONDARY"],
    "Lower Sixth": niveauByCode["SECONDARY"], "Upper Sixth": niveauByCode["SECONDARY"],
    "Advanced Level": niveauByCode["SECONDARY"],
    "Université": niveauByCode["SUP"], "University": niveauByCode["HIGHER"],
  };

  // Old niveauScolaire → classeId mapping
  const classeByOld: Record<string, string | undefined> = {
    "Maternelle": classeByCode["MAT"],
    "Primaire": classeByCode["PRIM"],
    "6e": classeByCode["6E"], "5e": classeByCode["5E"],
    "4e": classeByCode["4E"], "3e": classeByCode["3E"],
    "2nde": classeByCode["2NDE"], "2nd": classeByCode["2NDE"],
    "1ere": classeByCode["1ERE"], "1ère": classeByCode["1ERE"], "1re": classeByCode["1ERE"],
    "Tle": classeByCode["TLE"], "Terminale": classeByCode["TLE"],
    "Nursery": classeByCode["NUR"],
    "Primary 1": classeByCode["P1"], "Primary 2": classeByCode["P2"],
    "Primary 3": classeByCode["P3"], "Primary 4": classeByCode["P4"],
    "Primary 5": classeByCode["P5"], "Primary 6": classeByCode["P6"],
    "Form 1": classeByCode["F1"], "Form 2": classeByCode["F2"],
    "Form 3": classeByCode["F3"], "Form 4": classeByCode["F4"],
    "Form 5": classeByCode["F5"],
    "Lower Sixth": classeByCode["LS"], "Upper Sixth": classeByCode["US"],
    "Advanced Level": classeByCode["LS"],
    "Université": classeByCode["SUP"], "University": classeByCode["UNI"],
  };

  // Old matiere string → matiereId mapping
  const matiereKeywords: [string, string][] = [
    ["math", "MATH"], ["maths", "MATH"], ["mathematiques", "MATH"], ["mathematics", "MATHS"],
    ["francais", "FR"], ["français", "FR"], ["french", "FRENCH"],
    ["anglais", "ANG"], ["english", "ENG"],
    ["svt", "SVT"], ["biologie", "BIO"], ["biology", "BIOLOGY"],
    ["physique", "PHY"], ["chimie", "PHY"], ["physics", "PHYSICS"],
    ["histoire", "HISTGEO"], ["geo", "HISTGEO"], ["history", "HIST"],
    ["philosophie", "PHILO"],
    ["informatique", "ICT"], ["computer", "ICT"],
    ["eps", "EPS"], ["sport", "EPS"],
    ["allemand", "ALL"], ["german", "GER"],
    ["espagnol", "ESP"], ["spanish", "SPA"],
    ["arts", "ART"], ["dessin", "ART"],
    ["musique", "MUS"], ["music", "MUS"],
    ["litterature", "LIT"], ["literature", "LIT"],
    ["algo", "ALGO"],
  ];

  let linkCount = 0;
  for (const p of allInsertedProducts) {
    if (p.typeProduit !== "MANUEL") continue;

    const isSyn = String(p.codeBarre).startsWith("SYNTH-");
    let oldNiveau: string | undefined;
    let oldMatiere = "";
    let isAnglo = false;

    if (isSyn) {
      if (p.codeBarre === "SYNTH-MAN-001") { oldNiveau = "6e"; oldMatiere = "Mathématiques"; }
      else if (p.codeBarre === "SYNTH-MAN-002") { oldNiveau = "3e"; oldMatiere = "Français"; }
      else if (p.codeBarre === "SYNTH-DIS-002") { oldNiveau = "4e"; oldMatiere = "SVT"; }
      else { oldNiveau = "6e"; oldMatiere = ""; }
    } else {
      const oldProduct = oldProducts.find((op: any) => op.codeBarre === p.codeBarre);
      if (!oldProduct) continue;
      oldNiveau = oldProduct.niveauScolaire;
      oldMatiere = oldProduct.matiere || "";
      isAnglo = p.categorieCode === "MAN-SCO-ANG";
    }

    const updates: Record<string, any> = {};
    updates.sousSystemeId = isAnglo ? ssByCode["EN"] : ssByCode["FR"];

    if (oldNiveau && niveauByOld[oldNiveau]) updates.niveauId = niveauByOld[oldNiveau];
    if (oldNiveau && classeByOld[oldNiveau]) updates.classeId = classeByOld[oldNiveau];

    for (const [kw, code] of matiereKeywords) {
      if (oldMatiere.toLowerCase().includes(kw)) {
        updates.matiereId = matiereByLibelle[code.toLowerCase()];
        break;
      }
    }

    if (anneeCourante) updates.anneeListeId = anneeCourante;

    if (Object.keys(updates).length > 0) {
      await db.update(schema.produits).set(updates as any).where(eq(schema.produits.id, p.id));
      linkCount++;
    }
  }
  if (linkCount > 0) console.log(`Liens éducatifs: ${linkCount} produits MANUEL mis à jour`);

  // 6. STOCKS
  const agenceId = insertedAgence[0].id;
  const stocksValues = allInsertedProducts.map(p => {
    const oldProduct = oldProducts.find((op: any) => op.codeBarre === p.codeBarre);
    const qte = Math.max(Math.floor((oldProduct?.ancienStock || 10) + Math.random() * 20), 5);
    return { produitId: p.id, agenceId, quantite: qte };
  });

  for (let i = 0; i < stocksValues.length; i += BATCH_SIZE) {
    await db.insert(schema.stocks).values(stocksValues.slice(i, i + BATCH_SIZE));
  }
  console.log(`Stocks: ${stocksValues.length}`);

  // 7. PRODUIT_UNITES (conditionnements par produit)
  if (pceId) {
    let countPu = 0;
    for (let i = 0; i < allInsertedProducts.length; i += BATCH_SIZE) {
      const batch = allInsertedProducts.slice(i, i + BATCH_SIZE);
      const puValues = batch.map(p => ({
        produitId: p.id,
        uniteId: pceId,
        facteurVersParent: "1",
        facteurVersBase: "1",
        prixAchat: p.prixAchat || String(Math.round(Number(p.prixVente || 0) * 0.7)),
        prixVente: p.prixVente || "0",
        estUniteBase: true,
        estUniteAchatDefaut: true,
        estUniteVenteDefaut: true,
        statut: "ACTIF",
      }));
      await db.insert(schema.produitUnites).values(puValues);
      countPu += batch.length;
    }
    console.log(`Produit-unités: ${countPu}`);

    // 7b. UNITES_MESURE_PRODUITS (legacy, fallback stock-engine)
    let countUmp = 0;
    for (let i = 0; i < allInsertedProducts.length; i += BATCH_SIZE) {
      const batch = allInsertedProducts.slice(i, i + BATCH_SIZE);
      const umpValues = batch.map(p => ({
        produitId: p.id,
        uniteId: pceId,
        facteurConversion: 1,
        prixAchat: Number(p.prixAchat || Math.round(Number(p.prixVente || 0) * 0.7)),
        prixVente: Number(p.prixVente || 0),
        estUniteBase: true,
        estUniteAchatDefaut: true,
        estUniteVenteDefaut: true,
      }));
      await db.insert(schema.unitesMesureProduits).values(umpValues);
      countUmp += batch.length;
    }
    console.log(`Unités mesure produits: ${countUmp}`);
  }

  // 7c. PRODUIT_UNITES VARIANTES (unités multiples, statuts CREE/INACTIF)
  const allUnits = await db.select().from(schema.unitesMesure);
  const unitByCode: Record<string, string> = {};
  for (const u of allUnits) unitByCode[u.code] = u.id;

  if (pceId && unitByCode["DOZ"] && unitByCode["PAQ"] && unitByCode["CAR"]) {
    const synProducts = allInsertedProducts.filter(p => String(p.codeBarre).startsWith("SYNTH-"));
    type SynPuEntry = { produitId: string; uniteId: string; facteurVersBase: string; statut: string; estUniteBase: boolean; estUniteAchatDefaut: boolean; estUniteVenteDefaut: boolean; prixAchat: string; prixVente: string; autoriserDeconditionnementVente: boolean };

    const variantPu: SynPuEntry[] = [];

    // DOZ (Douzaine) - for douzaine products
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-DOU-001" || p.codeBarre === "SYNTH-BLQ-001") {
        variantPu.push({
          produitId: p.id, uniteId: unitByCode["DOZ"], facteurVersBase: "12",
          statut: "ACTIF", estUniteBase: false, estUniteAchatDefaut: true, estUniteVenteDefaut: true,
          prixAchat: String(Math.round(Number(p.prixAchat || 0) * 12)),
          prixVente: String(Math.round(Number(p.prixVente || 0) * 12)),
          autoriserDeconditionnementVente: true,
        });
      }
    }

    // PAQ (Paquet) - for pack products
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-PCK-001" || p.codeBarre === "SYNTH-RUP-001") {
        variantPu.push({
          produitId: p.id, uniteId: unitByCode["PAQ"], facteurVersBase: "10",
          statut: "ACTIF", estUniteBase: false, estUniteAchatDefaut: true, estUniteVenteDefaut: true,
          prixAchat: String(Math.round(Number(p.prixAchat || 0) * 10)),
          prixVente: String(Math.round(Number(p.prixVente || 0) * 10)),
          autoriserDeconditionnementVente: true,
        });
      }
    }

    // CAR (Carton) - for carton product
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-CMD-001") {
        variantPu.push({
          produitId: p.id, uniteId: unitByCode["CAR"], facteurVersBase: "5",
          statut: "ACTIF", estUniteBase: false, estUniteAchatDefaut: true, estUniteVenteDefaut: true,
          prixAchat: String(Math.round(Number(p.prixAchat || 0) * 5)),
          prixVente: String(Math.round(Number(p.prixVente || 0) * 5)),
          autoriserDeconditionnementVente: true,
        });
      }
    }

    // CREE statut variant (DOZ + PCE, statut CREE)
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-DIS-001") {
        variantPu.push({
          produitId: p.id, uniteId: unitByCode["DOZ"], facteurVersBase: "12",
          statut: "CREE", estUniteBase: false, estUniteAchatDefaut: false, estUniteVenteDefaut: false,
          prixAchat: String(Math.round(Number(p.prixAchat || 0) * 12)),
          prixVente: String(Math.round(Number(p.prixVente || 0) * 12)),
          autoriserDeconditionnementVente: false,
        });
      }
    }

    // INACTIF statut variant (PAQ, statut INACTIF)
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-ARC-001") {
        variantPu.push({
          produitId: p.id, uniteId: unitByCode["PAQ"], facteurVersBase: "10",
          statut: "INACTIF", estUniteBase: false, estUniteAchatDefaut: false, estUniteVenteDefaut: false,
          prixAchat: String(Math.round(Number(p.prixAchat || 0) * 10)),
          prixVente: String(Math.round(Number(p.prixVente || 0) * 10)),
          autoriserDeconditionnementVente: false,
        });
      }
    }

    for (let i = 0; i < variantPu.length; i += BATCH_SIZE) {
      await db.insert(schema.produitUnites).values(variantPu.slice(i, i + BATCH_SIZE));
    }
    if (variantPu.length > 0) console.log(`Produit-unités variantes: ${variantPu.length}`);
  }

  // 8. STOCKS_UNITES (stock par unité)
  let countSu = 0;
  for (let i = 0; i < stocksValues.length; i += BATCH_SIZE) {
    const batch = stocksValues.slice(i, i + BATCH_SIZE);
    const suValues = batch.map(s => ({
      produitId: s.produitId,
      agenceId: s.agenceId,
      uniteId: pceId || "00000000-0000-0000-0000-000000000000",
      quantite: String(s.quantite),
    }));
    await db.insert(schema.stocksUnites).values(suValues);
    countSu += batch.length;
  }
  console.log(`Stocks unités: ${countSu}`);

  // 8b. STOCKS_UNITES VARIANTES (pour conditionnements multiples)
  if (unitByCode["DOZ"] && unitByCode["PAQ"] && unitByCode["CAR"]) {
    const synProducts = allInsertedProducts.filter(p => String(p.codeBarre).startsWith("SYNTH-"));
    const variantSu: { produitId: string; agenceId: number; uniteId: string; quantite: string }[] = [];
    for (const p of synProducts) {
      if (p.codeBarre === "SYNTH-DOU-001") {
        variantSu.push({ produitId: p.id, agenceId, uniteId: unitByCode["DOZ"], quantite: String(Math.max(Math.floor(Math.random() * 10), 2)) });
      }
      if (p.codeBarre === "SYNTH-BLQ-001") {
        variantSu.push({ produitId: p.id, agenceId, uniteId: unitByCode["DOZ"], quantite: String(Math.max(Math.floor(Math.random() * 8), 1)) });
      }
      if (p.codeBarre === "SYNTH-RUP-001" || p.codeBarre === "SYNTH-PCK-001") {
        variantSu.push({ produitId: p.id, agenceId, uniteId: unitByCode["PAQ"], quantite: String(Math.max(Math.floor(Math.random() * 15), 3)) });
      }
      if (p.codeBarre === "SYNTH-CMD-001") {
        variantSu.push({ produitId: p.id, agenceId, uniteId: unitByCode["CAR"], quantite: "0" });
      }
    }
    for (let i = 0; i < variantSu.length; i += BATCH_SIZE) {
      await db.insert(schema.stocksUnites).values(variantSu.slice(i, i + BATCH_SIZE));
    }
    if (variantSu.length > 0) console.log(`Stocks unités variantes: ${variantSu.length}`);
  }

  // Fix stock rupture product: set quantite = 0
  for (const p of allInsertedProducts) {
    if (p.codeBarre === "SYNTH-RUP-001") {
      await db.update(schema.stocks).set({ quantite: "0" } as any).where(and(eq(schema.stocks.produitId, p.id), eq(schema.stocks.agenceId, agenceId)));
      await db.update(schema.stocksUnites).set({ quantite: "0" } as any).where(and(eq(schema.stocksUnites.produitId, p.id), eq(schema.stocksUnites.agenceId, agenceId)));
    }
  }

  // 9. Fill missing prixAchat (70% heuristic)
  const produitsSansPrixAchat = allInsertedProducts.filter(p => !p.prixAchat && Number(p.prixVente) > 0);
  for (const p of produitsSansPrixAchat) {
    const prixAchat = Math.round(Number(p.prixVente) * 0.7);
    await db.update(schema.produits).set({ prixAchat: String(prixAchat) } as any).where(eq(schema.produits.id, p.id));
  }
  if (produitsSansPrixAchat.length > 0) console.log(`Prix achat (70%): ${produitsSansPrixAchat.length}`);

  // 10. SEQUENCE sync
  const startVal = allInsertedProducts.length + 100;
  await db.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS seq_lip_barcode START WITH ${startVal} INCREMENT BY 1`));
  console.log(`Sequence initialisée à ${startVal}`);

  console.log("=== SEED TERMINÉ AVEC SUCCÈS ===");
  const lifecycleCounts: Record<string, number> = {};
  for (const p of allInsertedProducts) {
    const lc = p.statutCycleVie || "UNKNOWN";
    lifecycleCounts[lc] = (lifecycleCounts[lc] || 0) + 1;
  }
  const lifecycleStr = Object.entries(lifecycleCounts).map(([k, v]) => `${k}=${v}`).join(" · ");
  console.log(`Résumé: ${allInsertedProducts.length} produits (${lifecycleStr}) · ${codesBarresValues.length} codes-barres · ${stocksValues.length} stocks · ${countSu} stocks-unites · ${insertedFournisseurs.length} fournisseurs · ${insertedRootCats.length + insertedSubCats.length} catégories`);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
