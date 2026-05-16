-- Team member call routing: who receives transfers and in what order.
-- Idempotent; safe to re-run.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS receives_calls BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS call_priority INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_team_members_call_routing
  ON public.team_members (organization_id, receives_calls, call_priority);

COMMENT ON COLUMN public.team_members.receives_calls IS 'When false, member is excluded from inbound call / transfer routing.';
COMMENT ON COLUMN public.team_members.call_priority IS 'Lower values are preferred first when selecting transfer targets.';
