import { pgTable, serial, integer, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organisations } from "./platform";

/**
 * Snapshot de qualité du référentiel catalogue (CAT-01).
 * Rempli par le service côté serveur, TTL 10 min, advisory lock
 * pour éviter les recalculs concurrents.
 */
export const catalogueQualite = pgTable("catalogue_qualite", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").references(() => organisations.id),
  // Nombre total d'articles/produits dans le snapshot
  totalArticles: integer("total_articles").notNull().default(0),
  totalVariantes: integer("total_variantes").notNull().default(0),
  totalModeles: integer("total_modeles").notNull().default(0),
  // Problèmes détectés (tableau de { code, count, severity, label })
  problemes: jsonb("problemes").$type<Array<{
    code: string;
    count: number;
    severity: "error" | "warning" | "info";
    label: string;
  }>>().default([]),
  // Score global 0-100
  score: integer("score").notNull().default(100),
  // Métadonnées du snapshot
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  generationDurationMs: integer("generation_duration_ms"),
});
