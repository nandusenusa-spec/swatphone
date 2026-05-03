-- Runtime config tables: all business logic in app DB
-- Requested: organization_ai_config, organization_routing, organization_catalog, organization_business_hours

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS organization_ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  system_prompt TEXT,
  welcome_message TEXT,
  enabled_tools TEXT[] NOT NULL DEFAULT ARRAY[
    'find_customer',
    'get_job_status',
    'create_appointment',
    'create_work_order',
    'get_price_quote',
    'transfer_to_ramon',
    'save_call_outcome',
    'mark_spam_call',
    'create_follow_up'
  ],
  spam_max_attempts INTEGER NOT NULL DEFAULT 2,
  spam_threshold INTEGER NOT NULL DEFAULT 70,
  language TEXT NOT NULL DEFAULT 'es',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_target_name TEXT DEFAULT 'Ramon',
  transfer_target_phone TEXT,
  transfer_on_urgent BOOLEAN NOT NULL DEFAULT true,
  transfer_on_reclamo BOOLEAN NOT NULL DEFAULT true,
  transfer_on_hot_lead BOOLEAN NOT NULL DEFAULT true,
  callback_if_unavailable BOOLEAN NOT NULL DEFAULT true,
  escalation_policy JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_catalog_org ON organization_catalog(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_catalog_service ON organization_catalog(service_name);

CREATE TABLE IF NOT EXISTS organization_business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TEXT,
  close_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_business_hours_org ON organization_business_hours(organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_business_hours_org_day_unique'
  ) THEN
    ALTER TABLE organization_business_hours
      ADD CONSTRAINT organization_business_hours_org_day_unique
      UNIQUE (organization_id, day_of_week);
  END IF;
END $$;
