-- 008_daily_metrics.sql
-- Agregados DIÁRIOS: um resumo aditivo por dia (vendas, margem, por categoria, por
-- colaborador). Qualquer intervalo (preset OU datas personalizadas de 1 ou 6 meses) =
-- somar as linhas dos dias correspondentes → instantâneo. O dia (data local de Lisboa)
-- nunca muda depois de fechado, por isso só os dias recentes são recalculados.

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  day         date PRIMARY KEY,   -- data local (Europe/Lisbon), YYYY-MM-DD
  data        jsonb NOT NULL,     -- { total_sales, covered_sales, total_cost, total_discount, num_sales, quotes, byCategory:{cat:{sales,coveredSales,cost,quantity}}, byEmployee:{usuario:{sales,num}} }
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_metrics_day_idx ON public.daily_metrics (day);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
-- Leitura para autenticados (o dashboard lê com a sessão); escrita só service role (cron).
DROP POLICY IF EXISTS dm_read ON public.daily_metrics;
CREATE POLICY dm_read ON public.daily_metrics
  FOR SELECT TO authenticated USING (true);
