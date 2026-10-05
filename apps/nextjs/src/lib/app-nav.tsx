import type { LucideIcon } from "lucide-react";
import {
  Settings,
  UserCog,
  ScrollText,
  LayoutDashboard,
  SlidersHorizontal,
  Settings2,
  UserRound,
  Fingerprint,
  CalendarOff,
  Wallet,
  Star,
  GraduationCap,
  Gavel,
  CalendarRange,
  Phone,
  FolderOpen,
  CircleHelp,
  Users,
  FileSignature,
  Car,
  Wrench,
  CalendarClock,
  Timer,
  Activity,
  Package,
  ListOrdered,
  ShoppingCart,
  PackageCheck,
  Building2,
  ClipboardList,
  ClipboardCheck,
  BookOpen,
  FileText,
  Banknote,
  Percent,
  MapPin,
  ParkingCircle,
  ArrowLeftRight,
  Gauge,
  BarChart3,
  ShieldCheck,
  KeyRound,
  Hammer,
  Clock,
  Warehouse,
  HandCoins,
  Network,
  BellRing,
  SearchCheck,
  Boxes,
  Cog,
  ScanSearch,
} from "lucide-react";

// ── DEV / PROD visibility ─────────────────────────────────────────────────────
// - "validé"        : visible en prod et en dev.
// - "enConstruction": visible uniquement en développement (badge DEV).
// - "refactoring"   : masqué de toute navigation (écran legacy en instance
//                     de remplacement par le nouveau module, cf. roadmap CAT).
export type ModuleStatus = "validé" | "enConstruction" | "refactoring";

export function isDev(): boolean {
  if (typeof window === "undefined") return process.env.NODE_ENV === "development";
  return process.env.NODE_ENV === "development";
}

export function moduleVisible(status?: ModuleStatus): boolean {
  return !status || status === "validé" || (status === "enConstruction" && isDev());
}

// ── Navigation types ──────────────────────────────────────────────────────────

export interface SubMenu {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  moduleId?: string;
  status?: ModuleStatus;
}

export interface AppModule {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  moduleId?: string;
  subs?: SubMenu[];
  status?: ModuleStatus;
}

export interface AppDomain {
  id: string;
  label: string;
  short: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  desc: string;
  /** Route active pour le domaine (vérification isDomainActive). */
  href: string;
  /** Route de la page d'accueil du domaine (auto "Vue d'ensemble" sidebar). Si absent, utilise href. */
  homeHref?: string;
  modules: AppModule[];
}

