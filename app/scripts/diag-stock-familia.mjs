/**
 * Diagnóstico: os campos Familia_agrupacion1/2/3 do maestro REST `Articulos`
 * vêm preenchidos? Precisam de options=CAMPOS_ADICIONALES? Que valores trazem
 * (para validar o mapeamento material/género da análise por marca)?
 *
 * Uso (dentro de app/, no PC da loja): node scripts/diag-stock-familia.mjs
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

const BASE = (process.env.VISUAL_API_URL ?? "").replace(/\/+$/, "");
const USER = process.env.VISUAL_USER ?? "";
const PASS = process.env.VISUAL_PASSWORD ?? "";
const CONN = process.env.VISUAL_CONNECTION ?? "";
if (!BASE || !USER || !PASS) { console.error("VISUAL_* não configurado."); process.exit(1); }

const quoteAll = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

let token = null;
async function login() {
  const params = [`UserName=${quoteAll(USER)}`, `Password=${quoteAll(PASS)}`, ...(CONN ? [`ConnectionName=${quoteAll(CONN)}`] : [])].join("&");
  const res = await fetch(`${BASE}/login?${params}`, { method: "POST", body: "", cache: "no-store" });
  if (!res.ok) throw new Error(`login ${res.status}`);
  token = res.headers.get("Access-Token") ?? res.headers.get("access-token");
  if (!token) throw new Error("sem token");
}
async function sel(table, opts = {}) {
  const qs = new URLSearchParams();
  if (opts.fields) qs.set("fields", opts.fields.join(","));
  if (opts.filter) qs.set("filter", opts.filter);
  if (opts.top != null) qs.set("top", String(opts.top));
  if (opts.options) qs.set("options", opts.options);
  const res = await fetch(`${BASE}/select/${table}?${qs}`, { method: "GET", headers: { "Access-Token": token }, cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${table} ${res.status}`);
  const text = await res.text();
  let p = JSON.parse(text);
  if (typeof p === "string") p = JSON.parse(p);
  return p?.data ?? [];
}

function summarize(rows, label) {
  const n = rows.length;
  const f1 = rows.filter((r) => (r.Familia_agrupacion1 ?? "").trim()).length;
  const f2 = rows.filter((r) => (r.Familia_agrupacion2 ?? "").trim()).length;
  const f3 = rows.filter((r) => (r.Familia_agrupacion3 ?? "").trim()).length;
  console.log(`\n[${label}] ${n} artigos — preenchidos: agrup1=${f1} agrup2=${f2} agrup3=${f3}`);
  console.log("amostra (Clase | Marca | agrup1 | agrup2 | agrup3):");
  for (const r of rows.slice(0, 12)) {
    console.log(`  ${(r.Clase_producto ?? "?").padEnd(3)} | ${(r.Marca ?? "").slice(0, 16).padEnd(16)} | ${(r.Familia_agrupacion1 ?? "").slice(0, 14).padEnd(14)} | ${(r.Familia_agrupacion2 ?? "").slice(0, 14).padEnd(14)} | ${r.Familia_agrupacion3 ?? ""}`);
  }
}

await login();
console.log("login OK");

// Armações/sol (G/S) é onde material/género fariam sentido.
const filt = "(Clase_producto eq 'G' or Clase_producto eq 'S') and (Existencias gt 0)";
const fields = ["Codigo", "Marca", "Clase_producto", "Familia_agrupacion1", "Familia_agrupacion2", "Familia_agrupacion3", "Existencias"];

const semOpt = await sel("Articulos", { filter: filt, fields, top: 60 });
summarize(semOpt, "SEM options");

// NOTA: options=CAMPOS_ADICIONALES devolve 500 neste maestro — os campos
// Familia_agrupacion já vêm SEM a opção. Mantido só para registo do teste.
let comOpt = [];
try {
  comOpt = await sel("Articulos", { filter: filt, fields, top: 60, options: "CAMPOS_ADICIONALES" });
  summarize(comOpt, "COM options=CAMPOS_ADICIONALES");
} catch (e) {
  console.log(`\n[COM options=CAMPOS_ADICIONALES] erro: ${e.message} (esperado — não é preciso)`);
}

// Distribuição dos valores distintos (com a melhor das duas).
const best = comOpt.length && comOpt.some((r) => (r.Familia_agrupacion3 ?? "").trim()) ? comOpt : semOpt;
const distinct = (key) => {
  const m = new Map();
  for (const r of best) { const v = (r[key] ?? "").trim() || "(vazio)"; m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
};
console.log("\nagrup2 (material?) distintos:", distinct("Familia_agrupacion2"));
console.log("agrup3 (género?) distintos:", distinct("Familia_agrupacion3"));
