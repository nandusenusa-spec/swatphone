-- ============================================================
-- SWAT / Vapi - Upsert automático de transfer_destinations
-- Usa slug o assistant_id para resolver organization_id solo.
-- ============================================================
--
-- 1) Editá SOLO estas variables:
--    v_slug         -> slug de la empresa en /admin/clients
--    v_assistant_id -> assistant id de Vapi (opcional)
--
-- 2) Si ambos están completos y apuntan a orgs distintas, el script falla.
-- 3) Si no hay match, falla con mensaje claro.
-- 4) Hace UPSERT en organization_routing (crea o actualiza).

alter table public.organization_routing
  add column if not exists transfer_destinations jsonb default '[]'::jsonb;

comment on column public.organization_routing.transfer_destinations is
  'JSON array: { extension, name, phone_e164 } — el asistente enruta por nombre o interno; Vapi marca al phone_e164.';

do $$
declare
  -- ========= EDITAR =========
  v_slug text := 'fernandosardo-s-organization-7aa05cbf';
  v_assistant_id text := 'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d';
  -- ==========================

  org_by_slug uuid;
  org_by_assistant uuid;
  target_org_id uuid;
begin
  if coalesce(trim(v_slug), '') <> '' then
    select id
      into org_by_slug
    from public.organizations
    where slug = trim(v_slug)
    order by created_at desc
    limit 1;
  end if;

  if coalesce(trim(v_assistant_id), '') <> '' then
    select id
      into org_by_assistant
    from public.organizations
    where vapi_assistant_id = trim(v_assistant_id)
    order by created_at desc
    limit 1;
  end if;

  if org_by_slug is not null and org_by_assistant is not null and org_by_slug <> org_by_assistant then
    raise exception
      'Slug y Assistant ID apuntan a organizaciones distintas. slug_id=%, assistant_id=%',
      org_by_slug, org_by_assistant;
  end if;

  target_org_id := coalesce(org_by_slug, org_by_assistant);

  if target_org_id is null then
    raise exception
      'No se encontró organización para slug="%" ni assistant_id="%".',
      v_slug, v_assistant_id;
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
      jsonb_build_object('extension', '90', 'name', 'Diseño',         'phone_e164', '+17865550190'),
      jsonb_build_object('extension', '91', 'name', 'Administración', 'phone_e164', '+17865550191'),
      jsonb_build_object('extension', '92', 'name', 'Ramon',          'phone_e164', '+17865550192')
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

  raise notice 'OK. organization_id=% actualizado con transfer_destinations.', target_org_id;
end $$;

-- Verificación
with target as (
  select id, name, slug, vapi_assistant_id
  from public.organizations
  where slug = 'fernandosardo-s-organization-7aa05cbf'
     or vapi_assistant_id = 'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d'
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

