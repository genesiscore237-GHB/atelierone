#!/usr/bin/env node
/**
 * Installe les hooks git locaux, dont le verrou de cohérence base.
 *
 * `.git/hooks` n'est PAS versionné : un `.git/hooks/pre-push` écrit à la main
 * disparaît au premier `git clone`, et l'équipe croira que la garantie tient
 * alors qu'elle n'existe que sur une machine. Ce script rend l'installation
 * reproductible — `pnpm hooks:install` — plutôt que dépendre d'un souvenir.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = resolve(ROOT, ".git", "hooks");

const HOOKS_A_INSTALLER = {
  "pre-push": `#!/bin/sh
# Verrou de cohérence base — installé par scripts/installer-hooks.mjs
# Empêche qu'un push sur \`main\` arrive avant que la production soit à jour.
# Contournement motivé : NO_VERROU_BASE=1 git push origin main
node "$(git rev-parse --show-toplevel)/scripts/verifier-base-avant-push.mjs" "$@"
`,
};

if (!existsSync(HOOKS)) {
  console.error("hooks/ introuvable : ce dépôt n'est pas un dépôt git (ou .git a été déplacé).");
  process.exit(1);
}

for (const [nom, corps] of Object.entries(HOOKS_A_INSTALLER)) {
  const chemin = resolve(HOOKS, nom);
  const deja = existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
  if (deja && deja === corps) {
    console.log(`  ${nom} : déjà à jour`);
    continue;
  }
  if (deja && !deja.includes("verifier-base-avant-push.mjs")) {
    // Un hook maison existe déjà : on ne l'écrase pas sans le dire.
    console.log(`  ${nom} : hook existant PRÉSERVÉ (il n'est pas le nôtre).`);
    console.log(`          Intégrez-le à la main si vous le souhaitez.`);
    continue;
  }
  writeFileSync(chemin, corps, "utf8");
  try {
    const { chmodSync } = await import("node:fs");
    chmodSync(chemin, 0o755);
  } catch {
    // Sans chmod (Windows), Git exécute les hooks via sh : sans conséquence.
  }
  console.log(`  ${nom} : installé`);
}

console.log("\nLe verrou de cohérence base est actif sur les push vers `main`.");
console.log("Contournement motivé : NO_VERROU_BASE=1 git push origin main");
