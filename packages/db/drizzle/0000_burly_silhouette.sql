CREATE TABLE "absences" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" integer NOT NULL,
	"type_absence" varchar(50) NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"duree_jours" numeric(5, 1),
	"motif" text,
	"justifie" boolean DEFAULT false,
	"valide_par" integer,
	"statut" varchar(50) DEFAULT 'en_attente',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "achats" (
	"id" serial PRIMARY KEY NOT NULL,
	"fournisseur_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"reference" varchar(100) NOT NULL,
	"statut" varchar(50) DEFAULT 'brouillon' NOT NULL,
	"or_id" integer,
	"vehicule_id" integer,
	"demande_id" integer,
	"total_ht" numeric(12, 2),
	"total_tva" numeric(12, 2),
	"total_ttc" numeric(12, 2),
	"notes" text,
	"demandeur" varchar(255),
	"demandeur_id" integer,
	"date_souhaitee" date,
	"priorite" varchar(20) DEFAULT 'normale' NOT NULL,
	"motif" text,
	"destination_pos_id" integer,
	"livraison_attendue" date,
	"cree_par" integer,
	"montant_recu" numeric(12, 2) DEFAULT '0',
	"montant_paye" numeric(12, 2) DEFAULT '0',
	"date_cloture" timestamp,
	"cloture_par" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "achats_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "achats_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"achat_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"or_id" integer,
	"quantite" integer NOT NULL,
	"unite_id" uuid,
	"facteur_conversion" numeric(12, 6) DEFAULT '1' NOT NULL,
	"quantite_convertie" numeric(12, 2),
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"total_ligne" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "achats_partenaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"partenaire_id" integer NOT NULL,
	"produit_designation" varchar(500) NOT NULL,
	"prix_achat_partenaire" numeric(12, 2) NOT NULL,
	"prix_vente_client" numeric(12, 2) NOT NULL,
	"marge_brute" numeric(12, 2) NOT NULL,
	"commission_pourcent" numeric(5, 2) NOT NULL,
	"commission_agent" numeric(12, 2) NOT NULL,
	"montant_caisse" numeric(12, 2) NOT NULL,
	"agent_id" integer NOT NULL,
	"vente_id" integer,
	"agence_id" integer NOT NULL,
	"statut" varchar(50) DEFAULT 'termine',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "achats_partenaires_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "advance_recoveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"advance_id" integer NOT NULL,
	"date_recuperation" date NOT NULL,
	"montant" numeric(12, 0) NOT NULL,
	"periode_concernee_debut" date,
	"periode_concernee_fin" date,
	"payroll_entry_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "advance_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"advance_id" integer NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"acteur_id" integer,
	"justification" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agences" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer,
	"nom" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"adresse" varchar(500),
	"telephone" varchar(50),
	"email" varchar(255),
	"ville" varchar(100),
	"pays" varchar(100) DEFAULT 'BÃ©nin',
	"slogan" varchar(255),
	"logo_url" text,
	"rc_rccm" varchar(50),
	"niu" varchar(50),
	"ifu" varchar(50),
	"capital" varchar(100),
	"site_web" varchar(255),
	"devise" varchar(10) DEFAULT 'XAF',
	"tva_defaut" numeric(5, 2) DEFAULT '0',
	"prefixe_facture" varchar(20) DEFAULT 'PF',
	"prefixe_devis" varchar(20) DEFAULT 'DEV-',
	"prefixe_or" varchar(20) DEFAULT 'OR-',
	"prefixe_bc" varchar(20) DEFAULT 'BC-',
	"mention_pied_facture" text,
	"mention_pied_ticket" text,
	"politique_retour" text,
	"facture_champs_visibles" jsonb DEFAULT '{}'::jsonb,
	"commission_agent_pourcent" numeric(5, 2) DEFAULT '10',
	"bourse_marge_pourcent" numeric(5, 2) DEFAULT '30',
	"marge_defaut_manuels" numeric(5, 2) DEFAULT '25',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agences_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "alertes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"severite" varchar(50) DEFAULT 'MOYENNE',
	"titre" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"donnees" jsonb,
	"est_resolue" boolean DEFAULT false,
	"resolue_le" timestamp,
	"resolue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alertes_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"type_alerte" varchar(50) NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approbations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"type_ressource" varchar(50) NOT NULL,
	"ressource_id" varchar(100),
	"demande_par" integer NOT NULL,
	"approuve_par" integer,
	"statut" varchar(50) DEFAULT 'en_attente',
	"motif" text,
	"created_at" timestamp DEFAULT now(),
	"mis_a_jour_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "archives" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" integer NOT NULL,
	"agence_id" integer,
	"snapshot" jsonb NOT NULL,
	"archived_by" integer,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"restored_at" timestamp,
	"restored_by" integer
);
--> statement-breakpoint
CREATE TABLE "article_attributs" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"cle" varchar(100) NOT NULL,
	"valeur" text,
	"unite" varchar(30),
	"ordre" integer DEFAULT 0 NOT NULL,
	"type_attribut" varchar(20) DEFAULT 'TEXTE',
	"min" numeric(12, 2),
	"max" numeric(12, 2),
	"portee" varchar(20) DEFAULT 'ARTICLE',
	"obligatoire" boolean DEFAULT false NOT NULL,
	"searchable" boolean DEFAULT false NOT NULL,
	"filtrable" boolean DEFAULT false NOT NULL,
	"comparable" boolean DEFAULT false NOT NULL,
	"liste" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"precision" numeric(8, 4),
	"aide" text,
	"unite_id" uuid,
	"statut_valeur" varchar(20) DEFAULT 'RENSEIGNE' NOT NULL,
	"provenance" varchar(30),
	"source" varchar(160),
	"niveau_confiance" varchar(20),
	"source_date" timestamp,
	"source_par" integer,
	"preuve" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_article_attribut" UNIQUE("article_id","cle")
);
--> statement-breakpoint
CREATE TABLE "article_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"type" varchar(40),
	"titre" varchar(200),
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "article_equivalences" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"article_equivalent_id" integer NOT NULL,
	"type" varchar(30) DEFAULT 'SUPERSESSION',
	"priorite" integer DEFAULT 0,
	"notes" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "atelier_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"or_id" integer,
	"type" varchar(40) NOT NULL,
	"titre" varchar(255) NOT NULL,
	"message" text,
	"lu" boolean DEFAULT false,
	"lue_par" integer,
	"lue_le" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "atelier_parametres" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"seuil_promesse_jours" integer DEFAULT 1,
	"seuil_immobilisation_jours" integer DEFAULT 5,
	"seuil_bloque_jours" integer DEFAULT 3,
	"seuil_sav_jours" integer DEFAULT 30,
	"emplacements" text DEFAULT '["Réception","Parc A","Parc B","Pont 1","Pont 2","Carrosserie","Diagnostic"]',
	"raisons_blocage" text DEFAULT '["Pièces manquantes","Validation client","Diagnostic incomplet","Attente expertise","Manque technicien","Outillage","Autre"]',
	"texte_accuse_reception" text DEFAULT 'Nous accusons réception de votre véhicule {IMMATRICULATION} sous l''ordre {OR}. Restitution promise : {PROMESSE}.',
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "atelier_parametres_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_calculations" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_entry_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"raw_minutes" integer DEFAULT 0,
	"break_minutes" integer DEFAULT 0,
	"worked_minutes" integer DEFAULT 0,
	"normal_minutes" integer DEFAULT 0,
	"overtime_minutes" integer DEFAULT 0,
	"late_minutes" integer DEFAULT 0,
	"late_deductible_minutes" integer DEFAULT 0,
	"late_deduction_amount" numeric(12, 2) DEFAULT '0',
	"early_departure_minutes" integer DEFAULT 0,
	"is_absent" boolean DEFAULT false,
	"code_presence" varchar(2) DEFAULT 'P',
	"absence_financial_impact" numeric(12, 2) DEFAULT '0',
	"calculation_details" jsonb,
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"time_in" time,
	"time_in_break" time,
	"time_out_break" time,
	"time_out" time,
	"source" varchar(20) DEFAULT 'manual',
	"status" varchar(30) DEFAULT 'PRESENT',
	"absence_type" varchar(30),
	"absence_motif" text,
	"absence_justificatif" text,
	"notes" text,
	"validate_early_arrival" boolean DEFAULT false,
	"validate_late_departure" boolean DEFAULT false,
	"task_bonus" numeric(12, 2) DEFAULT '0',
	"validated" boolean DEFAULT false,
	"validated_by" integer,
	"validated_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_monthly_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total_normal_minutes" integer DEFAULT 0,
	"total_overtime_minutes" integer DEFAULT 0,
	"total_late_minutes" integer DEFAULT 0,
	"total_late_deductible_minutes" integer DEFAULT 0,
	"total_late_deduction_amount" numeric(12, 2) DEFAULT '0',
	"total_absence_financial_impact" numeric(12, 2) DEFAULT '0',
	"total_task_bonus" numeric(12, 2) DEFAULT '0',
	"days_present" integer DEFAULT 0,
	"days_absent" integer DEFAULT 0,
	"days_on_leave" integer DEFAULT 0,
	"locked" boolean DEFAULT false,
	"locked_at" timestamp,
	"locked_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attribut_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer,
	"famille_id" integer,
	"type_produit" varchar(20),
	"portee" varchar(20) DEFAULT 'ARTICLE' NOT NULL,
	"cle" varchar(100) NOT NULL,
	"libelle" varchar(160) NOT NULL,
	"type_attribut" varchar(20) DEFAULT 'TEXTE' NOT NULL,
	"obligatoire" boolean DEFAULT false NOT NULL,
	"searchable" boolean DEFAULT false NOT NULL,
	"filtrable" boolean DEFAULT false NOT NULL,
	"comparable" boolean DEFAULT false NOT NULL,
	"min" numeric(12, 2),
	"max" numeric(12, 2),
	"precision" numeric(8, 4),
	"liste" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unite_id" uuid,
	"aide" text,
	"modele_valeur" jsonb,
	"explication" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attribut_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"libelle" varchar(120) NOT NULL,
	"defs" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "attribut_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" integer,
	"details" text,
	"ip_address" varchar(50),
	"user_agent" varchar(500),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "avoirs" (
	"id" serial PRIMARY KEY NOT NULL,
	"retour_id" integer,
	"vente_id" integer NOT NULL,
	"client_id" integer,
	"montant_initial" numeric(12, 2) NOT NULL,
	"montant_restant" numeric(12, 2) NOT NULL,
	"statut" varchar(50) DEFAULT 'actif',
	"expire_le" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "boite_envoi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_evenement" varchar(100) NOT NULL,
	"corps_json" jsonb NOT NULL,
	"statut" varchar(50) DEFAULT 'en_attente',
	"created_at" timestamp DEFAULT now(),
	"traite_le" timestamp
);
--> statement-breakpoint
CREATE TABLE "bons_reception" (
	"id" serial PRIMARY KEY NOT NULL,
	"achat_id" integer,
	"fournisseur_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"reference" varchar(100) NOT NULL,
	"statut" varchar(50) DEFAULT 'brouillon',
	"notes" text,
	"receptionne_par" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bons_reception_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "caisse_operateurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"peut_ouvrir" boolean DEFAULT false,
	"peut_fermer" boolean DEFAULT false,
	"peut_depenser" boolean DEFAULT false,
	"peut_voir_mouvements" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "caisse_operateurs_caisse_id_user_id_unique" UNIQUE("caisse_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "caisses" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"libelle" varchar(255) NOT NULL,
	"notes" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "catalogue_qualite" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer,
	"total_articles" integer DEFAULT 0 NOT NULL,
	"total_variantes" integer DEFAULT 0 NOT NULL,
	"total_modeles" integer DEFAULT 0 NOT NULL,
	"problemes" jsonb DEFAULT '[]'::jsonb,
	"score" integer DEFAULT 100 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generation_duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" varchar(500),
	"parent_id" integer,
	"type_branche" varchar(20),
	"domaine" varchar(50),
	"niveau_ontologie" varchar(20) DEFAULT 'CATEGORIE',
	"renderer_hint" varchar(40),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cles_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"clef" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"est_actif" boolean DEFAULT true,
	"expire_le" timestamp,
	"created_at" timestamp DEFAULT now(),
	"derniere_utilisation_le" timestamp,
	CONSTRAINT "cles_api_clef_unique" UNIQUE("clef")
);
--> statement-breakpoint
CREATE TABLE "client_adresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'AUTRE',
	"ligne1" varchar(255),
	"ligne2" varchar(255),
	"quartier" varchar(120),
	"ville" varchar(100),
	"pays" varchar(100) DEFAULT 'Cameroun',
	"est_principale" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"fonction" varchar(120),
	"email" varchar(255),
	"telephone" varchar(50),
	"est_contact_principal" boolean DEFAULT false,
	"est_contact_facturation" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" varchar(30) DEFAULT 'AUTRE',
	"date_heure" timestamp DEFAULT now(),
	"sujet" varchar(255),
	"contenu" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_statut_historique" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"ancien_statut" varchar(30),
	"nouveau_statut" varchar(30) NOT NULL,
	"motif" text,
	"change_par" integer,
	"change_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"type_client" varchar(30) DEFAULT 'PART',
	"statut" varchar(30) DEFAULT 'ACTIF',
	"civilite" varchar(10),
	"raison_sociale" varchar(255),
	"sigle" varchar(50),
	"niu_nif" varchar(50),
	"rccm" varchar(50),
	"numero_contribuable" varchar(50),
	"compagnie_assurance" varchar(255),
	"numero_police" varchar(100),
	"numero_sinistre" varchar(100),
	"expert_assurance" varchar(255),
	"montant_pris_en_charge" numeric(12, 2),
	"franchise_client" numeric(12, 2),
	"telephone" varchar(50),
	"telephone_secondaire" varchar(50),
	"whatsapp" varchar(50),
	"email" varchar(255),
	"adresse" text,
	"ville" varchar(100),
	"mode_paiement_prefere" varchar(30) DEFAULT 'especes',
	"delai_paiement_jours" integer DEFAULT 0,
	"plafond_credit" numeric(12, 2) DEFAULT '0',
	"remise_defaut_pct" numeric(5, 2) DEFAULT '0',
	"exige_bon_de_commande" boolean DEFAULT false,
	"code_client" varchar(50),
	"categorie_prix" varchar(50) DEFAULT 'public',
	"notes" text,
	"notes_internes" text,
	"is_active" boolean DEFAULT true,
	"deleted_at" timestamp,
	"created_by" integer,
	"agence_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "clients_code_client_unique" UNIQUE("code_client")
);
--> statement-breakpoint
CREATE TABLE "codes_barres" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"valeur" varchar(100) NOT NULL,
	"est_defaut" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "codes_barres_valeur_unique" UNIQUE("valeur"),
	CONSTRAINT "codes_barres_produit_id_type_unique" UNIQUE("produit_id","type")
);
--> statement-breakpoint
CREATE TABLE "compatibilites_produits" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer,
	"produit_id" integer,
	"type_compat" varchar(10) DEFAULT 'POSITIVE',
	"marque" varchar(80) NOT NULL,
	"modele" varchar(120) NOT NULL,
	"annee_de" integer,
	"annee_a" integer,
	"date_production_debut" date,
	"date_production_fin" date,
	"motorisation" varchar(80),
	"version" varchar(120),
	"generation" varchar(120),
	"carburant" varchar(30),
	"cylindree" varchar(30),
	"puissance_kw" varchar(30),
	"code_moteur" varchar(60),
	"boite" varchar(40),
	"code_boite" varchar(60),
	"transmission" varchar(40),
	"carrosserie" varchar(40),
	"nb_portes" integer,
	"norme_euro" varchar(20),
	"code_chassis" varchar(60),
	"type_freinage" varchar(40),
	"diametre_frein" varchar(30),
	"codes_pr" text,
	"marche" varchar(40),
	"position" varchar(40),
	"ref_oem" varchar(160),
	"ref_equivalente" varchar(160),
	"restrictions" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "comptes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"type_compte" varchar(50) NOT NULL,
	"is_active" varchar(20) DEFAULT 'actif',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rh_contract_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"employe_id" integer NOT NULL,
	"version" integer NOT NULL,
	"type_contrat" varchar(30),
	"poste" varchar(100),
	"date_debut" date,
	"date_fin" date,
	"duree_mois" integer,
	"salaire_base" text,
	"statut" varchar(30),
	"fichier_url" text,
	"notes" text,
	"fin_periode_essai" date,
	"avantages" text,
	"renouvellement" text,
	"reason" text NOT NULL,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contrats" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" integer NOT NULL,
	"type_contrat" varchar(50) NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"duree_mois" integer,
	"fin_periode_essai" date,
	"avantages" text,
	"renouvellement" boolean DEFAULT false,
	"salaire_base" numeric(12, 2),
	"poste" varchar(255),
	"statut" varchar(50) DEFAULT 'actif',
	"fichier_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contrats_flotte_vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrat_id" integer NOT NULL,
	"vehicule_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contrats_flottes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"numero" varchar(50) NOT NULL,
	"libelle" varchar(255) NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"type_maintenance" varchar(50) DEFAULT 'PREVENTIVE',
	"frequence_controle" varchar(50),
	"conditions_paiement" varchar(50),
	"remise_pourcent" numeric(5, 2) DEFAULT '0',
	"statut" varchar(30) DEFAULT 'actif',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "contrats_flottes_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "contrats_maintenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"numero_contrat" varchar(50) NOT NULL,
	"libelle" varchar(255) NOT NULL,
	"type_contrat" varchar(40) DEFAULT 'A_LA_DEMANDE',
	"date_signature" date,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"statut" varchar(30) DEFAULT 'BROUILLON',
	"montant_forfait" numeric(12, 2),
	"frequence_facturation" varchar(30) DEFAULT 'A_LA_DEMANDE',
	"delai_paiement_jours" integer DEFAULT 0,
	"delai_intervention_heures" integer,
	"couverture" varchar(120) DEFAULT 'PIECES_ET_MO',
	"remise_pourcent" numeric(5, 2) DEFAULT '0',
	"conditions_particulieres" text,
	"date_resiliation" date,
	"motif_resiliation" text,
	"responsable_interne" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "contrats_maintenance_numero_contrat_unique" UNIQUE("numero_contrat")
);
--> statement-breakpoint
CREATE TABLE "contrats_maintenance_vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrat_id" integer NOT NULL,
	"vehicule_id" integer,
	"immatriculation_temp" varchar(50),
	"date_ajout" date NOT NULL,
	"date_retrait" date,
	"actif" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deconditionnements" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "deconditionnements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"agence_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"unite_source_id" uuid NOT NULL,
	"quantite_source" numeric(12, 2) NOT NULL,
	"unite_cible_id" uuid NOT NULL,
	"quantite_generee" numeric(12, 2) NOT NULL,
	"effectue_par" integer NOT NULL,
	"motif" varchar(255),
	"date_deconditionnement" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "demandes_commande" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"designation" varchar(255) NOT NULL,
	"reference" varchar(100),
	"quantite" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unite" varchar(40) DEFAULT 'pièce',
	"statut" varchar(20) DEFAULT 'EN_ATTENTE' NOT NULL,
	"notes" text,
	"cree_par" integer,
	"cree_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(30) NOT NULL,
	"parent_id" integer,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "depenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"categorie" varchar(100) NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"description" text,
	"fournisseur_id" integer,
	"mode_paiement" varchar(50) DEFAULT 'especes',
	"caisse_id" integer,
	"session_caisse_id" integer,
	"date_depense" timestamp DEFAULT now(),
	"enregistre_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dettes_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"vente_id" integer NOT NULL,
	"client_id" integer,
	"agence_id" integer,
	"montant_total" numeric(12, 2) NOT NULL,
	"montant_paye" numeric(12, 2) DEFAULT '0',
	"montant_restant" numeric(12, 2) NOT NULL,
	"statut" varchar(50) DEFAULT 'impaye',
	"echeance_le" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dettes_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"achat_id" integer NOT NULL,
	"fournisseur_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"reference" varchar(100) NOT NULL,
	"montant_total" numeric(12, 2) NOT NULL,
	"montant_paye" numeric(12, 2) DEFAULT '0',
	"montant_restant" numeric(12, 2) NOT NULL,
	"statut" varchar(50) DEFAULT 'impaye',
	"echeance_le" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents_employes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" integer NOT NULL,
	"document_type_id" integer,
	"type_document" varchar(50) NOT NULL,
	"titre" varchar(255),
	"fichier_url" text NOT NULL,
	"date_emission" date,
	"date_expiration" date,
	"statut" varchar(50) DEFAULT 'actif',
	"uploaded_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecarts_reception" (
	"id" serial PRIMARY KEY NOT NULL,
	"bon_reception_id" integer,
	"achat_id" integer,
	"produit_id" integer NOT NULL,
	"type_ecart" varchar(20) NOT NULL,
	"quantite_commandee" integer DEFAULT 0,
	"quantite_recue" integer DEFAULT 0,
	"prix_bc" numeric(12, 2),
	"prix_recu" numeric(12, 2),
	"motif" text,
	"cree_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "echanges_cores" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"or_id" integer,
	"quantite" numeric(12, 2) DEFAULT '1' NOT NULL,
	"valeur_core" numeric(12, 2) DEFAULT '0' NOT NULL,
	"statut" varchar(30) DEFAULT 'EN_ATTENTE',
	"date_echange" timestamp DEFAULT now(),
	"date_retour_coquille" timestamp,
	"mouvement_id" integer,
	"motif" text,
	"cree_par" integer
);
--> statement-breakpoint
CREATE TABLE "ecritures_journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"reference" varchar(100),
	"libelle" varchar(500) NOT NULL,
	"date_ecriture" timestamp DEFAULT now(),
	"document_type" varchar(50),
	"document_id" integer,
	"validee_le" timestamp,
	"validee_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emplacements" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'RAYON' NOT NULL,
	"code" varchar(50) NOT NULL,
	"libelle" varchar(255),
	"parent_id" integer,
	"profondeur" integer DEFAULT 0 NOT NULL,
	"categorie_id" integer,
	"ordre" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(30),
	"employee_id" integer NOT NULL,
	"date_demande" date,
	"date_approbation" date,
	"date_versement" date NOT NULL,
	"montant" numeric(12, 0) NOT NULL,
	"motif" text,
	"moyen_paiement" varchar(30),
	"periode_concernee_debut" date,
	"periode_concernee_fin" date,
	"periode_recuperation_debut" date,
	"periode_recuperation_fin" date,
	"montant_recupe" numeric(12, 0) DEFAULT '0',
	"solde_restant" numeric(12, 0) NOT NULL,
	"statut" varchar(30) DEFAULT 'VERSÉE' NOT NULL,
	"responsable_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"department_id" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"reason" text,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_postures" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"action" varchar(30) NOT NULL,
	"posture" varchar(30) NOT NULL,
	"motif_mission" varchar(40),
	"reference" varchar(120),
	"notes" text,
	"horodatage" timestamp DEFAULT now(),
	"heure_evenement" time,
	"pointe_par" integer,
	"actif" boolean DEFAULT true,
	"annule" boolean DEFAULT false,
	"annule_par" integer,
	"motif_annulation" text,
	"annule_a" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_salary_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"base_salary" numeric(12, 2),
	"start_date" date NOT NULL,
	"end_date" date,
	"mode_paie" varchar(30),
	"forfait_hebdomadaire" numeric(12, 2),
	"reason" text,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_situation_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"situation_id" integer NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"acteur_id" integer,
	"justification" text,
	"document_url" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_situations" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"situation_type_id" integer,
	"category" varchar(30) NOT NULL,
	"type" varchar(60) NOT NULL,
	"sub_type" varchar(60),
	"name" varchar(120),
	"date_debut" date NOT NULL,
	"date_fin" date,
	"date_effet" date,
	"duree_jours" integer,
	"motif" text,
	"fait_reproche" text,
	"commentaire" text,
	"justificatif_url" varchar(500),
	"notification_ecrite" boolean DEFAULT false NOT NULL,
	"notification_at" timestamp,
	"communication_inspection" boolean DEFAULT false NOT NULL,
	"communication_inspection_at" timestamp,
	"details_financiers" text,
	"montant_retenue" numeric(12, 0),
	"impact_contrat" varchar(20) NOT NULL,
	"impact_presence" varchar(30) NOT NULL,
	"impact_planning" varchar(30) NOT NULL,
	"impact_paie" varchar(30) NOT NULL,
	"mode_calcul_paie" varchar(30) DEFAULT 'PRORATA_JOURS' NOT NULL,
	"base_calcul_paie" varchar(30),
	"validation_requise" boolean DEFAULT true NOT NULL,
	"anomalie" varchar(40),
	"statut_workflow" varchar(20) DEFAULT 'BROUILLON' NOT NULL,
	"approbation_requise" boolean DEFAULT true NOT NULL,
	"approbateur_id" integer,
	"approuve_at" timestamp,
	"provenance_table" varchar(40),
	"provenance_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"current_level" integer NOT NULL,
	"assessed_at" timestamp DEFAULT now(),
	"assessed_by" integer
);
--> statement-breakpoint
CREATE TABLE "employee_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"statut" varchar(30) NOT NULL,
	"reembauchable" boolean,
	"start_date" date NOT NULL,
	"end_date" date,
	"reason" text,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employes" (
	"id" serial PRIMARY KEY NOT NULL,
	"matricule" varchar(30) NOT NULL,
	"civilite" varchar(10),
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255) NOT NULL,
	"date_naissance" date,
	"lieu_naissance" varchar(120),
	"sexe" varchar(1),
	"email_personnel" varchar(255),
	"telephone" varchar(50),
	"telephone_secondaire" varchar(50),
	"adresse" text,
	"ville" varchar(100),
	"contact_urgence_nom" varchar(255),
	"contact_urgence_telephone" varchar(50),
	"type_employe" varchar(30) DEFAULT 'permanent' NOT NULL,
	"fonction" varchar(100) NOT NULL,
	"department_id" integer,
	"position_id" integer,
	"work_cycle_id" integer,
	"manager_id" integer,
	"date_embauche" date,
	"date_fin_contrat" date,
	"periode_essai_fin" date,
	"salaire_base" numeric(12, 0),
	"devise" varchar(3) DEFAULT 'XOF',
	"mode_paie" varchar(30) DEFAULT 'SALAIRE_MENSUEL',
	"forfait_hebdomadaire" numeric(12, 0),
	"num_cnss" varchar(30),
	"niu" varchar(30),
	"num_compte_bancaire" varchar(50),
	"banque" varchar(100),
	"type_piece_identite" varchar(30),
	"num_piece_identite" varchar(50),
	"piece_expire_le" date,
	"diplome" varchar(255),
	"langues" varchar(255),
	"logiciels" varchar(255),
	"points_fort" text,
	"axes_amelioration" text,
	"notes" text,
	"statut" varchar(20) DEFAULT 'actif',
	"photo_url" text,
	"date_sortie" date,
	"motif_sortie" varchar(40),
	"detail_motif_sortie" text,
	"reembauchable" boolean DEFAULT true,
	"sortie_changed_by" integer,
	"sortie_changed_at" timestamp,
	"user_id" integer,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employes_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "evaluation_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"period_start" varchar(10) NOT NULL,
	"period_end" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'ouverte',
	"created_by" integer,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"grid_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"weight" numeric(5, 1) NOT NULL,
	"max_score" numeric(4, 1) DEFAULT '5',
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "evaluation_grids" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"position_id" integer,
	"scale" varchar(20) DEFAULT '1-5',
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluation_id" integer NOT NULL,
	"criterion_id" integer NOT NULL,
	"score" numeric(4, 1) NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "evaluation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"evaluation_id" integer NOT NULL,
	"version" integer NOT NULL,
	"entity_json" jsonb NOT NULL,
	"scores_json" jsonb NOT NULL,
	"raison" varchar(30) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_evaluation_snapshots" UNIQUE("evaluation_id","version")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"evaluator_id" integer,
	"grid_id" integer,
	"global_score" numeric(4, 2),
	"appreciation" text,
	"objectives" text,
	"status" varchar(20) DEFAULT 'finalisee',
	"evaluated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "factures_fournisseur" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"fournisseur_id" integer NOT NULL,
	"achat_id" integer,
	"agence_id" integer NOT NULL,
	"libelle" varchar(255),
	"categorie_depense" varchar(60),
	"circuit" varchar(20) DEFAULT 'PIECES',
	"mode_paiement" varchar(50) DEFAULT 'especes',
	"montant_ht" numeric(12, 2) DEFAULT '0',
	"montant_tva" numeric(12, 2) DEFAULT '0',
	"montant_ttc" numeric(12, 2) DEFAULT '0',
	"montant_paye" numeric(12, 2) DEFAULT '0',
	"montant_restant" numeric(12, 2) DEFAULT '0',
	"statut" varchar(50) DEFAULT 'impayee',
	"date_facture" date,
	"date_echeance" date,
	"numero_facture_fournisseur" varchar(100),
	"fichier_url" text,
	"notes" text,
	"cree_par" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "factures_partenaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"partenaire_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"quantite" integer NOT NULL,
	"prix_catalogue" numeric(12, 2) NOT NULL,
	"prix_facture" numeric(12, 2) NOT NULL,
	"ecart" numeric(12, 2) NOT NULL,
	"vente_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"statut" varchar(50) DEFAULT 'emise',
	"ecart_comptable" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "factures_partenaires_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "faits_caisse_quotidiens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" integer NOT NULL,
	"caisse_id" integer,
	"date" timestamp NOT NULL,
	"total_entrees" numeric(12, 2) DEFAULT '0',
	"total_sorties" numeric(12, 2) DEFAULT '0',
	"operations_count" integer DEFAULT 0,
	"calcule_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faits_stock_quotidiens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"total_produits" integer DEFAULT 0,
	"valeur_stock" numeric(12, 2) DEFAULT '0',
	"produits_rupture" integer DEFAULT 0,
	"alerte_stock" integer DEFAULT 0,
	"calcule_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faits_ventes_quotidiens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"total_ventes" integer DEFAULT 0,
	"montant_total" numeric(12, 2) DEFAULT '0',
	"montant_paye" numeric(12, 2) DEFAULT '0',
	"remise_total" numeric(12, 2) DEFAULT '0',
	"nombre_produits" integer DEFAULT 0,
	"calcule_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"contact" varchar(255),
	"telephone" varchar(50),
	"email" varchar(255),
	"adresse" text,
	"ville" varchar(100),
	"pays" varchar(100) DEFAULT 'Bénin',
	"type_service" varchar(40),
	"circuit" varchar(20) DEFAULT 'PIECES',
	"conditions_paiement" varchar(255),
	"niu_nif" varchar(50),
	"rccm" varchar(50),
	"notes" text,
	"agence_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "fournisseurs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "guide_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer,
	"type_produit" varchar(30),
	"titre" varchar(160) NOT NULL,
	"contexte" text,
	"ordre" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guide_common_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"code" varchar(80) NOT NULL,
	"message" varchar(255) NOT NULL,
	"actions" text NOT NULL,
	"severity" varchar(10) DEFAULT 'warning'
);
--> statement-breakpoint
CREATE TABLE "guide_examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"produit_id" integer,
	"article_id" integer,
	"libelle" varchar(160) NOT NULL,
	"motif" varchar(255),
	"est_reference" boolean DEFAULT false,
	"ordre" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guide_field_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"variant_type_id" integer,
	"information_metier" varchar(200) NOT NULL,
	"portee" varchar(20) DEFAULT 'VARIANTE',
	"champ_atelier_one" varchar(160),
	"ecran" varchar(160),
	"etape" varchar(160),
	"statut" varchar(20) DEFAULT 'OPTIONNEL',
	"unite_exemple" varchar(80),
	"ordre" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guide_modeling_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"titre" varchar(200) NOT NULL,
	"enonce" text NOT NULL,
	"cas_exemple" varchar(255),
	"ordre" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guide_procedure_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"procedure_id" integer NOT NULL,
	"ordre" integer NOT NULL,
	"titre" varchar(160) NOT NULL,
	"ecran" varchar(160),
	"action" text NOT NULL,
	"champs" text,
	"verification" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "guide_procedures" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"scenario" varchar(20) DEFAULT 'NOM_SEUL',
	"titre" varchar(200) NOT NULL,
	"contexte" text,
	"ordre" integer DEFAULT 0,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "guide_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"type_relation" varchar(20) NOT NULL,
	"definition" text NOT NULL,
	"exemple" varchar(255),
	"ordre" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guide_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"condition" text,
	"conseil" text NOT NULL,
	"preuve" text,
	"exemple_id" integer
);
--> statement-breakpoint
CREATE TABLE "guide_search_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"alias" varchar(160) NOT NULL,
	"categorie_id" integer,
	"definition_id" integer,
	"type" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"ordre" integer NOT NULL,
	"titre" varchar(160) NOT NULL,
	"texte" text NOT NULL,
	"portee" varchar(20),
	"champ_cle" varchar(100),
	"recommandation" text
);
--> statement-breakpoint
CREATE TABLE "guide_variant_differentiators" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_type_id" integer NOT NULL,
	"cle" varchar(100) NOT NULL,
	"libelle" varchar(160) NOT NULL,
	"portee" varchar(20) DEFAULT 'VARIANTE',
	"unite_exemple" varchar(80),
	"statut" varchar(20) DEFAULT 'OPTIONNEL',
	"exemple" varchar(160),
	"ordre" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guide_variant_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"categorie_id" integer NOT NULL,
	"nom" varchar(160) NOT NULL,
	"description" text,
	"diff_principale" varchar(255),
	"est_reference" boolean DEFAULT false,
	"ordre" integer DEFAULT 0,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "hr_attendance_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"late_tolerance_minutes" integer DEFAULT 0,
	"round_to_minutes" integer DEFAULT 0,
	"auto_deduct_break" boolean DEFAULT true,
	"count_early_arrival" boolean DEFAULT false,
	"count_late_departure" boolean DEFAULT false,
	"auto_deduct_late" boolean DEFAULT true,
	"auto_deduct_early_departure" boolean DEFAULT true,
	"max_normal_hours_per_day" numeric(4, 2) DEFAULT '8',
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer,
	CONSTRAINT "hr_attendance_settings_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "hr_document_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"has_expiration" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_general_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"employee_code_prefix" varchar(10) DEFAULT 'GPJ',
	"employee_code_sequence" integer DEFAULT 0,
	"timezone" varchar(60) DEFAULT 'Africa/Douala',
	"currency" varchar(3) DEFAULT 'XAF',
	"evaluation_enabled" boolean DEFAULT true,
	"evaluation_frequency" varchar(20) DEFAULT 'trimestrielle',
	"annual_leave_days" numeric(5, 1) DEFAULT '30',
	"disciplinary_window_months" integer DEFAULT 12,
	"standard_monthly_hours" numeric(6, 2) DEFAULT '225.3',
	"overtime_multiplier" numeric(4, 2) DEFAULT '1.5',
	"default_overtime_threshold" numeric(4, 2) DEFAULT '9.5',
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer,
	CONSTRAINT "hr_general_settings_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "hr_leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_paid" boolean DEFAULT true,
	"deduct_balance" boolean DEFAULT true,
	"requires_document" boolean DEFAULT false,
	"color" varchar(20) DEFAULT '#6366f1',
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_public_holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_recurring_yearly" boolean DEFAULT false,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_sanction_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"severity_level" integer DEFAULT 1,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_sensibilisation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" varchar(160) NOT NULL,
	"niveau" varchar(10) NOT NULL,
	"priorite" integer DEFAULT 100 NOT NULL,
	"condition" varchar(4) NOT NULL,
	"metrique" varchar(40) NOT NULL,
	"seuil" numeric(12, 2) NOT NULL,
	"message" text NOT NULL,
	"action_recommandee" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_situation_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"category" varchar(30) NOT NULL,
	"type" varchar(60) NOT NULL,
	"sub_type" varchar(60),
	"name" varchar(120) NOT NULL,
	"impact_contrat" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"impact_presence" varchar(30) NOT NULL,
	"impact_planning" varchar(30) DEFAULT 'PLANIFIE' NOT NULL,
	"impact_paie" varchar(30) NOT NULL,
	"mode_calcul_paie" varchar(30) DEFAULT 'PRORATA_JOURS' NOT NULL,
	"base_calcul_paie" varchar(30),
	"validation_requise" boolean DEFAULT true NOT NULL,
	"approbation_requise" boolean DEFAULT true NOT NULL,
	"requires_document" boolean DEFAULT false NOT NULL,
	"source" varchar(10) DEFAULT 'POL' NOT NULL,
	"base_juridique" varchar(60),
	"duree_max_jours" integer,
	"notification_ecrite_requise" boolean DEFAULT false NOT NULL,
	"communication_inspection_requise" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_work_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_work_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_start" time,
	"break_end" time,
	"expected_hours" numeric(4, 2),
	"overtime_threshold" numeric(4, 2),
	"is_working_day" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "interventions_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"ordre_id" integer NOT NULL,
	"ligne_id" integer,
	"technicien_id" integer NOT NULL,
	"date_intervention" date NOT NULL,
	"heure_debut" timestamp,
	"heure_fin" timestamp,
	"duree_heures" numeric(6, 2),
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"produit_id" integer,
	"agence_id" integer NOT NULL,
	"unite_id" uuid,
	"quantite_theorique" numeric(12, 2) NOT NULL,
	"quantite_reelle" numeric(12, 2) NOT NULL,
	"ecart" numeric(12, 2) NOT NULL,
	"commentaire" text,
	"effectue_par" integer,
	"date_inventaire" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventaires_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "inventaires_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"agence_id" integer NOT NULL,
	"libelle" varchar(255),
	"statut" varchar(20) DEFAULT 'brouillon' NOT NULL,
	"effectue_par" integer NOT NULL,
	"valide_par" integer,
	"date_debut" timestamp DEFAULT now(),
	"date_fin" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "kits_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"kit_id" integer NOT NULL,
	"composant_id" integer NOT NULL,
	"quantite" numeric(12, 2) DEFAULT '1' NOT NULL,
	CONSTRAINT "unq_kits_lignes_kit_composant" UNIQUE("kit_id","composant_id")
);
--> statement-breakpoint
CREATE TABLE "kpi_cibles" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"cible" numeric(10, 2) NOT NULL,
	"seuil_orange" numeric(10, 2),
	"seuil_rouge" numeric(10, 2),
	"unite" varchar(12) DEFAULT '%',
	"sens" varchar(8) DEFAULT 'HAUT',
	"fenetre_jours" integer DEFAULT 30,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "late_deduction_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"method" varchar(30) NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_balance_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_balance_id" integer NOT NULL,
	"amount" numeric(5, 1) NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_balance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"leave_balance_id" integer NOT NULL,
	"version" integer NOT NULL,
	"entity_json" jsonb NOT NULL,
	"raison" varchar(30) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_leave_balance_snapshots" UNIQUE("leave_balance_id","version")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"acquired_days" numeric(5, 1) DEFAULT '0',
	"taken_days" numeric(5, 1) DEFAULT '0',
	"adjusted_days" numeric(5, 1) DEFAULT '0',
	"balance" numeric(5, 1) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days_count" numeric(5, 1) NOT NULL,
	"reason" text,
	"document_url" text,
	"status" varchar(20) DEFAULT 'en_attente',
	"requested_by" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "licence_locale" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" varchar(50) NOT NULL,
	"cle_api" varchar(100),
	"jeton" text NOT NULL,
	"date_fin" timestamp NOT NULL,
	"grace_jours" integer DEFAULT 7,
	"mode" varchar(20) DEFAULT 'ESSAI',
	"dernier_heartbeat" timestamp,
	"derniere_verification" timestamp DEFAULT now(),
	"mise_a_jour_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lignes_bon_reception" (
	"id" serial PRIMARY KEY NOT NULL,
	"bon_reception_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"quantite_commandee" integer NOT NULL,
	"quantite_recue" integer NOT NULL,
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"prix_unitaire_bc" numeric(12, 2),
	"motif_ecart" text
);
--> statement-breakpoint
CREATE TABLE "lignes_ecriture_journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"ecriture_id" integer NOT NULL,
	"compte_id" integer NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"sens" varchar(10) NOT NULL,
	"libelle" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "lignes_ordre_reparation" (
	"id" serial PRIMARY KEY NOT NULL,
	"ordre_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'PIECE' NOT NULL,
	"produit_id" integer,
	"libelle" varchar(255) NOT NULL,
	"quantite" numeric(12, 2) DEFAULT '1' NOT NULL,
	"prix_unitaire" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tva" numeric(5, 2) DEFAULT '0',
	"total_ligne" numeric(12, 2) DEFAULT '0',
	"technicien_id" integer,
	"duree_heures" numeric(6, 2),
	"statut" varchar(30) DEFAULT 'a_faire',
	"rapport_id" integer,
	"statut_autorisation" varchar(20) DEFAULT 'PROPOSE',
	"origine" varchar(30) DEFAULT 'CLIENT',
	"bloque" boolean DEFAULT false,
	"raison_blocage_ligne" text,
	"fournie_par_client" boolean DEFAULT false,
	"remise_au_client" boolean DEFAULT false,
	"motif_client" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lignes_retour" (
	"id" serial PRIMARY KEY NOT NULL,
	"retour_id" integer NOT NULL,
	"vente_ligne_id" integer,
	"produit_id" integer NOT NULL,
	"quantite" integer NOT NULL,
	"unite_id" uuid,
	"facteur_conversion" integer DEFAULT 1 NOT NULL,
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"total_ligne" numeric(12, 2),
	"cout_unitaire" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"numero_lot" varchar(100) NOT NULL,
	"fournisseur_id" integer,
	"statut" varchar(50) DEFAULT 'disponible',
	"date_reception" timestamp,
	"quantite_initiale" integer,
	"cout_unitaire" numeric(12, 2),
	"date_fabrication" date,
	"date_peremption" date,
	"date_entree" timestamp DEFAULT now(),
	"provenance" varchar(200),
	"qualite" varchar(80),
	"fabricant" varchar(120),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "modele_emballage_niveaux" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modele_id" uuid NOT NULL,
	"unite_id" uuid NOT NULL,
	"parent_niveau_id" uuid,
	"quantite_dans_parent" numeric(14, 4),
	"est_unite_base" boolean DEFAULT false,
	"ordre_affichage" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "modeles_emballage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mouvements_caisse" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"motif" varchar(500),
	"reference" varchar(100),
	"entite_type" varchar(50),
	"entite_id" integer,
	"categorie_depense" varchar(100),
	"effectue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mouvements_stock" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "mouvements_stock_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"produit_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"sens" varchar(1) NOT NULL,
	"quantite" numeric(12, 2) NOT NULL,
	"unite_id" uuid,
	"emplacement_id" integer,
	"lot_id" integer,
	"or_id" integer,
	"vehicule_id" integer,
	"cout_unitaire_base" numeric(12, 2),
	"stock_avant" numeric(12, 2) NOT NULL,
	"stock_apres" numeric(12, 2) NOT NULL,
	"groupe_operation_id" uuid,
	"reference" varchar(255),
	"reference_type" varchar(50),
	"document_lie" varchar(100),
	"motif" varchar(255),
	"commentaire" text,
	"effectue_par" integer,
	"valide_par" integer,
	"date_mouvement" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alerte_id" uuid,
	"organisation_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"destinataire" varchar(255) NOT NULL,
	"sujet" varchar(255),
	"message" text NOT NULL,
	"statut" varchar(50) DEFAULT 'EN_ATTENTE',
	"envoyee_le" timestamp,
	"erreur_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_autorisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"devis_version_id" integer,
	"ligne_id" integer NOT NULL,
	"statut" varchar(20) NOT NULL,
	"methode" varchar(30) DEFAULT 'ORAL',
	"qui" varchar(160),
	"commentaire" text,
	"date_autorisation" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_controles_qualite" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"checklist" jsonb,
	"essai_routier" boolean DEFAULT false,
	"distance_essai" varchar(40),
	"observations" text,
	"resultat" varchar(20) NOT NULL,
	"controle_par" integer,
	"date_controle" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_demandes_pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"vehicule_id" integer,
	"demandeur_id" integer,
	"statut" varchar(20) DEFAULT 'EN_ATTENTE',
	"traite_par" integer,
	"traite_le" timestamp,
	"motif" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_demandes_pieces_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"demande_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"quantite" numeric(12, 2) NOT NULL,
	"quantite_servie" numeric(12, 2) DEFAULT '0',
	"prix_estime" numeric(12, 2),
	"note" text,
	"manquant" boolean DEFAULT false,
	"motif_manquant" text
);
--> statement-breakpoint
CREATE TABLE "or_devis_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"version" integer NOT NULL,
	"montant_ht" numeric(12, 2) DEFAULT '0',
	"montant_ttc" numeric(12, 2) DEFAULT '0',
	"lignes_snapshot" jsonb,
	"statut" varchar(25) DEFAULT 'BROUILLON',
	"validite_jours" integer DEFAULT 15,
	"envoye_le" timestamp,
	"envoye_par" integer,
	"date_autorisation" timestamp,
	"methode_autorisation" varchar(30),
	"cree_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_historique" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"type" varchar(40) NOT NULL,
	"ancienne_valeur" varchar(255),
	"nouvelle_valeur" varchar(255),
	"commentaire" text,
	"change_par" integer,
	"change_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_inspection_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"groupe" varchar(80) NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"statut" varchar(20) DEFAULT 'NON_INSPECTE',
	"mesure" varchar(40),
	"notes" text,
	"photo" text,
	"annotation" text,
	"recommandation" text,
	"priorite" varchar(30) DEFAULT 'CONSEIL',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"template" varchar(60) DEFAULT 'MULTI_POINTS',
	"titre" varchar(160) DEFAULT 'Inspection multi-points' NOT NULL,
	"statut" varchar(20) DEFAULT 'BROUILLON',
	"technicien_id" integer,
	"envoyee_le" timestamp,
	"envoyee_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"url" text NOT NULL,
	"type" varchar(10) DEFAULT 'PHOTO',
	"cree_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_rapports_diagnostic" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"technicien_id" integer,
	"constat" text NOT NULL,
	"cause" text,
	"codes_dtc" text,
	"tests" text,
	"inspection_id" integer,
	"statut" varchar(20) DEFAULT 'BROUILLON',
	"date_soumission" timestamp,
	"valide_par" integer,
	"valide_le" timestamp,
	"commentaire_validateur" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "or_restitutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"or_id" integer NOT NULL,
	"kilometrage_sortie" integer,
	"niveau_carburant_sortie" varchar(20),
	"checklist" jsonb,
	"recuperateur_nom" varchar(255),
	"signature_client" varchar(255),
	"observations" text,
	"motif_non_repare" varchar(200),
	"travaux_non_realises" text,
	"restitue_par" integer,
	"date_restitution" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ordres_reparation" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"numero" varchar(50) NOT NULL,
	"vehicule_id" integer NOT NULL,
	"client_id" integer,
	"statut" varchar(40) DEFAULT 'EN_ATTENTE_DIAGNOSTIC',
	"priorite" varchar(2) DEFAULT 'P3',
	"plainte" text,
	"mot_entree" varchar(40) DEFAULT 'AUTRE',
	"diagnostic" text,
	"devis_accepte" boolean DEFAULT false,
	"date_ouverture" timestamp DEFAULT now(),
	"date_promesse" date,
	"date_fin_prevue" date,
	"date_cloture" timestamp,
	"emplacement" varchar(100) DEFAULT 'Réception',
	"responsable_technicien_id" integer,
	"raison_blocage" text,
	"bloque_par" varchar(120),
	"client_attend_sur_place" boolean DEFAULT false,
	"courtoisie_demandee" boolean DEFAULT false,
	"total_pieces" numeric(12, 2) DEFAULT '0',
	"total_main_oeuvre" numeric(12, 2) DEFAULT '0',
	"total_ttc" numeric(12, 2) DEFAULT '0',
	"vente_id" integer,
	"total_facture" numeric(12, 2) DEFAULT '0',
	"facture_transmise_le" timestamp,
	"attente_bon_commande" boolean DEFAULT false,
	"contrat_id" integer,
	"sav_origine_or_id" integer,
	"motif_retour_sav" varchar(40),
	"famille_service" varchar(40),
	"satisfaction_note" integer,
	"satisfaction_commentaire" text,
	"cree_par" integer,
	"notes" text,
	"type_intervention" varchar(30) DEFAULT 'ATELIER',
	"lieu_depannage" varchar(255),
	"date_reception" timestamp,
	"kilometrage_entree" integer,
	"kilometrage_sortie" integer,
	"niveau_carburant_entree" varchar(20),
	"pannes_declarees" text,
	"observations_reception" text,
	"receptionniste_id" integer,
	"outillage" jsonb,
	"signature_deposant" varchar(255),
	"validation_verbale" boolean DEFAULT false,
	"date_fermeture" timestamp,
	"ferme_definitivement_par" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ordres_reparation_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"logo_url" text,
	"telephone" varchar(50),
	"adresse" text,
	"devise" varchar(10) DEFAULT 'XAF',
	"fuseau_horaire" varchar(50) DEFAULT 'Africa/Douala',
	"statut" varchar(50) DEFAULT 'actif',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "outillage_calibration" (
	"id" serial PRIMARY KEY NOT NULL,
	"outil_id" integer NOT NULL,
	"date_calibration" timestamp DEFAULT now() NOT NULL,
	"organisme" varchar(200),
	"certificat" varchar(100),
	"resultat" varchar(30),
	"tolerance" varchar(60),
	"prochaine_calibration" timestamp,
	"effectue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outillage_maintenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"outil_id" integer NOT NULL,
	"type" varchar(40),
	"date_maintenance" timestamp DEFAULT now() NOT NULL,
	"prestataire" varchar(200),
	"cout" numeric(12, 2),
	"rapport_url" text,
	"observations" text,
	"prochaine_maintenance" timestamp,
	"effectue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "overtime_authorizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"max_hours" numeric(4, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'en_attente',
	"authorized_by" integer,
	"authorized_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paiements" (
	"id" serial PRIMARY KEY NOT NULL,
	"vente_id" integer NOT NULL,
	"retour_id" integer,
	"montant" numeric(12, 2) NOT NULL,
	"mode_paiement" varchar(50) NOT NULL,
	"reference" varchar(255),
	"statut" varchar(50) DEFAULT 'initie',
	"fournisseur_paiement" varchar(100),
	"id_reference_fournisseur" varchar(255),
	"est_idempotent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"niveau" varchar(20) DEFAULT 'INFO',
	"message" text NOT NULL,
	"criteres" jsonb DEFAULT '{}'::jsonb,
	"statut" varchar(20) DEFAULT 'OUVERTE',
	"declenchee_le" timestamp DEFAULT now(),
	"cloturee_le" timestamp,
	"cloturee_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"seuil_sans_evolution_jours" integer DEFAULT 15,
	"seuil_immobilisation_longue_jours" integer DEFAULT 90,
	"seuil_attente_client_jours" integer DEFAULT 15,
	"seuil_attente_piece_jours" integer DEFAULT 15,
	"seuil_pret_sortie_jour" integer DEFAULT 3,
	"seuil_transfert_jours" integer DEFAULT 60,
	"marge_securite_defaut" double precision DEFAULT 0.3,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "parking_configs_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "parking_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"horodatage" timestamp DEFAULT now() NOT NULL,
	"user_id" integer,
	"type" varchar(30) NOT NULL,
	"site_origine_id" integer,
	"zone_origine_id" integer,
	"position_origine_x" double precision,
	"position_origine_y" double precision,
	"site_destination_id" integer,
	"zone_destination_id" integer,
	"position_destination_x" double precision,
	"position_destination_y" double precision,
	"rotation" double precision,
	"motif" text,
	"commentaire" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"plan_largeur" double precision DEFAULT 100,
	"plan_hauteur" double precision DEFAULT 75,
	"is_primary" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"geometrie" jsonb NOT NULL,
	"statut" varchar(20) DEFAULT 'LIBRE' NOT NULL,
	"bloque" boolean DEFAULT false NOT NULL,
	"reserve_pour" integer,
	"longueur" double precision,
	"largeur" double precision,
	"rotation" double precision DEFAULT 0,
	"ordre" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"vehicle_id" integer,
	"type" varchar(30) DEFAULT 'ACTIONS',
	"titre" varchar(255) NOT NULL,
	"description" text,
	"responsable" varchar(255),
	"echeance" timestamp,
	"statut" varchar(20) DEFAULT 'A_FAIRE',
	"cree_par" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_vehicle_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"storage_key" text NOT NULL,
	"categorie" varchar(50) NOT NULL,
	"prise_le" timestamp DEFAULT now() NOT NULL,
	"auteur_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"num_registre" integer NOT NULL,
	"marque" varchar(100),
	"modele" varchar(255),
	"version" varchar(255),
	"couleur" varchar(50),
	"immatriculation" varchar(50),
	"vin" varchar(100),
	"client_nom" varchar(255),
	"client_telephone" varchar(50),
	"statut" varchar(40) DEFAULT 'EN_PARKING' NOT NULL,
	"motif" text,
	"date_entree" timestamp,
	"date_derniere_action" timestamp,
	"date_devis" timestamp,
	"date_commande" timestamp,
	"date_fin_travaux" timestamp,
	"date_derniere_relance" timestamp,
	"site_id" integer,
	"zone_id" integer,
	"spot_id" integer,
	"centre_x" double precision,
	"centre_y" double precision,
	"rotation" double precision DEFAULT 0,
	"marge_appliquee" double precision DEFAULT 0.3 NOT NULL,
	"longueur" double precision,
	"largeur" double precision,
	"hauteur" double precision,
	"poids" double precision,
	"dimensions_estimees" boolean DEFAULT false,
	"provenance" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"photo_presente" boolean DEFAULT false NOT NULL,
	"photo_categorie" varchar(50),
	"photo_date" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"type" varchar(40) DEFAULT 'AIRE_LIBRE' NOT NULL,
	"geometrie" jsonb NOT NULL,
	"capacite_theorique" integer DEFAULT 0,
	"surface_stationnable" double precision DEFAULT 0,
	"orientation_autorisee" double precision,
	"marge_securite" double precision DEFAULT 0.3,
	"stationnable" boolean DEFAULT true,
	"place_parking" boolean DEFAULT false,
	"ressource_travail" boolean DEFAULT false,
	"config" jsonb DEFAULT '{}'::jsonb,
	"ordre" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"normal_hours" numeric(6, 2) DEFAULT '0',
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"days_present" integer DEFAULT 0,
	"days_absent" integer DEFAULT 0,
	"presence_bonus" numeric(12, 2) DEFAULT '0',
	"performance_bonus" numeric(12, 2) DEFAULT '0',
	"other_earnings" numeric(12, 2) DEFAULT '0',
	"total_earnings" numeric(12, 2) DEFAULT '0',
	"deductions" numeric(12, 2) DEFAULT '0',
	"cnps_employee" numeric(12, 2) DEFAULT '0',
	"cnps_employer" numeric(12, 2) DEFAULT '0',
	"net_imposable" numeric(12, 2) DEFAULT '0',
	"irpp" numeric(12, 2) DEFAULT '0',
	"net_pay" numeric(12, 2) DEFAULT '0',
	"payment_method" varchar(30) DEFAULT 'especes',
	"status" varchar(20) DEFAULT 'prepare',
	"generated_at" timestamp DEFAULT now(),
	"paid_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_entry_id" integer NOT NULL,
	"item_code" varchar(40) NOT NULL,
	"label" varchar(120) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "payroll_entry_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"payroll_entry_id" integer NOT NULL,
	"version" integer NOT NULL,
	"period_id" integer,
	"employee_id" integer,
	"base_salary" varchar(40),
	"net_pay" varchar(40),
	"status" varchar(20),
	"entity_json" jsonb NOT NULL,
	"lines_json" jsonb NOT NULL,
	"raison" varchar(30) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_payroll_entry_snapshots" UNIQUE("payroll_entry_id","version")
);
--> statement-breakpoint
CREATE TABLE "payroll_item_config_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(20) NOT NULL,
	"method" varchar(30) NOT NULL,
	"params" jsonb,
	"is_taxable" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"agence_id" integer NOT NULL,
	"reason" text NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_items_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(20) NOT NULL,
	"method" varchar(30) NOT NULL,
	"params" jsonb,
	"is_taxable" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_date" varchar(10) NOT NULL,
	"end_date" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'open',
	"closed_at" timestamp,
	"closed_by" integer,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "performance_bonus_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"min_score" numeric(4, 2) NOT NULL,
	"max_score" numeric(4, 2) NOT NULL,
	"bonus_amount" numeric(12, 2) DEFAULT '0',
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"module" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pertes_financieres" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "pertes_financieres_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"agence_id" integer NOT NULL,
	"produit_id" integer,
	"lot_id" integer,
	"quantite" numeric(12, 2) NOT NULL,
	"cout_unitaire" numeric(12, 2) NOT NULL,
	"montant_perte" numeric(12, 2) NOT NULL,
	"type_perte" varchar(50) NOT NULL,
	"motif" text,
	"reference" varchar(100),
	"reference_type" varchar(50),
	"effectue_par" integer,
	"date_perte" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planning_affectations" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"employe_id" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"affectation" varchar(120) NOT NULL,
	"notes" text,
	"cree_par" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_planning_employe_date" UNIQUE("employe_id","date")
);
--> statement-breakpoint
CREATE TABLE "planning_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"employe_ids_json" jsonb NOT NULL,
	"dates_json" jsonb NOT NULL,
	"rows_json" jsonb NOT NULL,
	"raison" varchar(30) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "position_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"required_level" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(30) NOT NULL,
	"department_id" integer,
	"default_role_id" integer,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "postes_vente" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"emplacement_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"libelle" varchar(255),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prets_outils" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"outil_id" integer NOT NULL,
	"technicien_id" integer NOT NULL,
	"or_id" integer,
	"motif" varchar(255),
	"date_sortie" timestamp DEFAULT now(),
	"sortie_par" integer,
	"date_retour" timestamp,
	"retourne_le" timestamp,
	"retourne_par" integer,
	"etat_retour" varchar(30),
	"remarque" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "previsions_tresorerie" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"categorie" varchar(100),
	"montant_prevu" numeric(12, 2) NOT NULL,
	"montant_reel" numeric(12, 2),
	"date_prevision" date NOT NULL,
	"date_realisation" date,
	"libelle" varchar(255) NOT NULL,
	"statut" varchar(50) DEFAULT 'prevu',
	"reference_id" integer,
	"reference_type" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prix_historique" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"fournisseur_id" integer,
	"unite_id" uuid,
	"type_prix" varchar(50) NOT NULL,
	"ancien_prix" numeric(12, 2),
	"nouveau_prix" numeric(12, 2) NOT NULL,
	"source" varchar(50) NOT NULL,
	"reference" varchar(100),
	"reference_type" varchar(50),
	"motif" text,
	"effectue_par" integer,
	"agence_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "produit_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"designation" varchar(255) NOT NULL,
	"designation_courte" varchar(200),
	"description" text,
	"categorie_id" integer,
	"type_produit" varchar(20) DEFAULT 'PIECE',
	"image_url" varchar(500),
	"etat_produit_defaut" varchar(20) DEFAULT 'NEUF',
	"origine_produit_defaut" varchar(20) DEFAULT 'AFTERMARKET',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "produit_articles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "produit_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"variante_id" integer NOT NULL,
	"type_ref" varchar(30) NOT NULL,
	"valeur" varchar(160) NOT NULL,
	"valeur_normalisee" varchar(160),
	"is_principale" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_ref_variante_valeur" UNIQUE("variante_id","valeur")
);
--> statement-breakpoint
CREATE TABLE "produit_references_equiv" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"marque" varchar(100),
	"reference" varchar(160) NOT NULL,
	"note" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_ref_equiv_article" UNIQUE("article_id","reference")
);
--> statement-breakpoint
CREATE TABLE "produit_substitutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"variante_a_id" integer NOT NULL,
	"variante_b_id" integer NOT NULL,
	"niveau_confiance" varchar(20) DEFAULT 'MANUELLE',
	"valide_par" integer,
	"motif" varchar(255),
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "produit_supersessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ancienne_variante_id" integer,
	"ancienne_reference" varchar(160) NOT NULL,
	"nouvelle_variante_id" integer,
	"nouvelle_reference" varchar(160) NOT NULL,
	"fabricant" varchar(100),
	"date_remplacement" timestamp DEFAULT now(),
	"motif" varchar(255),
	"commande_autorisee" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "produit_unites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produit_id" integer NOT NULL,
	"unite_id" uuid NOT NULL,
	"parent_id" uuid,
	"facteur_vers_parent" numeric(12, 6) DEFAULT '1' NOT NULL,
	"facteur_vers_base" numeric(12, 6),
	"prix_achat" numeric(12, 2),
	"prix_vente" numeric(12, 2),
	"est_unite_base" boolean DEFAULT false,
	"est_unite_achat_defaut" boolean DEFAULT false,
	"est_unite_vente_defaut" boolean DEFAULT false,
	"statut" varchar(20) DEFAULT 'CREE',
	"autoriser_deconditionnement_vente" boolean DEFAULT false,
	"date_debut_validite" timestamp DEFAULT now(),
	"date_fin_validite" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_produit_unites_produit_unite" UNIQUE("produit_id","unite_id")
);
--> statement-breakpoint
CREATE TABLE "produits" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer,
	"type_produit" varchar(20) DEFAULT 'PIECE',
	"code_barre" varchar(100) NOT NULL,
	"code_article" varchar(100),
	"designation_courte" varchar(200),
	"conditionnement" varchar(200),
	"nom_code" varchar(100),
	"titre" varchar(500) NOT NULL,
	"editeur" varchar(255),
	"etat" varchar(50) DEFAULT 'neuf',
	"description" text,
	"categorie_id" integer,
	"fournisseur_id" integer,
	"unite_base_id" uuid,
	"prix_vente" numeric(12, 2),
	"prix_minimum_vente" numeric(12, 2),
	"prix_achat" numeric(12, 2),
	"prix_achat_reference" numeric(12, 2),
	"dernier_prix_achat" numeric(12, 2),
	"tva" numeric(5, 2) DEFAULT '0',
	"seuil_alerte" integer DEFAULT 5,
	"seuil_critique" integer DEFAULT 2,
	"stock_maximum" integer,
	"quantite_minimale" numeric(12, 2) DEFAULT '0',
	"statut" varchar(50) DEFAULT 'actif',
	"statut_cycle_vie" varchar(20) DEFAULT 'BROUILLON',
	"statut_outil" varchar(20),
	"classe_abc" varchar(1),
	"poids_kg" numeric(8, 2),
	"dimensions" varchar(50),
	"garantie_mois" integer,
	"suivi_serie" boolean DEFAULT false,
	"suivi_lot" boolean DEFAULT false,
	"date_discontinuation" timestamp,
	"motif_suspension" text,
	"modele_emballage_id" uuid,
	"unite_vente" varchar(50) DEFAULT 'unite',
	"unite_achat" varchar(50) DEFAULT 'unite',
	"emplacement_principal_id" integer,
	"est_reconditionnable" boolean DEFAULT false,
	"origine_qualite" varchar(20) DEFAULT 'AUTRE',
	"dlc_jours" integer,
	"est_core" boolean DEFAULT false,
	"valeur_core" numeric(12, 2),
	"marque" varchar(255),
	"reference_fabricant" varchar(255),
	"ref_oem" varchar(255),
	"ref_aftermarket" varchar(255),
	"couleur" varchar(100),
	"format" varchar(50),
	"matiere_composition" text,
	"notes" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"image_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"compte_comptable" varchar(20),
	"centre_de_cout" varchar(60),
	"methode_valorisation" varchar(10) DEFAULT 'CUMP',
	"type_outil" varchar(30),
	"numero_immobilisation" varchar(50),
	"date_achat" timestamp,
	"valeur_acquisition" numeric(12, 2),
	"responsable_id" integer,
	"etat_equipement" varchar(30),
	"calibrable" boolean DEFAULT false,
	"niveau" varchar(10) DEFAULT 'VARIANTE',
	"reference_principale" varchar(160),
	"etat_produit" varchar(20),
	"origine_produit" varchar(20),
	"relation_produit" varchar(20),
	"position_cote" varchar(20),
	"position_essieu" varchar(20),
	"position_zone" varchar(20),
	"position_emplacement" varchar(30),
	"stock_securite" integer,
	"point_commande" integer,
	"qte_min_commande" numeric(12, 2),
	"prix_pro" numeric(12, 2),
	"prix_particulier" numeric(12, 2),
	"numero_serie" varchar(100),
	"numero_lot" varchar(100),
	"date_fabrication" timestamp,
	"date_expiration" timestamp,
	CONSTRAINT "produits_code_barre_unique" UNIQUE("code_barre"),
	CONSTRAINT "produits_code_article_unique" UNIQUE("code_article")
);
--> statement-breakpoint
CREATE TABLE "produits_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"fournisseur_id" integer NOT NULL,
	"unite_id" uuid,
	"reference_fournisseur" varchar(255),
	"prix_achat" numeric(12, 2),
	"delai_approvisionnement" integer,
	"est_principal" boolean DEFAULT false,
	"unite_conditionnement" uuid,
	"facteur_conditionnement" numeric(12, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"type_promo" varchar(50) NOT NULL,
	"conditions" jsonb,
	"valeur" numeric(12, 2),
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"est_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rachats" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"client_nom" varchar(255),
	"client_contact" varchar(100),
	"agence_id" integer NOT NULL,
	"operateur_id" integer NOT NULL,
	"montant_total" numeric(12, 2) DEFAULT '0',
	"type" varchar(50) DEFAULT 'rachat_simple',
	"vente_id" integer,
	"montant_echange" numeric(12, 2),
	"difference" numeric(12, 2),
	"stocke" boolean DEFAULT false,
	"statut" varchar(50) DEFAULT 'termine',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rachats_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "rachats_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rachat_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"quantite" integer DEFAULT 1 NOT NULL,
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"etat" varchar(50) DEFAULT 'usage',
	"total_ligne" numeric(12, 2),
	"prix_reseal" numeric(12, 2),
	"lot_id" integer,
	"vendu" boolean DEFAULT false,
	"vente_ligne_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reconditionnements" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "reconditionnements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"agence_id" integer NOT NULL,
	"produit_source_id" integer NOT NULL,
	"unite_source_id" uuid NOT NULL,
	"quantite_source" numeric(12, 2) NOT NULL,
	"produit_cible_id" integer,
	"unite_cible_id" uuid NOT NULL,
	"quantite_generee" numeric(12, 2) NOT NULL,
	"facteur_conversion" numeric(12, 4),
	"effectue_par" integer NOT NULL,
	"motif" varchar(255),
	"groupe_operation_id" uuid,
	"date_reconditionnement" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "regles_automatisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"declencheur" varchar(100) NOT NULL,
	"conditions" jsonb,
	"actions" jsonb,
	"est_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "regles_tarification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"produit_id" integer,
	"type_regle" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"conditions" jsonb,
	"valeur" numeric(12, 2),
	"priorite" integer DEFAULT 0,
	"est_active" boolean DEFAULT true,
	"date_debut" timestamp,
	"date_fin" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "relances" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"dette_id" integer,
	"fournisseur_id" integer,
	"dette_fournisseur_id" integer,
	"agence_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"canal" varchar(50) DEFAULT 'SYSTEME',
	"message" text NOT NULL,
	"statut" varchar(50) DEFAULT 'EN_ATTENTE',
	"envoyee_le" timestamp,
	"lu_le" timestamp,
	"cree_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remboursements_dettes" (
	"id" serial PRIMARY KEY NOT NULL,
	"dette_id" integer NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"mode_paiement" varchar(50) NOT NULL,
	"effectue_le" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remboursements_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dette_id" integer NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"mode_paiement" varchar(50) NOT NULL,
	"caisse_id" integer,
	"effectue_le" timestamp DEFAULT now(),
	"reference" varchar(100),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retours" (
	"id" serial PRIMARY KEY NOT NULL,
	"vente_id" integer NOT NULL,
	"client_id" integer,
	"montant_total" numeric(12, 2) NOT NULL,
	"type_retour" varchar(50) NOT NULL,
	"statut" varchar(50) DEFAULT 'en_attente',
	"motif" text,
	"effectue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retours_fournisseur" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"achat_id" integer,
	"bon_reception_id" integer,
	"fournisseur_id" integer,
	"or_id" integer,
	"motif" varchar(30) DEFAULT 'DEFAILLANTE',
	"statut" varchar(20) DEFAULT 'RETOURNE',
	"date_retour" date,
	"commentaire" text,
	"cree_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retours_fournisseur_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"retour_id" integer NOT NULL,
	"produit_id" integer,
	"libelle" varchar(255),
	"quantite" numeric(12, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "rh_absence_justification_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"justification_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"ancien_statut" varchar(20),
	"nouveau_statut" varchar(20) NOT NULL,
	"action" varchar(30) NOT NULL,
	"acteur_id" integer,
	"motif" text NOT NULL,
	"document_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rh_absence_justifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"statut" varchar(20) DEFAULT 'FOURNI' NOT NULL,
	"motif_code" varchar(40),
	"motif_libelle" varchar(120),
	"justificatif_url" text,
	"justificatif_reference" varchar(120),
	"justificatif_type" varchar(40),
	"depose_par" integer,
	"depose_at" timestamp DEFAULT now(),
	"decision_par" integer,
	"decision_at" timestamp,
	"refus_motif" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rh_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(60) NOT NULL,
	"avant_json" jsonb,
	"apres_json" jsonb,
	"motif" text NOT NULL,
	"user_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"niveau" integer DEFAULT 0,
	"remise_maximum" integer DEFAULT 15,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" integer NOT NULL,
	"sanction_type_id" integer,
	"type_sanction" varchar(50) NOT NULL,
	"motif" text NOT NULL,
	"gravite" varchar(20) DEFAULT 'MOYENNE',
	"date_sanction" date NOT NULL,
	"date_debut_effet" date,
	"date_fin_effet" date,
	"duree_jours" numeric(5, 1),
	"details_financiers" numeric(12, 2),
	"decision" varchar(20) DEFAULT 'notifiee',
	"notified_at" timestamp,
	"document_url" text,
	"appliquee" boolean DEFAULT false,
	"valide_par" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "services_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"famille" varchar(40) NOT NULL,
	"libelle" varchar(120) NOT NULL,
	"temps_standard_heures" numeric(6, 2) NOT NULL,
	"delai_cible_jours" integer DEFAULT 1,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions_caisse" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_id" integer NOT NULL,
	"ouvert_par" integer NOT NULL,
	"ferme_par" integer,
	"statut" varchar(50) DEFAULT 'ouverte',
	"solde_ouverture" numeric(12, 2) NOT NULL,
	"solde_actuel" numeric(12, 2) NOT NULL,
	"solde_attendu_fermeture" numeric(12, 2),
	"solde_compte_fermeture" numeric(12, 2),
	"ecart" numeric(12, 2),
	"ouvert_le" timestamp DEFAULT now(),
	"ferme_le" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(60) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"emplacement_id" integer,
	"lot_id" integer,
	"quantite" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantite_reservee" numeric(12, 2) DEFAULT '0',
	"quantite_bloquee" numeric(12, 2) DEFAULT '0',
	"quantite_rayon" numeric(12, 2) DEFAULT '0',
	"seuil_alerte_local" integer,
	"unite_reference_id" uuid,
	"cout_unitaire_moyen" numeric(12, 2),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_stocks_produit_agence_emplacement_lot" UNIQUE("produit_id","agence_id","emplacement_id","lot_id")
);
--> statement-breakpoint
CREATE TABLE "stocks_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"lot_id" integer NOT NULL,
	"quantite" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_stocks_lots_produit_agence_lot" UNIQUE("produit_id","agence_id","lot_id")
);
--> statement-breakpoint
CREATE TABLE "stocks_unites" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "stocks_unites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"produit_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"unite_id" uuid NOT NULL,
	"quantite" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_stocks_unites_produit_agence_unite" UNIQUE("produit_id","agence_id","unite_id")
);
--> statement-breakpoint
CREATE TABLE "sync_etat" (
	"id" serial PRIMARY KEY NOT NULL,
	"table" varchar(80) NOT NULL,
	"dernier_sync" timestamp DEFAULT now(),
	"statut" varchar(20) DEFAULT 'OK',
	"erreur" text,
	"nb_poussees" integer DEFAULT 0,
	"maj_le" timestamp DEFAULT now(),
	CONSTRAINT "sync_etat_table_unique" UNIQUE("table")
);
--> statement-breakpoint
CREATE TABLE "sync_ingests" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"entite" varchar(80) NOT NULL,
	"action" varchar(20) NOT NULL,
	"payload" jsonb NOT NULL,
	"nb_lignes" integer DEFAULT 0,
	"recu_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"entite" varchar(80) NOT NULL,
	"payload" text NOT NULL,
	"statut" varchar(20) DEFAULT 'EN_ATTENTE',
	"tentatives" integer DEFAULT 0,
	"erreur" text,
	"created_at" timestamp DEFAULT now(),
	"envoye_le" timestamp
);
--> statement-breakpoint
CREATE TABLE "tarifs" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"prix" numeric(12, 2) NOT NULL,
	"label" varchar(255),
	"quantite_min" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer,
	"action" varchar(80) NOT NULL,
	"details" jsonb,
	"acteur_id" integer,
	"acteur_email" varchar(255),
	"cree_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_licences" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"jeton" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"grace_jours" integer DEFAULT 7,
	"statut" varchar(30) DEFAULT 'ACTIVE',
	"mode" varchar(20) DEFAULT 'ESSAI',
	"emit_le" timestamp DEFAULT now(),
	"cree_par" integer
);
--> statement-breakpoint
CREATE TABLE "tenant_paiements" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"licence_id" integer,
	"reference" varchar(100) NOT NULL,
	"montant" integer NOT NULL,
	"mode_paiement" varchar(30) DEFAULT 'cinetpay',
	"statut" varchar(30) DEFAULT 'EN_ATTENTE',
	"periode_mois" integer DEFAULT 1,
	"fournisseur" varchar(50),
	"paye_le" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_paiements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "tenant_relances" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"type" varchar(40) NOT NULL,
	"message" varchar(500) NOT NULL,
	"statut" varchar(20) DEFAULT 'A_FAIRE',
	"cree_le" timestamp DEFAULT now(),
	"faite_le" timestamp,
	"faite_par" integer
);
--> statement-breakpoint
CREATE TABLE "tenant_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_site" varchar(50) NOT NULL,
	"nom_garage" varchar(255) NOT NULL,
	"ville" varchar(100),
	"telephone" varchar(50),
	"email" varchar(255),
	"statut" varchar(30) DEFAULT 'ACTIF',
	"version_logiciel" varchar(30),
	"cle_api" varchar(100) NOT NULL,
	"cle_api_ancienne" varchar(100),
	"cle_api_change_le" timestamp,
	"dernier_heartbeat" timestamp,
	"derniere_sync" timestamp,
	"inscrit_le" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_sites_code_site_unique" UNIQUE("code_site")
);
--> statement-breakpoint
CREATE TABLE "tenant_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"montant" integer DEFAULT 0,
	"nb" integer DEFAULT 0,
	"periode" varchar(10),
	"maj_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"entite" varchar(80) NOT NULL,
	"periode" varchar(10) NOT NULL,
	"nb_lignes" integer DEFAULT 0,
	"maj_le" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_participations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'inscrit',
	"certificate_url" text,
	"score" numeric(5, 1)
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" integer NOT NULL,
	"start_date" varchar(10) NOT NULL,
	"end_date" varchar(10),
	"location" varchar(160),
	"status" varchar(20) DEFAULT 'planifiee',
	"created_by" integer,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"provider" varchar(120),
	"duration_hours" numeric(6, 1),
	"skill_ids" jsonb,
	"active" boolean DEFAULT true,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transferts_caisses" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"caisse_source_id" integer NOT NULL,
	"caisse_dest_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"motif" varchar(255),
	"statut" varchar(50) DEFAULT 'effectue',
	"effectue_par" integer,
	"approuve_par" integer,
	"created_at" timestamp DEFAULT now(),
	"approuve_le" timestamp
);
--> statement-breakpoint
CREATE TABLE "transferts_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"depuis_agence_id" integer NOT NULL,
	"vers_agence_id" integer NOT NULL,
	"produit_id" integer NOT NULL,
	"quantite" integer NOT NULL,
	"quantite_recue" integer,
	"unite_id" uuid,
	"statut" varchar(50) DEFAULT 'EN_ATTENTE',
	"motif" text,
	"notes_reception" text,
	"ecart" integer,
	"effectue_par" integer,
	"expedie_par" integer,
	"recu_par" integer,
	"groupe_operation_id" uuid,
	"date_expedition" timestamp,
	"date_reception" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travaux_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" integer NOT NULL,
	"demande_par_user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"filtres_json" jsonb,
	"statut" varchar(50) DEFAULT 'en_attente',
	"fichier_url" text,
	"created_at" timestamp DEFAULT now(),
	"termine_le" timestamp
);
--> statement-breakpoint
CREATE TABLE "unites_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domaine_id" uuid NOT NULL,
	"unite_id" uuid NOT NULL,
	"facteur_vers_base" numeric(30, 12),
	"formule_derivee" text,
	"precision" numeric(8, 4),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "unites_domaines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" varchar(50) NOT NULL,
	"unite_base_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unites_domaines_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unites_mesure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" varchar(50) NOT NULL,
	"symbole" varchar(10),
	"type" varchar(20) DEFAULT 'QUANTITE',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unites_mesure_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unites_mesure_produits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produit_id" integer NOT NULL,
	"unite_id" uuid NOT NULL,
	"facteur_conversion" integer DEFAULT 1 NOT NULL,
	"prix_achat" integer DEFAULT 0,
	"prix_vente" integer DEFAULT 0,
	"est_unite_achat_defaut" boolean DEFAULT false,
	"est_unite_vente_defaut" boolean DEFAULT false,
	"est_unite_base" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "utilisateurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"login_email" varchar(255),
	"mot_de_passe" varchar(255),
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"telephone" varchar(50),
	"agence_id" integer NOT NULL,
	"role_id" uuid,
	"employe_id" integer,
	"two_factor_secret" varchar(64),
	"two_factor_enabled" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"status" varchar(50) DEFAULT 'invited',
	"email_verified" timestamp,
	"derniere_connexion" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "utilisateurs_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "utilisations_avoir" (
	"id" serial PRIMARY KEY NOT NULL,
	"avoir_id" integer NOT NULL,
	"vente_id" integer,
	"montant_utilise" numeric(12, 2) NOT NULL,
	"type" varchar(50) DEFAULT 'deduction' NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"effectue_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "variante_attributs" (
	"id" serial PRIMARY KEY NOT NULL,
	"variante_id" integer NOT NULL,
	"cle" varchar(100) NOT NULL,
	"valeur" text,
	"unite" varchar(30),
	"ordre" integer DEFAULT 0 NOT NULL,
	"type_attribut" varchar(20) DEFAULT 'TEXTE',
	"min" numeric(12, 2),
	"max" numeric(12, 2),
	"portee" varchar(20) DEFAULT 'VARIANTE',
	"obligatoire" boolean DEFAULT false NOT NULL,
	"searchable" boolean DEFAULT false NOT NULL,
	"filtrable" boolean DEFAULT false NOT NULL,
	"comparable" boolean DEFAULT false NOT NULL,
	"liste" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"precision" numeric(8, 4),
	"aide" text,
	"unite_id" uuid,
	"statut_valeur" varchar(20) DEFAULT 'RENSEIGNE' NOT NULL,
	"provenance" varchar(30),
	"source" varchar(160),
	"niveau_confiance" varchar(20),
	"source_date" timestamp,
	"source_par" integer,
	"preuve" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_variante_attribut" UNIQUE("variante_id","cle")
);
--> statement-breakpoint
CREATE TABLE "vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"client_id" integer,
	"immatriculation" varchar(50) NOT NULL,
	"marque" varchar(100),
	"modele" varchar(100),
	"version" varchar(100),
	"annee" integer,
	"couleur" varchar(50),
	"numero_chassis" varchar(100),
	"kilometrage" integer,
	"carburant" varchar(30),
	"chauffeur_nom" varchar(100),
	"chauffeur_telephone" varchar(30),
	"type_vehicule" varchar(30) DEFAULT 'voiture',
	"statut_immobilisation" varchar(50) DEFAULT 'en_reception',
	"site_id" integer,
	"emplacement_id" integer,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ventes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"reference" varchar(100) NOT NULL,
	"operateur_id" integer NOT NULL,
	"client_id" integer,
	"session_caisse_id" integer,
	"vente_id_origine" integer,
	"mode_paiement" varchar(50) DEFAULT 'especes' NOT NULL,
	"montant_total" numeric(12, 2) NOT NULL,
	"remise" numeric(12, 2) DEFAULT '0',
	"montant_paye" numeric(12, 2),
	"statut" varchar(50) DEFAULT 'termine' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ventes_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "ventes_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"vente_id" integer NOT NULL,
	"produit_id" integer,
	"libelle" varchar(255),
	"quantite" integer NOT NULL,
	"unite_id" uuid,
	"facteur_conversion" integer DEFAULT 1 NOT NULL,
	"quantite_convertie" numeric(12, 2),
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"total_ligne" numeric(12, 2),
	"cout_unitaire" numeric(12, 2),
	"lot_id" integer
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"type" varchar(50) DEFAULT 'account_activation' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"is_used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_demandeur_id_utilisateurs_id_fk" FOREIGN KEY ("demandeur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_destination_pos_id_caisses_id_fk" FOREIGN KEY ("destination_pos_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_cloture_par_utilisateurs_id_fk" FOREIGN KEY ("cloture_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_partenaire_id_fournisseurs_id_fk" FOREIGN KEY ("partenaire_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_agent_id_utilisateurs_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_advance_id_employee_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."employee_advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_transitions" ADD CONSTRAINT "advance_transitions_advance_id_employee_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."employee_advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_transitions" ADD CONSTRAINT "advance_transitions_acteur_id_utilisateurs_id_fk" FOREIGN KEY ("acteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agences" ADD CONSTRAINT "agences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_resolue_par_utilisateurs_id_fk" FOREIGN KEY ("resolue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes_stock" ADD CONSTRAINT "alertes_stock_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes_stock" ADD CONSTRAINT "alertes_stock_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_demande_par_utilisateurs_id_fk" FOREIGN KEY ("demande_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_approuve_par_utilisateurs_id_fk" FOREIGN KEY ("approuve_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archives" ADD CONSTRAINT "archives_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archives" ADD CONSTRAINT "archives_archived_by_utilisateurs_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archives" ADD CONSTRAINT "archives_restored_by_utilisateurs_id_fk" FOREIGN KEY ("restored_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_attributs" ADD CONSTRAINT "article_attributs_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_attributs" ADD CONSTRAINT "article_attributs_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_attributs" ADD CONSTRAINT "article_attributs_source_par_utilisateurs_id_fk" FOREIGN KEY ("source_par") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_documents" ADD CONSTRAINT "article_documents_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_equivalences" ADD CONSTRAINT "article_equivalences_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_equivalences" ADD CONSTRAINT "article_equivalences_article_id_produits_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_equivalences" ADD CONSTRAINT "article_equivalences_article_equivalent_id_produits_id_fk" FOREIGN KEY ("article_equivalent_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atelier_notifications" ADD CONSTRAINT "atelier_notifications_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atelier_notifications" ADD CONSTRAINT "atelier_notifications_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atelier_notifications" ADD CONSTRAINT "atelier_notifications_lue_par_utilisateurs_id_fk" FOREIGN KEY ("lue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atelier_parametres" ADD CONSTRAINT "atelier_parametres_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_calculations" ADD CONSTRAINT "attendance_calculations_attendance_entry_id_attendance_entries_id_fk" FOREIGN KEY ("attendance_entry_id") REFERENCES "public"."attendance_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_calculations" ADD CONSTRAINT "attendance_calculations_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_validated_by_utilisateurs_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_monthly_summaries" ADD CONSTRAINT "attendance_monthly_summaries_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_monthly_summaries" ADD CONSTRAINT "attendance_monthly_summaries_locked_by_utilisateurs_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribut_definitions" ADD CONSTRAINT "attribut_definitions_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribut_definitions" ADD CONSTRAINT "attribut_definitions_famille_id_categories_id_fk" FOREIGN KEY ("famille_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribut_definitions" ADD CONSTRAINT "attribut_definitions_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_retour_id_retours_id_fk" FOREIGN KEY ("retour_id") REFERENCES "public"."retours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_receptionne_par_utilisateurs_id_fk" FOREIGN KEY ("receptionne_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_operateurs" ADD CONSTRAINT "caisse_operateurs_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_operateurs" ADD CONSTRAINT "caisse_operateurs_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_qualite" ADD CONSTRAINT "catalogue_qualite_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cles_api" ADD CONSTRAINT "cles_api_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_adresses" ADD CONSTRAINT "client_adresses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_statut_historique" ADD CONSTRAINT "client_statut_historique_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_statut_historique" ADD CONSTRAINT "client_statut_historique_change_par_utilisateurs_id_fk" FOREIGN KEY ("change_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes_barres" ADD CONSTRAINT "codes_barres_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilites_produits" ADD CONSTRAINT "compatibilites_produits_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilites_produits" ADD CONSTRAINT "compatibilites_produits_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_types" ADD CONSTRAINT "contract_types_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_contract_versions" ADD CONSTRAINT "rh_contract_versions_contract_id_contrats_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contrats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_contract_versions" ADD CONSTRAINT "rh_contract_versions_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_contract_versions" ADD CONSTRAINT "rh_contract_versions_changed_by_utilisateurs_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flotte_vehicules" ADD CONSTRAINT "contrats_flotte_vehicules_contrat_id_contrats_flottes_id_fk" FOREIGN KEY ("contrat_id") REFERENCES "public"."contrats_flottes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flotte_vehicules" ADD CONSTRAINT "contrats_flotte_vehicules_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flottes" ADD CONSTRAINT "contrats_flottes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flottes" ADD CONSTRAINT "contrats_flottes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance" ADD CONSTRAINT "contrats_maintenance_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance" ADD CONSTRAINT "contrats_maintenance_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance" ADD CONSTRAINT "contrats_maintenance_responsable_interne_utilisateurs_id_fk" FOREIGN KEY ("responsable_interne") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance" ADD CONSTRAINT "contrats_maintenance_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance_vehicules" ADD CONSTRAINT "contrats_maintenance_vehicules_contrat_id_contrats_maintenance_id_fk" FOREIGN KEY ("contrat_id") REFERENCES "public"."contrats_maintenance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_maintenance_vehicules" ADD CONSTRAINT "contrats_maintenance_vehicules_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_unite_source_id_unites_mesure_id_fk" FOREIGN KEY ("unite_source_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_unite_cible_id_unites_mesure_id_fk" FOREIGN KEY ("unite_cible_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_commande" ADD CONSTRAINT "demandes_commande_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_session_caisse_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_enregistre_par_utilisateurs_id_fk" FOREIGN KEY ("enregistre_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_clients" ADD CONSTRAINT "dettes_clients_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_clients" ADD CONSTRAINT "dettes_clients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_clients" ADD CONSTRAINT "dettes_clients_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_fournisseurs" ADD CONSTRAINT "dettes_fournisseurs_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_fournisseurs" ADD CONSTRAINT "dettes_fournisseurs_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dettes_fournisseurs" ADD CONSTRAINT "dettes_fournisseurs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_employes" ADD CONSTRAINT "documents_employes_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_employes" ADD CONSTRAINT "documents_employes_document_type_id_hr_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."hr_document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_employes" ADD CONSTRAINT "documents_employes_uploaded_by_utilisateurs_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_bon_reception_id_bons_reception_id_fk" FOREIGN KEY ("bon_reception_id") REFERENCES "public"."bons_reception"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges_cores" ADD CONSTRAINT "echanges_cores_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges_cores" ADD CONSTRAINT "echanges_cores_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges_cores" ADD CONSTRAINT "echanges_cores_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges_cores" ADD CONSTRAINT "echanges_cores_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_journal" ADD CONSTRAINT "ecritures_journal_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_journal" ADD CONSTRAINT "ecritures_journal_validee_par_utilisateurs_id_fk" FOREIGN KEY ("validee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_parent_id_emplacements_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_responsable_id_utilisateurs_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_changed_by_utilisateurs_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_postures" ADD CONSTRAINT "employee_postures_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_postures" ADD CONSTRAINT "employee_postures_pointe_par_utilisateurs_id_fk" FOREIGN KEY ("pointe_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_postures" ADD CONSTRAINT "employee_postures_annule_par_utilisateurs_id_fk" FOREIGN KEY ("annule_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_changed_by_utilisateurs_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situation_transitions" ADD CONSTRAINT "employee_situation_transitions_situation_id_employee_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."employee_situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situation_transitions" ADD CONSTRAINT "employee_situation_transitions_acteur_id_utilisateurs_id_fk" FOREIGN KEY ("acteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situations" ADD CONSTRAINT "employee_situations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situations" ADD CONSTRAINT "employee_situations_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situations" ADD CONSTRAINT "employee_situations_situation_type_id_hr_situation_types_id_fk" FOREIGN KEY ("situation_type_id") REFERENCES "public"."hr_situation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situations" ADD CONSTRAINT "employee_situations_approbateur_id_utilisateurs_id_fk" FOREIGN KEY ("approbateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_situations" ADD CONSTRAINT "employee_situations_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_assessed_by_utilisateurs_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_changed_by_utilisateurs_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_work_cycle_id_hr_work_cycles_id_fk" FOREIGN KEY ("work_cycle_id") REFERENCES "public"."hr_work_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_campaigns" ADD CONSTRAINT "evaluation_campaigns_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_campaigns" ADD CONSTRAINT "evaluation_campaigns_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_grid_id_evaluation_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."evaluation_grids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_grids" ADD CONSTRAINT "evaluation_grids_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_grids" ADD CONSTRAINT "evaluation_grids_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_criterion_id_evaluation_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."evaluation_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_campaign_id_evaluation_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."evaluation_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_utilisateurs_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_grid_id_evaluation_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."evaluation_grids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_fournisseur" ADD CONSTRAINT "factures_fournisseur_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_fournisseur" ADD CONSTRAINT "factures_fournisseur_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_fournisseur" ADD CONSTRAINT "factures_fournisseur_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_fournisseur" ADD CONSTRAINT "factures_fournisseur_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_partenaires" ADD CONSTRAINT "factures_partenaires_partenaire_id_fournisseurs_id_fk" FOREIGN KEY ("partenaire_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_partenaires" ADD CONSTRAINT "factures_partenaires_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_partenaires" ADD CONSTRAINT "factures_partenaires_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_partenaires" ADD CONSTRAINT "factures_partenaires_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faits_caisse_quotidiens" ADD CONSTRAINT "faits_caisse_quotidiens_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faits_caisse_quotidiens" ADD CONSTRAINT "faits_caisse_quotidiens_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faits_stock_quotidiens" ADD CONSTRAINT "faits_stock_quotidiens_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faits_ventes_quotidiens" ADD CONSTRAINT "faits_ventes_quotidiens_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_categories" ADD CONSTRAINT "guide_categories_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_common_errors" ADD CONSTRAINT "guide_common_errors_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_examples" ADD CONSTRAINT "guide_examples_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_examples" ADD CONSTRAINT "guide_examples_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_examples" ADD CONSTRAINT "guide_examples_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_field_mappings" ADD CONSTRAINT "guide_field_mappings_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_field_mappings" ADD CONSTRAINT "guide_field_mappings_variant_type_id_guide_variant_types_id_fk" FOREIGN KEY ("variant_type_id") REFERENCES "public"."guide_variant_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_modeling_rules" ADD CONSTRAINT "guide_modeling_rules_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_procedure_steps" ADD CONSTRAINT "guide_procedure_steps_procedure_id_guide_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."guide_procedures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_procedures" ADD CONSTRAINT "guide_procedures_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_relations" ADD CONSTRAINT "guide_relations_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_rules" ADD CONSTRAINT "guide_rules_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_rules" ADD CONSTRAINT "guide_rules_exemple_id_produits_id_fk" FOREIGN KEY ("exemple_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_search_aliases" ADD CONSTRAINT "guide_search_aliases_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_search_aliases" ADD CONSTRAINT "guide_search_aliases_definition_id_attribut_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribut_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_steps" ADD CONSTRAINT "guide_steps_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_variant_differentiators" ADD CONSTRAINT "guide_variant_differentiators_variant_type_id_guide_variant_types_id_fk" FOREIGN KEY ("variant_type_id") REFERENCES "public"."guide_variant_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_variant_types" ADD CONSTRAINT "guide_variant_types_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance_settings" ADD CONSTRAINT "hr_attendance_settings_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance_settings" ADD CONSTRAINT "hr_attendance_settings_updated_by_utilisateurs_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_document_types" ADD CONSTRAINT "hr_document_types_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_general_settings" ADD CONSTRAINT "hr_general_settings_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_general_settings" ADD CONSTRAINT "hr_general_settings_updated_by_utilisateurs_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_leave_types" ADD CONSTRAINT "hr_leave_types_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_public_holidays" ADD CONSTRAINT "hr_public_holidays_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_sanction_types" ADD CONSTRAINT "hr_sanction_types_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_sensibilisation_rules" ADD CONSTRAINT "hr_sensibilisation_rules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_situation_types" ADD CONSTRAINT "hr_situation_types_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_work_cycles" ADD CONSTRAINT "hr_work_cycles_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_work_schedules" ADD CONSTRAINT "hr_work_schedules_cycle_id_hr_work_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."hr_work_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_techniciens" ADD CONSTRAINT "interventions_techniciens_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_techniciens" ADD CONSTRAINT "interventions_techniciens_ordre_id_ordres_reparation_id_fk" FOREIGN KEY ("ordre_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_techniciens" ADD CONSTRAINT "interventions_techniciens_ligne_id_lignes_ordre_reparation_id_fk" FOREIGN KEY ("ligne_id") REFERENCES "public"."lignes_ordre_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_techniciens" ADD CONSTRAINT "interventions_techniciens_technicien_id_employes_id_fk" FOREIGN KEY ("technicien_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_session_id_inventaires_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inventaires_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires_sessions" ADD CONSTRAINT "inventaires_sessions_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires_sessions" ADD CONSTRAINT "inventaires_sessions_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventaires_sessions" ADD CONSTRAINT "inventaires_sessions_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits_lignes" ADD CONSTRAINT "kits_lignes_kit_id_produits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits_lignes" ADD CONSTRAINT "kits_lignes_composant_id_produits_id_fk" FOREIGN KEY ("composant_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_cibles" ADD CONSTRAINT "kpi_cibles_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_deduction_rules" ADD CONSTRAINT "late_deduction_rules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_leave_balance_id_leave_balances_id_fk" FOREIGN KEY ("leave_balance_id") REFERENCES "public"."leave_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_snapshots" ADD CONSTRAINT "leave_balance_snapshots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_snapshots" ADD CONSTRAINT "leave_balance_snapshots_leave_balance_id_leave_balances_id_fk" FOREIGN KEY ("leave_balance_id") REFERENCES "public"."leave_balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_snapshots" ADD CONSTRAINT "leave_balance_snapshots_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_hr_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."hr_leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_hr_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."hr_leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requested_by_utilisateurs_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_utilisateurs_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_bon_reception" ADD CONSTRAINT "lignes_bon_reception_bon_reception_id_bons_reception_id_fk" FOREIGN KEY ("bon_reception_id") REFERENCES "public"."bons_reception"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_bon_reception" ADD CONSTRAINT "lignes_bon_reception_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecriture_journal" ADD CONSTRAINT "lignes_ecriture_journal_ecriture_id_ecritures_journal_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_journal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecriture_journal" ADD CONSTRAINT "lignes_ecriture_journal_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ordre_reparation" ADD CONSTRAINT "lignes_ordre_reparation_ordre_id_ordres_reparation_id_fk" FOREIGN KEY ("ordre_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ordre_reparation" ADD CONSTRAINT "lignes_ordre_reparation_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ordre_reparation" ADD CONSTRAINT "lignes_ordre_reparation_technicien_id_employes_id_fk" FOREIGN KEY ("technicien_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_retour_id_retours_id_fk" FOREIGN KEY ("retour_id") REFERENCES "public"."retours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_vente_ligne_id_ventes_lignes_id_fk" FOREIGN KEY ("vente_ligne_id") REFERENCES "public"."ventes_lignes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_emballage_niveaux" ADD CONSTRAINT "modele_emballage_niveaux_modele_id_modeles_emballage_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modeles_emballage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_emballage_niveaux" ADD CONSTRAINT "modele_emballage_niveaux_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_emballage_niveaux" ADD CONSTRAINT "modele_emballage_niveaux_parent_niveau_id_modele_emballage_niveaux_id_fk" FOREIGN KEY ("parent_niveau_id") REFERENCES "public"."modele_emballage_niveaux"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_caisse" ADD CONSTRAINT "mouvements_caisse_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_caisse" ADD CONSTRAINT "mouvements_caisse_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_emplacement_id_emplacements_id_fk" FOREIGN KEY ("emplacement_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alerte_id_alertes_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alertes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_autorisations" ADD CONSTRAINT "or_autorisations_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_autorisations" ADD CONSTRAINT "or_autorisations_devis_version_id_or_devis_versions_id_fk" FOREIGN KEY ("devis_version_id") REFERENCES "public"."or_devis_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_autorisations" ADD CONSTRAINT "or_autorisations_ligne_id_lignes_ordre_reparation_id_fk" FOREIGN KEY ("ligne_id") REFERENCES "public"."lignes_ordre_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_controles_qualite" ADD CONSTRAINT "or_controles_qualite_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_controles_qualite" ADD CONSTRAINT "or_controles_qualite_controle_par_utilisateurs_id_fk" FOREIGN KEY ("controle_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces" ADD CONSTRAINT "or_demandes_pieces_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces" ADD CONSTRAINT "or_demandes_pieces_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces" ADD CONSTRAINT "or_demandes_pieces_demandeur_id_employes_id_fk" FOREIGN KEY ("demandeur_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces" ADD CONSTRAINT "or_demandes_pieces_traite_par_utilisateurs_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces_lignes" ADD CONSTRAINT "or_demandes_pieces_lignes_demande_id_or_demandes_pieces_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."or_demandes_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_demandes_pieces_lignes" ADD CONSTRAINT "or_demandes_pieces_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_devis_versions" ADD CONSTRAINT "or_devis_versions_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_devis_versions" ADD CONSTRAINT "or_devis_versions_envoye_par_utilisateurs_id_fk" FOREIGN KEY ("envoye_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_devis_versions" ADD CONSTRAINT "or_devis_versions_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_historique" ADD CONSTRAINT "or_historique_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_historique" ADD CONSTRAINT "or_historique_change_par_utilisateurs_id_fk" FOREIGN KEY ("change_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_inspection_points" ADD CONSTRAINT "or_inspection_points_inspection_id_or_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."or_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_inspections" ADD CONSTRAINT "or_inspections_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_inspections" ADD CONSTRAINT "or_inspections_technicien_id_utilisateurs_id_fk" FOREIGN KEY ("technicien_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_inspections" ADD CONSTRAINT "or_inspections_envoyee_par_utilisateurs_id_fk" FOREIGN KEY ("envoyee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_photos" ADD CONSTRAINT "or_photos_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_photos" ADD CONSTRAINT "or_photos_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_rapports_diagnostic" ADD CONSTRAINT "or_rapports_diagnostic_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_restitutions" ADD CONSTRAINT "or_restitutions_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_restitutions" ADD CONSTRAINT "or_restitutions_restitue_par_utilisateurs_id_fk" FOREIGN KEY ("restitue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_responsable_technicien_id_employes_id_fk" FOREIGN KEY ("responsable_technicien_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_receptionniste_id_utilisateurs_id_fk" FOREIGN KEY ("receptionniste_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_ferme_definitivement_par_utilisateurs_id_fk" FOREIGN KEY ("ferme_definitivement_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outillage_calibration" ADD CONSTRAINT "outillage_calibration_outil_id_produits_id_fk" FOREIGN KEY ("outil_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outillage_calibration" ADD CONSTRAINT "outillage_calibration_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outillage_maintenance" ADD CONSTRAINT "outillage_maintenance_outil_id_produits_id_fk" FOREIGN KEY ("outil_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outillage_maintenance" ADD CONSTRAINT "outillage_maintenance_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_authorizations" ADD CONSTRAINT "overtime_authorizations_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_authorizations" ADD CONSTRAINT "overtime_authorizations_authorized_by_utilisateurs_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_retour_id_retours_id_fk" FOREIGN KEY ("retour_id") REFERENCES "public"."retours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_alerts" ADD CONSTRAINT "parking_alerts_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_alerts" ADD CONSTRAINT "parking_alerts_vehicle_id_parking_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."parking_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_alerts" ADD CONSTRAINT "parking_alerts_cloturee_par_utilisateurs_id_fk" FOREIGN KEY ("cloturee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_configs" ADD CONSTRAINT "parking_configs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_vehicle_id_parking_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."parking_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_site_origine_id_parking_sites_id_fk" FOREIGN KEY ("site_origine_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_zone_origine_id_parking_zones_id_fk" FOREIGN KEY ("zone_origine_id") REFERENCES "public"."parking_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_site_destination_id_parking_sites_id_fk" FOREIGN KEY ("site_destination_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_movements" ADD CONSTRAINT "parking_movements_zone_destination_id_parking_zones_id_fk" FOREIGN KEY ("zone_destination_id") REFERENCES "public"."parking_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_sites" ADD CONSTRAINT "parking_sites_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_site_id_parking_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_zone_id_parking_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."parking_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_tasks" ADD CONSTRAINT "parking_tasks_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_tasks" ADD CONSTRAINT "parking_tasks_vehicle_id_parking_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."parking_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_tasks" ADD CONSTRAINT "parking_tasks_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicle_photos" ADD CONSTRAINT "parking_vehicle_photos_vehicle_id_parking_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."parking_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicle_photos" ADD CONSTRAINT "parking_vehicle_photos_auteur_id_utilisateurs_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicles" ADD CONSTRAINT "parking_vehicles_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicles" ADD CONSTRAINT "parking_vehicles_site_id_parking_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicles" ADD CONSTRAINT "parking_vehicles_zone_id_parking_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."parking_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_vehicles" ADD CONSTRAINT "parking_vehicles_spot_id_parking_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_site_id_parking_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."parking_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_lines" ADD CONSTRAINT "payroll_entry_lines_payroll_entry_id_payroll_entries_id_fk" FOREIGN KEY ("payroll_entry_id") REFERENCES "public"."payroll_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_snapshots" ADD CONSTRAINT "payroll_entry_snapshots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_snapshots" ADD CONSTRAINT "payroll_entry_snapshots_payroll_entry_id_payroll_entries_id_fk" FOREIGN KEY ("payroll_entry_id") REFERENCES "public"."payroll_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_snapshots" ADD CONSTRAINT "payroll_entry_snapshots_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_snapshots" ADD CONSTRAINT "payroll_entry_snapshots_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry_snapshots" ADD CONSTRAINT "payroll_entry_snapshots_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_config_history" ADD CONSTRAINT "payroll_item_config_history_item_id_payroll_items_config_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."payroll_items_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_config_history" ADD CONSTRAINT "payroll_item_config_history_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_config_history" ADD CONSTRAINT "payroll_item_config_history_changed_by_utilisateurs_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items_config" ADD CONSTRAINT "payroll_items_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_closed_by_utilisateurs_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_bonus_rules" ADD CONSTRAINT "performance_bonus_rules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_affectations" ADD CONSTRAINT "planning_affectations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_affectations" ADD CONSTRAINT "planning_affectations_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_affectations" ADD CONSTRAINT "planning_affectations_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_snapshots" ADD CONSTRAINT "planning_snapshots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_snapshots" ADD CONSTRAINT "planning_snapshots_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_skills" ADD CONSTRAINT "position_skills_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_skills" ADD CONSTRAINT "position_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postes_vente" ADD CONSTRAINT "postes_vente_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postes_vente" ADD CONSTRAINT "postes_vente_emplacement_id_emplacements_id_fk" FOREIGN KEY ("emplacement_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prets_outils" ADD CONSTRAINT "prets_outils_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prets_outils" ADD CONSTRAINT "prets_outils_outil_id_produits_id_fk" FOREIGN KEY ("outil_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prets_outils" ADD CONSTRAINT "prets_outils_technicien_id_employes_id_fk" FOREIGN KEY ("technicien_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prets_outils" ADD CONSTRAINT "prets_outils_sortie_par_employes_id_fk" FOREIGN KEY ("sortie_par") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prets_outils" ADD CONSTRAINT "prets_outils_retourne_par_employes_id_fk" FOREIGN KEY ("retourne_par") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previsions_tresorerie" ADD CONSTRAINT "previsions_tresorerie_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_articles" ADD CONSTRAINT "produit_articles_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_references" ADD CONSTRAINT "produit_references_variante_id_produits_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_references_equiv" ADD CONSTRAINT "produit_references_equiv_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_substitutions" ADD CONSTRAINT "produit_substitutions_variante_a_id_produits_id_fk" FOREIGN KEY ("variante_a_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_substitutions" ADD CONSTRAINT "produit_substitutions_variante_b_id_produits_id_fk" FOREIGN KEY ("variante_b_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_substitutions" ADD CONSTRAINT "produit_substitutions_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_supersessions" ADD CONSTRAINT "produit_supersessions_ancienne_variante_id_produits_id_fk" FOREIGN KEY ("ancienne_variante_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_supersessions" ADD CONSTRAINT "produit_supersessions_nouvelle_variante_id_produits_id_fk" FOREIGN KEY ("nouvelle_variante_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_parent_id_produit_unites_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."produit_unites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_article_id_produit_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."produit_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_unite_base_id_unites_mesure_id_fk" FOREIGN KEY ("unite_base_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_modele_emballage_id_modeles_emballage_id_fk" FOREIGN KEY ("modele_emballage_id") REFERENCES "public"."modeles_emballage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_emplacement_principal_id_emplacements_id_fk" FOREIGN KEY ("emplacement_principal_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_responsable_id_employes_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_unite_conditionnement_unites_mesure_id_fk" FOREIGN KEY ("unite_conditionnement") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats" ADD CONSTRAINT "rachats_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats" ADD CONSTRAINT "rachats_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_rachat_id_rachats_id_fk" FOREIGN KEY ("rachat_id") REFERENCES "public"."rachats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_vente_ligne_id_ventes_lignes_id_fk" FOREIGN KEY ("vente_ligne_id") REFERENCES "public"."ventes_lignes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_produit_source_id_produits_id_fk" FOREIGN KEY ("produit_source_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_unite_source_id_unites_mesure_id_fk" FOREIGN KEY ("unite_source_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_produit_cible_id_produits_id_fk" FOREIGN KEY ("produit_cible_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_unite_cible_id_unites_mesure_id_fk" FOREIGN KEY ("unite_cible_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regles_automatisation" ADD CONSTRAINT "regles_automatisation_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regles_tarification" ADD CONSTRAINT "regles_tarification_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regles_tarification" ADD CONSTRAINT "regles_tarification_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relances" ADD CONSTRAINT "relances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relances" ADD CONSTRAINT "relances_dette_id_dettes_clients_id_fk" FOREIGN KEY ("dette_id") REFERENCES "public"."dettes_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relances" ADD CONSTRAINT "relances_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relances" ADD CONSTRAINT "relances_dette_fournisseur_id_dettes_fournisseurs_id_fk" FOREIGN KEY ("dette_fournisseur_id") REFERENCES "public"."dettes_fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relances" ADD CONSTRAINT "relances_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_dettes" ADD CONSTRAINT "remboursements_dettes_dette_id_dettes_clients_id_fk" FOREIGN KEY ("dette_id") REFERENCES "public"."dettes_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_fournisseurs" ADD CONSTRAINT "remboursements_fournisseurs_dette_id_dettes_fournisseurs_id_fk" FOREIGN KEY ("dette_id") REFERENCES "public"."dettes_fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_fournisseurs" ADD CONSTRAINT "remboursements_fournisseurs_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours" ADD CONSTRAINT "retours_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours" ADD CONSTRAINT "retours_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours" ADD CONSTRAINT "retours_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_bon_reception_id_bons_reception_id_fk" FOREIGN KEY ("bon_reception_id") REFERENCES "public"."bons_reception"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_or_id_ordres_reparation_id_fk" FOREIGN KEY ("or_id") REFERENCES "public"."ordres_reparation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur" ADD CONSTRAINT "retours_fournisseur_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur_lignes" ADD CONSTRAINT "retours_fournisseur_lignes_retour_id_retours_fournisseur_id_fk" FOREIGN KEY ("retour_id") REFERENCES "public"."retours_fournisseur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retours_fournisseur_lignes" ADD CONSTRAINT "retours_fournisseur_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justification_decisions" ADD CONSTRAINT "rh_absence_justification_decisions_justification_id_rh_absence_justifications_id_fk" FOREIGN KEY ("justification_id") REFERENCES "public"."rh_absence_justifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justification_decisions" ADD CONSTRAINT "rh_absence_justification_decisions_acteur_id_utilisateurs_id_fk" FOREIGN KEY ("acteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justifications" ADD CONSTRAINT "rh_absence_justifications_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justifications" ADD CONSTRAINT "rh_absence_justifications_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justifications" ADD CONSTRAINT "rh_absence_justifications_depose_par_utilisateurs_id_fk" FOREIGN KEY ("depose_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_absence_justifications" ADD CONSTRAINT "rh_absence_justifications_decision_par_utilisateurs_id_fk" FOREIGN KEY ("decision_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rh_audit_logs" ADD CONSTRAINT "rh_audit_logs_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_sanction_type_id_hr_sanction_types_id_fk" FOREIGN KEY ("sanction_type_id") REFERENCES "public"."hr_sanction_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_standards" ADD CONSTRAINT "services_standards_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_ouvert_par_utilisateurs_id_fk" FOREIGN KEY ("ouvert_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_ferme_par_utilisateurs_id_fk" FOREIGN KEY ("ferme_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_emplacement_id_emplacements_id_fk" FOREIGN KEY ("emplacement_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_unite_reference_id_unites_mesure_id_fk" FOREIGN KEY ("unite_reference_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_lots" ADD CONSTRAINT "stocks_lots_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_lots" ADD CONSTRAINT "stocks_lots_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_lots" ADD CONSTRAINT "stocks_lots_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_unites" ADD CONSTRAINT "stocks_unites_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_unites" ADD CONSTRAINT "stocks_unites_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks_unites" ADD CONSTRAINT "stocks_unites_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_ingests" ADD CONSTRAINT "sync_ingests_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifs" ADD CONSTRAINT "tarifs_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_audit" ADD CONSTRAINT "tenant_audit_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_licences" ADD CONSTRAINT "tenant_licences_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_paiements" ADD CONSTRAINT "tenant_paiements_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_paiements" ADD CONSTRAINT "tenant_paiements_licence_id_tenant_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."tenant_licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_relances" ADD CONSTRAINT "tenant_relances_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_snapshots" ADD CONSTRAINT "tenant_snapshots_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_site_id_tenant_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tenant_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_employee_id_employes_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_utilisateurs_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_caisses" ADD CONSTRAINT "transferts_caisses_caisse_source_id_caisses_id_fk" FOREIGN KEY ("caisse_source_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_caisses" ADD CONSTRAINT "transferts_caisses_caisse_dest_id_caisses_id_fk" FOREIGN KEY ("caisse_dest_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_caisses" ADD CONSTRAINT "transferts_caisses_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_caisses" ADD CONSTRAINT "transferts_caisses_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_caisses" ADD CONSTRAINT "transferts_caisses_approuve_par_utilisateurs_id_fk" FOREIGN KEY ("approuve_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_depuis_agence_id_agences_id_fk" FOREIGN KEY ("depuis_agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_vers_agence_id_agences_id_fk" FOREIGN KEY ("vers_agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_expedie_par_utilisateurs_id_fk" FOREIGN KEY ("expedie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_recu_par_utilisateurs_id_fk" FOREIGN KEY ("recu_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux_export" ADD CONSTRAINT "travaux_export_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux_export" ADD CONSTRAINT "travaux_export_demande_par_user_id_utilisateurs_id_fk" FOREIGN KEY ("demande_par_user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_conversions" ADD CONSTRAINT "unites_conversions_domaine_id_unites_domaines_id_fk" FOREIGN KEY ("domaine_id") REFERENCES "public"."unites_domaines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_conversions" ADD CONSTRAINT "unites_conversions_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_domaines" ADD CONSTRAINT "unites_domaines_unite_base_id_unites_mesure_id_fk" FOREIGN KEY ("unite_base_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_mesure_produits" ADD CONSTRAINT "unites_mesure_produits_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_mesure_produits" ADD CONSTRAINT "unites_mesure_produits_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_avoir_id_avoirs_id_fk" FOREIGN KEY ("avoir_id") REFERENCES "public"."avoirs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variante_attributs" ADD CONSTRAINT "variante_attributs_variante_id_produits_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variante_attributs" ADD CONSTRAINT "variante_attributs_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variante_attributs" ADD CONSTRAINT "variante_attributs_source_par_utilisateurs_id_fk" FOREIGN KEY ("source_par") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicules" ADD CONSTRAINT "vehicules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicules" ADD CONSTRAINT "vehicules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicules" ADD CONSTRAINT "vehicules_site_id_agences_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_operateur_id_utilisateurs_id_fk" FOREIGN KEY ("operateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_session_caisse_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_vente_id_origine_ventes_id_fk" FOREIGN KEY ("vente_id_origine") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_lignes" ADD CONSTRAINT "ventes_lignes_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_lignes" ADD CONSTRAINT "ventes_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_lignes" ADD CONSTRAINT "ventes_lignes_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_lignes" ADD CONSTRAINT "ventes_lignes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_archives_entity" ON "archives" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_archives_agence" ON "archives" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_archives_created" ON "archives" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "unq_attribut_definition_scope" ON "attribut_definitions" USING btree ("categorie_id","cle");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_guide_cat" ON "guide_categories" USING btree ("categorie_id","type_produit");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_guide_alias_active" ON "guide_search_aliases" USING btree ("alias","type");--> statement-breakpoint
CREATE INDEX "rh_absence_justification_decisions_justification_idx" ON "rh_absence_justification_decisions" USING btree ("justification_id");--> statement-breakpoint
CREATE INDEX "rh_absence_justification_decisions_agence_created_idx" ON "rh_absence_justification_decisions" USING btree ("agence_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rh_absence_justifications_employe_date_uidx" ON "rh_absence_justifications" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "rh_absence_justifications_agence_date_idx" ON "rh_absence_justifications" USING btree ("agence_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_unites_conversions_domaine_unite" ON "unites_conversions" USING btree ("domaine_id","unite_id");
--> statement-breakpoint
CREATE VIEW "parking_spots_v" AS SELECT s.id, s.agence_id, s.site_id, s.zone_id, s.code, s.geometrie, s.longueur, s.largeur, s.rotation, s.ordre, s.is_active, s.bloque, s.reserve_pour, s.created_at, s.updated_at, v.id AS vehicule_id, CASE WHEN s.bloque THEN 'BLOQUE' WHEN v.id IS NOT NULL THEN 'OCCUPE' WHEN s.reserve_pour IS NOT NULL THEN 'RESERVE' ELSE 'LIBRE' END AS statut FROM parking_spots s LEFT JOIN parking_vehicles v ON v.spot_id = s.id AND v.statut <> 'SORTI';