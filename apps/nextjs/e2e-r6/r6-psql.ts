import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Exécute du SQL via un fichier temporaire (UTF-8) au lieu d'un argument -c :
// évite la conversion de la page de codes console Windows qui corrompt les
// caractères accentués. Comportement d'usage identique (sorties -t -A, ON_ERROR_STOP).
export function PSQL(sql: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "r6-psql-")), "cur.sql");
  try {
    fs.writeFileSync(file, sql, "utf8");
    return execSync(
      `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" -U postgres -h localhost -d atelierone_erp -X -t -A -v ON_ERROR_STOP=1 -f "${file}"`,
      { env: { ...process.env, PGPASSWORD: "postgres", PGCLIENTENCODING: "UTF8" }, encoding: "utf8", stdio: "pipe" }
    )
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "")
      .trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
}