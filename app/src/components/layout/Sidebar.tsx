"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Sun, Calendar, ShoppingBag, GitBranch,
  Package, Users, UserCheck, Scissors, CalendarCheck,
  Truck, Bell, ChevronLeft, ChevronRight,
  LogOut, Shield, FileText, Wallet, Factory,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import type { ModuleKey } from "@/types";

const navItems: ({ divider: true } | { href: string; icon: typeof LayoutDashboard; label: string; module: ModuleKey })[] = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", module: "dashboard" },
  { href: "/hoje", icon: Sun, label: "Hoje", module: "hoje" },
  { href: "/mes", icon: Calendar, label: "Mês", module: "mes" },
  { divider: true },
  { href: "/vendas", icon: ShoppingBag, label: "Vendas", module: "vendas" },
  { href: "/faturacao", icon: FileText, label: "Faturação", module: "faturacao" },
  { href: "/caixa", icon: Wallet, label: "Gestão de Caixa", module: "caixa" },
  { divider: true },
  { href: "/equipa", icon: UserCheck, label: "Equipa", module: "equipa" },
  { href: "/descontos", icon: Scissors, label: "Descontos", module: "descontos" },
  { href: "/consultas", icon: CalendarCheck, label: "Consultas", module: "consultas" },
  { divider: true },
  { href: "/clientes", icon: Users, label: "Clientes", module: "clientes" },
  { href: "/stock", icon: Package, label: "Stock", module: "stock" },
  { divider: true },
  { href: "/fornecedores", icon: Factory, label: "Fornecedores/Rappel", module: "fornecedores" },
  { href: "/pipeline", icon: GitBranch, label: "Pipeline", module: "pipeline" },
  { href: "/operacao", icon: Truck, label: "Operação", module: "operacao" },
  { href: "/alertas", icon: Bell, label: "Alertas", module: "alertas" },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  isSuperAdmin?: boolean;
  /** Módulos que o utilizador pode ver. Se omitido, mostra todos (compat.). */
  allowedModules?: ModuleKey[];
}

export function Sidebar({ userName, userRole, isSuperAdmin, allowedModules }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();
  // "compacto" (só ícones) aplica-se ao desktop colapsado; no drawer móvel mostra sempre texto.
  const compact = collapsed && !mobileOpen;

  // Filtra os itens pelos módulos permitidos e remove divisores órfãos.
  const visibleItems = (() => {
    const allowed = allowedModules
      ? navItems.filter((it) => "divider" in it || allowedModules.includes(it.module))
      : navItems;
    // remove divisores no início/fim ou consecutivos
    return allowed.filter((it, i, arr) => {
      if (!("divider" in it)) return true;
      const prev = arr[i - 1];
      return i !== 0 && i !== arr.length - 1 && prev && !("divider" in prev);
    });
  })();

  return (
    <>
      {/* Backdrop (só telemóvel) */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity duration-300",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />
      <aside className={cn(
      "flex flex-col h-full bg-bg-sidebar border-r border-border transition-all duration-300",
      // Telemóvel: drawer fixo que desliza. Desktop (md+): estático na coluna.
      "fixed inset-y-0 left-0 z-50 w-64 md:static md:z-auto",
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      collapsed ? "md:w-16" : "md:w-56",
    )}>
      {/* Logo */}
      <div className={cn(
        "flex items-center h-14 px-4 border-b border-border shrink-0",
        compact ? "justify-center" : "gap-3"
      )}>
        <Image
          src="/logo_boavista.png"
          alt="Opticalia Boavista"
          width={28}
          height={28}
          priority
          className="rounded-full shrink-0"
          style={{ filter: "drop-shadow(0 0 6px rgba(59,130,246,0.45))" }}
        />
        {!compact && (
          <div className="min-w-0">
            <p className="text-xs font-bold text-text-primary truncate">Opticalia</p>
            <p className="text-[10px] text-text-muted truncate">Boavista</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item, i) => {
          if ("divider" in item) {
            return <div key={i} className="neon-divider my-2.5 mx-1" />;
          }
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={compact ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors group",
                active
                  ? "bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/25"
                  : "text-text-muted hover:text-text-primary hover:bg-border",
                compact && "justify-center"
              )}
            >
              <Icon size={16} className="shrink-0" />
              {!compact && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-2 space-y-0.5">
        {isSuperAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors",
              "text-text-muted hover:text-text-primary hover:bg-border",
              compact && "justify-center"
            )}
            title={compact ? "Admin" : undefined}
          >
            <Shield size={16} className="shrink-0" />
            {!compact && <span>Admin</span>}
          </Link>
        )}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className={cn(
              "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors",
              "text-text-muted hover:text-[#ef4444] hover:bg-danger-bg/20",
              compact && "justify-center"
            )}
            title={compact ? "Sair" : undefined}
          >
            <LogOut size={16} className="shrink-0" />
            {!compact && <span>Sair</span>}
          </button>
        </form>

        {!compact && (
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">{userName[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{userName}</p>
              <p className="text-[10px] text-text-muted capitalize truncate">{userRole}</p>
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle (só desktop) */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden md:flex absolute -right-3 top-16 w-6 h-6 rounded-full bg-border border border-border-subtle items-center justify-center text-text-muted hover:text-text-primary transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
    </>
  );
}