export const DOMAINS: AppDomain[] = [
  {
    id: "administration",
    label: "Socle & Administration",
    short: "Administration",
    icon: ShieldCheck,
    color: "text-[var(--module-governance)]",
    bg: "bg-[var(--module-governance-bg)]",
    desc: "Paramétrage, utilisateurs & rôles, journal d'audit",
    href: "/dashboard/administration",
    modules: [
      {
        id: "mon-abonnement",
        label: "Mon abonnement",
        href: "/dashboard/mon-abonnement",
        icon: KeyRound,
        desc: "Licence, paiements, synchronisation, version du pack",
        moduleId: "saas",
      },
      {
        id: "parametrage",
        label: "Paramétrage général",
        href: "/dashboard/settings",
        icon: Settings,
        desc: "Agence, devise, TVA, préfixes, thème, horaires",
        moduleId: "settings",
      },
      {
        id: "utilisateurs",
        label: "Utilisateurs & Rôles",
        href: "/dashboard/governance",
        icon: UserCog,
        desc: "Comptes, invitations, permissions fines",
        moduleId: "governance",
        subs: [
          { id: "gouv-utilisateurs", label: "Utilisateurs", href: "/dashboard/governance", icon: UserRound, desc: "Comptes et invitations", moduleId: "governance" },
          { id: "gouv-roles", label: "Rôles", href: "/dashboard/governance/roles", icon: ShieldCheck, desc: "Création et gestion des rôles", moduleId: "governance" },
          { id: "gouv-matrice", label: "Matrice des permissions", href: "/dashboard/governance/matrix", icon: Gauge, desc: "Matrice rôle × permission", moduleId: "governance" },
          { id: "gouv-audit", label: "Connexions & activité", href: "/dashboard/governance/audit", icon: ScrollText, desc: "Logs de connexion et actions", moduleId: "governance" },
        ],
      },
      {
        id: "audit",
        label: "Journal d'audit",
        href: "/dashboard/audit",
        icon: ScrollText,
        desc: "Traçabilité : qui a fait quoi, quand",
        moduleId: "audit",
      },
    ],
  },
  {
    id: "rh",
    label: "Personnel (RH)",
    short: "RH",
    icon: UserRound,
    color: "text-[var(--module-rh)]",
    bg: "bg-[var(--module-rh-bg)]",
    desc: "Gestion 360° des employés : paie, présence, compétences",
    href: "/dashboard/rh",
    modules: [
      {
        id: "rh-dashboard",
        label: "Tableau de bord RH",
        href: "/dashboard/rh/tableau-de-bord",
        icon: LayoutDashboard,
        desc: "Effectifs, présence, alertes, masse salariale",
        moduleId: "rh",
      },
      {
        id: "rh-parametrage",
        label: "Paramétrage RH",
        href: "/dashboard/rh/parametrage",
        icon: SlidersHorizontal,
        desc: "Horaires, cycles, congés, sanctions, tolérances",
        moduleId: "rh",
      },
      {
        id: "rh-employes",
        label: "Fiches employés",
        href: "/dashboard/rh/employes",
        icon: UserRound,
        desc: "Identité, contrat, poste, historique",
        moduleId: "rh",
      },
      {
        id: "rh-pointage-direct",
        label: "Pointage en direct",
        href: "/dashboard/rh/pointage-en-direct",
        icon: Clock,
        desc: "Qui travaille, en pause, en mission — posture temps réel + salaire sur période",
        moduleId: "rh",
      },
      {
        id: "rh-presences",
        label: "Présences",
        href: "/dashboard/rh/presences",
        icon: Fingerprint,
        desc: "Pointage, heures, retards, heures sup.",
        moduleId: "rh",
      },
      {
        id: "rh-absences",
        label: "Congés & Absences",
        href: "/dashboard/rh/absences",
        icon: CalendarOff,
        desc: "Demandes, soldes, validation",
        moduleId: "rh",
      },
      {
        id: "rh-organigramme",
        label: "Organigramme",
        href: "/dashboard/rh/organigramme",
        icon: Network,
        desc: "Arbre hiérarchique du garage (rapporte à)",
        moduleId: "rh",
      },
      {
        id: "rh-paie",
        label: "Paie",
        href: "/dashboard/rh/paie",
        icon: Wallet,
        desc: "Base + primes + HS – retenues → bulletin",
        moduleId: "rh",
      },
      {
        id: "rh-situation",
        label: "Situation RH & Paie",
        href: "/dashboard/rh/situation",
        icon: ScanSearch,
        desc: "Analyse de période : présence, rémunération, avances, anomalies",
        moduleId: "rh",
      },
      {
        id: "rh-rapports",
        label: "Rapports",
        href: "/dashboard/rh/rapports",
        icon: FileText,
        desc: "États RH (personnel, présences, paie, avances, historique) : écran, impression, PDF, Excel",
        moduleId: "rh",
      },
      {
        id: "rh-evaluations",
        label: "Évaluation & Performance",
        href: "/dashboard/rh/evaluations",
        icon: Star,
        desc: "Grilles, notes, prime de performance",
        moduleId: "rh",
      },
      {
        id: "rh-competences",
        label: "Compétences & Formations",
        href: "/dashboard/rh/competences",
        icon: GraduationCap,
        desc: "Matrice, écarts, plan de formation",
        moduleId: "rh",
      },
      {
        id: "rh-sanctions",
        label: "Disciplinaire",
        href: "/dashboard/rh/sanctions",
        icon: Gavel,
        desc: "Incidents, sanctions proportionnelles",
        moduleId: "rh",
      },
      {
        id: "rh-planning",
        label: "Planning",
        href: "/dashboard/rh/planning",
        icon: CalendarRange,
        desc: "Affectations hebdomadaires (Atelier, Magasin, Congé…)",
        moduleId: "rh",
      },
      {
        id: "rh-contrats",
        label: "Contrats",
        href: "/dashboard/rh/contrats",
        icon: FileSignature,
        desc: "Types, période d'essai, avantages, renouvellements",
        moduleId: "rh",
      },
      {
        id: "rh-annuaire",
        label: "Annuaire",
        href: "/dashboard/rh/annuaire",
        icon: Phone,
        desc: "Contacts internes automatiques (employés actifs)",
        moduleId: "rh",
      },
      {
        id: "rh-documents",
        label: "Documents RH",
        href: "/dashboard/rh/documents",
        icon: FolderOpen,
        desc: "Contrats, pièces, certificats, expirations",
        moduleId: "rh",
      },
      {
        id: "rh-aide",
        label: "Aide & Documentation",
        href: "/dashboard/rh/aide",
        icon: CircleHelp,
        desc: "Guide utilisateur, fiches, parcours de prise en main",
        moduleId: "rh",
      },
    ],
  },
  {
    id: "clients",
    label: "Clients & Contrats",
    short: "Clients",
    icon: Users,
    color: "text-[var(--module-customers)]",
    bg: "bg-[var(--module-customers-bg)]",
    desc: "Fiches clients et contrats de maintenance flotte",
    href: "/dashboard/clients",
    modules: [
      {
        id: "clients-fiches",
        label: "Clients",
        href: "/dashboard/customers",
        icon: Users,
        desc: "Particuliers, entreprises, contrat de maintenance",
        moduleId: "customers",
      },
      {
        id: "clients-contrats",
        label: "Contrats flottes",
        href: "/dashboard/contrats",
        icon: FileSignature,
        desc: "Maintenance, véhicules rattachés, échéances",
        moduleId: "contrats",
      },
    ],
  },
  {
    id: "atelier",
    label: "Véhicules & Atelier",
    short: "Atelier",
    icon: Wrench,
    color: "text-[var(--module-or)]",
    bg: "bg-[var(--module-or-bg)]",
    desc: "Cœur métier : véhicules, ordres de réparation, planning",
    href: "/dashboard/atelier",
    modules: [
      {
        id: "atelier-reception",
        label: "Réception véhicule",
        href: "/dashboard/atelier/reception",
        icon: ClipboardCheck,
        desc: "Fiche de réception : véhicule, client, outillage, pannes, photos",
        moduleId: "atelier",
      },
      {
        id: "atelier-vehicules",
        label: "Véhicules",
        href: "/dashboard/vehicules",
        icon: Car,
        desc: "Fiche, historique, statuts d'immobilisation",
        moduleId: "vehicules",
      },
      {
        id: "atelier-parc",
        label: "Pilotage du parc",
        href: "/dashboard/atelier/parc",
        icon: LayoutDashboard,
        desc: "Priorités, alertes, statuts — tableau de bord en temps réel",
        moduleId: "or",
      },
      {
        id: "atelier-or",
        label: "Ordres de Réparation",
        href: "/dashboard/ordres-reparation",
        icon: Wrench,
        desc: "Plainte → diagnostic → devis → contrôle → facture",
        moduleId: "or",
      },
      {
        id: "atelier-planning",
        label: "Planning atelier",
        href: "/dashboard/atelier/planning",
        icon: CalendarClock,
        desc: "Charge des techniciens, affectations du jour",
        moduleId: "planning",
      },
      {
        id: "atelier-parametres",
        label: "Paramètres parc",
        href: "/dashboard/atelier/parametres",
        icon: Settings2,
        desc: "Seuils d'alerte, emplacements, raisons de blocage",
        moduleId: "or",
      },
      {
        id: "atelier-interventions",
        label: "Interventions & Temps",
        href: "/dashboard/atelier/interventions",
        icon: Timer,
        desc: "Qui a travaillé sur quoi, combien de temps",
        moduleId: "interventions",
      },
    ],
  },
  {
    id: "garage",
    label: "Garage & Parking",
    short: "Garage",
    icon: ParkingCircle,
    color: "text-[var(--module-vehicules)]",
    bg: "bg-[var(--module-vehicules-bg)]",
    desc: "Plan du parc, stationnement des véhicules immobilisés, alertes",
    href: "/dashboard/garage",
    homeHref: "/dashboard/garage",
    modules: [
      {
        id: "garage-accueil",
        label: "Accueil parking",
        href: "/dashboard/garage",
        icon: LayoutDashboard,
        desc: "Vue d'ensemble : occupation, véhicules présents, alertes",
        moduleId: "garage",
      },
      {
        id: "garage-carte",
        label: "Carte du parc",
        href: "/dashboard/garage/carte",
        icon: MapPin,
        desc: "Plan interactif : zones, emplacements, véhicules positionnés",
        moduleId: "garage",
      },
      {
        id: "garage-vehicules",
        label: "Registre véhicules",
        href: "/dashboard/garage/vehicules",
        icon: Car,
        desc: "Registre des véhicules immobilisés (num 1-48)",
        moduleId: "garage",
      },
      {
        id: "garage-alertes",
        label: "Alertes parking",
        href: "/dashboard/garage/alertes",
        icon: BellRing,
        desc: "Alertes : prêt pour sortie, attente client, immobilisation longue",
        moduleId: "garage",
      },
      {
        id: "garage-config",
        label: "Configuration parking",
        href: "/dashboard/garage/configuration",
        icon: Settings2,
        desc: "Seuils du moteur d'alertes, marges de sécurité par défaut",
        moduleId: "garage",
      },
    ],
  },
  {
    id: "performance",
    label: "Performance & Qualité",
    short: "Performance",
    icon: Activity,
    color: "text-[var(--module-perf)]",
    bg: "bg-[var(--module-perf-bg)]",
    desc: "Santé du garage en temps réel — KPIs, SAV, facturation, décisions",
    href: "/dashboard/atelier/performance",
    modules: [
      {
        id: "perf-dashboard",
        label: "Tableau de bord direction",
        href: "/dashboard/atelier/performance",
        icon: Activity,
        desc: "Santé globale, alertes critiques, point matinal, facturation",
        moduleId: "or",
      },
      {
        id: "perf-sante",
        label: "Santé du garage",
        href: "/dashboard/atelier/performance?tab=sante",
        icon: Gauge,
        desc: "KPIs feu tricolore vs cibles, top anciens du parc",
        moduleId: "or",
      },
      {
        id: "perf-sav",
        label: "Qualité & SAV",
        href: "/dashboard/atelier/performance?tab=sav",
        icon: ShieldCheck,
        desc: "Retours SAV par cause, comebacks, satisfaction client",
        moduleId: "or",
      },
      {
        id: "perf-delais",
        label: "Compétitivité délais",
        href: "/dashboard/atelier/performance?tab=delais",
        icon: Timer,
        desc: "Délais vs standards, comparaison atelier",
        moduleId: "or",
      },
    ],
  },
  // ── CATALOGUE ──────────────────────────────────────────────────────────────
  // Règle : L'URL technique ≠ le domaine métier. Le `domainId` fait foi pour
  // nav/breadcrumb/tabs/permissions/analytics, pas le chemin URL.
  // /dashboard/stock/outillage reste l'URL historique mais l'Outillage
  // appartient fonctionnellement au Catalogue.
  {
    id: "catalogue",
    label: "Catalogue",
    short: "Catalogue",
    icon: Boxes,
    color: "text-[var(--module-catalog)]",
    bg: "bg-[var(--module-catalog-bg)]",
    desc: "Référentiel des pièces, consommables, outils, équipements et services",
    href: "/dashboard/catalog",
    homeHref: "/dashboard/catalog/dashboard",
    modules: [
      {
        id: "catalog-articles",
        label: "Articles",
        href: "/dashboard/catalog/articles",
        icon: Package,
        desc: "Pièces, consommables, kits — références et variantes",
        moduleId: "catalog",
        subs: [
          { id: "cat-pieces", label: "Pièces", href: "/dashboard/catalog/articles?type=PIECE", icon: Package, desc: "Pièces de rechange", moduleId: "catalog" },
          { id: "cat-consommables", label: "Consommables", href: "/dashboard/catalog/articles?type=CONSOMMABLE", icon: Package, desc: "Huiles, fluides, consommables", moduleId: "catalog" },
          { id: "cat-kits", label: "Kits", href: "/dashboard/catalog/articles?type=KIT", icon: Package, desc: "Kits et ensembles", moduleId: "catalog" },
          { id: "cat-tous", label: "Tous les articles", href: "/dashboard/catalog/articles", icon: Package, desc: "Liste complète", moduleId: "catalog" },
        ],
      },
      {
        id: "catalog-outillage",
        label: "Outillage & Matériel",
        href: "/dashboard/stock/outillage",
        icon: Hammer,
        desc: "Modèles, exemplaires, prêts, retour, maintenance, calibration",
        moduleId: "outillage",
        subs: [
          { id: "cat-out-modeles", label: "Modèles", href: "/dashboard/stock/outillage?tab=modeles", icon: Hammer, desc: "Modèles d'outils", moduleId: "outillage" },
          { id: "cat-out-exemplaires", label: "Exemplaires", href: "/dashboard/stock/outillage?tab=exemplaires", icon: Hammer, desc: "Unités physiques", moduleId: "outillage" },
          { id: "cat-out-prets", label: "Prêts", href: "/dashboard/stock/outillage?tab=prets", icon: Hammer, desc: "Prêts en cours", moduleId: "outillage" },
          { id: "cat-out-retours", label: "Retours", href: "/dashboard/stock/outillage?tab=retours", icon: Hammer, desc: "Retours à traiter", moduleId: "outillage" },
          { id: "cat-out-maintenance", label: "Maintenance", href: "/dashboard/stock/outillage?tab=maintenance", icon: Hammer, desc: "Maintenance préventive et curative", moduleId: "outillage" },
          { id: "cat-out-calibration", label: "Calibration", href: "/dashboard/stock/outillage?tab=calibration", icon: Hammer, desc: "Calibration des instruments", moduleId: "outillage" },
        ],
      },
      {
        id: "catalog-equipements",
        label: "Équipements",
        href: "/dashboard/catalog/equipements",
        icon: Cog,
        desc: "Parc d'équipements, maintenance, inspections",
        moduleId: "equipements",
        status: "enConstruction",
      },
      {
        id: "catalog-services",
        label: "Services",
        href: "/dashboard/catalog/services",
        icon: Network,
        desc: "Services et prestations",
        moduleId: "services",
        status: "enConstruction",
      },
      {
        id: "catalog-referentiel",
        label: "Référentiel",
        href: "/dashboard/catalog/categories",
        icon: BookOpen,
        desc: "Catégories, attributs, ontologie",
        moduleId: "catalog",
        // Legacy : à refondre dans le module CAT (catégories, attributs, marques).
        status: "refactoring",
        subs: [
          { id: "cat-ref-categories", label: "Catégories", href: "/dashboard/catalog/categories", icon: BookOpen, desc: "Arbre de catégories", moduleId: "catalog" },
          { id: "cat-ref-ontologie", label: "Attributs & Ontologie", href: "/dashboard/catalog/ontologie", icon: BookOpen, desc: "Attributs techniques dynamiques", moduleId: "catalog" },
          { id: "cat-ref-marques", label: "Marques", href: "/dashboard/catalog/referentiel/marques", icon: BookOpen, desc: "Gestion des marques", moduleId: "catalog", status: "enConstruction" },
          { id: "cat-ref-unites", label: "Unités", href: "/dashboard/catalog/referentiel/unites", icon: BookOpen, desc: "Unités de mesure", moduleId: "catalog", status: "enConstruction" },
          { id: "cat-ref-relations", label: "Relations", href: "/dashboard/catalog/referentiel/relations", icon: BookOpen, desc: "Relations entre variantes", moduleId: "catalog", status: "enConstruction" },
        ],
      },
      {
        id: "catalog-aide",
        label: "Aide à la saisie",
        href: "/dashboard/catalog/aide",
        icon: CircleHelp,
        desc: "Tapez un nom de pièce, obtenez la fiche métier complète avant d'enregistrer",
        moduleId: "catalog",
      },
      {
        id: "catalog-recherche",
        label: "Recherche",
        href: "/dashboard/catalog/recherche",
        icon: SearchCheck,
        desc: "Recherche multi-critères dans le catalogue",
        moduleId: "catalog",
        // Legacy : remplacé par la recherche embarquée des nouveaux écrans CAT.
        status: "refactoring",
      },
    ],
  },

  // ── STOCK & APPROVISIONNEMENT ──────────────────────────────────────────────
  // Le stock décrit la quantité, la localisation, l'état et les mouvements.
  // L'Outillage et le Catalogue ont été déplacés vers le domaine Catalogue.
  {
    id: "stock",
    label: "Stock & Approvisionnement",
    short: "Stock",
    icon: Warehouse,
    color: "text-[var(--module-stock)]",
    bg: "bg-[var(--module-stock-bg)]",
    desc: "Quantités, mouvements, commandes, emplacements, inventaire",
    href: "/dashboard/stock",
    homeHref: "/dashboard/stock/apercu",
    modules: [
      {
        id: "stock-mouvements",
        label: "Mouvements de stock",
        href: "/dashboard/stock/mouvements",
        icon: ListOrdered,
        desc: "Entrées, sorties atelier, ventes, ajustements",
        moduleId: "stock",
      },
      {
        id: "stock-commandes",
        label: "Commandes fournisseurs",
        href: "/dashboard/procurement",
        icon: ShoppingCart,
        desc: "Local + import, véhicules immobilisés",
        moduleId: "procurement",
      },
      {
        id: "stock-receptions",
        label: "Réceptions",
        href: "/dashboard/procurement/receptions",
        icon: PackageCheck,
        desc: "Contrôle à l'arrivée, mise à jour stock",
        moduleId: "procurement",
      },
      {
        id: "stock-fournisseurs",
        label: "Fournisseurs & Prestataires",
        href: "/dashboard/fournisseurs-factures",
        icon: Building2,
        desc: "Tous prestataires (pièces + services), conditions, NIU/RCCM",
        moduleId: "procurement",
      },
      {
        id: "stock-factures-fournisseurs",
        label: "Factures & Archives",
        href: "/dashboard/fournisseurs-factures?tab=factures",
        icon: FileText,
        desc: "Chaque facture payée avec scan, recherche intelligente",
        moduleId: "procurement",
      },
      {
        id: "stock-inventaire",
        label: "Inventaire",
        href: "/dashboard/stock/inventaire",
        icon: ClipboardList,
        desc: "Comptage physique, écarts, ajustements",
        moduleId: "inventory",
      },
      {
        id: "stock-emplacements",
        label: "Emplacements",
        href: "/dashboard/stock/emplacements",
        icon: MapPin,
        desc: "Rayonnage ZONE-ALLEE-RAYON-NIVEAU, contenu",
        moduleId: "stock",
      },
      {
        id: "stock-alertes",
        label: "Alertes stock",
        href: "/dashboard/stock/alertes",
        icon: BellRing,
        desc: "Ruptures, seuils, DLC, anti-vol",
        moduleId: "stock",
      },
      {
        id: "stock-chercher-commander",
        label: "Chercher avant commander",
        href: "/dashboard/stock/chercher-avant-commander",
        icon: SearchCheck,
        desc: "Vérifier le stock existant avant toute commande",
        moduleId: "stock",
      },
      {
        id: "stock-aide",
        label: "Aide & Documentation",
        href: "/dashboard/stock/aide",
        icon: CircleHelp,
        desc: "Guide utilisateur, fiches, parcours de prise en main",
        moduleId: "stock",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance & Caisse",
    short: "Finance",
    icon: HandCoins,
    color: "text-[var(--module-finance)]",
    bg: "bg-[var(--module-finance-bg)]",
    desc: "Devis, factures, encaissements, créances, comptabilité",
    href: "/dashboard/finance",
    modules: [
      {
        id: "finance-factures",
        label: "Devis & Factures",
        href: "/dashboard/finance/factures",
        icon: FileText,
        desc: "Création, validation, numérotation, PDF",
        moduleId: "factures",
      },
      {
        id: "finance-caisse",
        label: "Caisse & Encaissements",
        href: "/dashboard/cash",
        icon: Banknote,
        desc: "Espèces, OM, MoMo, virement, rapprochement",
        moduleId: "cash",
      },
      {
        id: "finance-creances",
        label: "Créances & Relances",
        href: "/dashboard/creances",
        icon: Percent,
        desc: "Soldes clients, échéances, relances",
        moduleId: "creances",
      },
      {
        id: "finance-compta",
        label: "Comptabilité de base",
        href: "/dashboard/finance/comptabilite",
        icon: BookOpen,
        desc: "Journaux, exports, préparation expert-comptable",
        moduleId: "finance",
      },
    ],
  },
  {
    id: "sites",
    label: "Espace & Sites",
    short: "Sites",
    icon: MapPin,
    color: "text-[var(--module-transfers)]",
    bg: "bg-[var(--module-transfers-bg)]",
    desc: "Emplacements, occupation des zones, transferts Site 1 ↔ 2",
    href: "/dashboard/sites",
    modules: [
      {
        id: "sites-emplacements",
        label: "Zones du parc",
        href: "/dashboard/sites/emplacements",
        icon: MapPin,
        desc: "Zones Site 1 & 2 : réception, diagnostic, réparation",
        moduleId: "sites",
      },
      {
        id: "sites-occupation",
        label: "Occupation",
        href: "/dashboard/sites/occupation",
        icon: ParkingCircle,
        desc: "Capacité, places occupées, alertes saturation",
        moduleId: "sites",
      },
      {
        id: "sites-transferts",
        label: "Transferts de véhicules",
        href: "/dashboard/sites/transferts",
        icon: ArrowLeftRight,
        desc: "Déplacements tracés Site 1 ↔ Site 2",
        moduleId: "sites",
      },
    ],
  },
  {
    id: "pilotage",
    label: "Pilotage Direction",
    short: "Pilotage",
    icon: Gauge,
    color: "text-[var(--module-analytics)]",
    bg: "bg-[var(--module-analytics-bg)]",
    desc: "Vision direction : indicateurs, alertes, rapports",
    href: "/dashboard/pilotage",
    modules: [
      {
        id: "pilotage-direction",
        label: "Tableau de bord Direction",
        href: "/dashboard/admin",
        icon: Gauge,
        desc: "Véhicules présents, immobilisations, encaissements",
        moduleId: "admin",
      },
      {
        id: "pilotage-rapports",
        label: "Rapports",
        href: "/dashboard/rapports",
        icon: BarChart3,
        desc: "Activité atelier, rentabilité, stocks, RH, exports",
        moduleId: "rapports",
      },
    ],
  },
];

export function findDomain(id: string): AppDomain | undefined {
  return DOMAINS.find((d) => d.id === id);
}

export function findDomainByPath(pathname: string): AppDomain | undefined {
  const seg = pathname.split("/")[2];
  return DOMAINS.find((d) => d.id === seg);
}

export function findModuleByPath(pathname: string): AppModule | undefined {
  for (const domain of DOMAINS) {
    const found = domain.modules.find(
      (m) => pathname === m.href || pathname.startsWith(`${m.href}/`)
    );
    if (found) return found;
  }
  return undefined;
}

/** Retourne la domainId pour un module donné (utile pour ModuleShell). */
export function findDomainIdForModule(moduleId: string): string | undefined {
  for (const domain of DOMAINS) {
    if (domain.modules.some((m) => m.id === moduleId)) return domain.id;
  }
  return undefined;
}
