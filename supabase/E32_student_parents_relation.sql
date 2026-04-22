-- Tabla de relación muchos-a-muchos para estudiantes y padres
-- Permite que un estudiante tenga múltiples padres (ej: padres separados)

CREATE TABLE IF NOT EXISTS public.student_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent', -- 'parent', 'mother', 'father', 'guardian', etc
  primary_contact BOOLEAN DEFAULT FALSE, -- El padre principal para comunicaciones
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, parent_id)
);

-- RLS
ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;

-- Todos pueden ver sus propias relaciones (estudiantes ven sus padres, padres ven sus hijos)
DROP POLICY IF EXISTS "students_view_own_parents" ON public.student_parents;
CREATE POLICY "students_view_own_parents" ON public.student_parents
  FOR SELECT
  USING (
    -- El estudiante puede ver sus propios padres
    EXISTS (
      SELECT 1 FROM public.students
      WHERE id = student_id AND user_id = auth.uid()
    )
    OR
    -- El padre puede ver sus propios estudiantes
    parent_id = auth.uid()
    OR
    -- Master y maestros ven todo
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('master', 'docente', 'direccion', 'administracion')
    )
  );

-- Solo master puede escribir
DROP POLICY IF EXISTS "master_write_student_parents" ON public.student_parents;
CREATE POLICY "master_write_student_parents" ON public.student_parents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_student_parents_student_id ON public.student_parents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_parent_id ON public.student_parents(parent_id);

-- Migrar datos existentes: Copiar todos los parent_id de students a la nueva tabla
INSERT INTO public.student_parents (student_id, parent_id, relationship, primary_contact)
SELECT id, parent_id, 'parent', TRUE
FROM public.students
WHERE parent_id IS NOT NULL
ON CONFLICT (student_id, parent_id) DO NOTHING;

-- (OPCIONAL) Ahora puedes dejar parent_id en students como deprecated,
-- o eliminarlo después de verificar que todo funciona:
-- ALTER TABLE public.students DROP COLUMN parent_id;
