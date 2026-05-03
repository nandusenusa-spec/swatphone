-- Columnas que usa el Admin + sync-assistant sobre assistant_configs (idempotente).
-- Ejecutar en Supabase SQL Editor si al guardar Prompts aparece error de columna inexistente.

ALTER TABLE public.assistant_configs
  ADD COLUMN IF NOT EXISTS greeting_message TEXT,
  ADD COLUMN IF NOT EXISTS first_message TEXT,
  ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 110,
  ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'openai';

UPDATE public.assistant_configs
SET first_message = greeting_message
WHERE (first_message IS NULL OR btrim(first_message) = '')
  AND greeting_message IS NOT NULL
  AND btrim(greeting_message) <> '';

UPDATE public.assistant_configs
SET greeting_message = first_message
WHERE (greeting_message IS NULL OR btrim(greeting_message) = '')
  AND first_message IS NOT NULL
  AND btrim(first_message) <> '';

-- Refrescar caché de PostgREST (si el Admin sigue diciendo que falta la columna tras el ALTER).
NOTIFY pgrst, 'reload schema';
