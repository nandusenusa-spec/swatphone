-- Industry CRM templates (multi-tenant). Idempotent where possible.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  business_name TEXT,
  industry_key TEXT NOT NULL DEFAULT 'general',
  industry_label TEXT,
  timezone TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.crm_templates (id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, field_key)
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.crm_templates (id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, stage_key)
);

CREATE TABLE IF NOT EXISTS public.assistant_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.crm_templates (id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL DEFAULT 'default',
  prompt_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, prompt_key, language)
);

CREATE TABLE IF NOT EXISTS public.dashboard_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.crm_templates (id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_organization_id ON public.business_profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_industry_key ON public.business_profiles (industry_key);
CREATE INDEX IF NOT EXISTS idx_crm_templates_industry_key ON public.crm_templates (industry_key);
CREATE INDEX IF NOT EXISTS idx_custom_fields_template_id ON public.custom_fields (template_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_template_id ON public.pipeline_stages (template_id);
CREATE INDEX IF NOT EXISTS idx_assistant_prompts_template_id ON public.assistant_prompts (template_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_modules_template_id ON public.dashboard_modules (template_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_crm_templates_updated_at ON public.crm_templates;
CREATE TRIGGER update_crm_templates_updated_at
BEFORE UPDATE ON public.crm_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER update_business_profiles_updated_at
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_assistant_prompts_updated_at ON public.assistant_prompts;
CREATE TRIGGER update_assistant_prompts_updated_at
BEFORE UPDATE ON public.assistant_prompts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_profiles_select_tenant ON public.business_profiles;
CREATE POLICY business_profiles_select_tenant ON public.business_profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS business_profiles_insert_tenant ON public.business_profiles;
CREATE POLICY business_profiles_insert_tenant ON public.business_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS business_profiles_update_tenant ON public.business_profiles;
CREATE POLICY business_profiles_update_tenant ON public.business_profiles
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS crm_templates_select_authenticated ON public.crm_templates;
CREATE POLICY crm_templates_select_authenticated ON public.crm_templates
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS custom_fields_select_authenticated ON public.custom_fields;
CREATE POLICY custom_fields_select_authenticated ON public.custom_fields
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS pipeline_stages_select_authenticated ON public.pipeline_stages;
CREATE POLICY pipeline_stages_select_authenticated ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS assistant_prompts_select_authenticated ON public.assistant_prompts;
CREATE POLICY assistant_prompts_select_authenticated ON public.assistant_prompts
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS dashboard_modules_select_authenticated ON public.dashboard_modules;
CREATE POLICY dashboard_modules_select_authenticated ON public.dashboard_modules
  FOR SELECT TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Seed templates (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.crm_templates (industry_key, name, description, is_active)
VALUES
  ('general', 'General', 'CRM genérico para cualquier negocio', TRUE),
  ('print_shop', 'Imprenta', 'Pedidos, cotizaciones y producción de imprenta', TRUE),
  ('restaurant', 'Restaurante', 'Reservas y eventos', TRUE),
  ('dental', 'Consultorio dental', 'Citas y pacientes', TRUE),
  ('psychologist', 'Psicología / salud mental', 'Consultas y seguimiento', TRUE)
ON CONFLICT (industry_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Assistant prompts (es)
INSERT INTO public.assistant_prompts (template_id, prompt_key, prompt_text, language)
SELECT t.id, 'default', p.prompt_text, 'es'
FROM public.crm_templates t
JOIN (
  VALUES
    ('general', 'Negocio de servicios general. Capturá nombre, teléfono, motivo de contacto y próximo paso. Ofrecé seguimiento si no hay disponibilidad inmediata.'),
    ('print_shop', 'Imprenta: ayudá con cotizaciones de impresión (producto, cantidad, tamaño, papel, acabado, plazo). Confirmá si tienen archivo de diseño y método de entrega o retiro.'),
    ('restaurant', 'Restaurante: gestioná reservas y eventos. Confirmá fecha, hora, cantidad de personas, ocasión y restricciones alimentarias.'),
    ('dental', 'Consultorio dental: agenda y triage básico. Preguntá servicio, seguro, fecha preferida, nivel de dolor y si es paciente nuevo.'),
    ('psychologist', 'Consultorio de salud mental: agenda con tacto. Preguntá tipo de consulta, fecha preferida, seguro y si es paciente nuevo; no des consejo clínico por teléfono.')
) AS p(industry_key, prompt_text) ON t.industry_key = p.industry_key
ON CONFLICT (template_id, prompt_key, language) DO UPDATE SET
  prompt_text = EXCLUDED.prompt_text,
  updated_at = NOW();

-- Pipeline stages (shared keys per template)
INSERT INTO public.pipeline_stages (template_id, stage_key, label, sort_order, is_default, is_closed)
SELECT t.id, s.stage_key, s.label, s.sort_order, s.is_default, s.is_closed
FROM public.crm_templates t
CROSS JOIN (
  VALUES
    ('new', 'Nuevo', 10, TRUE, FALSE),
    ('contacted', 'Contactado', 20, FALSE, FALSE),
    ('qualified', 'Calificado', 30, FALSE, FALSE),
    ('won', 'Ganado', 90, FALSE, TRUE),
    ('lost', 'Perdido', 100, FALSE, TRUE)
) AS s(stage_key, label, sort_order, is_default, is_closed)
ON CONFLICT (template_id, stage_key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default,
  is_closed = EXCLUDED.is_closed;

-- Dashboard modules
INSERT INTO public.dashboard_modules (template_id, module_key, label, is_enabled, sort_order)
SELECT t.id, m.module_key, m.label, m.is_enabled, m.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('general', 'leads', 'Leads', TRUE, 10),
    ('general', 'calls', 'Llamadas', TRUE, 20),
    ('general', 'team', 'Equipo', TRUE, 30),
    ('general', 'follow_ups', 'Seguimientos', TRUE, 40),
    ('print_shop', 'leads', 'Leads', TRUE, 10),
    ('print_shop', 'calls', 'Llamadas', TRUE, 20),
    ('print_shop', 'products', 'Productos', TRUE, 30),
    ('print_shop', 'team', 'Equipo', TRUE, 40),
    ('print_shop', 'follow_ups', 'Seguimientos', TRUE, 50),
    ('restaurant', 'leads', 'Leads', TRUE, 10),
    ('restaurant', 'calls', 'Llamadas', TRUE, 20),
    ('restaurant', 'appointments', 'Reservas', TRUE, 30),
    ('restaurant', 'team', 'Equipo', TRUE, 40),
    ('dental', 'leads', 'Leads', TRUE, 10),
    ('dental', 'calls', 'Llamadas', TRUE, 20),
    ('dental', 'appointments', 'Citas', TRUE, 30),
    ('dental', 'team', 'Equipo', TRUE, 40),
    ('psychologist', 'leads', 'Leads', TRUE, 10),
    ('psychologist', 'calls', 'Llamadas', TRUE, 20),
    ('psychologist', 'appointments', 'Citas', TRUE, 30),
    ('psychologist', 'follow_ups', 'Seguimientos', TRUE, 40)
) AS m(industry_key, module_key, label, is_enabled, sort_order) ON t.industry_key = m.industry_key
ON CONFLICT (template_id, module_key) DO UPDATE SET
  label = EXCLUDED.label,
  is_enabled = EXCLUDED.is_enabled,
  sort_order = EXCLUDED.sort_order;

-- Custom fields: general
INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('general', 'contact_reason', 'Motivo de contacto', 'text', 10),
    ('general', 'next_step', 'Próximo paso', 'text', 20)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

-- print_shop
INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('print_shop', 'product_type', 'Tipo de producto', 'text', 10),
    ('print_shop', 'quantity', 'Cantidad', 'number', 20),
    ('print_shop', 'size', 'Tamaño', 'text', 30),
    ('print_shop', 'paper_type', 'Tipo de papel', 'text', 40),
    ('print_shop', 'finish', 'Acabado', 'text', 50),
    ('print_shop', 'deadline', 'Fecha límite', 'date', 60),
    ('print_shop', 'has_design_file', 'Tiene archivo de diseño', 'boolean', 70),
    ('print_shop', 'delivery_method', 'Método de entrega', 'text', 80)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

-- restaurant
INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('restaurant', 'event_date', 'Fecha del evento', 'date', 10),
    ('restaurant', 'party_size', 'Cantidad de personas', 'number', 20),
    ('restaurant', 'reservation_time', 'Hora de reserva', 'text', 30),
    ('restaurant', 'occasion', 'Ocasión', 'text', 40),
    ('restaurant', 'dietary_notes', 'Notas dietéticas', 'text', 50)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

-- dental
INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('dental', 'service_needed', 'Servicio requerido', 'text', 10),
    ('dental', 'insurance_provider', 'Seguro médico', 'text', 20),
    ('dental', 'preferred_date', 'Fecha preferida', 'date', 30),
    ('dental', 'pain_level', 'Nivel de dolor', 'text', 40),
    ('dental', 'new_patient', 'Paciente nuevo', 'boolean', 50)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

-- psychologist
INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('psychologist', 'service_needed', 'Servicio requerido', 'text', 10),
    ('psychologist', 'preferred_date', 'Fecha preferida', 'date', 20),
    ('psychologist', 'insurance_provider', 'Seguro', 'text', 30),
    ('psychologist', 'new_patient', 'Paciente nuevo', 'boolean', 40),
    ('psychologist', 'appointment_type', 'Tipo de cita', 'text', 50)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';
