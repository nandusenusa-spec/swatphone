-- ============================================================================
-- 004_products_team_members_rls.sql
-- Políticas RLS para public.products y public.team_members.
-- Estado previo: RLS habilitado pero sin políticas → todos los inserts/updates
-- desde el cliente fallaban con código 42501 (insufficient_privilege).
--
-- Modelo: cualquier usuario autenticado que pertenezca a la organización
-- (vía profiles.organization_id) puede CRUD las filas de su org.
-- Sin role-check (owner/admin), porque hoy todos los miembros de SWATWORKS
-- necesitan poder editar su catálogo y equipo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS products_select_tenant ON public.products;
CREATE POLICY products_select_tenant ON public.products
  FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS products_insert_tenant ON public.products;
CREATE POLICY products_insert_tenant ON public.products
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS products_update_tenant ON public.products;
CREATE POLICY products_update_tenant ON public.products
  FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS products_delete_tenant ON public.products;
CREATE POLICY products_delete_tenant ON public.products
  FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_select_tenant ON public.team_members;
CREATE POLICY team_members_select_tenant ON public.team_members
  FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_insert_tenant ON public.team_members;
CREATE POLICY team_members_insert_tenant ON public.team_members
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_update_tenant ON public.team_members;
CREATE POLICY team_members_update_tenant ON public.team_members
  FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_delete_tenant ON public.team_members;
CREATE POLICY team_members_delete_tenant ON public.team_members
  FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Refrescar el cache de PostgREST para que tome los cambios al instante.
NOTIFY pgrst, 'reload schema';
