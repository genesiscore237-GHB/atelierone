/**
 * dev-local.mjs — démarre UN SEUL serveur de dev propre, sans empilement,
 * et pré-compile les routes principales dès qu'il est prêt.
 *
 * Pourquoi : sur des postes à ressort limité (peu de RAM / double-cœur),
 * lancer plusieurs `pnpm dev` successifs empile des processus (pnpm/wrappers,
 * turbo watch, next dev) qui se disputent le CPU et la RAM, rendant le local
 * très lent. De plus, `next dev` compile chaque route paresseusement
 * (10-30 s par route) : le warm-up ci-dessous supprime cette attente pour les
 * pages principales.
 *
 * Ce script :
 *   1. tue tout serveur de dev existant de CE workspace (port 3000, next dev,
 *      wrappers turbo/pnpm de ce projet) pour repartir d'un état propre ;
 *   2. lance `next dev --port 3000` (webpack, PAS turbopack : turbopack est
 *      nettement plus lent sur ce poste) directement dans apps/nextjs, sans la
 *      couche `turbo watch` du `dev` racine ;
 *   3. dès que le serveur répond, lance `scripts/warmup.mjs` qui pré-compile
 *      les ~20 routes principales (la navigation devient immédiate).
 *
 * Usage :  pnpm dev:local   (à la racine du repo)
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const PORT = 3000;

function killCommandLineNodeProcs() {
  if (isWin) {
    const ps = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
    let rows = [];
    try {
      const parsed = JSON.parse(ps);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows = [];
    }
    for (const r of rows) {
      if (!r.CommandLine) continue;
      const cmd = r.CommandLine;
      const isNextDev = /dist[\\/]bin[\\/]next/.test(cmd) && /\bdev\b/.test(cmd);
      const fromThisRepo = cmd.includes(root.replaceAll("/", "\\"));
      const isTurboWatch = /(^|[\\/])turbo(\.exe)?["']?(\s|\x22)+watch/.test(cmd);
      const isPnpmParent = cmd.includes("pnpm") && fromThisRepo && /\bdev\b/.test(cmd);
      if (isNextDev || isTurboWatch || isPnpmParent) {
        try {
          process.kill(Number(r.ProcessId), "SIGTERM");
          console.log(`  ✓ tué (pid ${r.ProcessId}): ${cmd.slice(0, 90)}`);
        } catch {
          /* déjà parti */
        }
      }
    }
  } else {
    try {
      execSync(`pkill -f "next.*dev" || true`, { shell: "/bin/bash" });
    } catch {
      /* noop */
    }
  }
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status > 0) return true;
    } catch {
      /* pas encore prêt */
    }
    await sleep(1000);
  }
  return false;
}

async function main() {
  console.log("→ Nettoyage des serveurs de dev existants de ce projet...");
  killCommandLineNodeProcs();
  await sleep(2500); // laisse le port 3000 se libérer avant de redémarrer

  const nextjs = path.join(root, "apps", "nextjs");
  if (!existsSync(path.join(nextjs, "package.json"))) {
    console.error("✗ apps/nextjs introuvable");
    process.exit(1);
  }
  const nextBin = path.join(nextjs, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    console.error("✗ binaire next introuvable : " + nextBin);
    console.error('  Lancez d’abord `pnpm install` puis réessayez.');
    process.exit(1);
  }
  console.log(`→ Démarrage de \`next dev --port ${PORT}\` (webpack) dans apps/nextjs...`);
  const child = spawn(process.execPath, [nextBin, "dev", "--port", String(PORT)], {
    cwd: nextjs,
    stdio: "inherit",
    env: { ...process.env },
  });

  const ready = await waitForServer(`http://localhost:${PORT}/login`, 180_000);
  if (ready) {
    console.log("→ Serveur prêt. Pré-compilation des routes principales (warm-up)...");
    const warmup = spawn(process.execPath, [path.join(root, "scripts", "warmup.mjs"), String(PORT)], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env },
    });
    warmup.on("error", (e) => console.error("warm-up échoué:", e.message));
  } else {
    console.error("✗ Serveur non prêt après 180 s — warm-up annulé.");
  }

  child.on("exit", (code, signal) => {
    console.log(`Serveur terminé (code=${code}, signal=${signal})`);
    process.exitCode = code ?? 1;
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

main();