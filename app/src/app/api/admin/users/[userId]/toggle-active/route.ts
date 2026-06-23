import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";
import { getDefaultPermissions } from "@/lib/auth/permissions";
import type { UserRole } from "@/types";

export async function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const targetRef = adminDb.collection("profiles").doc(userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const target = targetSnap.data() ?? {};

  // Não permitir desativar um superadmin nem o próprio utilizador (evita lockout).
  if (target.role === "superadmin") return NextResponse.json({ error: "Não é possível alterar o estado de um superadmin." }, { status: 403 });
  if (userId === guard.session.userId) return NextResponse.json({ error: "Não podes alterar o teu próprio estado." }, { status: 403 });

  const newActive = !target.is_active;
  const update: Record<string, unknown> = { is_active: newActive };

  // Ao aprovar, semear permissões default do role se ainda não existirem.
  if (newActive && !(Array.isArray(target.permissions) && target.permissions.length > 0)) {
    const defaults = getDefaultPermissions((target.role ?? "commercial") as UserRole);
    update.permissions = defaults.map((p) => ({ module: p.module, can_view: p.can_view, can_export: p.can_export }));
  }

  try {
    await targetRef.update(update);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: newActive ? "user_approved" : "user_deactivated",
    details: `User ${target.email} ${newActive ? "approved" : "deactivated"}`,
  });

  // Send email notification if activating
  if (newActive && target.email) {
    const { sendApprovalEmail } = await import("@/lib/integrations/resend");
    await sendApprovalEmail(target.email as string, (target.name as string) ?? "");
  }

  return NextResponse.json({ is_active: newActive });
}
