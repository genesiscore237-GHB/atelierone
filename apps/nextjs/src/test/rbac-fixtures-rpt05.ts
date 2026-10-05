/**
 * RPT-05 — Fixtures RBAC REELLES pour les tests d'integration et de securite.
 *
 * Objectif §27 / §36 : ne plus tester la securite avec un `vi.mock` de
 * `RBACService`. On cree de VRAIS roles, de VRAIS role_permissions, de VRAIS
 * utilisateurs, et on laisse la chaine complete
 * `utilisateurs.role_id -> role_permissions -> permissions` resoudre les droits.
 *
 * Les ecritures passent par SQL explicite : un fixture de securite doit montrer
 * quelles colonnes il touche, et le typage drizzle se degrade sur ces tables
 * (imports circulaires `roles` <-> `utilisateurs`).
 *
 * Les fixtures sont creees de facon idempotente et supprimees en fin de suite.
 * Elles ne touchent aucune donnee metier : le seul employe cree sert a prouver
 * le cloisonnement inter-agence (agence 2, sinon vide).
 *
 * IMPORTANT — `namespace` : les fixtures vivent dans des tables GLOBALES
 * (`roles`, `role_permissions`, `utilisateurs`). Deux fichiers d'integration qui
 * partageraient les memes noms se marcheraient dessus en parallele — le
 * `afterAll` de l'un supprimerait les fixtures de l'autre, et l'echec se
 * manifeste par des dizaines de tests qui echouent "pour rien". Chaque
 * fichier appelant doit donc passer un namespace qui lui est propre. Voir
 * `installerFixturesRbac(namespace)`.
 */

import { sql } from "drizzle-orm";

import { db } from "~/server/db";

/** Suffixe par defaut : conserve la compatibilite avec les appels historiques. */
export const NAMESPACE_DEFAUT = "rpt05";

/** Codes de roles, derives du namespace pour rester uniques en base. */
function codesRole(ns: string) {
  return {
    /** Lecture RH sans aucun droit salarial. */
    read: `${ns}_read`,
    /** Lecture RH AVEC droits salariaux. */
    payroll: `${ns}_payroll`,
    /** Depot de justificatif, SANS validation. */
    justif: `${ns}_justif`,
    /** Validation de justificatif. */
    validation: `${ns}_validation`,
    /** Peut demander un export, sans aucun droit salarial. */
    export: `${ns}_export`,
  } as const;
}

/** Emails des profils, derives du namespace (contrainte d'unicite en base). */
function emails(ns: string) {
  return {
    read: `${ns}.read@gpj.cm`,
    payroll: `${ns}.payroll@gpj.cm`,
    justif: `${ns}.justif@gpj.cm`,
    validation: `${ns}.validation@gpj.cm`,
    /** Profil autorise a exporter, sans aucun droit salarial. */
    export: `${ns}.export@gpj.cm`,
    /** Agence 2 : hors du perimetre de l'agence 1. */
    etranger: `${ns}.etranger@gpj.cm`,
  } as const;
}

/** Noms lisibles des roles. */
function nomsRole(code: string, ns: string): string {
  return `RPT-05 ${code.replace(`${ns}_`, "")} (${ns})`;
}

/**
 * Droits de chaque profil. Volontairement minimaux et differents : c'est la
 * difference entre les deux qui prouve le masquage. Inchange par namespace —
 * ce sont les permissions du SOCLE, pas des noms de fixtures.
 */
const DROITS_PAR_SUFFIXE = {
  read: ["rh.employe.consulter", "rh.presence.consulter", "rh.conge.consulter"],
  payroll: [
    "rh.employe.consulter",
    "rh.presence.consulter",
    "rh.conge.consulter",
    "rh.salaire.consulter",
    "rh.paie.modifier",
  ],
  justif: ["rh.employe.consulter", "rh.presence.consulter", "rh.absence.justifier"],
  validation: [
    "rh.employe.consulter",
    "rh.presence.consulter",
    "rh.absence.justifier",
    "rh.absence.valider",
  ],
  // Profil qui peut demander un export SANS aucun droit salarial : prouve que
  // `export.consulter` est bien exige separement, et que la propriete d'un job
  // ne se confond pas avec le droit de voir des montants.
  export: ["export.consulter"],
} as const;

type Profil = keyof typeof DROITS_PAR_SUFFIXE;

/** Les 5 profils RH + le profil export + l'utilisateur d'une autre agence. */
export type ProfilsFixture = keyof typeof DROITS_PAR_SUFFIXE | "etranger";

export interface FixturesRbac {
  users: Record<ProfilsFixture, number>;
  employeAgence1: number;
  employeEtranger: number;
  agenceEtrangere: number;
}

type Row = Record<string, unknown>;

/** Liste `IN (...)` a parametres lies : jamais de concatenation de litteraux. */
const IN = (valeurs: readonly string[]) =>
  sql.join(
    valeurs.map((v) => sql`${v}`),
    sql`, `
  );

