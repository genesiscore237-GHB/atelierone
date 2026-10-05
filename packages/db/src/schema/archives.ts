import { bigserial, integer, jsonb, pgTable, text, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

// ─── Archivage générique (miroir drizzle de `schema-extras.sql` : 0020_generalized_archive.sql) ───
// La table est créée par le script SQL brut (CREATE TABLE IF NOT EXISTS + index + RLS).
// Sa déclaration ici évite que `drizzle-kit push` la voie comme une table orpheline et
// propose des renommage (`archives › <nouvelle table>`) à chaque création de table.
export const archives = pgTable(
  "archives",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: integer("entity_id").notNull(),
    agenceId: integer("agence_id").references(() => agences.id),
    snapshot: jsonb("snapshot").notNull(),
    archivedBy: integer("archived_by").references(() => utilisateurs.id),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow(),
    restoredAt: timestamp("restored_at"),
    restoredBy: integer("restored_by").references(() => utilisateurs.id),
  },
  (t) => ({
    idxEntity: index("idx_archives_entity").on(t.entityType, t.entityId),
    idxAgence: index("idx_archives_agence").on(t.agenceId),
    idxCreated: index("idx_archives_created").on(t.createdAt.desc()),
  })
);