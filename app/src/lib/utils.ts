import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Cobertura mínima (% do valor de venda com custo conhecido) para mostrar a margem.
 * Abaixo disto a margem está incompleta (faturas das lentes ainda não rececionadas)
 * → esconde-se em vez de mostrar um valor enganador. Ver `marginIfCovered`.
 */
export const MARGIN_MIN_COVERAGE = 80;

/**
 * Devolve a margem % só se a cobertura for suficiente; caso contrário `null`
 * (a UI mostra "—" e explica que está a aguardar faturas).
 */
export function marginIfCovered(marginPct: number, coberturaPct: number): number | null {
  return coberturaPct >= MARGIN_MIN_COVERAGE ? marginPct : null;
}

/**
 * Lê um valor numérico introduzido no formato português, onde o **ponto é
 * separador de milhares** e a **vírgula é o decimal** (ex.: "24.500" = 24500,
 * "1.234,56" = 1234,56). Evita o bug de `Number("24.500")` = 24,5 nos inputs de €.
 * Devolve `null` para vazio/inválido. Usar com `<input type="text" inputMode="decimal">`
 * (NÃO `type="number"`, que já mangla o "." antes de chegar aqui).
 */
export function parseEuroInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function daysSince(date: string | Date): number {
  const now = new Date();
  const d = new Date(date);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** Variação % de `current` face a `previous` (badges "vs … ant."). Sem base anterior: +100% se há valor, senão 0. */
export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
