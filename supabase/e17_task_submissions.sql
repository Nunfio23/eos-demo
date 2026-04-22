-- ============================================================
-- e17: classroom_task_submissions — entregas de tareas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.classroom_task_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid REFERENCES public.classroom_tasks(id) ON DELETE CASCADE,
  student_id   uuid REFERENCES public.students(id) ON DELETE CASCADE,
  content      text,                          -- Texto de respuesta
  link_url     text,                          -- Enlace (Drive, etc.)
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','submitted','graded','late')),
  score        decimal(5,2),
  feedback     text,
  submitted_at timestamptz,
  graded_at    timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(task_id, student_id)
);

ALTER TABLE public.classroom_task_submissions ENABLE ROW LEVEL SECURITY;

-- Alumno ve solo sus propias entregas
DROP POLICY IF EXISTS "task_sub_select" ON public.classroom_task_submissions;
CREATE POLICY "task_sub_select" ON public.classroom_task_submissions
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.has_any_role(ARRAY['master','direccion','administracion','docente'])
  );

-- Alumno puede insertar sus propias entregas
DROP POLICY IF EXISTS "task_sub_insert" ON public.classroom_task_submissions;
CREATE POLICY "task_sub_insert" ON public.classroom_task_submissions
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Alumno puede actualizar sus entregas (mientras no esté calificada), docente puede calificar
DROP POLICY IF EXISTS "task_sub_update" ON public.classroom_task_submissions;
CREATE POLICY "task_sub_update" ON public.classroom_task_submissions
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.has_any_role(ARRAY['master','direccion','administracion','docente'])
  );

CREATE INDEX IF NOT EXISTS idx_task_sub_task    ON public.classroom_task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sub_student ON public.classroom_task_submissions(student_id);
