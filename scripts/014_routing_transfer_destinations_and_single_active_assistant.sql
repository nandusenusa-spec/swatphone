-- ============================================================
-- SWAT / Vapi — transfer_destinations (UPSERT) + un solo assistant_config activo
-- + (opcional) tabla organization_owner_credential_store
-- ============================================================
--
-- Editá SOLO el bloque cfg (mismos valores en el DO y en las verificaciones).
--
-- Requisitos:
--   - organization_routing.organization_id debe ser UNIQUE (ON CONFLICT).
--   - assistant_configs: el id a conservar debe existir y pertenecer a la org resuelta.
--
-- ============================================================

alter table public.organization_routing
  add column if not exists transfer_destinations jsonb default '[]'::jsonb;

comment on column public.organization_routing.transfer_destinations is
  'JSON array: { extension, name, phone_e164 } — el asistente enruta por nombre o interno; Vapi marca al phone_e164.';

do $$
declare
  -- ========= EDITAR (mismo texto que en "cfg" más abajo) =========
  v_slug text := 'fernandosardo-s-organization-7aa05cbf';
  v_assistant_id text := 'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d';
  v_keep_assistant_config_id uuid := '19c2c746-89cf-489a-88df-2d39098134a1';
  -- Print Shop Assistant alternativo: '8abbad33-16f4-493b-bf2e-db09cb562927'
  -- ==============================================================

  org_by_slug uuid;
  org_by_assistant uuid;
  target_org_id uuid;
  keep_config_org_id uuid;
begin
  if coalesce(trim(v_slug), '') <> '' then
    select o.id
    into org_by_slug
    from public.organizations o
    where o.slug = trim(v_slug)
    order by o.created_at desc
    limit 1;
  end if;

  if coalesce(trim(v_assistant_id), '') <> '' then
    select o.id
    into org_by_assistant
    from public.organizations o
    where o.vapi_assistant_id = trim(v_assistant_id)
    order by o.created_at desc
    limit 1;
  end if;

  if org_by_slug is not null
     and org_by_assistant is not null
     and org_by_slug <> org_by_assistant then
    raise exception
      using message = format(
        'Slug y Assistant ID apuntan a organizaciones distintas. slug_org=%s assistant_org=%s',
        org_by_slug,
        org_by_assistant
      );
  end if;

  target_org_id := coalesce(org_by_slug, org_by_assistant);

  if target_org_id is null then
    raise exception
      using message = format(
        'No se encontró organización para slug=%L ni assistant_id=%L.',
        v_slug,
        v_assistant_id
      );
  end if;

  select c.organization_id
  into keep_config_org_id
  from public.assistant_configs c
  where c.id = v_keep_assistant_config_id;

  if keep_config_org_id is null then
    raise exception
      using message = format('No existe assistant_configs.id=%s.', v_keep_assistant_config_id);
  end if;

  if keep_config_org_id <> target_org_id then
    raise exception
      using message = format(
        'assistant_config %s pertenece a organization_id=%s; org objetivo=%s.',
        v_keep_assistant_config_id,
        keep_config_org_id,
        target_org_id
      );
  end if;

  insert into public.organization_routing (
    organization_id,
    transfer_destinations,
    allow_live_transfer,
    callback_default_owner,
    updated_at
  )
  values (
    target_org_id,
    jsonb_build_array(
      jsonb_build_object('extension', '90', 'name', 'Diseño', 'phone_e164', '+17865550190'),
      jsonb_build_object('extension', '91', 'name', 'Administración', 'phone_e164', '+17865550191'),
      jsonb_build_object('extension', '92', 'name', 'Ramon', 'phone_e164', '+17865550192')
    ),
    true,
    'Ramon',
    now()
  )
  on conflict (organization_id) do update
    set transfer_destinations = excluded.transfer_destinations,
        allow_live_transfer = excluded.allow_live_transfer,
        callback_default_owner = excluded.callback_default_owner,
        updated_at = now();

  update public.assistant_configs c
  set is_active = false,
      updated_at = now()
  where c.organization_id = target_org_id;

  update public.assistant_configs c
  set is_active = true,
      updated_at = now()
  where c.id = v_keep_assistant_config_id;

  raise notice 'OK organization_id=% transfer_destinations + assistant_config activo=%',
    target_org_id,
    v_keep_assistant_config_id;
end $$;

-- ============================================================
-- VERIFICACIÓN 1 — org + routing (editar cfg igual que el DO)
-- ============================================================
with cfg as (
  select
    'fernandosardo-s-organization-7aa05cbf'::text as slug,
    'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d'::text as assistant_id
),
target as (
  select o.id, o.name, o.slug, o.vapi_assistant_id
  from public.organizations o
  cross join cfg
  where o.slug = cfg.slug
     or o.vapi_assistant_id = cfg.assistant_id
)
select
  t.id,
  t.name,
  t.slug,
  t.vapi_assistant_id,
  r.allow_live_transfer,
  r.callback_default_owner,
  r.transfer_destinations,
  r.updated_at
from target t
left join public.organization_routing r on r.organization_id = t.id
order by r.updated_at desc nulls last;

-- ============================================================
-- VERIFICACIÓN 2 — assistant_configs: exactamente uno activo
-- ============================================================
with cfg as (
  select
    'fernandosardo-s-organization-7aa05cbf'::text as slug,
    'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d'::text as assistant_id
),
target_org as (
  select o.id as organization_id
  from public.organizations o
  cross join cfg
  where o.slug = cfg.slug
     or o.vapi_assistant_id = cfg.assistant_id
  order by o.created_at desc
  limit 1
)
select
  c.id,
  c.organization_id,
  c.name,
  c.is_active,
  c.created_at,
  c.updated_at
from public.assistant_configs c
where c.organization_id = (select organization_id from target_org)
order by c.created_at;

-- Conteo rápido: debe ser 1
with cfg as (
  select
    'fernandosardo-s-organization-7aa05cbf'::text as slug,
    'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d'::text as assistant_id
),
target_org as (
  select o.id as organization_id
  from public.organizations o
  cross join cfg
  where o.slug = cfg.slug
     or o.vapi_assistant_id = cfg.assistant_id
  order by o.created_at desc
  limit 1
)
select count(*) filter (where c.is_active) as activos
from public.assistant_configs c
where c.organization_id = (select organization_id from target_org);

-- ============================================================
-- OPCIONAL — credential store (una sola vez por proyecto)
-- ============================================================
create table if not exists public.organization_owner_credential_store (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null,
  owner_email text not null,
  password_plaintext text not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

create index if not exists organization_owner_credential_store_org_idx
  on public.organization_owner_credential_store (organization_id);

alter table public.organization_owner_credential_store enable row level security;

comment on table public.organization_owner_credential_store is
  'Super-admin: credenciales owner en claro para recuperación. No exponer a la app pública.';

-- ============================================================
-- HELPERS
-- ============================================================
-- select id, name, slug, vapi_assistant_id
-- from public.organizations
-- where slug ilike '%swat%' or name ilike '%swat%';
