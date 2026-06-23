import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";

// Substitui a lista completa de produtos "saúde ocular".
const schema = z.object({
  products: z.array(
    z.object({
      codigo: z.string().trim().min(1).max(40),
      descricao: z.string().trim().max(200).optional().nullable(),
    }),
  ).max(2000),
});

export async function POST(req: Request) {
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Deduplica por código (último vence).
  const byCode = new Map<string, string | null>();
  for (const p of parsed.data.products) byCode.set(p.codigo, p.descricao ?? null);
  const codes = [...byCode.keys()];

  const col = adminDb.collection("saude_ocular_products");
  const keep = new Set(codes);
  let toDelete: string[] = [];
  try {
    const existing = await col.get();
    toDelete = existing.docs.map((d) => d.id).filter((id) => !keep.has(id));
  } catch { /* segue só com os upserts */ }

  // Coleção (UI de gestão) + doc agregado config/saude_ocular_products.codes (categorização).
  type Op = { set: Record<string, unknown> } | { del: true };
  const ops: { id: string; op: Op }[] = [
    ...[...byCode.entries()].map(([codigo, descricao]) => ({
      id: codigo,
      op: { set: { codigo, descricao, created_by: guard.session.userId } } as Op,
    })),
    ...toDelete.map((id) => ({ id, op: { del: true } as Op })),
  ];
  try {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = adminDb.batch();
      for (const { id, op } of ops.slice(i, i + 450)) {
        const ref = col.doc(id);
        if ("set" in op) batch.set(ref, op.set);
        else batch.delete(ref);
      }
      await batch.commit();
    }
    await adminDb.collection("config").doc("saude_ocular_products").set({ codes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "saude_ocular_updated",
    details: `Lista de produtos saúde ocular atualizada (${codes.length} códigos)`,
  });

  return NextResponse.json({ ok: true, count: codes.length });
}
