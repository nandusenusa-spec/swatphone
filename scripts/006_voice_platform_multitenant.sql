-- Multi-tenant voice platform schema for sellable MVP
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Customers
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  company TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_org_phone_unique'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_org_phone_unique UNIQUE (organization_id, phone);
  END IF;
END $$;

-- =====================================================
-- Price catalog
-- =====================================================
CREATE TABLE IF NOT EXISTS price_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_code TEXT,
  service_name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit_price NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_catalog_org ON price_catalog(organization_id);
CREATE INDEX IF NOT EXISTS idx_price_catalog_service_name ON price_catalog(service_name);

-- =====================================================
-- Work orders
-- =====================================================
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  work_order_number TEXT NOT NULL,
  title TEXT NOT NULL,
  issue_description TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  estimated_delivery_at TIMESTAMPTZ,
  confirmed_delivery_at TIMESTAMPTZ,
  owner TEXT,
  created_by TEXT DEFAULT 'voice_bot',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_org ON work_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_number ON work_orders(work_order_number);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_org_number_unique'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_org_number_unique UNIQUE (organization_id, work_order_number);
  END IF;
END $$;

-- =====================================================
-- Appointments
-- =====================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  call_log_id UUID,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  appointment_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by TEXT DEFAULT 'voice_bot',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_at);

-- =====================================================
-- Call logs
-- =====================================================
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vapi_call_id TEXT,
  twilio_call_sid TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  customer_name TEXT,
  intent TEXT,
  call_type TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  classification TEXT,
  spam_score INTEGER NOT NULL DEFAULT 0,
  transfer_requested BOOLEAN NOT NULL DEFAULT false,
  transfer_completed BOOLEAN NOT NULL DEFAULT false,
  transfer_target TEXT,
  urgent BOOLEAN NOT NULL DEFAULT false,
  callback_required BOOLEAN NOT NULL DEFAULT false,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  follow_up_date TIMESTAMPTZ,
  result TEXT,
  owner TEXT,
  next_action TEXT,
  transcript TEXT,
  summary TEXT,
  structured_extraction JSONB DEFAULT '{}',
  tool_calls JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_org ON call_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs(phone);
CREATE INDEX IF NOT EXISTS idx_call_logs_vapi_call_id ON call_logs(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_classification ON call_logs(classification);
CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON call_logs(started_at DESC);

-- =====================================================
-- Call classifications
-- =====================================================
CREATE TABLE IF NOT EXISTS call_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_log_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
  classification TEXT NOT NULL,
  confidence NUMERIC(5,2) DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_classifications_org ON call_classifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_classifications_call_log ON call_classifications(call_log_id);

-- =====================================================
-- Follow-ups
-- =====================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  notes TEXT,
  owner TEXT,
  due_at TIMESTAMPTZ,
  callback_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_org ON follow_ups(organization_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_at ON follow_ups(due_at);

-- =====================================================
-- Transfers
-- =====================================================
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  requested BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  target_name TEXT,
  target_phone TEXT,
  reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transfers_org ON transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_transfers_call_log ON transfers(call_log_id);

-- =====================================================
-- Notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  follow_up_id UUID REFERENCES follow_ups(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- =====================================================
-- Organization voice settings (sellable SaaS)
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_voice_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  welcome_message TEXT,
  transfer_target_name TEXT DEFAULT 'Ramon',
  transfer_target_phone TEXT,
  business_hours JSONB DEFAULT '{}',
  escalation_policy JSONB DEFAULT '{}',
  spam_threshold INTEGER NOT NULL DEFAULT 70,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Timestamps trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column_voice_platform()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();

DROP TRIGGER IF EXISTS update_price_catalog_updated_at ON price_catalog;
CREATE TRIGGER update_price_catalog_updated_at
BEFORE UPDATE ON price_catalog
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();

DROP TRIGGER IF EXISTS update_work_orders_updated_at ON work_orders;
CREATE TRIGGER update_work_orders_updated_at
BEFORE UPDATE ON work_orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();

DROP TRIGGER IF EXISTS update_call_logs_updated_at ON call_logs;
CREATE TRIGGER update_call_logs_updated_at
BEFORE UPDATE ON call_logs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();

DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
BEFORE UPDATE ON follow_ups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_voice_platform();
