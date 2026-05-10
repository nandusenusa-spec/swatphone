-- ============================================================================
-- 005_orphan_tables_rls.sql
-- Políticas RLS para todas las tablas tenant huérfanas (RLS on, 0 políticas).
-- Mismo patrón que 004: pertenencia a la org via profiles.organization_id.
-- Sin role-check (cualquier miembro de la org puede CRUD su data).
--
-- Tablas cubiertas (15):
--   appointments, assistant_configs, faqs, notifications,
--   organization_ai_config, organization_business_hours, organization_catalog,
--   organization_routing, organization_voice_settings, phone_screening,
--   price_catalog, transfers, vapi_call_events_raw, work_orders,
--   call_classifications
--
-- Tablas NO cubiertas (intencional — solo service role):
--   admin_credentials, organization_owner_credential_store
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'appointments',
    'assistant_configs',
    'faqs',
    'notifications',
    'organization_ai_config',
    'organization_business_hours',
    'organization_catalog',
    'organization_routing',
    'organization_voice_settings',
    'phone_screening',
    'price_catalog',
    'transfers',
    'vapi_call_events_raw',
    'work_orders',
    'call_classifications'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables
  LOOP
    -- SELECT
    EXECUTE format('DROP POLICY IF EXISTS %I_select_tenant ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_select_tenant ON public.%I
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    $f$, t, t);

    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_tenant ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_insert_tenant ON public.%I
      FOR INSERT WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    $f$, t, t);

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS %I_update_tenant ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_update_tenant ON public.%I
      FOR UPDATE USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      ) WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    $f$, t, t);

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_tenant ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_delete_tenant ON public.%I
      FOR DELETE USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    $f$, t, t);

    RAISE NOTICE 'Policies created for %', t;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
