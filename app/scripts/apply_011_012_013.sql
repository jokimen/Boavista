-- ============================================================
-- Óptica Boavista — Migrações 011 + 012 + 013 (colar de uma vez no SQL Editor)
-- 011 rappel_tiers · 012 totp_secrets · 013 audit_logs_insert
-- ============================================================

-- ── 011: rappel escalonado ───────────────────────────────────
ALTER TABLE public.supplier_config
  ADD COLUMN IF NOT EXISTS rappel_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.supplier_config
   SET rappel_tiers = jsonb_build_array(jsonb_build_object('min', 0, 'pct', rappel_pct))
 WHERE rappel_pct > 0 AND (rappel_tiers IS NULL OR rappel_tiers = '[]'::jsonb);

-- ── 012: cofre dos segredos TOTP (fora da RLS) ───────────────
CREATE TABLE IF NOT EXISTS public.totp_secrets (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.totp_secrets FROM anon, authenticated;
INSERT INTO public.totp_secrets (user_id, secret)
SELECT id, totp_secret FROM public.profiles
 WHERE totp_secret IS NOT NULL AND totp_secret <> ''
ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS totp_secret;

-- ── 013: audit_logs anti-forja ───────────────────────────────
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
