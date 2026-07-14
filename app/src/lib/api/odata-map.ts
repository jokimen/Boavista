/**
 * Mapeadores sobre as vistas OData (Visual Cloud) — fonte das funcionalidades
 * novas: Faturação (VX_FACTURAS_CLIENTES), Gestão de Caixa (VX_MOVIMIENTOS_CAJA)
 * e Fornecedores/Rappel (VX_FACTURAS_PROVEEDORES + linhas). Ver `vistas.pdf`.
 */
import { odataSelect, isOdataConfigured } from "./odata-client";

const CENTRO = process.env.VISUAL_CENTRO;
const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number) => Math.round(n * 100) / 100;

/** Literal de data OData v3 (sem zeros à esquerda obrigatórios): datetime'YYYY-MM-DDThh:mm:ss'. */
function odataDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `datetime'${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}'`;
}
function dateFilter(field: string, from: string, to: string): string {
  return `${field} ge ${odataDate(new Date(from))} and ${field} lt ${odataDate(new Date(to))}`;
}
const centroEq = (field = "CENTRO") => (CENTRO ? `${field} eq ${CENTRO}` : "");
const andAll = (...c: string[]) => c.filter(Boolean).join(" and ");

export { isOdataConfigured };

// ─── Gestão de Caixa ──────────────────────────────────────────────────────────

export interface CaixaMovement {
  codigo: string;
  date: string;
  amount: number;
  forma_pago: string;
  usuario: string;
  capitulo: string;
  ticket: string;
  descricao: string;
  codigo_venta: string | null;
}
interface VxMovCaja {
  CODIGO: number; FECHA: string; IMPORTE: number; FORMA_PAGO: string; NOMBRE_FORMA_PAGO: string;
  USUARIO: string; CAPITULO_CAJA: string; NUMERO_TICKET: string; DESCRIPCION: string; CODIGO_VENTA: number;
}

// Capítulos de caixa que NÃO são vendas reais (fundos/gestão de numerário) e
// que distorcem totais e análise: fundo de abertura, contagem de fecho,
// pagamentos a fornecedores e devoluções. Decisão do dono: só "Ventas generales".
const VENTAS_CAPITULO = "ventas generales";

export async function caixaMovements(from: string, to: string): Promise<CaixaMovement[]> {
  const rows = await odataSelect<VxMovCaja>("VX_MOVIMIENTOS_CAJA", {
    filter: andAll(centroEq(), dateFilter("FECHA", from, to)),
    orderby: "FECHA desc",
  });
  return rows
    .map((r) => ({
      codigo: String(r.CODIGO),
      date: r.FECHA,
      amount: num(r.IMPORTE),
      forma_pago: r.NOMBRE_FORMA_PAGO || r.FORMA_PAGO || "—",
      usuario: r.USUARIO || "—",
      capitulo: r.CAPITULO_CAJA || "",
      ticket: r.NUMERO_TICKET || "",
      descricao: r.DESCRIPCION || "",
      codigo_venta: r.CODIGO_VENTA ? String(r.CODIGO_VENTA) : null,
    }))
    .filter((m) => m.amount !== 0) // ignora movimentos a 0€
    // Exclui fundos de caixa e outros não-vendas (aberturas/fechos/pagamentos/abonos).
    .filter((m) => m.capitulo.trim().toLowerCase() === VENTAS_CAPITULO);
}

export interface CaixaAgg { label: string; total: number; count: number }
export interface CaixaDay extends CaixaAgg {
  /** Detalhe do dia: por forma de pagamento e por vendedor (para linha expansível). */
  byMethod: CaixaAgg[];
  byUser: CaixaAgg[];
}
export interface CaixaSummary {
  total: number;
  count: number;
  byMethod: CaixaAgg[];
  byUser: CaixaAgg[];
  byDay: CaixaDay[];
  movements: CaixaMovement[];
}

