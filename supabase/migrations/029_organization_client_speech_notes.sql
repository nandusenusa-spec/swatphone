-- Texto opcional que el dueño del negocio edita en el dashboard (tono / cómo hablar).
-- El system prompt operativo sigue en Admin; esto solo añade contexto de marca.

ALTER TABLE public.organization_ai_config
  ADD COLUMN IF NOT EXISTS client_speech_notes TEXT;

COMMENT ON COLUMN public.organization_ai_config.client_speech_notes IS
  'Preferencias de tono/redacción editadas por el cliente en el dashboard; se anexan al prompt en sync, sin reemplazar reglas operativas.';
