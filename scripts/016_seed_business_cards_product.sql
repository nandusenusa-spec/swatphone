-- Idempotente: tarjetas / business cards para org de voz (cotización voz + price lookup).
-- organization_id: producción conocida (SWAT); ajustar si otra org usa el mismo assistant.

INSERT INTO products (organization_id, name, description, price, currency, category, is_active)
SELECT
  '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid,
  'Tarjetas de presentación (Business cards)',
  'Incluye búsquedas por "business cards", "BC", "500 business cards", "tarjetas personales". Precio referencial: confirmar con equipo según cantidad, papel y terminación.',
  NULL,
  'USD',
  'Impresión',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM products p
  WHERE p.organization_id = '9bb50e58-9ba6-4d54-8171-13922749f570'::uuid
    AND p.is_active = true
    AND (
      lower(p.name) LIKE '%business card%'
      OR lower(p.name) LIKE '%tarjeta%present%'
    )
);
