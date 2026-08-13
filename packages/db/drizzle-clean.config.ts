import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const urlRaw = process.env.DATABASE_URL ?? "";
const isRemote = !urlRaw.includes("@localhost:") && !urlRaw.includes("@127.0.0.1:");
// On retire le paramètre sslmode de l'URL : avec pg v9, sslmode=require est
// traité comme verify-full et entre en conflit avec rejectUnauthorized:false.
const url = urlRaw.replace(/[?&]sslmode=[^&]+/, "").replace(/\?$/, "");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle-clean",
  dialect: "postgresql",
  dbCredentials: {
    url,
    // SSL uniquement pour les bases distantes (Supabase) : le PostgreSQL local
    // n'accepte pas SSL et une tentative SSL pend indéfiniment.
    ssl: isRemote ? { rejectUnauthorized: false } : false,
  },
});
