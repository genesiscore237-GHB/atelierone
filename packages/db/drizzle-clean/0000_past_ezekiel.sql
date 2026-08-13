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
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" varchar(500),
	"parent_id" integer,
	"type_branche" varchar(20),
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
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"telephone" varchar(50),
	"email" varchar(255),
	"adresse" text,
	"code_client" varchar(50),
	"agence_id" integer,
	"type_client" varchar(30) DEFAULT 'particulier',
	"categorie_prix" varchar(50) DEFAULT 'public',
	"plafond_credit" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"is_active" boolean DEFAULT true,
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
CREATE TABLE "contrats" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" integer NOT NULL,
	"type_contrat" varchar(50) NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"duree_mois" integer,
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
	"type_document" varchar(50) NOT NULL,
	"titre" varchar(255),
	"fichier_url" text NOT NULL,
	"date_emission" date,
	"date_expiration" date,
	"statut" varchar(50) DEFAULT 'actif',
	"created_at" timestamp DEFAULT now()
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
CREATE TABLE "employes" (
	"id" serial PRIMARY KEY NOT NULL,
	"matricule" varchar(30) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255) NOT NULL,
	"date_naissance" date,
	"sexe" varchar(1),
	"email_personnel" varchar(255),
	"telephone" varchar(50),
	"telephone_secondaire" varchar(50),
	"adresse" text,
	"ville" varchar(100),
	"type_employe" varchar(30) DEFAULT 'permanent' NOT NULL,
	"fonction" varchar(100) NOT NULL,
	"date_embauche" date,
	"date_fin_contrat" date,
	"periode_essai_fin" date,
	"salaire_base" numeric(12, 0),
	"devise" varchar(3) DEFAULT 'XOF',
	"mode_paie" varchar(20) DEFAULT 'mensuel',
	"num_cnss" varchar(30),
	"num_compte_bancaire" varchar(50),
	"banque" varchar(100),
	"type_piece_identite" varchar(30),
	"num_piece_identite" varchar(50),
	"piece_expire_le" date,
	"diplome" varchar(255),
	"statut" varchar(20) DEFAULT 'actif',
	"photo_url" text,
	"user_id" integer,
	"agence_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employes_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "factures_fournisseur" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"fournisseur_id" integer NOT NULL,
	"achat_id" integer,
	"agence_id" integer NOT NULL,
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
	"agence_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "fournisseurs_code_unique" UNIQUE("code")
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
	"statut" varchar(20) DEFAULT 'en_cours' NOT NULL,
	"effectue_par" integer NOT NULL,
	"valide_par" integer,
	"date_debut" timestamp DEFAULT now(),
	"date_fin" timestamp,
	"notes" text
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
CREATE TABLE "ordres_reparation" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"numero" varchar(50) NOT NULL,
	"vehicule_id" integer NOT NULL,
	"client_id" integer,
	"statut" varchar(30) DEFAULT 'ouvert',
	"plainte" text,
	"diagnostic" text,
	"devis_accepte" boolean DEFAULT false,
	"date_ouverture" timestamp DEFAULT now(),
	"date_fin_prevue" date,
	"date_cloture" timestamp,
	"total_pieces" numeric(12, 2) DEFAULT '0',
	"total_main_oeuvre" numeric(12, 2) DEFAULT '0',
	"total_ttc" numeric(12, 2) DEFAULT '0',
	"vente_id" integer,
	"cree_par" integer,
	"notes" text,
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
	"type_produit" varchar(20) DEFAULT 'PIECE',
	"code_barre" varchar(100) NOT NULL,
	"nom_code" varchar(100),
	"titre" varchar(500) NOT NULL,
	"editeur" varchar(255),
	"etat" varchar(50) DEFAULT 'neuf',
	"description" text,
	"categorie_id" integer,
	"fournisseur_id" integer,
	"unite_base_id" uuid,
	"prix_vente" numeric(12, 2) NOT NULL,
	"prix_minimum_vente" numeric(12, 2),
	"prix_achat" numeric(12, 2),
	"prix_achat_reference" numeric(12, 2),
	"tva" numeric(5, 2) DEFAULT '0',
	"seuil_alerte" integer DEFAULT 5,
	"seuil_critique" integer DEFAULT 2,
	"stock_maximum" integer,
	"statut" varchar(50) DEFAULT 'actif',
	"statut_cycle_vie" varchar(20) DEFAULT 'BROUILLON',
	"date_discontinuation" timestamp,
	"motif_suspension" text,
	"modele_emballage_id" uuid,
	"unite_vente" varchar(50) DEFAULT 'unite',
	"unite_achat" varchar(50) DEFAULT 'unite',
	"marque" varchar(255),
	"reference_fabricant" varchar(255),
	"couleur" varchar(100),
	"format" varchar(50),
	"matiere_composition" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"image_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "produits_code_barre_unique" UNIQUE("code_barre")
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
	"produit_id" integer NOT NULL,
	"unite_source_id" uuid NOT NULL,
	"quantite_source" integer NOT NULL,
	"unite_cible_id" uuid NOT NULL,
	"quantite_generee" numeric(12, 2) NOT NULL,
	"facteur_conversion" integer NOT NULL,
	"effectue_par" integer NOT NULL,
	"motif" varchar(255),
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
	"type_sanction" varchar(50) NOT NULL,
	"motif" text NOT NULL,
	"gravite" varchar(20) DEFAULT 'MOYENNE',
	"date_sanction" date NOT NULL,
	"date_debut_effet" date,
	"date_fin_effet" date,
	"duree_jours" numeric(5, 1),
	"details_financiers" numeric(12, 2),
	"appliquee" boolean DEFAULT false,
	"valide_par" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"produit_id" integer NOT NULL,
	"agence_id" integer NOT NULL,
	"emplacement_id" integer,
	"lot_id" integer,
	"quantite" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantite_reservee" numeric(12, 2) DEFAULT '0',
	"quantite_rayon" numeric(12, 2) DEFAULT '0',
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
CREATE TABLE "vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"agence_id" integer NOT NULL,
	"client_id" integer,
	"immatriculation" varchar(50) NOT NULL,
	"marque" varchar(100),
	"modele" varchar(100),
	"annee" integer,
	"couleur" varchar(50),
	"numero_chassis" varchar(100),
	"kilometrage" integer,
	"carburant" varchar(30),
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
	"produit_id" integer NOT NULL,
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
ALTER TABLE "achats" ADD CONSTRAINT "achats_demandeur_id_utilisateurs_id_fk" FOREIGN KEY ("demandeur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_destination_pos_id_caisses_id_fk" FOREIGN KEY ("destination_pos_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_cloture_par_utilisateurs_id_fk" FOREIGN KEY ("cloture_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_lignes" ADD CONSTRAINT "achats_lignes_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_partenaire_id_fournisseurs_id_fk" FOREIGN KEY ("partenaire_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_agent_id_utilisateurs_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats_partenaires" ADD CONSTRAINT "achats_partenaires_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agences" ADD CONSTRAINT "agences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_resolue_par_utilisateurs_id_fk" FOREIGN KEY ("resolue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes_stock" ADD CONSTRAINT "alertes_stock_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes_stock" ADD CONSTRAINT "alertes_stock_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_demande_par_utilisateurs_id_fk" FOREIGN KEY ("demande_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approbations" ADD CONSTRAINT "approbations_approuve_par_utilisateurs_id_fk" FOREIGN KEY ("approuve_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cles_api" ADD CONSTRAINT "cles_api_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes_barres" ADD CONSTRAINT "codes_barres_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flotte_vehicules" ADD CONSTRAINT "contrats_flotte_vehicules_contrat_id_contrats_flottes_id_fk" FOREIGN KEY ("contrat_id") REFERENCES "public"."contrats_flottes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flotte_vehicules" ADD CONSTRAINT "contrats_flotte_vehicules_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flottes" ADD CONSTRAINT "contrats_flottes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_flottes" ADD CONSTRAINT "contrats_flottes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_unite_source_id_unites_mesure_id_fk" FOREIGN KEY ("unite_source_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_unite_cible_id_unites_mesure_id_fk" FOREIGN KEY ("unite_cible_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deconditionnements" ADD CONSTRAINT "deconditionnements_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_bon_reception_id_bons_reception_id_fk" FOREIGN KEY ("bon_reception_id") REFERENCES "public"."bons_reception"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_reception" ADD CONSTRAINT "ecarts_reception_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_journal" ADD CONSTRAINT "ecritures_journal_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_journal" ADD CONSTRAINT "ecritures_journal_validee_par_utilisateurs_id_fk" FOREIGN KEY ("validee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_parent_id_emplacements_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emplacements" ADD CONSTRAINT "emplacements_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alerte_id_alertes_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alertes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_reparation" ADD CONSTRAINT "ordres_reparation_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_retour_id_retours_id_fk" FOREIGN KEY ("retour_id") REFERENCES "public"."retours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pertes_financieres" ADD CONSTRAINT "pertes_financieres_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postes_vente" ADD CONSTRAINT "postes_vente_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postes_vente" ADD CONSTRAINT "postes_vente_emplacement_id_emplacements_id_fk" FOREIGN KEY ("emplacement_id") REFERENCES "public"."emplacements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previsions_tresorerie" ADD CONSTRAINT "previsions_tresorerie_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produit_unites" ADD CONSTRAINT "produit_unites_parent_id_produit_unites_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."produit_unites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_unite_base_id_unites_mesure_id_fk" FOREIGN KEY ("unite_base_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_modele_emballage_id_modeles_emballage_id_fk" FOREIGN KEY ("modele_emballage_id") REFERENCES "public"."modeles_emballage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_fournisseur_id_fournisseurs_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_fournisseurs" ADD CONSTRAINT "produits_fournisseurs_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats" ADD CONSTRAINT "rachats_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats" ADD CONSTRAINT "rachats_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_rachat_id_rachats_id_fk" FOREIGN KEY ("rachat_id") REFERENCES "public"."rachats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rachats_lignes" ADD CONSTRAINT "rachats_lignes_vente_ligne_id_ventes_lignes_id_fk" FOREIGN KEY ("vente_ligne_id") REFERENCES "public"."ventes_lignes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconditionnements" ADD CONSTRAINT "reconditionnements_unite_source_id_unites_mesure_id_fk" FOREIGN KEY ("unite_source_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_ouvert_par_utilisateurs_id_fk" FOREIGN KEY ("ouvert_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_ferme_par_utilisateurs_id_fk" FOREIGN KEY ("ferme_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "tarifs" ADD CONSTRAINT "tarifs_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "unites_mesure_produits" ADD CONSTRAINT "unites_mesure_produits_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unites_mesure_produits" ADD CONSTRAINT "unites_mesure_produits_unite_id_unites_mesure_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_mesure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_avoir_id_avoirs_id_fk" FOREIGN KEY ("avoir_id") REFERENCES "public"."avoirs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_vente_id_ventes_id_fk" FOREIGN KEY ("vente_id") REFERENCES "public"."ventes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisations_avoir" ADD CONSTRAINT "utilisations_avoir_effectue_par_utilisateurs_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_utilisateurs_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;