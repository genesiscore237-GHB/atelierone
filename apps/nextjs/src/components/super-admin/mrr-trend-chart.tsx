// src/components/super-admin/mrr-trend-chart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface MrrTrendChartProps {
  data: { month: string; mrr: number }[];
}

export function MrrTrendChart({ data }: MrrTrendChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
          <XAxis
            dataKey="month"
            className="text-xs"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
          />
          <YAxis
            className="text-xs"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              fontSize: 13,
            }}
            labelStyle={{ color: "#64748b", fontWeight: 500, marginBottom: 4 }}
            formatter={(value?: any) => typeof value === 'number' ? [`${value.toLocaleString()} FCFA`, "MRR"] : ["0 FCFA", "MRR"]}
          />
          <Line
            type="monotone"
            dataKey="mrr"
            stroke="#10b981"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, stroke: "#10b981", strokeWidth: 2, fill: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}