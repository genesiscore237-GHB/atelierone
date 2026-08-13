/**
 * ⚠️ CE SCRIPT EST DÉPRÉCIÉ
 *
 * Ce script utilisait Supabase Auth (service_role) pour créer un super admin.
 * Le projet utilise désormais NextAuth v5 avec PostgreSQL local.
 * 
 * Pour créer un super admin, utilisez plutôt :
 *   1. Lancez l'application
 *   2. Connectez-vous avec le compte seed : admin@atelierone.bj / admin123
 *   3. Utilisez l'interface d'administration
 * 
 * OU exécutez : pnpm --filter @atelierone/db seed
 */

console.warn("⚠️ Ce script est déprécié. Utilisez 'pnpm --filter @atelierone/db seed' à la place.");
process.exit(0);
