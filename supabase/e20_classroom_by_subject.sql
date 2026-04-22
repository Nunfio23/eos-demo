-- ─────────────────────────────────────────────────────────────────────────────
-- e20: Separar aulas virtuales por materia (teacher_assignment_id)
-- Ejecutar en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Agregar teacher_assignment_id a publicaciones
ALTER TABLE public.classroom_posts
  ADD COLUMN IF NOT EXISTS teacher_assignment_id uuid
    REFERENCES public.teacher_assignments(id) ON DELETE SET NULL;

-- Agregar teacher_assignment_id a tareas
ALTER TABLE public.classroom_tasks
  ADD COLUMN IF NOT EXISTS teacher_assignment_id uuid
    REFERENCES public.teacher_assignments(id) ON DELETE SET NULL;

-- Agregar teacher_assignment_id a exámenes
ALTER TABLE public.classroom_exams
  ADD COLUMN IF NOT EXISTS teacher_assignment_id uuid
    REFERENCES public.teacher_assignments(id) ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_posts_ta  ON public.classroom_posts(teacher_assignment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ta  ON public.classroom_tasks(teacher_assignment_id);
CREATE INDEX IF NOT EXISTS idx_exams_ta  ON public.classroom_exams(teacher_assignment_id);
