-- FAQs: columnas que usa el dashboard + RLS tenant (insert/update para miembros de la org)

ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.faqs
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Políticas legacy (scripts/001) o nombres antiguos
DROP POLICY IF EXISTS "faqs_select" ON public.faqs;
DROP POLICY IF EXISTS "faqs_insert" ON public.faqs;
DROP POLICY IF EXISTS "faqs_update" ON public.faqs;
DROP POLICY IF EXISTS "faqs_delete" ON public.faqs;

DROP POLICY IF EXISTS faqs_select_tenant ON public.faqs;
DROP POLICY IF EXISTS faqs_insert_tenant ON public.faqs;
DROP POLICY IF EXISTS faqs_update_tenant ON public.faqs;
DROP POLICY IF EXISTS faqs_delete_tenant ON public.faqs;

CREATE POLICY faqs_select_tenant ON public.faqs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY faqs_insert_tenant ON public.faqs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY faqs_update_tenant ON public.faqs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY faqs_delete_tenant ON public.faqs
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
