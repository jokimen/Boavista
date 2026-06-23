/**
 * Cliente da API REST do Visual (Temática Software — VGOnlineLink).
 *
 * Características da API (ver doc "Enlace de Visual con tiendas online"):
 *  - REST sobre HTTP, JSON. basePath `/api`, porto por defeito 8099.
 *  - Autenticação: POST /login → devolve header `Access-Token`, usado em todas
 *    as chamadas seguintes no header `Access-Token`.
 *  - LIMITADA A 1 LIGAÇÃO CONCORRENTE POR CLIENTE → serializamos todas as
 *    chamadas através de uma fila (mutex) para nunca haver 2 pedidos em voo.
 *  - filtros usam sintaxe tipo OData; datas no formato 'DD/MM/YYYY HH24:MI:SS'.
 *
 * Configuração via .env.local:
 *  VISUAL_API_URL      ex: http://shop.exemplo.com:8099/api  (inclui /api)
 *  VISUAL_USER         UserName configurado na aba "Tienda WEB"
 *  VISUAL_PASSWORD     Password da aba "Tienda WEB"
 *  VISUAL_CONNECTION   (opcional) ConnectionName / base de dados
 */

import type {
  VisualSelectResponse,
  VisualTable,
  VisualWritableTable,
} from "@/types/visual";

const BASE_URL = (process.env.VISUAL_API_URL ?? "").replace(/\/+$/, "");
const USER = process.env.VISUAL_USER ?? "";
const PASSWORD = process.env.VISUAL_PASSWORD ?? "";
const CONNECTION = process.env.VISUAL_CONNECTION ?? "";

export class VisualApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = "VisualApiError";
  }
}

// ─── Estado de sessão (token + mutex de 1 ligação concorrente) ────────────────

let cachedToken: string | null = null;
/** Fila para serializar pedidos — a API só aceita 1 ligação concorrente. */
let chain: Promise<unknown> = Promise.resolve();

/** Intervalo mínimo entre chamadas consecutivas (a API é frágil a rajadas). */
const CALL_GAP_MS = 400;
/** Timeout por pedido — evita que a página fique presa se a API encravar. */
const REQUEST_TIMEOUT_MS = 25_000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Encadeia `fn` após o pedido anterior + intervalo, garantindo execução em série. */
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // após cada pedido espera CALL_GAP_MS antes de libertar o próximo da fila;
  // rejeições não são propagadas para não partir a cadeia.
  chain = run.then(
    () => delay(CALL_GAP_MS),
    () => delay(CALL_GAP_MS),
  );
  return run;
}

/**
 * Percent-encode total, equivalente ao `urllib.parse.quote(s, safe="")` do
 * projeto de referência: `encodeURIComponent` não codifica `!'()*`, mas a API
 * exige que a password venha totalmente codificada (ex.: `*` → `%2A`).
 */
function quoteAll(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function assertConfigured() {
  if (!BASE_URL || !USER || !PASSWORD) {
    throw new VisualApiError(
      "API Visual não configurada — define VISUAL_API_URL, VISUAL_USER e VISUAL_PASSWORD em .env.local.",
    );
  }
}

// ─── Login / token ────────────────────────────────────────────────────────────

async function login(): Promise<string> {
  assertConfigured();
  // Query string construída à mão com percent-encode total (ver quoteAll):
  // a password tem caracteres especiais (`*/-.`) e o servidor exige-os codificados.
  const params = [
    `UserName=${quoteAll(USER)}`,
    `Password=${quoteAll(PASSWORD)}`,
    ...(CONNECTION ? [`ConnectionName=${quoteAll(CONNECTION)}`] : []),
  ].join("&");

  const res = await fetch(`${BASE_URL}/login?${params}`, {
    method: "POST",
    body: "",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new VisualApiError(`Login falhou (${res.status})`, res.status, "/login");
  }
  // O token vem no header `Access-Token`; alguns servidores devolvem-no também no corpo.
  let token = res.headers.get("Access-Token") ?? res.headers.get("access-token");
  if (!token) {
    try {
      const body = await res.json();
      token = body?.["Access-Token"] ?? body?.AccessToken ?? body?.token ?? null;
    } catch {
      /* corpo não-JSON, ignora */
    }
  }
  if (!token) {
    throw new VisualApiError("Login não devolveu Access-Token.", res.status, "/login");
  }
  cachedToken = token;
  return token;
}

async function getToken(): Promise<string> {
  return cachedToken ?? (await login());
}

/** Encerra a sessão atual (best-effort). */
export async function logoff(): Promise<void> {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  await serialize(async () => {
    try {
      await fetch(`${BASE_URL}/logoff`, {
        method: "POST",
        headers: { "Access-Token": token },
        cache: "no-store",
      });
    } catch {
      /* best-effort */
    }
  });
}

// ─── Pedido autenticado com re-login automático em 401 ────────────────────────

async function authedFetch(
  path: string,
  init: RequestInit,
  retryOn401 = true,
): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, "Access-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401 && retryOn401) {
    cachedToken = null;
    return authedFetch(path, init, false);
  }
  return res;
}

/** Executa um pedido autenticado serializado e devolve JSON tipado. */
function request<T>(path: string, init: RequestInit): Promise<T> {
  return serialize(async () => {
    const res = await authedFetch(path, init);
    if (!res.ok) {
      throw new VisualApiError(`API erro ${res.status}: ${path}`, res.status, path);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    // A API devolve JSON DUPLO-CODIFICADO: o corpo é uma *string* JSON que, ao
    // ser descodificada, contém ela própria o JSON com os dados. Daí o 2º parse.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text as unknown as T; // resposta não-JSON (ex.: id de insert)
    }
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* era mesmo uma string simples — mantém */
      }
    }
    return parsed as T;
  });
}

