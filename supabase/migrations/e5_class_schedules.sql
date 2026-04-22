-- ============================================================
-- E-OS - E5: Tabla de Horarios (nuevo schema)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Eliminar tabla vieja si existe (con datos de prueba en el esquema antiguo)
DROP TABLE IF EXISTS public.class_schedules CASCADE;

CREATE TABLE public.class_schedules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id         uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id     uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id) ON DELETE SET NULL,
  teacher_id         uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week        text NOT NULL
    CHECK (day_of_week IN ('lunes','martes','miercoles','jueves','viernes','sabado')),
  start_time         time NOT NULL,
  end_time           time NOT NULL,
  color              text DEFAULT '#6366f1',
  notes              text,
  created_at         timestamptz DEFAULT now(),
  -- Evitar solapamiento: misma sección, día y hora de inicio
  UNIQUE(section_id, school_year_id, day_of_week, start_time)
);

ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_select_auth" ON public.class_schedules FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "cs_admin_all" ON public.class_schedules FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

CREATE POLICY "cs_teacher_insert" ON public.class_schedules FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
    OR EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_id)
  );

CREATE INDEX IF NOT EXISTS idx_class_schedules_section ON public.class_schedules(section_id, school_year_id, day_of_week);
