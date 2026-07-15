/**
 * Adaptador de dados do dashboard.
 *
 * Cada função devolve a forma que a UI consome. A fonte é:
 *  - dados mockados              quando USE_MOCK_DATA !== "false"
 *  - API real do Visual (Temática) caso contrário, via lib/api/visual-map.ts
 *
 * Os alertas (fetchAlerts) ainda usam mock — são os mais derivados; serão
 * calculados a partir dos dados reais numa fase seguinte.
 */

import { unstable_cache } from "next/cache";
import type { BrandRow } from "./visual-map";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

// Cache persistente (Data Cache da Vercel) das leituras pesadas da API Visual,
// por período. Voltar ao mesmo intervalo (ex.: "Este mês") fica instantâneo
// durante este tempo, em vez de recalcular tudo (~dezenas de segundos).
const SALES_REVALIDATE = 300; // 5 min

const cSalesSummaryLight = unstable_cache(
  async (from: string, to: string) => (await import("./visual-map")).salesSummaryLight(from, to),
  ["sales-summary-light"], { revalidate: SALES_REVALIDATE },
);
const cSalesByEmployee = unstable_cache(
  async (from: string, to: string) => (await import("./visual-map")).salesByEmployee(from, to),
  ["sales-by-employee"], { revalidate: SALES_REVALIDATE },
);
const cSalesTrend = unstable_cache(
  async (from: string, to: string) => (await import("./visual-map")).salesTrend(from, to),
  ["sales-trend"], { revalidate: SALES_REVALIDATE },
);

// ─── Vendas ───────────────────────────────────────────────────────────────────

export async function fetchSalesSummary(from: string, to: string) {
  if (USE_MOCK) {
    const { mockSalesSummary } = await import("@/lib/mock-data/sales");
    return mockSalesSummary(from, to);
  }
  // SEM Data Cache de 5 min de propósito: a margem depende do OData (custos das
  // lentes) que pode dar timeout no arranque a frio; o unstable_cache CONGELAVA
  // esse resultado degradado (cobertura baixa → margem "—") durante 5 min mesmo
  // depois de o OData recuperar. Conta antes com as caches internas do visual-map
  // (60s, que EVICTAM em falha do OData) → a margem recupera sozinha em ~60s.
  const { salesSummary } = await import("./visual-map");
  return salesSummary(from, to);
}

/** Resumo LEVE (só métricas de vendas via REST — sem margem/artigos/OData). Rápido. */
export async function fetchSalesSummaryLight(from: string, to: string) {
  if (USE_MOCK) {
    const { mockSalesSummary } = await import("@/lib/mock-data/sales");
    return mockSalesSummary(from, to);
  }
  return cSalesSummaryLight(from, to);
}

export async function fetchSalesByCategory(from: string, to: string, saudeCodes: Iterable<string> = []) {
  if (USE_MOCK) {
    const { mockSalesByCategory } = await import("@/lib/mock-data/sales");
    return mockSalesByCategory(from, to);
  }
  // SEM Data Cache de 5 min (carrega margem por categoria via OData) — ver nota em
  // fetchSalesSummary: evita congelar cobertura degradada; recupera pelas caches
  // internas do visual-map (60s, evictam em falha).
  const { salesByCategory } = await import("./visual-map");
  return salesByCategory(from, to, [...saudeCodes]);
}

export async function fetchSalesByEmployee(from: string, to: string) {
  if (USE_MOCK) {
    const { mockSalesByEmployee } = await import("@/lib/mock-data/sales");
    return mockSalesByEmployee(from, to);
  }
  return cSalesByEmployee(from, to);
}

export async function fetchSalesTrend(from: string, to: string) {
  if (USE_MOCK) {
    const { mockSalesTrend } = await import("@/lib/mock-data/sales");
    return mockSalesTrend(from, to);
  }
  return cSalesTrend(from, to);
}

export async function fetchDiscounts(from: string, to: string, saudeCodes: Iterable<string> = []) {
  if (USE_MOCK) {
    const { mockDiscounts } = await import("@/lib/mock-data/sales");
    return mockDiscounts(from, to);
  }
  const { discounts } = await import("./visual-map");
  return discounts(from, to, [...saudeCodes]);
}

