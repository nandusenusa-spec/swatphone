-- VOICE PLATFORM: bootstrap mínimo + seed demo
-- Seguro para correr en una DB donde faltan tablas runtime
-- (copia alineada con lo ejecutado en Supabase SQL Editor)

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key,
  name text not null,
  slug text unique,
  timezone text default 'America/New_York',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists organization_ai_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  system_prompt text,
  welcome_message text,
  fallback_message text,
  max_failed_attempts integer default 2,
  voice_style text,
  allowed_tools jsonb default '[]'::jsonb,
  spam_policy jsonb default '{}'::jsonb,
  extraction_schema_version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

create table if not exists organization_routing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  default_transfer_number text,
  ramon_transfer_number text,
  urgent_transfer_number text,
  transfer_destinations jsonb default '[]'::jsonb,
  after_hours_behavior text,
  callback_default_owner text,
  allow_live_transfer boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

create table if not exists organization_business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists organization_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_code text not null,
  service_name text not null,
  public_price numeric(10,2),
  currency text default 'USD',
  price_type text,
  estimated_only boolean default false,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, service_code)
);

create table if not exists customers (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_number text not null,
  service_type text,
  issue_description text,
  status text,
  quoted_price numeric(10,2),
  confirmed_price numeric(10,2),
  promised_date timestamptz,
  completed_at timestamptz,
  pickup_ready_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, order_number)
);

