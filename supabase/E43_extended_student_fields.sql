-- ============================================================
-- E43: Campos extendidos para ficha de inscripción del estudiante
-- Cubre todos los datos de la Ficha de Inscripción del Estudiante
-- ============================================================

-- Nuevas columnas en la tabla students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS nationality        TEXT,
  ADD COLUMN IF NOT EXISTS id_type           TEXT,          -- 'DUI', 'Pasaporte', 'Partida de nacimiento', etc.
  ADD COLUMN IF NOT EXISTS handedness        TEXT CHECK (handedness IN ('diestro', 'zurdo')),
  ADD COLUMN IF NOT EXISTS shirt_size        TEXT,
  ADD COLUMN IF NOT EXISTS pants_size        TEXT,
  ADD COLUMN IF NOT EXISTS skirt_size        TEXT,
  ADD COLUMN IF NOT EXISTS previous_school   TEXT,
  ADD COLUMN IF NOT EXISTS interests         TEXT,
  ADD COLUMN IF NOT EXISTS special_needs     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_needs_description TEXT,
  ADD COLUMN IF NOT EXISTS professional_support BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extracurricular   TEXT,
  ADD COLUMN IF NOT EXISTS auth_exit         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auth_photos       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auth_internet     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS siblings_in_school BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS siblings_info     TEXT,
  ADD COLUMN IF NOT EXISTS additional_info   TEXT;

-- Permitir que direccion también pueda escribir en student_parents
DROP POLICY IF EXISTS "master_write_student_parents"  ON public.student_parents;
DROP POLICY IF EXISTS "admin_write_student_parents"   ON public.student_parents;

CREATE POLICY "admin_write_student_parents" ON public.student_parents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('master', 'direccion')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('master', 'direccion')
    )
  );

-- Asegurar que direccion puede insertar perfiles con rol 'padre' (service role ya puede)
-- Las inserciones de padres se harán via service role desde la API, así que no se necesita policy extra.
