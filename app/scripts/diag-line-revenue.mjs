/**
 * Diagnóstico: VX_LINEAS_VENTA traz IMPORTE_TOTAL e COSTE_TOTAL preenchidos para
 * ARMAÇÕES/SOL (CLASE_PRODUCTO G/S)? — base para a margem € por marca.
 *
 * Uso (dentro de app/, no PC da loja): node scripts/diag-line-revenue.mjs 2025-05-01 2025-06-01
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
if (!BASE || !USER || !PASS) { console.error("OData não configurado."); process.exit(1); }

const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
const num = (x) => { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : 0; };
const p2 = (n) => String(n).padStart(2, "0");
const odataDate = (d) => `datetime'${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T00:00:00'`;

async function odataSelect(entitySet, q = {}) {
  const params = new URLSearchParams();
  if (q.filter) params.set("$filter", q.filter);
  if (q.select?.length) params.set("$select", q.select.join(","));
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

const from = new Date(process.argv[2] ?? "2025-05-01");
const to = new Date(process.argv[3] ?? "2025-06-01");

const ventas = await odataSelect("VX_VENTAS", {
  filter: `CENTRO eq ${CENTRO} and FECHA ge ${odataDate(from)} and FECHA lt ${odataDate(to)}`,
  select: ["CODIGO"],
});
console.log(`Vendas no período: ${ventas.length}`);
const codes = ventas.map((v) => v.CODIGO).slice(0, 200);

let nG = 0, nGcoste = 0, nGimporte = 0;
const sample = [];
for (let i = 0; i < codes.length; i += 50) {
  const ors = codes.slice(i, i + 50).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
  const lines = await odataSelect("VX_LINEAS_VENTA", {
    filter: `CENTRO_VENTA eq ${CENTRO} and (${ors})`,
    select: ["CODIGO_VENTA", "CODIGO_LINEA", "CLASE_PRODUCTO", "PROVEEDOR", "CANTIDAD", "IMPORTE_TOTAL", "COSTE_TOTAL"],
  });
  for (const l of lines) {
    const cls = (l.CLASE_PRODUCTO || "").trim().toUpperCase();
    if (cls !== "G" && cls !== "S") continue;
    nG++;
    if (num(l.COSTE_TOTAL) > 0) nGcoste++;
    if (num(l.IMPORTE_TOTAL) > 0) nGimporte++;
    if (sample.length < 12) sample.push({ cls, qty: num(l.CANTIDAD), importe: num(l.IMPORTE_TOTAL), coste: num(l.COSTE_TOTAL), prov: l.PROVEEDOR });
  }
}
console.log(`\nLinhas armações/sol (G/S): ${nG}`);
console.log(`  com IMPORTE_TOTAL > 0: ${nGimporte} (${nG ? ((nGimporte / nG) * 100).toFixed(0) : 0}%)`);
console.log(`  com COSTE_TOTAL  > 0: ${nGcoste} (${nG ? ((nGcoste / nG) * 100).toFixed(0) : 0}%)`);
console.log("\nAmostra:");
for (const s of sample) {
  const margin = s.importe > 0 ? (((s.importe - s.coste) / s.importe) * 100).toFixed(0) : "—";
  console.log(`  ${s.cls} qty=${s.qty} importe=${s.importe.toFixed(2)} coste=${s.coste.toFixed(2)} margem=${margin}% prov=${s.prov}`);
}
