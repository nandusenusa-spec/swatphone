-- Varios destinos de transferencia pueden compartir el mismo PSTN (misma central).
-- Si existe un UNIQUE (organization_id, phone) en team_members, el guardado en Super Admin falla al sincronizar Equipo.
--
-- Diagnóstico (opcional en Supabase SQL Editor):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.team_members'::regclass;

ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_organization_id_phone_key;
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_org_phone_key;
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_organization_id_phone_unique;

DROP INDEX IF EXISTS idx_team_members_org_phone_unique;
DROP INDEX IF EXISTS team_members_organization_id_phone_key;
