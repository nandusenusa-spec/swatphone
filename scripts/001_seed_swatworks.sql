-- ============================================================================
-- 001_seed_swatworks.sql
-- Datos iniciales para organización SWATWORKS (compatible con get_price_quote BC).
-- Ejecutar DESPUÉS de scripts/000_rebuild_supabase_schema.sql
--
-- organization_id fijo (Vapi / env):
--   9bb50e58-9ba6-4d54-8171-13922749f570
--
-- Teléfonos en transfer_destinations / team_members son PLACEHOLDER (+1305555xxxx).
-- Sustituí por E.164 reales en Admin → Equipo.
--
-- Login super-admin web: usuario swat_admin / ChangeMeAfterFirstLogin!
--   (rotá la clave inmediatamente vía Admin o actualizando password_hash).
-- ============================================================================

BEGIN;

INSERT INTO public.organizations (id, name, slug, timezone, active)
VALUES (
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  'SWATWORKS',
  'swatworks',
  'America/New_York',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  timezone = COALESCE(EXCLUDED.timezone, organizations.timezone),
  active = COALESCE(EXCLUDED.active, organizations.active);

INSERT INTO public.organization_ai_config (
  organization_id,
  system_prompt,
  welcome_message,
  fallback_message,
  max_failed_attempts,
  allowed_tools,
  spam_policy,
  extraction_schema_version,
  voice_id,
  voice_provider
) VALUES (
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  'Asistente telefónico comercial. Usá las herramientas para precios, estado de pedido, citas y transferencias. No inventes datos.',
  'Hola, gracias por llamar a SWATWORKS. ¿En qué puedo ayudarte?',
  'Te tomo los datos para que el equipo te contacte.',
  2,
  '[
    "find_customer",
    "get_job_status",
    "create_appointment",
    "create_work_order",
    "get_price_quote",
    "prepare_warm_transfer",
    "transfer_to_ramon",
    "save_call_outcome",
    "mark_spam_call",
    "create_follow_up"
  ]'::jsonb,
  '{"threshold":70,"max_silence_seconds":8,"reject_after_failed_validations":2}'::jsonb,
  'v1',
  NULL,
  NULL
)
ON CONFLICT (organization_id) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  welcome_message = EXCLUDED.welcome_message,
  fallback_message = EXCLUDED.fallback_message,
  max_failed_attempts = EXCLUDED.max_failed_attempts,
  allowed_tools = EXCLUDED.allowed_tools,
  spam_policy = EXCLUDED.spam_policy,
  extraction_schema_version = EXCLUDED.extraction_schema_version,
  updated_at = NOW();

INSERT INTO public.organization_routing (
  organization_id,
  default_transfer_number,
  ramon_transfer_number,
  urgent_transfer_number,
  callback_default_owner,
  allow_live_transfer,
  transfer_destinations,
  after_hours_behavior
) VALUES (
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  '+13055550100',
  '+13055550100',
  '+13055550100',
  'Ramon',
  TRUE,
  jsonb_build_array(
    jsonb_build_object('extension', '90', 'name', 'Diseño', 'phone_e164', '+13055550190'),
    jsonb_build_object('extension', '105', 'name', 'Fernando Sardo — diseño gráfico', 'phone_e164', '+13055550105'),
    jsonb_build_object('extension', '91', 'name', 'Administración', 'phone_e164', '+13055550191'),
    jsonb_build_object('extension', '100', 'name', 'Ramon', 'phone_e164', '+13055550100'),
    jsonb_build_object('extension', '106', 'name', 'Rafael — Producción', 'phone_e164', '+13055550106'),
    jsonb_build_object('extension', '107', 'name', 'Leandro — CNC', 'phone_e164', '+13055550107')
  ),
  'callback_only'
)
ON CONFLICT (organization_id) DO UPDATE SET
  default_transfer_number = EXCLUDED.default_transfer_number,
  ramon_transfer_number = EXCLUDED.ramon_transfer_number,
  urgent_transfer_number = EXCLUDED.urgent_transfer_number,
  callback_default_owner = EXCLUDED.callback_default_owner,
  allow_live_transfer = EXCLUDED.allow_live_transfer,
  transfer_destinations = EXCLUDED.transfer_destinations,
  after_hours_behavior = EXCLUDED.after_hours_behavior,
  updated_at = NOW();

DELETE FROM public.organization_business_hours
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid;

