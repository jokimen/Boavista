"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface SalesTrendData {
  /** Anos com dados (o maior é o período atual). */
  years: number[];
  data: Array<{ label: string } & Record<string, number>>;
}

interface TooltipEntry { name?: string; value?: number; color?: string }
interface TooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string }

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card-hover border border-border-subtle rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-text-primary mb-2">{label}</p>
      {[...payload].reverse().map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: entry.color }} />
          {entry.name}: {formatCurrency(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

// Cor por recência: ano atual = azul forte; anteriores progressivamente mais ténues.
const YEAR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "var(--color-text-muted)"];

export function SalesLineChart({ data }: { data: SalesTrendData }) {
  const yearsDesc = [...data.years].sort((a, b) => b - a); // mais recente primeiro

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data.data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-secondary)" }} />
        {yearsDesc.map((year, idx) => (
          <Line
            key={year}
            type="monotone"
            dataKey={String(year)}
            name={String(year)}
            stroke={YEAR_COLORS[idx % YEAR_COLORS.length]}
            strokeWidth={idx === 0 ? 2.5 : 1.5}
            strokeDasharray={idx === 0 ? undefined : "4 3"}
            dot={false}
            activeDot={{ r: 4, fill: YEAR_COLORS[idx % YEAR_COLORS.length] }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
