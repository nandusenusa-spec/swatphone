-- Print-shop end customers (callers) and their jobs / orders
-- Run after 001-create-tables.sql

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT clients_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_clients_organization ON clients(organization_id);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN (
      'received',
      'in_progress',
      'waiting_for_approval',
      'ready_for_pickup',
      'completed',
      'cancelled'
    )
  ),
  estimated_ready_at TIMESTAMPTZ,
  pickup_instructions TEXT,
  customer_message TEXT,
  internal_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_active_created ON jobs(client_id, is_active, created_at DESC);
