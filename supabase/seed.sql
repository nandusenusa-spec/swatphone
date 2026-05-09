-- ============================================================================
-- seed.sql — datos demo / bootstrap (documentado)
-- ============================================================================
-- Orden sugerido en proyecto nuevo:
--   1) supabase/migrations/001_initial_schema.sql
--   2) supabase/migrations/002_rls_policies.sql
--   3) scripts/003_admin_login_bootstrap.sql   (super admin; puede pisar hash si re-ejecutás)
--   4) scripts/001_seed_swatworks.sql
--   5) scripts/002_seed_admin_client_swatworks.sql (opcional)
--   6) scripts/011_organization_owner_credential_store.sql (opcional)
--
-- auth.users no se inserta aquí de forma portable.
-- Alternativa monolítica en SQL Editor: scripts/000_rebuild_supabase_schema.sql (incluye RLS al final).
-- ============================================================================

SELECT 1 AS seed_placeholder;
