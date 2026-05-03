-- Panel cliente (auth.uid): lectura/escritura por organization_id en tablas de voz.
-- Sin esto, si RLS está activo sin políticas, las consultas devuelven 0 filas.
-- Seguro de correr varias veces.

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_logs_select_tenant ON public.call_logs;
CREATE POLICY call_logs_select_tenant ON public.call_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_select_tenant ON public.customers;
CREATE POLICY customers_select_tenant ON public.customers
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_insert_tenant ON public.customers;
CREATE POLICY customers_insert_tenant ON public.customers
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_update_tenant ON public.customers;
CREATE POLICY customers_update_tenant ON public.customers
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS follow_ups_select_tenant ON public.follow_ups;
CREATE POLICY follow_ups_select_tenant ON public.follow_ups
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS follow_ups_insert_tenant ON public.follow_ups;
CREATE POLICY follow_ups_insert_tenant ON public.follow_ups
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS follow_ups_update_tenant ON public.follow_ups;
CREATE POLICY follow_ups_update_tenant ON public.follow_ups
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMENT ON POLICY call_logs_select_tenant ON public.call_logs IS
  'Dueños del tenant ven call_logs de su organization_id (escribe service_role / webhooks).';
