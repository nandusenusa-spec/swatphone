-- Screening / spam por número (por organización). Ejecutar en Supabase SQL Editor.
-- El backend usa service_role; RLS opcional para el futuro.

CREATE TABLE IF NOT EXISTS public.phone_screening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  spam_score INTEGER NOT NULL DEFAULT 0 CHECK (spam_score >= 0 AND spam_score <= 100),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,
  manual_block BOOLEAN NOT NULL DEFAULT FALSE,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rejected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phone_screening_org_phone_unique UNIQUE (organization_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_phone_screening_org_blocked
  ON public.phone_screening (organization_id, blocked)
  WHERE blocked = TRUE;

COMMENT ON TABLE public.phone_screening IS
  'Lista de números por tenant: score, bloqueo manual/sistema, intentos en ventana para rate-limit en assistant-request.';
