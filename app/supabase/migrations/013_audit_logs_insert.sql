-- ============================================================
-- Óptica Boavista — audit_logs: impedir forjar user_id (auditoria Codex #7)
-- Antes: WITH CHECK (auth.uid() IS NOT NULL) → um utilizador podia inserir um log
-- com o user_id de outra pessoa. Agora só pode registar ações em seu próprio nome.
-- Os crons/registo usam service role (ignoram RLS) → não afetados.
-- Executar em: Supabase → SQL Editor.
-- ============================================================

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
