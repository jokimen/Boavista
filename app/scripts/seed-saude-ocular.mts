/**
 * Semeia a lista de produtos de "Saúde Ocular" (Admin → Objetivos) a partir da
 * taxonomia do Visual: artigos com `VX_ARTICULOS.AGRUPACION_2 = 'MANUTENCAO OCULAR'`
 * (líquidos, lágrimas, higiene palpebral, suplementos, limpeza enzimática).
 *
 * Valida-se que é o eixo certo: os grupos vizinhos NÃO são saúde ocular —
 * `PRODUTOS|MANUTENCAO LC` são ventosas, `ACESSORIOS|LIMPEZA` e `DIVERSOS|LIMPEZA`
 * são anti-embaciamento/panos de limpar óculos, `PRÓTESES OCULAR` é outro serviço.
 *
 * Escreve o MESMO que a rota /api/admin/saude-ocular: a coleção
 * `saude_ocular_products` (doc id = código) + o doc agregado
 * `config/saude_ocular_products.codes` (é este que a categorização lê).
 * Idempotente: repõe a lista completa (remove o que já lá não pertence).
 *
 * Correr de dentro de `app/`:
 *   npx tsx --env-file=.env.local scripts/seed-saude-ocular.mts [--commit]
 * Sem `--commit` faz só o ensaio (dry-run) e não escreve nada.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { odataSelect } from "../src/lib/api/odata-client";

const AGR2 = "MANUTENCAO OCULAR";
const commit = process.argv.includes("--commit");

const centro = process.env.VISUAL_CENTRO;
if (!centro) throw new Error("VISUAL_CENTRO em falta");

const rows = await odataSelect<{ CODIGO: string; DESCRIPCION: string; AGRUPACION_1: string; FECHA_BAJA: string | null }>(
  "VX_ARTICULOS",
  {
    filter: `CENTRO eq ${centro} and AGRUPACION_2 eq '${AGR2}'`,
    select: ["CODIGO", "CENTRO", "DESCRIPCION", "AGRUPACION_1", "AGRUPACION_2", "FECHA_BAJA"],
  },
);

// Descontinuados (FECHA_BAJA) entram na mesma: as vendas ANTIGAS referem-nos e têm de
// continuar a cair em "Saúde Ocular".
const byCode = new Map<string, string | null>();
for (const r of rows) {
  const codigo = String(r.CODIGO ?? "").trim();
  if (!codigo) continue;
  if (codigo.includes("/")) { console.warn(`  ! ignorado (o "/" parte o doc id): ${codigo}`); continue; }
  byCode.set(codigo, (r.DESCRIPCION ?? "").trim() || null);
}
const codes = [...byCode.keys()];

const porGrupo = new Map<string, number>();
for (const r of rows) porGrupo.set(String(r.AGRUPACION_1 ?? "?"), (porGrupo.get(String(r.AGRUPACION_1 ?? "?")) ?? 0) + 1);
console.log(`Artigos com AGRUPACION_2='${AGR2}' (centro ${centro}): ${codes.length}`);
for (const [g, n] of [...porGrupo].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${g}`);
console.log(`   (${rows.filter((r) => r.FECHA_BAJA).length} descontinuados, incluídos de propósito)`);

if (!commit) {
  console.log("\nENSAIO (dry-run) — nada escrito. Repetir com --commit para gravar.");
  process.exit(0);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const col = db.collection("saude_ocular_products");

const keep = new Set(codes);
const existing = await col.get();
const toDelete = existing.docs.map((d) => d.id).filter((id) => !keep.has(id));
console.log(`\nJá lá estavam: ${existing.size} | a remover: ${toDelete.length} | a gravar: ${codes.length}`);

type Op = { id: string; set?: Record<string, unknown>; del?: true };
const ops: Op[] = [
  ...[...byCode.entries()].map(([codigo, descricao]) => ({ id: codigo, set: { codigo, descricao, created_by: `seed:VX_ARTICULOS AGRUPACION_2=${AGR2}` } })),
  ...toDelete.map((id) => ({ id, del: true as const })),
];
for (let i = 0; i < ops.length; i += 450) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 450)) {
    const ref = col.doc(op.id);
    if (op.del) batch.delete(ref); else batch.set(ref, op.set!);
  }
  await batch.commit();
}
await db.collection("config").doc("saude_ocular_products").set({ codes });
await db.collection("audit_logs").add({
  user_id: null,
  action: "saude_ocular_updated",
  details: `Lista de produtos saúde ocular semeada de VX_ARTICULOS AGRUPACION_2='${AGR2}' (${codes.length} códigos)`,
  ip: "system",
  created_at: new Date().toISOString(),
});
console.log(`\nGRAVADO: ${codes.length} códigos em saude_ocular_products + config/saude_ocular_products.codes`);
process.exit(0);
