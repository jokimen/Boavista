/**
 * Rate limiter simples em memória (janela fixa), por chave (IP+rota).
 * Adequado a deploy single-instance (dev/local). Num ambiente serverless
 * multi-instância seria preciso um store partilhado (ex.: Upstash/Redis).
 */

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Devolve true se o pedido é permitido; false se excedeu o limite.
 * @param key    identificador (ex.: `${ip}:${path}`)
 * @param limit  nº máximo de pedidos na janela
 * @param windowMs duração da janela em ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    // limpeza oportunista para o Map não crescer indefinidamente
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
