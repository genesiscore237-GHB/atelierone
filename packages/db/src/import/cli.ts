#!/usr/bin/env node
/**
 * CLI d'import standard — le système impose le format.
 *
 * Usage :
 *   tsx src/import/cli.ts format [entite...]        → affiche le guide de format imposé
 *   tsx src/import/cli.ts validate <entite> <fichier> → dry-run, rapport ligne par ligne
 *   tsx src/import/cli.ts import <entite> <fichier> [--apply] → import réel (ou dry-run)
 *   tsx src/import/cli.ts catalogue <dossier> [--apply] → import ordonné d'un dossier de fichiers
 */
import "dotenv/config";
import path from "path";
import { genererGuideFormat, ENTITES } from "./spec";
import { chargerFichier, validerEntite, importerEntite, importerCatalogue, preparerMaps, ORDRE_IMPORT } from "./engine";
import { client } from "../client";
import type { EntiteCle } from "./engine";
import type { ImportContext } from "./types";

// Les invocations via pnpm passent parfois "--" comme séparateur : on le filtre.
const args = process.argv.slice(2).filter((a) => a !== "--");
const [cmd, arg1, arg2, ...rest] = args;
const apply = rest.includes("--apply") || arg2 === "--apply" || args.includes("--apply");

function afficherRapport(rapport: ReturnType<typeof validerEntite>): void {
  console.log(`\n=== ${rapport.entite} — ${rapport.fichier || "entrée in-memory"} ===`);
  console.log(`Total : ${rapport.total} | Valides : ${rapport.valides} | Invalides : ${rapport.invalides} | Existants : ${rapport.existants}`);
  const problemes = rapport.lignes.filter((l) => l.statut !== "valide");
  for (const l of problemes.slice(0, 30)) {
    console.log(`  #${l.index} [${l.statut}] ${l.erreurs.join(" ; ")}`);
  }
  if (problemes.length > 30) console.log(`  ... et ${problemes.length - 30} autres lignes en erreur`);
}

function cleValide(cle: string): cle is EntiteCle {
  return (ORDRE_IMPORT as string[]).includes(cle);
}

async function main(): Promise<void> {
  if (!cmd) {
    console.log(genererGuideFormat());
    return;
  }

  switch (cmd) {
    case "format": {
      if (!arg1) {
        console.log(genererGuideFormat());
        return;
      }
      const cles = process.argv.slice(3).filter((a): a is EntiteCle => cleValide(a));
      if (cleValide(arg1)) cles.push(arg1);
      console.log(genererGuideFormat([...new Set(cles)]));
      return;
    }

    case "validate": {
      if (!arg1 || !arg2) throw new Error("Usage : validate <entite> <fichier>");
      if (!cleValide(arg1)) throw new Error(`Entité inconnue : ${arg1}. Valides : ${ORDRE_IMPORT.join(", ")}`);
      const rows = chargerFichier(arg2);
      afficherRapport(validerEntite(arg1, rows, arg2));
      return;
    }

    case "import": {
      if (!arg1 || !arg2) throw new Error("Usage : import <entite> <fichier> [--apply]");
      if (!cleValide(arg1)) throw new Error(`Entité inconnue : ${arg1}. Valides : ${ORDRE_IMPORT.join(", ")}`);
      const rows = chargerFichier(arg2);
      const rapport = validerEntite(arg1, rows, arg2);
      afficherRapport(rapport);
      if (!apply) {
        console.log("\n[DRY-RUN] Aucune écriture. Ajoutez --apply pour exécuter l'import.");
        return;
      }
      const ctx: ImportContext = { dryRun: false, agenceId: null, userId: null, logs: [] };
      const maps = await preparerMaps();
      const res = await importerEntite(arg1, rows, ctx, maps);
      console.log(`\nImport ${arg1} : ${res.creees} créées, ${res.skippees} skippées, ${res.enErreur} en erreur`);
      return;
    }

    case "catalogue": {
      if (!arg1) throw new Error("Usage : catalogue <dossier> [--apply]");
      const dossier = path.resolve(arg1);
      console.log(`\n[${apply ? "IMPORT RÉEL" : "DRY-RUN"}] Dossier : ${dossier}`);
      const { resultats, rapports } = await importerCatalogue({ dossier, dryRun: !apply });
      for (const r of rapports) afficherRapport(r);
      console.log("\n=== Résultats ===");
      for (const r of resultats) {
        console.log(`  ${r.entite.padEnd(22)} créées:${r.creees}  skippées:${r.skippees}  erreurs:${r.enErreur}`);
      }
      if (!apply) console.log("\n[DRY-RUN] Aucune écriture. Ajoutez --apply pour exécuter l'import.");
      return;
    }

    case "entites": {
      console.log(ORDRE_IMPORT.join("\n"));
      return;
    }

    default:
      throw new Error(`Commande inconnue : ${cmd} (format | validate | import | catalogue | entites)`);
  }
}

main()
  .catch((e) => {
    console.error("ERREUR :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => client.end());
