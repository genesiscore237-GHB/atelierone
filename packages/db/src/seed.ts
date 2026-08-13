import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

requireLocalOrForced("db:seed (seed.ts)");

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
  adresse: "123 Rue du Commerce",
  telephone: "+229 01 23 45 67",
  email: "contact@atelierone.bj",
  ville: "Cotonou",
  pays: "Bénin",
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

async function seed() {
  console.log("Seeding database...");

  await db.execute(sql`TRUNCATE TABLE utilisateurs, verification_tokens, user_roles, role_permissions, agences, roles, permissions, categories, fournisseurs, produits, stocks, inventaires, ventes, ventes_lignes, achats, achats_lignes, clients, caisses, mouvements_caisse, depenses, audit_logs RESTART IDENTITY CASCADE`);

  const insertedRoles = await db.insert(schema.roles).values(rolesData).returning();
  console.log(`Inserted ${insertedRoles.length} roles`);

  const insertedAgence = await db.insert(schema.agences).values(agenceData).returning();
  console.log(`Inserted agency: ${insertedAgence[0].nom}`);

  const insertedPermissions = await db.insert(schema.permissions).values(permissionsData).returning();
  console.log(`Inserted ${insertedPermissions.length} permissions`);

  const permByCode: Record<string, string> = {};
  for (const perm of insertedPermissions) {
    permByCode[perm.code] = perm.id;
  }

  const rolePermValues: { roleId: string; permissionId: string }[] = [];
  for (const role of insertedRoles) {
    const permCodes = rolePermissionsMap[role.code];
    if (permCodes) {
      for (const code of permCodes) {
        const permId = permByCode[code];
        if (permId) {
          rolePermValues.push({ roleId: role.id, permissionId: permId });
        }
      }
    }
  }
  if (rolePermValues.length > 0) {
    await db.insert(schema.rolePermissions).values(rolePermValues);
    console.log(`Inserted ${rolePermValues.length} role-permission associations`);
  }

  const adminRole = insertedRoles.find((r) => r.code === "admin_reseau")!;
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const adminUser = {
    email: "admin@atelierone.bj",
    loginEmail: "admin@atelierone.bj",
    motDePasse: hashedPassword,
    nom: "Admin",
    prenom: "Super",
    telephone: "+229 01 23 45 67",
    agenceId: insertedAgence[0].id,
    roleId: adminRole.id,
    isActive: true,
    status: "active",
    emailVerified: new Date(),
  };
  await db.insert(schema.utilisateurs).values(adminUser);
  console.log("Created admin user: admin@atelierone.bj / admin123");

  // === CATEGORIES ===
  const categoriesData = [
    { nom: "Livres Scolaires", code: "LIV-SCO", description: "Manuels et livres pour le primaire et secondaire" },
    { nom: "Libre Accès", code: "LIB-ACC", description: "Romans, essais, bandes dessinées, jeunesse" },
    { nom: "Papeterie", code: "PAP", description: "Articles de papeterie et fournitures de bureau" },
    { nom: "Fournitures Scolaires", code: "FOU-SCO", description: "Cahiers, stylos, sacs, règles, etc." },
    { nom: "Services", code: "SER", description: "Photocopie, impression, plastification" },
  ];

  const insertedCategories = await db.insert(schema.categories).values(categoriesData.map(c => ({ ...c, parentId: null }))).returning();
  console.log(`Inserted ${insertedCategories.length} root categories`);

  const catMap: Record<string, string> = {};
  for (const c of insertedCategories) { catMap[c.code] = c.id; }

  const subCategoriesData = [
    { nom: "Primaire", code: "LIV-SCO-PRI", parentCode: "LIV-SCO" },
    { nom: "Secondaire", code: "LIV-SCO-SEC", parentCode: "LIV-SCO" },
    { nom: "Scientifique", code: "LIV-SCO-SCI", parentCode: "LIV-SCO" },
    { nom: "Littéraire", code: "LIV-SCO-LIT", parentCode: "LIV-SCO" },
    { nom: "Romans & Fictions", code: "LIB-ACC-ROM", parentCode: "LIB-ACC" },
    { nom: "Bandes Dessinées", code: "LIB-ACC-BD", parentCode: "LIB-ACC" },
    { nom: "Jeunesse", code: "LIB-ACC-JEU", parentCode: "LIB-ACC" },
    { nom: "Essais & Documents", code: "LIB-ACC-ESS", parentCode: "LIB-ACC" },
    { nom: "Cahiers", code: "FOU-SCO-CAH", parentCode: "FOU-SCO" },
    { nom: "Stylos & Écriture", code: "FOU-SCO-STY", parentCode: "FOU-SCO" },
    { nom: "Sacs & Cartables", code: "FOU-SCO-SAC", parentCode: "FOU-SCO" },
    { nom: "Géométrie & Dessin", code: "FOU-SCO-GEO", parentCode: "FOU-SCO" },
    { nom: "Papier & Enveloppes", code: "PAP-PAP", parentCode: "PAP" },
    { nom: "Classement & Archives", code: "PAP-CLA", parentCode: "PAP" },
    { nom: "Mobilier Bureau", code: "PAP-MOB", parentCode: "PAP" },
  ];

  const insertedSubCategories = await db.insert(schema.categories).values(
    subCategoriesData.map(sc => ({ nom: sc.nom, code: sc.code, parentId: catMap[sc.parentCode] }))
  ).returning();
  console.log(`Inserted ${insertedSubCategories.length} sub-categories`);

  for (const c of insertedSubCategories) { catMap[c.code] = c.id; }

  // === FOURNISSEURS ===
  const fournisseursData = [
    { nom: "Edicef", code: "EDICEF", telephone: "+229 01 00 00 01", email: "contact@edicef.bj", adresse: "Cotonou" },
    { nom: "Hatier International", code: "HATIER", telephone: "+229 01 00 00 02", email: "contact@hatier.bj", adresse: "Cotonou" },
    { nom: "Hachette Livre", code: "HACHETTE", telephone: "+229 01 00 00 03", email: "contact@hachette.bj", adresse: "Cotonou" },
    { nom: "EDUCI", code: "EDUCI", telephone: "+229 01 00 00 04", email: "contact@educi.bj", adresse: "Cotonou" },
    { nom: "Distribook", code: "DISTRI", telephone: "+229 01 00 00 05", email: "contact@distribook.bj", adresse: "Cotonou" },
    { nom: "Papeterie Centrale", code: "PAP-CENTRALE", telephone: "+229 01 00 00 06", email: "contact@papcentrale.bj", adresse: "Cotonou" },
  ];

  const insertedFournisseurs = await db.insert(schema.fournisseurs).values(fournisseursData).returning();
  console.log(`Inserted ${insertedFournisseurs.length} suppliers`);
  const fMap: Record<string, string> = {};
  for (const f of insertedFournisseurs) { fMap[f.code] = f.id; }

  // === PRODUITS ===
  const produitsData = [
    { titre: "Mathématiques 6e", codeBarre: "AO-00001", auteur: "Colin & al.", editeur: "Hatier", categorieCode: "LIV-SCO-PRI", fournisseurCode: "HATIER", prixVente: "4500", prixAchat: "3200", tva: "5.5", niveauScolaire: "6e", matiere: "Mathématiques", statut: "actif", seuilAlerte: 10 },
    { titre: "Français 6e", codeBarre: "AO-00002", auteur: "Bertrand & al.", editeur: "Edicef", categorieCode: "LIV-SCO-PRI", fournisseurCode: "EDICEF", prixVente: "4200", prixAchat: "2900", tva: "5.5", niveauScolaire: "6e", matiere: "Français", statut: "actif", seuilAlerte: 10 },
    { titre: "Anglais 6e", codeBarre: "AO-00003", auteur: "Williams & al.", editeur: "Hachette", categorieCode: "LIV-SCO-PRI", fournisseurCode: "HACHETTE", prixVente: "4800", prixAchat: "3400", tva: "5.5", niveauScolaire: "6e", matiere: "Anglais", statut: "actif", seuilAlerte: 10 },
    { titre: "SVT 5e", codeBarre: "AO-00004", auteur: "Koffi & al.", editeur: "EDUCI", categorieCode: "LIV-SCO-SCI", fournisseurCode: "EDUCI", prixVente: "5000", prixAchat: "3500", tva: "5.5", niveauScolaire: "5e", matiere: "SVT", statut: "actif", seuilAlerte: 5 },
    { titre: "Physique-Chimie 4e", codeBarre: "AO-00005", auteur: "Mensah & al.", editeur: "Hatier", categorieCode: "LIV-SCO-SCI", fournisseurCode: "HATIER", prixVente: "5500", prixAchat: "3800", tva: "5.5", niveauScolaire: "4e", matiere: "Physique-Chimie", statut: "actif", seuilAlerte: 5 },
    { titre: "Histoire-Géographie 3e", codeBarre: "AO-00006", auteur: "Akakpo & al.", editeur: "Edicef", categorieCode: "LIV-SCO-LIT", fournisseurCode: "EDICEF", prixVente: "5200", prixAchat: "3600", tva: "5.5", niveauScolaire: "3e", matiere: "Histoire-Géographie", statut: "actif", seuilAlerte: 5 },
    { titre: "Le Petit Prince", codeBarre: "AO-00007", auteur: "Saint-Exupéry", editeur: "Gallimard", categorieCode: "LIB-ACC-ROM", fournisseurCode: "DISTRI", prixVente: "2500", prixAchat: "1500", tva: "5.5", statut: "actif", seuilAlerte: 3 },
    { titre: "Une si longue lettre", codeBarre: "AO-00008", auteur: "Mariama Bâ", editeur: "Le Serpent à Plumes", categorieCode: "LIB-ACC-ROM", fournisseurCode: "DISTRI", prixVente: "3500", prixAchat: "2200", tva: "5.5", statut: "actif", seuilAlerte: 3 },
    { titre: "Les Fleurs du Mal", codeBarre: "AO-00009", auteur: "Charles Baudelaire", editeur: "Gallimard", categorieCode: "LIB-ACC-ESS", fournisseurCode: "DISTRI", prixVente: "3000", prixAchat: "1800", tva: "5.5", statut: "actif", seuilAlerte: 2 },
    { titre: "Cahier 200 pages grand format", codeBarre: "AO-00010", auteur: "", editeur: "Oxford", categorieCode: "FOU-SCO-CAH", fournisseurCode: "PAP-CENTRALE", prixVente: "1500", prixAchat: "800", tva: "18", uniteVente: "unite", uniteAchat: "douzaine", statut: "actif", seuilAlerte: 50 },
    { titre: "Stylo Bic bleu (boîte 50)", codeBarre: "AO-00011", auteur: "", editeur: "Bic", categorieCode: "FOU-SCO-STY", fournisseurCode: "PAP-CENTRALE", prixVente: "5000", prixAchat: "3000", tva: "18", uniteVente: "pack", uniteAchat: "carton", statut: "actif", seuilAlerte: 20 },
    { titre: "Sac à dos scolaire", codeBarre: "AO-00012", auteur: "", editeur: "Tann's", categorieCode: "FOU-SCO-SAC", fournisseurCode: "DISTRI", prixVente: "8500", prixAchat: "5500", tva: "18", statut: "actif", seuilAlerte: 10 },
    { titre: "Ramette papier A4 500 feuilles", codeBarre: "AO-00013", auteur: "", editeur: "Clairefontaine", categorieCode: "PAP-PAP", fournisseurCode: "PAP-CENTRALE", prixVente: "4500", prixAchat: "2800", tva: "18", uniteVente: "unite", uniteAchat: "carton", statut: "actif", seuilAlerte: 30 },
    { titre: "Classeur souple A4", codeBarre: "AO-00014", auteur: "", editeur: "Elba", categorieCode: "PAP-CLA", fournisseurCode: "PAP-CENTRALE", prixVente: "1200", prixAchat: "600", tva: "18", statut: "actif", seuilAlerte: 40 },
    { titre: "Compas de précision", codeBarre: "AO-00015", auteur: "", editeur: "Maped", categorieCode: "FOU-SCO-GEO", fournisseurCode: "PAP-CENTRALE", prixVente: "2000", prixAchat: "1100", tva: "18", statut: "actif", seuilAlerte: 15 },
    { titre: "Mathématiques Terminale C", codeBarre: "AO-00016", auteur: "Biaou & al.", editeur: "EDUCI", categorieCode: "LIV-SCO-SEC", fournisseurCode: "EDUCI", prixVente: "6500", prixAchat: "4500", tva: "5.5", niveauScolaire: "Tle C", matiere: "Mathématiques", statut: "actif", seuilAlerte: 5 },
    { titre: "Aimadou Kourouma - En attendant le vote", codeBarre: "AO-00017", auteur: "Ahmadou Kourouma", editeur: "Seuil", categorieCode: "LIB-ACC-ROM", fournisseurCode: "DISTRI", prixVente: "4000", prixAchat: "2500", tva: "5.5", statut: "actif", seuilAlerte: 2 },
  ];

  const insertedProduits = await db.insert(schema.produits).values(
    produitsData.map(p => ({
      titre: p.titre,
      codeBarre: p.codeBarre,
      auteur: p.auteur || null,
      editeur: p.editeur,
      categorieId: catMap[p.categorieCode!],
      fournisseurId: fMap[p.fournisseurCode!],
      prixVente: p.prixVente,
      prixAchat: p.prixAchat,
      tva: p.tva,
      seuilAlerte: p.seuilAlerte,
      statut: p.statut || "actif",
      uniteVente: p.uniteVente || "unite",
      uniteAchat: p.uniteAchat || "unite",
      niveauScolaire: p.niveauScolaire || null,
      matiere: p.matiere || null,
    }))
  ).returning();
  console.log(`Inserted ${insertedProduits.length} products`);

  const produitByBarcode: Record<string, string> = {};
  for (const prod of insertedProduits) { produitByBarcode[prod.codeBarre] = prod.id; }

  const codesBarresValues = produitsData
    .filter(p => produitByBarcode[p.codeBarre])
    .map(p => ({
      produitId: produitByBarcode[p.codeBarre],
      type: "SYSTEME" as const,
      valeur: p.codeBarre,
      estDefaut: true,
    }));

  if (codesBarresValues.length > 0) {
    await db.insert(schema.codesBarres).values(codesBarresValues);
    console.log(`Inserted ${codesBarresValues.length} barcodes`);
  }

  // === STOCKS ===
  const stocksData = insertedProduits.map(p => ({
    produitId: p.id,
    agenceId: insertedAgence[0].id,
    quantite: Math.floor(Math.random() * 80) + 10,
  }));
  await db.insert(schema.stocks).values(stocksData);
  console.log(`Inserted ${stocksData.length} stock entries`);

  console.log("Seed completed successfully!");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
