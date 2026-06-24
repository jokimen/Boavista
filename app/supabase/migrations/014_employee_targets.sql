-- ============================================================
-- Óptica Boavista — Objetivos mensais POR VENDEDOR
-- Executar em: Supabase → SQL Editor OU scripts/apply-migrations.mjs
-- ============================================================

-- O dono define o objetivo (em € de venda líquida) por mês e por vendedor (Usuario do Visual).
CREATE TABLE IF NOT EXISTS public.employee_targets (
  year       smallint NOT NULL,
  month      smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  usuario    text     NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (year, month, usuario)
);

-- RLS: todos os autenticados LÊEM; só o superadmin ESCREVE (igual a monthly_targets).
ALTER TABLE public.employee_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS et_read  ON public.employee_targets;
DROP POLICY IF EXISTS et_write ON public.employee_targets;
CREATE POLICY et_read  ON public.employee_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY et_write ON public.employee_targets
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
