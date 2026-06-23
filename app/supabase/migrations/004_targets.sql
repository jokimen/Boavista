-- ============================================================
-- Opticalia Boavista — Objetivos mensais + produtos "saúde ocular"
-- Executar em: Supabase → SQL Editor (depois de 002 e 003)
-- ============================================================

-- ─── Objetivos mensais por categoria ──────────────────────────────────────────
-- O dono define o objetivo (em € de venda líquida) por mês e por categoria.
-- category ∈ {global, oculos_graduados, oculos_sol, lentes_contacto, saude_ocular}
CREATE TABLE IF NOT EXISTS public.monthly_targets (
  year       smallint NOT NULL,
  month      smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  category   text     NOT NULL CHECK (category IN (
                'global','oculos_graduados','oculos_sol','lentes_contacto','saude_ocular')),
  amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (year, month, category)
);

-- ─── Produtos considerados "saúde ocular" (lágrimas, líquidos de manutenção…) ──
-- Não é uma categoria da API Visual; o dono define a lista de códigos de produto.
CREATE TABLE IF NOT EXISTS public.saude_ocular_products (
  codigo     text PRIMARY KEY,
  descricao  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ─── RLS: todos os autenticados LÊEM; só o superadmin ESCREVE ──────────────────
ALTER TABLE public.monthly_targets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saude_ocular_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mt_read  ON public.monthly_targets;
DROP POLICY IF EXISTS mt_write ON public.monthly_targets;
CREATE POLICY mt_read  ON public.monthly_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mt_write ON public.monthly_targets
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS sop_read  ON public.saude_ocular_products;
DROP POLICY IF EXISTS sop_write ON public.saude_ocular_products;
CREATE POLICY sop_read  ON public.saude_ocular_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sop_write ON public.saude_ocular_products
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
