-- MVP Print Bot schema (48h scope)
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- Trabajos (print jobs)
-- =========================
CREATE TABLE IF NOT EXISTS trabajos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  numero_trabajo TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  empresa TEXT,
  estado TEXT NOT NULL DEFAULT 'recibido',
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  fecha_entrega_estimada TIMESTAMPTZ,
  fecha_entrega_confirmada TIMESTAMPTZ,
  observaciones TEXT,
  responsable TEXT,
  ultimo_update TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trabajos_numero ON trabajos(numero_trabajo);
CREATE INDEX IF NOT EXISTS idx_trabajos_telefono ON trabajos(telefono);
CREATE INDEX IF NOT EXISTS idx_trabajos_org ON trabajos(organization_id);

-- If multi-tenant, avoid duplicates per organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trabajos_org_numero_unique'
  ) THEN
    ALTER TABLE trabajos
      ADD CONSTRAINT trabajos_org_numero_unique
      UNIQUE (organization_id, numero_trabajo);
  END IF;
END $$;

-- =========================
-- Recados
-- =========================
CREATE TABLE IF NOT EXISTS recados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  fecha_hora TIMESTAMPTZ DEFAULT NOW(),
  nombre TEXT,
  telefono TEXT NOT NULL,
  empresa TEXT,
  destinatario TEXT,
  sector TEXT,
  mensaje TEXT NOT NULL,
  urgencia TEXT DEFAULT 'normal' CHECK (urgencia IN ('baja', 'normal', 'alta')),
  estado_recado TEXT DEFAULT 'nuevo' CHECK (estado_recado IN ('nuevo', 'en_proceso', 'resuelto')),
  origen_llamada TEXT DEFAULT 'twilio',
  audio_url TEXT,
  callback_required BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_recados_fecha ON recados(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_recados_telefono ON recados(telefono);
CREATE INDEX IF NOT EXISTS idx_recados_org ON recados(organization_id);

-- =========================
-- Calls table compatibility fields for MVP endpoint /llamadas
-- =========================
ALTER TABLE calls ADD COLUMN IF NOT EXISTS telefono_entrante TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS nombre_detectado TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS trabajo_encontrado BOOLEAN;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recado_generado BOOLEAN;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transferido_a TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcripcion TEXT;
