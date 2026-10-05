import { userRouter } from "~/server/api/routers/user";
import { settingsRouter } from "~/server/api/routers/settings";
import { catalogRouter } from "~/server/api/routers/catalog";
import { articlesRouter } from "~/server/api/routers/articles-router";
import { inventoryRouter } from "~/server/api/routers/inventory";
import { posRouter } from "~/server/api/routers/pos";
import { financeRouter } from "~/server/api/routers/finance";
import { auditRouter } from "~/server/api/routers/audit";
import { analyticsRouter } from "~/server/api/routers/analytics";
import { pricingRouter } from "~/server/api/routers/pricing";
import { procurementRouter } from "~/server/api/routers/procurement";
import { fournisseursRouter } from "~/server/api/routers/fournisseurs-router";
import { outillageRouter } from "~/server/api/routers/outillage-router";
import { licenceRouter } from "~/server/api/routers/licence-router";
import { syncRouter } from "~/server/api/routers/sync-router";
import { centralRouter } from "~/server/api/routers/central-router";
import { customersRouter } from "~/server/api/routers/customers";
import { clientsRouter } from "~/server/api/routers/clients-router";
import { contratsRouter } from "~/server/api/routers/contrats-router";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { atelierKpiRouter } from "~/server/api/routers/atelier-kpi-router";
import { returnsRouter } from "~/server/api/routers/returns";
import { loyaltyRouter } from "~/server/api/routers/loyalty";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { salesRouter } from "~/server/api/routers/sales";
import { cashRouter } from "~/server/api/routers/cash";
import { alertRouter } from "~/server/api/routers/alert";
import { organizationRouter } from "~/server/api/routers/organization";
import { governanceRouter } from "~/server/api/routers/governance";
import { rhRouter } from "~/server/api/routers/rh";
import { rhSettingsRouter } from "~/server/api/routers/rh-settings";
import { rhPresenceRouter } from "~/server/api/routers/rh-presence";
import { rhLeaveRouter } from "~/server/api/routers/rh-leave";
import { rhPayrollRouter } from "~/server/api/routers/rh-payroll";
import { rhAdvancesRouter } from "~/server/api/routers/rh-advances";
import { rhEvaluationRouter } from "~/server/api/routers/rh-evaluation";
import { rhCompetencesRouter } from "~/server/api/routers/rh-competences";
import { rhDisciplineRouter } from "~/server/api/routers/rh-discipline";
import { rhDocumentsRouter } from "~/server/api/routers/rh-documents";
import { rhDashboardRouter } from "~/server/api/routers/rh-dashboard";
import { rhReportsRouter } from "~/server/api/routers/rh-reports";
import { rhPostureRouter } from "~/server/api/routers/rh-posture";
import { rhPlanningRouter } from "~/server/api/routers/rh-planning";
import { rhPeriodeRouter } from "~/server/api/routers/rh-situation";
import { rhCentreRapportsRouter } from "~/server/api/routers/rh-centre-rapports";
import { rhSensibilisationRouter } from "~/server/api/routers/rh-sensibilisation";
import { rhJournalRouter } from "~/server/api/routers/rh-journal";
import { rhSituationsRouter } from "~/server/api/routers/rh-situations";
import { rhHistoryRouter } from "~/server/api/routers/rh-history";
import { stockRouter } from "~/server/api/routers/stock";
import { orRouter } from "~/server/api/routers/or-router";
import { garageRouter } from "~/server/api/routers/garage-router";
import { margeRouter } from "~/server/api/routers/marge";
import { profitRouter } from "~/server/api/routers/profit";
import { exportRouter } from "~/server/api/routers/export";
import { reportsRouter } from "~/server/api/routers/reports";
import { referenceRouter } from "~/server/api/routers/reference";
import { ontologyRouter } from "~/server/api/routers/ontology-router";
import { guideRouter } from "~/server/api/routers/guide-router";
import { rechercheRouter } from "~/server/api/routers/recherche";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  user: userRouter,
  // MODULE SAAS — licence (garage) et sync (garage) toujours montées ; central si APP_ROLE=central
  licence: licenceRouter,
  sync: syncRouter,
  ...(process.env.APP_ROLE === "central" ? { central: centralRouter } : {}),
  settings: settingsRouter,
  catalog: catalogRouter,
  articles: articlesRouter,
  reference: referenceRouter,
  inventory: inventoryRouter,
  pos: posRouter,
  finance: financeRouter,
  audit: auditRouter,
  analytics: analyticsRouter,
  pricing: pricingRouter,
  procurement: procurementRouter,
  fournisseurs: fournisseursRouter,
  outillage: outillageRouter,
  customers: customersRouter,
  clients: clientsRouter,
  contrats: contratsRouter,
  vehicules: vehiculesRouter,
  atelierKpi: atelierKpiRouter,
  returns: returnsRouter,
  loyalty: loyaltyRouter,
  dashboard: dashboardRouter,
  sales: salesRouter,
  cash: cashRouter,
  alert: alertRouter,
  organization: organizationRouter,
  governance: governanceRouter,
  rh: rhRouter,
  rhSettings: rhSettingsRouter,
  rhPresence: rhPresenceRouter,
  rhPosture: rhPostureRouter,
  rhLeave: rhLeaveRouter,
  rhPayroll: rhPayrollRouter,
  rhAdvances: rhAdvancesRouter,
  rhEvaluation: rhEvaluationRouter,
  rhCompetences: rhCompetencesRouter,
  rhDiscipline: rhDisciplineRouter,
  rhDocuments: rhDocumentsRouter,
  rhDashboard: rhDashboardRouter,
  rhReports: rhReportsRouter,
  rhPlanning: rhPlanningRouter,
  rhPeriode: rhPeriodeRouter,
  rhCentreRapports: rhCentreRapportsRouter,
  rhSensibilisation: rhSensibilisationRouter,
rhJournal: rhJournalRouter,
  rhSituations: rhSituationsRouter,
  rhHistory: rhHistoryRouter,
  stock: stockRouter,
  or: orRouter,
  garage: garageRouter,
  marge: margeRouter,
  profit: profitRouter,
  export: exportRouter,
  reports: reportsRouter,
  ontology: ontologyRouter,
  guide: guideRouter,
  recherche: rechercheRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
