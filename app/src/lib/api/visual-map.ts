/**
 * Camada de mapeamento/agregação: transforma os dados crus da API do Visual
 * (tabelas Ventas, Articulos, Clientes, etc.) nos formatos que o dashboard
 * consome (os mesmos que os mocks devolvem).
 *
 * IMPORTANTE — várias agregações envolvem aproximações de negócio, assinaladas
 * com NOTA. São o ponto natural de afinação quando virmos os dados reais.
 *
 * Decisões de mapeamento confirmadas:
 *  - Categorias (Modelo B, por linha via CLASE_PRODUCTO da linha): L→Óculos
 *    Graduados, G→Armações, S→Óculos de Sol, C→Lentes de Contacto, resto→Diversos.
 *    "Saúde Ocular" = lista de códigos definida no Admin (tem prioridade).
 *    A classe da linha vem do OData (VX_LINEAS_VENTA); sem OData, fallback ao maestro.
 *  - Centro: filtra-se pela loja física (env VISUAL_CENTRO).
 */

import type {
  Appointment,
  Client,
  Order,
  OrderStatus,
  PipelineStage,
  SaleCategory,
  SalesSummary,
  StockItem,
  StockSummary,
} from "@/types";
import type {
  VisualArticulo,
  VisualCliente,
  VisualEstadoLinea,
  VisualEventoAgenda,
  VisualTable,
  VisualVenta,
  VisualVentaLinea,
} from "@/types/visual";
import { dateRangeFilter, select, selectAll, isVisualConfigured } from "./visual-client";
import { isOdataConfigured, odataSelect } from "./odata-client";
import { AGR2_MANUTENCAO_OCULAR, invoiceVentaLinks, lastEntryByArticle, lineEntryCostsForVentas, lensTreatmentLines, lineSalesDetailsForVentas, listSuppliers, salesAggByArticle, purchaseQtyByArticle, purchaseNoArticleQtyByClass, convertedBudgetCodes, saleGradLinesForVentas, type LineSalesDetail } from "./odata-map";

const CENTRO = process.env.VISUAL_CENTRO ?? "";

/**
 * PVP mínimo para um artigo ser "produto premium". Definição do dono:
 * armações (classe G) ou óculos de sol (classe S) com Precio_venta > 400€.
 * Configurável via env VISUAL_PREMIUM_MIN_PVP.
 */
const PREMIUM_MIN_PVP = (() => {
  const r = parseFloat(process.env.VISUAL_PREMIUM_MIN_PVP ?? "");
  return Number.isFinite(r) && r > 0 ? r : 400;
})();

/** % de desconto a partir da qual uma venda é "desconto excessivo". */
const EXCESSIVE_DISCOUNT_PCT = (() => {
  const r = parseFloat(process.env.VISUAL_EXCESSIVE_DISCOUNT_PCT ?? "");
  return Number.isFinite(r) && r > 0 ? r : 15;
})();

/** Objetivos mensais por vendedor (Usuario), via env JSON. Ex: {"ANA":22000} */
function employeeTargets(): Record<string, number> {
  try {
    return JSON.parse(process.env.VISUAL_EMPLOYEE_TARGETS ?? "{}");
  } catch {
    return {};
  }
}

// ─── Helpers de coerção ───────────────────────────────────────────────────────

const num = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isoDay = (d: Date | null): string | null => (d ? d.toISOString().split("T")[0] : null);

const daysBetween = (a: Date, b: Date): number =>
  Math.floor((a.getTime() - b.getTime()) / 86_400_000);

const CATEGORY_LABELS: Record<SaleCategory, string> = {
  lentes_oftalmicas: "Lentes Oftálmicas",
  armacoes: "Armações",
  oculos_sol: "Óculos de Sol",
  lentes_contacto: "Lentes de Contacto",
  saude_ocular: "Saúde Ocular",
  diversos: "Diversos",
};

/**
 * Mapeia a CLASE_PRODUCTO do Visual para a categoria do dashboard (cada classe
 * independente): L→Lentes Oftálmicas, G→Armações, S→Óculos de Sol,
 * C→Lentes de Contacto, resto (P/I/—)→Diversos. Saúde Ocular não vem da classe —
 * é decidida pela lista de códigos (ver lineCategory).
 */
function categoryFromClase(clase?: string | null): SaleCategory {
  switch ((clase ?? "").trim().toUpperCase()) {
    case "L":
      return "lentes_oftalmicas";
    case "G":
      return "armacoes";
    case "S":
      return "oculos_sol";
    case "C":
      return "lentes_contacto";
    default:
      return "diversos"; // P (otros), I (inventado) e indefinidos
  }
}

// O valor do centro vai entre plicas no filtro OData (ex.: Centro eq '1').
const centroFilter = (): string | null => (CENTRO ? `Centro eq '${CENTRO}'` : null);

// ─── Índice de artigos (custo/categoria/marca por código) ─────────────────────

interface ArticleInfo {
  cost: number;
  price: number; // Precio_venta SEM IVA (base) — usado em margem (custo é ex-IVA)
  pvp: number; // PVP ao público = Precio_venta × (1 + IVA/100)
  category: SaleCategory;
  brand: string;
  description: string;
  claseProducto?: string;
}

/**
 * Normaliza um código de produto/artigo ao formato `Codigo` de 13 dígitos:
 * remove o sufixo `@centro`, retira zeros à esquerda e volta a preencher a 13.
 * (Ex.: `0000000212@1` → `0000000000212`.)
 */
function norm13(code: string | number | null | undefined): string {
  const base = String(code ?? "").replace(/@\d+$/, "").replace(/^0+/, "");
  return base ? base.padStart(13, "0") : "";
}

/**
 * Carrega o maestro de artigos e indexa por `Codigo`, `Codigo-Centro` e pela
 * forma normalizada a 13 dígitos (para casar com `Codigo_producto`).
 *
 * NOTA DE CALIBRAÇÃO: cobre os artigos do maestro (armações, óculos de sol e
 * lentes de contacto/stock). As **lentes graduadas de laboratório** (feitas por
 * encomenda) NÃO existem na tabela Articulos — referenciam um `Codigo_producto`
 * (ex. `152716`) de um catálogo de lentes que a API REST não expõe (não há
 * tabela de compras/faturas de fornecedor). Essas linhas ficam SEM custo e não
 * entram na margem. Cobertura medida ≈64% das linhas / ≈41% do valor de venda
 * (Maio 2025) — a margem reportada é só sobre as vendas com custo conhecido.
 */
// ─── Cache em memória (corta chamadas repetidas à API, que é lenta/serializada) ─
const ARTICLE_TTL_MS = 30 * 60_000; // catálogo/clientes mudam pouco → 30 min
const VENTAS_TTL_MS = 60_000; // vendas → 1 min (dedupe entre agregados da mesma página)
const ventasCache = new Map<string, { promise: Promise<VisualVenta[]>; expires: number }>();

function articleInfo(a: VisualArticulo): ArticleInfo {
  const price = num(a.Precio_venta);
  return {
    cost: num(a.Precio_compra),
    price,
    pvp: price * (1 + num(a.IVA) / 100),
    category: categoryFromClase(a.Clase_producto),
    brand: a.Marca ?? "",
    description: a.Descripcion ?? a.Producto ?? "",
    claseProducto: a.Clase_producto,
  };
}

const ARTICLE_FIELDS = [
  "Codigo", "Centro", "Clase_producto", "Marca",
  "Descripcion", "Producto", "Precio_compra", "Precio_venta", "IVA",
];

/** Códigos (normalizados a 13 díg) referenciados nas linhas de um conjunto de vendas.
 *  Só `Codigo_articulo`: o `Codigo_producto` é outro espaço de códigos e ia buscar ao
 *  maestro artigos que não são os da linha (ver `articleForLine`). */
function collectArticleCodes(ventas: VisualVenta[]): Set<string> {
  const s = new Set<string>();
  for (const v of ventas) {
    for (const l of v.lineas ?? []) {
      const a = norm13(l.Codigo_articulo);
      if (a) s.add(a);
    }
  }
  return s;
}

/**
 * Índice só dos artigos indicados (filtro OR por Codigo, em lotes). MUITO mais
 * rápido que carregar o catálogo inteiro quando só interessam os artigos
 * vendidos no período.
 */
async function loadArticleIndexFor(codes: Iterable<string>): Promise<Map<string, ArticleInfo>> {
  const unique = [...new Set([...codes])].filter(Boolean);
  const index = new Map<string, ArticleInfo>();
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const filter = chunk.map((c) => `Codigo eq '${c}'`).join(" or ");
    const arts = await select<VisualArticulo>("Articulos", { filter, fields: ARTICLE_FIELDS, top: CHUNK });
    for (const a of arts) {
      const info = articleInfo(a);
      index.set(String(a.Codigo), info);
      const n = norm13(a.Codigo);
      if (n) index.set(n, info);
    }
  }
  return index;
}

// Índice de artigos por período (só os vendidos), cacheado por intervalo.
const rangeArticleCache = new Map<string, { promise: Promise<Map<string, ArticleInfo>>; expires: number }>();

/** Índice de artigos referenciados pelas vendas de um intervalo (rápido + cacheado). */
async function articleIndexForRange(from: string, to: string): Promise<Map<string, ArticleInfo>> {
  const key = `${from}|${to}`;
  const hit = rangeArticleCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    const ventas = await fetchVentasRaw(from, to);
    return loadArticleIndexFor(collectArticleCodes(ventas));
  })().catch((e) => {
    rangeArticleCache.delete(key);
    throw e;
  });
  rangeArticleCache.set(key, { promise, expires: Date.now() + VENTAS_TTL_MS });
  return promise;
}

/**
 * Resolve o artigo de uma linha, SÓ por `Codigo_articulo` (cru ou normalizado).
 *
 * ⚠️ NÃO procurar pelo `Codigo_producto`: é OUTRO espaço de códigos e a forma
 * normalizada colide com códigos de artigo reais. Medido (semana 06-11/07/2026):
 * o produto `0000000006@1` é a lente BIOFINITY TORICA XR mas o artigo
 * `0000000000006` é o líquido SOLO CARE AQUA — **81 das 172 linhas de LC**
 * apanhavam assim um artigo errado, e o seu `Precio_compra` falso ganhava ao custo
 * REAL da entrada/fatura em `lineCostNet` (margem, marca e PVP das LC errados).
 * O `VX_PRODUCTOS` também não resolve por código: a chave `0000000009@1` tem 9
 * produtos de fornecedores diferentes, com PVO de 8,30€ a 86€.
 *
 * Devolve undefined para as linhas que só trazem `Codigo_producto` (lentes de
 * laboratório, LC de encomenda, serviços) — o custo dessas vem da cadeia
 * entrada→fatura (`entryCosts`), que é a fonte com autoridade. Medido: assim
 * 165/172 linhas de LC ficam com custo CORRETO (antes: 81 falsos).
 */
function articleForLine(
  l: VisualVentaLinea,
  articles: Map<string, ArticleInfo>,
): ArticleInfo | undefined {
  if (!l.Codigo_articulo) return undefined;
  return articles.get(String(l.Codigo_articulo)) ?? articles.get(norm13(l.Codigo_articulo));
}

// ─── Metadados por linha via OData (VX_LINEAS_VENTA) ──────────────────────────
// A REST não devolve a classe da linha nem o fornecedor; o OData sim. Mapa
// (codVenta-codLinha)→{clase, proveedor}, cacheado por período. UMA só chamada
// alimenta lineClasses E lineProviders. Sem OData ou em erro → mapa vazio.
interface LineMeta { clase: string; proveedor: string }
const lineMetaCache = new Map<string, { promise: Promise<Map<string, LineMeta>>; expires: number }>();

async function lineMeta(from: string, to: string): Promise<Map<string, LineMeta>> {
  if (!isOdataConfigured()) return new Map();
  const key = `${from}|${to}`;
  const hit = lineMetaCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    const ventas = await fetchVentasRaw(from, to);
    const codes = [...new Set(ventas.map((v) => String(v.Codigo)))].filter(Boolean);
    const map = new Map<string, LineMeta>();
    const centro = process.env.VISUAL_CENTRO;
    const CHUNK = 50;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const ors = codes.slice(i, i + CHUNK).map((c) => `CODIGO_VENTA eq ${c}`).join(" or ");
      const filter = `${centro ? `CENTRO_VENTA eq ${centro} and ` : ""}(${ors})`;
      const rows = await odataSelect<{ CODIGO_VENTA: number; CODIGO_LINEA: number; CLASE_PRODUCTO: string; PROVEEDOR: string }>(
        "VX_LINEAS_VENTA",
        { filter, select: ["CODIGO_VENTA", "CODIGO_LINEA", "CLASE_PRODUCTO", "PROVEEDOR"] },
      );
      for (const r of rows) map.set(`${r.CODIGO_VENTA}-${r.CODIGO_LINEA}`, { clase: r.CLASE_PRODUCTO, proveedor: r.PROVEEDOR });
    }
    return map;
  })().catch((e) => {
    lineMetaCache.delete(key);
    console.error("lineMeta (OData) falhou — fallback ao maestro:", e instanceof Error ? e.message : e);
    return new Map<string, LineMeta>();
  });
  lineMetaCache.set(key, { promise, expires: Date.now() + VENTAS_TTL_MS });
  return promise;
}

/** Classe (CLASE_PRODUCTO) por linha de venda. */
async function lineClasses(from: string, to: string): Promise<Map<string, string>> {
  const meta = await lineMeta(from, to);
  const m = new Map<string, string>();
  for (const [k, v] of meta) if (v.clase) m.set(k, v.clase);
  return m;
}

/** Fornecedor (PROVEEDOR) por linha de venda — fonte da MARCA das lentes (lab incluído). */
async function lineProviders(from: string, to: string): Promise<Map<string, string>> {
  const meta = await lineMeta(from, to);
  const m = new Map<string, string>();
  for (const [k, v] of meta) if (v.proveedor) m.set(k, v.proveedor.trim());
  return m;
}

/**
 * Categoria de uma linha de venda (Modelo B). Prioridade:
 *  1. código na lista de Saúde Ocular → "saude_ocular";
 *  2. CLASE_PRODUCTO da linha (OData) → categoryFromClase;
 *  3. fallback ao maestro (artigo) quando não há OData;
 *  4. "diversos".
 */
function lineCategory(
  v: VisualVenta,
  l: VisualVentaLinea,
  classMap: Map<string, string>,
  saude: Set<string>,
  articles: Map<string, ArticleInfo>,
): SaleCategory {
  // ⚠️ SÓ por `Codigo_articulo`: `Codigo_producto` é OUTRO espaço de códigos e a sua
  // forma normalizada colide com códigos de artigo reais (medido: o produto
  // `0000000006@1` é a lente BIOFINITY TORICA XR, mas o artigo `0000000000006` é o
  // líquido SOLO CARE AQUA → as LC caíam em "Saúde Ocular"). As linhas de saúde
  // ocular trazem sempre `Codigo_articulo` (32/32 na semana medida), logo não se perde
  // nada. Ver a mesma armadilha em `articleForLine`.
  const a = norm13(l.Codigo_articulo);
  if (a && saude.has(a)) return "saude_ocular";
  const clase = classMap.get(`${v.Codigo}-${l.Codigo_linea}`) ?? articleForLine(l, articles)?.claseProducto ?? null;
  return categoryFromClase(clase);
}

// Cache do mapa de custos de entrada (lentes de lab) por período.
const entryCostCache = new Map<string, { promise: Promise<Map<string, number>>; expires: number }>();

/** Custo real por linha de venda (entradas do laboratório), cacheado por período. */
async function lineEntryCosts(from: string, to: string): Promise<Map<string, number>> {
  if (!isOdataConfigured()) return new Map();
  const key = `${from}|${to}`;
  const hit = entryCostCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    const ventas = await fetchVentasRaw(from, to);
    const codes = [...new Set(ventas.map((v) => Number(v.Codigo)))].filter(Boolean);
    return lineEntryCostsForVentas(codes);
  })().catch((e) => {
    entryCostCache.delete(key);
    console.error("lineEntryCosts (OData) falhou:", e instanceof Error ? e.message : e);
    return new Map<string, number>();
  });
  entryCostCache.set(key, { promise, expires: Date.now() + VENTAS_TTL_MS });
  return promise;
}

/**
 * Custo e venda líquida de uma linha COM custo conhecido. O custo vem do maestro
 * (Precio_compra) ou, em falta (ex.: lentes graduadas de laboratório), do custo
 * REAL da entrada do fornecedor (`entryCosts`, via VX_LINEAS_ENTRADA). Só devolve
 * null quando NENHUMA fonte tem custo — aí a linha entra nas vendas mas não na margem.
 */
function lineCostNet(
  v: VisualVenta,
  l: VisualVentaLinea,
  articles: Map<string, ArticleInfo>,
  globalDiscRatio: number,
  entryCosts?: Map<string, number>,
): { cost: number; net: number } | null {
  const qty = num(l.Cantidad);
  const gross = num(l.Precio_unitario) * qty;
  const net = gross - num(l.Importe_descuento) - gross * globalDiscRatio;
  const art = articleForLine(l, articles);
  if (art && art.cost > 0) return { cost: art.cost * qty, net };
  if (entryCosts) {
    const ec = entryCosts.get(`${v.Codigo}-${l.Codigo_linea}`);
    if (ec && ec > 0) return { cost: ec, net };
  }
  return null;
}

/** Nº de unidades premium numa venda (armações/sol classe G/S com PVP > limiar). */
function premiumUnits(v: VisualVenta, articles: Map<string, ArticleInfo>): number {
  let n = 0;
  for (const l of v.lineas) {
    const art = articleForLine(l, articles);
    if (art && (art.claseProducto === "G" || art.claseProducto === "S") && art.pvp > PREMIUM_MIN_PVP) {
      n += num(l.Cantidad);
    }
  }
  return n;
}

// ─── Métricas por venda (líquido, custo, desconto, margem) ────────────────────

interface VentaMetrics {
  gross: number; // bruto (antes de descontos), ex-IVA
  discount: number; // desconto global + linhas
  net: number; // gross - discount (TODAS as linhas)
  coveredNet: number; // venda líquida só das linhas com custo conhecido
  cost: number; // custo dos artigos (Precio_compra) das linhas cobertas
  margin: number; // coveredNet - cost (margem só onde há custo)
}

function ventaMetrics(v: VisualVenta, articles: Map<string, ArticleInfo>, entryCosts?: Map<string, number>): VentaMetrics {
  // Venda líquida (ref.): Importe_bruto − Importe_descuento_lineas − Importe_DescuentoGlobal.
  const gross = num(v.Importe_bruto);
  const discount = num(v.Importe_descuento_lineas) + num(v.Importe_DescuentoGlobal);
  const net = gross - discount;
  // Custo e venda coberta: linhas com custo (maestro ou entrada do laboratório).
  const ratio = lineDiscountRatio(v);
  let cost = 0;
  let coveredNet = 0;
  for (const l of v.lineas) {
    const cn = lineCostNet(v, l, articles, ratio, entryCosts);
    if (cn) {
      cost += cn.cost;
      coveredNet += cn.net;
    }
  }
  return { gross, discount, net, coveredNet, cost, margin: coveredNet - cost };
}

/** Vai buscar as ventas reais (não orçamentos) de um intervalo, filtradas por centro. */
/** Vendas cruas (incl. orçamentos) de um intervalo — cacheadas por período. */
async function fetchVentasRaw(from: string, to: string): Promise<VisualVenta[]> {
  const key = `${from}|${to}`;
  const hit = ventasCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const filter = [dateRangeFilter("Fecha", new Date(from), new Date(to)), centroFilter()]
    .filter(Boolean)
    .join(" and ");
  const promise = selectAll<VisualVenta>("Ventas", { filter, orderby: "Fecha desc" }, 2000).catch((e) => {
    ventasCache.delete(key);
    throw e;
  });
  ventasCache.set(key, { promise, expires: Date.now() + VENTAS_TTL_MS });
  return promise;
}

/**
 * Valor líquido do documento de venda (ex-IVA): bruto − descontos de linha −
 * desconto global. Igual ao `net` de `ventaMetrics`.
 */
function ventaNet(v: VisualVenta): number {
  return num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);
}

/**
 * Uma "venda" (como o Visual/POS a conta) = documento NÃO-orçamento com valor
 * líquido POSITIVO. Exclui os abonos/devoluções (referência "A/…", net < 0) e os
 * documentos a 0€ (entregas/ajustes). Sem este filtro contávamos ~37 documentos a
 * mais e subtraíamos os abonos ao total — dando 280 vendas / 61.038€ em vez dos
 * 242 vendas / 63.210€ que o Visual mostra (validado jul/2026).
 */
function isRealSale(v: VisualVenta): boolean {
  return v.Es_presupuesto !== "S" && ventaNet(v) > 0;
}

async function fetchVentas(from: string, to: string, includePresupuestos = false): Promise<VisualVenta[]> {
  const ventas = await fetchVentasRaw(from, to);
  return includePresupuestos ? ventas : ventas.filter(isRealSale);
}