async function premiereAgenceHorsDe(exclu: number): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT id FROM agences WHERE id <> ${exclu} ORDER BY id LIMIT 1`
  )) as unknown as Row[];
  const autre = Number(rows[0]?.id);
  if (!Number.isFinite(autre)) {
    throw new Error("Fixtures RPT-05 : il faut au moins deux agences pour tester le tenant.");
  }
  return autre;
}

/** Matricule de l'employe temoin, unique par namespace (contrainte unique). */
function matriculeEtranger(ns: string): string {
  return `${ns.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-XTG`;
}

/**
 * Cree (ou reutilise) toutes les fixtures. Idempotent : deux appels successifs
 * renvoient les memes identifiants.
 *
 * @param ns namespace propre au fichier appelant. DEUX fichiers qui
 *   partageraient le defaut se supprimeraient mutuellement leurs fixtures en
 *   parallele. Voir l'avertissement d'en-tete de module.
 */
export async function installerFixturesRbac(ns: string = NAMESPACE_DEFAUT): Promise<FixturesRbac> {
  const CODE_ROLE = codesRole(ns);
  const EMAIL = emails(ns);
  const DROITS: Record<string, string[]> = {};
  for (const [profil, codes] of Object.entries(DROITS_PAR_SUFFIXE)) {
    DROITS[CODE_ROLE[profil as Profil]] = [...codes];
  }
  // Meme role que `payroll` : c'est la borne TENANT qui doit l'arreter, pas un
  // droit manquant.
  const roleDe = (profil: ProfilsFixture): string =>
    profil === "etranger" ? CODE_ROLE.payroll : CODE_ROLE[profil];

  const agenceEtrangere = await premiereAgenceHorsDe(1);

  // 1. Permissions : elles doivent exister (migration RPT-05). On echoue loudly
  //    plutot que d'inventer un droit absent du socle.
  const codesAttendus = [...new Set(Object.values(DROITS_PAR_SUFFIXE).flat())];
  const connues = (await db.execute(
    sql`SELECT code FROM permissions WHERE code IN (${IN(codesAttendus)})`
  )) as unknown as Row[];
  const manquantes = codesAttendus.filter(
    (c) => !connues.some((k) => k.code === c)
  );
  if (manquantes.length > 0) {
    throw new Error(
      `Fixtures RPT-05 : permissions absentes de la base : ${manquantes.join(", ")}. ` +
        `Lancez packages/db/src/migrate-rpt05-securite-centre.ts.`
    );
  }

  // 2. Roles + associations. On repart d'un jeu propre pour que le fixture
  //    decrive exactement le profil annonce, meme apres un run interrompu.
  await retirerFixturesRbac(ns);

  const roleIdParCode: Record<string, string> = {};
  for (const code of Object.values(CODE_ROLE)) {
    const insere = (await db.execute(
      sql`INSERT INTO roles (code, nom, description, niveau)
          VALUES (${code}, ${nomsRole(code, ns)}, ${`Fixture de test RPT-05 (${ns})`}, 0)
          RETURNING id`
    )) as unknown as Row[];
    roleIdParCode[code] = String(insere[0].id);

    const codes = DROITS[code]!;
    await db.execute(
      sql`INSERT INTO role_permissions (role_id, permission_id)
          SELECT ${roleIdParCode[code]}::uuid, p.id
            FROM permissions p
           WHERE p.code IN (${IN(codes)})`
    );
  }

  // 3. Utilisateurs : un par profil, plus un utilisateur d'une autre agence.
  const users = {} as FixturesRbac["users"];
  for (const [cle, email] of Object.entries(EMAIL)) {
    const profil = cle as keyof typeof EMAIL;
    const etranger = profil === "etranger";
    const roleId = roleIdParCode[roleDe(profil)]!;
    const insere = (await db.execute(
      sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
          VALUES (${email}, ${`RPT05 ${profil}`}, ${`Fixture ${ns}`},
                  ${etranger ? agenceEtrangere : 1},
                  ${roleId}::uuid, true, 'active')
          RETURNING id`
    )) as unknown as Row[];
    users[profil] = Number(insere[0].id);
  }

  // 4. Un employe en agence 2 (etranger) et un employe temoin en agence 1.
  const etranger = (await db.execute(
    sql`INSERT INTO employes (matricule, nom, prenom, fonction, type_employe, statut, agence_id, salaire_base)
        VALUES (${matriculeEtranger(ns)}, 'ETRANGER', 'RPT05',
                'Temoin cloisonnement inter-agence', 'permanent', 'actif',
                ${agenceEtrangere}, 999999)
        RETURNING id`
  )) as unknown as Row[];

  const agence1 = await premiereAgenceHorsDe(agenceEtrangere);
  const temoin = (await db.execute(
    sql`SELECT id FROM employes WHERE agence_id = ${agence1} AND statut = 'actif' ORDER BY id LIMIT 1`
  )) as unknown as Row[];

  return {
    users,
    employeAgence1: Number(temoin[0].id),
    employeEtranger: Number(etranger[0].id),
    agenceEtrangere,
  };
}

/**
 * Supprime les fixtures du namespace. Utilise en `afterAll`.
 *
 * Le nettoyage est CIBLE : il ne touche qu'aux lignes de ce namespace, pour que
 * deux fichiers d'integration puissent tourner en parallele sans se faconner.
 */
export async function retirerFixturesRbac(ns: string = NAMESPACE_DEFAUT): Promise<void> {
  const CODE_ROLE = codesRole(ns);
  const EMAIL = emails(ns);
  await db.execute(sql`DELETE FROM employes WHERE matricule = ${matriculeEtranger(ns)}`);
  // Le middleware d'audit ecrit dans `audit_logs` pour chaque mutation reussie,
  // et cette table reference `utilisateurs` (FK). Sans ce DELETE, le nettoyage
  // echoue sur une violation de cle etrangere des que la suite a appele une
  // mutation — ce qui rend l'echec tres difficile a relier a sa cause.
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email IN (${IN(
      Object.values(EMAIL)
    )}))`
  );
  await db.execute(
    sql`DELETE FROM utilisateurs WHERE email IN (${IN(Object.values(EMAIL))})`
  );
  await db.execute(
    sql`DELETE FROM role_permissions WHERE role_id IN (
          SELECT id FROM roles WHERE code IN (${IN(Object.values(CODE_ROLE))}))`
  );
  await db.execute(
    sql`DELETE FROM roles WHERE code IN (${IN(Object.values(CODE_ROLE))})`
  );
}