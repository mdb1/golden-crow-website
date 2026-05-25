"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.18)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(value: string) => {
              const d = new Date(`${value}T00:00:00`);
              return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            domain={["dataMin - 0.3", "dataMax + 0.3"]}
            tick={{ fontSize: 11 }}
            width={42}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
          />
          <Tooltip
            formatter={(value: number) => [`${Number(value).toFixed(1)} ${unitLabel}`, "Peso"]}
            labelFormatter={(label: string) => {
              const d = new Date(`${label}T00:00:00`);
              return d.toLocaleDateString();
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
