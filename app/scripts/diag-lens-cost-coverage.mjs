/**
 * Diagnóstico: cobertura de CUSTO das lentes oftálmicas (CLASE_PRODUCTO 'L')
 * via a cascata venda → pedido → entrada → FATURA do fornecedor.
 *
 * Replica a lógica de `lineEntryCostsForVentas` (odata-map.ts) num script
 * autónomo para medir, num mês liquidado, que % das linhas de lentes tem custo
 * resolvido e por que fonte. Lê ODATA_* e VISUAL_CENTRO do .env.local.
 *
 * Uso (dentro de app/, no PC da loja):
 *   node scripts/diag-lens-cost-coverage.mjs 2025-05-01 2025-06-01
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── env (.env.local) ─────────────────────────────────────────────────────────
function loadEnv() {
  const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

const BASE = (process.env.ODATA_URL ?? "").replace(/\/+$/, "");
const USER = process.env.ODATA_USER ?? "";
const PASS = process.env.ODATA_PASSWORD ?? "";
const CENTRO = process.env.VISUAL_CENTRO ?? "1";
if (!BASE || !USER || !PASS) {
  console.error("OData não configurado (ODATA_URL/USER/PASSWORD em .env.local).");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
const num = (x) => { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : 0; };
const p2 = (n) => String(n).padStart(2, "0");
const odataDate = (d) => `datetime'${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}'`;

async function odataSelect(entitySet, q = {}) {
  const params = new URLSearchParams();
  if (q.filter) params.set("$filter", q.filter);
  if (q.select?.length) params.set("$select", q.select.join(","));
  if (q.orderby) params.set("$orderby", q.orderby);
  if (q.top != null) params.set("$top", String(q.top));
  let url = `${BASE}/${entitySet}?${params.toString()}`;
  const out = [];
  for (let guard = 0; guard < 500 && url; guard++) {
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`OData ${res.status} em ${entitySet}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const json = await res.json();
    if (Array.isArray(json.value)) out.push(...json.value);
    const next = json["odata.nextLink"] ?? json["@odata.nextLink"];
    url = next ? (next.startsWith("http") ? next : `${BASE}/${next}`) : "";
  }
  return out;
}

const CHUNK = 50;
const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// ── cascata (réplica de lineEntryCostsForVentas) ─────────────────────────────
async function cascade(ventaCodes) {
  const entrada = new Map();          // cv-clv → custo (entrada)
  const pedido = new Map();           // cv-clv → custo (pedido)
  const entLineToVenta = new Map();   // `${CODIGO_ENTRADA}-${CODIGO_LINEA}` → cv-clv
  const entradaCodes = new Set();

  for (const batch of chunks(ventaCodes, CHUNK)) {
    const ors = batch.map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const ent = await odataSelect("VX_LINEAS_ENTRADA", {
      filter: `(${ors})`,
      select: ["CODIGO_VENTA", "CODIGO_LINEA_VENTA", "CODIGO_ENTRADA", "CODIGO_LINEA", "PRECIO_COSTE", "CANTIDAD"],
    });
    for (const r of ent) {
      if (!r.CODIGO_LINEA_VENTA) continue;
      const key = `${r.CODIGO_VENTA}-${r.CODIGO_LINEA_VENTA}`;
      const c = num(r.PRECIO_COSTE) * num(r.CANTIDAD || 1);
      if (c > 0) entrada.set(key, (entrada.get(key) ?? 0) + c);
      if (r.CODIGO_ENTRADA) { entLineToVenta.set(`${r.CODIGO_ENTRADA}-${r.CODIGO_LINEA}`, key); entradaCodes.add(r.CODIGO_ENTRADA); }
    }
    const ped = await odataSelect("VX_LINEAS_PEDIDOS_REPOSICION", {
      filter: `(${ors}) and PRECIO_COSTE gt 0`,
      select: ["CODIGO_VENTA", "CODIGO_LINEA_VENTA", "PRECIO_COSTE", "CANTIDAD"],
    }).catch(() => []);
    for (const r of ped) {
      if (!r.CODIGO_LINEA_VENTA) continue;
      const key = `${r.CODIGO_VENTA}-${r.CODIGO_LINEA_VENTA}`;
      pedido.set(key, (pedido.get(key) ?? 0) + num(r.PRECIO_COSTE) * num(r.CANTIDAD || 1));
    }
  }

  const invoice = new Map();
  for (const batch of chunks([...entradaCodes], CHUNK)) {
    const ors = batch.map((c) => `CODIGO_ENTRADA eq ${c}`).join(" or ");
    const fac = await odataSelect("VX_LINEAS_FACTURAS_PROVEEDOR", {
      filter: `(${ors})`,
      select: ["CODIGO_ENTRADA", "CODIGO_LINEA_ENTRADA", "PRECIO", "CANTIDAD", "DESCUENTO_1", "DESCUENTO_2"],
    }).catch(() => []);
    for (const r of fac) {
      const vkey = entLineToVenta.get(`${r.CODIGO_ENTRADA}-${r.CODIGO_LINEA_ENTRADA}`);
      if (!vkey) continue;
      const net = num(r.PRECIO) * num(r.CANTIDAD || 1) * (1 - num(r.DESCUENTO_1) / 100) * (1 - num(r.DESCUENTO_2) / 100);
      if (net > 0) invoice.set(vkey, (invoice.get(vkey) ?? 0) + net);
    }
  }

  return { entrada, pedido, invoice };
}

// ── main ─────────────────────────────────────────────────────────────────────
const from = process.argv[2] ?? "2025-05-01";
const to = process.argv[3] ?? "2025-06-01";

console.log(`\n📊 Cobertura de custo das lentes oftálmicas (classe L) — ${from} a ${to} (excl.)\n`);

const dateF = `FECHA ge ${odataDate(new Date(from))} and FECHA lt ${odataDate(new Date(to))}`;
const ventas = await odataSelect("VX_VENTAS", {
  filter: `CENTRO eq ${CENTRO} and ${dateF}`,
  select: ["CODIGO", "FECHA"],
});
const ventaCodes = [...new Set(ventas.map((v) => Number(v.CODIGO)).filter(Boolean))];
console.log(`Vendas no período: ${ventaCodes.length}`);

// Linhas de lentes oftálmicas (classe L) dessas vendas.
const lLines = [];
for (const batch of chunks(ventaCodes, CHUNK)) {
  const ors = batch.map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
  const rows = await odataSelect("VX_LINEAS_VENTA", {
    filter: `CENTRO_VENTA eq ${CENTRO} and (${ors}) and CLASE_PRODUCTO eq 'L'`,
    select: ["CODIGO_VENTA", "CODIGO_LINEA", "IMPORTE_TOTAL", "CANTIDAD"],
  });
  for (const r of rows) lLines.push(r);
}
console.log(`Linhas de lentes oftálmicas (L): ${lLines.length}\n`);

const { entrada, pedido, invoice } = await cascade(ventaCodes);

let nInvoice = 0, nEntrada = 0, nPedido = 0, nNone = 0;
let vTotal = 0, vCovered = 0;
for (const l of lLines) {
  const key = `${l.CODIGO_VENTA}-${l.CODIGO_LINEA}`;
  vTotal += num(l.IMPORTE_TOTAL);
  if (invoice.has(key)) { nInvoice++; vCovered += num(l.IMPORTE_TOTAL); }
  else if (entrada.has(key)) { nEntrada++; vCovered += num(l.IMPORTE_TOTAL); }
  else if (pedido.has(key)) { nPedido++; vCovered += num(l.IMPORTE_TOTAL); }
  else nNone++;
}
const n = lLines.length || 1;
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;

console.log("Resolução do custo por fonte (cascata):");
console.log(`  1. Fatura fornecedor : ${nInvoice}  (${pct(nInvoice)})`);
console.log(`  2. Entrada/guia      : ${nEntrada}  (${pct(nEntrada)})`);
console.log(`  3. Pedido reposição  : ${nPedido}  (${pct(nPedido)})`);
console.log(`  —  Sem custo         : ${nNone}  (${pct(nNone)})`);
console.log(`\n✅ Cobertura total (qualquer fonte): ${pct(nInvoice + nEntrada + nPedido)} das linhas`);
console.log(`   Cobertura por € de venda: ${vTotal ? ((vCovered / vTotal) * 100).toFixed(1) : "0"}%  (${vCovered.toFixed(0)}€ de ${vTotal.toFixed(0)}€)\n`);