INSERT INTO public.organization_business_hours (
  organization_id, day_of_week, is_open, opens_at, closes_at, active, open_time, close_time
) VALUES
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 1, TRUE, TIME '09:00', TIME '18:00', TRUE, '09:00', '18:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 2, TRUE, TIME '09:00', TIME '18:00', TRUE, '09:00', '18:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 3, TRUE, TIME '09:00', TIME '18:00', TRUE, '09:00', '18:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 4, TRUE, TIME '09:00', TIME '18:00', TRUE, '09:00', '18:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 5, TRUE, TIME '09:00', TIME '18:00', TRUE, '09:00', '18:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 6, TRUE, TIME '10:00', TIME '14:00', TRUE, '10:00', '14:00'),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 0, FALSE, NULL, NULL, FALSE, NULL, NULL);

DELETE FROM public.assistant_configs
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid;

INSERT INTO public.assistant_configs (
  organization_id,
  name,
  is_active,
  language,
  greeting_message,
  first_message
) VALUES (
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  'SWATWORKS Voice',
  TRUE,
  'es',
  'Hola, gracias por llamar a SWATWORKS. ¿En qué puedo ayudarte?',
  'Hola, gracias por llamar a SWATWORKS. ¿En qué puedo ayudarte?'
);

DELETE FROM public.team_members WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid;

INSERT INTO public.team_members (organization_id, name, phone, extension, department, role, is_available) VALUES
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Diseño', '+13055550190', '90', 'Diseño', 'department', TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Fernando Sardo', '+13055550105', '105', 'Diseño gráfico', 'designer', TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Administración', '+13055550191', '91', 'Administración', 'admin', TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Ramon', '+13055550100', '100', 'General', 'owner', TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Rafael — Producción', '+13055550106', '106', 'Producción', 'production', TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'Leandro — CNC', '+13055550107', '107', 'CNC', 'cnc', TRUE);

DELETE FROM public.products
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid
  AND name IN ('Business Cards - 500', 'Business Cards - 1000');

INSERT INTO public.products (organization_id, name, description, price, currency, is_active, active) VALUES
  (
    '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
    'Business Cards - 500',
    '500 standard business cards, 16pt cardstock, full color both sides',
    90.00,
    'USD',
    TRUE,
    TRUE
  ),
  (
    '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
    'Business Cards - 1000',
    '1000 standard business cards, 16pt cardstock, full color both sides',
    100.00,
    'USD',
    TRUE,
    TRUE
  );

DELETE FROM public.faqs
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid
  AND question IN (
    'Do you offer rush services?',
    '¿Ofrecen servicio urgente / rush?'
  );

INSERT INTO public.faqs (organization_id, question, answer, is_active) VALUES
  (
    '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
    'Do you offer rush services?',
    'Yes. We offer rush production when schedule allows; turnaround and fees depend on the job. Tell us your deadline and we’ll confirm availability and pricing.',
    TRUE
  ),
  (
    '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
    '¿Ofrecen servicio urgente / rush?',
    'Sí. Cuando el calendario lo permite hacemos trabajos urgentes; plazo y costo dependen del pedido. Decinos tu fecha límite y confirmamos disponibilidad y precio.',
    TRUE
  );

DELETE FROM public.price_catalog
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid
  AND service_code IN ('BC_500', 'BC_1000');

INSERT INTO public.price_catalog (organization_id, service_code, service_name, description, currency, unit_price, is_active) VALUES
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'BC_500', 'Business Cards - 500', 'Catálogo estándar', 'USD', 90.00, TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'BC_1000', 'Business Cards - 1000', 'Catálogo estándar', 'USD', 100.00, TRUE);

DELETE FROM public.organization_catalog
WHERE organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid
  AND service_code IN ('BC_500', 'BC_1000');

INSERT INTO public.organization_catalog (
  organization_id, service_code, service_name, description, price, public_price, currency, is_active, active
) VALUES
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'BC_500', 'Business Cards - 500', 'Tarjetas estándar', 90.00, 90.00, 'USD', TRUE, TRUE),
  ('9bb50e58-9ba6-4d54-8171-13922749f570'::uuid, 'BC_1000', 'Business Cards - 1000', 'Tarjetas estándar', 100.00, 100.00, 'USD', TRUE, TRUE);

INSERT INTO public.admin_credentials (username, email, password_hash, is_active)
VALUES (
  'swat_admin',
  'admin@swatworks.local',
  crypt('ChangeMeAfterFirstLogin!', gen_salt('bf')),
  TRUE
)
ON CONFLICT (username) DO NOTHING;

COMMIT;
