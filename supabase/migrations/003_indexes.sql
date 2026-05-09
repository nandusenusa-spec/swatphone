-- ============================================================================
-- 003_indexes.sql — índices adicionales (post-baseline)
-- ============================================================================
-- El baseline en 001_initial_schema.sql ya incluye los índices principales
-- (idx_* por organization_id, teléfonos, fechas, etc.).
--
-- Usar este archivo solo para índices nuevos de performance sin tocar RLS.
-- Ejemplo:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foo ON public.bar (col);
-- Nota: CONCURRENTLY no puede correr dentro de una transacción estándar de migración;
-- en ese caso ejecutar manualmente en SQL Editor o migración separada sin transacción.
-- ============================================================================

SELECT 1 AS migration_003_noop;