/**
 * Fetch de vendas reais para varreduras LONGAS (ex.: recall clínico, 3 anos).
 *
 * A API é lenta e paginar por OFFSET (top/skip) degrada muito: cada página fica
 * progressivamente mais lenta (o Oracle re-ordena+salta N linhas) e as últimas
 * acabam por rebentar o timeout de 25s — foi o que zerava o recall (o `selectAll`
 * lança em qualquer falha de página). Aqui paginamos por **JANELA DE TEMPO (mês a
 * mês)**: cada query é pequena e de tempo ~constante (sempre dentro do timeout,
 * sem degradação), com **retry** e **resiliência por janela** (uma janela falhada
 * é ignorada → resultado parcial, nunca vazio total). Filtra a vendas reais
 * (exclui orçamentos e abonos) à medida que pagina.
 */
async function fetchRealVentasLongScan(from: string, to: string): Promise<VisualVenta[]> {
  const out: VisualVenta[] = [];
  const end = new Date(to);
  let ws = new Date(from);
  while (ws < end) {
    const nextMonth = new Date(ws.getFullYear(), ws.getMonth() + 1, ws.getDate());
    const we = nextMonth < end ? nextMonth : end;
    const filter = [dateRangeFilter("Fecha", ws, we), centroFilter()].filter(Boolean).join(" and ");
    try {
      // Dentro de uma janela mensal raramente há >1000 ventas; ainda assim pagina
      // (com offset PEQUENO, sempre limitado à janela → sem degradação global).
      let skip = 0;
      for (let p = 0; p < 20; p++) {
        let batch: VisualVenta[] | null = null;
        for (let attempt = 0; attempt < 3 && batch === null; attempt++) {
          try {
            batch = await select<VisualVenta>("Ventas", { filter, orderby: "Fecha desc", top: 1000, skip });
          } catch (e) {
            if (attempt === 2) throw e;
          }
        }
        if (!batch) break;
        for (const v of batch) if (isRealSale(v)) out.push(v);
        if (batch.length < 1000) break;
        skip += 1000;
      }
    } catch (e) {
      console.warn(`fetchRealVentasLongScan: janela ${isoDay(ws)}..${isoDay(we)} falhou (${e instanceof Error ? e.message : e}); ignorada (recall parcial).`);
    }
    ws = we;
  }
  return out;
}

// Lista de colaboradores (Usuario distintos), cacheada — para o filtro global.
let employeesCache: { promise: Promise<{ value: string; label: string }[]>; expires: number } | null = null;

export async function listEmployees(): Promise<{ value: string; label: string }[]> {
  if (employeesCache && employeesCache.expires > Date.now()) return employeesCache.promise;
  const promise = (async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1); // últimos ~3 meses (vendedores ativos)
    const filter = [dateRangeFilter("Fecha", from, now), centroFilter()].filter(Boolean).join(" and ");
    // Payload leve, mas a API exige que TODO o campo do filtro (Fecha, Centro)
    // conste em `fields` — senão devolve 500 "field can't be used inside the where clause".
    const ventas = await selectAll<VisualVenta>(
      "Ventas",
      { filter, fields: ["Usuario", "Fecha", "Centro"] },
      2000,
    );
    const set = new Set<string>();
    for (const v of ventas) if (v.Usuario) set.add(v.Usuario);
    return [...set].sort().map((u) => ({ value: u, label: u }));
  })().catch((e) => {
    employeesCache = null;
    throw e;
  });
  employeesCache = { promise, expires: Date.now() + ARTICLE_TTL_MS };
  return promise;
}

// ─── Mappers públicos ─────────────────────────────────────────────────────────

export async function salesSummary(from: string, to: string): Promise<SalesSummary> {
  const [ventas, allWithQuotes, articles, entryCosts, convertedCodes] = await Promise.all([
    fetchVentas(from, to),
    fetchVentas(from, to, true),
    articleIndexForRange(from, to),
    lineEntryCosts(from, to),
    convertedBudgetCodes(from, to),
  ]);
  const m = ventas.map((v) => ventaMetrics(v, articles, entryCosts));
  const total_sales = m.reduce((s, x) => s + x.net, 0);
  const covered_sales = m.reduce((s, x) => s + x.coveredNet, 0);
  const total_cost = m.reduce((s, x) => s + x.cost, 0);
  // Margem só sobre as vendas com custo conhecido (lentes de lab não entram).
  const total_margin = covered_sales - total_cost;
  const total_discount = m.reduce((s, x) => s + x.discount, 0);
  const num_sales = ventas.length;
  // Conversão REAL = orçamentos que geraram encomenda ÷ orçamentos feitos no período
  // (convertido = a linha do orçamento ganhou CODIGO_ENCARGO).
  const budgets = allWithQuotes.filter((v) => v.Es_presupuesto === "S");
  const convertedQuotes = budgets.filter((v) => convertedCodes.has(String(v.Codigo))).length;
  const conversion_rate = budgets.length > 0 ? (convertedQuotes / budgets.length) * 100 : 0;
  return {
    total_sales: round(total_sales),
    total_cost: round(total_cost),
    total_margin: round(total_margin),
    margin_pct: covered_sales > 0 ? round((total_margin / covered_sales) * 100) : 0,
    cobertura_pct: total_sales > 0 ? round((covered_sales / total_sales) * 100) : 0,
    avg_ticket: num_sales > 0 ? round(total_sales / num_sales) : 0,
    num_sales,
    total_discount: round(total_discount),
    conversion_rate: round(conversion_rate),
  };
}

/**
 * Resumo LEVE de vendas — só métricas que vêm dos campos da venda (REST), SEM
 * carregar artigos nem OData (margem). Uma única ida às Ventas (cacheada). Rápido,
 * para os KPIs de vendas aparecerem quase de imediato (a margem carrega à parte).
 */
export async function salesSummaryLight(from: string, to: string): Promise<Pick<SalesSummary, "total_sales" | "avg_ticket" | "num_sales" | "conversion_rate" | "total_discount">> {
  const all = await fetchVentas(from, to, true); // raw cacheado, inclui orçamentos
  const ventas = all.filter(isRealSale); // vendas reais (net > 0), como o Visual conta
  let total_sales = 0, total_discount = 0;
  for (const v of ventas) {
    total_sales += ventaNet(v);
    total_discount += num(v.Importe_descuento_lineas) + num(v.Importe_DescuentoGlobal);
  }
  const num_sales = ventas.length;
  const quotes = all.filter((v) => v.Es_presupuesto === "S").length;
  const conversion_rate = num_sales + quotes > 0 ? (num_sales / (num_sales + quotes)) * 100 : 0;
  return {
    total_sales: round(total_sales),
    avg_ticket: num_sales > 0 ? round(total_sales / num_sales) : 0,
    num_sales,
    conversion_rate: round(conversion_rate),
    total_discount: round(total_discount),
  };
}

export async function salesByCategory(from: string, to: string, saudeCodes: Iterable<string> = []) {
  const [ventas, articles, classMap, entryCosts] = await Promise.all([
    fetchVentas(from, to),
    articleIndexForRange(from, to),
    lineClasses(from, to),
    lineEntryCosts(from, to),
  ]);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));
  const acc = new Map<
    SaleCategory,
    { sales: number; coveredSales: number; cost: number; quantity: number }
  >();
  for (const v of ventas) {
    const discountRatio = lineDiscountRatio(v);
    for (const l of v.lineas) {
      const cat = lineCategory(v, l, classMap, saude, articles);
      const qty = num(l.Cantidad);
      const lineNet = num(l.Precio_unitario) * qty - num(l.Importe_descuento) - num(l.Precio_unitario) * qty * discountRatio;
      const cn = lineCostNet(v, l, articles, discountRatio, entryCosts);
      const cur = acc.get(cat) ?? { sales: 0, coveredSales: 0, cost: 0, quantity: 0 };
      cur.sales += lineNet; // todas as linhas (lentes incluídas)
      if (cn) {
        cur.coveredSales += cn.net; // só linhas com custo conhecido
        cur.cost += cn.cost;
      }
      cur.quantity += qty;
      acc.set(cat, cur);
    }
  }
  return [...acc.entries()].map(([category, x]) => ({
    category,
    label: CATEGORY_LABELS[category],
    sales: round(x.sales),
    // Margem % só sobre as vendas cobertas (com custo) da categoria.
    margin_pct: x.coveredSales > 0 ? round(((x.coveredSales - x.cost) / x.coveredSales) * 100) : 0,
    quantity: x.quantity,
    avg_ticket: x.quantity > 0 ? round(x.sales / x.quantity) : 0,
  }));
}

// ─── Agregados DIÁRIOS (para somar qualquer intervalo a partir do Supabase) ──────

export interface DayAggregate {
  total_sales: number; covered_sales: number; total_cost: number; total_discount: number;
  num_sales: number; quotes: number;
  /** orçamentos feitos nesse dia que geraram encomenda (conversão real).
   *  Opcional: snapshots diários antigos não o têm (fallback à aproximação). */
  quotes_converted?: number;
  byCategory: Record<string, { sales: number; coveredSales: number; cost: number; quantity: number }>;
  byEmployee: Record<string, { sales: number; num: number }>;
}

/** Data local de Lisboa (YYYY-MM-DD) — consistente quer corra no PC quer na Vercel. */
function dayKeyLisbon(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Calcula agregados POR DIA para um intervalo. Faz UMA ida à API pelo intervalo todo
 * (ex.: um mês) e distribui as linhas por dia localmente — eficiente para o backfill.
 * Guarda primitivas ADITIVAS (somáveis); as métricas derivadas (margem %, ticket)
 * recalculam-se ao somar os dias.
 */
export async function computeDailyForRange(from: string, to: string, saudeCodes: Iterable<string> = []): Promise<Map<string, DayAggregate>> {
  const [all, articles, classMap, entryCosts, convertedCodes] = await Promise.all([
    fetchVentas(from, to, true),
    articleIndexForRange(from, to),
    lineClasses(from, to),
    lineEntryCosts(from, to),
    convertedBudgetCodes(from, to), // orçamentos que geraram encomenda (conversão real)
  ]);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));
  const map = new Map<string, DayAggregate>();
  const blank = (): DayAggregate => ({ total_sales: 0, covered_sales: 0, total_cost: 0, total_discount: 0, num_sales: 0, quotes: 0, quotes_converted: 0, byCategory: {}, byEmployee: {} });
  for (const v of all) {
    const d = parseDate(v.Fecha);
    if (!d) continue;
    const day = dayKeyLisbon(d);
    let agg = map.get(day);
    if (!agg) { agg = blank(); map.set(day, agg); }
    if (v.Es_presupuesto === "S") {
      agg.quotes += 1;
      if (convertedCodes.has(String(v.Codigo))) agg.quotes_converted = (agg.quotes_converted ?? 0) + 1;
      continue;
    }
    if (ventaNet(v) <= 0) continue; // ignora abonos/documentos a 0€ (ver isRealSale)
    const vm = ventaMetrics(v, articles, entryCosts);
    agg.total_sales += vm.net; agg.covered_sales += vm.coveredNet; agg.total_cost += vm.cost; agg.total_discount += vm.discount; agg.num_sales += 1;
    const u = v.Usuario || "—";
    const e = agg.byEmployee[u] ?? { sales: 0, num: 0 }; e.sales += vm.net; e.num += 1; agg.byEmployee[u] = e;
    const ratio = lineDiscountRatio(v);
    for (const l of v.lineas) {
      const cat = lineCategory(v, l, classMap, saude, articles);
      const qty = num(l.Cantidad);
      const lineNet = num(l.Precio_unitario) * qty - num(l.Importe_descuento) - num(l.Precio_unitario) * qty * ratio;
      const cn = lineCostNet(v, l, articles, ratio, entryCosts);
      const c = agg.byCategory[cat] ?? { sales: 0, coveredSales: 0, cost: 0, quantity: 0 };
      c.sales += lineNet; if (cn) { c.coveredSales += cn.net; c.cost += cn.cost; } c.quantity += qty;
      agg.byCategory[cat] = c;
    }
  }
  return map;
}

export interface BrandRow { brand: string; sales: number; margin_pct: number; qty: number; second_pair_sales: number }

/**
 * Top marcas por categoria (Lentes Oftálmicas e Armações) a partir das vendas
 * reais. **Lentes**: a marca vem do `PROVEEDOR` da linha (OData) — ex. HOYA,
 * LUXOTTICA — que existe para TODAS as lentes (incl. as de laboratório que não
 * estão no maestro). **Armações**: marca do maestro (Articulos.Marca).
 * `second_pair_sales` = nº de vendas dessa marca que foram 2º par (graduado + sol).
 * Ordenado por QUANTIDADE vendida.
 */
export async function topBrands(
  from: string,
  to: string,
  saudeCodes: Iterable<string> = [],
): Promise<Record<"lentes_oftalmicas" | "armacoes", BrandRow[]>> {
  const [ventas, articles, classMap, providers, entryCosts] = await Promise.all([
    fetchVentas(from, to),
    articleIndexForRange(from, to),
    lineClasses(from, to),
    lineProviders(from, to),
    lineEntryCosts(from, to),
  ]);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));
  const accOf = () => new Map<string, { sales: number; coveredSales: number; cost: number; qty: number; secondPairVentas: Set<string> }>();
  const buckets: Record<"lentes_oftalmicas" | "armacoes", ReturnType<typeof accOf>> = {
    lentes_oftalmicas: accOf(), armacoes: accOf(),
  };
  for (const v of ventas) {
    const ratio = lineDiscountRatio(v);
    // 1ª passagem: a venda é 2º par? (tem graduado E óculos de sol — par adicional)
    let hasGrad = false, hasSun = false;
    for (const l of v.lineas) {
      const c = lineCategory(v, l, classMap, saude, articles);
      if (c === "lentes_oftalmicas") hasGrad = true;
      else if (c === "oculos_sol") hasSun = true;
    }
    const isSecondPair = hasGrad && hasSun;
    // 2ª passagem: acumula por marca (lentes→PROVEEDOR, armações→maestro).
    for (const l of v.lineas) {
      const cat = lineCategory(v, l, classMap, saude, articles);
      if (cat !== "lentes_oftalmicas" && cat !== "armacoes") continue;
      const art = articleForLine(l, articles);
      const brand = cat === "lentes_oftalmicas"
        ? (providers.get(`${v.Codigo}-${l.Codigo_linea}`) || art?.brand || "").trim() || "Outros"
        : (art?.brand || "").trim() || "Outros";
      const qty = num(l.Cantidad);
      const gross = num(l.Precio_unitario) * qty;
      const net = gross - num(l.Importe_descuento) - gross * ratio;
      const cn = lineCostNet(v, l, articles, ratio, entryCosts);
      const m = buckets[cat];
      const cur = m.get(brand) ?? { sales: 0, coveredSales: 0, cost: 0, qty: 0, secondPairVentas: new Set<string>() };
      cur.sales += net; cur.qty += qty;
      if (cn) { cur.coveredSales += cn.net; cur.cost += cn.cost; }
      if (isSecondPair) cur.secondPairVentas.add(String(v.Codigo));
      m.set(brand, cur);
    }
  }
  const top = (m: ReturnType<typeof accOf>): BrandRow[] =>
    [...m.entries()]
      .map(([brand, x]) => ({ brand, sales: round(x.sales), qty: x.qty, second_pair_sales: x.secondPairVentas.size, margin_pct: x.coveredSales > 0 ? round(((x.coveredSales - x.cost) / x.coveredSales) * 100) : 0 }))
      .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
      .slice(0, 8);
  return { lentes_oftalmicas: top(buckets.lentes_oftalmicas), armacoes: top(buckets.armacoes) };
}

/**
 * Vendas líquidas (€) repartidas pelas categorias de OBJETIVO do mês:
 * `global` (total), `oculos_graduados` (= lentes oftálmicas L + armações G),
 * `oculos_sol` (S), `lentes_contacto` (C) e `saude_ocular` (códigos ∈ `saudeCodes`).
 *
 * Saúde ocular NÃO é uma categoria da API — é um subconjunto de produtos
 * (lágrimas, líquidos de manutenção) definido pelo dono por lista de códigos.
 * Casa-se ao nível da linha por `Codigo_articulo`/`Codigo_producto` normalizados.
 */
export async function salesByTargetCategory(
  from: string,
  to: string,
  saudeCodes: Iterable<string>,
): Promise<Record<"global" | "oculos_graduados" | "oculos_sol" | "lentes_contacto" | "saude_ocular", number>> {
  const [ventas, articles, classMap] = await Promise.all([
    fetchVentas(from, to),
    articleIndexForRange(from, to),
    lineClasses(from, to),
  ]);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));
  const acc = { global: 0, oculos_graduados: 0, oculos_sol: 0, lentes_contacto: 0, saude_ocular: 0 };
  for (const v of ventas) {
    const discountRatio = lineDiscountRatio(v);
    for (const l of v.lineas) {
      const qty = num(l.Cantidad);
      const gross = num(l.Precio_unitario) * qty;
      const lineNet = gross - num(l.Importe_descuento) - gross * discountRatio;
      acc.global += lineNet;
      // Objetivo "Óculos Graduados" = negócio completo de graduados = lentes oftálmicas + armações.
      const cat = lineCategory(v, l, classMap, saude, articles);
      if (cat === "lentes_oftalmicas" || cat === "armacoes") acc.oculos_graduados += lineNet;
      else if (cat === "oculos_sol") acc.oculos_sol += lineNet;
      else if (cat === "lentes_contacto") acc.lentes_contacto += lineNet;
      else if (cat === "saude_ocular") acc.saude_ocular += lineNet;
    }
  }
  return {
    global: round(acc.global),
    oculos_graduados: round(acc.oculos_graduados),
    oculos_sol: round(acc.oculos_sol),
    lentes_contacto: round(acc.lentes_contacto),
    saude_ocular: round(acc.saude_ocular),
  };
}

/** Proporção do desconto global face ao bruto, para distribuir pelas linhas. */
function lineDiscountRatio(v: VisualVenta): number {
  const gross = v.lineas.reduce((s, l) => s + num(l.Precio_unitario) * num(l.Cantidad), 0);
  const globalDisc = num(v.Importe_DescuentoGlobal);
  return gross > 0 ? globalDisc / gross : 0;
}

export async function salesByEmployee(from: string, to: string) {
  const [ventas, quotes, articles, entryCosts, convertedCodes] = await Promise.all([
    fetchVentas(from, to),
    fetchVentas(from, to, true).then((all) => all.filter((v) => v.Es_presupuesto === "S")),
    articleIndexForRange(from, to),
    lineEntryCosts(from, to),
    convertedBudgetCodes(from, to), // orçamentos que geraram encomenda (conversão real)
  ]);
  const targets = employeeTargets();
  const byUser = new Map<
    string,
    { sales: number; coveredSales: number; cost: number; discount: number; count: number; quotesMade: number; quotesConv: number; premium: number }
  >();
  for (const v of ventas) {
    const u = v.Usuario || "—";
    const m = ventaMetrics(v, articles, entryCosts);
    const cur = byUser.get(u) ?? { sales: 0, coveredSales: 0, cost: 0, discount: 0, count: 0, quotesMade: 0, quotesConv: 0, premium: 0 };
    cur.sales += m.net;
    cur.coveredSales += m.coveredNet;
    cur.cost += m.cost;
    cur.discount += m.discount;
    cur.count += 1;
    cur.premium += premiumUnits(v, articles);
    byUser.set(u, cur);
  }
  // Orçamentos FEITOS vs CONVERTIDOS por vendedor (convertido = gerou encomenda).
  for (const q of quotes) {
    const u = q.Usuario || "—";
    const cur = byUser.get(u) ?? { sales: 0, coveredSales: 0, cost: 0, discount: 0, count: 0, quotesMade: 0, quotesConv: 0, premium: 0 };
    cur.quotesMade += 1;
    if (convertedCodes.has(String(q.Codigo))) cur.quotesConv += 1;
    byUser.set(u, cur);
  }
  return [...byUser.entries()]
    .map(([user, x]) => ({
      employee_id: user,
      name: user,
      sales_month: round(x.sales),
      margin_pct: x.coveredSales > 0 ? round(((x.coveredSales - x.cost) / x.coveredSales) * 100) : 0,
      avg_ticket: x.count > 0 ? round(x.sales / x.count) : 0,
      discount_avg: x.sales + x.discount > 0 ? round((x.discount / (x.sales + x.discount)) * 100) : 0,
      quotes_issued: x.quotesMade,        // orçamentos emitidos pelo vendedor
      quotes_converted: x.quotesConv,     // os que geraram encomenda (conversão real)
      premium_sold: x.premium,
      target: targets[user] ?? 0,
      sparkline: [] as number[],
    }))
    .sort((a, b) => b.sales_month - a.sales_month);
}

/**
 * Tendência do intervalo filtrado COMPARADA com o MESMO período do ano
 * anterior (alinhado por posição: dia-do-período ou mês-do-período). Ex.: um
 * filtro de mês compara o mês com o mesmo mês dos anos anteriores; um filtro
 * personalizado compara o intervalo com o intervalo homólogo de cada ano.
 * Granularidade diária para intervalos ≤ ~70 dias, mensal para maiores.
 * Devolve `{ years, data }` — uma série (linha) por ano com dados.
 */
const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DAY_MS = 86_400_000;
// Análise restrita a 2 anos (ano atual + 1 anterior, ex.: 2026 vs 2025).
// Menos fetches por ano = tendência mais rápida.
const TREND_PREV_YEARS = 1;

