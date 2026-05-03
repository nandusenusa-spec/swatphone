-- Vapi E2E demo seed: 1 org + runtime config + horarios lun–sáb + catálogo + clientes + órdenes + citas
-- Ejecutar después de scripts 001, 006, 007 (idempotente: ALTER + upserts).

-- ---------------------------------------------------------------------------
-- Alinear columnas usadas por lib/vapi/runtime-config.ts sobre el esquema 007/006
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE organization_ai_config
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS fallback_message TEXT,
  ADD COLUMN IF NOT EXISTS max_failed_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS voice_style TEXT,
  ADD COLUMN IF NOT EXISTS allowed_tools JSONB,
  ADD COLUMN IF NOT EXISTS spam_policy JSONB,
  ADD COLUMN IF NOT EXISTS extraction_schema_version TEXT;

ALTER TABLE organization_routing
  ADD COLUMN IF NOT EXISTS default_transfer_number TEXT,
  ADD COLUMN IF NOT EXISTS ramon_transfer_number TEXT,
  ADD COLUMN IF NOT EXISTS urgent_transfer_number TEXT,
  ADD COLUMN IF NOT EXISTS after_hours_behavior TEXT,
  ADD COLUMN IF NOT EXISTS callback_default_owner TEXT,
  ADD COLUMN IF NOT EXISTS allow_live_transfer BOOLEAN DEFAULT true;

ALTER TABLE organization_catalog
  ADD COLUMN IF NOT EXISTS service_code TEXT,
  ADD COLUMN IF NOT EXISTS public_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS price_type TEXT,
  ADD COLUMN IF NOT EXISTS estimated_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE organization_business_hours
  ADD COLUMN IF NOT EXISTS opens_at TEXT,
  ADD COLUMN IF NOT EXISTS closes_at TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS confirmed_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS promised_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- ---------------------------------------------------------------------------
-- Organización demo (UUID fija para pruebas y URLs ?organization_id=)
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, slug, timezone, active) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Vapi E2E Demo',
  'vapi-e2e-demo',
  'America/New_York',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  timezone = COALESCE(EXCLUDED.timezone, organizations.timezone),
  active = COALESCE(EXCLUDED.active, organizations.active);

-- ---------------------------------------------------------------------------
-- organization_ai_config (1 fila)
-- ---------------------------------------------------------------------------
INSERT INTO organization_ai_config (
  organization_id,
  system_prompt,
  welcome_message,
  fallback_message,
  max_failed_attempts,
  voice_style,
  allowed_tools,
  spam_policy,
  extraction_schema_version
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Asistente telefónico multi-tenant. Identificá intención: estado de trabajo, precio, cita, nueva orden, transferencia. No inventes datos; usá herramientas. Tras 2 intentos fallidos, ofrecé callback o marcá según política.',
  'Hola, ¿en qué te puedo ayudar? Estado de un trabajo, precio, cita u operador.',
  'No pude completar tu consulta. Dejamos tus datos y te contactamos.',
  2,
  'professional',
  '["find_customer","get_job_status","create_appointment","create_work_order","get_price_quote","transfer_to_ramon","save_call_outcome","mark_spam_call","create_follow_up"]'::jsonb,
  '{"threshold":70,"max_silence_seconds":8,"reject_after_failed_validations":2,"require_minimum_context":true}'::jsonb,
  'v1'
)
ON CONFLICT (organization_id) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  welcome_message = EXCLUDED.welcome_message,
  fallback_message = EXCLUDED.fallback_message,
  max_failed_attempts = EXCLUDED.max_failed_attempts,
  voice_style = EXCLUDED.voice_style,
  allowed_tools = EXCLUDED.allowed_tools,
  spam_policy = EXCLUDED.spam_policy,
  extraction_schema_version = EXCLUDED.extraction_schema_version;

-- ---------------------------------------------------------------------------
-- organization_routing (1 fila)
-- ---------------------------------------------------------------------------
INSERT INTO organization_routing (
  organization_id,
  default_transfer_number,
  ramon_transfer_number,
  urgent_transfer_number,
  after_hours_behavior,
  callback_default_owner,
  allow_live_transfer
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '+18135550100',
  '+18135550101',
  '+18135550102',
  'callback_only',
  'Ramon',
  true
)
ON CONFLICT (organization_id) DO UPDATE SET
  default_transfer_number = EXCLUDED.default_transfer_number,
  ramon_transfer_number = EXCLUDED.ramon_transfer_number,
  urgent_transfer_number = EXCLUDED.urgent_transfer_number,
  after_hours_behavior = EXCLUDED.after_hours_behavior,
  callback_default_owner = EXCLUDED.callback_default_owner,
  allow_live_transfer = EXCLUDED.allow_live_transfer;