create table if not exists appointments (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  date date,
  time time,
  status text,
  assigned_to text,
  source text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  vapi_call_id text,
  phone text,
  started_at timestamptz,
  ended_at timestamptz,
  transcript text,
  summary text,
  intent text,
  outcome text,
  validation_status text,
  spam_score numeric(5,2),
  transfer_requested boolean default false,
  transfer_completed boolean default false,
  assigned_to text,
  follow_up_date timestamptz,
  next_action text,
  structured_extraction jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  call_log_id uuid references call_logs(id) on delete set null,
  due_at timestamptz,
  status text,
  owner text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  call_log_id uuid references call_logs(id) on delete set null,
  requested_to text,
  transfer_number text,
  status text,
  reason text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  call_log_id uuid references call_logs(id) on delete set null,
  channel text,
  template_code text,
  payload jsonb default '{}'::jsonb,
  status text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Seed (Print Bot Demo) — mismo contenido que en SQL Editor
insert into organizations (id, name, slug, timezone) values (
  '11111111-1111-1111-1111-111111111111',
  'Print Bot Demo',
  'print-bot-demo',
  'America/New_York'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  timezone = excluded.timezone,
  updated_at = now();

insert into organization_ai_config (
  organization_id, system_prompt, welcome_message, fallback_message,
  max_failed_attempts, voice_style, allowed_tools, spam_policy, extraction_schema_version
) values (
  '11111111-1111-1111-1111-111111111111',
  'Sos el asistente telefónico de la empresa. Tu trabajo es identificar si el cliente quiere consultar estado de trabajo, fecha de entrega, pedir precio, agendar cita, crear una orden de trabajo o hablar con una persona. Nunca inventes fechas, precios ni estados. Si no entendés luego de 2 intentos, tomá datos y dejá callback o marcá spam o inválido según el caso.',
  'Hola, gracias por llamar. Puedo ayudarte con el estado de un trabajo, una cita, una orden de trabajo, precios o comunicarte con una persona. Decime brevemente qué necesitás.',
  'No pude identificar claramente tu solicitud. Voy a tomar tus datos para que te contacten.',
  2,
  'professional',
  '["find_customer","get_job_status","create_appointment","create_work_order","get_price_quote","transfer_to_ramon","save_call_outcome","mark_spam_call","create_follow_up"]'::jsonb,
  '{"max_silence_seconds":8,"reject_after_failed_validations":2,"require_minimum_context":true}'::jsonb,
  'v1'
)
on conflict (organization_id) do update set
  system_prompt = excluded.system_prompt,
  welcome_message = excluded.welcome_message,
  fallback_message = excluded.fallback_message,
  max_failed_attempts = excluded.max_failed_attempts,
  voice_style = excluded.voice_style,
  allowed_tools = excluded.allowed_tools,
  spam_policy = excluded.spam_policy,
  extraction_schema_version = excluded.extraction_schema_version,
  updated_at = now();

insert into organization_routing (
  organization_id, default_transfer_number, ramon_transfer_number, urgent_transfer_number,
  after_hours_behavior, callback_default_owner, allow_live_transfer
) values (
  '11111111-1111-1111-1111-111111111111',
  '+18135550100', '+18135550101', '+18135550102',
  'callback_only', 'Ramon', true
)
on conflict (organization_id) do update set
  default_transfer_number = excluded.default_transfer_number,
  ramon_transfer_number = excluded.ramon_transfer_number,
  urgent_transfer_number = excluded.urgent_transfer_number,
  after_hours_behavior = excluded.after_hours_behavior,
  callback_default_owner = excluded.callback_default_owner,
  allow_live_transfer = excluded.allow_live_transfer,
  updated_at = now();

delete from organization_business_hours
where organization_id = '11111111-1111-1111-1111-111111111111';

insert into organization_business_hours (organization_id, day_of_week, opens_at, closes_at, active) values
  ('11111111-1111-1111-1111-111111111111', 1, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 2, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 3, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 4, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 5, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 6, '10:00', '14:00', true),
  ('11111111-1111-1111-1111-111111111111', 0, null, null, false);

insert into organization_catalog (
  organization_id, service_code, service_name, public_price, currency, price_type, estimated_only, active
) values
  ('11111111-1111-1111-1111-111111111111', 'PRINT_STD', 'Impresión estándar', 25.00, 'USD', 'fixed', false, true),
  ('11111111-1111-1111-1111-111111111111', 'PRINT_EXP', 'Impresión urgente', 45.00, 'USD', 'fixed', false, true),
  ('11111111-1111-1111-1111-111111111111', 'REPAIR_DIAG', 'Diagnóstico técnico', 35.00, 'USD', 'fixed', false, true),
  ('11111111-1111-1111-1111-111111111111', 'CUSTOM_JOB', 'Trabajo personalizado', 0.00, 'USD', 'estimate', true, true)
on conflict (organization_id, service_code) do update set
  service_name = excluded.service_name,
  public_price = excluded.public_price,
  currency = excluded.currency,
  price_type = excluded.price_type,
  estimated_only = excluded.estimated_only,
  active = excluded.active,
  updated_at = now();

insert into customers (id, organization_id, name, phone, email, address, notes) values
  ('22222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Juan Perez', '+18135551001', 'juan@example.com', 'Tampa, FL', 'Cliente frecuente'),
  ('22222222-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Maria Gomez', '+18135551002', 'maria@example.com', 'Tampa, FL', null),
  ('22222222-3333-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Carlos Ruiz', '+18135551003', 'carlos@example.com', 'Tampa, FL', 'Prefiere llamada')
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  notes = excluded.notes,
  updated_at = now();

insert into work_orders (
  id, organization_id, customer_id, order_number, service_type, issue_description, status,
  quoted_price, confirmed_price, promised_date, completed_at, pickup_ready_at, notes
) values
  ('33333333-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-1111-1111-1111-111111111111', 'WO-1001', 'Impresión estándar', 'Pedido de impresión comercial', 'in_progress', 25.00, 25.00, now() + interval '2 day', null, null, 'Pendiente de terminación'),
  ('33333333-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-2222-1111-1111-111111111111', 'WO-1002', 'Diagnóstico técnico', 'Equipo no enciende', 'pickup_ready', 35.00, 35.00, now() + interval '1 day', now(), now(), 'Listo para retirar'),
  ('33333333-3333-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-3333-1111-1111-111111111111', 'WO-1003', 'Trabajo personalizado', 'Cotización pendiente', 'pending_quote', null, null, null, null, null, 'Esperando aprobación')
on conflict (id) do update set
  customer_id = excluded.customer_id,
  order_number = excluded.order_number,
  service_type = excluded.service_type,
  issue_description = excluded.issue_description,
  status = excluded.status,
  quoted_price = excluded.quoted_price,
  confirmed_price = excluded.confirmed_price,
  promised_date = excluded.promised_date,
  completed_at = excluded.completed_at,
  pickup_ready_at = excluded.pickup_ready_at,
  notes = excluded.notes,
  updated_at = now();

insert into appointments (id, organization_id, customer_id, date, time, status, assigned_to, source, notes) values
  ('44444444-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-1111-1111-1111-111111111111', current_date + 1, '11:00', 'scheduled', 'Ramon', 'phone_bot', 'Revisión de pedido'),
  ('44444444-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-2222-1111-1111-111111111111', current_date + 2, '15:30', 'scheduled', 'Ramon', 'phone_bot', 'Retiro y consulta')
on conflict (id) do update set
  customer_id = excluded.customer_id,
  date = excluded.date,
  time = excluded.time,
  status = excluded.status,
  assigned_to = excluded.assigned_to,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();
