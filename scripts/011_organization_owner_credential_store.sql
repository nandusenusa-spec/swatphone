-- Registro interno para super-admin: última contraseña conocida del owner (texto plano).
-- Supabase Auth sigue guardando el hash; esto es solo recuperación operativa vía service role.
-- RLS activado sin políticas = nadie con JWT cliente puede leer; service_role bypass.

create table if not exists organization_owner_credential_store (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid not null,
  owner_email text not null,
  password_plaintext text not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

create index if not exists organization_owner_credential_store_org_idx
  on organization_owner_credential_store (organization_id);

alter table organization_owner_credential_store enable row level security;

comment on table organization_owner_credential_store is
  'Super-admin: credenciales owner en claro para recuperación. No exponer a la app pública.';