export async function caixaSummary(from: string, to: string): Promise<CaixaSummary> {
  const movements = await caixaMovements(from, to);
  const aggOf = (rows: CaixaMovement[], key: (m: CaixaMovement) => string): CaixaAgg[] => {
    const map = new Map<string, { total: number; count: number }>();
    for (const m of rows) {
      const k = key(m) || "—";
      const cur = map.get(k) ?? { total: 0, count: 0 };
      cur.total += m.amount; cur.count += 1; map.set(k, cur);
    }
    return [...map.entries()].map(([label, x]) => ({ label, total: round(x.total), count: x.count }))
      .sort((a, b) => b.total - a.total);
  };
  // Agrupa por dia (YYYY-MM-DD) com detalhe por forma de pagamento e por vendedor.
  const dayMap = new Map<string, CaixaMovement[]>();
  for (const m of movements) {
    const k = m.date.slice(0, 10);
    (dayMap.get(k) ?? dayMap.set(k, []).get(k)!).push(m);
  }
  const byDay: CaixaDay[] = [...dayMap.entries()]
    .map(([label, rows]) => ({
      label,
      total: round(rows.reduce((s, m) => s + m.amount, 0)),
      count: rows.length,
      byMethod: aggOf(rows, (m) => m.forma_pago),
      byUser: aggOf(rows, (m) => m.usuario),
    }))
    .sort((a, b) => b.label.localeCompare(a.label)); // mais recente primeiro
  return {
    total: round(movements.reduce((s, m) => s + m.amount, 0)),
    count: movements.length,
    byMethod: aggOf(movements, (m) => m.forma_pago),
    byUser: aggOf(movements, (m) => m.usuario),
    byDay,
    movements,
  };
}

// ─── Faturação (faturas emitidas a clientes) ─────────────────────────────────

export interface Invoice {
  codigo: string;
  numero: string;
  date: string;
  cliente: string;
  nif: string;
  usuario: string;
  codigo_venta: string | null;
}
interface VxFacturaCliente {
  CODIGO: number; FECHA: string; REFERENCIA: string; NOMBRE_CLIENTE: string; NIF_CLIENTE: string;
  USUARIO: string; CODIGO_VENTA: number;
}

export async function invoices(from: string, to: string): Promise<Invoice[]> {
  const rows = await odataSelect<VxFacturaCliente>("VX_FACTURAS_CLIENTES", {
    filter: andAll(centroEq(), dateFilter("FECHA", from, to)),
    orderby: "FECHA desc",
  });
  return rows.map((r) => ({
    codigo: String(r.CODIGO),
    numero: r.REFERENCIA || String(r.CODIGO),
    date: r.FECHA,
    cliente: r.NOMBRE_CLIENTE || "—",
    nif: r.NIF_CLIENTE || "",
    usuario: r.USUARIO || "—",
    codigo_venta: r.CODIGO_VENTA ? String(r.CODIGO_VENTA) : null,
  }));
}

// ─── Stock: última entrada, movimentos e stock por loja ──────────────────────

const norm13 = (c: unknown): string => {
  const base = String(c ?? "").replace(/@\d+$/, "").replace(/^0+/, "");
  return base ? base.padStart(13, "0") : "";
};

interface VxEntrada { CODIGO: number; FECHA: string; ES_DEVOLUCION: string; PROVEEDOR: string; }
interface VxLineaEntrada {
  CODIGO_ENTRADA: number; CODIGO_ARTICULO: string; CANTIDAD: number; PRECIO_COSTE: number; DESCRIPCION: string;
}

// Cache do mapa de últimas entradas (a query é pesada — entradas de vários anos).
let _entryCache: { key: string; expires: number; promise: Promise<Map<string, string>> } | null = null;

/** Mapa código de artigo (13 díg) → data da ENTRADA mais recente (desde `fromIso`). Cacheado 10 min. */
export function lastEntryByArticle(fromIso: string): Promise<Map<string, string>> {
  if (!isOdataConfigured()) return Promise.resolve(new Map());
  if (_entryCache && _entryCache.key === fromIso && _entryCache.expires > Date.now()) return _entryCache.promise;
  const promise = _lastEntryByArticle(fromIso).catch((e) => { _entryCache = null; throw e; });
  _entryCache = { key: fromIso, expires: Date.now() + 10 * 60_000, promise };
  return promise;
}

