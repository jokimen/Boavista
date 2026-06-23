-- 007_dashboard_snapshots.sql
-- Snapshots pré-calculados do dashboard, por período-preset (today/week/month/...).
-- O PC da loja calcula (fala depressa com a API Visual) e grava aqui; a Vercel lê
-- daqui (mesma região = instantâneo) em vez de bater na API Visual a cada visita.

CREATE TABLE IF NOT EXISTS public.dashboard_snapshots (
  period      text PRIMARY KEY,          -- "today" | "week" | "month" | "last_month" | "quarter" | "year"
  data        jsonb NOT NULL,            -- { summary, light, prevLight, byCategory, byEmployee, trend, computedAt }
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Leitura para qualquer utilizador autenticado (o dashboard lê com a sessão do utilizador).
DROP POLICY IF EXISTS ds_read ON public.dashboard_snapshots;
CREATE POLICY ds_read ON public.dashboard_snapshots
  FOR SELECT TO authenticated USING (true);
-- Escrita só via service role (o cron de pré-cálculo) — que ignora RLS de qualquer forma.
