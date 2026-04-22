-- Migración: Orientador de Grado
-- Agrega homeroom_teacher_id a sections para identificar al docente orientador de cada sección.

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS homeroom_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL;

-- Índice para búsquedas rápidas por orientador
CREATE INDEX IF NOT EXISTS idx_sections_homeroom_teacher ON public.sections(homeroom_teacher_id);

-- RLS: el orientador puede leer su sección
DROP POLICY IF EXISTS "sections_homeroom_read" ON public.sections;
CREATE POLICY "sections_homeroom_read" ON public.sections
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );
