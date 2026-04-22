-- ─── classroom_tasks ────────────────────────────────────────────────────────
-- Tareas, actividades y exposiciones asignadas por aula virtual
-- Run: idempotente (IF NOT EXISTS en todo)

CREATE TABLE IF NOT EXISTS public.classroom_tasks (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  classroom_id  UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type          TEXT NOT NULL DEFAULT 'tarea'
                  CHECK (type IN ('tarea', 'actividad', 'exposicion')),
  title         TEXT NOT NULL,
  description   TEXT,
  due_date      DATE,
  max_score     DECIMAL(5,2) DEFAULT 10,
  is_published  BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classroom_tasks_classroom
  ON public.classroom_tasks(classroom_id);

ALTER TABLE public.classroom_tasks ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer (RLS de classrooms ya restringe visibilidad por contexto)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'classroom_tasks' AND policyname = 'tasks_select'
  ) THEN
    CREATE POLICY "tasks_select" ON public.classroom_tasks
      FOR SELECT USING (true);
  END IF;
END $$;

-- Solo roles con gestión pueden insertar / actualizar / eliminar
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'classroom_tasks' AND policyname = 'tasks_manage'
  ) THEN
    CREATE POLICY "tasks_manage" ON public.classroom_tasks
      FOR ALL USING (
        public.has_any_role(ARRAY['master','direccion','administracion','docente'])
      );
  END IF;
END $$;
