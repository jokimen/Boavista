/**
 * Cliente OData (WCF Data Services / Visual Cloud — "vistas de exportación").
 *
 * Fonte de dados COMPLEMENTAR à REST do Visual: expõe vistas `VX_*` (ver
 * `vistas.pdf`) muito mais ricas — nomeadamente `VX_LINEAS_VENTA` traz a
 * **CLASE_PRODUCTO por linha** (que a REST não dá), o que permite classificar
 * corretamente todas as linhas (incl. lentes graduadas de laboratório).
 *
 * Config em .env.local:
 *  ODATA_URL       URL do serviço (.../WebServiceWcf.svc) com o token no path
 *  ODATA_USER      ex: dominio\utilizador
 *  ODATA_PASSWORD  password OData
 *
 * Autenticação: HTTP Basic. OData v3 (JSON minimalmetadata).
 */

const BASE = (process.env.ODATA_URL ?? "").replace(/\/+$/, "");
const USER = process.env.ODATA_USER ?? "";
const PASS = process.env.ODATA_PASSWORD ?? "";

const TIMEOUT_MS = 25_000;

export function isOdataConfigured(): boolean {
  return Boolean(BASE && USER && PASS);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
}

export interface OdataQuery {
  /** Filtro OData v3 ($filter), ex: "CENTRO eq 1 and FECHA ge datetime'2025-05-01T00:00:00'". */
  filter?: string;
  /** Campos ($select) — limitar evita CLOBs que rebentam a serialização (500). */
  select?: string[];
  top?: number;
  orderby?: string;
}

/**
 * Consulta uma vista e devolve todas as linhas, seguindo a paginação
 * (`odata.nextLink`). Lança em erro de rede/HTTP.
 */
export async function odataSelect<T>(entitySet: string, q: OdataQuery = {}): Promise<T[]> {
  if (!isOdataConfigured()) throw new Error("OData não configurado (ODATA_URL/USER/PASSWORD).");
  const params = new URLSearchParams();
  if (q.filter) params.set("$filter", q.filter);
  if (q.select?.length) params.set("$select", q.select.join(","));
  if (q.orderby) params.set("$orderby", q.orderby);
  if (q.top != null) params.set("$top", String(q.top));

  let url = `${BASE}/${entitySet}?${params.toString()}`;
  const out: T[] = [];
  for (let guard = 0; guard < 200 && url; guard++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: authHeader(), Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Normaliza o DOMException do timeout (message só-de-leitura) para um Error
      // normal — senão o Next tenta `err.message = …` e rebenta com
      // "Cannot set property message …" (unhandledRejection em cascata).
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`OData timeout ${TIMEOUT_MS}ms em ${entitySet}`);
      }
      throw new Error(`OData falha de rede em ${entitySet}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OData ${res.status} em ${entitySet}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { value?: T[]; "odata.nextLink"?: string; "@odata.nextLink"?: string };
    // Um a um: `out.push(...json.value)` rebenta com RangeError (stack) quando a
    // página traz muitas linhas — ex.: o catálogo inteiro de VX_ARTICULOS.
    if (Array.isArray(json.value)) for (const row of json.value) out.push(row);
    const next = json["odata.nextLink"] ?? json["@odata.nextLink"];
    url = next ? (next.startsWith("http") ? next : `${BASE}/${next}`) : "";
  }
  return out;
}
