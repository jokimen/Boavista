"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import { ChartInfo } from "@/components/charts/ChartInfo";
import type { KpiData } from "@/types";

interface KpiCardProps {
  data: KpiData;
  onClick?: () => void;
  className?: string;
}

function Sparkline({ data }: { data: number[] }) {
  const chartData = data.map((v, i) => ({ i, v }));
  const trend = data[data.length - 1] > data[0];
  const color = trend ? "#10b981" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatValue(value: number | string, unit?: string): string {
  if (typeof value === "string") return value;
  if (unit === "€") return formatCurrency(value);
  if (unit === "%") return formatPercent(value);
  return formatNumber(value);
}

export function KpiCard({ data, onClick, className }: KpiCardProps) {
  const hasChange = data.change !== undefined;
  const isPositive = (data.change ?? 0) > 0;
  const isNeutral = data.change === 0;

  return (
    <div
      className={cn(
        "rounded-xl bg-bg-card border border-border p-4 flex flex-col gap-3",
        onClick && "cursor-pointer transition-colors hover:bg-bg-card-hover hover:border-border-subtle",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-text-muted uppercase tracking-wide">
          {data.label}
          {data.infoId && (
            <span onClick={(e) => e.stopPropagation()} className="normal-case">
              <ChartInfo id={data.infoId} size={12} />
            </span>
          )}
        </span>
        {hasChange && (
          <span className={cn(
            "flex items-center gap-0.5 text-xs font-medium",
            isPositive ? "text-[#10b981]" : isNeutral ? "text-text-muted" : "text-[#ef4444]"
          )}>
            {isPositive ? <TrendingUp size={12} /> : isNeutral ? <Minus size={12} /> : <TrendingDown size={12} />}
            {Math.abs(data.change!).toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-2xl font-bold text-text-primary leading-none">
            {formatValue(data.value, data.unit)}
          </span>
          {data.target && (
            <div className="mt-1 text-xs text-text-muted">
              Meta: {formatValue(data.target, data.unit)}
              {data.targetPct !== undefined && (
                <span className={cn("ml-1 font-medium", data.targetPct >= 100 ? "text-[#10b981]" : data.targetPct >= 75 ? "text-[#f59e0b]" : "text-[#ef4444]")}>
                  ({data.targetPct.toFixed(0)}%)
                </span>
              )}
            </div>
          )}
          {data.changePeriod && (
            <div className="mt-0.5 text-xs text-text-muted">vs {data.changePeriod}</div>
          )}
        </div>
        {data.sparkline && data.sparkline.length > 1 && (
          <div className="w-24 shrink-0">
            <Sparkline data={data.sparkline} />
          </div>
        )}
      </div>

      {data.target && data.targetPct !== undefined && (
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              data.targetPct >= 100 ? "bg-[#10b981]" : data.targetPct >= 75 ? "bg-[#f59e0b]" : "bg-[#3b82f6]"
            )}
            style={{ width: `${Math.min(data.targetPct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
