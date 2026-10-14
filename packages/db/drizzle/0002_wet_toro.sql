CREATE TABLE "parking_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"site_source_id" integer NOT NULL,
	"site_destination_id" integer NOT NULL,
	"statut" varchar(20) DEFAULT 'EN_ATTENTE' NOT NULL,
	"motif" text NOT NULL,
	"commentaire" text,
	"zone_origine_id" integer,
	"position_origine_x" double precision,
	"position_origine_y" double precision,
	"cree_par_id" integer,
	"expedie_par_id" integer,
	"date_expedition" timestamp,
	"recu_par_id" integer,
	"date_reception" timestamp,
	"annule_par_id" integer,
	"date_annulation" timestamp,
	"motif_annulation" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_vehicle_id_parking_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."parking_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_site_source_id_parking_sites_id_fk" FOREIGN KEY ("site_source_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_site_destination_id_parking_sites_id_fk" FOREIGN KEY ("site_destination_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_zone_origine_id_parking_zones_id_fk" FOREIGN KEY ("zone_origine_id") REFERENCES "public"."parking_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_expedie_par_id_utilisateurs_id_fk" FOREIGN KEY ("expedie_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_recu_par_id_utilisateurs_id_fk" FOREIGN KEY ("recu_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_transfers" ADD CONSTRAINT "parking_transfers_annule_par_id_utilisateurs_id_fk" FOREIGN KEY ("annule_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_parking_transfers_vehicle_id" ON "parking_transfers" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_parking_transfers_statut" ON "parking_transfers" USING btree ("statut");
