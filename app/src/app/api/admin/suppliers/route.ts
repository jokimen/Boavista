import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";
import { SUPPLIER_GROUPS, encodeSupplierId } from "@/lib/suppliers/constants";

const tierSchema = z.object({ min: z.number().nonnegative(), pct: z.number().min(0).max(100) });

const schema = z.object({
  suppliers: z.array(z.object({
    proveedor: z.string().trim().min(1).max(60),
    nome: z.string().trim().max(120).optional().nullable(),
    grupo: z.enum(SUPPLIER_GROUPS).nullable(),
    objetivo_compra: z.number().nonnegative(),
    rappel_pct: z.number().min(0).max(100),
    rappel_tiers: z.array(tierSchema).max(12).optional().default([]),
  })).max(3000),
});

export async function POST(req: Request) {
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Só guarda fornecedores com alguma config (grupo, objetivo, rappel ou escalões).
  const rows = parsed.data.suppliers
    .filter((s) => s.grupo || s.objetivo_compra > 0 || s.rappel_pct > 0 || (s.rappel_tiers?.length ?? 0) > 0)
    .map((s) => ({
      proveedor: s.proveedor,
      nome: s.nome ?? null,
      grupo: s.grupo,
      objetivo_compra: s.objetivo_compra,
      rappel_pct: s.rappel_pct,
      rappel_tiers: (s.rappel_tiers ?? []).filter((t) => t.min >= 0 && t.pct > 0).sort((a, b) => a.min - b.min),
      updated_by: guard.session.userId,
      updated_at: new Date().toISOString(),
    }));

  const col = adminDb.collection("supplier_config");
  // Remove apenas os docs que existiam e ficaram sem config (não milhares inexistentes).
  // Os ids são codificados (o "/" não pode ser id no Firestore) — comparar no mesmo espaço.
  const keep = new Set(rows.map((r) => encodeSupplierId(r.proveedor)));
  let toDelete: string[] = [];
  try {
    const existing = await col.get();
    toDelete = existing.docs.map((d) => d.id).filter((id) => !keep.has(id));
  } catch { /* segue só com os upserts */ }

  // Operações em lotes de ≤450 (limite de 500 do batch do Firestore).
  type Op = { set: Record<string, unknown> } | { del: true };
  const ops: { id: string; op: Op }[] = [
    ...rows.map((r) => ({ id: encodeSupplierId(r.proveedor), op: { set: r } as Op })),
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
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "suppliers_config_updated",
    details: `Config de fornecedores atualizada (${rows.length} com config)`,
  });
  return NextResponse.json({ ok: true, count: rows.length });
}
