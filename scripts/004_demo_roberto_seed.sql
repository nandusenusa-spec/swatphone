-- Optional: datos de prueba para checklist demo (después de 003_clients_and_jobs.sql).
-- 1) Sustituye la UUID de organizations.id en la línea INSERT (mismo org que ?org= en el webhook).
-- 2) Ajusta el teléfono si tu prueba usa otro número; formato típico Vapi: +1XXXXXXXXXX (E.164).

BEGIN;

INSERT INTO clients (organization_id, name, phone, company, updated_at)
VALUES (
  'REPLACE_WITH_ORGANIZATION_UUID'::uuid,
  'Roberto',
  '+17865551234',
  'Test Company',
  NOW()
)
ON CONFLICT (phone) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  organization_id = EXCLUDED.organization_id,
  updated_at = NOW();

UPDATE jobs SET is_active = false, updated_at = NOW()
WHERE client_id = (SELECT id FROM clients WHERE phone = '+17865551234');

INSERT INTO jobs (
  client_id,
  title,
  status,
  estimated_ready_at,
  pickup_instructions,
  customer_message,
  is_active,
  updated_at
)
SELECT
  id,
  'Business cards',
  'ready_for_pickup',
  NOW() + INTERVAL '7 days',
  'Puede recogerlas en la oficina principal.',
  'Roberto, tus business cards están listas para recoger el lunes a las 3 de la tarde.',
  true,
  NOW()
FROM clients
WHERE phone = '+17865551234';

COMMIT;
