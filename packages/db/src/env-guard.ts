// Garde-fou : interdit d'exécuter un seed / script d'écriture contre une base
// distante (Supabase cloud) sans consentement explicite (FORCE=1).
export function requireLocalOrForced(app: string) {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url.includes("@localhost:") || url.includes("@127.0.0.1:");
  if (isLocal || process.env.FORCE === "1") return;
  let host = "distante";
  try { host = new URL(url).host; } catch {}
  console.error(`[${app}] Refus: DATABASE_URL pointe vers la base distante "${host}".`);
  console.error("  Cible locale attendue (postgresql://...@localhost:5432/...).");
  console.error('  Pour forcer quand même (consentement explicite) : FORCE=1 ' + app);
  process.exit(1);
}
