import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { DayAggregate, SalesTrend } from "@/lib/api/visual-map";

const CATEGORY_LABELS: Record<string, string> = {
  lentes_oftalmicas: "Lentes Oftálmicas",
  armacoes: "Armações",
  oculos_sol: "Óculos de Sol",
  lentes_contacto: "Lentes de Contacto",
  saude_ocular: "Saúde Ocular",
  diversos: "Diversos",
};

/** Data local de Lisboa (YYYY-MM-DD). */
function dayKeyLisbon(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Grava (upsert) vários dias de uma vez no Firestore — via service role (cron). */
export async function writeDays(days: Map<string, DayAggregate>): Promise<void> {
  if (days.size === 0) return;
  const col = adminDb.collection("daily_metrics");
  const BATCH_SIZE = 400; // Firestore batches allow max 500 ops
  const entries = [...days.entries()];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const [day, data] of entries.slice(i, i + BATCH_SIZE)) {
      batch.set(col.doc(day), { day, data, updated_at: new Date().toISOString() });
    }
    await batch.commit();
  }
}

/** Dias (YYYY-MM-DD) já existentes na coleção (para o backfill saber o que saltar). */
export async function existingDays(): Promise<Set<string>> {
  const out = new Set<string>();
  // Firestore list all docs in collection (ID = day key)
  const snap = await adminDb.collection("daily_metrics").select().get();
  for (const doc of snap.docs) out.add(doc.id);
  return out;
}

/** Categorias-objetivo (iguais às do painel de Objetivos). */
export type TargetProgress = Record<"global" | "oculos_graduados" | "oculos_sol" | "lentes_contacto" | "saude_ocular", number>;

/**
 * Progresso das categorias-objetivo a partir dos agregados diários (Firestore,
 * instantâneo). Devolve null se não houver dias cobertos.
 */
export async function getTargetProgress(from: string, to: string): Promise<TargetProgress | null> {
  try {
    const fromDay = dayKeyLisbon(new Date(from));
    const toDay = dayKeyLisbon(new Date(new Date(to).getTime() - 1000));
    const snap = await adminDb.collection("daily_metrics")
      .where("day", ">=", fromDay)
      .where("day", "<=", toDay)
      .get();
    if (snap.empty) return null;

    const acc: TargetProgress = { global: 0, oculos_graduados: 0, oculos_sol: 0, lentes_contacto: 0, saude_ocular: 0 };
    for (const doc of snap.docs) {
      const d = doc.data().data as DayAggregate;
      for (const [k, v] of Object.entries(d.byCategory || {})) {
        acc.global += v.sales;
        if (k === "lentes_oftalmicas" || k === "armacoes") acc.oculos_graduados += v.sales;
        else if (k === "oculos_sol") acc.oculos_sol += v.sales;
        else if (k === "lentes_contacto") acc.lentes_contacto += v.sales;
        else if (k === "saude_ocular") acc.saude_ocular += v.sales;
      }
    }
    const r = (n: number) => Math.round(n * 100) / 100;
    return { global: r(acc.global), oculos_graduados: r(acc.oculos_graduados), oculos_sol: r(acc.oculos_sol), lentes_contacto: r(acc.lentes_contacto), saude_ocular: r(acc.saude_ocular) };
  } catch {
    return null;
  }
}

const TREND_DAY_MS = 86_400_000;
const TREND_PREV_YEARS = 1;
const TREND_MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Evolução de vendas (período atual vs ano anterior) a partir dos agregados
 * diários do Firestore (instantâneo, mesma região). Devolve null se o período
 * atual não tiver dias no snapshot (cai-se no cálculo ao vivo).
 */