async function _lastEntryByArticle(fromIso: string): Promise<Map<string, string>> {
  const now = new Date().toISOString();
  // Entradas (não devoluções) no período → data por código de entrada.
  const entradas = await odataSelect<VxEntrada>("VX_ENTRADAS", {
    filter: andAll(centroEq(), dateFilter("FECHA", fromIso, now)),
    select: ["CODIGO", "FECHA", "ES_DEVOLUCION"],
  });
  // CODIGO vem como STRING no OData v3 — normalizar a chave do join (CODIGO_ENTRADA
  // pode chegar como número), senão o Map.get falha e o mapa sai vazio.
  const dateByEntrada = new Map<string, string>();
  for (const e of entradas) if (e.ES_DEVOLUCION !== "S") dateByEntrada.set(String(e.CODIGO), e.FECHA);
  const codes = [...dateByEntrada.keys()];
  const out = new Map<string, string>();
  const CHUNK = 50;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_ENTRADA eq ${c}`).join(" or ");
    const lines = await odataSelect<VxLineaEntrada>("VX_LINEAS_ENTRADA", {
      filter: `(${ors})`, select: ["CODIGO_ENTRADA", "CODIGO_ARTICULO"],
    });
    for (const l of lines) {
      const key = norm13(l.CODIGO_ARTICULO);
      if (!key) continue;
      const d = dateByEntrada.get(String(l.CODIGO_ENTRADA));
      if (d && (!out.has(key) || d > out.get(key)!)) out.set(key, d);
    }
  }
  return out;
}

/**
 * Códigos de ORÇAMENTOS (PRESUPUESTO='S') do período que foram CONVERTIDOS, i.e.
 * geraram encomenda/ordem de trabalho — sinal real de conversão validado na API:
 * a linha (VX_LINEAS_VENTA) ganha `CODIGO_ENCARGO > 0` quando o orçamento passa a
 * encomenda. (Não há campo de DATA de conversão preenchido em nenhuma vista.)
 * Devolve o conjunto de CODIGO_VENTA convertidos (como string).
 */
export async function convertedBudgetCodes(from: string, to: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!isOdataConfigured()) return out;
  const budgets = await odataSelect<{ CODIGO: number }>("VX_VENTAS", {
    filter: andAll(centroEq(), "PRESUPUESTO eq 'S'", dateFilter("FECHA", from, to)),
    select: ["CODIGO"],
  });
  const codes = budgets.map((b) => b.CODIGO);
  const CHUNK = 40;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const lines = await odataSelect<{ CODIGO_VENTA: number; CODIGO_ENCARGO: number }>("VX_LINEAS_VENTA", {
      filter: andAll(centroEq("CENTRO_VENTA"), `(${ors})`),
      select: ["CODIGO_VENTA", "CODIGO_ENCARGO"],
    });
    for (const l of lines) if (num(l.CODIGO_ENCARGO) > 0) out.add(String(l.CODIGO_VENTA));
  }
  return out;
}

/** Agregado de vendas por artigo: unidades + receita € (líquida) + custo €. */
export interface SaleAgg { qty: number; revenue: number; cost: number; }

/**
 * Vendas por artigo (13 díg) num intervalo: unidades (`CANTIDAD`), receita €
 * (`IMPORTE_TOTAL`, líquido de descontos) e custo € (`COSTE_TOTAL`). Estratégia:
 * obter os códigos de venda do período (VX_VENTAS tem FECHA) e somar das suas
 * linhas (VX_LINEAS_VENTA não tem data própria → junta-se por código de venda em
 * lotes de 50, como em `lineEntryCostsForVentas`). Usado no histórico por marca.
 * ⚠️ `COSTE_TOTAL` só vem preenchido para armações/sol (G/S) — fiável aí (validado
 * ~93% em Maio/2025); para lentes de laboratório vem 0 (o custo real é via cascata
 * de entrada/fatura, fora deste caminho). A análise por marca é só armações/sol.
 */
export async function salesAggByArticle(from: string, to: string): Promise<Map<string, SaleAgg>> {
  if (!isOdataConfigured()) return new Map();
  const ventas = await odataSelect<{ CODIGO: number }>("VX_VENTAS", {
    filter: andAll(centroEq(), dateFilter("FECHA", from, to)),
    select: ["CODIGO"],
  });
  const codes = ventas.map((v) => v.CODIGO);
  const out = new Map<string, SaleAgg>();
  const CHUNK = 50;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const lines = await odataSelect<{ CODIGO_ARTICULO: string; CANTIDAD: number; IMPORTE_TOTAL: number; COSTE_TOTAL: number }>("VX_LINEAS_VENTA", {
      filter: andAll(centroEq("CENTRO_VENTA"), `(${ors})`),
      select: ["CODIGO_ARTICULO", "CANTIDAD", "IMPORTE_TOTAL", "COSTE_TOTAL"],
    });
    for (const l of lines) {
      const k = norm13(l.CODIGO_ARTICULO);
      if (!k) continue;
      const e = out.get(k) ?? { qty: 0, revenue: 0, cost: 0 };
      e.qty += num(l.CANTIDAD);
      e.revenue += num(l.IMPORTE_TOTAL);
      e.cost += num(l.COSTE_TOTAL);
      out.set(k, e);
    }
  }
  return out;
}

/**
 * Unidades COMPRADAS (rececionadas) por artigo (13 díg) num intervalo. Entradas
 * não-devolução do período (VX_ENTRADAS tem FECHA) → soma `CANTIDAD` das linhas
 * (VX_LINEAS_ENTRADA) em lotes de 50.
 */
export async function purchaseQtyByArticle(from: string, to: string): Promise<Map<string, number>> {
  if (!isOdataConfigured()) return new Map();
  const entradas = await odataSelect<VxEntrada>("VX_ENTRADAS", {
    filter: andAll(centroEq(), dateFilter("FECHA", from, to)),
    select: ["CODIGO", "ES_DEVOLUCION"],
  });
  const codes = entradas.filter((e) => e.ES_DEVOLUCION !== "S").map((e) => e.CODIGO);
  const out = new Map<string, number>();
  const CHUNK = 50;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_ENTRADA eq ${c}`).join(" or ");
    const lines = await odataSelect<VxLineaEntrada>("VX_LINEAS_ENTRADA", {
      filter: `(${ors})`, select: ["CODIGO_ARTICULO", "CANTIDAD"],
    });
    for (const l of lines) {
      const k = norm13(l.CODIGO_ARTICULO);
      if (!k) continue;
      out.set(k, (out.get(k) ?? 0) + num(l.CANTIDAD));
    }
  }
  return out;
}

