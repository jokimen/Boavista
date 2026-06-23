"use client";

import { formatCurrency } from "@/lib/utils";
import type { PipelineStage } from "@/types";

interface FunnelChartProps {
  stages: PipelineStage[];
}

const stageColors = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#c084fc", "#10b981", "#059669",
];

export function FunnelChart({ stages }: FunnelChartProps) {
  const maxCount = Math.max(...stages.map(s => s.count));

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
        const color = stageColors[i % stageColors.length];
        return (
          <div key={stage.status} className="flex items-center gap-3">
            <div className="w-40 shrink-0 text-xs text-text-secondary text-right truncate">
              {stage.label}
            </div>
            <div className="flex-1 h-8 bg-border rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg flex items-center px-3 transition-all duration-500"
                style={{ width: `${Math.max(pct, 8)}%`, background: color }}
              >
                <span className="text-xs font-bold text-white">{stage.count}</span>
              </div>
            </div>
            {stage.value > 0 && (
              <div className="w-24 shrink-0 text-xs text-text-muted text-right">
                {formatCurrency(stage.value)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
