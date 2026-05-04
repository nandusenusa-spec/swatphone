-- ============================================================================
-- 002_seed_admin_client_swatworks.sql
--
-- Admin → /admin/clients/[uuid] llama GET /api/admin/data?type=organization&id=...
-- Eso lee public.organizations por PK. Si no hay fila → "Cliente no encontrado".
--
-- Este script (idempotente):
-- 1) Añade columnas opcionales en organizations si faltan (admin / reporting).
-- 2) UPSERT de SWATWORKS con vapi_assistant_id y datos de negocio.
-- 3) Si existe public.clients (print-shop), inserta un cliente demo enlazado a la org.
--
-- organization_id fijo: 9bb50e58-9ba6-4d54-8171-13922749f570
-- Ejecutar en Supabase SQL Editor después de 000/001 o sobre BD ya migrada.
-- ============================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

INSERT INTO public.organizations (
  id,
  name,
  slug,
  timezone,
  active,
  vapi_assistant_id,
  business_name,
  company_name,
  status,
  metadata,
  settings,
  updated_at
) VALUES (
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  'SWATWORKS',
  'swatworks',
  'America/New_York',
  TRUE,
  'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d',
  'SWATWORKS',
  'SWATWORKS',
  'active',
  '{}'::jsonb,
  jsonb_build_object(
    'business_name', 'SWATWORKS',
    'company_name', 'SWATWORKS',
    'status', 'active',
    'metadata', '{}'::jsonb
  ),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  timezone = COALESCE(EXCLUDED.timezone, organizations.timezone),
  active = COALESCE(EXCLUDED.active, organizations.active),
  vapi_assistant_id = COALESCE(EXCLUDED.vapi_assistant_id, organizations.vapi_assistant_id),
  business_name = COALESCE(EXCLUDED.business_name, organizations.business_name),
  company_name = COALESCE(EXCLUDED.company_name, organizations.company_name),
  status = COALESCE(EXCLUDED.status, organizations.status),
  metadata = COALESCE(EXCLUDED.metadata, '{}'::jsonb),
  settings = COALESCE(organizations.settings, '{}'::jsonb) || COALESCE(EXCLUDED.settings, '{}'::jsonb),
  updated_at = NOW();

-- Catálogo impresión (opcional): solo si existe public.clients (p. ej. scripts/003).
-- Usamos EXECUTE para que PostgreSQL no analice "public.clients" si la tabla no existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'clients'
  ) THEN
    EXECUTE $ins$
      INSERT INTO public.clients (organization_id, name, phone, company)
      SELECT $1::uuid, $2, $3, $4
      WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.phone = $3)
    $ins$
    USING
      '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
      'Cliente demo impresión',
      '+15555550199',
      'SWATWORKS';
  END IF;
END $$;

COMMIT;
