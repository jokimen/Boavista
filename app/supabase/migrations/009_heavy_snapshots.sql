-- 009_heavy_snapshots.sql
-- Snapshots pré-calculados das leituras PESADAS que não dependem de intervalo de
-- datas: stock (catálogo completo + entradas), base de clientes e clientes de
-- lentes de contacto. O PC da loja calcula (fala depressa com a API Visual/OData)
-- e grava aqui; a Vercel lê daqui (mesma região = instantâneo) em vez de bater
-- na API a cada visita. Tabela genérica chaveada por entidade.

CREATE TABLE IF NOT EXISTS public.heavy_snapshots (
  key         text PRIMARY KEY,          -- "stock" | "clients" | "contact_lens"
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.heavy_snapshots ENABLE ROW LEVEL SECURITY;

-- Leitura para qualquer utilizador autenticado (as páginas leem com a sessão);
-- a leitura efetiva usa service role de qualquer forma (ver heavy.ts).
DROP POLICY IF EXISTS hs_read ON public.heavy_snapshots;
CREATE POLICY hs_read ON public.heavy_snapshots
  FOR SELECT TO authenticated USING (true);
-- Escrita só via service role (o cron de pré-cálculo) — que ignora RLS.
