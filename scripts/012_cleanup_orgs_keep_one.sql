-- Limpieza: dejar UNA sola organización y borrar el resto.
-- Ajustá el slug en `keep` si tu empresa “buena” usa otro.
--
-- ANTES: corré el SELECT de preview. DESPUÉS: el DELETE.
-- Ojo: los perfiles (profiles) de orgs borradas quedan con organization_id = NULL (SET NULL).
-- Los usuarios en auth.users NO se borran solos: eliminalos en Dashboard → Authentication si querés.

-- 1) Preview: qué se va a eliminar
with keep as (
  select id from organizations
  where slug = 'fernandosardo-s-organization-7aa05cbf'
  limit 1
)
select o.id, o.name, o.slug, o.vapi_assistant_id, o.created_at
from organizations o
where exists (select 1 from keep)
  and o.id not in (select id from keep)
order by o.created_at;

-- 2) Borrar organizaciones que NO son la que conservás
-- (requiere que el paso 1 muestre filas y que `keep` tenga exactamente 1 id)
/*
with keep as (
  select id from organizations
  where slug = 'fernandosardo-s-organization-7aa05cbf'
  limit 1
)
delete from organizations o
where exists (select 1 from keep)
  and o.id not in (select id from keep);
*/

-- Alternativa si preferís conservar por Assistant ID:
/*
with keep as (
  select id from organizations
  where vapi_assistant_id = 'e9a5d0a4-44a5-4b7f-90df-35a5d50d181d'
  order by created_at desc
  limit 1
)
delete from organizations o
where exists (select 1 from keep)
  and o.id not in (select id from keep);
*/
