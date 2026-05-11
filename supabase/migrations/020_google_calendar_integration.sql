CREATE TABLE IF NOT EXISTS public.organization_calendar_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  calendar_id TEXT,
  calendar_name TEXT,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  token_expiry TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_calendar_connections_org
  ON public.organization_calendar_connections (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_calendar_connections_active_provider
  ON public.organization_calendar_connections (organization_id, provider)
  WHERE is_active = TRUE;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS calendar_sync_error TEXT;

DROP TRIGGER IF EXISTS update_organization_calendar_connections_updated_at
  ON public.organization_calendar_connections;
CREATE TRIGGER update_organization_calendar_connections_updated_at
BEFORE UPDATE ON public.organization_calendar_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
