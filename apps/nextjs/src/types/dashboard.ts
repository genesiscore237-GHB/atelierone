// src/types/dashboard.ts
export interface DashboardKpi {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: string;
  trendValue?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  isLoading?: boolean;
  isLocked?: boolean;
}

export interface AlertItem {
  id: string;
  type: 'stock' | 'cash' | 'sale' | 'purchase';
  title?: string;
  message: string;
  severity: 'high' | 'medium' | 'low' | 'critical';
  timestamp?: string;
  actionRequired?: boolean;
}

export interface TopPerformer {
  id?: string;
  name: string;
  sales?: number;
  transactions?: number;
  value?: number;
  type?: 'product' | 'employee';
}

// PRD Section 9.3 - CashSession status: open | pending_closure_approval | closed | locked
export interface CashSession {
  id: string;
  cashRegisterName: string;
  status: 'open' | 'pending_closure_approval';
  openedBy: string;
  openedAt: string;
  ticketCount: number;
  theoreticalBalance: number;
}

export interface PendingOperation {
  id: string;
  type: 'purchase_order' | 'transfer';
  description: string;
  dueDate: string;
  status: string;
}

// PRD Section 15.1 - daily_sales_facts read model
export interface DailySalesFact {
  tenant_id: string;
  site_id: string;
  date: string;
  product_id: string;
  seller_user_id: string;
  customer_segment_id: string;
  qty_sold: number;
  gross_sales_amount: number;
  discount_amount: number;
  net_sales_amount: number;
  tax_amount: number;
  cost_amount: number;
  margin_amount: number;
}

// PRD Section 15.2 - daily_cash_facts read model
export interface DailyCashFact {
  tenant_id: string;
  site_id: string;
  register_id: string;
  date: string;
  cash_in_amount: number;
  cash_out_amount: number;
  variance_amount: number;
  sessions_count: number;
}

// PRD Section 10.6 - stock_alerts
export interface StockAlert {
  id: string;
  tenant_id: string;
  site_id: string;
  product_id: string;
  alert_type: 'low_stock' | 'critical_stock' | 'stock_out';
  severity: 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'resolved';
  current_available_qty: number;
  threshold_qty: number;
  triggered_at: string;
}

export interface DashboardOverviewResponse {
  kpis: DashboardKpi[];
  salesTrend: { date: string; value: number }[];
  alerts: AlertItem[];
  topPerformers: TopPerformer[];
  cashSessions: CashSession[];
  pendingOperations: PendingOperation[];
  hasMarginPermission: boolean;
}
