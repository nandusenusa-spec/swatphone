-- Ensure calls table has all required columns for Vapi integration
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_call_id TEXT UNIQUE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index on vapi_call_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);

-- Ensure leads table has required fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_reasons TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';

-- Create index on phone + org_id for lead lookups
CREATE INDEX IF NOT EXISTS idx_leads_phone_org ON leads(organization_id, phone);

-- Ensure organizations table has Vapi fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_api_key TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_phone_number TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_webhook_url TEXT;

-- Create index on vapi_assistant_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_orgs_vapi_assistant ON organizations(vapi_assistant_id);

-- Add call recording status tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_processed BOOLEAN DEFAULT false;

-- Ensure proper RLS policies for calls table
DROP POLICY IF EXISTS "users_can_read_own_calls" ON calls;
CREATE POLICY "users_can_read_own_calls" ON calls FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "users_can_insert_calls" ON calls;
CREATE POLICY "users_can_insert_calls" ON calls FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Service role full access
DROP POLICY IF EXISTS "service_role_calls" ON calls;
CREATE POLICY "service_role_calls" ON calls FOR ALL TO service_role USING (true);

-- Ensure proper RLS policies for leads table
DROP POLICY IF EXISTS "users_can_read_own_leads" ON leads;
CREATE POLICY "users_can_read_own_leads" ON leads FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "users_can_insert_leads" ON leads;
CREATE POLICY "users_can_insert_leads" ON leads FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "users_can_update_own_leads" ON leads;
CREATE POLICY "users_can_update_own_leads" ON leads FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Service role full access
DROP POLICY IF EXISTS "service_role_leads" ON leads;
CREATE POLICY "service_role_leads" ON leads FOR ALL TO service_role USING (true);
