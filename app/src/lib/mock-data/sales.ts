import type { SalesSummary, SaleCategory } from "@/types";

/**
 * Dados mock DINÂMICOS: gera registos de vendas individuais (determinísticos)
 * ao longo de ~2 anos e calcula as agregações a partir deles, filtrando por
 * período + colaborador + categoria. Espelha o modelo da API real (registos
 * crus → agregação), por isso os filtros funcionam de verdade.
 */

// ─── PRNG determinístico (mulberry32) ─────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Configuração ──────────────────────────────────────────────────────────────

const CATEGORIES: {
  key: SaleCategory;
  label: string;
  price: [number, number];
  margin: number;
  weight: number;
  brands: string[];
}[] = [
  { key: "lentes_oftalmicas", label: "Lentes Oftálmicas", price: [90, 480], margin: 0.58, weight: 0.28, brands: ["Essilor", "Zeiss", "Hoya"] },
  { key: "armacoes", label: "Armações", price: [90, 420], margin: 0.6, weight: 0.34, brands: ["Ray-Ban", "Oakley", "Silhouette", "Gucci"] },
  { key: "oculos_sol", label: "Óculos de Sol", price: [120, 320], margin: 0.52, weight: 0.18, brands: ["Maui Jim", "Prada", "Tom Ford"] },
  { key: "lentes_contacto", label: "Lentes de Contacto", price: [25, 95], margin: 0.48, weight: 0.12, brands: ["Acuvue", "Alcon", "CooperVision"] },
  { key: "saude_ocular", label: "Saúde Ocular", price: [8, 30], margin: 0.5, weight: 0.04, brands: ["Systane", "Hyabak", "Blink"] },
  { key: "diversos", label: "Diversos", price: [10, 80], margin: 0.55, weight: 0.04, brands: ["Acessórios", "Estojo", "Cordão"] },
];

const CATEGORY_LABELS: Record<SaleCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<SaleCategory, string>;

const EMPLOYEES = [
  { id: "e1", name: "Ana Silva", target: 22_000, skill: 1.0 },
  { id: "e2", name: "João Costa", target: 18_000, skill: 0.82 },
  { id: "e3", name: "Marta Ferreira", target: 12_000, skill: 0.64 },
];

interface SaleRecord {
  date: Date;
  category: SaleCategory;
  employee_id: string;
  employee_name: string;
  brand: string;
  amount: number; // bruto (PVP)
  cost: number;
  discount: number;
  is_quote: boolean;
}

// ─── Geração (cacheada por dia para estabilidade entre renders) ───────────────

let CACHE: { day: number; records: SaleRecord[] } | null = null;

function pick(rand: () => number, items: readonly { weight: number }[]): number {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].weight;
    if (r <= 0) return i;
  }
  return items.length - 1;
}

function generate(): SaleRecord[] {
  const now = new Date();
  const dayKey = Math.floor(now.getTime() / 86_400_000);
  if (CACHE && CACHE.day === dayKey) return CACHE.records;

  const rand = mulberry32(20260530);
  const records: SaleRecord[] = [];
  const DAYS = 730;

  for (let d = DAYS; d >= 0; d--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const dow = date.getDay();
    if (dow === 0) continue; // fechado ao domingo
    // sazonalidade: mais vendas no verão e dezembro
    const month = date.getMonth();
    const season = month >= 5 && month <= 7 ? 1.3 : month === 11 ? 1.25 : 1;
    const base = dow === 6 ? 6 : 8; // sábado menos
    const count = Math.max(1, Math.round((base + rand() * 6) * season));

    for (let i = 0; i < count; i++) {
      const cat = CATEGORIES[pick(rand, CATEGORIES)];
      const emp = EMPLOYEES[pick(rand, EMPLOYEES.map((e) => ({ ...e, weight: e.skill })))];
      const qty = cat.key === "lentes_contacto" && rand() > 0.5 ? 2 : 1;
      const price = Math.round((cat.price[0] + rand() * (cat.price[1] - cat.price[0])) * qty);
      const discountPct = rand() > 0.7 ? rand() * 0.18 : 0; // 30% das vendas têm desconto até 18%
      const discount = Math.round(price * discountPct);
      const cost = Math.round(price * (1 - cat.margin));
      const brand = cat.brands[Math.floor(rand() * cat.brands.length)];
      const is_quote = rand() > 0.78; // ~22% são orçamentos (não vendas)
      records.push({ date, category: cat.key, employee_id: emp.id, employee_name: emp.name, brand, amount: price, cost, discount, is_quote });
    }
  }

  CACHE = { day: dayKey, records };
  return records;
}

// ─── Filtros ───────────────────────────────────────────────────────────────────

export interface SalesFilters {
  employee?: string;
  category?: string;
}

