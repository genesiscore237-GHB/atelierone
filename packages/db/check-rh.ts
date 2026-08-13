import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./src/client";
import * as schema from "./src/schema";
import { eq } from "drizzle-orm";

async function main() {
  const users = await db.select().from(schema.utilisateurs).where(eq(schema.utilisateurs.email, "rh@atelierone.cm"));
  console.log("User found:", users.length > 0);
  if (users.length > 0) {
    console.log("Email:", users[0].email);
    console.log("RoleId:", users[0].roleId);
    console.log("IsActive:", users[0].isActive);
    console.log("Status:", users[0].status);
    const match = await bcrypt.compare("admin123", users[0].motDePasse);
    console.log("Password match:", match);
    const role = await db.select().from(schema.roles).where(eq(schema.roles.id, users[0].roleId));
    console.log("Role:", role[0]?.code, role[0]?.nom);
  } else {
    const all = await db.select().from(schema.utilisateurs);
    console.log(`Total users in DB: ${all.length}`);
    for (const u of all) console.log(`  ${u.email} role=${u.roleId} active=${u.isActive}`);
  }
}
main().catch(console.error);
