"use client";

import { AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alert, AlertSeverity } from "@/types";
import Link from "next/link";

const severityConfig: Record<AlertSeverity, {
  icon: React.ElementType;
  bg: string;
  border: string;
  iconColor: string;
  label: string;
}> = {
  critical: {
    icon: AlertCircle,
    bg: "bg-danger-bg/30",
    border: "border-[#ef4444]/40",
    iconColor: "text-[#ef4444]",
    label: "Crítico",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-warning-bg/30",
    border: "border-[#f59e0b]/40",
    iconColor: "text-[#f59e0b]",
    label: "Aviso",
  },
  info: {
    icon: Info,
    bg: "bg-border-subtle/30",
    border: "border-[#3b82f6]/40",
    iconColor: "text-[#3b82f6]",
    label: "Info",
  },
};

interface AlertPanelProps {
  alerts: Alert[];
  maxItems?: number;
}

export function AlertPanel({ alerts, maxItems = 10 }: AlertPanelProps) {
  const unread = alerts.filter(a => !a.is_read);
  const visible = alerts.slice(0, maxItems);

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-6 text-center text-text-muted text-sm">
        Sem alertas activos.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-[#f59e0b]" />
          <span className="text-sm font-semibold text-text-primary">Atenção imediata</span>
          {unread.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#ef4444] text-white text-xs font-bold">
              {unread.length}
            </span>
          )}
        </div>
        <Link href="/alertas" className="text-xs text-[#3b82f6] hover:underline">Ver todos</Link>
      </div>

      <div className="divide-y divide-border">
        {visible.map(alert => {
          const cfg = severityConfig[alert.severity];
          const Icon = cfg.icon;
          return (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-card-hover",
                !alert.is_read && "bg-[#0f1626]"
              )}
            >
              <div className={cn("p-1.5 rounded-lg mt-0.5 shrink-0", cfg.bg, `border ${cfg.border}`)}>
                <Icon size={14} className={cfg.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", alert.is_read ? "text-text-secondary" : "text-text-primary")}>
                  {alert.message}
                </p>
                {alert.detail && (
                  <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{alert.detail}</p>
                )}
              </div>
              {alert.action_url && (
                <Link href={alert.action_url} className="shrink-0 text-text-muted hover:text-[#3b82f6] transition-colors mt-0.5">
                  <ChevronRight size={16} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