function inRange(d: Date, from: string, to: string): boolean {
  const t = d.getTime();
  return t >= new Date(from).getTime() && t < new Date(to).getTime();
}

function salesIn(from: string, to: string, f: SalesFilters = {}): SaleRecord[] {
  return generate().filter(
    (r) =>
      !r.is_quote &&
      inRange(r.date, from, to) &&
      (!f.employee || r.employee_id === f.employee) &&
      (!f.category || r.category === f.category),
  );
}

function quotesIn(from: string, to: string, f: SalesFilters = {}): SaleRecord[] {
  return generate().filter(
    (r) =>
      r.is_quote &&
      inRange(r.date, from, to) &&
      (!f.employee || r.employee_id === f.employee) &&
      (!f.category || r.category === f.category),
  );
}

const round = (n: number) => Math.round(n);
const net = (r: SaleRecord) => r.amount - r.discount;

// ─── Agregações públicas ───────────────────────────────────────────────────────

export function mockSalesSummary(from: string, to: string, f: SalesFilters = {}): SalesSummary {
  const sales = salesIn(from, to, f);
  const quotes = quotesIn(from, to, f);
  const total_sales = sales.reduce((s, r) => s + net(r), 0);
  const total_cost = sales.reduce((s, r) => s + r.cost, 0);
  const total_margin = total_sales - total_cost;
  const total_discount = sales.reduce((s, r) => s + r.discount, 0);
  const num_sales = sales.length;
  return {
    total_sales: round(total_sales),
    total_cost: round(total_cost),
    total_margin: round(total_margin),
    margin_pct: total_sales > 0 ? round((total_margin / total_sales) * 100) : 0,
    cobertura_pct: 100,
    avg_ticket: num_sales > 0 ? round(total_sales / num_sales) : 0,
    num_sales,
    total_discount: round(total_discount),
    conversion_rate: num_sales + quotes.length > 0 ? round((num_sales / (num_sales + quotes.length)) * 100) : 0,
  };
}

export function mockSalesByCategory(from: string, to: string, f: SalesFilters = {}) {
  const sales = salesIn(from, to, { employee: f.employee }); // categoria não se auto-filtra
  const acc = new Map<SaleCategory, { sales: number; cost: number; qty: number }>();
  for (const r of sales) {
    const cur = acc.get(r.category) ?? { sales: 0, cost: 0, qty: 0 };
    cur.sales += net(r);
    cur.cost += r.cost;
    cur.qty += 1;
    acc.set(r.category, cur);
  }
  return CATEGORIES.map((c) => {
    const x = acc.get(c.key) ?? { sales: 0, cost: 0, qty: 0 };
    return {
      category: c.key,
      label: c.label,
      sales: round(x.sales),
      margin_pct: x.sales > 0 ? round(((x.sales - x.cost) / x.sales) * 100) : 0,
      quantity: x.qty,
      avg_ticket: x.qty > 0 ? round(x.sales / x.qty) : 0,
    };
  }).filter((c) => c.quantity > 0);
}

export function mockTargetProgress(from: string, to: string, _saudeCodes: Iterable<string>) {
  const sales = salesIn(from, to);
  const sum = (cat: SaleCategory) =>
    round(sales.filter((r) => r.category === cat).reduce((s, r) => s + net(r), 0));
  return {
    global: round(sales.reduce((s, r) => s + net(r), 0)),
    oculos_graduados: round(sum("lentes_oftalmicas") + sum("armacoes")),
    oculos_sol: sum("oculos_sol"),
    lentes_contacto: sum("lentes_contacto"),
    saude_ocular: 0, // sem códigos no mock
  };
}

export function mockSalesByEmployee(from: string, to: string, f: SalesFilters = {}) {
  return EMPLOYEES.filter((e) => !f.employee || e.id === f.employee)
    .map((e) => {
      const sales = salesIn(from, to, { employee: e.id, category: f.category });
      const quotes = quotesIn(from, to, { employee: e.id, category: f.category });
      const total = sales.reduce((s, r) => s + net(r), 0);
      const cost = sales.reduce((s, r) => s + r.cost, 0);
      const gross = sales.reduce((s, r) => s + r.amount, 0);
      const disc = sales.reduce((s, r) => s + r.discount, 0);
      // produtos premium: armações/sol com PVP > 400€
      const premium = sales.filter(
        (r) => (r.category === "armacoes" || r.category === "oculos_sol") && r.amount > 400,
      ).length;
      // sparkline: net por bucket (12 divisões do período)
      const spark = sparkline(sales, from, to);
      return {
        employee_id: e.id,
        name: e.name,
        sales_month: round(total),
        margin_pct: total > 0 ? round(((total - cost) / total) * 100) : 0,
        avg_ticket: sales.length > 0 ? round(total / sales.length) : 0,
        discount_avg: gross > 0 ? round((disc / gross) * 100) : 0,
        quotes_issued: quotes.length + sales.length,
        quotes_converted: sales.length,
        premium_sold: premium,
        target: e.target,
        sparkline: spark,
      };
    })
    .sort((a, b) => b.sales_month - a.sales_month);
}

