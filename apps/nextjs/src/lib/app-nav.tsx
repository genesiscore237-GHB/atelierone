import type { LucideIcon } from "lucide-react";
import {
  Settings,
  UserCog,
  ScrollText,
  LayoutDashboard,
  SlidersHorizontal,
  UserRound,
  Fingerprint,
  CalendarOff,
  Wallet,
  Star,
  GraduationCap,
  Gavel,
  FolderOpen,
  CircleHelp,
  Users,
  FileSignature,
  Car,
  Wrench,
  CalendarClock,
  Timer,
  Package,
  ListOrdered,
  ShoppingCart,
  PackageCheck,
  Building2,
  ClipboardList,
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
  Warehouse,
  HandCoins,
  Network,
} from "lucide-react";

export interface SubMenu {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  moduleId?: string;
}

export interface AppModule {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  moduleId?: string;
  subs?: SubMenu[];
}

export interface AppDomain {
  id: string;
  label: string;
  short: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  desc: string;
  href: string;
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
        id: "atelier-vehicules",
        label: "Véhicules",
        href: "/dashboard/vehicules",
        icon: Car,
        desc: "Fiche, historique, statuts d'immobilisation",
        moduleId: "vehicules",
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
        href: "/dashboard/planning",
        icon: CalendarClock,
        desc: "Charge, techniciens, priorités",
        moduleId: "planning",
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
    id: "stock",
    label: "Stock & Approvisionnement",
    short: "Stock",
    icon: Warehouse,
    color: "text-[var(--module-stock)]",
    bg: "bg-[var(--module-stock-bg)]",
    desc: "Pièces, mouvements, commandes, fournisseurs, inventaire",
    href: "/dashboard/stock",
    modules: [
      {
        id: "stock-articles",
        label: "Articles / Catalogue",
        href: "/dashboard/catalog",
        icon: Package,
        desc: "Pièces auto, catégories, prix, seuils",
        moduleId: "catalog",
      },
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
        label: "Fournisseurs",
        href: "/dashboard/suppliers",
        icon: Building2,
        desc: "Fiches, délais, conditions",
        moduleId: "suppliers",
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
          id: "stock-apercu",
          label: "Vue d'ensemble",
          href: "/dashboard/stock/apercu",
          icon: LayoutDashboard,
          desc: "Indicateurs, alertes, stocks dormants",
          moduleId: "stock",
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
        label: "Emplacements",
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
        label: "Transferts",
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
