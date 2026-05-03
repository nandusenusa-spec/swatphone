-- Destinos de transferencia por empresa: interno visible al bot + nombre + número real (E.164) para Vapi.
-- Ejemplo: [{"extension":"90","name":"Diseño","phone_e164":"+17865550100"}, ...]

alter table organization_routing
  add column if not exists transfer_destinations jsonb default '[]'::jsonb;

comment on column organization_routing.transfer_destinations is
  'JSON array: { extension, name, phone_e164 } — el asistente enruta por nombre o interno; Vapi marca al phone_e164.';
