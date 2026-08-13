// src/lib/mock-dashboard-data.ts
// Mock data structured to reflect PRD Read Model structures
// PRD Section 15.1: daily_sales_facts, Section 15.2: daily_cash_facts, Section 10.6: stock_alerts
import type { DashboardOverviewResponse, DailySalesFact, DailyCashFact, StockAlert } from '~/types/dashboard';

// PRD Section 15.1 - daily_sales_facts (mock aggregation for chart)
const mockDailySalesFacts: DailySalesFact[] = [
  { tenant_id: "t1", site_id: "s1", date: "L", product_id: "p1", seller_user_id: "u1", customer_segment_id: "seg1", qty_sold: 10, gross_sales_amount: 1000, discount_amount: 50, net_sales_amount: 950, tax_amount: 190, cost_amount: 600, margin_amount: 350 },
  { tenant_id: "t1", site_id: "s1", date: "M", product_id: "p1", seller_user_id: "u1", customer_segment_id: "seg1", qty_sold: 15, gross_sales_amount: 1500, discount_amount: 100, net_sales_amount: 1400, tax_amount: 280, cost_amount: 900, margin_amount: 500 },
  { tenant_id: "t1", site_id: "s1", date: "M", product_id: "p2", seller_user_id: "u2", customer_segment_id: "seg1", qty_sold: 8, gross_sales_amount: 800, discount_amount: 0, net_sales_amount: 800, tax_amount: 160, cost_amount: 500, margin_amount: 300 },
  { tenant_id: "t1", site_id: "s1", date: "J", product_id: "p1", seller_user_id: "u1", customer_segment_id: "seg1", qty_sold: 18, gross_sales_amount: 1800, discount_amount: 150, net_sales_amount: 1650, tax_amount: 330, cost_amount: 1000, margin_amount: 650 },
  { tenant_id: "t1", site_id: "s1", date: "V", product_id: "p3", seller_user_id: "u2", customer_segment_id: "seg2", qty_sold: 12, gross_sales_amount: 1200, discount_amount: 60, net_sales_amount: 1140, tax_amount: 228, cost_amount: 700, margin_amount: 440 },
  { tenant_id: "t1", site_id: "s1", date: "S", product_id: "p1", seller_user_id: "u1", customer_segment_id: "seg1", qty_sold: 14, gross_sales_amount: 1400, discount_amount: 70, net_sales_amount: 1330, tax_amount: 266, cost_amount: 850, margin_amount: 480 },
  { tenant_id: "t1", site_id: "s1", date: "D", product_id: "p2", seller_user_id: "u3", customer_segment_id: "seg1", qty_sold: 10, gross_sales_amount: 1000, discount_amount: 0, net_sales_amount: 1000, tax_amount: 200, cost_amount: 600, margin_amount: 400 },
];

// PRD Section 15.2 - daily_cash_facts (mock)
const mockDailyCashFacts: DailyCashFact[] = [
  { tenant_id: "t1", site_id: "s1", register_id: "r1", date: "L", cash_in_amount: 800, cash_out_amount: 50, variance_amount: 0, sessions_count: 1 },
  { tenant_id: "t1", site_id: "s1", register_id: "r1", date: "M", cash_in_amount: 1200, cash_out_amount: 100, variance_amount: -5, sessions_count: 1 },
];

// PRD Section 10.6 - stock_alerts (mock)
const mockStockAlerts: StockAlert[] = [
  { id: "sa1", tenant_id: "t1", site_id: "s1", product_id: "p1", alert_type: "low_stock", severity: "high", status: "open", current_available_qty: 2, threshold_qty: 5, triggered_at: "2026-04-03T10:00:00Z" },
];

export const mockDashboardData: DashboardOverviewResponse = {
  kpis: [
    {
      title: "CA Brut",
      value: "2 450 000 FCFA",
      trendValue: "+12.5% (7j)",
      trendDirection: "up",
      isLoading: false,
      isLocked: false,
    },
    {
      title: "Tickets",
      value: "147",
      trendValue: "+8% (7j)",
      trendDirection: "up",
      isLoading: false,
      isLocked: false,
    },
    {
      title: "Marge Brute",
      value: "32.5%",
      trendValue: "+2.1% (7j)",
      trendDirection: "up",
      isLoading: false,
      isLocked: false, // Set to true if !hasPermission('report.margin.view')
    },
    {
      title: "Écart Caisse",
      value: "-2 500 FCFA",
      trendValue: "Limite dépassée",
      trendDirection: "down",
      isLoading: false,
      isLocked: false,
    },
  ],
  // Aggregated from daily_sales_facts → SUM(net_sales_amount) GROUP BY date
  salesTrend: [
    { date: "Lun", value: 950000 },
    { date: "Mar", value: 1200000 },
    { date: "Mer", value: 800000 },
    { date: "Jeu", value: 1650000 },
    { date: "Ven", value: 1140000 },
    { date: "Sam", value: 1330000 },
    { date: "Dim", value: 1000000 },
  ],
  alerts: [
    {
      id: "1",
      type: "stock",
      message: "Rupture: Cahier A4 spirale (2 restants)",
      severity: "high",
      actionRequired: true,
    },
    {
      id: "2",
      type: "cash",
      message: "Caisse 01 : Écart > 10 000 FCFA",
      severity: "medium",
      actionRequired: true,
    },
    {
      id: "3",
      type: "sale",
      message: "Remise > 20% à valider (Ticket #1247)",
      severity: "low",
      actionRequired: true,
    },
  ],
  // PRD Section 15.1 - Top performers from daily_sales_facts
  topPerformers: [
    // Employees (GROUP BY seller_user_id)
    { id: "u1", name: "S. Martin", value: 1200000, type: "employee" },
    { id: "u2", name: "M. Dubois", value: 850000, type: "employee" },
    { id: "u3", name: "L. Bernard", value: 400000, type: "employee" },
    // Products (GROUP BY product_id) — Top 5
    { id: "p1", name: "Cahier A4 96p", value: 950000, type: "product" },
    { id: "p2", name: "Stylo BIC Bleu", value: 800000, type: "product" },
    { id: "p3", name: "Gomme blanche", value: 600000, type: "product" },
    { id: "p4", name: "Règle 30cm", value: 450000, type: "product" },
    { id: "p5", name: "Classeur grand format", value: 350000, type: "product" },
  ],
  // PRD Section 9.3 - CashSession status: open | pending_closure_approval
  cashSessions: [
    {
      id: "1",
      cashRegisterName: "Caisse 01",
      status: "open",
      openedBy: "S. Martin",
      openedAt: "08:30",
      ticketCount: 45,
      theoreticalBalance: 850000,
    },
    {
      id: "2",
      cashRegisterName: "Caisse 02",
      status: "pending_closure_approval",
      openedBy: "M. Dubois",
      openedAt: "09:00",
      ticketCount: 32,
      theoreticalBalance: 420000,
    },
  ],
  pendingOperations: [
    {
      id: "1",
      type: "purchase_order",
      description: "BC-042 : Livraison auj.",
      dueDate: "Aujourd'hui",
      status: "En attente",
    },
    {
      id: "2",
      type: "transfer",
      description: "TR-09 : Reçu, écart 2p",
      dueDate: "Hier",
      status: "À valider",
    },
    {
      id: "3",
      type: "purchase_order",
      description: "3 Suggestions de réappro",
      dueDate: "Cette semaine",
      status: "Suggestion",
    },
  ],
  hasMarginPermission: true, // Mock: change based on user role → checkPermission('report.margin.view')
};