/** Desloca uma data por `delta` anos, mantendo mês/dia/hora (alinhamento homólogo). */
function shiftYears(d: Date, delta: number): Date {
  return new Date(d.getFullYear() + delta, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

export interface SalesTrend {
  years: number[];
  data: Array<{ label: string } & Record<string, number>>;
}

export async function salesTrend(from: string, to: string): Promise<SalesTrend> {
  const fromD = new Date(from);
  const toD = new Date(to);
  const rangeMs = Math.max(toD.getTime() - fromD.getTime(), DAY_MS);
  const daily = rangeMs <= 70 * DAY_MS;
  const baseYear = fromD.getFullYear();

  // Etiquetas dos buckets (alinhadas por posição no período).
  let labels: string[];
  if (daily) {
    const days = Math.ceil(rangeMs / DAY_MS);
    labels = Array.from({ length: days }, (_, i) => String(new Date(fromD.getTime() + i * DAY_MS).getDate()));
  } else {
    const months: number[] = [];
    const cursor = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
    while (cursor < toD) { months.push(cursor.getMonth()); cursor.setMonth(cursor.getMonth() + 1); }
    labels = months.map((m) => MONTHS_PT[m]);
  }
  const nBuckets = labels.length;

  const netOf = (v: VisualVenta) =>
    num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);

  // Para cada ano (atual + 1 anterior) acumula o net no mesmo índice de bucket.
  const perYear = await Promise.all(
    Array.from({ length: TREND_PREV_YEARS + 1 }, (_, k) => k).map(async (k) => {
      const f = k === 0 ? fromD : shiftYears(fromD, -k);
      const t = k === 0 ? toD : shiftYears(toD, -k);
      const ventas = await fetchVentas(k === 0 ? from : f.toISOString(), k === 0 ? to : t.toISOString());
      const values = new Array<number>(nBuckets).fill(0);
      for (const v of ventas) {
        const d = parseDate(v.Fecha); if (!d) continue;
        const i = daily
          ? Math.floor((d.getTime() - f.getTime()) / DAY_MS)
          : (d.getFullYear() - f.getFullYear()) * 12 + (d.getMonth() - f.getMonth());
        if (i >= 0 && i < nBuckets) values[i] += netOf(v);
      }
      return { year: baseYear - k, values };
    }),
  );

  // Ano atual sempre presente; anos anteriores só se tiverem dados (a loja pode ser recente).
  const include = perYear
    .filter((s) => s.year === baseYear || s.values.some((x) => x > 0))
    .sort((a, b) => a.year - b.year);
  const data = labels.map((label, i) => {
    const row: { label: string } & Record<string, number> = { label } as { label: string } & Record<string, number>;
    for (const s of include) row[String(s.year)] = round(s.values[i]);
    return row;
  });
  return { years: include.map((s) => s.year), data };
}

// ─── Pipeline / Orders ────────────────────────────────────────────────────────

/** Estado agregado de uma venda a partir dos estados das suas linhas. */
function orderStatusFromLines(v: VisualVenta): OrderStatus {
  if (v.Es_presupuesto === "S") return "orcamento_emitido";
  const estados = new Set(v.lineas.map((l) => l.Estado));
  const has = (...e: VisualEstadoLinea[]) => e.some((x) => estados.has(x));
  if (v.lineas.length > 0 && v.lineas.every((l) => l.Estado === "E")) return "entregue";
  if (has("T", "I")) return "pronta_entrega";
  if (has("C", "H", "J")) return "em_producao";
  return "orcamento_aceite";
}

// O Pipeline só considera encomendas/consultas a partir desta data (decisão do dono).
// Piso fixo — encomendas pendentes/atrasadas do início de 2026 não desaparecem por
// caírem fora de uma janela móvel de 3 meses.
const PIPELINE_SINCE = new Date(2026, 0, 1);

export async function pipeline(): Promise<PipelineStage[]> {
  const now = new Date();
  const start = PIPELINE_SINCE;
  const [ventasAll, eventos] = await Promise.all([
    fetchVentas(start.toISOString(), now.toISOString(), true),
    fetchEventos(start, now),
  ]);
  const stages: Record<OrderStatus, { count: number; value: number }> = {
    consulta_marcada: { count: 0, value: 0 },
    consulta_realizada: { count: 0, value: 0 },
    orcamento_emitido: { count: 0, value: 0 },
    orcamento_aceite: { count: 0, value: 0 },
    em_producao: { count: 0, value: 0 },
    pronta_entrega: { count: 0, value: 0 },
    entregue: { count: 0, value: 0 },
  };
  for (const v of ventasAll) {
    const st = orderStatusFromLines(v);
    stages[st].count += 1;
    stages[st].value += num(v.Importe_bruto) - num(v.Importe_DescuentoGlobal);
  }
  // Consultas a partir da agenda (marcadas = futuras, realizadas = passadas).
  for (const e of eventos) {
    const ini = parseDate(e.Inicio);
    if (!ini) continue;
    if (ini >= now) stages.consulta_marcada.count += 1;
    else stages.consulta_realizada.count += 1;
  }
  const labels: Record<OrderStatus, string> = {
    consulta_marcada: "Consultas Marcadas",
    consulta_realizada: "Consultas Realizadas",
    orcamento_emitido: "Orçamentos Emitidos",
    orcamento_aceite: "Orçamentos Aceites",
    em_producao: "Em Produção",
    pronta_entrega: "Prontas para Entrega",
    entregue: "Entregues",
  };
  return (Object.keys(labels) as OrderStatus[]).map((status) => ({
    status,
    label: labels[status],
    count: stages[status].count,
    value: round(stages[status].value),
  }));
}

export async function orders(): Promise<Order[]> {
  const now = new Date();
  const start = PIPELINE_SINCE; // desde 01/01/2026 (decisão do dono)
  const ventas = await fetchVentas(start.toISOString(), now.toISOString(), true);
  // Nomes/contactos SÓ dos clientes com encomendas (não os ~10k todos).
  const { names: clients, contacts } = await loadClientInfoFor(ventas.map((v) => `${v.Codigo_cliente}-${v.Centro_cliente}`));
  return ventas
    .filter((v) => orderStatusFromLines(v) !== "entregue")
    .map((v) => {
      const created = parseDate(v.Fecha);
      const expected = parseDate(v.Fecha_entrega);
      const daysInStatus = created ? daysBetween(now, created) : 0;
      const isOverdue = !!expected && expected < now;
      const ckey = `${v.Codigo_cliente}-${v.Centro_cliente}`;
      return {
        id: `${v.Codigo}-${v.Centro}`,
        client_id: ckey,
        client_name: clients.get(ckey) ?? v.Codigo_cliente,
        client_contact: contacts.get(ckey) ?? "",
        status: orderStatusFromLines(v),
        amount: round(num(v.Importe_bruto) - num(v.Importe_DescuentoGlobal)),
        created_at: isoDay(created) ?? "",
        expected_delivery: isoDay(expected),
        delivered_at: null,
        days_in_status: daysInStatus,
        is_overdue: isOverdue,
      } satisfies Order;
    });
}

// ─── Clientes de Lentes de Contacto (fidelização / reposição) ────────────────

export interface LcClient {
  client_id: string;
  client_name: string;
  client_contact: string;
  box: string;            // ex.: "cx30"
  last_purchase: string;  // ISO (data de entrega da última compra de LC)
  predicted_purchase: string; // ISO (data prevista de próxima compra)
  days_until: number;     // dias até à data prevista (negativo = em atraso)
}

/**
 * Caixa de LC → dias até à próxima compra + tipo (diária/mensal). Apanha os dois
 * formatos reais da descrição: `CX90`/`cx 3` e `90LC`/`3 LC` (nº + LC).
 *   30→diária(+30d), 90→diária(+90d), 3→mensal(+90d), 6→mensal(+180d).
 */
function lcBox(desc: string): { box: string; days: number; tipo: "diaria" | "mensal" } | null {
  const m = desc.match(/cx\s*(90|30|6|3)\b/i) ?? desc.match(/\b(90|30|6|3)\s*lc\b/i);
  if (!m) return null;
  const n = m[1];
  const map: Record<string, { days: number; tipo: "diaria" | "mensal" }> = {
    "30": { days: 30, tipo: "diaria" },
    "90": { days: 90, tipo: "diaria" },
    "3": { days: 90, tipo: "mensal" },
    "6": { days: 180, tipo: "mensal" },
  };
  const e = map[n];
  return e ? { box: `cx${n}`, days: e.days, tipo: e.tipo } : null;
}

/**
 * Clientes de Lentes de Contacto (para reposição). Identifica compras de LC pela
 * descrição (cx30/cx90 = diárias; cx3/cx6 = mensais), calcula a "data prevista de
 * compra" = data de entrega + dias da caixa, e devolve só clientes com a última
 * compra de LC há menos de 14 meses. Separado em diárias e mensais.
 */
export async function contactLensClients(): Promise<{ diarias: LcClient[]; mensais: LcClient[] }> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 14, now.getDate());
  const [ventas, names, contacts] = await Promise.all([
    fetchVentas(from.toISOString(), now.toISOString()),
    loadClientNameIndex(),
    loadClientContactIndex(),
  ]);
  // Por cliente, guarda a compra de LC mais recente (data + caixa).
  const latest = new Map<string, { date: Date; box: ReturnType<typeof lcBox> }>();
  for (const v of ventas) {
    const ckey = `${v.Codigo_cliente}-${v.Centro_cliente}`;
    for (const l of v.lineas) {
      const box = lcBox(l.Descripcion ?? "");
      if (!box) continue;
      const d = parseDate(l.Fecha_entrega) ?? parseDate(v.Fecha);
      if (!d) continue;
      const cur = latest.get(ckey);
      if (!cur || d > cur.date) latest.set(ckey, { date: d, box });
    }
  }
  const diarias: LcClient[] = [];
  const mensais: LcClient[] = [];
  for (const [ckey, { date, box }] of latest) {
    if (!box) continue;
    if (daysBetween(now, date) > 14 * 30) continue; // < 14 meses
    const predicted = new Date(date.getTime() + box.days * DAY_MS);
    const row: LcClient = {
      client_id: ckey,
      client_name: names.get(ckey) ?? ckey,
      client_contact: contacts.get(ckey) ?? "",
      box: box.box,
      last_purchase: isoDay(date) ?? "",
      predicted_purchase: isoDay(predicted) ?? "",
      days_until: Math.round((predicted.getTime() - now.getTime()) / DAY_MS),
    };
    (box.tipo === "diaria" ? diarias : mensais).push(row);
  }
  const byPredicted = (a: LcClient, b: LcClient) => a.predicted_purchase.localeCompare(b.predicted_purchase);
  return { diarias: diarias.sort(byPredicted), mensais: mensais.sort(byPredicted) };
}

// ─── Attach de tratamentos / progressivos (qualidade das lentes vendidas) ─────

export interface TreatmentAttach {
  total_lenses: number;
  progressive: number;
  progressive_pct: number;
  with_treatment: number;
  treatment_pct: number;
  byTreatment: { label: string; count: number }[];
}

