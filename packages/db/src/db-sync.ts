import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SYNCHRONISATION COMPLETE D'UNE BASE
 *
 * Un seul point d'entrée pour rendre une base conforme à l'état attendu :
 *
 *   1. migrations SQL   — schéma à jour, dans l'ordre du journal
 *   2. socle sécurité  — rôles, permissions et matrice RBAC
 *   3. données dérivées — fiches clients et véhicules reconstruites depuis le
 *                         registre parking
 *   4. vérification     — invariants contrôlés, échec = code de sortie 1
 *
 * L'ordre n'est pas décoratif. Appliquer le socle avant les migrations échoue
 * sur une colonne absente ; reconstruire les données dérivées avant les
 * migrations échoue sur `immatriculation` encore NOT NULL. La séquence est
 * donc figée ici, et c'est la seule chose qu'un déploiement a à savoir.
 *
 * CHAQUE ÉTAPE EST IDEMPOTENTE : relancer le pipeline ne doit jamais dupliquer
 * une ligne ni casser quoi que ce soit. C'est la condition pour qu'on puisse
 * l'enchainer sur chaque push, sans avoir a prevoir le cas particulier.
 *
 *   pnpm -F @atelierone/db db:sync                    (base locale)
 *   FORCE=1 pnpm -F @atelierone/db db:sync            (base distante)
 */

const ICI = path.dirname(fileURLToPath(import.meta.url));

interface Etape {
  nom: string;
  script: string;
  args?: string[];
  pourquoi: string;
}

const ETAPES: Etape[] = [
  {
    nom: "Migrations SQL",
    script: "migrate-sql.ts",
    pourquoi: "aligner le schéma",
  },
  {
    nom: "Socle sécurité",
    script: "seed-socle.ts",
    pourquoi: "rôles, permissions et matrice RBAC",
  },
  {
    nom: "Clients parking",
    script: "migrate-parking-clients.ts",
    pourquoi: "créer les fiches clients depuis le registre",
  },
  {
    nom: "Véhicules parking",
    script: "migrate-parking-vehicules.ts",
    pourquoi: "créer et relier les fiches véhicules",
  },
  {
    nom: "Rattachement clients",
    script: "migrate-parking-clients.ts",
    pourquoi: "associer chaque véhicule à son client",
  },
];

function lancer(e: Etape): boolean {
  // On lance le POINT D'ENTRÉE JS de tsx (`tsx/dist/cli.mjs`) et non le
  // exécutable `tsx` / `tsx.cmd` : ce dernier est un script batch sous
  // Windows, que `node` refuse d'exécuter (« Invalid or unexpected token »),
  // et un shell POSIX ailleurs. Le point d'entrée est du JavaScript dans les
  // deux cas.
  const candidats = [
    path.join(ICI, "..", "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(ICI, "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  const cli = candidats.find((p) => existsSync(p));
  if (!cli) {
    console.error(`  tsx introuvable (cherche : ${candidats.join(" | ")})`);
    return false;
  }
  const r = spawnSync(process.execPath, [cli, path.join(ICI, e.script), ...(e.args ?? [])], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.error) {
    console.error(`  ${r.error.message}`);
    return false;
  }
  return r.status === 0;
}

const cible = process.env.DATABASE_URL
  ? (() => {
      try {
        const u = new URL(process.env.DATABASE_URL!);
        return `${u.host}/${u.pathname.slice(1)}`;
      } catch {
        return "URL illisible";
      }
    })()
  : "(DATABASE_URL absente)";

console.log("=".repeat(66));
console.log(`SYNCHRONISATION DE LA BASE — ${cible}`);
console.log("=".repeat(66));

for (const [i, etape] of ETAPES.entries()) {
  console.log(`\n[${i + 1}/${ETAPES.length}] ${etape.nom} — ${etape.pourquoi}`);
  console.log("-".repeat(66));
  if (!lancer(etape)) {
    console.error(`\nECHEC à l'étape « ${etape.nom} ». Étapes suivantes non exécutées :`);
    console.error("la base est dans un état intermédiaire, il faut corriger avant de reprendre.");
    process.exit(1);
  }
}

console.log("\n" + "=".repeat(66));
console.log("SYNCHRONISATION TERMINEE — toutes les etapes sont passees.");
console.log("=".repeat(66));
