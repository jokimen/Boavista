import type { UserRole, ModuleKey, Permission } from "@/types";

export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  { module: "dashboard", can_view: true, can_export: true },
  { module: "hoje", can_view: true, can_export: true },
  { module: "mes", can_view: true, can_export: true },
  { module: "vendas", can_view: true, can_export: true },
  { module: "faturacao", can_view: true, can_export: true },
  { module: "caixa", can_view: true, can_export: true },
  { module: "pipeline", can_view: true, can_export: true },
  { module: "stock", can_view: true, can_export: true },
  { module: "clientes", can_view: true, can_export: true },
  { module: "equipa", can_view: true, can_export: true },
  { module: "descontos", can_view: true, can_export: true },
  { module: "consultas", can_view: true, can_export: true },
  { module: "operacao", can_view: true, can_export: true },
  { module: "fornecedores", can_view: true, can_export: true },
  { module: "alertas", can_view: true, can_export: false },
  { module: "admin", can_view: false, can_export: false },
];

export const DEFAULT_COMMERCIAL_PERMISSIONS: Permission[] = [
  { module: "dashboard", can_view: true, can_export: false },
  { module: "hoje", can_view: true, can_export: false },
  { module: "mes", can_view: true, can_export: false },
  { module: "vendas", can_view: true, can_export: false },
  { module: "faturacao", can_view: true, can_export: false },
  { module: "caixa", can_view: false, can_export: false },
  { module: "pipeline", can_view: true, can_export: false },
  { module: "stock", can_view: true, can_export: false },
  { module: "clientes", can_view: true, can_export: false },
  { module: "equipa", can_view: false, can_export: false },
  { module: "descontos", can_view: false, can_export: false },
  { module: "consultas", can_view: true, can_export: false },
  { module: "operacao", can_view: true, can_export: false },
  { module: "fornecedores", can_view: false, can_export: false },
  { module: "alertas", can_view: true, can_export: false },
  { module: "admin", can_view: false, can_export: false },
];

export function getDefaultPermissions(role: UserRole): Permission[] {
  if (role === "superadmin") return DEFAULT_ADMIN_PERMISSIONS.map(p => ({
    ...p,
    module: p.module,
    can_view: true,
    can_export: true,
  }));
  if (role === "admin") return DEFAULT_ADMIN_PERMISSIONS;
  return DEFAULT_COMMERCIAL_PERMISSIONS;
}

export function canView(permissions: Permission[], module: ModuleKey): boolean {
  const p = permissions.find(p => p.module === module);
  return p?.can_view ?? false;
}

export function canExport(permissions: Permission[], module: ModuleKey): boolean {
  const p = permissions.find(p => p.module === module);
  return p?.can_export ?? false;
}
