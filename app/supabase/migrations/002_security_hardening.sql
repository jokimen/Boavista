-- ============================================================
-- Óptica Boavista — Hardening de segurança (RLS)
-- Executar em: Supabase → SQL Editor (depois de 001_initial_schema.sql)
--
-- Corrige escalada de privilégios: a policy original `profiles_update`
-- permitia a um utilizador alterar QUALQUER coluna do seu próprio perfil,
-- incluindo `role` e `is_active` → podia tornar-se superadmin.
-- ============================================================

-- ─── Helper: is_superadmin() (SECURITY DEFINER evita recursão de RLS) ──────────
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin' AND is_active = true
  );
$$;

-- ─── Bloquear alteração de colunas sensíveis em profiles ──────────────────────
-- Um utilizador pode editar o seu próprio perfil (nome, dados 2FA), mas NÃO
-- pode mudar role / is_active / email / id / invite_code. Só superadmin (ou o
-- service_role do servidor) o pode fazer.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role (chamadas server-side com a service key) tem passagem livre
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- superadmin ativo pode alterar tudo
  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;
  -- restantes: campos sensíveis têm de permanecer iguais
  IF NEW.role        IS DISTINCT FROM OLD.role
     OR NEW.is_active   IS DISTINCT FROM OLD.is_active
     OR NEW.email       IS DISTINCT FROM OLD.email
     OR NEW.id          IS DISTINCT FROM OLD.id
     OR NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
    RAISE EXCEPTION 'Não autorizado a alterar campos sensíveis do perfil (role/is_active/email).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- ─── Reforçar policies de profiles com is_superadmin() + WITH CHECK ───────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_superadmin());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_superadmin())
  WITH CHECK (auth.uid() = id OR public.is_superadmin());

-- ─── Invite codes: deixar de expor TODOS os códigos publicamente ──────────────
-- A policy original `invite_codes_validate USING (true)` permitia ler todos os
-- códigos. Substituída por uma função SECURITY DEFINER que só responde
-- válido/inválido para um código concreto.
DROP POLICY IF EXISTS "invite_codes_validate" ON public.invite_codes;

CREATE OR REPLACE FUNCTION public.is_valid_invite_code(p_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes
    WHERE code = upper(p_code)
      AND used_by IS NULL
      AND expires_at > now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_valid_invite_code(text) TO anon, authenticated;

-- ─── Outras policies passam a usar o helper (consistência/anti-recursão) ──────
DROP POLICY IF EXISTS "permissions_select" ON public.permissions;
CREATE POLICY "permissions_select" ON public.permissions
  FOR SELECT USING (user_id = auth.uid() OR public.is_superadmin());

DROP POLICY IF EXISTS "permissions_admin" ON public.permissions;
CREATE POLICY "permissions_admin" ON public.permissions
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "invite_codes_superadmin" ON public.invite_codes;
CREATE POLICY "invite_codes_superadmin" ON public.invite_codes
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "audit_logs_superadmin" ON public.audit_logs;
CREATE POLICY "audit_logs_superadmin" ON public.audit_logs
  FOR SELECT USING (public.is_superadmin());
-- mantém-se audit_logs_insert (qualquer utilizador autenticado regista ações).