/** Clientes de Lentes de Contacto (diárias/mensais) para reposição. */
const cContactLens = unstable_cache(
  async () => (await import("./visual-map")).contactLensClients(),
  ["contact-lens-clients"], { revalidate: 600 },
);
export async function fetchContactLensClients() {
  if (USE_MOCK) {
    return { diarias: [], mensais: [] } as Awaited<ReturnType<typeof import("./visual-map")["contactLensClients"]>>;
  }
  const { getContactLensSnapshot } = await import("@/lib/snapshots/heavy");
  return (await getContactLensSnapshot()) ?? cContactLens();
}

/** Oportunidades de cross-sell (2º par / sol graduado) com detalhe da venda. */
export async function fetchCrossSell(from: string, to: string) {
  if (USE_MOCK) return [] as Awaited<ReturnType<typeof import("./visual-map")["crossSellOpportunities"]>>;
  const { crossSellOpportunities } = await import("./visual-map");
  return crossSellOpportunities(from, to);
}

/** Vendas com 2º par já realizado (graduado + sol na mesma venda). */
export async function fetchSecondPairSales(from: string, to: string) {
  if (USE_MOCK) return [] as Awaited<ReturnType<typeof import("./visual-map")["secondPairSales"]>>;
  const { secondPairSales } = await import("./visual-map");
  return secondPairSales(from, to);
}

/** Attach de progressivos e tratamentos nas lentes vendidas. */
export async function fetchTreatmentAttach(from: string, to: string) {
  if (USE_MOCK) return { total_lenses: 0, progressive: 0, progressive_pct: 0, with_treatment: 0, treatment_pct: 0, byTreatment: [] };
  const { treatmentAttach } = await import("./visual-map");
  return treatmentAttach(from, to);
}

/** Recall clínico (optometria +2 anos / contactologia +1 ano) — proxy por compras. */
export async function fetchClinicalRecall() {
  if (USE_MOCK) return { optometria: [], contactologia: [] };
  // Snapshot pré-calculado (instantâneo) → senão calcula ao vivo (cacheado no visual-map).
  const { getClinicalRecallSnapshot } = await import("@/lib/snapshots/heavy");
  const snap = await getClinicalRecallSnapshot();
  if (snap) return snap;
  const { clinicalRecall } = await import("./visual-map");
  return clinicalRecall();
}

/** Top marcas (Lentes Oftálmicas e Armações) a partir das vendas reais. */
export async function fetchTopBrands(from: string, to: string, saudeCodes: Iterable<string> = []) {
  if (USE_MOCK) {
    return { lentes_oftalmicas: [] as BrandRow[], armacoes: [] as BrandRow[] };
  }
  const { topBrands } = await import("./visual-map");
  return topBrands(from, to, saudeCodes);
}

/** Vendas líquidas (€) por categoria de objetivo do mês — para o painel de Objetivos. */
export async function fetchTargetProgress(from: string, to: string, saudeCodes: Iterable<string>) {
  if (USE_MOCK) {
    const { mockTargetProgress } = await import("@/lib/mock-data/sales");
    return mockTargetProgress(from, to, saudeCodes);
  }
  const { salesByTargetCategory } = await import("./visual-map");
  return salesByTargetCategory(from, to, saudeCodes);
}

// Colaboradores: lista distinta (Usuario) dos últimos ~3 meses. Era o ÚNICO fetch
// pesado sem Data Cache → no cold-start da Vercel a cache em memória do visual-map
// está vazia e re-chamava a API Visual (lenta/inacessível fora do PC da loja),
// dando timeout e derrubando a página. Com unstable_cache sobrevive a cold-starts
// e serve stale em revalidação falhada.
const cEmployees = unstable_cache(
  async () => (await import("./visual-map")).listEmployees(),
  ["employees"], { revalidate: 1800 },
);
export async function fetchEmployees() {
  if (USE_MOCK) {
    const { mockEmployees } = await import("@/lib/mock-data/sales");
    return mockEmployees();
  }
  return cEmployees();
}

