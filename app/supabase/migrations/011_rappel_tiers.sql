-- ============================================================
-- Óptica Boavista — Rappel escalonado por escalões de compra
-- Cada fornecedor pode ter vários patamares {min €, %}; a % do patamar mais
-- alto atingido pelas compras aplica-se ao TOTAL.
-- Executar em: Supabase → SQL Editor (depois de 005). DDL não passa pela service role.
-- ============================================================

ALTER TABLE public.supplier_config
  ADD COLUMN IF NOT EXISTS rappel_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migra o rappel plano existente (>0) para um único escalão {min:0, pct}.
UPDATE public.supplier_config
   SET rappel_tiers = jsonb_build_array(jsonb_build_object('min', 0, 'pct', rappel_pct))
 WHERE rappel_pct > 0
   AND (rappel_tiers IS NULL OR rappel_tiers = '[]'::jsonb);