/** Adesão a progressivos e tratamentos nas lentes oftálmicas vendidas no período. */
export async function treatmentAttach(from: string, to: string): Promise<TreatmentAttach> {
  const ventas = await fetchVentasRaw(from, to);
  const codes = [...new Set(ventas.filter((v) => v.Es_presupuesto !== "S").map((v) => Number(v.Codigo)))].filter(Boolean);
  const lines = await lensTreatmentLines(codes);
  const total = lines.length;
  // Progressivo = duas distâncias (ex.: "LEJOS Y CERCA", "INTERMEDIA Y CERCA").
  const progressive = lines.filter((l) => /\sY\s/i.test(l.tipo)).length;
  // Suplemento preenchido = tratamento escolhido no menu.
  const hasSup = (s: string) => !!s && s.trim() !== "" && !/^(stock|precalibrado)$/i.test(s.trim());
  // Determina o tratamento de uma linha: 1º o suplemento do menu; senão, nome de
  // tratamento embutido na própria descrição da lente (muitas vendas registam assim).
  const lineTreatment = (l: { sups: string[]; desc: string }): string | null => {
    const sup = l.sups.find(hasSup);
    if (sup) return sup.trim();
    const inDesc = treatmentFromDesc(l.desc);
    return inDesc;
  };
  let with_treatment = 0;
  const byT = new Map<string, number>();
  for (const l of lines) {
    const t = lineTreatment(l);
    if (t) with_treatment++;
    byT.set(t ?? "Sem tratamento", (byT.get(t ?? "Sem tratamento") ?? 0) + 1);
  }
  return {
    total_lenses: total,
    progressive,
    progressive_pct: total > 0 ? round((progressive / total) * 100) : 0,
    with_treatment,
    treatment_pct: total > 0 ? round((with_treatment / total) * 100) : 0,
    byTreatment: [...byT.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

// ─── Cross-sell: 2º par / óculos de sol graduados ────────────────────────────

export interface CrossSellLine { desc: string; qty: number; net: number }
export interface CrossSellRow {
  codigo: string;
  date: string;
  client_name: string;
  client_contact: string;
  value: number;        // venda líquida
  frame: string;        // marca da armação
  lens_type: string;    // descrição resumida da lente
  lines: CrossSellLine[];
}

/**
 * Núcleo partilhado: classifica cada venda em graduado/sol e devolve as que
 * cumprem o predicado. `mode="opportunity"` → graduado SEM sol (candidata a 2º
 * par); `mode="second_pair"` → graduado COM sol (2º par já realizado).
 * Classe da linha via OData (lineClasses) com fallback ao maestro/descrição.
 */
async function gradSunSales(from: string, to: string, mode: "opportunity" | "second_pair"): Promise<CrossSellRow[]> {
  const [ventas, classMap, articles] = await Promise.all([
    fetchVentas(from, to),
    lineClasses(from, to),
    articleIndexForRange(from, to),
  ]);
  // Nomes/contactos SÓ dos clientes deste período (não os ~10k todos).
  const { names, contacts } = await loadClientInfoFor(ventas.map((v) => `${v.Codigo_cliente}-${v.Centro_cliente}`));
  const out: CrossSellRow[] = [];
  for (const v of ventas) {
    const ratio = lineDiscountRatio(v);
    let hasGrad = false, hasSun = false;
    let frame = "", lensType = "";
    const lines: CrossSellLine[] = [];
    for (const l of v.lineas) {
      const desc = l.Descripcion ?? "";
      const clase = classMap.get(`${v.Codigo}-${l.Codigo_linea}`) ?? articleForLine(l, articles)?.claseProducto ?? "";
      if (clase === "L" || isGraduatedLensDesc(desc)) { hasGrad = true; if (!lensType) lensType = desc.replace(/^\s*O\.[DIE]\.?:\s*/i, "").slice(0, 40); }
      if (clase === "S") hasSun = true;
      if (clase === "G") { const art = articleForLine(l, articles); if (art?.brand && !frame) frame = art.brand; }
      const qty = num(l.Cantidad);
      const gross = num(l.Precio_unitario) * qty;
      lines.push({ desc: (desc || String(l.Codigo_producto ?? "")).slice(0, 60), qty, net: round(gross - num(l.Importe_descuento) - gross * ratio) });
    }
    const match = mode === "opportunity" ? (hasGrad && !hasSun) : (hasGrad && hasSun);
    if (match) {
      const ckey = `${v.Codigo_cliente}-${v.Centro_cliente}`;
      const net = num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);
      out.push({
        codigo: String(v.Codigo),
        date: isoDay(parseDate(v.Fecha)) ?? "",
        client_name: names.get(ckey) ?? v.Codigo_cliente,
        client_contact: contacts.get(ckey) ?? "",
        value: round(net),
        frame: frame || "—",
        lens_type: lensType || "—",
        lines,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Oportunidades de cross-sell: vendas com **óculos graduados** que NÃO levaram
 * óculos de sol → candidatas a 2º par / par de sol graduado.
 */
export function crossSellOpportunities(from: string, to: string): Promise<CrossSellRow[]> {
  return gradSunSales(from, to, "opportunity");
}

/**
 * Vendas com **2º par** já realizado: óculos graduados + óculos de sol na mesma
 * venda. Espelho do cross-sell (o resultado, não a oportunidade).
 */
export function secondPairSales(from: string, to: string): Promise<CrossSellRow[]> {
  return gradSunSales(from, to, "second_pair");
}

// ─── Recall clínico (optometria / contactologia) ─────────────────────────────

export interface RecallClient {
  client_id: string;
  client_name: string;
  client_contact: string;
  last_date: string;     // última compra do tipo (proxy da última consulta)
  days_since: number;    // dias desde então
}

/** Linha de lente de contacto? (descrição: caixa cx/NLC, marca de LC ou curva periférica CP). */
function isContactLensDesc(d: string): boolean {
  if (lcBox(d)) return true;
  return /\bCP:/i.test(d) || /\b(VISTASOFT|DAILIES|BIOTRUE|ACUVUE|AIR\s?OPTIX|BIOFINITY|1[\s-]?DAY|TOTAL\s?1|OASYS|PUREVISION|PROCLEAR)\b/i.test(d);
}
/**
 * Tenta extrair o nome de um tratamento embutido na descrição da lente.
 * Cobre anti-reflexo e coatings premium (Crizal, DuraVision, Hi-Vision, BlueControl…),
 * fotocromáticos e endurecidos. Devolve o nome encontrado ou null.
 * (Muitas vendas registam o tratamento na descrição em vez do menu de suplementos.)
 */
function treatmentFromDesc(d: string): string | null {
  if (!d) return null;
  const TREAT: { re: RegExp; label: string }[] = [
    { re: /duravision\s*(platinum|chrome|silver|gold|carat|sapphir\w*|flash|mirror)?/i, label: "DuraVision" },
    { re: /crizal\s*(sapphire|prevencia|forte|easy|alize|rock|drive|uv)?/i, label: "Crizal" },
    { re: /(super\s*)?hi-?vision|hvll|hvlux/i, label: "Hi-Vision" },
    { re: /blue\s*(control|uv|protect|guard)|bluecontrol|filtro\s*azul|luz\s*azul/i, label: "Blue (luz azul)" },
    { re: /transition|fotocrom\w*|photofusion|photochrom\w*/i, label: "Fotocromático" },
    { re: /\bhmc\b|\bsmc\b|\bemc\b|multicapa/i, label: "Multicamada (HMC)" },
    { re: /antirre?fle\w*|anti-?refle\w*|antirreflejo|\bA\.?R\.?\b/i, label: "Antirreflexo" },
    { re: /endurecid\w*|antirray\w*|antiarr\w*|hard\b/i, label: "Endurecido" },
    { re: /hidrof\w*|hydrophob\w*|lotus|cleancoat|clean\s*guard|lotutec/i, label: "Hidrofóbico" },
  ];
  for (const t of TREAT) if (t.re.test(d)) return t.label;
  return null;
}

/** Linha de lente graduada (oftálmica de prescrição)? */
function isGraduatedLensDesc(d: string): boolean {
  if (isContactLensDesc(d)) return false;
  return /^\s*O\.[DIE]\.?:/.test(d) || /\b(MONO\.?ORGANICO|ORGANICO|PROGRESIV|VARILUX|ORMIX|LOTUTEC|EYEZEN|HMC|BIFOCAL|PROG\.|PERFORMANCE|COMFORT\s+MAX)/i.test(d);
}

let _recallCache: { expires: number; promise: Promise<{ optometria: RecallClient[]; contactologia: RecallClient[] }> } | null = null;

/**
 * Recall clínico (proxy por compras — os exames estruturados não estão fiáveis na API):
 *  - Optometria: clientes cuja ÚLTIMA compra de lentes graduadas foi há +2 anos.
 *  - Contactologia: clientes cuja ÚLTIMA compra de lentes de contacto foi há +1 ano.
 * Janela de 3 anos. Cacheado 10 min (é análise de back-office, pesada).
 */
export async function clinicalRecall(): Promise<{ optometria: RecallClient[]; contactologia: RecallClient[] }> {
  if (_recallCache && _recallCache.expires > Date.now()) return _recallCache.promise;
  const promise = (async () => {
    const now = new Date();
    const from = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
    const [ventas, names, contacts] = await Promise.all([
      fetchRealVentasLongScan(from.toISOString(), now.toISOString()),
      loadClientNameIndex(),
      loadClientContactIndex(),
    ]);
    const lastOpto = new Map<string, Date>();
    const lastCl = new Map<string, Date>();
    for (const v of ventas) {
      const ckey = `${v.Codigo_cliente}-${v.Centro_cliente}`;
      const d = parseDate(v.Fecha);
      if (!d) continue;
      for (const l of v.lineas) {
        const desc = l.Descripcion ?? "";
        if (isContactLensDesc(desc)) {
          if (!lastCl.has(ckey) || d > lastCl.get(ckey)!) lastCl.set(ckey, d);
        } else if (isGraduatedLensDesc(desc)) {
          if (!lastOpto.has(ckey) || d > lastOpto.get(ckey)!) lastOpto.set(ckey, d);
        }
      }
    }
    const build = (m: Map<string, Date>, minDays: number): RecallClient[] =>
      [...m.entries()]
        .filter(([, d]) => daysBetween(now, d) > minDays)
        .map(([ckey, d]) => ({
          client_id: ckey,
          client_name: names.get(ckey) ?? ckey,
          client_contact: contacts.get(ckey) ?? "",
          last_date: isoDay(d) ?? "",
          days_since: daysBetween(now, d),
        }))
        .sort((a, b) => b.days_since - a.days_since);
    return { optometria: build(lastOpto, 730), contactologia: build(lastCl, 365) };
  })().catch((e) => {
    _recallCache = null;
    console.error("clinicalRecall falhou:", e instanceof Error ? e.message : e);
    return { optometria: [], contactologia: [] };
  });
  _recallCache = { expires: Date.now() + 10 * 60_000, promise };
  return promise;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export async function stock(): Promise<{ summary: StockSummary; items: StockItem[] }> {
  const now = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const [articles, lastSales, lastEntries] = await Promise.all([
    selectAll<VisualArticulo>("Articulos"),
    lastSaleByArticle(yearAgo, now),
    lastEntryByArticle(threeYearsAgo.toISOString()).catch(() => new Map<string, string>()),
  ]);
  const items: StockItem[] = articles
    .filter((a) => num(a.Existencias) > 0)
    .map((a) => {
      const cost = num(a.Precio_compra);
      const price = num(a.Precio_venta);
      const last = lastSales.get(norm13(a.Codigo)) ?? lastSales.get(String(a.Codigo)) ?? null;
      const daysWithout = last ? daysBetween(now, last) : 9999;
      const entryIso = lastEntries.get(norm13(a.Codigo)) ?? null;
      const entryDate = entryIso ? new Date(entryIso) : null;
      return {
        id: `${a.Codigo}-${a.Centro}`,
        codigo: String(a.Codigo),
        brand: a.Marca ?? "",
        model: a.Descripcion ?? a.Producto ?? a.Codigo,
        category: categoryFromClase(a.Clase_producto),
        cost,
        price,
        margin_pct: price > 0 ? round(((price - cost) / price) * 100) : 0,
        quantity: num(a.Existencias),
        last_sale_date: isoDay(last),
        days_without_sale: daysWithout,
        last_entry_date: entryDate ? isoDay(entryDate) : null,
        days_since_entry: entryDate ? daysBetween(now, entryDate) : 9999,
        type: (a.Familia_agrupacion1 ?? "").trim() || undefined,
        material: (a.Familia_agrupacion2 ?? "").trim() || undefined,
        gender: (a.Familia_agrupacion3 ?? "").trim() || undefined,
      } satisfies StockItem;
    });
  const summary: StockSummary = {
    total_items: items.reduce((s, i) => s + i.quantity, 0),
    total_value_cost: round(items.reduce((s, i) => s + i.cost * i.quantity, 0)),
    total_value_sale: round(items.reduce((s, i) => s + i.price * i.quantity, 0)),
    items_90d: items.filter((i) => i.days_without_sale > 90).length,
    items_180d: items.filter((i) => i.days_without_sale > 180).length,
    items_365d: items.filter((i) => i.days_without_sale > 365).length,
    avg_age_days: items.length
      ? Math.round(items.reduce((s, i) => s + Math.min(i.days_without_sale, 3650), 0) / items.length)
      : 0,
  };
  return { summary, items };
}

// Índice artigo (13 díg) → marca, a partir do maestro REST. Cacheado 10 min
// (catálogo muda devagar). Usado no pré-cálculo do histórico por marca.
let _brandIdxCache: { expires: number; promise: Promise<Map<string, string>> } | null = null;
function articleBrandIndex(): Promise<Map<string, string>> {
  if (_brandIdxCache && _brandIdxCache.expires > Date.now()) return _brandIdxCache.promise;
  const promise = (async () => {
    const articles = await selectAll<VisualArticulo>("Articulos");
    const m = new Map<string, string>();
    for (const a of articles) {
      const k = norm13(a.Codigo);
      if (k) m.set(k, (a.Marca ?? "").trim());
    }
    return m;
  })().catch((e) => { _brandIdxCache = null; throw e; });
  _brandIdxCache = { expires: Date.now() + 10 * 60_000, promise };
  return promise;
}

export interface BrandHistoryYearResult {
  year: number;
  brandSold: Record<string, number>;
  brandBought: Record<string, number>;
  /** marca → receita € vendida nesse ano (líquida). */
  brandRevenue: Record<string, number>;
  /** marca → custo € do vendido nesse ano (COSTE_TOTAL; fiável p/ armações/sol). */
  brandCost: Record<string, number>;
  soldByArticle: Record<string, number>;
}

/**
 * Histórico de UM ano (unidades + receita/custo € vendidos/comprados por marca +
 * vendido por artigo) para o snapshot `brand_history`. Pesado (varre vendas+entradas
 * do ano via OData) — pensado para correr no PC da loja pelo cron. O cron funde os anos.
 */
export async function brandHistoryYear(year: number): Promise<BrandHistoryYearResult> {
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();
  const brandOf = await articleBrandIndex();
  const soldByArt = await salesAggByArticle(from, to);
  const boughtByArt = await purchaseQtyByArticle(from, to);
  const brandSold: Record<string, number> = {};
  const brandBought: Record<string, number> = {};
  const brandRevenue: Record<string, number> = {};
  const brandCost: Record<string, number> = {};
  const soldByArticle: Record<string, number> = {};
  for (const [codigo, agg] of soldByArt) {
    soldByArticle[codigo] = agg.qty;
    const marca = brandOf.get(codigo) || "—";
    brandSold[marca] = (brandSold[marca] ?? 0) + agg.qty;
    brandRevenue[marca] = round((brandRevenue[marca] ?? 0) + agg.revenue);
    brandCost[marca] = round((brandCost[marca] ?? 0) + agg.cost);
  }
  for (const [codigo, qty] of boughtByArt) {
    const marca = brandOf.get(codigo) || "—";
    brandBought[marca] = (brandBought[marca] ?? 0) + qty;
  }
  return { year, brandSold, brandBought, brandRevenue, brandCost, soldByArticle };
}

/**
 * Última data de venda por artigo (chave normalizada a 13 díg), varrendo as
 * ventas do período. Considera `Codigo_articulo` e `Codigo_producto`.
 */
async function lastSaleByArticle(from: Date, to: Date): Promise<Map<string, Date>> {
  const ventas = await fetchVentas(from.toISOString(), to.toISOString());
  const map = new Map<string, Date>();
  for (const v of ventas) {
    const d = parseDate(v.Fecha);
    if (!d) continue;
    for (const l of v.lineas) {
      const key = norm13(l.Codigo_articulo) || norm13(l.Codigo_producto);
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || d > prev) map.set(key, d);
    }
  }
  return map;
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

const clientName = (c: VisualCliente): string =>
  [c.Nombre, c.Apellido1, c.Apellido2].filter(Boolean).join(" ").trim() || c.Codigo;

// Tabela de clientes (toda) cacheada — usada por clients() e pelo índice de nomes.
let clientesCache: { promise: Promise<VisualCliente[]>; expires: number } | null = null;
function loadAllClientes(): Promise<VisualCliente[]> {
  if (clientesCache && clientesCache.expires > Date.now()) return clientesCache.promise;
  const promise = selectAll<VisualCliente>("Clientes", {}, 2000).catch((e) => {
    clientesCache = null;
    throw e;
  });
  clientesCache = { promise, expires: Date.now() + ARTICLE_TTL_MS };
  return promise;
}

async function loadClientNameIndex(): Promise<Map<string, string>> {
  const clientes = await loadAllClientes();
  const map = new Map<string, string>();
  for (const c of clientes) map.set(`${c.Codigo}-${c.Centro}`, clientName(c));
  return map;
}

/**
 * Resolve nome+contacto SÓ dos clientes referenciados (não carrega os ~10k todos).
 * Para análises POR PERÍODO (algumas centenas de clientes) — filtra a tabela
 * Clientes por `Codigo` em lotes OR, com `fields` mínimos. Evita saturar a única
 * ligação REST a paginar a tabela inteira (era o que arrastava a página Vendas).
 */
async function loadClientInfoFor(
  clientKeys: Iterable<string>,
): Promise<{ names: Map<string, string>; contacts: Map<string, string> }> {
  const names = new Map<string, string>();
  const contacts = new Map<string, string>();
  const codes = [...new Set([...clientKeys].map((k) => k.split("-")[0]).filter(Boolean))];
  if (codes.length === 0) return { names, contacts };
  const BATCH = 80; // lotes de OR (Codigo eq 'x' or …) — a API suporta-o
  for (let i = 0; i < codes.length; i += BATCH) {
    const filter = codes.slice(i, i + BATCH).map((c) => `Codigo eq '${c}'`).join(" or ");
    const clientes = await selectAll<VisualCliente>("Clientes", {
      // Regra da API: todo o campo do filtro (Codigo) tem de constar em fields.
      filter,
      fields: ["Codigo", "Centro", "Nombre", "Apellido1", "Apellido2", "Telefono", "Telefono_movil"],
    }, 2000);
    for (const c of clientes) {
      const key = `${c.Codigo}-${c.Centro}`;
      names.set(key, clientName(c));
      contacts.set(key, (c.Telefono_movil || c.Telefono || "").toString().trim());
    }
  }
  return { names, contacts };
}

/** Índice de contacto (telemóvel ou fixo) por cliente. */
async function loadClientContactIndex(): Promise<Map<string, string>> {
  const clientes = await loadAllClientes();
  const map = new Map<string, string>();
  for (const c of clientes) {
    const phone = (c.Telefono_movil || c.Telefono || "").toString().trim();
    map.set(`${c.Codigo}-${c.Centro}`, phone);
  }
  return map;
}

export async function clients(): Promise<Client[]> {
  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  // Vendas LEVES (sem lineas, sem catálogo): para o cliente só interessa o líquido.
  const vendasFilter = [dateRangeFilter("Fecha", twoYearsAgo, now), centroFilter()]
    .filter(Boolean)
    .join(" and ");
  const [clientes, ventas] = await Promise.all([
    loadAllClientes(),
    selectAll<VisualVenta>("Ventas", {
      filter: vendasFilter,
      // `Centro` tem de constar porque centroFilter() filtra por ele (regra da API: campo do where ∈ fields).
      fields: ["Codigo_cliente", "Centro_cliente", "Centro", "Fecha", "Importe_bruto", "Importe_descuento_lineas", "Importe_DescuentoGlobal", "Es_presupuesto"],
    }, 2000),
  ]);
  // Agrega histórico de compras por cliente (última compra derivada das Ventas).
  const hist = new Map<string, { total: number; count: number; last: Date | null }>();
  for (const v of ventas) {
    if (v.Es_presupuesto === "S") continue;
    const key = `${v.Codigo_cliente}-${v.Centro_cliente}`;
    const d = parseDate(v.Fecha);
    const cur = hist.get(key) ?? { total: 0, count: 0, last: null };
    cur.total += num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);
    cur.count += 1;
    if (d && (!cur.last || d > cur.last)) cur.last = d;
    hist.set(key, cur);
  }
  return clientes.map((c) => {
    const key = `${c.Codigo}-${c.Centro}`;
    const h = hist.get(key) ?? { total: 0, count: 0, last: null };
    const last = h.last;
    const daysSince = last ? daysBetween(now, last) : 9999;
    const isLens = !!c.Fecha_proxrevlentillas;
    const tags: string[] = [];
    if (h.count <= 1) tags.push("novo");
    if (daysSince > 365) tags.push("perdido");
    else if (daysSince > 180) tags.push("inativo");
    if (h.total > 3000) tags.push("vip");
    if (isLens) tags.push("lentes_contacto");
    return {
      id: key,
      name: clientName(c),
      email: c.Email ?? null,
      phone: c.Telefono_movil ?? c.Telefono ?? null,
      birthdate: isoDay(parseDate(c.Fecha_nacimiento)),
      registration_date: isoDay(parseDate(c.Fecha_alta)),
      last_purchase: isoDay(last),
      days_since_purchase: daysSince,
      graduation_date: isoDay(parseDate(c.Fecha_proxrevlentes)),
      total_spent: round(h.total),
      num_purchases: h.count,
      avg_ticket: h.count > 0 ? round(h.total / h.count) : 0,
      is_contact_lens_user: isLens,
      next_lens_refill: c.Fecha_proxrevlentillas ? (isoDay(parseDate(c.Fecha_proxrevlentillas)) ?? undefined) : undefined,
      tags,
    } satisfies Client;
  });
}

// ─── Consultas / Agenda ───────────────────────────────────────────────────────

async function fetchEventos(from: Date, to: Date): Promise<VisualEventoAgenda[]> {
  const filter = dateRangeFilter("Inicio", from, to);
  return selectAll<VisualEventoAgenda>("EventosAgenda", { filter, orderby: "Inicio desc" });
}

/** Janela (dias) após a consulta em que uma venda do cliente conta como conversão. */
const CONSULT_TO_SALE_DAYS = (() => {
  const r = parseFloat(process.env.VISUAL_CONSULT_SALE_WINDOW_DAYS ?? "");
  return Number.isFinite(r) && r > 0 ? r : 45;
})();

export async function appointments(from: string, to: string): Promise<Appointment[]> {
  const fromD = new Date(from);
  const toD = new Date(to);
  const now = new Date();
  // Procura vendas até à janela de conversão depois do fim do intervalo.
  const salesTo = new Date(
    Math.max(now.getTime(), toD.getTime() + CONSULT_TO_SALE_DAYS * 86_400_000),
  );
  const [eventos, clientsIdx, ventas] = await Promise.all([
    fetchEventos(fromD, toD),
    loadClientNameIndex(),
    fetchVentas(fromD.toISOString(), salesTo.toISOString()),
  ]);

  // Índice de vendas por cliente (data + valor líquido), para ligar consulta→venda.
  const salesByClient = new Map<string, { d: Date; net: number }[]>();
  for (const v of ventas) {
    const d = parseDate(v.Fecha);
    if (!d) continue;
    const key = `${v.Codigo_cliente}-${v.Centro_cliente}`;
    const net = num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);
    const arr = salesByClient.get(key);
    if (arr) arr.push({ d, net });
    else salesByClient.set(key, [{ d, net }]);
  }

  return eventos.map((e) => {
    const ini = parseDate(e.Inicio);
    const key = `${e.CodigoCliente}-${e.CentroCliente}`;
    const title = (e.TituloCita || e.Etiqueta || "").toLowerCase();
    const type: Appointment["type"] = title.includes("entrega")
      ? "entrega"
      : title.includes("ajuste")
        ? "ajuste"
        : "consulta";
    // Conversão: venda do mesmo cliente entre a data da consulta e +N dias.
    let converted_to_sale = false;
    let sale_amount: number | undefined;
    if (ini) {
      const limit = ini.getTime() + CONSULT_TO_SALE_DAYS * 86_400_000;
      const slack = ini.getTime() - 86_400_000; // tolera venda no próprio dia (cedo)
      const match = (salesByClient.get(key) ?? []).find(
        (s) => s.d.getTime() >= slack && s.d.getTime() <= limit,
      );
      if (match) {
        converted_to_sale = true;
        sale_amount = round(match.net);
      }
    }
    return {
      id: e.Codigo,
      client_id: key,
      client_name: clientsIdx.get(key) ?? e.CodigoCliente ?? "",
      employee_id: e.Usuario ?? "",
      employee_name: e.Usuario ?? "",
      date: e.Inicio,
      type,
      // NOTA: a API não expõe no-show; marcada=futura, realizada=passada.
      status: ini && ini >= now ? "marcada" : "realizada",
      converted_to_sale,
      sale_amount,
    } satisfies Appointment;
  });
}

// ─── Descontos ──────────────────────────────────────────────────────────────

export async function discounts(from: string, to: string, saudeCodes: Iterable<string> = []) {
  const [ventas, articles, entryCosts, classMap] = await Promise.all([
    fetchVentas(from, to), articleIndexForRange(from, to), lineEntryCosts(from, to), lineClasses(from, to),
  ]);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let dayDisc = 0;
  let monthDisc = 0;
  let grossTotal = 0;
  let excessiveCount = 0;
  const byEmp = new Map<string, { disc: number; gross: number }>();
  const byCat = new Map<SaleCategory, { disc: number; gross: number }>();
  const below: {
    date: string; product: string; amount: number; margin_pct: number; employee: string;
    gross: number; cost: number; covered_net: number; margin_value: number;
    lines: { desc: string; qty: number; gross: number; discount: number; net: number; cost: number | null; margin_pct: number | null }[];
  }[] = [];

  for (const v of ventas) {
    const d = parseDate(v.Fecha);
    const gross = num(v.Importe_bruto);
    const disc = num(v.Importe_descuento_lineas) + num(v.Importe_DescuentoGlobal);
    const net = gross - disc;
    grossTotal += gross;
    monthDisc += disc;
    if (d && d.getTime() >= todayStart) dayDisc += disc;

    const u = v.Usuario || "—";
    const e = byEmp.get(u) ?? { disc: 0, gross: 0 };
    e.disc += disc;
    e.gross += gross;
    byEmp.set(u, e);

    // Desconto por categoria (linha a linha). A categoria vem da CLASSE da linha
    // (OData), como no resto da app — não do artigo: as lentes/LC só trazem
    // `Codigo_producto` e não resolvem para artigo nenhum (ver `articleForLine`).
    const ratio = lineDiscountRatio(v);
    for (const l of v.lineas) {
      const cat = lineCategory(v, l, classMap, saude, articles);
      const lgross = num(l.Precio_unitario) * num(l.Cantidad);
      const ldisc = num(l.Importe_descuento) + lgross * ratio;
      const c = byCat.get(cat) ?? { disc: 0, gross: 0 };
      c.disc += ldisc;
      c.gross += lgross;
      byCat.set(cat, c);
    }

    // Desconto excessivo (% sobre o bruto da venda).
    const discPct = gross > 0 ? (disc / gross) * 100 : 0;
    if (discPct > EXCESSIVE_DISCOUNT_PCT) excessiveCount += 1;

    // Vendas abaixo da margem mínima — só quando o custo está SUFICIENTEMENTE
    // coberto (≥80% do líquido da venda). Sem este guard, uma venda em que só a
    // lente tem custo (ex.: fatura do lab. já chegou) mas a armação/tratamentos
    // ainda não têm custo aparecia falsamente "abaixo de 50%": estávamos a julgar
    // a venda inteira pela margem de UMA linha (a de menor margem). Alinha com o
    // KPI de margem (MARGIN_MIN_COVERAGE = 80%).
    const m = ventaMetrics(v, articles, entryCosts);
    const coverage = m.net > 0 ? m.coveredNet / m.net : 0;
    if (m.coveredNet > 0 && coverage >= 0.8) {
      const marginPct = ((m.coveredNet - m.cost) / m.coveredNet) * 100;
      if (marginPct < 50) {
        // Detalhe linha a linha (PVP, custo, desconto, net, margem) para o drill-down.
        const lines = v.lineas.map((l) => {
          const qty = num(l.Cantidad);
          const lgross = num(l.Precio_unitario) * qty;
          const ldisc = num(l.Importe_descuento) + lgross * ratio;
          const lnet = lgross - ldisc;
          const cn = lineCostNet(v, l, articles, ratio, entryCosts);
          return {
            desc: (l.Descripcion ?? "").slice(0, 80) || String(l.Codigo_producto ?? l.Codigo_articulo ?? ""),
            qty,
            gross: round(lgross),
            discount: round(ldisc),
            net: round(lnet),
            cost: cn ? round(cn.cost) : null,
            margin_pct: cn && cn.net > 0 ? round(((cn.net - cn.cost) / cn.net) * 100) : null,
          };
        });
        below.push({
          date: isoDay(d) ?? "",
          product: `Venda ${v.Referencia ?? v.Codigo}`,
          amount: round(net),
          margin_pct: round(marginPct),
          employee: u,
          gross: round(m.gross),
          cost: round(m.cost),
          covered_net: round(m.coveredNet),
          margin_value: round(m.coveredNet - m.cost),
          lines,
        });
      }
    }
  }

  return {
    total_discount_day: round(dayDisc),
    total_discount_month: round(monthDisc),
    avg_discount_pct: grossTotal > 0 ? Math.round((monthDisc / grossTotal) * 1000) / 10 : 0,
    excessive_count: excessiveCount,
    by_employee: [...byEmp.entries()]
      .map(([name, x]) => ({
        name,
        discount_total: round(x.disc),
        discount_avg_pct: x.gross > 0 ? round((x.disc / x.gross) * 100) : 0,
      }))
      .sort((a, b) => b.discount_total - a.discount_total),
    by_category: [...byCat.entries()]
      .map(([category, x]) => ({
        category,
        label: CATEGORY_LABELS[category],
        discount_total: round(x.disc),
        discount_avg_pct: x.gross > 0 ? round((x.disc / x.gross) * 100) : 0,
      }))
      .filter((c) => c.discount_total > 0)
      .sort((a, b) => b.discount_total - a.discount_total),
    below_min_margin: below.sort((a, b) => a.margin_pct - b.margin_pct).slice(0, 12),
  };
}

// ─── Seguradoras (REST FacturasClientes.Codigo_aseguradora) ───────────────────
// O OData não expõe a seguradora; a REST dá só o Codigo_aseguradora (número) e o
// NumeroBefeficiario na fatura — o NOME da seguradora NÃO existe na API. Por isso
// devolvemos exemplos (beneficiário + cliente) para ajudar a rotular no Admin.
interface VisualFacturaCliente {
  Codigo: number; Centro: number; Fecha: string;
  Codigo_aseguradora: string | number | null;
  NumeroBefeficiario?: string | number | null;
  Nombre_cliente?: string | null;
}

export interface AseguradoraCodeInfo { codigo: string; count: number; sampleBenef: string; sampleClient: string; suggestion: string }

/**
 * Palavras-chave que identificam INEQUIVOCAMENTE uma SEGURADORA num `Nombre_cliente`
 * (as faturas de reembolso são emitidas em nome da seguradora — MULTICARE, ALLIANZ, …).
 * Conservador de propósito: NÃO inclui sufixos genéricos (`S.A.`/`LDA`) porque o apelido
 * português "Sá" (escrito "SA") daria falsos positivos em nomes de pessoas.
 */
const ASEGURADORA_NAME_RE =
  /\b(SEGUROS|MULTICARE|MEDIS|ADVANCECARE|SAFECARE|HEALTHCARE|AEGON|SANTANDER|ADSE|SAMS|SAVIDA|SÃVIDA|ALLIANZ|FIDELIDADE|TRANQUILIDADE|AGEAS|GENERALI|LUSITANIA|LUSITÂNIA|VICTORIA|VICTÓRIA|OCIDENTAL|MAPFRE|ZURICH|CIGNA|MGEN|MUTUELLE|MUTUA|MÚTUA|MONTEPIO|MEDICARE|MUDUM|RNA|COMPANHIA DE SEGUROS)\b/i;

/** Token único, todo em maiúsculas (ex.: "RAR") — organização, não pessoa. */
const SINGLE_ORG_RE = /^[A-ZÀ-Ú][A-ZÀ-Ú&.\-]{2,5}$/;

/**
 * Nomes CONFIRMADOS pelo dono (2026-07-16, abrindo as faturas no Visual) para
 * códigos que a heurística não consegue derivar — seguradoras de PURO reembolso
 * ao paciente, em que o `Nombre_cliente` é sempre a pessoa e a seguradora nunca
 * aparece. Identificadas pelo formato do nº de beneficiário: ADSE=9 díg+sufixo
 * OA/SS/AP; Advancecare=8 díg (cartão de cidadão); SAMS=10 díg `00…00`.
 * Têm prioridade sobre o palpite automático.
 */
const KNOWN_ASEGURADORA_NAMES: Record<string, string> = {
  "11": "ADSE",
  "20": "Advancecare",
  "71": "SAMS / Quadros",
};

/**
 * Escolhe, de um mapa nome→freq, o melhor palpite para o nome da seguradora.
 * Regra CONSERVADORA (evitar falsos positivos): só nomes com palavra-chave de
 * seguradora, ou um token único em maiúsculas que se repita bastante (≥4 faturas).
 * Códigos de puro reembolso ao paciente (cliente = pessoa) ficam sem sugestão.
 */
function guessAseguradoraName(names: Map<string, number>): string {
  if (names.size === 0) return "";
  const cand = [...names.entries()]
    .filter(([n, c]) => ASEGURADORA_NAME_RE.test(n) || (SINGLE_ORG_RE.test(n) && c >= 4))
    .sort((a, b) => b[1] - a[1]);
  return cand[0]?.[0] ?? "";
}

/** Códigos de seguradora em uso (FacturasClientes) num intervalo, com exemplos e sugestão de nome. */
export async function aseguradoraCodesInUse(from: string, to: string): Promise<AseguradoraCodeInfo[]> {
  const filter = [dateRangeFilter("Fecha", new Date(from), new Date(to)), centroFilter()].filter(Boolean).join(" and ");
  const rows = await selectAll<VisualFacturaCliente>(
    "FacturasClientes",
    { fields: ["Codigo", "Centro", "Fecha", "Codigo_aseguradora", "NumeroBefeficiario", "Nombre_cliente"], filter },
    1000,
  ).catch((e) => { console.error("aseguradoraCodesInUse falhou:", e instanceof Error ? e.message : e); return [] as VisualFacturaCliente[]; });
  const m = new Map<string, { count: number; benef: string; client: string; names: Map<string, number> }>();
  for (const r of rows) {
    const c = String(r.Codigo_aseguradora ?? "").trim();
    if (!c || c === "0") continue;
    const cur = m.get(c) ?? { count: 0, benef: "", client: "", names: new Map<string, number>() };
    cur.count++;
    if (!cur.benef && r.NumeroBefeficiario != null) cur.benef = String(r.NumeroBefeficiario).trim();
    if (!cur.client && r.Nombre_cliente) cur.client = String(r.Nombre_cliente).trim();
    const nm = String(r.Nombre_cliente ?? "").trim();
    if (nm) cur.names.set(nm, (cur.names.get(nm) ?? 0) + 1);
    m.set(c, cur);
  }
  return [...m.entries()]
    .map(([codigo, x]) => ({
      codigo, count: x.count, sampleBenef: x.benef, sampleClient: x.client,
      suggestion: KNOWN_ASEGURADORA_NAMES[codigo] ?? guessAseguradoraName(x.names),
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Relatórios (agregadores por período) ─────────────────────────────────────

export interface ReportSeller { name: string; sales: number; count: number; ticket: number; pct: number }
export interface ReportYearTotal { year: number; comIva: number; semIva: number }
export interface WeeklyOpticaReport {
  from: string; to: string; total: number;
  sellers: ReportSeller[];
  weekCompare: ReportYearTotal[];            // mesma semana, N anos (faturação total)
  yearCompare: { year: number; comIva: number }[]; // YTD anual com IVA (N anos)
  yearImprovementPct: number;
}

/**
 * Totais de FATURAÇÃO (com/sem IVA) de um intervalo — SOMA das faturas emitidas
 * (REST `FacturasClientes`), NÃO das vendas. `sem IVA = Σ Base_imponible`;
 * `com IVA = Σ (Base_imponible + Importe_IVA)`. Somam-se TODAS as faturas
 * (FR recibo à seguradora / FT fatura cliente / NC nota de crédito): as NC
 * (negativas) anulam as FR → dá o faturado real. **Excluem-se os documentos com
 * IVA=0** (faturas especiais/não-retalho, ex.: FRA à mobiliária) — a faturação
 * oficial da loja não os conta. Validado ao cêntimo (semana 06-11/07, 4 anos):
 * 2023 SEM 59 155/COM 65 355,40; 2024 SEM 43 334,78/COM 47 800,40; 2025 SEM
 * 40 851,49/COM 45 349,77; 2026 SEM 79 664,75/COM 87 502,08.
 */
async function periodTotals(from: string, to: string): Promise<{ comIva: number; semIva: number }> {
  const filter = [dateRangeFilter("Fecha", new Date(from), new Date(to)), centroFilter()].filter(Boolean).join(" and ");
  // A REST FacturasClientes exige o campo-chave `Codigo` na lista de fields.
  const fields = ["Codigo", "Fecha", "Centro", "Base_imponible", "Importe_IVA"];
  const faturas = await selectAll<{ Base_imponible?: string | number; Importe_IVA?: string | number }>(
    "FacturasClientes", { filter, fields }, 1000,
  );
  let semIva = 0, comIva = 0;
  for (const f of faturas) {
    const iva = num(f.Importe_IVA);
    if (iva === 0) continue; // exclui docs sem IVA (não são faturação de retalho)
    const base = num(f.Base_imponible);
    semIva += base; comIva += base + iva;
  }
  return { comIva: round(comIva), semIva: round(semIva) };
}

/** Mesma janela [from,to] nos últimos `nYears` anos (faturação total com/sem IVA). */
async function yearTotalsForRange(from: string, to: string, nYears: number): Promise<ReportYearTotal[]> {
  const fromD = new Date(from), toD = new Date(to);
  const out: ReportYearTotal[] = [];
  for (let k = nYears - 1; k >= 0; k--) {
    const f = k === 0 ? from : shiftYears(fromD, -k).toISOString();
    const t = k === 0 ? to : shiftYears(toD, -k).toISOString();
    const tot = await periodTotals(f, t);
    out.push({ year: fromD.getFullYear() - k, ...tot });
  }
  return out;
}

/** Acumulado do ano (1 jan → dia de `to`) com IVA, nos últimos `nYears` anos.
 *  `to` já é o limite EXCLUSIVO (dia seguinte ao "Até"), por isso usa-se
 *  `toD.getDate()` tal-qual — NÃO `+1` (senão o anual incluía um dia a mais que
 *  o período do relatório: ex. 12/07/2025 = sábado com ~18 640€ → 2025 saía +19k). */
async function ytdTotals(to: string, nYears: number): Promise<{ year: number; comIva: number }[]> {
  const toD = new Date(to);
  const out: { year: number; comIva: number }[] = [];
  for (let k = nYears - 1; k >= 0; k--) {
    const y = toD.getFullYear() - k;
    const tot = await periodTotals(new Date(y, 0, 1).toISOString(), new Date(y, toD.getMonth(), toD.getDate()).toISOString());
    out.push({ year: y, comIva: tot.comIva });
  }
  return out;
}

// Vendedores de balcão que APARECEM no relatório (Usuario do Visual). Os restantes
// (clínica/caixa: Conceição, Ana, MROSA, PG…) contam para o TOTAL (denominador das
// %) mas não são mostrados na lista.
const OPTICA_SALES_TEAM = new Set(["ALDINA", "ELISA", "FATIMA", "GISLAINE", "MARTA", "JOSE", "NUNO", "VITOR"]);
const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// Utilizadores do Visual que NUNCA entram nos cálculos de NENHUM relatório PDF
// (contas de sistema/gestão — Admin, Perpétuo e o José João, cujo `Usuario` é JOAO —,
// não são vendedores reais). ⚠️ NÃO confundir com o `JOSE`, que é vendedor de balcão
// e continua nos relatórios. Decisão do dono. Comparação por nome normalizado.
const REPORT_EXCLUDED_USERS = new Set(["PERPETUO", "JOAO", "ADMIN"]);
const isExcludedReportUser = (u: string | null | undefined): boolean =>
  REPORT_EXCLUDED_USERS.has(normName(u || "").replace(/\s+/g, " "));

export interface SectorTickets {
  /** Ticket médio (€) das vendas da equipa de BALCÃO (OPTICA_SALES_TEAM). */
  balcao: number;
  /** Ticket médio (€) das vendas da CLÍNICA/caixa (restantes Usuarios). */
  clinica: number;
  balcaoCount: number; clinicaCount: number;
  balcaoSales: number; clinicaSales: number;
}

/**
 * Ticket médio SEPARADO por setor do vendedor: "balcão" (equipa de vendas,
 * `OPTICA_SALES_TEAM`) vs "clínica" (optometristas/caixa — Conceição, Ana, MROSA,
 * PG…). Leve: uma ida às Ventas (cacheada), sem OData. Cada venda real conta pelo
 * seu total líquido, atribuída ao setor do seu `Usuario`.
 */
export async function salesTicketsBySector(from: string, to: string): Promise<SectorTickets> {
  const all = await fetchVentas(from, to, true);
  const ventas = all.filter(isRealSale);
  let bSales = 0, bCount = 0, cSales = 0, cCount = 0;
  for (const v of ventas) {
    const net = ventaNet(v);
    if (OPTICA_SALES_TEAM.has(normName(v.Usuario || ""))) { bSales += net; bCount += 1; }
    else { cSales += net; cCount += 1; }
  }
  return {
    balcao: bCount ? round(bSales / bCount) : 0,
    clinica: cCount ? round(cSales / cCount) : 0,
    balcaoCount: bCount, clinicaCount: cCount,
    balcaoSales: round(bSales), clinicaSales: round(cSales),
  };
}

/** Relatório SEMANAL de óptica (armações + sol + lentes oftálmicas) por vendedor. */
export async function weeklyOpticaReport(from: string, to: string): Promise<WeeklyOpticaReport> {
  // Vendas por vendedor = TOTAL líquido de cada venda real (todas as categorias),
  // consistente com os totais de faturação (periodTotals/weekCompare) e com o menu
  // Equipa. (Antes somava só as linhas de categoria óptica → não batia com o total
  // real de cada vendedor, ex.: Nuno 14.960,67.) `fetchVentas` já exclui orçamentos
  // e abonos (isRealSale), por isso cada documento conta 1 venda.
  // Exclui os utilizadores de sistema/gestão (Admin, Perpétuo, José João).
  const ventas = (await fetchVentas(from, to)).filter((v) => !isExcludedReportUser(v.Usuario));
  const bySeller = new Map<string, { sales: number; count: number }>();
  for (const v of ventas) {
    const seller = v.Usuario || "—";
    const cur = bySeller.get(seller) ?? { sales: 0, count: 0 };
    cur.sales += ventaNet(v); cur.count += 1;
    bySeller.set(seller, cur);
  }
  // A % é sobre o total de TODOS (balcão + clínica/caixa); mas só a equipa de
  // vendas (balcão) APARECE na lista — as suas % não somam 100% (o resto é a
  // clínica/caixa, que conta para o denominador mas não é mostrada).
  const total = [...bySeller.values()].reduce((s, x) => s + x.sales, 0);
  // Índice da equipa por nome normalizado (casa com o Usuario real do Visual).
  const teamByNorm = new Map<string, { name: string; sales: number; count: number }>();
  for (const [name, x] of bySeller) {
    const n = normName(name);
    if (OPTICA_SALES_TEAM.has(n)) teamByNorm.set(n, { name, sales: x.sales, count: x.count });
  }
  // TODOS os vendedores de balcão aparecem SEMPRE — 0 (e 0%) quando não têm vendas.
  const sellers = [...OPTICA_SALES_TEAM]
    .map((n) => teamByNorm.get(n) ?? { name: n, sales: 0, count: 0 })
    .map((d) => ({
      name: d.name, sales: round(d.sales), count: d.count,
      ticket: d.count ? round(d.sales / d.count) : 0,
      pct: total ? round((d.sales / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);

  const baseYear = new Date(from).getFullYear();
  const [weekCompare, yearCompare] = await Promise.all([
    yearTotalsForRange(from, to, 4),
    ytdTotals(to, 2),
  ]);
  const prev = yearCompare.find((y) => y.year === baseYear - 1)?.comIva ?? 0;
  const curr = yearCompare.find((y) => y.year === baseYear)?.comIva ?? 0;
  const yearImprovementPct = prev ? Math.round(((curr - prev) / prev) * 1000) / 10 : 0;

  return { from, to, total: round(total), sellers, weekCompare, yearCompare, yearImprovementPct };
}

// ─── Relatório SEMANAL clínica (optometristas) ────────────────────────────────

export interface ClinicaOptometrist { name: string; originated: number; faturacao: number }
export interface WeeklyClinicaReport {
  from: string; to: string;
  topByCount: ClinicaOptometrist[];
  topByValue: ClinicaOptometrist[];
  sectors: {
    optometria: { name: string; pct: number }[];
    contactologia: { name: string; pct: number }[];
    total: { name: string; pct: number }[];
  };
}

/**
 * Equipa INTERNA de optometria da loja. O campo `Optometrista` da revisão é texto
 * livre e contém sobretudo prescritores EXTERNOS (hospitais/oftalmologistas de quem
 * o cliente traz receita); os internos identificam-se pela cédula profissional
 * (estável) — e por variantes do nome como reforço. Só estes entram no relatório;
 * receitas externas (ou vendas sem revisão que case) são excluídas.
 */
const INTERNAL_OPTOMETRISTS: { name: string; cedulas: string[]; nameRe: RegExp }[] = [
  { name: "Maria Rosa", cedulas: ["47"], nameRe: /maria\s+rosa/i },
  { name: "Ana Calejo", cedulas: ["768"], nameRe: /ana\s+calejo/i },
  { name: "Pedro Garcia", cedulas: ["170"], nameRe: /pedro\s+garcia/i },
];
/** Nome canónico do optometrista interno, ou null se externo/desconhecido. */
function internalOptometrist(optometrista: string, cedula: string): string | null {
  const numCed = (cedula.match(/(\d+)/) ?? [])[1];
  if (numCed) { for (const o of INTERNAL_OPTOMETRISTS) if (o.cedulas.includes(numCed)) return o.name; }
  for (const o of INTERNAL_OPTOMETRISTS) if (o.nameRe.test(optometrista)) return o.name;
  return null;
}

/** Nº ou null (aceita "-1,25"/"-1.25"/null/""). */
function nfNum(x: unknown): number | null { const n = parseFloat(String(x).replace(",", ".")); return Number.isFinite(n) ? n : null; }
/** Chave de graduação de um olho: `esf|cil|eixo` (eixo irrelevante sem cilindro). */
function gradKey(esf: unknown, cil: unknown, eje: unknown): string | null {
  const e = nfNum(esf); if (e === null) return null;
  const c = nfNum(cil) ?? 0;
  const j = c !== 0 ? (nfNum(eje) ?? 0) : 0;
  return `${e.toFixed(2)}|${c.toFixed(2)}|${j}`;
}

interface ClinicRev { keys: string[]; nm: string | null; t: number }
/**
 * Revisões do cliente via REST, com graduação → optometrista. `kind`:
 * `lentes` = `RevisionesLentes` (óculos, campos `Subjetiva_*`), `lentillas` =
 * `RevisionesLentillas` (contactologia, campos `OD_/OI_`; a graduação de LC difere
 * da de óculos — daí serem duas fontes). Mapa cliente → revisões (chaves + interno).
 */
async function fetchClinicRevisions(clients: string[], kind: "lentes" | "lentillas"): Promise<Map<string, ClinicRev[]>> {
  const map = new Map<string, ClinicRev[]>();
  if (!isVisualConfigured() || !clients.length) return map;
  const isLC = kind === "lentillas";
  const table: VisualTable = isLC ? "RevisionesLentillas" : "RevisionesLentes";
  const fields = isLC
    ? ["Codigo_cliente", "Fecha", "Optometrista", "Numero_colegiado", "OD_Esfera", "OD_Cilindro", "OD_Eje", "OI_Esfera", "OI_Cilindro", "OI_Eje"]
    : ["Codigo_cliente", "Fecha", "Optometrista", "Numero_colegiado", "Subjetiva_OD_EsferaLejos", "Subjetiva_OD_Cilindro", "Subjetiva_OD_Eje", "Subjetiva_OI_EsferaLejos", "Subjetiva_OI_Cilindro", "Subjetiva_OI_Eje"];
  const CHUNK = 40;
  for (let i = 0; i < clients.length; i += CHUNK) {
    const ors = clients.slice(i, i + CHUNK).map((c) => `Codigo_cliente eq '${c}'`).join(" or ");
    const rows = await select<Record<string, unknown>>(table, { fields, filter: ors }).catch(() => [] as Record<string, unknown>[]);
    for (const r of rows) {
      const od = isLC ? gradKey(r.OD_Esfera, r.OD_Cilindro, r.OD_Eje) : gradKey(r.Subjetiva_OD_EsferaLejos, r.Subjetiva_OD_Cilindro, r.Subjetiva_OD_Eje);
      const oi = isLC ? gradKey(r.OI_Esfera, r.OI_Cilindro, r.OI_Eje) : gradKey(r.Subjetiva_OI_EsferaLejos, r.Subjetiva_OI_Cilindro, r.Subjetiva_OI_Eje);
      const keys = [od, oi].filter((k): k is string => Boolean(k));
      if (!keys.length) continue;
      const cli = String(r.Codigo_cliente);
      const t = parseDate(String(r.Fecha ?? ""))?.getTime() ?? 0;
      const nm = internalOptometrist(String(r.Optometrista ?? ""), String(r.Numero_colegiado ?? ""));
      (map.get(cli) ?? map.set(cli, []).get(cli)!).push({ keys, nm, t });
    }
  }
  return map;
}

/**
 * Vendas originadas por optometrista INTERNO (consultas que geraram venda). A API
 * NÃO expõe a revisão usada na venda como FK; o único elo é a **graduação**: cada
 * linha de lente(L)/LC(C) da venda casa-se com a revisão do cliente cuja graduação
 * é igual (óculos→`RevisionesLentes`, LC→`RevisionesLentillas`). Escolhe-se a revisão
 * de maior nº de olhos coincidentes e mais recente; se for de optometrista interno,
 * a venda é creditada por INTEIRO (valor total, incl. diversos/óculos de sol). Vendas
 * sem match ou de receita externa ficam de fora. + peso por setor.
 */
export async function weeklyClinicaReport(from: string, to: string): Promise<WeeklyClinicaReport> {
  // Exclui os utilizadores de sistema/gestão (Admin, Perpétuo, José João).
  const ventas = (await fetchVentas(from, to)).filter((v) => !isExcludedReportUser(v.Usuario));

  // Todas as vendas reais do período; a GRADUAÇÃO das linhas (a seguir) é que decide
  // quais têm lente/LC e ligam a uma revisão. Creditado ao optometrista: o TOTAL da
  // venda (net) em `fat`/`fatOpto`, mesmo com diversos/óculos de sol; a contactologia
  // (`fatCl`) conta SÓ as suas linhas — ver mais abaixo.
  type Sale = { code: number; cliente: string; net: number; lineNet: Map<number, number> };
  const sales: Sale[] = [];
  const clientSet = new Set<string>();
  for (const v of ventas) {
    if (v.Es_presupuesto === "S") continue;
    const code = Number(v.Codigo); if (!Number.isFinite(code)) continue;
    const net = num(v.Importe_bruto) - num(v.Importe_descuento_lineas) - num(v.Importe_DescuentoGlobal);
    // € líquido POR LINHA (mesma fórmula do resto da app) — a contactologia soma só
    // as linhas dela, não a venda inteira.
    const ratio = lineDiscountRatio(v);
    const lineNet = new Map<number, number>();
    for (const l of v.lineas) {
      const gross = num(l.Precio_unitario) * num(l.Cantidad);
      lineNet.set(num(l.Codigo_linea), gross - num(l.Importe_descuento) - gross * ratio);
    }
    sales.push({ code, cliente: String(v.Codigo_cliente), net, lineNet });
    clientSet.add(String(v.Codigo_cliente));
  }

  // Graduação das linhas L/C por venda (OData) + revisões óculos/LC dos clientes (REST).
  const clients = [...clientSet];
  const [gradLines, revL, revC] = await Promise.all([
    saleGradLinesForVentas(sales.map((s) => s.code)),
    fetchClinicRevisions(clients, "lentes"),
    fetchClinicRevisions(clients, "lentillas"),
  ]);
  // Por venda: graduações (L/C) para casar com a revisão + as linhas que contam para
  // a contactologia (LC + líquidos de manutenção/saúde ocular — pedido do dono).
  const saleKeys = new Map<number, { L: Set<string>; C: Set<string>; clLines: Set<number> }>();
  const entry = (code: number) => {
    const e = saleKeys.get(code) ?? { L: new Set<string>(), C: new Set<string>(), clLines: new Set<number>() };
    saleKeys.set(code, e);
    return e;
  };
  for (const g of gradLines) {
    const e = entry(g.codigoVenta);
    if (g.clase === "C" || g.agr2 === AGR2_MANUTENCAO_OCULAR) e.clLines.add(g.codigoLinea);
    const k = gradKey(g.esfera, g.cilindro, g.eje); if (!k) continue;
    if (g.clase === "C") e.C.add(k); else if (g.clase === "L") e.L.add(k);
  }

  const opt = new Map<string, { count: number; fat: number; fatOpto: number; fatCl: number }>();
  for (const s of sales) {
    const sk = saleKeys.get(s.code); if (!sk) continue;
    // Candidatos: revisões cuja graduação (por olho) coincide com as linhas da venda.
    const cand: { score: number; t: number; nm: string | null }[] = [];
    for (const r of revL.get(s.cliente) ?? []) { let sc = 0; for (const k of sk.L) if (r.keys.includes(k)) sc++; if (sc) cand.push({ score: sc, t: r.t, nm: r.nm }); }
    for (const r of revC.get(s.cliente) ?? []) { let sc = 0; for (const k of sk.C) if (r.keys.includes(k)) sc++; if (sc) cand.push({ score: sc, t: r.t, nm: r.nm }); }
    // ⚠️ Vendas SÓ de líquidos/saúde ocular (balcão, sem graduação) ficam de fora: não
    // há graduação que as ligue a um optometrista. Atribuí-las pela revisão de LC mais
    // recente do cliente foi testado e AFASTOU-SE dos números reais do dono (erro
    // 4,20pp → 5,90pp na semana 06-11/07) — logo não é assim que ele as conta.
    if (!cand.length) continue;
    cand.sort((a, b) => b.score - a.score || b.t - a.t); // + olhos coincidentes, depois mais recente
    const best = cand[0];
    if (!best.nm || isExcludedReportUser(best.nm)) continue; // receita externa ou utilizador de sistema → exclui
    const cur = opt.get(best.nm) ?? { count: 0, fat: 0, fatOpto: 0, fatCl: 0 };
    cur.count++; cur.fat += s.net;
    if (sk.L.size) cur.fatOpto += s.net; // € de vendas com óculos graduados
    // Contactologia = SÓ as linhas de lentes de contacto, líquidos de manutenção e
    // saúde ocular (não a venda inteira: o cliente leva armação/sol no mesmo talão).
    for (const ln of sk.clLines) cur.fatCl += s.lineNet.get(ln) ?? 0;
    opt.set(best.nm, cur);
  }

  const list = [...opt.entries()].map(([name, x]) => ({ name, ...x }));
  const topByCount = [...list].sort((a, b) => b.count - a.count).slice(0, 3)
    .map((x) => ({ name: x.name, originated: x.count, faturacao: round(x.fat) }));
  const topByValue = [...list].sort((a, b) => b.fat - a.fat).slice(0, 3)
    .map((x) => ({ name: x.name, originated: x.count, faturacao: round(x.fat) }));
  // Setores = % de FATURAÇÃO (€) por optometrista (validado: total = Σ€ do optometrista
  // / Σ€ da equipa), 2 casas decimais.
  const pctOf = (sel: (x: typeof list[number]) => number) => {
    const tot = list.reduce((s, x) => s + sel(x), 0);
    return list.filter((x) => sel(x) > 0)
      .map((x) => ({ name: x.name, pct: tot ? Math.round((sel(x) / tot) * 10000) / 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  };
  return {
    from, to, topByCount, topByValue,
    sectors: { optometria: pctOf((x) => x.fatOpto), contactologia: pctOf((x) => x.fatCl), total: pctOf((x) => x.fat) },
  };
}

// ─── Relatório MENSAL ─────────────────────────────────────────────────────────

export interface MonthlyReport {
  from: string; to: string;
  sellers: ReportSeller[];
  sellerDiscount: { name: string; pct: number }[];
  valorPorTipo: { aro: number; sol: number; lentes: number; lc: number };
  top3: { name: string; sales: number; pct: number }[];
  arosSolBrands: { brand: string; count: number }[];
  fornecedorLentes: { seller: string; providers: { name: string; count: number }[] }[];
  lcPorVendedor: { seller: string; diaria: number; mensal: number; outras: number }[];
  lcGama: { tipo: string; count: number }[];
  /** Saúde ocular por TIPO (LÁGRIMAS/LIQ MANUT/PERÓXIDO/SUPLEMENTOS/OUTROS) × marca. */
  saudeGama: { tipo: string; brands: { name: string; count: number }[] }[];
  aparelhos: { seller: string; total: number; count: number }[];
  /** Aparelhos auditivos por MARCA (nº de unidades). */
  aparelhosBrands: { brand: string; count: number }[];
  orcamentos: { name: string; count: number }[];
  ticket: { name: string; ticket: number }[];
  ranking: { name: string; pct: number }[];
  monthCompare: ReportYearTotal[];
  yearCompare: { year: number; comIva: number }[];
  yearImprovementPct: number;
  clientesNovos: { total: number; byAge: { label: string; count: number }[]; bySeguro: { name: string; count: number }[] };
  descPorSeguro: { name: string; pct: number }[];
  eurPorSeguro: { name: string; eur: number }[];
  /** Compras (unidades rececionadas) por TIPO de produto: ARO/SOL/LC/LENTES. */
  comprasPorTipo: { tipo: string; qty: number }[];
}

const AUDIO_RE = /aparelho\s+auditiv|pr[oó]tese\s+auditiv|audi[fó]/i;
function lcSub(desc: string): "ESF" | "TOR" | "MULT" {
  if (/\bTOR|t[oó]ric/i.test(desc)) return "TOR";
  if (/\bMULT|progres|prog\b/i.test(desc)) return "MULT";
  return "ESF";
}
/** Tipo de produto de saúde ocular (réplica do template "GAMA DE SAÚDE OCULAR"). */
function saudeTipo(desc: string): string {
  const d = desc.toUpperCase();
  if (/L[ÁA]GRIMA|LUBRIFIC|HUMECT|COLIRIO|COL[ÍI]RIO/.test(d)) return "LAGRIMAS";
  if (/PER[ÓO]XIDO|PEROXIDE/.test(d)) return "PERÓXIDO";
  if (/MANUTEN|SOLU[ÇC][ÃA]O|MULTIUS|ALL.?IN.?ONE|CONSERVA|LIMP/.test(d)) return "LIQ MANUT";
  if (/SUPLEMENT|VITAMIN|[ÓO]MEGA|OMEGA|C[ÁA]PSUL|COMPRIM/.test(d)) return "SUPLEMENTOS";
  return "OUTROS";
}
const SAUDE_TIPOS = ["LAGRIMAS", "LIQ MANUT", "PERÓXIDO", "SUPLEMENTOS", "OUTROS"];

const NEW_CLIENT_AGE_BUCKETS = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99"];

/** Clientes dados de ALTA no mês (VX_CLIENTES por FECHA_ALTA): código + faixa etária.
 *  NÃO filtra — devolve TODOS os altas; o caller (`monthlyReport`) fica com os que têm
 *  VENDA real (exclui os criados só para orçamento). Idade calculada à data da alta. */
async function monthlyNewClients(from: string, to: string): Promise<{ clients: { code: string; ageIdx: number | null }[]; buckets: string[] }> {
  if (!isOdataConfigured()) return { clients: [], buckets: NEW_CLIENT_AGE_BUCKETS };
  const p = (n: number) => String(n).padStart(2, "0");
  const dt = (s: string) => { const d = new Date(s); return `datetime'${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00'`; };
  const filter = `CENTRO eq 1 and FECHA_ALTA ge ${dt(from)} and FECHA_ALTA lt ${dt(to)}`;
  const rows = await odataSelect<{ CODIGO: string | number; FECHA_NACIMIENTO: string | null; FECHA_ALTA: string | null }>("VX_CLIENTES", { filter, select: ["CODIGO", "FECHA_NACIMIENTO", "FECHA_ALTA", "CENTRO"] }).catch(() => []);
  const clients = rows.map((r) => {
    let ageIdx: number | null = null;
    if (r.FECHA_NACIMIENTO) {
      // Idade à data da ALTA (não a de hoje) — estável para meses passados.
      const ref = r.FECHA_ALTA ? new Date(r.FECHA_ALTA).getTime() : Date.now();
      const age = Math.floor((ref - new Date(r.FECHA_NACIMIENTO).getTime()) / (365.25 * 86_400_000));
      if (age >= 0) ageIdx = Math.min(Math.floor(age / 10), NEW_CLIENT_AGE_BUCKETS.length - 1);
    }
    return { code: String(r.CODIGO ?? "").trim(), ageIdx };
  });
  return { clients, buckets: NEW_CLIENT_AGE_BUCKETS };
}

/** Seguros do mês (REST FacturasClientes): clientes por seguradora, % desc médio
 *  e € COMPARTICIPADO. Modelo (validado): cada venda com seguro gera 3 faturas —
 *  FR (recibo à seguradora, desc=0), FT (fatura cliente, `Importe_descuento` = a
 *  comparticipação que o cliente NÃO pagou) e NC (nota de crédito que anula a FR,
 *  desc=0). Como FR/NC têm desc=0, somar `Importe_descuento` por seguradora dá
 *  diretamente o € comparticipado. */
async function monthlyInsurers(from: string, to: string, names: Record<string, string>): Promise<{ bySeguro: { name: string; count: number }[]; clientsBySeguro: { name: string; clients: string[] }[]; descPorSeguro: { name: string; pct: number }[]; eurPorSeguro: { name: string; eur: number }[] }> {
  const filter = [dateRangeFilter("Fecha", new Date(from), new Date(to)), centroFilter()].filter(Boolean).join(" and ");
  const fields = ["Codigo", "Centro", "Fecha", "Codigo_aseguradora", "Codigo_cliente", "Importe_bruto", "Importe_descuento"];
  const rows = await selectAll<{ Codigo_aseguradora: string | number | null; Codigo_cliente: string | number | null; Importe_bruto: string | number; Importe_descuento: string | number }>(
    "FacturasClientes", { fields, filter }, 1000,
  ).catch(() => [] as { Codigo_aseguradora: string | number | null; Codigo_cliente: string | number | null; Importe_bruto: string | number; Importe_descuento: string | number }[]);
  const clients = new Map<string, Set<string>>();
  const disc = new Map<string, { bruto: number; desc: number }>();
  for (const r of rows) {
    const c = String(r.Codigo_aseguradora ?? "").trim();
    if (!c || c === "0") continue;
    // Só seguradoras MAPEADAS no Admin (decisão do dono: "nos mapas só estas").
    const nm = names[c]?.trim();
    if (!nm) continue;
    (clients.get(nm) ?? clients.set(nm, new Set()).get(nm)!).add(String(r.Codigo_cliente ?? ""));
    const d = disc.get(nm) ?? { bruto: 0, desc: 0 };
    d.bruto += num(r.Importe_bruto); d.desc += num(r.Importe_descuento); disc.set(nm, d);
  }
  return {
    bySeguro: [...clients.entries()].map(([name, set]) => ({ name, count: set.size })).sort((a, b) => b.count - a.count),
    clientsBySeguro: [...clients.entries()].map(([name, set]) => ({ name, clients: [...set] })),
    descPorSeguro: [...disc.entries()].map(([name, d]) => ({ name, pct: d.bruto ? Math.round((d.desc / d.bruto) * 100) : 0 })).sort((a, b) => b.pct - a.pct),
    eurPorSeguro: [...disc.entries()].map(([name, d]) => ({ name, eur: Math.round(d.desc * 100) / 100 })).filter((s) => s.eur > 0).sort((a, b) => b.eur - a.eur),
  };
}

// ─── Entidades (seguros) — menu Entidades ─────────────────────────────────────
/**
 * Módulo assente nas **VENDAS** (decisão do dono), não nas faturas.
 *
 * A seguradora só está na FATURA (`FacturasClientes.Codigo_aseguradora`, REST) — a
 * venda não a regista (validado: a união dos campos de 1386 vendas não traz nada de
 * seguro). A ponte é o **OData `VX_FACTURAS_CLIENTES.CODIGO_VENTA`**, que liga a
 * fatura à venda: liga **96,8%** das faturas com seguro, nenhuma com CODIGO_VENTA
 * vazio (adivinhar por cliente+valor só acertava 54%).
 *
 * Com a venda em mãos, tudo o resto sai dela e usa a maquinaria normal:
 *  - vendedor (`Usuario`), linhas, categorias, e **margem REAL** via `lineCostNet` +
 *    `entryCosts` (cadeia entrada→fatura do fornecedor) — cobertura ~97% num mês
 *    liquidado, contra os ~30% que dava pelas linhas da fatura.
 *  - **Comparticipação** = o desconto da venda (`Importe_descuento_lineas` +
 *    `Importe_DescuentoGlobal`): numa venda com seguro é o € que o cliente NÃO paga
 *    (ex.: bruto 281 − 56,20 = 224,80 pagos). ⚠️ `Importe_asegurado` (linha da fatura)
 *    seria o valor exato mas o Visual só o preenche em ~1% dos casos (medido em
 *    Jun/25, Jan/26, Jun/26 e Jul/26) — inútil.
 */
export interface InsurerEntityRow {
  codigo: string;
  name: string;
  vendas: number;
  /** Venda líquida (o que o cliente pagou). */
  total: number;
  /** € médio de comparticipação por venda. */
  descMedio: number;
  /** € que o cliente não pagou por ter seguro. */
  comparticipacao: number;
}

/**
 * Seguradora de cada VENDA do período: OData liga venda→fatura, a REST dá o
 * `Codigo_aseguradora` dessa fatura. Mapa `codigoVenta` → código da seguradora.
 */
const ventaSeguroCache = new Map<string, { promise: Promise<Map<number, string>>; expires: number }>();
function seguroPorVenta(from: string, to: string): Promise<Map<number, string>> {
  const key = `${from}|${to}`;
  const hit = ventaSeguroCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    // ⚠️ Por DATA, não por lotes de códigos: pedir as faturas em lotes de 50 dava ~58
    // chamadas que, serializadas com o gap de 400ms da API, levavam 81s. Assim são 2
    // varreduras (uma OData, uma REST).
    // Janela: a fatura é emitida na ENTREGA, logo é do dia da venda ou POSTERIOR —
    // nunca antes. +30d chega: validado em Junho/2026, dá exatamente os mesmos números
    // que +60d (769 vendas, 211.456,06€) e poupa uma varredura de faturas.
    const fim = new Date(new Date(to).getTime() + 30 * 86_400_000).toISOString();
    const [vxFaturas, restFaturas] = await Promise.all([
      invoiceVentaLinks(from, fim),
      (async () => {
        const filter = [dateRangeFilter("Fecha", new Date(from), new Date(fim)), centroFilter()].filter(Boolean).join(" and ");
        // ⚠️ com `fields` restrito, os campos do FILTRO têm de constar da lista (senão 500).
        return selectAll<{ Codigo: string | number; Codigo_aseguradora?: string | number | null }>(
          "FacturasClientes",
          { filter, fields: ["Codigo", "Centro", "Fecha", "Codigo_aseguradora"] },
          1000,
        ).catch(() => []);
      })(),
    ]);
    const segDeFatura = new Map<string, string>();
    for (const r of restFaturas) {
      const s = String(r.Codigo_aseguradora ?? "").trim();
      if (s && s !== "0") segDeFatura.set(String(r.Codigo), s);
    }
    const out = new Map<number, string>();
    for (const [codFatura, codVenta] of vxFaturas) {
      const s = segDeFatura.get(String(codFatura));
      // Uma venda gera vários documentos (FR/FS/NC…); basta um trazer a seguradora.
      if (s && !out.has(codVenta)) out.set(codVenta, s);
    }
    return out;
  })().catch((e) => {
    ventaSeguroCache.delete(key);
    console.error("seguroPorVenta falhou:", e instanceof Error ? e.message : e);
    return new Map<number, string>();
  });
  ventaSeguroCache.set(key, { promise, expires: Date.now() + VENTAS_TTL_MS });
  return promise;
}

/**
 * Nome a mostrar: o do Admin → Seguradoras ou, em falta, "Seguro «código»".
 * O NOME da seguradora **não existe na API** (só o `Codigo_aseguradora`) — tem de ser
 * rotulado à mão no Admin. Mostram-se TODAS: filtrar pelas mapeadas dava menu vazio.
 */
function insurerLabel(codigo: string, names: Record<string, string>): string {
  return names[codigo]?.trim() || `Seguro ${codigo}`;
}

/** Desconto total de uma venda = o € que o cliente não pagou (=comparticipação, c/ seguro). */
function ventaDesconto(v: VisualVenta): number {
  return num(v.Importe_descuento_lineas) + num(v.Importe_DescuentoGlobal);
}

/**
 * Vendas COM SEGURO agregadas por entidade (menu Entidades).
 * Mostra SÓ as entidades com nome no Admin — a cauda de códigos por identificar
 * (reembolso ao paciente, 1-2 faturas) fica escondida. Salvaguarda: se NENHUM
 * código estiver nomeado (ex.: instalação nova), mostra todos para o menu não
 * ficar vazio (aí caem no rótulo "Seguro «código»").
 */
export async function insurerEntities(from: string, to: string, names: Record<string, string>): Promise<InsurerEntityRow[]> {
  const [ventas, seguros] = await Promise.all([fetchVentas(from, to), seguroPorVenta(from, to)]);
  const onlyNamed = Object.values(names).some((n) => n?.trim());
  const agg = new Map<string, { vendas: number; total: number; desc: number }>();
  for (const v of ventas) {
    if (v.Es_presupuesto === "S") continue;
    const cod = seguros.get(Number(v.Codigo)); if (!cod) continue;
    if (onlyNamed && !names[cod]?.trim()) continue; // esconde a cauda sem nome
    const desc = ventaDesconto(v);
    const a = agg.get(cod) ?? { vendas: 0, total: 0, desc: 0 };
    a.vendas += 1;
    a.total += num(v.Importe_bruto) - desc;
    a.desc += desc;
    agg.set(cod, a);
  }
  return [...agg.entries()]
    .map(([codigo, a]) => ({
      codigo, name: insurerLabel(codigo, names),
      vendas: a.vendas,
      total: round(a.total),
      descMedio: a.vendas > 0 ? round(a.desc / a.vendas) : 0,
      comparticipacao: round(a.desc),
    }))
    .sort((x, y) => y.total - x.total);
}

export interface InsurerEntityDetail {
  codigo: string; name: string;
  vendas: number; total: number; comparticipacao: number; descMedio: number;
  /** Ticket médio = total ÷ nº de vendas. */
  ticket: number;
  /** Margem % — sobre as vendas com custo conhecido (ver `cobertura`). */
  margemPct: number;
  /** % do € com custo conhecido. Baixa em meses recentes: as faturas do laboratório
   *  ainda não chegaram (é cobertura, não margem). */
  cobertura: number;
  produtos: { desc: string; qty: number; valor: number }[];
  vendedores: { name: string; vendas: number; valor: number }[];
}

/** Detalhe de UMA entidade (página /entidades/[codigo]), a partir das VENDAS. */
export async function insurerEntityDetail(
  from: string, to: string, codigo: string, names: Record<string, string>,
): Promise<InsurerEntityDetail | null> {
  const [ventas, seguros, articles, entryCosts] = await Promise.all([
    fetchVentas(from, to), seguroPorVenta(from, to),
    articleIndexForRange(from, to), lineEntryCosts(from, to),
  ]);
  const minhas = ventas.filter((v) => v.Es_presupuesto !== "S" && seguros.get(Number(v.Codigo)) === codigo);
  if (!minhas.length) return null;

  let vendas = 0, total = 0, desc = 0, netTotal = 0, netCoberto = 0, custo = 0;
  const prod = new Map<string, { qty: number; valor: number }>();
  const vend = new Map<string, { vendas: number; valor: number }>();
  for (const v of minhas) {
    const d = ventaDesconto(v);
    const net = num(v.Importe_bruto) - d;
    vendas++; total += net; desc += d;
    const u = (v.Usuario || "—").trim() || "—";
    const cv = vend.get(u) ?? { vendas: 0, valor: 0 };
    cv.vendas += 1; cv.valor += net;
    vend.set(u, cv);
    const ratio = lineDiscountRatio(v);
    for (const l of v.lineas) {
      const qty = num(l.Cantidad);
      const gross = num(l.Precio_unitario) * qty;
      const lineNet = gross - num(l.Importe_descuento) - gross * ratio;
      netTotal += lineNet;
      // Produto: tira-se o prefixo do olho ("O.D.:"/"O.E.:") senão a MESMA lente
      // conta duas vezes, uma por olho, e o top sai partido ao meio.
      const desc0 = (l.Descripcion ?? "").split("\n")[0].replace(/^\s*O\.[DE]\.\s*:\s*/i, "").trim() || "—";
      const p = prod.get(desc0) ?? { qty: 0, valor: 0 };
      p.qty += qty; p.valor += lineNet;
      prod.set(desc0, p);
      // Margem REAL: maestro para o stock, cadeia entrada→fatura para as encomendas.
      const cn = lineCostNet(v, l, articles, ratio, entryCosts);
      if (cn) { netCoberto += cn.net; custo += cn.cost; }
    }
  }
  return {
    codigo, name: insurerLabel(codigo, names),
    vendas, total: round(total), comparticipacao: round(desc),
    descMedio: vendas > 0 ? round(desc / vendas) : 0,
    ticket: vendas > 0 ? round(total / vendas) : 0,
    margemPct: netCoberto > 0 ? round(((netCoberto - custo) / netCoberto) * 100) : 0,
    cobertura: netTotal > 0 ? round((netCoberto / netTotal) * 100) : 0,
    produtos: [...prod.entries()].map(([d, x]) => ({ desc: d, qty: x.qty, valor: round(x.valor) }))
      .sort((a, b) => b.valor - a.valor).slice(0, 15),
    vendedores: [...vend.entries()].map(([n, x]) => ({ name: n, vendas: x.vendas, valor: round(x.valor) }))
      .sort((a, b) => b.valor - a.valor),
  };
}

export interface InsurerDiscountRow {
  name: string;
  /** nº de clientes distintos com fatura desta seguradora no período. */
  clientes: number;
  /** desconto MÉDIO concedido em vendas com esta seguradora (Σ desc ÷ Σ bruto). */
  descMedioPct: number;
  /** € comparticipado total (Σ Importe_descuento das faturas). */
  eurComparticipado: number;
}

/**
 * Análise de DESCONTOS em vendas com seguro, por seguradora (página Faturação).
 * Reutiliza o modelo das FacturasClientes (ver `monthlyInsurers`): o desconto médio
 * é a comparticipação média (Importe_descuento ÷ Importe_bruto) das vendas com cada
 * seguradora MAPEADA no Admin. Só seguradoras com nome definido entram.
 */
export async function insurerDiscounts(from: string, to: string, names: Record<string, string>): Promise<InsurerDiscountRow[]> {
  const filter = [dateRangeFilter("Fecha", new Date(from), new Date(to)), centroFilter()].filter(Boolean).join(" and ");
  const fields = ["Codigo", "Centro", "Fecha", "Codigo_aseguradora", "Codigo_cliente", "Importe_bruto", "Importe_descuento"];
  const rows = await selectAll<{ Codigo_aseguradora: string | number | null; Codigo_cliente: string | number | null; Importe_bruto: string | number; Importe_descuento: string | number }>(
    "FacturasClientes", { fields, filter }, 1000,
  ).catch(() => [] as { Codigo_aseguradora: string | number | null; Codigo_cliente: string | number | null; Importe_bruto: string | number; Importe_descuento: string | number }[]);
  const agg = new Map<string, { bruto: number; desc: number; clients: Set<string> }>();
  for (const r of rows) {
    const c = String(r.Codigo_aseguradora ?? "").trim();
    if (!c || c === "0") continue;
    const nm = names[c]?.trim();
    if (!nm) continue; // só seguradoras mapeadas
    const a = agg.get(nm) ?? { bruto: 0, desc: 0, clients: new Set<string>() };
    a.bruto += num(r.Importe_bruto); a.desc += num(r.Importe_descuento);
    a.clients.add(String(r.Codigo_cliente ?? ""));
    agg.set(nm, a);
  }
  return [...agg.entries()]
    .map(([name, a]) => ({
      name,
      clientes: a.clients.size,
      descMedioPct: a.bruto > 0 ? Math.round((a.desc / a.bruto) * 1000) / 10 : 0,
      eurComparticipado: Math.round(a.desc * 100) / 100,
    }))
    .sort((x, y) => y.eurComparticipado - x.eurComparticipado);
}

/** Relatório MENSAL completo (réplica do template). */
export async function monthlyReport(from: string, to: string, saudeCodes: Iterable<string> = [], aseguradoraNames: Record<string, string> = {}): Promise<MonthlyReport> {
  const [ventas, presupuestos, articles, classMap, providers, monthCompare, yearCompare, newClients, insurers, boughtQty, noArtByClase] = await Promise.all([
    // Exclui os utilizadores de sistema/gestão (Admin, Perpétuo, José João) de TODAS
    // as agregações a jusante (vendedores, valor por tipo, orçamentos, ticket, etc.).
    fetchVentas(from, to).then((vs) => vs.filter((v) => !isExcludedReportUser(v.Usuario))),
    fetchVentas(from, to, true).then((all) => all.filter((v) => v.Es_presupuesto === "S" && !isExcludedReportUser(v.Usuario))),
    articleIndexForRange(from, to),
    lineClasses(from, to),
    lineProviders(from, to),
    yearTotalsForRange(from, to, 4),
    ytdTotals(to, 2),
    monthlyNewClients(from, to),
    monthlyInsurers(from, to, aseguradoraNames),
    purchaseQtyByArticle(from, to).catch(() => new Map<string, number>()),
    purchaseNoArticleQtyByClass(from, to).catch(() => new Map<string, number>()),
  ]);
  // Compras por TIPO (réplica do template "COMPRAS MENSAIS"): unidades RECECIONADAS
  // por categoria de produto (ARO/SOL/LENTES/LC). Classifica cada artigo comprado
  // pela classe do maestro (categoryFromClase via o índice de artigos).
  const purchasedArticles = await loadArticleIndexFor(boughtQty.keys());
  const comprasByTipo = new Map<string, number>([["ARO", 0], ["SOL", 0], ["LC", 0], ["LENTES", 0]]);
  for (const [code, qty] of boughtQty) {
    const cat = purchasedArticles.get(code)?.category;
    const label = cat === "armacoes" ? "ARO" : cat === "oculos_sol" ? "SOL" : cat === "lentes_oftalmicas" ? "LENTES" : cat === "lentes_contacto" ? "LC" : null;
    if (label) comprasByTipo.set(label, (comprasByTipo.get(label) ?? 0) + qty);
  }
  // Lentes de lab e LC de encomenda entram SEM artigo → classificam-se pela classe
  // da linha de venda a que ligam (senão as compras de lentes oftálmicas dão 0).
  for (const [clase, qty] of noArtByClase) {
    const cat = categoryFromClase(clase);
    const label = cat === "lentes_oftalmicas" ? "LENTES" : cat === "lentes_contacto" ? "LC" : null;
    if (label) comprasByTipo.set(label, (comprasByTipo.get(label) ?? 0) + qty);
  }
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));

  const seller = new Map<string, { net: number; ventas: Set<string>; bruto: number; desc: number }>();
  const valorPorTipo = { aro: 0, sol: 0, lentes: 0, lc: 0 };
  const arosSol = new Map<string, number>();
  const fornLentes = new Map<string, Map<string, number>>();
  const lcVend = new Map<string, { diaria: number; mensal: number; outras: number }>();
  const lcGama = new Map<string, number>();
  const saudeGama = new Map<string, Map<string, number>>(); // tipo → marca → qty
  const aparelhos = new Map<string, { total: number; count: number }>();
  const aparelhosMarcas = new Map<string, number>(); // marca → qty

  for (const v of ventas) {
    const ratio = lineDiscountRatio(v);
    const sel = v.Usuario || "—";
    const sAcc = seller.get(sel) ?? { net: 0, ventas: new Set<string>(), bruto: 0, desc: 0 };
    for (const l of v.lineas) {
      const cat = lineCategory(v, l, classMap, saude, articles);
      const qty = num(l.Cantidad);
      const gross = num(l.Precio_unitario) * qty;
      const lineNet = gross - num(l.Importe_descuento) - gross * ratio;
      const desc = l.Descripcion ?? "";
      sAcc.net += lineNet; sAcc.bruto += gross; sAcc.desc += num(l.Importe_descuento) + gross * ratio;
      const art = articleForLine(l, articles);
      if (cat === "armacoes") { valorPorTipo.aro += lineNet; const b = (art?.brand || "Outros").trim(); arosSol.set(b, (arosSol.get(b) ?? 0) + qty); }
      else if (cat === "oculos_sol") { valorPorTipo.sol += lineNet; const b = (art?.brand || "Outros").trim(); arosSol.set(b, (arosSol.get(b) ?? 0) + qty); }
      else if (cat === "lentes_oftalmicas") {
        valorPorTipo.lentes += lineNet;
        const prov = (providers.get(`${v.Codigo}-${l.Codigo_linea}`) || art?.brand || "Outros").trim();
        const pm = fornLentes.get(sel) ?? new Map<string, number>();
        pm.set(prov, (pm.get(prov) ?? 0) + qty); fornLentes.set(sel, pm);
      } else if (cat === "lentes_contacto") {
        valorPorTipo.lc += lineNet;
        const box = lcBox(desc);
        const lv = lcVend.get(sel) ?? { diaria: 0, mensal: 0, outras: 0 };
        if (box?.tipo === "diaria") lv.diaria += qty; else if (box?.tipo === "mensal") lv.mensal += qty; else lv.outras += qty;
        lcVend.set(sel, lv);
        const tipoLabel = `${box ? box.tipo.toUpperCase() : "OUTRAS"} ${lcSub(desc)}`;
        lcGama.set(tipoLabel, (lcGama.get(tipoLabel) ?? 0) + qty);
      } else if (cat === "saude_ocular") {
        const b = (art?.brand || "Outros").trim();
        const tipo = saudeTipo(desc);
        const bm = saudeGama.get(tipo) ?? new Map<string, number>();
        bm.set(b, (bm.get(b) ?? 0) + qty); saudeGama.set(tipo, bm);
      }
      if (AUDIO_RE.test(desc)) {
        const a = aparelhos.get(sel) ?? { total: 0, count: 0 };
        a.total += lineNet; a.count += qty; aparelhos.set(sel, a);
        const b = (art?.brand || "Outros").trim();
        aparelhosMarcas.set(b, (aparelhosMarcas.get(b) ?? 0) + qty);
      }
      if (Math.abs(lineNet) > 0.001) sAcc.ventas.add(String(v.Codigo));
    }
    seller.set(sel, sAcc);
  }

  const totalNet = [...seller.values()].reduce((s, x) => s + x.net, 0);
  const sellers: ReportSeller[] = [...seller.entries()]
    .map(([name, x]) => ({ name, sales: round(x.net), count: x.ventas.size, ticket: x.ventas.size ? round(x.net / x.ventas.size) : 0, pct: totalNet ? round((x.net / totalNet) * 10000) / 100 : 0 }))
    .sort((a, b) => b.sales - a.sales);
  const sellerDiscount = [...seller.entries()].map(([name, x]) => ({ name, pct: x.bruto ? Math.round((x.desc / x.bruto) * 100) : 0 })).sort((a, b) => a.name.localeCompare(b.name));
  const orcMap = new Map<string, number>();
  for (const v of presupuestos) orcMap.set(v.Usuario || "—", (orcMap.get(v.Usuario || "—") ?? 0) + 1);

  const baseYear = new Date(from).getFullYear();
  const prev = yearCompare.find((y) => y.year === baseYear - 1)?.comIva ?? 0;
  const curr = yearCompare.find((y) => y.year === baseYear)?.comIva ?? 0;

  // Clientes NOVOS = dados de alta no mês E com VENDA real no mês. Exclui os que
  // foram criados só para um ORÇAMENTO (sem compra) — decisão do dono. `ventas` já
  // são só vendas reais (isRealSale, sem orçamentos). Código de cliente comparável
  // entre VX_CLIENTES.CODIGO e Ventas.Codigo_cliente (mesma BD, string aparada).
  const realSaleClients = new Set(ventas.map((v) => String(v.Codigo_cliente ?? "").trim()).filter(Boolean));
  const novos = newClients.clients.filter((c) => c.code && realSaleClients.has(c.code));
  const newCodes = new Set(novos.map((c) => c.code));
  const ageCounts = new Array(newClients.buckets.length).fill(0);
  for (const c of novos) if (c.ageIdx != null) ageCounts[c.ageIdx]++;
  const byAge = newClients.buckets.map((label, i) => ({ label, count: ageCounts[i] }));

  // P3 "COM SEGURO" = clientes NOVOS (com venda) que têm seguro, por seguradora
  // (interseção dos códigos dos clientes novos com os das faturas com seguro).
  const bySeguroNovos = insurers.clientsBySeguro
    .map(({ name, clients }) => ({ name, count: clients.filter((c) => newCodes.has(c)).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    from, to, sellers, sellerDiscount, valorPorTipo,
    top3: sellers.slice(0, 3).map((s) => ({ name: s.name, sales: s.sales, pct: s.pct })),
    arosSolBrands: [...arosSol.entries()].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count).slice(0, 13),
    fornecedorLentes: [...fornLentes.entries()].map(([seller, pm]) => ({ seller, providers: [...pm.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) })).sort((a, b) => a.seller.localeCompare(b.seller)),
    lcPorVendedor: [...lcVend.entries()].map(([seller, x]) => ({ seller, ...x })).sort((a, b) => a.seller.localeCompare(b.seller)),
    lcGama: [...lcGama.entries()].map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count),
    saudeGama: SAUDE_TIPOS
      .map((tipo) => ({ tipo, brands: [...(saudeGama.get(tipo)?.entries() ?? [])].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) }))
      .filter((t) => t.brands.length),
    aparelhos: [...aparelhos.entries()].map(([seller, x]) => ({ seller, total: round(x.total), count: x.count })).sort((a, b) => b.total - a.total),
    aparelhosBrands: [...aparelhosMarcas.entries()].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count),
    orcamentos: [...orcMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    ticket: sellers.map((s) => ({ name: s.name, ticket: s.ticket })),
    ranking: sellers.filter((s) => s.pct > 0).map((s) => ({ name: s.name, pct: s.pct })),
    monthCompare, yearCompare,
    yearImprovementPct: prev ? Math.round(((curr - prev) / prev) * 1000) / 10 : 0,
    clientesNovos: { total: novos.length, byAge, bySeguro: bySeguroNovos },
    descPorSeguro: insurers.descPorSeguro,
    eurPorSeguro: insurers.eurPorSeguro,
    comprasPorTipo: [...comprasByTipo.entries()].map(([tipo, qty]) => ({ tipo, qty })),
  };
}

// ─── Análise de vendas por fornecedor (página /fornecedores/[codigo]) ─────────
//
// Eixo: VX_LINEAS_VENTA.PROVEEDOR (existe em TODAS as linhas, no mesmo espaço de
// códigos das compras/supplier_config) + a taxonomia AGRUPACION1/2/3 (material e
// género nas armações; tipo de lente nas oftálmicas) + prescrição (ESFERA/
// CILINDRO/ADICION → classifica LC esférica/tórica/multifocal) + VX_VENTAS.USUARIO
// (vendedor) + VX_CLIENTES.SEXO/FECHA_NACIMIENTO (demografia do comprador).

export type DemoGender = "M" | "F" | null;

export interface SupplierSplit { label: string; qty: number; sales: number; pct: number }

export interface SupplierSellerRow {
  usuario: string; sales: number; qty: number; num_ventas: number; top_product: string;
}

export interface SupplierAnalytics {
  proveedor: string;
  nome: string;
  total_sales: number;
  total_qty: number;
  num_ventas: number;
  avg_ticket: number;
  margin_pct: number;       // margem só sobre as linhas com custo conhecido
  coverage_pct: number;     // % do valor de venda com custo conhecido
  by_category: { label: string; sales: number; qty: number }[];
  best_sellers: { name: string; qty: number; sales: number; margin_pct: number }[];
  buyer_gender: SupplierSplit[];
  age_bands: SupplierSplit[];
  sellers: SupplierSellerRow[];
  frames?: { by_gender: SupplierSplit[]; by_material: SupplierSplit[] };
  contact?: { by_schedule: SupplierSplit[]; by_prescription: SupplierSplit[]; saude_sales: number };
  lenses?: {
    by_type: SupplierSplit[];
    second_pair_ventas: number;
    second_pair_sales: number;
    smartlife?: { usuario: string; monofocais: number; progressivas: number; outras: number }[];
  };
}

const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0-17", min: 0, max: 17 },
  { label: "18-30", min: 18, max: 30 },
  { label: "31-45", min: 31, max: 45 },
  { label: "46-60", min: 46, max: 60 },
  { label: "61-75", min: 61, max: 75 },
  { label: "76+", min: 76, max: 200 },
];
function ageBand(age: number | null): string | null {
  if (age == null || !Number.isFinite(age) || age < 0 || age > 120) return null;
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.label ?? null;
}

const titleCase = (s: string): string => {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "—";
};

/** Limpa a descrição de uma linha (tira prefixo O.D./O.I. e colapsa espaços) para agrupar best-sellers. */
function cleanLineDesc(desc: string): string {
  return (desc || "").replace(/^\s*O\.[DIE]\.?:\s*/i, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 52) || "—";
}

/** Género-alvo da armação (AGRUPACION3 nas classes G/S). */
function frameGender(agr3: string): string {
  const a = agr3.toUpperCase();
  if (/UNISEX/.test(a)) return "Unisexo";
  if (/NI[ÑN]O|NI[ÑN]A|CRIAN|INFANT|JUNIOR|KID/.test(a)) return "Criança";
  if (/HOMBRE|HOMEM|\bH\b/.test(a)) return "Homem";
  if (/SE[ÑN]ORA|SENHORA|MUJER|MULHER|\bM\b/.test(a)) return "Senhora";
  return a ? titleCase(a) : "—";
}

/** Tipo de lente oftálmica (AGRUPACION3 da classe L; fallback à descrição). */
function lensType(d: LineSalesDetail, desc: string): string {
  const a = d.agr3.toUpperCase();
  if (a.includes("PROGRES")) return "Progressivas";
  if (a.includes("BIFOCAL")) return "Bifocais";
  if (a.includes("MONO")) return "Monofocais";
  const f = `${d.tipo} ${desc}`.toUpperCase();
  if (/PROGRES|VARILUX|EYEZEN/.test(f)) return "Progressivas";
  if (/BIFOCAL/.test(f)) return "Bifocais";
  if (/MONOFOCAL|MONO\.?\s|LEJOS|CERCA/.test(f)) return "Monofocais";
  return "Outras";
}

/** Periodicidade de substituição da LC (a partir da descrição). */
function clSchedule(desc: string): string {
  const d = desc.toUpperCase();
  if (/\bDIARI|1\s*DAY|DAILY|ONE\s*DAY/.test(d)) return "Diárias";
  if (/QUINCEN|BISEMAN|2\s*SEMANAS|15\s*D[IÍ]AS/.test(d)) return "Quinzenais";
  if (/SEMANAL|WEEKLY/.test(d)) return "Semanais";
  if (/MENSUAL|MENSAL|MONTHLY|\b30\s*D[IÍ]AS/.test(d)) return "Mensais";
  if (/TRIMESTRAL|\b90\s*D[IÍ]AS/.test(d)) return "Trimestrais";
  if (/ANUAL|ANUAIS|ANNUAL|\b3[0-6][0-9]\s*D[IÍ]AS/.test(d)) return "Anuais";
  return "Outras";
}

/** Classificação ótica da LC: esférica / tórica / multifocal (prescrição + descrição). */
function clPrescription(d: LineSalesDetail, desc: string): string {
  const t = desc.toUpperCase();
  if (d.adicion !== 0 || /MULTIFOCAL|PROGRES|BIFOCAL|PRESBI/.test(t)) return "Multifocais";
  if (d.cilindro !== 0 || /T[OÓ]RIC|ASTIGMAT/.test(t)) return "Tóricas";
  return "Esféricas";
}

function toSplits(m: Map<string, { qty: number; sales: number }>): SupplierSplit[] {
  const totalQty = [...m.values()].reduce((s, x) => s + Math.abs(x.qty), 0) || 1;
  return [...m.entries()]
    .map(([label, x]) => ({ label, qty: x.qty, sales: round(x.sales), pct: Math.round((Math.abs(x.qty) / totalQty) * 100) }))
    .sort((a, b) => b.qty - a.qty);
}

// Demografia do cliente (sexo + ano de nascimento), partilha o cache do catálogo de clientes.
async function loadClientDemographics(): Promise<Map<string, { sexo: DemoGender; birthYear: number | null }>> {
  const clientes = await loadAllClientes();
  const m = new Map<string, { sexo: DemoGender; birthYear: number | null }>();
  for (const c of clientes) {
    const by = parseDate(c.Fecha_nacimiento)?.getFullYear() ?? null;
    const sx: DemoGender = c.Sexo === "M" || c.Sexo === "F" ? c.Sexo : null;
    m.set(`${c.Codigo}-${c.Centro}`, { sexo: sx, birthYear: by });
  }
  return m;
}

interface SupLine {
  proveedor: string;
  brand: string;
  clase: string;
  category: SaleCategory;
  detail: LineSalesDetail;
  desc: string;
  codeKey: string;
  qty: number;
  net: number;
  cost: number | null;
  usuario: string;
  ventaCodigo: string;
  referencia: string;
  fecha: string;
  estado: string;
  isSecondPairVenta: boolean;
  sexo: DemoGender;
  age: number | null;
}

// Enriquecimento pesado (OData): cacheado 5 min por intervalo — abrir vários
// vendedores/fornecedores do MESMO intervalo reusa o cálculo (só o 1º é lento).
// NÃO usar VENTAS_TTL_MS (60s, mantém as vendas ao vivo) aqui.
const SUPPLIER_LINES_TTL_MS = 5 * 60_000;
const supplierLinesCache = new Map<string, { promise: Promise<SupLine[]>; expires: number }>();

/** Linhas de venda do período enriquecidas (fornecedor, taxonomia, custo, comprador). Cacheado 5 min. */
async function supplierLines(from: string, to: string, withDemographics = true): Promise<SupLine[]> {
  // A demografia (género/idade do comprador) obriga a carregar os ~10k clientes.
  // Só o menu de Fornecedores a usa — o detalhe do vendedor NÃO → pode saltá-la
  // (evita o carregamento dos 10k clientes no caminho do vendedor).
  const key = `${from}|${to}|${withDemographics ? "d" : "n"}`;
  const hit = supplierLinesCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    const [ventas, articles, entryCosts, demo] = await Promise.all([
      fetchVentas(from, to),
      articleIndexForRange(from, to),
      lineEntryCosts(from, to),
      withDemographics ? loadClientDemographics() : Promise.resolve(new Map<string, { sexo: DemoGender; birthYear: number | null }>()),
    ]);
    const codes = [...new Set(ventas.map((v) => Number(v.Codigo)))].filter(Boolean);
    const details = await lineSalesDetailsForVentas(codes);
    const classMap = new Map<string, string>();
    for (const [k, d] of details) if (d.clase) classMap.set(k, d.clase);
    const noSaude = new Set<string>();
    const out: SupLine[] = [];
    for (const v of ventas) {
      const ratio = lineDiscountRatio(v);
      const ventaYear = parseDate(v.Fecha)?.getFullYear() ?? null;
      const dm = demo.get(`${v.Codigo_cliente}-${v.Centro_cliente}`);
      const age = dm?.birthYear != null && ventaYear != null ? ventaYear - dm.birthYear : null;
      // 1ª passagem: a venda é 2º par? (graduado + sol)
      let hasGrad = false, hasSun = false;
      for (const l of v.lineas) {
        const cat = lineCategory(v, l, classMap, noSaude, articles);
        if (cat === "lentes_oftalmicas") hasGrad = true;
        else if (cat === "oculos_sol") hasSun = true;
      }
      const isSecondPairVenta = hasGrad && hasSun;
      for (const l of v.lineas) {
        const dkey = `${v.Codigo}-${l.Codigo_linea}`;
        const detail = details.get(dkey) ?? { proveedor: "", clase: "", agr1: "", agr2: "", agr3: "", tipo: "", esfera: 0, cilindro: 0, adicion: 0 };
        const qty = num(l.Cantidad);
        const gross = num(l.Precio_unitario) * qty;
        const net = gross - num(l.Importe_descuento) - gross * ratio;
        const cn = lineCostNet(v, l, articles, ratio, entryCosts);
        const cat = lineCategory(v, l, classMap, noSaude, articles);
        const artBrand = articleForLine(l, articles)?.brand || "";
        // Marca: lentes oftálmicas → fornecedor (lab); resto → marca do artigo (maestro).
        const brand = (cat === "lentes_oftalmicas" ? (detail.proveedor || artBrand) : (artBrand || detail.proveedor)).trim() || "Outros";
        out.push({
          proveedor: detail.proveedor,
          brand,
          clase: detail.clase,
          category: cat,
          detail,
          desc: l.Descripcion ?? "",
          codeKey: norm13(l.Codigo_articulo) || norm13(l.Codigo_producto) || cleanLineDesc(l.Descripcion ?? ""),
          qty,
          net,
          cost: cn ? cn.cost : null,
          usuario: v.Usuario || "—",
          ventaCodigo: String(v.Codigo),
          referencia: v.Referencia || String(v.Codigo),
          fecha: isoDay(parseDate(v.Fecha)) ?? "",
          estado: String(l.Estado ?? ""),
          isSecondPairVenta,
          sexo: dm?.sexo ?? null,
          age,
        });
      }
    }
    return out;
  })().catch((e) => {
    supplierLinesCache.delete(key);
    console.error("supplierLines falhou:", e instanceof Error ? e.message : e);
    return [] as SupLine[];
  });
  supplierLinesCache.set(key, { promise, expires: Date.now() + SUPPLIER_LINES_TTL_MS });
  return promise;
}

export interface SupplierSalesRow {
  proveedor: string;
  nome: string;
  sales: number;
  qty: number;
  margin_pct: number;
  primary_category: SaleCategory;
}

/** Vendas agregadas por fornecedor no período (para a lista "principais fornecedores"). */
export async function supplierSalesByProvider(from: string, to: string): Promise<SupplierSalesRow[]> {
  const [lines, suppliers] = await Promise.all([supplierLines(from, to), listSuppliers().catch(() => [])]);
  const nameOf = new Map(suppliers.map((s) => [s.proveedor, s.nome]));
  const agg = new Map<string, { sales: number; qty: number; coveredNet: number; cost: number; cat: Map<SaleCategory, number> }>();
  for (const l of lines) {
    if (!l.proveedor) continue;
    const cur = agg.get(l.proveedor) ?? { sales: 0, qty: 0, coveredNet: 0, cost: 0, cat: new Map() };
    cur.sales += l.net; cur.qty += l.qty;
    if (l.cost != null) { cur.coveredNet += l.net; cur.cost += l.cost; }
    cur.cat.set(l.category, (cur.cat.get(l.category) ?? 0) + l.qty);
    agg.set(l.proveedor, cur);
  }
  return [...agg.entries()]
    .map(([proveedor, x]) => {
      const primary = [...x.cat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "diversos";
      return {
        proveedor,
        nome: nameOf.get(proveedor) || proveedor,
        sales: round(x.sales),
        qty: x.qty,
        margin_pct: x.coveredNet > 0 ? round(((x.coveredNet - x.cost) / x.coveredNet) * 100) : 0,
        primary_category: primary,
      };
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.sales - a.sales);
}

/** Análise detalhada de um fornecedor (best-sellers, demografia, tipos, margens, vendedores). */
export async function supplierAnalytics(
  proveedor: string,
  from: string,
  to: string,
  saudeCodes: Iterable<string> = [],
): Promise<SupplierAnalytics | null> {
  const [lines, suppliers] = await Promise.all([supplierLines(from, to), listSuppliers().catch(() => [])]);
  const target = proveedor.trim();
  const nome = new Map(suppliers.map((s) => [s.proveedor, s.nome])).get(target) || target;
  const mine = lines.filter((l) => l.proveedor === target);
  const saude = new Set([...saudeCodes].map((c) => norm13(c)).filter(Boolean));

  const base: SupplierAnalytics = {
    proveedor: target, nome,
    total_sales: 0, total_qty: 0, num_ventas: 0, avg_ticket: 0, margin_pct: 0, coverage_pct: 0,
    by_category: [], best_sellers: [], buyer_gender: [], age_bands: [], sellers: [],
  };
  if (!mine.length) return base;

  const ventaSet = new Set<string>();
  let coveredNet = 0, totalCost = 0;
  const catAgg = new Map<SaleCategory, { sales: number; qty: number }>();
  const sellerAgg = new Map<string, { sales: number; qty: number; ventas: Set<string>; prod: Map<string, number> }>();
  const bestAgg = new Map<string, { name: string; qty: number; sales: number; coveredNet: number; cost: number }>();
  const genderAgg = new Map<string, { qty: number; sales: number }>();
  const ageAgg = new Map<string, { qty: number; sales: number }>();
  // Específicos por classe
  const frameGenderAgg = new Map<string, { qty: number; sales: number }>();
  const frameMaterialAgg = new Map<string, { qty: number; sales: number }>();
  const clScheduleAgg = new Map<string, { qty: number; sales: number }>();
  const clPrescAgg = new Map<string, { qty: number; sales: number }>();
  let saudeSales = 0;
  const lensTypeAgg = new Map<string, { qty: number; sales: number }>();
  const spVentas = new Set<string>();
  let spSales = 0;
  const smartlifeAgg = new Map<string, { monofocais: number; progressivas: number; outras: number }>();
  let hasFrames = false, hasContact = false, hasLenses = false, hasSmartlife = false;

  const bump = (m: Map<string, { qty: number; sales: number }>, k: string, qty: number, sales: number) => {
    const c = m.get(k) ?? { qty: 0, sales: 0 }; c.qty += qty; c.sales += sales; m.set(k, c);
  };

  for (const l of mine) {
    base.total_sales += l.net; base.total_qty += l.qty; ventaSet.add(l.ventaCodigo);
    if (l.cost != null) { coveredNet += l.net; totalCost += l.cost; }
    bump(catAgg, l.category, l.qty, l.net);
    // best-sellers
    const b = bestAgg.get(l.codeKey) ?? { name: cleanLineDesc(l.desc), qty: 0, sales: 0, coveredNet: 0, cost: 0 };
    b.qty += l.qty; b.sales += l.net; if (l.cost != null) { b.coveredNet += l.net; b.cost += l.cost; }
    bestAgg.set(l.codeKey, b);
    // vendedores
    const s = sellerAgg.get(l.usuario) ?? { sales: 0, qty: 0, ventas: new Set<string>(), prod: new Map<string, number>() };
    s.sales += l.net; s.qty += l.qty; s.ventas.add(l.ventaCodigo);
    s.prod.set(b.name, (s.prod.get(b.name) ?? 0) + l.qty); sellerAgg.set(l.usuario, s);
    // demografia do comprador
    bump(genderAgg, l.sexo === "M" ? "Homem" : l.sexo === "F" ? "Senhora" : "—", l.qty, l.net);
    const ab = ageBand(l.age); if (ab) bump(ageAgg, ab, l.qty, l.net);
    // saúde ocular
    if (saude.has(l.codeKey)) saudeSales += l.net;
    // por classe
    if (l.clase === "G" || l.clase === "S") {
      hasFrames = true;
      bump(frameGenderAgg, frameGender(l.detail.agr3), l.qty, l.net);
      bump(frameMaterialAgg, titleCase(l.detail.agr2), l.qty, l.net);
    }
    if (l.clase === "C") {
      hasContact = true;
      bump(clScheduleAgg, clSchedule(l.desc), l.qty, l.net);
      bump(clPrescAgg, clPrescription(l.detail, l.desc), l.qty, l.net);
    }
    if (l.clase === "L") {
      hasLenses = true;
      const lt = lensType(l.detail, l.desc);
      bump(lensTypeAgg, lt, l.qty, l.net);
      if (l.isSecondPairVenta) { spVentas.add(l.ventaCodigo); spSales += l.net; }
      if (/SMARTLIFE/i.test(l.desc)) {
        hasSmartlife = true;
        const sl = smartlifeAgg.get(l.usuario) ?? { monofocais: 0, progressivas: 0, outras: 0 };
        if (lt === "Monofocais") sl.monofocais += l.qty; else if (lt === "Progressivas") sl.progressivas += l.qty; else sl.outras += l.qty;
        smartlifeAgg.set(l.usuario, sl);
      }
    }
  }

  base.num_ventas = ventaSet.size;
  base.total_sales = round(base.total_sales);
  base.avg_ticket = ventaSet.size ? round(base.total_sales / ventaSet.size) : 0;
  base.coverage_pct = base.total_sales > 0 ? round((round(coveredNet) / base.total_sales) * 100) : 0;
  base.margin_pct = coveredNet > 0 ? round(((coveredNet - totalCost) / coveredNet) * 100) : 0;
  base.by_category = [...catAgg.entries()]
    .map(([cat, x]) => ({ label: CATEGORY_LABELS[cat], sales: round(x.sales), qty: x.qty }))
    .sort((a, b) => b.sales - a.sales);
  base.best_sellers = [...bestAgg.values()]
    .map((x) => ({ name: x.name, qty: x.qty, sales: round(x.sales), margin_pct: x.coveredNet > 0 ? round(((x.coveredNet - x.cost) / x.coveredNet) * 100) : 0 }))
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
    .slice(0, 15);
  base.buyer_gender = toSplits(genderAgg);
  base.age_bands = [...ageAgg.entries()]
    .map(([label, x]) => ({ label, qty: x.qty, sales: round(x.sales), pct: 0 }))
    .sort((a, b) => AGE_BANDS.findIndex((z) => z.label === a.label) - AGE_BANDS.findIndex((z) => z.label === b.label));
  const ageTotalQty = base.age_bands.reduce((s, x) => s + Math.abs(x.qty), 0) || 1;
  base.age_bands.forEach((b) => { b.pct = Math.round((Math.abs(b.qty) / ageTotalQty) * 100); });
  base.sellers = [...sellerAgg.entries()]
    .map(([usuario, x]) => ({
      usuario, sales: round(x.sales), qty: x.qty, num_ventas: x.ventas.size,
      top_product: [...x.prod.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
    }))
    .sort((a, b) => b.sales - a.sales);

  if (hasFrames) base.frames = { by_gender: toSplits(frameGenderAgg), by_material: toSplits(frameMaterialAgg) };
  if (hasContact) base.contact = { by_schedule: toSplits(clScheduleAgg), by_prescription: toSplits(clPrescAgg), saude_sales: round(saudeSales) };
  if (hasLenses) {
    base.lenses = {
      by_type: toSplits(lensTypeAgg),
      second_pair_ventas: spVentas.size,
      second_pair_sales: round(spSales),
      smartlife: hasSmartlife
        ? [...smartlifeAgg.entries()].map(([usuario, x]) => ({ usuario, ...x })).sort((a, b) => (b.monofocais + b.progressivas) - (a.monofocais + a.progressivas))
        : undefined,
    };
  }
  return base;
}

// ─── Análise por VENDEDOR (página /equipa/[vendedor]) ─────────────────────────

export interface EmployeeBrandRow { label: string; qty: number; sales: number }
export interface EmployeeSupplierRow { label: string; qty: number; sales: number; pct: number }
export interface PendingLine { ref: string; date: string; desc: string; estado: string; qty: number }

export interface EmployeeAnalytics {
  usuario: string;
  total_sales: number;
  total_qty: number;
  num_ventas: number;
  avg_ticket: number;
  margin_eur: number;   // ROI = margem € gerada (venda − custo) onde o custo é conhecido
  margin_pct: number;
  frames_sales: number; frames_qty: number;  // armações (classe G)
  sun_sales: number; sun_qty: number;         // óculos de sol (classe S)
  lens_mono: number; lens_prog: number; lens_bifo: number; // unidades de lentes oftálmicas
  quotes_made: number; quotes_converted: number;
  top_brands: EmployeeBrandRow[];
  top_suppliers: EmployeeSupplierRow[];        // peso (%) por valor de venda
  pending: PendingLine[];                      // vendas por entregar
}

const ESTADO_LABELS: Record<string, string> = {
  T: "Por entregar", I: "Recebido", H: "Pedido ao fornecedor", C: "Pendente de envio", J: "Entrega parcial",
};
const PENDING_ESTADOS = new Set(["T", "I", "H", "C", "J"]);

async function employeeAnalyticsFor(usuario: string, from: string, to: string): Promise<EmployeeAnalytics> {
  const [lines, quotes, convertedCodes] = await Promise.all([
    supplierLines(from, to, false), // sem demografia (não usada aqui) → não carrega os 10k clientes
    fetchVentas(from, to, true).then((all) => all.filter((v) => v.Es_presupuesto === "S")),
    convertedBudgetCodes(from, to),
  ]);
  const mine = lines.filter((l) => l.usuario === usuario);
  const base: EmployeeAnalytics = {
    usuario, total_sales: 0, total_qty: 0, num_ventas: 0, avg_ticket: 0, margin_eur: 0, margin_pct: 0,
    frames_sales: 0, frames_qty: 0, sun_sales: 0, sun_qty: 0, lens_mono: 0, lens_prog: 0, lens_bifo: 0,
    quotes_made: 0, quotes_converted: 0, top_brands: [], top_suppliers: [], pending: [],
  };
  const ventaSet = new Set<string>();
  let coveredNet = 0, cost = 0;
  const brandAgg = new Map<string, { qty: number; sales: number }>();
  const supAgg = new Map<string, { qty: number; sales: number }>();
  const bump = (m: Map<string, { qty: number; sales: number }>, k: string, qty: number, sales: number) => {
    const c = m.get(k) ?? { qty: 0, sales: 0 }; c.qty += qty; c.sales += sales; m.set(k, c);
  };
  for (const l of mine) {
    base.total_sales += l.net; base.total_qty += l.qty; ventaSet.add(l.ventaCodigo);
    if (l.cost != null) { coveredNet += l.net; cost += l.cost; }
    // "Marcas que mais vende" = SÓ armações (G) e óculos de sol (S).
    if (l.clase === "G" || l.clase === "S") bump(brandAgg, l.brand, l.qty, l.net);
    if (l.proveedor) bump(supAgg, l.proveedor, l.qty, l.net);
    if (l.clase === "G") { base.frames_sales += l.net; base.frames_qty += l.qty; }
    else if (l.clase === "S") { base.sun_sales += l.net; base.sun_qty += l.qty; }
    else if (l.clase === "L") {
      const t = lensType(l.detail, l.desc);
      if (t === "Monofocais") base.lens_mono += l.qty;
      else if (t === "Progressivas") base.lens_prog += l.qty;
      else if (t === "Bifocais") base.lens_bifo += l.qty;
    }
    if (PENDING_ESTADOS.has(l.estado)) {
      base.pending.push({ ref: l.referencia, date: l.fecha, desc: cleanLineDesc(l.desc), estado: ESTADO_LABELS[l.estado] ?? l.estado, qty: l.qty });
    }
  }
  base.num_ventas = ventaSet.size;
  base.total_sales = round(base.total_sales);
  base.avg_ticket = ventaSet.size ? round(base.total_sales / ventaSet.size) : 0;
  base.margin_eur = round(coveredNet - cost);
  base.margin_pct = coveredNet > 0 ? round(((coveredNet - cost) / coveredNet) * 100) : 0;
  base.frames_sales = round(base.frames_sales); base.sun_sales = round(base.sun_sales);
  // Orçamentos FEITOS vs CONVERTIDOS (convertido = orçamento que gerou encomenda).
  const myQuotes = quotes.filter((q) => (q.Usuario || "—") === usuario);
  base.quotes_made = myQuotes.length;
  base.quotes_converted = myQuotes.filter((q) => convertedCodes.has(String(q.Codigo))).length;
  base.top_brands = [...brandAgg.entries()].map(([label, x]) => ({ label, qty: x.qty, sales: round(x.sales) }))
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 10);
  const supTotal = [...supAgg.values()].reduce((s, x) => s + Math.abs(x.sales), 0) || 1;
  base.top_suppliers = [...supAgg.entries()].map(([label, x]) => ({ label, qty: x.qty, sales: round(x.sales), pct: Math.round((Math.abs(x.sales) / supTotal) * 100) }))
    .sort((a, b) => b.sales - a.sales).slice(0, 10);
  base.pending.sort((a, b) => (a.date < b.date ? 1 : -1));
  return base;
}

export interface EmployeeAnalyticsYoY {
  current: EmployeeAnalytics;
  previous: EmployeeAnalytics; // mesmo período do ano anterior
}

const employeeAnalyticsCache = new Map<string, { promise: Promise<EmployeeAnalyticsYoY>; expires: number }>();

/** Análise de um vendedor no período + o MESMO período do ano anterior (homólogo).
 *  Cacheado 5 min (reabrir o mesmo vendedor é instantâneo; o enriquecimento
 *  pesado é ainda partilhado entre vendedores via supplierLines). */
export async function employeeAnalytics(usuario: string, from: string, to: string): Promise<EmployeeAnalyticsYoY> {
  const key = `${usuario}|${from}|${to}`;
  const hit = employeeAnalyticsCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const shift = (iso: string) => { const d = new Date(iso); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); };
  const promise = (async () => {
    const [current, previous] = await Promise.all([
      employeeAnalyticsFor(usuario, from, to),
      employeeAnalyticsFor(usuario, shift(from), shift(to)),
    ]);
    return { current, previous };
  })().catch((e) => { employeeAnalyticsCache.delete(key); throw e; });
  employeeAnalyticsCache.set(key, { promise, expires: Date.now() + SUPPLIER_LINES_TTL_MS });
  return promise;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
