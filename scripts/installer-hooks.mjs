#!/usr/bin/env node
/**
 * Installe les hooks git du dépôt, dont le verrou de cohérence base.
 *
 * `core.hooksPath` plutôt que `.git/hooks` :
 *   - `.git/hooks` n'est PAS versionné. Un hook écrit à la main disparaît au
 *     premier `git clone`, et l'équipe croira que la garantie tient alors
 *     qu'elle n'existe que sur une machine — le pire des deux mondes ;
 *   - sur Windows, un fichier écrit par PowerShell dans `.git/hooks` n'a pas
 *     le bit d'exécutable : git le saute silencieusement. Le hook peut être
 *     là, lisible, et ne jamais tourner. Constaté par trace GIT_TRACE, où le
 *     push ne montre aucune invocation.
 *
 * Passer par un répertoire versionné règle les deux points d'un coup : le hook
 * est dans le dépôt, et git l'exécute.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = "scripts/git-hooks";
const CIBLE = resolve(ROOT, CHEMIN);

const HOOKS = {
  "pre-push": `#!/bin/sh
# Verrou de cohérence base — installé par scripts/installer-hooks.mjs
# Empêche qu'un push sur \`main\` arrive avant que la production soit à jour.
# Contournement motivé : NO_VERROU_BASE=1 git push origin main
node "$(git rev-parse --show-toplevel)/scripts/verifier-base-avant-push.mjs" "$@"
`,
};

if (!existsSync(resolve(ROOT, ".git"))) {
  console.error("Ce dossier n'est pas un dépôt git.");
  process.exit(1);
}

mkdirSync(CIBLE, { recursive: true });

for (const [nom, corps] of Object.entries(HOOKS)) {
  const chemin = resolve(CIBLE, nom);
  const deja = existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
  if (deja === corps) {
    console.log(`  ${nom} : déjà à jour`);
    continue;
  }
  if (deja && !deja.includes("verifier-base-avant-push.mjs")) {
    console.log(`  ${nom} : hook existant PRÉSERVÉ dans ${CHEMIN} (il n'est pas le nôtre).`);
    console.log(`          Intégrez-le à la main si vous le souhaitez.`);
    continue;
  }
  writeFileSync(chemin, corps, "utf8");
  console.log(`  ${nom} : installé`);
}

const r = spawnSync("git", ["config", "core.hooksPath", CHEMIN], { cwd: ROOT, stdio: "inherit" });
if (r.status !== 0) {
  console.error("Impossible de fixer core.hooksPath.");
  process.exit(1);
}
console.log(`  core.hooksPath = ${CHEMIN}`);

console.log("\nLe verrou de cohérence base est actif sur les push vers `main`.");
console.log("Contournement motivé : NO_VERROU_BASE=1 git push origin main");
