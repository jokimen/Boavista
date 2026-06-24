-- ============================================================
-- Óptica Boavista — Config de fornecedores (grupo, objetivo de compra, rappel)
-- Executar em: Supabase → SQL Editor (depois de 004)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_config (
  proveedor       text PRIMARY KEY,                 -- código do fornecedor (Visual)
  nome            text,
  grupo           text CHECK (grupo IN ('oftalmicas','contacto_saude','armacoes_sol')),
  objetivo_compra numeric(12,2) NOT NULL DEFAULT 0 CHECK (objetivo_compra >= 0),
  rappel_pct      numeric(5,2)  NOT NULL DEFAULT 0 CHECK (rappel_pct >= 0 AND rappel_pct <= 100),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.supplier_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sc_read  ON public.supplier_config;
DROP POLICY IF EXISTS sc_write ON public.supplier_config;
CREATE POLICY sc_read  ON public.supplier_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_write ON public.supplier_config
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