export async function getSalesTrend(from: string, to: string): Promise<SalesTrend | null> {
  try {
    const fromD = new Date(from);
    const toD = new Date(to);
    const rangeMs = Math.max(toD.getTime() - fromD.getTime(), TREND_DAY_MS);
    const daily = rangeMs <= 70 * TREND_DAY_MS;
    const baseYear = fromD.getFullYear();

    let labels: string[];
    if (daily) {
      const days = Math.ceil(rangeMs / TREND_DAY_MS);
      labels = Array.from({ length: days }, (_, i) => String(new Date(fromD.getTime() + i * TREND_DAY_MS).getDate()));
    } else {
      const months: number[] = [];
      const cursor = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
      while (cursor < toD) { months.push(cursor.getMonth()); cursor.setMonth(cursor.getMonth() + 1); }
      labels = months.map((m) => TREND_MONTHS_PT[m]);
    }
    const nBuckets = labels.length;

    const shiftYears = (d: Date, delta: number) =>
      new Date(d.getFullYear() + delta, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());

    const perYear = await Promise.all(
      Array.from({ length: TREND_PREV_YEARS + 1 }, (_, k) => k).map(async (k) => {
        const f = k === 0 ? fromD : shiftYears(fromD, -k);
        const t = k === 0 ? toD : shiftYears(toD, -k);
        const fromDay = dayKeyLisbon(f);
        const toDay = dayKeyLisbon(new Date(t.getTime() - 1000));
        const snap = await adminDb.collection("daily_metrics")
          .where("day", ">=", fromDay)
          .where("day", "<=", toDay)
          .get();
        const values = new Array<number>(nBuckets).fill(0);
        let rows = 0;
        if (!snap.empty) {
          rows = snap.size;
          for (const doc of snap.docs) {
            const dayStr = doc.id;
            const agg = doc.data().data as DayAggregate;
            let i: number;
            if (daily) {
              i = Math.round((Date.parse(`${dayStr}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / TREND_DAY_MS);
            } else {
              const [yy, mm] = dayStr.split("-").map(Number);
              i = (yy - f.getFullYear()) * 12 + ((mm - 1) - f.getMonth());
            }
            if (i >= 0 && i < nBuckets) values[i] += agg.total_sales;
          }
        }
        return { year: baseYear - k, values, rows };
      }),
    );

    const current = perYear.find((y) => y.year === baseYear);
    if (!current || current.rows === 0) return null;

    const r = (n: number) => Math.round(n * 100) / 100;
    const include = perYear
      .filter((s) => s.year === baseYear || s.values.some((x) => x > 0))
      .sort((a, b) => a.year - b.year);
    const out = labels.map((label, i) => {
      const row: { label: string } & Record<string, number> = { label } as { label: string } & Record<string, number>;
      for (const s of include) row[String(s.year)] = r(s.values[i]);
      return row;
    });
    return { years: include.map((s) => s.year), data: out };
  } catch {
    return null;
  }
}

export interface RangeMetrics {
  summary: { total_sales: number; total_cost: number; total_margin: number; margin_pct: number; cobertura_pct: number; avg_ticket: number; num_sales: number; total_discount: number; conversion_rate: number };
  byCategory: { category: string; label: string; sales: number; margin_pct: number; quantity: number; avg_ticket: number }[];
  byEmployee: { usuario: string; sales: number; num: number }[];
  days: number;
}

/**
 * Soma os agregados diários de um intervalo [from, to) → métricas do dashboard.
 * Devolve null se não houver nenhum dia coberto (cai-se no cálculo ao vivo).
 */
export async function getRangeMetrics(from: string, to: string): Promise<RangeMetrics | null> {
  try {
    const fromDay = dayKeyLisbon(new Date(from));
    const toDay = dayKeyLisbon(new Date(new Date(to).getTime() - 1000));
    const snap = await adminDb.collection("daily_metrics")
      .where("day", ">=", fromDay)
      .where("day", "<=", toDay)
      .get();
    if (snap.empty) return null;

    let total_sales = 0, covered_sales = 0, total_cost = 0, total_discount = 0, num_sales = 0, quotes = 0;
    let quotesConverted = 0, quotesWithConvData = 0;
    const cat = new Map<string, { sales: number; coveredSales: number; cost: number; quantity: number }>();
    const emp = new Map<string, { sales: number; num: number }>();
    for (const doc of snap.docs) {
      const d = doc.data().data as DayAggregate;
      total_sales += d.total_sales; covered_sales += d.covered_sales; total_cost += d.total_cost;
      total_discount += d.total_discount; num_sales += d.num_sales; quotes += d.quotes;
      if (d.quotes_converted !== undefined) { quotesConverted += d.quotes_converted; quotesWithConvData += d.quotes; }
      for (const [k, v] of Object.entries(d.byCategory || {})) {
        const c = cat.get(k) ?? { sales: 0, coveredSales: 0, cost: 0, quantity: 0 };
        c.sales += v.sales; c.coveredSales += v.coveredSales; c.cost += v.cost; c.quantity += v.quantity; cat.set(k, c);
      }
      for (const [k, v] of Object.entries(d.byEmployee || {})) {
        const e = emp.get(k) ?? { sales: 0, num: 0 };
        e.sales += v.sales; e.num += v.num; emp.set(k, e);
      }
    }
    const total_margin = covered_sales - total_cost;
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      summary: {
        total_sales: r(total_sales), total_cost: r(total_cost), total_margin: r(total_margin),
        margin_pct: covered_sales > 0 ? r((total_margin / covered_sales) * 100) : 0,
        cobertura_pct: total_sales > 0 ? r((covered_sales / total_sales) * 100) : 0,
        avg_ticket: num_sales > 0 ? r(total_sales / num_sales) : 0,
        num_sales, total_discount: r(total_discount),
        conversion_rate: quotesWithConvData > 0
          ? r((quotesConverted / quotesWithConvData) * 100)
          : (num_sales + quotes > 0 ? r((num_sales / (num_sales + quotes)) * 100) : 0),
      },
      byCategory: [...cat.entries()].map(([category, x]) => ({
        category, label: CATEGORY_LABELS[category] ?? category, sales: r(x.sales),
        margin_pct: x.coveredSales > 0 ? r(((x.coveredSales - x.cost) / x.coveredSales) * 100) : 0,
        quantity: x.quantity, avg_ticket: x.quantity > 0 ? r(x.sales / x.quantity) : 0,
      })),
      byEmployee: [...emp.entries()].map(([usuario, x]) => ({ usuario, sales: r(x.sales), num: x.num })),
      days: snap.size,
    };
  } catch {
    return null;
  }
}
