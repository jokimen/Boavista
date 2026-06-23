-- 006_sent_alerts.sql
-- Deduplicação de alertas de WhatsApp: regista a "impressão digital" de cada alerta
-- já enviado para não repetir o mesmo todos os dias. Acedido SÓ pelo cron (service role).

CREATE TABLE IF NOT EXISTS public.sent_alerts (
  fingerprint text PRIMARY KEY,
  module      text,
  message     text,
  last_sent   timestamptz NOT NULL DEFAULT now(),
  sent_count  integer     NOT NULL DEFAULT 1
);

-- RLS ligada e SEM políticas => nega a anon/authenticated por defeito.
-- O cron usa a service role, que ignora RLS.
ALTER TABLE public.sent_alerts ENABLE ROW LEVEL SECURITY;
