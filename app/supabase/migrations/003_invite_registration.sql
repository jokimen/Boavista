-- ============================================================
-- Óptica Boavista — Registo por convite (atómico, server-side)
-- Executar em: Supabase → SQL Editor (depois de 002_security_hardening.sql)
-- ============================================================

-- Consome um código de convite de forma ATÓMICA: marca-o usado e liga-o ao
-- utilizador, mas só se ainda estiver livre e válido. O UPDATE com
-- `used_by IS NULL` garante que dois registos concorrentes não reutilizam o
-- mesmo código (o segundo afeta 0 linhas → devolve false).
CREATE OR REPLACE FUNCTION public.consume_invite_code(p_code text, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.invite_codes
     SET used_by = p_user, used_at = now()
   WHERE code = upper(p_code)
     AND used_by IS NULL
     AND expires_at > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;

-- Só o servidor (service_role) pode consumir códigos — nunca o cliente.
REVOKE ALL ON FUNCTION public.consume_invite_code(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_invite_code(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invite_code(text, uuid) TO service_role;

-- LEMBRETE (definição no Dashboard, não SQL):
--   Authentication → Providers/Sign In → DESATIVAR "Allow new users to sign up".
--   Assim o registo só acontece via /api/register (service role) com convite válido.
