"use client";

import { KpiCards } from "../_components/admin/KpiCards";
import { SalesChart } from "../_components/admin/SalesChart";
import { RecentSales } from "../_components/admin/RecentSales";
import { StockAlerts } from "../_components/admin/StockAlerts";
import { TopProducts } from "../_components/admin/TopProducts";

export function AdminDashboardContent() {
  return (
    <div className="space-y-6">
      <KpiCards />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <div>
          <StockAlerts />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentSales />
        <TopProducts />
      </div>
    </div>
  );
}