-- ---------------------------------------------------------------------------
-- Horarios: lunes–sábado abierto; domingo (0) cerrado
-- ---------------------------------------------------------------------------
DELETE FROM organization_business_hours
WHERE organization_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO organization_business_hours (
  organization_id, day_of_week, opens_at, closes_at, active, is_open, open_time, close_time
) VALUES
  ('11111111-1111-1111-1111-111111111111', 1, '09:00', '18:00', true, true, '09:00', '18:00'),
  ('11111111-1111-1111-1111-111111111111', 2, '09:00', '18:00', true, true, '09:00', '18:00'),
  ('11111111-1111-1111-1111-111111111111', 3, '09:00', '18:00', true, true, '09:00', '18:00'),
  ('11111111-1111-1111-1111-111111111111', 4, '09:00', '18:00', true, true, '09:00', '18:00'),
  ('11111111-1111-1111-1111-111111111111', 5, '09:00', '18:00', true, true, '09:00', '18:00'),
  ('11111111-1111-1111-1111-111111111111', 6, '10:00', '14:00', true, true, '10:00', '14:00'),
  ('11111111-1111-1111-1111-111111111111', 0, NULL, NULL, false, false, NULL, NULL);

-- ---------------------------------------------------------------------------
-- organization_catalog: 4 servicios (activos)
-- ---------------------------------------------------------------------------
INSERT INTO organization_catalog (
  organization_id, service_code, service_name, description,
  price, public_price, currency, price_type, estimated_only, is_active, active
)
SELECT v.organization_id, v.service_code, v.service_name, v.description,
  v.public_price, v.public_price, v.currency, v.price_type, v.estimated_only, true, true
FROM (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'PRINT_STD', 'Impresión estándar', 'Plazo estándar', 25.00::numeric, 'USD', 'fixed', false),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'PRINT_EXP', 'Impresión urgente', 'Prioridad', 45.00::numeric, 'USD', 'fixed', false),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'REPAIR_DIAG', 'Diagnóstico técnico', 'Evaluación', 35.00::numeric, 'USD', 'fixed', false),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'CUSTOM_JOB', 'Trabajo personalizado', 'Solo cotización', 0.00::numeric, 'USD', 'estimate', true)
) AS v(organization_id, service_code, service_name, description, public_price, currency, price_type, estimated_only)
WHERE NOT EXISTS (
  SELECT 1 FROM organization_catalog c
  WHERE c.organization_id = v.organization_id
    AND c.service_code IS NOT DISTINCT FROM v.service_code
);

-- price_catalog: mismo catálogo para get_price_quote (voice-platform)
INSERT INTO price_catalog (
  organization_id, service_code, service_name, description, currency, unit_price, is_active
)
SELECT v.organization_id, v.service_code, v.service_name, v.description, v.currency, v.unit_price, true
FROM (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'PRINT_STD', 'Impresión estándar', 'Plazo estándar', 'USD', 25.00::numeric),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'PRINT_EXP', 'Impresión urgente', 'Prioridad', 'USD', 45.00::numeric),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'REPAIR_DIAG', 'Diagnóstico técnico', 'Evaluación', 'USD', 35.00::numeric),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'CUSTOM_JOB', 'Trabajo personalizado', 'Cotización', 'USD', 0.00::numeric)
) AS v(organization_id, service_code, service_name, description, currency, unit_price)
WHERE NOT EXISTS (
  SELECT 1 FROM price_catalog p
  WHERE p.organization_id = v.organization_id
    AND p.service_code IS NOT DISTINCT FROM v.service_code
);

-- ---------------------------------------------------------------------------
-- 3 clientes
-- ---------------------------------------------------------------------------
INSERT INTO customers (id, organization_id, name, phone, email, address, notes) VALUES
  ('22222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Juan Perez', '+18135551001', 'juan@example.com', 'Tampa, FL', 'Demo'),
  ('22222222-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Maria Gomez', '+18135551002', 'maria@example.com', 'Tampa, FL', NULL),
  ('22222222-3333-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Carlos Ruiz', '+18135551003', 'carlos@example.com', 'Tampa, FL', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3 work_orders: estados distintos
-- ---------------------------------------------------------------------------
INSERT INTO work_orders (
  id, organization_id, customer_id, work_order_number, title, issue_description, status,
  quoted_price, confirmed_price, estimated_delivery_at, promised_date,
  completed_at, pickup_ready_at, notes
) VALUES
  (
    '33333333-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '22222222-1111-1111-1111-111111111111',
    'WO-1001', 'Impresión estándar', 'Flyers', 'in_progress',
    25.00, 25.00, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days',
    NULL, NULL, 'En producción'
  ),
  (
    '33333333-2222-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'WO-1002', 'Diagnóstico técnico', 'No enciende', 'pickup_ready',
    35.00, 35.00, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day',
    NOW(), NOW(), 'Listo para retirar'
  ),
  (
    '33333333-3333-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '22222222-3333-1111-1111-111111111111',
    'WO-1003', 'Trabajo personalizado', 'Cotización', 'pending_quote',
    NULL, NULL, NULL, NULL, NULL, NULL, 'Esperando aprobación'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2 appointments
-- ---------------------------------------------------------------------------
INSERT INTO appointments (
  id, organization_id, customer_id, appointment_at, status,
  assigned_to, source, notes, created_by
) VALUES
  (
    '44444444-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '22222222-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '1 day') + INTERVAL '11 hours',
    'scheduled', 'Ramon', 'vapi_e2e', 'Seguimiento', 'vapi_e2e'
  ),
  (
    '44444444-2222-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '2 days') + INTERVAL '15 hours 30 minutes',
    'scheduled', 'Ramon', 'vapi_e2e', 'Retiro', 'vapi_e2e'
  )
ON CONFLICT (id) DO NOTHING;
