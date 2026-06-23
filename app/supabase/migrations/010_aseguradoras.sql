-- 010_aseguradoras.sql
-- Mapa código→nome das seguradoras de saúde. A API Visual (REST) só dá o
-- Codigo_aseguradora (número) nas FacturasClientes; o nome (Multicare/Medis/…)
-- não está exposto, por isso o superadmin rotula cada código aqui. Alimenta as
-- secções de seguros dos relatórios (clientes novos com seguro, % desc por seguro).

CREATE TABLE IF NOT EXISTS public.aseguradora_config (
  codigo      text PRIMARY KEY,            -- Codigo_aseguradora do Visual (REST)
  nome        text NOT NULL,               -- nome legível (Multicare, Medis, …)
  ativo       boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.aseguradora_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ac_read  ON public.aseguradora_config;
DROP POLICY IF EXISTS ac_write ON public.aseguradora_config;
CREATE POLICY ac_read  ON public.aseguradora_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ac_write ON public.aseguradora_config
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
