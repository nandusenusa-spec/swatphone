-- Plan B: fuente de verdad para webhooks Vapi + columnas opcionales follow_ups
-- Ejecutar en Supabase SQL Editor si el proyecto aún no tiene estos objetos.

CREATE TABLE IF NOT EXISTS public.vapi_call_events_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  vapi_call_id TEXT,
  message_type TEXT,
  event_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vapi_call_events_raw_org ON public.vapi_call_events_raw(organization_id);
CREATE INDEX IF NOT EXISTS idx_vapi_call_events_raw_vapi_call ON public.vapi_call_events_raw(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_vapi_call_events_raw_received ON public.vapi_call_events_raw(received_at DESC);

COMMENT ON TABLE public.vapi_call_events_raw IS 'Payload JSON crudo de cada POST /api/voice/events (auditoría y reprocess).';

ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS lead_id UUID;
