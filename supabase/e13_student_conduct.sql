-- E13: Conducta (conduct grade) por estudiante, sección y mes
-- Permite al docente orientador/homeroom registrar la nota de conducta
-- que se incluye en el promedio de la boleta.

CREATE TABLE IF NOT EXISTS public.student_conduct (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id     uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  section_id     uuid        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid        NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  month          int         NOT NULL CHECK (month >= 1 AND month <= 12),
  score          numeric(4,2)         CHECK (score >= 0 AND score <= 10),
  entered_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (student_id, section_id, school_year_id, month)
);

-- RLS
ALTER TABLE public.student_conduct ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado puede leer conducta de su contexto
DROP POLICY IF EXISTS "conduct_select" ON public.student_conduct;
CREATE POLICY "conduct_select" ON public.student_conduct
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE: sólo el docente orientador (homeroom) de la sección, o master/direccion
DROP POLICY IF EXISTS "conduct_write" ON public.student_conduct;
CREATE POLICY "conduct_write" ON public.student_conduct
  FOR ALL USING (
    -- master / direccion
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('master', 'direccion')
    )
    OR
    -- docente orientador de la sección
    EXISTS (
      SELECT 1 FROM public.sections s
      JOIN public.teachers t ON t.id = s.homeroom_teacher_id
      WHERE s.id = student_conduct.section_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (true);



