import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";

const schema = z.object({
  aseguradoras: z.array(z.object({
    codigo: z.string().trim().min(1).max(40),
    nome: z.string().trim().max(120),
    ativo: z.boolean(),
  })).max(500),
});

export async function POST(req: Request) {
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Só guarda os que têm nome; remove os que ficaram sem nome (ou foram apagados).
  const rows = parsed.data.aseguradoras
    .filter((a) => a.nome.length > 0)
    .map((a) => ({ codigo: a.codigo, nome: a.nome, ativo: a.ativo, updated_by: guard.session.userId, updated_at: new Date().toISOString() }));

  const col = adminDb.collection("aseguradora_config");
  const keep = new Set(rows.map((r) => r.codigo));
  let toDelete: string[] = [];
  try {
    const existing = await col.get();
    toDelete = existing.docs.map((d) => d.id).filter((id) => !keep.has(id));
  } catch { /* segue só com os upserts */ }

  type Op = { set: Record<string, unknown> } | { del: true };
  const ops: { id: string; op: Op }[] = [
    ...rows.map((r) => ({ id: r.codigo, op: { set: r } as Op })),
    ...toDelete.map((id) => ({ id, op: { del: true } as Op })),
  ];
  try {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = adminDb.batch();
      for (const { id, op } of ops.slice(i, i + 450)) {
        if ("set" in op) batch.set(col.doc(id), op.set);
        else batch.delete(col.doc(id));
      }
      await batch.commit();
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "aseguradoras_config_updated",
    details: `Seguradoras rotuladas (${rows.length})`,
  });
  return NextResponse.json({ ok: true, count: rows.length });
}
