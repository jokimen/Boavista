import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession, type SessionContext } from "./session";
import { canView, canExport } from "./permissions";
import type { ModuleKey } from "@/types";

/**
 * Guard de página: garante que o utilizador autenticado tem `can_view` no módulo.
 * Caso contrário redireciona para /sem-acesso. Devolve a sessão para reutilização.
 * Usar no topo de cada página do dashboard: `const s = await requireModule("descontos");`
 */
export async function requireModule(module: ModuleKey): Promise<SessionContext> {
  const session = await getSession();
  if (!canView(session.permissions, module)) redirect("/sem-acesso");
  return session;
}

/**
 * Guard de API para EXPORTAÇÃO: exige `can_export` no módulo. Para rotas (devolve
 * 403 JSON em vez de redirecionar). Uso:
 *   const g = await requireExport("vendas"); if (!g.ok) return g.res;
 */
export async function requireExport(
  module: ModuleKey,
): Promise<{ ok: true; session: SessionContext } | { ok: false; res: NextResponse }> {
  const session = await getSession();
  if (!canExport(session.permissions, module)) {
    return { ok: false, res: NextResponse.json({ error: "Sem permissão de exportação." }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** Lista de módulos que o utilizador pode ver (para filtrar o menu). */
export function allowedModules(session: SessionContext): ModuleKey[] {
  return session.permissions.filter((p) => p.can_view).map((p) => p.module);
}