// ─── Operações ──────────────────────────────────────────────────────────────

export interface SelectOptions {
  fields?: string[];
  /** Filtro OData, ex: "(Fecha ge '01/05/2026 00:00:00') and (Centro eq 1)" */
  filter?: string;
  /** Lista de campos, ex: "Fecha desc" */
  orderby?: string;
  top?: number;
  skip?: number;
  /** Opções especiais, ex: "CAMPOS_ADICIONALES" para Articulos. */
  options?: string;
}

/** Consulta dados de uma tabela. Devolve o array `data`. */
export async function select<T>(
  table: VisualTable,
  opts: SelectOptions = {},
): Promise<T[]> {
  const qs = new URLSearchParams();
  if (opts.fields?.length) qs.set("fields", opts.fields.join(","));
  if (opts.filter) qs.set("filter", opts.filter);
  if (opts.orderby) qs.set("orderby", opts.orderby);
  if (opts.top != null) qs.set("top", String(opts.top));
  if (opts.skip != null) qs.set("skip", String(opts.skip));
  if (opts.options) qs.set("options", opts.options);

  const q = qs.toString();
  try {
    const body = await request<VisualSelectResponse<T>>(
      `/select/${table}${q ? `?${q}` : ""}`,
      { method: "GET" },
    );
    return body?.data ?? [];
  } catch (e) {
    // A API devolve 404 "Not found" quando o filtro não tem resultados —
    // é um conjunto vazio, não um erro.
    if (e instanceof VisualApiError && e.status === 404) return [];
    throw e;
  }
}

/**
 * Consulta paginada — segue a paginação (top/skip) até esgotar os registos.
 * Útil porque cada tabela tem um limite por defeito de registos devolvidos.
 */
export async function selectAll<T>(
  table: VisualTable,
  opts: SelectOptions = {},
  pageSize = 500,
  maxPages = 200,
): Promise<T[]> {
  const out: T[] = [];
  let skip = opts.skip ?? 0;
  for (let page = 0; page < maxPages; page++) {
    const batch = await select<T>(table, { ...opts, top: pageSize, skip });
    out.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

/** Insere um registo. `data` é serializado para string (formato exigido pela API). */
export function insert(table: VisualWritableTable, data: object): Promise<string> {
  const qs = new URLSearchParams({ data: JSON.stringify(data) });
  return request<string>(`/insert/${table}?${qs.toString()}`, { method: "POST", body: "" });
}

/** Atualiza um registo. */
export function update(table: VisualWritableTable, data: object): Promise<string> {
  const qs = new URLSearchParams({ data: JSON.stringify(data) });
  return request<string>(`/update/${table}?${qs.toString()}`, { method: "PUT" });
}

/** Elimina um registo pela sua chave primária (ex: { Codigo, Centro }). */
export function remove(table: VisualWritableTable, key: object): Promise<string> {
  const qs = new URLSearchParams({ data: JSON.stringify(key) });
  return request<string>(`/delete/${table}?${qs.toString()}`, { method: "DELETE" });
}

/** Cobra uma venta (gera movimento de caixa). */
export function cobrarVenta(
  codigo: number | string,
  centro: number | string,
  capitulo: string,
  medioPago: string,
): Promise<string> {
  const qs = new URLSearchParams({ capitulo, medio_pago: medioPago });
  return request<string>(`/cobrar_venta/${codigo}/${centro}?${qs.toString()}`, { method: "POST", body: "" });
}

/** Gera fatura para uma venta. */
export function facturarVenta(codigo: number | string, centro: number | string): Promise<string> {
  return request<string>(`/facturar_venta/${codigo}/${centro}`, { method: "POST", body: "" });
}

// ─── Helpers OData ────────────────────────────────────────────────────────────

/**
 * Formata uma data para o filtro do Visual no formato US `M/D/YYYY` (sem zeros
 * à esquerda, sem hora). É o formato que a API aceita — `YYYY-MM-DD` provoca o
 * erro Oracle `ORA-01843` e `DD/MM/YYYY` é ambíguo/rejeitado.
 */
export function visualDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Limite SUPERIOR exclusivo a granularidade de dia: como o filtro é só por data
 * (sem hora), o fim do intervalo tem de subir para o dia seguinte quando `to`
 * tem hora (ex.: "agora"), senão `lt hoje` excluiria o próprio dia de hoje.
 * Se `to` já está à meia-noite, mantém-se (limite exclusivo correto).
 */
function visualDateCeil(d: Date): string {
  const atMidnight =
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  const day = atMidnight ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return visualDate(day);
}

/** Constrói um filtro de intervalo de datas [from, to) para um campo. */
export function dateRangeFilter(field: string, from: Date, to: Date): string {
  return `${field} ge '${visualDate(from)}' and ${field} lt '${visualDateCeil(to)}'`;
}

/** Junta condições com AND. */
export function and(...conditions: (string | null | undefined)[]): string {
  return conditions.filter(Boolean).map((c) => `(${c})`).join(" and ");
}

/** Indica se a API Visual está configurada (sem fazer chamadas). */
export function isVisualConfigured(): boolean {
  return Boolean(BASE_URL && USER && PASSWORD);
}