export interface StockMovement { date: string; type: "entrada" | "venda"; qty: number; cost: number; ref: string; }

/** Histórico de movimentos (entradas + vendas) de um artigo nos últimos ~2 anos. */
export async function articleMovements(codigoArticulo: string): Promise<StockMovement[]> {
  if (!isOdataConfigured()) return [];
  const from = new Date(); from.setFullYear(from.getFullYear() - 2);
  const fromIso = from.toISOString(), now = new Date().toISOString();
  const art = `'${codigoArticulo}'`;
  // Entradas do artigo (precisa de juntar à data da entrada).
  const entLines = await odataSelect<VxLineaEntrada>("VX_LINEAS_ENTRADA", {
    filter: `CODIGO_ARTICULO eq ${art}`, select: ["CODIGO_ENTRADA", "CODIGO_ARTICULO", "CANTIDAD", "PRECIO_COSTE", "DESCRIPCION"],
  });
  const entCodes = [...new Set(entLines.map((l) => String(l.CODIGO_ENTRADA)))];
  const entDate = new Map<string, string>();
  for (let i = 0; i < entCodes.length; i += 50) {
    const ors = entCodes.slice(i, i + 50).map((c) => `CODIGO eq ${c}`).join(" or ");
    const es = await odataSelect<VxEntrada>("VX_ENTRADAS", { filter: andAll(centroEq(), `(${ors})`), select: ["CODIGO", "FECHA"] });
    for (const e of es) entDate.set(String(e.CODIGO), e.FECHA);
  }
  const movEnt: StockMovement[] = entLines
    .map((l) => ({ date: entDate.get(String(l.CODIGO_ENTRADA)) ?? "", type: "entrada" as const, qty: num(l.CANTIDAD), cost: num(l.PRECIO_COSTE), ref: `Entrada ${l.CODIGO_ENTRADA}` }))
    .filter((m) => m.date >= fromIso && m.date <= now);
  // Vendas do artigo.
  const saleLines = await odataSelect<{ CODIGO_VENTA: number; CANTIDAD: number; IMPORTE_TOTAL: number }>("VX_LINEAS_VENTA", {
    filter: andAll(centroEq("CENTRO_VENTA"), `CODIGO_ARTICULO eq ${art}`),
    select: ["CODIGO_VENTA", "CANTIDAD", "IMPORTE_TOTAL"],
  });
  const ventaCodes = [...new Set(saleLines.map((l) => l.CODIGO_VENTA))];
  const ventaDate = new Map<number, string>();
  for (let i = 0; i < ventaCodes.length; i += 50) {
    const ors = ventaCodes.slice(i, i + 50).map((c) => `CODIGO eq ${c}`).join(" or ");
    const vs = await odataSelect<{ CODIGO: number; FECHA: string }>("VX_VENTAS", { filter: andAll(centroEq(), `(${ors})`), select: ["CODIGO", "FECHA"] });
    for (const v of vs) ventaDate.set(v.CODIGO, v.FECHA);
  }
  const movVen: StockMovement[] = saleLines
    .map((l) => ({ date: ventaDate.get(l.CODIGO_VENTA) ?? "", type: "venda" as const, qty: num(l.CANTIDAD), cost: num(l.IMPORTE_TOTAL), ref: `Venda ${l.CODIGO_VENTA}` }))
    .filter((m) => m.date >= fromIso && m.date <= now);
  return [...movEnt, ...movVen].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Custo REAL por linha de venda (lentes de laboratório que não estão no maestro),
 * resolvido pela cadeia **venda → pedido → guia(entrada) → fatura do fornecedor**.
 * Por linha de venda (`${codVenta}-${codLinhaVenda}`) aplica-se a cascata, por
 * ordem de autoridade:
 *   1. **Fatura do fornecedor** (`VX_LINEAS_FACTURAS_PROVEEDOR.PRECIO` − descontos)
 *      — o que foi REALMENTE faturado; liga-se à venda através da entrada.
 *   2. **Entrada/guia** (`VX_LINEAS_ENTRADA.PRECIO_COSTE`) — quando ainda não há fatura.
 *   3. **Pedido** (`VX_LINEAS_PEDIDOS_REPOSICION.PRECIO_COSTE`) — encomendado mas
 *      ainda não rececionado (liga direto à venda, aumenta a cobertura).
 * Devolve o custo total (× quantidade) por linha de venda.
 */
export async function lineEntryCostsForVentas(ventaCodes: number[]): Promise<Map<string, number>> {
  if (!isOdataConfigured() || !ventaCodes.length) return new Map();
  const CHUNK = 50;
  const entrada = new Map<string, number>();        // cv-clv → custo (entrada)
  const pedido = new Map<string, number>();          // cv-clv → custo (pedido)
  const entLineToVenta = new Map<string, string>();  // `${CODIGO_ENTRADA}-${CODIGO_LINEA}` → cv-clv
  const entradaCodes = new Set<number>();

  for (let i = 0; i < ventaCodes.length; i += CHUNK) {
    const ors = ventaCodes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    // Guia / entrada. NÃO filtrar por PRECIO_COSTE: muitas entradas trazem custo 0
    // (o custo real só aparece na FATURA). Registamos sempre a linha de entrada para
    // a casar com a fatura; o PRECIO_COSTE só conta como fallback quando > 0.
    const ent = await odataSelect<{ CODIGO_VENTA: number; CODIGO_LINEA_VENTA: number; CODIGO_ENTRADA: number; CODIGO_LINEA: number; PRECIO_COSTE: number; CANTIDAD: number }>(
      "VX_LINEAS_ENTRADA",
      { filter: `(${ors})`, select: ["CODIGO_VENTA", "CODIGO_LINEA_VENTA", "CODIGO_ENTRADA", "CODIGO_LINEA", "PRECIO_COSTE", "CANTIDAD"] },
    );
    for (const r of ent) {
      if (!r.CODIGO_LINEA_VENTA) continue;
      const key = `${r.CODIGO_VENTA}-${r.CODIGO_LINEA_VENTA}`;
      const c = num(r.PRECIO_COSTE) * num(r.CANTIDAD || 1);
      if (c > 0) entrada.set(key, (entrada.get(key) ?? 0) + c);
      if (r.CODIGO_ENTRADA) { entLineToVenta.set(`${r.CODIGO_ENTRADA}-${r.CODIGO_LINEA}`, key); entradaCodes.add(r.CODIGO_ENTRADA); }
    }
    // Pedido ao fornecedor (liga direto à venda) — fallback de cobertura.
    const ped = await odataSelect<{ CODIGO_VENTA: number; CODIGO_LINEA_VENTA: number; PRECIO_COSTE: number; CANTIDAD: number }>(
      "VX_LINEAS_PEDIDOS_REPOSICION",
      { filter: `(${ors}) and PRECIO_COSTE gt 0`, select: ["CODIGO_VENTA", "CODIGO_LINEA_VENTA", "PRECIO_COSTE", "CANTIDAD"] },
    ).catch(() => []);
    for (const r of ped) {
      if (!r.CODIGO_LINEA_VENTA) continue;
      const key = `${r.CODIGO_VENTA}-${r.CODIGO_LINEA_VENTA}`;
      pedido.set(key, (pedido.get(key) ?? 0) + num(r.PRECIO_COSTE) * num(r.CANTIDAD || 1));
    }
  }

  // Fatura do fornecedor (autoritativo) — liga-se à venda através da entrada.
  const invoice = new Map<string, number>();
  const entArr = [...entradaCodes];
  for (let i = 0; i < entArr.length; i += CHUNK) {
    const ors = entArr.slice(i, i + CHUNK).map((c) => `CODIGO_ENTRADA eq ${c}`).join(" or ");
    const fac = await odataSelect<{ CODIGO_ENTRADA: number; CODIGO_LINEA_ENTRADA: number; PRECIO: number; CANTIDAD: number; DESCUENTO_1: number; DESCUENTO_2: number }>(
      "VX_LINEAS_FACTURAS_PROVEEDOR",
      { filter: `(${ors})`, select: ["CODIGO_ENTRADA", "CODIGO_LINEA_ENTRADA", "PRECIO", "CANTIDAD", "DESCUENTO_1", "DESCUENTO_2"] },
    ).catch(() => []);
    for (const r of fac) {
      const vkey = entLineToVenta.get(`${r.CODIGO_ENTRADA}-${r.CODIGO_LINEA_ENTRADA}`);
      if (!vkey) continue;
      const net = num(r.PRECIO) * num(r.CANTIDAD || 1) * (1 - num(r.DESCUENTO_1) / 100) * (1 - num(r.DESCUENTO_2) / 100);
      if (net > 0) invoice.set(vkey, (invoice.get(vkey) ?? 0) + net);
    }
  }

  // Cascata por linha de venda: fatura → entrada → pedido.
  const out = new Map<string, number>();
  for (const key of new Set([...entrada.keys(), ...pedido.keys(), ...invoice.keys()])) {
    const v = invoice.get(key) ?? entrada.get(key) ?? pedido.get(key);
    if (v && v > 0) out.set(key, v);
  }
  return out;
}

/**
 * Linhas de lente oftálmica (classe L) com tipo de graduação e tratamento, para attach.
 * O tratamento pode estar escolhido no menu (DESCRIPCION_SUPLEMENTO_0..2) OU já escrito
 * na própria descrição da lente (DESCRIPCION) — daí trazer ambos.
 */
export async function lensTreatmentLines(
  ventaCodes: number[],
): Promise<{ tipo: string; sup0: string; desc: string; sups: string[] }[]> {
  if (!isOdataConfigured() || !ventaCodes.length) return [];
  const out: { tipo: string; sup0: string; desc: string; sups: string[] }[] = [];
  const CHUNK = 50;
  for (let i = 0; i < ventaCodes.length; i += CHUNK) {
    const ors = ventaCodes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const rows = await odataSelect<{
      TIPO_GRADUACION: string; DESCRIPCION: string;
      DESCRIPCION_SUPLEMENTO_0: string; DESCRIPCION_SUPLEMENTO_1: string; DESCRIPCION_SUPLEMENTO_2: string;
    }>(
      "VX_LINEAS_VENTA",
      {
        filter: andAll(centroEq("CENTRO_VENTA"), `(${ors})`, "CLASE_PRODUCTO eq 'L'"),
        select: ["TIPO_GRADUACION", "DESCRIPCION", "DESCRIPCION_SUPLEMENTO_0", "DESCRIPCION_SUPLEMENTO_1", "DESCRIPCION_SUPLEMENTO_2"],
      },
    );
    for (const r of rows) {
      out.push({
        tipo: r.TIPO_GRADUACION || "",
        sup0: r.DESCRIPCION_SUPLEMENTO_0 || "",
        desc: r.DESCRIPCION || "",
        sups: [r.DESCRIPCION_SUPLEMENTO_0, r.DESCRIPCION_SUPLEMENTO_1, r.DESCRIPCION_SUPLEMENTO_2].filter(Boolean),
      });
    }
  }
  return out;
}

/**
 * Graduação das linhas de lente(L)/LC(C) por venda — para ligar a venda à revisão
 * (óculos/contactologia) do cliente pela graduação (a API NÃO expõe a revisão usada
 * como FK; a graduação é o único elo). Devolve ESFERA/CILINDRO/EIXO por linha.
 */
export interface SaleGradLine { codigoVenta: number; clase: "L" | "C"; esfera: number | null; cilindro: number | null; eje: number | null }
export async function saleGradLinesForVentas(ventaCodes: number[]): Promise<SaleGradLine[]> {
  if (!isOdataConfigured() || !ventaCodes.length) return [];
  const numOrNull = (x: unknown): number | null => { const n = parseFloat(String(x).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const out: SaleGradLine[] = [];
  const CHUNK = 50;
  for (let i = 0; i < ventaCodes.length; i += CHUNK) {
    const ors = ventaCodes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const rows = await odataSelect<{ CODIGO_VENTA: number; CLASE_PRODUCTO: string; ESFERA: string | number | null; CILINDRO: string | number | null; EJE: string | number | null }>(
      "VX_LINEAS_VENTA",
      {
        filter: andAll(centroEq("CENTRO_VENTA"), `(${ors})`, "(CLASE_PRODUCTO eq 'L' or CLASE_PRODUCTO eq 'C')"),
        select: ["CODIGO_VENTA", "CLASE_PRODUCTO", "ESFERA", "CILINDRO", "EJE"],
      },
    ).catch(() => []);
    for (const r of rows) {
      const clase = (r.CLASE_PRODUCTO || "").trim();
      if (clase !== "L" && clase !== "C") continue;
      // ⚠️ OData serializa Int64 (CODIGO_VENTA) como STRING no JSON → coagir a número
      // para casar com o code numérico da venda (Number(v.Codigo)).
      out.push({ codigoVenta: Number(r.CODIGO_VENTA), clase, esfera: numOrNull(r.ESFERA), cilindro: numOrNull(r.CILINDRO), eje: numOrNull(r.EJE) });
    }
  }
  return out;
}

/**
 * Detalhe rico por linha de venda (para análise por fornecedor): além de PROVEEDOR
 * e CLASE_PRODUCTO, traz a taxonomia AGRUPACION1/2/3 (que codifica material e
 * género nas armações, e tipo de lente nas oftálmicas) e a prescrição
 * (ESFERA/CILINDRO/ADICION → permite classificar LC esférica/tórica/multifocal).
 * Mapa `${CODIGO_VENTA}-${CODIGO_LINEA}` → detalhe.
 */
export interface LineSalesDetail {
  proveedor: string;
  clase: string;
  agr1: string; agr2: string; agr3: string;
  tipo: string;
  esfera: number; cilindro: number; adicion: number;
}

export async function lineSalesDetailsForVentas(ventaCodes: number[]): Promise<Map<string, LineSalesDetail>> {
  if (!isOdataConfigured() || !ventaCodes.length) return new Map();
  const map = new Map<string, LineSalesDetail>();
  const CHUNK = 50;
  for (let i = 0; i < ventaCodes.length; i += CHUNK) {
    const ors = ventaCodes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
    const rows = await odataSelect<{
      CODIGO_VENTA: number; CODIGO_LINEA: number; PROVEEDOR: string; CLASE_PRODUCTO: string;
      AGRUPACION1: string; AGRUPACION2: string; AGRUPACION3: string;
      TIPO_GRADUACION: string; ESFERA: string; CILINDRO: string; ADICION: string;
    }>("VX_LINEAS_VENTA", {
      filter: andAll(centroEq("CENTRO_VENTA"), `(${ors})`),
      select: ["CODIGO_VENTA", "CODIGO_LINEA", "PROVEEDOR", "CLASE_PRODUCTO",
        "AGRUPACION1", "AGRUPACION2", "AGRUPACION3", "TIPO_GRADUACION", "ESFERA", "CILINDRO", "ADICION"],
    });
    for (const r of rows) {
      map.set(`${r.CODIGO_VENTA}-${r.CODIGO_LINEA}`, {
        proveedor: (r.PROVEEDOR || "").trim(),
        clase: (r.CLASE_PRODUCTO || "").trim(),
        agr1: (r.AGRUPACION1 || "").trim(),
        agr2: (r.AGRUPACION2 || "").trim(),
        agr3: (r.AGRUPACION3 || "").trim(),
        tipo: (r.TIPO_GRADUACION || "").trim(),
        esfera: num(r.ESFERA), cilindro: num(r.CILINDRO), adicion: num(r.ADICION),
      });
    }
  }
  return map;
}

export interface StoreStock { centro: number; existencias: number; }

/** Stock por loja (centro) de um artigo. */
export async function stockByStore(codigoArticulo: string): Promise<StoreStock[]> {
  if (!isOdataConfigured()) return [];
  const rows = await odataSelect<{ CENTRO_STOCK: number; EXISTENCIAS: number }>("VX_ARTICULOS_TIENDA", {
    filter: `CODIGO_ARTICULO eq '${codigoArticulo}'`, select: ["CENTRO_STOCK", "EXISTENCIAS"],
  });
  return rows.map((r) => ({ centro: num(r.CENTRO_STOCK), existencias: num(r.EXISTENCIAS) }))
    .filter((s) => s.existencias !== 0)
    .sort((a, b) => a.centro - b.centro);
}

// ─── Fornecedores / Rappel (faturas recebidas de fornecedores) ───────────────

export interface SupplierPurchase {
  proveedor: string;
  nome: string;
  total: number;
  count: number; // nº de faturas
}
interface VxFacturaProv { CODIGO: number; CENTRO: number; PROVEEDOR: string; FECHA: string; }
interface VxLineaFacturaProv {
  CODIGO_FACTURA: number; CENTRO_FACTURA: number; PROVEEDOR: string;
  PRECIO: number; CANTIDAD: number; DESCUENTO_1: number; DESCUENTO_2: number;
}
interface VxProveedor { PROVEEDOR: string; NOMBRE: string; TIPO?: string; }

/** Lista de fornecedores (para configuração no Admin). */
export async function listSuppliers(): Promise<{ proveedor: string; nome: string }[]> {
  const provs = await odataSelect<VxProveedor>("VX_PROVEEDORES", { select: ["PROVEEDOR", "NOMBRE"] });
  return provs
    .map((p) => ({ proveedor: p.PROVEEDOR, nome: p.NOMBRE || p.PROVEEDOR }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Compras por fornecedor no período (soma das linhas das faturas recebidas). */
export async function supplierPurchases(from: string, to: string): Promise<SupplierPurchase[]> {
  const facturas = await odataSelect<VxFacturaProv>("VX_FACTURAS_PROVEEDORES", {
    filter: andAll(centroEq(), dateFilter("FECHA", from, to)),
    select: ["CODIGO", "CENTRO", "PROVEEDOR", "FECHA"],
  });
  if (!facturas.length) return [];
  // Soma das linhas por fatura (em lotes por CODIGO_FACTURA).
  const totalByFactura = new Map<number, number>();
  const codes = facturas.map((f) => f.CODIGO);
  const CHUNK = 50;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_FACTURA eq ${c}`).join(" or ");
    const lines = await odataSelect<VxLineaFacturaProv>("VX_LINEAS_FACTURAS_PROVEEDOR", {
      filter: `(${ors})`,
      select: ["CODIGO_FACTURA", "PRECIO", "CANTIDAD", "DESCUENTO_1", "DESCUENTO_2"],
    });
    for (const l of lines) {
      const bruto = num(l.PRECIO) * num(l.CANTIDAD);
      const net = bruto * (1 - num(l.DESCUENTO_1) / 100) * (1 - num(l.DESCUENTO_2) / 100);
      totalByFactura.set(l.CODIGO_FACTURA, (totalByFactura.get(l.CODIGO_FACTURA) ?? 0) + net);
    }
  }
  // Nomes dos fornecedores.
  const provs = await odataSelect<VxProveedor>("VX_PROVEEDORES", { select: ["PROVEEDOR", "NOMBRE"] });
  const nameOf = new Map(provs.map((p) => [p.PROVEEDOR, p.NOMBRE]));
  // Agrega por fornecedor.
  const byProv = new Map<string, { total: number; count: number }>();
  for (const f of facturas) {
    const cur = byProv.get(f.PROVEEDOR) ?? { total: 0, count: 0 };
    cur.total += totalByFactura.get(f.CODIGO) ?? 0;
    cur.count += 1;
    byProv.set(f.PROVEEDOR, cur);
  }
  return [...byProv.entries()]
    .map(([proveedor, x]) => ({ proveedor, nome: nameOf.get(proveedor) || proveedor, total: round(x.total), count: x.count }))
    .sort((a, b) => b.total - a.total);
}
