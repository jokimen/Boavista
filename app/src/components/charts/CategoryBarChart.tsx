"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface CategoryBarChartProps {
  data: Array<{ label: string; sales: number; margin_pct: number }>;
  onBarClick?: (category: string) => void;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

interface TooltipProps {
  active?: boolean;
  payload?: { value?: number; payload?: { margin_pct?: number } }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card-hover border border-border-subtle rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-text-primary mb-1">{label}</p>
      <p className="text-[#3b82f6]">Vendas: {formatCurrency(payload[0]?.value ?? 0)}</p>
      <p className="text-[#10b981]">Margem: {payload[0]?.payload?.margin_pct}%</p>
    </div>
  );
}

export function CategoryBarChart({ data, onBarClick }: CategoryBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-border)" }} />
        <Bar dataKey="sales" radius={[4, 4, 0, 0]} onClick={(d: unknown) => { const cat = (d as { category?: string }).category; if (cat) onBarClick?.(cat); }}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
