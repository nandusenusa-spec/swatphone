-- Auditoría completa: tablas con RLS habilitado y conteo de políticas.
-- Solo SELECT, no modifica nada.
-- Las filas con `policy_count = 0` y `rls_enabled = true` son las que rompen
-- (cualquier insert/update/delete del cliente con sesión de usuario falla con 42501).

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COALESCE(p.policy_count, 0) AS policy_count,
  CASE
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) = 0 THEN '⚠️ HUERFANA'
    WHEN c.relrowsecurity THEN 'OK'
    ELSE '(RLS apagado)'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT tablename, COUNT(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY
  CASE WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) = 0 THEN 0 ELSE 1 END,
  c.relname;
