import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";

// { usuario: € | null } — número > 0 define o objetivo; null/0 remove-o.
const schema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  targets: z.record(z.string().min(1), z.number().nonnegative().nullable()),
});

export async function POST(req: Request) {
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { year, month, targets } = parsed.data;

  // Documento por mês: employee_targets/{YYYY-MM} com um campo por usuario (vendedor).
  const docId = `${year}-${String(month).padStart(2, "0")}`;
  const update: Record<string, unknown> = {
    year,
    month,
    updated_by: guard.session.userId,
    updated_at: new Date().toISOString(),
  };
  let defined = 0;
  let removed = 0;
  for (const [usuario, v] of Object.entries(targets)) {
    if (v == null || v <= 0) {
      update[usuario] = FieldValue.delete();
      removed++;
    } else {
      update[usuario] = v;
      defined++;
    }
  }

  try {
    await adminDb.collection("employee_targets").doc(docId).set(update, { merge: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "employee_targets_updated",
    details: `Objetivos por vendedor de ${month}/${year} atualizados (${defined} definidos, ${removed} removidos)`,
  });

  return NextResponse.json({ ok: true });
}
