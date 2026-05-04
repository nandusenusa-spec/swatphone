-- ============================================================================
-- 000_rebuild_supabase_schema.sql
-- Base vacía / reconstrucción: esquema alineado con lib/voice-platform y
-- lib/vapi/runtime-config (sin tocar código de la app).
-- Ejecutar en Supabase SQL Editor como un solo script (o psql).
-- Orden: extensiones → tablas core → voice platform → runtime → extras → RLS.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organización / auth perfil
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  vapi_assistant_id TEXT,
  phone_number TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
  email TEXT,
  role TEXT DEFAULT 'member',
  is_super_admin BOOLEAN DEFAULT FALSE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles (organization_id);

-- ---------------------------------------------------------------------------
-- Assistant configs (Admin / sync Vapi)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assistant_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Asistente Virtual',
  voice_id TEXT DEFAULT 'alloy',
  voice_provider TEXT DEFAULT 'openai',
  language TEXT DEFAULT 'es',
  system_prompt TEXT,
  greeting_message TEXT,
  first_message TEXT,
  max_tokens INTEGER DEFAULT 110,
  temperature DOUBLE PRECISION DEFAULT 0.15,
  business_hours JSONB DEFAULT '{}'::jsonb,
  after_hours_message TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_configs_org ON public.assistant_configs (organization_id);

-- ---------------------------------------------------------------------------
-- Catálogo dashboard (products)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_organization ON public.products (organization_id);

