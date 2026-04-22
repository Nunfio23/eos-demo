-- ============================================================
-- E-OS - E21: Carga Horaria por Grado
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.grade_subject_hours (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id           uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  subject_catalog_id uuid NOT NULL REFERENCES public.subject_catalog(id) ON DELETE CASCADE,
  school_year_id     uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  weekly_hours       integer NOT NULL DEFAULT 1 CHECK (weekly_hours >= 0),
  is_extracurricular boolean NOT NULL DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (grade_id, subject_catalog_id, school_year_id)
);

ALTER TABLE public.grade_subject_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsh_select_auth" ON public.grade_subject_hours FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "gsh_admin_all" ON public.grade_subject_hours FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('master', 'direccion')
  )
);

CREATE INDEX IF NOT EXISTS idx_gsh_grade_year
  ON public.grade_subject_hours (grade_id, school_year_id);

-- Trigger: update updated_at automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_gsh_updated_at ON public.grade_subject_hours;
CREATE TRIGGER trg_gsh_updated_at
  BEFORE UPDATE ON public.grade_subject_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
