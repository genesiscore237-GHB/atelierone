"use client";

import { useMemo } from "react";
import { api } from "~/trpc/react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export function SalesChart() {
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  }, []);

  const { data } = api.analytics.getSalesTrends.useQuery(
    { groupBy: "day", startDate },
    { staleTime: 5 * 60 * 1000, gcTime: Infinity },
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-border/10 bg-accent/20 text-sm text-muted-foreground">
        Aucune donnée cette semaine
      </div>
    );
  }

  const chartData = data.map((d) => {
    const date = new Date(d.period);
    const day = date.toLocaleDateString("fr-FR", { weekday: "short" });
    return {
      jour: day.slice(0, 3),
      ca: d.totalRevenue ?? 0,
      ventes: d.totalSales ?? 0,
    };
  });

  return (
    <div className="rounded-2xl border border-border/10 bg-accent/20 p-4 md:p-6 shadow-xl">
      <h3 className="mb-4 text-xs font-black tracking-widest text-muted-foreground uppercase">
        Chiffre d&apos;affaires — 7 jours
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="jour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="ca"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
