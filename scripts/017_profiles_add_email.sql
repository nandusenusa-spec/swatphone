-- Opcional: el listado de clientes en Admin usa profiles.email para el owner.
-- Si GET /api/admin/data?type=organizations devolvía 500 por columna inexistente, ejecutá esto.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;
