-- e14_guiones_clase.sql
-- Tabla de guiones de clase (lesson plans) para docentes
-- Idempotente: seguro de ejecutar múltiples veces

CREATE TABLE IF NOT EXISTS public.guiones_clase (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  teacher_assignment_id UUID REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  date                  DATE,
  duration_minutes      INTEGER DEFAULT 45,
  objective             TEXT,
  intro                 TEXT,        -- Introducción / motivación
  development           TEXT,        -- Desarrollo de la clase
  closure               TEXT,        -- Cierre / conclusión
  resources             TEXT,        -- Recursos necesarios
  evaluation            TEXT,        -- Evaluación / verificación
  status                TEXT DEFAULT 'borrador' CHECK (status IN ('borrador', 'listo')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guiones_ta ON public.guiones_clase(teacher_assignment_id);

ALTER TABLE public.guiones_clase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guiones_select" ON public.guiones_clase;
DROP POLICY IF EXISTS "guiones_manage" ON public.guiones_clase;

CREATE POLICY "guiones_select" ON public.guiones_clase FOR SELECT USING (
  public.has_any_role(ARRAY['master','direccion','administracion','docente'])
);
CREATE POLICY "guiones_manage" ON public.guiones_clase FOR ALL USING (
  public.has_any_role(ARRAY['master','direccion','administracion','docente'])
);

