import { userRouter } from "~/server/api/routers/user";
import { settingsRouter } from "~/server/api/routers/settings";
import { catalogRouter } from "~/server/api/routers/catalog";
import { inventoryRouter } from "~/server/api/routers/inventory";
import { posRouter } from "~/server/api/routers/pos";
import { financeRouter } from "~/server/api/routers/finance";
import { auditRouter } from "~/server/api/routers/audit";
import { analyticsRouter } from "~/server/api/routers/analytics";
import { pricingRouter } from "~/server/api/routers/pricing";
import { procurementRouter } from "~/server/api/routers/procurement";
import { customersRouter } from "~/server/api/routers/customers";
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
import { rhEvaluationRouter } from "~/server/api/routers/rh-evaluation";
import { rhCompetencesRouter } from "~/server/api/routers/rh-competences";
import { rhDisciplineRouter } from "~/server/api/routers/rh-discipline";
import { partnerRouter } from "~/server/api/routers/partner";
import { stockRouter } from "~/server/api/routers/stock";
import { margeRouter } from "~/server/api/routers/marge";
import { profitRouter } from "~/server/api/routers/profit";
import { exportRouter } from "~/server/api/routers/export";
import { reportsRouter } from "~/server/api/routers/reports";
import { referenceRouter } from "~/server/api/routers/reference";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  user: userRouter,
  settings: settingsRouter,
  catalog: catalogRouter,
  reference: referenceRouter,
  inventory: inventoryRouter,
  pos: posRouter,
  finance: financeRouter,
  audit: auditRouter,
  analytics: analyticsRouter,
  pricing: pricingRouter,
  procurement: procurementRouter,
  customers: customersRouter,
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
  rhLeave: rhLeaveRouter,
  rhPayroll: rhPayrollRouter,
  rhEvaluation: rhEvaluationRouter,
  rhCompetences: rhCompetencesRouter,
  rhDiscipline: rhDisciplineRouter,
  stock: stockRouter,
  partner: partnerRouter,
  marge: margeRouter,
  profit: profitRouter,
  export: exportRouter,
  reports: reportsRouter,
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