-- ---------------------------------------------------------------------------
-- Equipo (sync → transfer_destinations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  extension TEXT,
  role TEXT,
  department TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_organization ON public.team_members (organization_id);

-- ---------------------------------------------------------------------------
-- Leads / FAQ / legacy calls (admin analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  company TEXT,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  status TEXT DEFAULT 'new',
  tags TEXT[] DEFAULT '{}'::text[],
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_organization ON public.leads (organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);

CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_organization ON public.faqs (organization_id);

CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads (id) ON DELETE SET NULL,
  vapi_call_id TEXT,
  phone_number TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound',
  status TEXT DEFAULT 'completed',
  duration_seconds INTEGER DEFAULT 0,
  summary TEXT,
  transcript TEXT,
  sentiment TEXT,
  recording_url TEXT,
  transferred_to UUID REFERENCES public.team_members (id),
  cost NUMERIC(10, 4) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calls_organization ON public.calls (organization_id);

-- ---------------------------------------------------------------------------
-- Voice platform (006 + columnas usadas por upsert/repository)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  company TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_org_phone_unique') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_org_phone_unique UNIQUE (organization_id, phone);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.price_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  service_code TEXT,
  service_name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit_price NUMERIC(12, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_catalog_org ON public.price_catalog (organization_id);

CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  work_order_number TEXT NOT NULL,
  order_number TEXT,
  title TEXT NOT NULL,
  issue_description TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  estimated_delivery_at TIMESTAMPTZ,
  confirmed_delivery_at TIMESTAMPTZ,
  promised_date TIMESTAMPTZ,
  pickup_ready_at TIMESTAMPTZ,
  quoted_price NUMERIC(12, 2),
  confirmed_price NUMERIC(12, 2),
  owner TEXT,
  created_by TEXT DEFAULT 'voice_bot',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_org ON public.work_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_number ON public.work_orders (work_order_number);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON public.work_orders (customer_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_org_number_unique') THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_org_number_unique UNIQUE (organization_id, work_order_number);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  call_log_id UUID,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  appointment_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  assigned_to TEXT,
  source TEXT,
  created_by TEXT DEFAULT 'voice_bot',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_org ON public.appointments (organization_id);

CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  vapi_call_id TEXT,
  twilio_call_sid TEXT,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  customer_name TEXT,
  intent TEXT,
  call_type TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  classification TEXT,
  spam_score INTEGER NOT NULL DEFAULT 0,
  transfer_requested BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_completed BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_target TEXT,
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  callback_required BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date TIMESTAMPTZ,
  result TEXT,
  outcome TEXT,
  owner TEXT,
  assigned_to TEXT,
  next_action TEXT,
  transcript TEXT,
  summary TEXT,
  structured_extraction JSONB DEFAULT '{}'::jsonb,
  tool_calls JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT,
  duration INTEGER,
  direction TEXT DEFAULT 'inbound',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_org ON public.call_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_vapi_call_id ON public.call_logs (vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON public.call_logs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.call_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_log_id UUID NOT NULL REFERENCES public.call_logs (id) ON DELETE CASCADE,
  classification TEXT NOT NULL,
  confidence NUMERIC(5, 2) DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_classifications_call_log ON public.call_classifications (call_log_id);

CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES public.call_logs (id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads (id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  notes TEXT,
  owner TEXT,
  due_at TIMESTAMPTZ,
  callback_required BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_org ON public.follow_ups (organization_id);

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES public.call_logs (id) ON DELETE SET NULL,
  requested BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  requested_to TEXT,
  transfer_number TEXT,
  status TEXT,
  target_name TEXT,
  target_phone TEXT,
  reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transfers_org ON public.transfers (organization_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES public.call_logs (id) ON DELETE SET NULL,
  follow_up_id UUID REFERENCES public.follow_ups (id) ON DELETE SET NULL,
  channel TEXT,
  template_code TEXT,
  payload JSONB,
  type TEXT,
  title TEXT,
  message TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON public.notifications (organization_id);

CREATE TABLE IF NOT EXISTS public.organization_voice_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  welcome_message TEXT,
  transfer_target_name TEXT DEFAULT 'Ramon',
  transfer_target_phone TEXT,
  business_hours JSONB DEFAULT '{}'::jsonb,
  escalation_policy JSONB DEFAULT '{}'::jsonb,
  spam_threshold INTEGER NOT NULL DEFAULT 70,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Runtime config (organization_ai_config + routing + catálogo servicios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  system_prompt TEXT,
  welcome_message TEXT,
  fallback_message TEXT,
  max_failed_attempts INTEGER DEFAULT 2,
  voice_style TEXT,
  voice_id TEXT,
  voice_provider TEXT,
  allowed_tools JSONB DEFAULT '[]'::jsonb,
  spam_policy JSONB DEFAULT '{}'::jsonb,
  extraction_schema_version TEXT,
  enabled_tools TEXT[] DEFAULT ARRAY[]::text[],
  spam_max_attempts INTEGER DEFAULT 2,
  spam_threshold INTEGER DEFAULT 70,
  language TEXT DEFAULT 'es',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  default_transfer_number TEXT,
  ramon_transfer_number TEXT,
  urgent_transfer_number TEXT,
  transfer_destinations JSONB DEFAULT '[]'::jsonb,
  after_hours_behavior TEXT,
  callback_default_owner TEXT,
  allow_live_transfer BOOLEAN DEFAULT TRUE,
  transfer_target_name TEXT DEFAULT 'Ramon',
  transfer_target_phone TEXT,
  transfer_on_urgent BOOLEAN DEFAULT TRUE,
  transfer_on_reclamo BOOLEAN DEFAULT TRUE,
  transfer_on_hot_lead BOOLEAN DEFAULT TRUE,
  callback_if_unavailable BOOLEAN DEFAULT TRUE,
  escalation_policy JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  service_code TEXT,
  service_name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL,
  public_price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  price_type TEXT,
  estimated_only BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_catalog_org ON public.organization_catalog (organization_id);

CREATE TABLE IF NOT EXISTS public.organization_business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN DEFAULT TRUE,
  open_time TEXT,
  close_time TEXT,
  opens_at TIME,
  closes_at TIME,
  active BOOLEAN DEFAULT TRUE,
  timezone TEXT DEFAULT 'America/New_York',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_business_hours_org_day_unique') THEN
    ALTER TABLE public.organization_business_hours
      ADD CONSTRAINT organization_business_hours_org_day_unique UNIQUE (organization_id, day_of_week);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Plan B / screening
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vapi_call_events_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
  vapi_call_id TEXT,
  message_type TEXT,
  event_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vapi_call_events_raw_org ON public.vapi_call_events_raw (organization_id);
CREATE INDEX IF NOT EXISTS idx_vapi_call_events_raw_received ON public.vapi_call_events_raw (received_at DESC);

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

-- ---------------------------------------------------------------------------
-- Admin login (app/api/admin/login)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Triggers updated_at (voice platform + orgs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_assistant_configs_updated_at ON public.assistant_configs;
CREATE TRIGGER update_assistant_configs_updated_at
BEFORE UPDATE ON public.assistant_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_members_updated_at ON public.team_members;
CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_catalog_updated_at ON public.price_catalog;
CREATE TRIGGER update_price_catalog_updated_at
BEFORE UPDATE ON public.price_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER update_work_orders_updated_at
BEFORE UPDATE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON public.appointments;
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_logs_updated_at ON public.call_logs;
CREATE TRIGGER update_call_logs_updated_at
BEFORE UPDATE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON public.follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
BEFORE UPDATE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_ai_config_updated_at ON public.organization_ai_config;
CREATE TRIGGER update_organization_ai_config_updated_at
BEFORE UPDATE ON public.organization_ai_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_routing_updated_at ON public.organization_routing;
CREATE TRIGGER update_organization_routing_updated_at
BEFORE UPDATE ON public.organization_routing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_catalog_updated_at ON public.organization_catalog;
CREATE TRIGGER update_organization_catalog_updated_at
BEFORE UPDATE ON public.organization_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS tenant (dashboard auth): políticas mínimas para call_logs, customers, follow_ups
-- ---------------------------------------------------------------------------
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_logs_select_tenant ON public.call_logs;
CREATE POLICY call_logs_select_tenant ON public.call_logs
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_select_tenant ON public.customers;
CREATE POLICY customers_select_tenant ON public.customers
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_insert_tenant ON public.customers;
CREATE POLICY customers_insert_tenant ON public.customers
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS customers_update_tenant ON public.customers;
CREATE POLICY customers_update_tenant ON public.customers
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_select_tenant ON public.follow_ups;
CREATE POLICY follow_ups_select_tenant ON public.follow_ups
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_insert_tenant ON public.follow_ups;
CREATE POLICY follow_ups_insert_tenant ON public.follow_ups
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS follow_ups_update_tenant ON public.follow_ups;
CREATE POLICY follow_ups_update_tenant ON public.follow_ups
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
