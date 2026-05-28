-- Venue / event space CRM template (additive; does not change existing tenants)

INSERT INTO public.crm_templates (industry_key, name, description, is_active)
VALUES (
  'venue',
  'Venue / salón de eventos',
  'Tours, disponibilidad, cotizaciones y reservas para espacios para eventos',
  TRUE
)
ON CONFLICT (industry_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO public.assistant_prompts (template_id, prompt_key, prompt_text, language)
SELECT t.id,
  'default',
  'Salón o venue para eventos: respondé con calidez sobre tours del espacio, disponibilidad de fechas, capacidad máxima, paquetes (boda, corporativo, social), catering, estacionamiento y reglas (ruido, horarios). Capturá tipo de evento, fecha tentativa, cantidad de invitados, presupuesto aproximado y si quieren visita presencial. Ofrecé enviar brochure o agendar tour; transferí a un coordinador si piden negociar contrato o visita urgente.',
  'es'
FROM public.crm_templates t
WHERE t.industry_key = 'venue'
ON CONFLICT (template_id, prompt_key, language) DO UPDATE SET
  prompt_text = EXCLUDED.prompt_text,
  updated_at = NOW();

INSERT INTO public.pipeline_stages (template_id, stage_key, label, sort_order, is_default, is_closed)
SELECT t.id, s.stage_key, s.label, s.sort_order, s.is_default, s.is_closed
FROM public.crm_templates t
CROSS JOIN (
  VALUES
    ('new', 'Consulta nueva', 10, TRUE, FALSE),
    ('tour_scheduled', 'Tour agendado', 20, FALSE, FALSE),
    ('proposal_sent', 'Propuesta enviada', 30, FALSE, FALSE),
    ('deposit', 'Seña / reserva', 40, FALSE, FALSE),
    ('won', 'Evento confirmado', 90, FALSE, TRUE),
    ('lost', 'No concretó', 100, FALSE, TRUE)
) AS s(stage_key, label, sort_order, is_default, is_closed)
WHERE t.industry_key = 'venue'
ON CONFLICT (template_id, stage_key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default,
  is_closed = EXCLUDED.is_closed;

INSERT INTO public.dashboard_modules (template_id, module_key, label, is_enabled, sort_order)
SELECT t.id, m.module_key, m.label, m.is_enabled, m.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('venue', 'leads', 'Leads', TRUE, 10),
    ('venue', 'calls', 'Llamadas', TRUE, 20),
    ('venue', 'appointments', 'Tours y visitas', TRUE, 30),
    ('venue', 'team', 'Equipo', TRUE, 40),
    ('venue', 'follow_ups', 'Seguimientos', TRUE, 50)
) AS m(industry_key, module_key, label, is_enabled, sort_order) ON t.industry_key = m.industry_key
ON CONFLICT (template_id, module_key) DO UPDATE SET
  label = EXCLUDED.label,
  is_enabled = EXCLUDED.is_enabled,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.custom_fields (template_id, field_key, label, field_type, sort_order)
SELECT t.id, f.field_key, f.label, f.field_type, f.sort_order
FROM public.crm_templates t
JOIN (
  VALUES
    ('venue', 'event_type', 'Tipo de evento', 'text', 10),
    ('venue', 'event_date', 'Fecha del evento', 'date', 20),
    ('venue', 'guest_count', 'Cantidad de invitados', 'number', 30),
    ('venue', 'space_preference', 'Espacio / salón', 'text', 40),
    ('venue', 'budget_range', 'Presupuesto aproximado', 'text', 50),
    ('venue', 'catering_needed', 'Requiere catering', 'boolean', 60),
    ('venue', 'tour_requested', 'Quiere tour / visita', 'boolean', 70),
    ('venue', 'preferred_contact_time', 'Mejor horario de contacto', 'text', 80)
) AS f(industry_key, field_key, label, field_type, sort_order) ON t.industry_key = f.industry_key
ON CONFLICT (template_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';
