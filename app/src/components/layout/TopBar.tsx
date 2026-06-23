"use client";

import Link from "next/link";
import { Bell, RefreshCw, ArrowLeft, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  title: string;
  subtitle?: string;
  alertCount?: number;
  onRefresh?: () => void;
  actions?: React.ReactNode;
  /** Mostra uma seta "Voltar" à esquerda do título, ligada a este href. */
  backHref?: string;
}

export function TopBar({ title, subtitle, alertCount = 0, onRefresh, actions, backHref }: TopBarProps) {
  const router = useRouter();
  const { setMobileOpen } = useSidebar();
  return (
    <div className="h-14 flex items-center justify-between px-3 sm:px-6 border-b border-border bg-bg-base shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Hambúrguer (só telemóvel) */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors shrink-0"
          title="Menu"
        >
          <Menu size={20} />
        </button>
        {backHref && (
          <Link href={backHref} title="Voltar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors">
            <ArrowLeft size={18} />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-text-primary truncate">{title}</h1>
          {subtitle && <p className="text-xs text-text-muted truncate hidden sm:block">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <ThemeToggle />
        <button
          onClick={onRefresh ?? (() => router.refresh())}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors"
          title="Atualizar dados"
        >
          <RefreshCw size={16} />
        </button>
        <Link
          href="/alertas"
          title="Ver alertas"
          className="relative p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors"
        >
          <Bell size={16} />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ef4444] text-white text-[9px] font-bold flex items-center justify-center">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