function sparkline(sales: SaleRecord[], from: string, to: string, buckets = 12): number[] {
  const start = new Date(from).getTime();
  const span = new Date(to).getTime() - start;
  if (span <= 0) return [];
  const arr = new Array(buckets).fill(0);
  for (const r of sales) {
    const idx = Math.min(buckets - 1, Math.floor(((r.date.getTime() - start) / span) * buckets));
    if (idx >= 0) arr[idx] += net(r);
  }
  return arr.map(round);
}

export function mockSalesTrend(from: string, to: string, f: SalesFilters = {}) {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const baseYear = new Date(from).getFullYear();
  const all = generate().filter(
    (r) => !r.is_quote && (!f.employee || r.employee_id === f.employee) && (!f.category || r.category === f.category),
  );
  const bucket = (year: number) => {
    const m = new Array(12).fill(0);
    for (const r of all) if (r.date.getFullYear() === year) m[r.date.getMonth()] += net(r);
    return m;
  };
  // Ano base + 4 anteriores; só inclui anos com dados (além do base).
  const series = Array.from({ length: 5 }, (_, k) => ({ year: baseYear - k, values: bucket(baseYear - k) }));
  const include = series.filter((s) => s.year === baseYear || s.values.some((x) => x > 0)).sort((a, b) => a.year - b.year);
  const data = months.map((label, i) => {
    const row: { label: string } & Record<string, number> = { label } as { label: string } & Record<string, number>;
    for (const s of include) row[String(s.year)] = round(s.values[i]);
    return row;
  });
  return { years: include.map((s) => s.year), data };
}

export function mockEmployees(): { value: string; label: string }[] {
  return EMPLOYEES.map((e) => ({ value: e.id, label: e.name }));
}

export function mockDiscounts(from: string, to: string, f: SalesFilters = {}) {
  const sales = salesIn(from, to, f);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayDisc = sales
    .filter((r) => r.date >= todayStart)
    .reduce((s, r) => s + r.discount, 0);
  const monthDisc = sales.reduce((s, r) => s + r.discount, 0);
  const gross = sales.reduce((s, r) => s + r.amount, 0);

  const byEmp = EMPLOYEES.map((e) => {
    const es = sales.filter((r) => r.employee_id === e.id);
    const g = es.reduce((s, r) => s + r.amount, 0);
    const dt = es.reduce((s, r) => s + r.discount, 0);
    return { name: e.name, discount_total: round(dt), discount_avg_pct: g > 0 ? round((dt / g) * 100) : 0 };
  });

  const byCat = CATEGORIES.map((c) => {
    const cs = sales.filter((r) => r.category === c.key);
    const g = cs.reduce((s, r) => s + r.amount, 0);
    const dt = cs.reduce((s, r) => s + r.discount, 0);
    return { category: c.key, label: c.label, discount_total: round(dt), discount_avg_pct: g > 0 ? round((dt / g) * 100) : 0 };
  }).filter((c) => c.discount_total > 0);

  const below = sales
    .map((r) => {
      const m = net(r) > 0 ? ((net(r) - r.cost) / net(r)) * 100 : 100;
      return { r, m };
    })
    .filter((x) => x.m < 50)
    .sort((a, b) => a.m - b.m)
    .slice(0, 8)
    .map((x) => {
      const n = round(net(x.r));
      return {
        date: x.r.date.toISOString().split("T")[0],
        product: `${x.r.brand} (${CATEGORY_LABELS[x.r.category]})`,
        amount: n,
        margin_pct: round(x.m),
        employee: x.r.employee_name,
        gross: round(x.r.amount),
        cost: round(x.r.cost),
        covered_net: n,
        margin_value: round(n - x.r.cost),
        lines: [{ desc: x.r.brand, qty: 1, gross: round(x.r.amount), discount: round(x.r.discount), net: n, cost: round(x.r.cost), margin_pct: round(x.m) }],
      };
    });

  const excessive_count = sales.filter((r) => r.amount > 0 && (r.discount / r.amount) * 100 > 15).length;

  return {
    total_discount_day: round(dayDisc),
    total_discount_month: round(monthDisc),
    avg_discount_pct: gross > 0 ? Math.round((monthDisc / gross) * 1000) / 10 : 0,
    excessive_count,
    by_employee: byEmp,
    by_category: byCat,
    below_min_margin: below,
  };
}
