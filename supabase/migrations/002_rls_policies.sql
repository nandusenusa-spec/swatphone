-- ============================================================================
-- 002_rls_policies.sql — RLS tenant mínimo
-- ============================================================================
-- Origen: scripts/000_rebuild_supabase_schema.sql (bloque tras COMMIT principal).
-- Parches adicionales: scripts/016_tenant_call_logs_customers_followups_rls.sql, etc.
-- Ejecutar después de 001. Requiere tablas y public.profiles con organization_id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RLS tenant (dashboard auth): políticas mínimas para call_logs, customers, follow_ups
-- ---------------------------------------------------------------------------
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_logs_select_tenant ON public.call_logs;
CREATE POLICY call_logs_select_tenant ON public.call_logs
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_select_tenant ON public.customers;
CREATE POLICY customers_select_tenant ON public.customers
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_insert_tenant ON public.customers;
CREATE POLICY customers_insert_tenant ON public.customers
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_update_tenant ON public.customers;
CREATE POLICY customers_update_tenant ON public.customers
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_select_tenant ON public.follow_ups;
CREATE POLICY follow_ups_select_tenant ON public.follow_ups
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_insert_tenant ON public.follow_ups;
CREATE POLICY follow_ups_insert_tenant ON public.follow_ups
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_update_tenant ON public.follow_ups;
CREATE POLICY follow_ups_update_tenant ON public.follow_ups
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