// ─── Pipeline / Operação ──────────────────────────────────────────────────────

// Pipeline/encomendas: leituras pesadas (visual-map, cookie-free) → Data Cache 5 min.
const cPipeline = unstable_cache(
  async () => (await import("./visual-map")).pipeline(),
  ["pipeline"], { revalidate: 300 },
);
const cOrders = unstable_cache(
  async () => (await import("./visual-map")).orders(),
  ["orders"], { revalidate: 300 },
);

export async function fetchPipeline() {
  if (USE_MOCK) {
    const { mockPipeline } = await import("@/lib/mock-data/pipeline");
    return mockPipeline();
  }
  // Snapshot pré-calculado no Firestore (instantâneo) → senão calcula ao vivo (cacheado).
  const { getPipelineSnapshot } = await import("@/lib/snapshots/heavy");
  return (await getPipelineSnapshot()) ?? cPipeline();
}

export async function fetchOrders() {
  if (USE_MOCK) {
    const { mockOrders } = await import("@/lib/mock-data/pipeline");
    return mockOrders();
  }
  const { getOrdersSnapshot } = await import("@/lib/snapshots/heavy");
  return (await getOrdersSnapshot()) ?? cOrders();
}

// ─── Stock ────────────────────────────────────────────────────────────────────

// Stock: catálogo completo (~11,6k artigos) + últimas vendas + últimas entradas
// (OData). Pesado e muda devagar → Data Cache 10 min (cold-start na Vercel não
// perde a cache, ao contrário do cache em memória do visual-map).
const cStock = unstable_cache(
  async () => (await import("./visual-map")).stock(),
  ["stock"], { revalidate: 600 },
);
export async function fetchStock() {
  if (USE_MOCK) {
    const { mockStock } = await import("@/lib/mock-data/stock");
    return mockStock();
  }
  // Snapshot pré-calculado no Supabase (instantâneo) → senão calcula ao vivo (cacheado).
  const { getStockSnapshot } = await import("@/lib/snapshots/heavy");
  return (await getStockSnapshot()) ?? cStock();
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

// Clientes: base completa de clientes (pesado) → Data Cache 10 min.
const cClients = unstable_cache(
  async () => (await import("./visual-map")).clients(),
  ["clients"], { revalidate: 600 },
);
export async function fetchClients() {
  if (USE_MOCK) {
    const { mockClients } = await import("@/lib/mock-data/clients");
    return mockClients();
  }
  const { getClientsSnapshot } = await import("@/lib/snapshots/heavy");
  return (await getClientsSnapshot()) ?? cClients();
}

// ─── Consultas / Agenda ───────────────────────────────────────────────────────

// Consultas/agenda (OData + ligação a vendas) → Data Cache 5 min, por intervalo.
const cAppointments = unstable_cache(
  async (from: string, to: string) => (await import("./visual-map")).appointments(from, to),
  ["appointments"], { revalidate: 300 },
);
export async function fetchAppointments(from: string, to: string) {
  if (USE_MOCK) {
    const { mockAppointments } = await import("@/lib/mock-data/appointments");
    return mockAppointments(from, to);
  }
  return cAppointments(from, to);
}

// ─── Alertas ──────────────────────────────────────────────────────────────────
// Calculados pelo motor de alertas a partir dos dados (mock ou API real).
// Import dinâmico para evitar ciclo (o motor importa os fetchers acima).

// Alertas: cálculo pesado (13 alertas sobre 2 meses, API Visual serializada).
// Cacheado no Data Cache da Vercel — 1ª visita calcula, seguintes instantâneas —
// senão a secção (Suspense) excede o maxDuration e não carrega.
// IMPORTANTE: usar a variante { admin: true } — lê os objetivos via SERVICE ROLE
// (sem cookies). unstable_cache PROÍBE cookies()/headers() lá dentro; a variante
// normal (que lê objetivos com a sessão = cookies) dava 500 em runtime.
const cAlerts = unstable_cache(
  async () => (await import("@/lib/alerts/engine")).computeAlerts({ admin: true }),
  ["dashboard-alerts"], { revalidate: 600 },
);
export async function fetchAlerts() {
  return cAlerts();
}
