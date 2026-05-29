"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface BodyWeightPoint {
  date: string;
  weight: number;
}

export function BodyWeightTrendChartClient({
  data,
  unitLabel,
}: {
  data: BodyWeightPoint[];
  unitLabel: string;
}) {
  return (
    <div className="h-60 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.16} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(value: string) => {
              const d = new Date(`${value}T00:00:00`);
              return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            domain={["dataMin - 0.6", "dataMax + 0.6"]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-1)", strokeOpacity: 0.3 }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} ${unitLabel}`, "Peso"]}
            labelFormatter={(label) => {
              const d = new Date(`${String(label)}T00:00:00`);
              return d.toLocaleDateString();
            }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="var(--chart-1)"
            fill="url(#weightArea)"
            strokeWidth={3}
            dot={{ r: 3.5, fill: "var(--chart-1)", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "var(--chart-1)", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
