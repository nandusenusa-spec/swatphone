-- ============================================================================
-- 003_admin_login_bootstrap.sql
--
-- Repara login Super Admin (/admin/login) cuando falla por:
-- - Falta extensión pgcrypto (crypt / gen_salt)
-- - Falta tabla admin_credentials o función verify_admin_password
-- - Usuario swat_admin ausente o contraseña desconocida
--
-- Después de ejecutar en Supabase SQL Editor:
--   Usuario: swat_admin
--   Contraseña: ChangeMeAfterFirstLogin!
--
-- Ejecutá NOTIFY al final si PostgREST cachea la función (opcional).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.verify_admin_password(input_username TEXT, input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h TEXT;
BEGIN
  SELECT password_hash INTO h
  FROM public.admin_credentials
  WHERE lower(trim(COALESCE(username, ''))) = lower(trim(COALESCE(input_username, '')))
    AND is_active = TRUE
  LIMIT 1;
  IF h IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN crypt(input_password, h) = h;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_password(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_password(TEXT, TEXT) TO anon, authenticated, service_role;

INSERT INTO public.admin_credentials (username, email, password_hash, is_active)
VALUES (
  'swat_admin',
  'admin@swatworks.local',
  crypt('ChangeMeAfterFirstLogin!', gen_salt('bf')),
  TRUE
)
ON CONFLICT (username) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = crypt('ChangeMeAfterFirstLogin!', gen_salt('bf')),
  is_active = TRUE,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';

COMMIT;
