import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
const ssl = !url.includes("localhost") && !url.includes("127.0.0.1") ? "require" : false;
const connection = postgres(url, { max: 1, prepare: false, ssl });

await connection.unsafe("ALTER TABLE paiements ADD COLUMN IF NOT EXISTS retour_id INTEGER REFERENCES retours(id)");
console.log("Column retour_id added to paiements");

await connection.end();
