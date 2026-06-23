-- ============================================================
-- Opticalia Boavista — Segredos TOTP fora de `profiles` (auditoria Codex #3)
-- O segredo deixava-se ler por RLS (o próprio utilizador podia recuperá-lo).
-- Passa para `totp_secrets` SEM policies → só a service role lhe acede.
-- Executar em: Supabase → SQL Editor (DDL não passa pela service role/pooler).
-- DEPOIS de o código resiliente estar em produção (lê cofre, fallback à coluna).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.totp_secrets (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS ligada e SEM qualquer policy: nem `anon` nem `authenticated` acedem.
-- A service role (server-side) ignora RLS — é o único caminho de acesso.
ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.totp_secrets FROM anon, authenticated;

-- Migrar segredos existentes de profiles → cofre.
INSERT INTO public.totp_secrets (user_id, secret)
SELECT id, totp_secret
  FROM public.profiles
 WHERE totp_secret IS NOT NULL AND totp_secret <> ''
ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();

-- Remover a coluna sensível (já não é lida pelo código após esta migração).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS totp_secret;
