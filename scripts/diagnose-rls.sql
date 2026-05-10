-- Diagnóstico de políticas RLS sobre products, team_members, profiles.
-- Solo SELECT, no modifica nada.

-- 1) Estado RLS de las tablas
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('products', 'team_members', 'profiles', 'organizations')
ORDER BY c.relname;

-- 2) Políticas activas
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('products', 'team_members', 'profiles')
ORDER BY tablename, cmd, policyname;

-- 3) Profile + org del usuario
SELECT
  p.id,
  p.email,
  p.role,
  p.organization_id,
  o.name AS org_name
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE p.email = 'fernandosardo@gmail.com';

-- 4) Simulación: ¿qué devuelve la subquery que usa la policy?
-- (con el id del usuario hardcodeado para evitar auth.uid() que requiere contexto de sesión)
SELECT organization_id, role
FROM public.profiles
WHERE id = '89c45bc2-f069-4de9-bab0-1db869c5bcdd'
  AND role IN ('owner', 'admin');
