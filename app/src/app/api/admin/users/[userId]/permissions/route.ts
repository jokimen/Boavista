import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";
import type { ModuleKey, UserRole } from "@/types";

const VALID_MODULES: ModuleKey[] = [
  "dashboard", "hoje", "mes", "vendas", "faturacao", "caixa", "pipeline", "stock",
  "clientes", "equipa", "descontos", "entidades", "operacao", "fornecedores", "alertas",
];

// Roles que o superadmin pode atribuir por esta UI (não permite criar superadmin).
const ASSIGNABLE_ROLES: UserRole[] = ["admin", "commercial"];

interface PermissionInput {
  module: ModuleKey;
  can_view: boolean;
  can_export: boolean;
}

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const targetRef = adminDb.collection("profiles").doc(userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const target = targetSnap.data() ?? {};
  if (target.role === "superadmin") {
    return NextResponse.json({ error: "Não é possível alterar um superadmin." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { role?: UserRole; permissions?: PermissionInput[] };

  // As permissões vivem como array embutido no documento de perfil (ver session.ts).
  const update: Record<string, unknown> = {};
  if (body.role && ASSIGNABLE_ROLES.includes(body.role) && body.role !== target.role) {
    update.role = body.role;
  }
  if (Array.isArray(body.permissions)) {
    update.permissions = body.permissions
      .filter((p) => VALID_MODULES.includes(p.module))
      .map((p) => ({ module: p.module, can_view: !!p.can_view, can_export: !!p.can_export }));
  }

  if (Object.keys(update).length) {
    try {
      await targetRef.update(update);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
    }
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "permissions_updated",
    details: `Permissões atualizadas para ${target.email}${body.role ? ` (role: ${body.role})` : ""}`,
  });

  return NextResponse.json({ ok: true });
}
