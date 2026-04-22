-- ============================================================
-- E-OS - E3: Rediseño Módulo Académico
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. NIVELES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.levels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text UNIQUE NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels_select_all" ON public.levels FOR SELECT USING (true);
CREATE POLICY "levels_admin_all"  ON public.levels FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 2. GRADOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id   uuid REFERENCES public.levels(id) ON DELETE CASCADE,
  name       text NOT NULL,
  code       text UNIQUE NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grades_select_all" ON public.grades FOR SELECT USING (true);
CREATE POLICY "grades_admin_all"  ON public.grades FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 3. SECCIONES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sections (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id  uuid REFERENCES public.grades(id) ON DELETE CASCADE,
  name      text NOT NULL,
  capacity  int DEFAULT 30,
  is_active boolean DEFAULT true,
  UNIQUE(grade_id, name)
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_select_all" ON public.sections FOR SELECT USING (true);
CREATE POLICY "sections_admin_all"  ON public.sections FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 4. AÑO ESCOLAR ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_years (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  is_active  boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_years_select_all" ON public.school_years FOR SELECT USING (true);
CREATE POLICY "school_years_admin_all"  ON public.school_years FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
);

-- ─── 5. CATÁLOGO DE MATERIAS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subject_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text UNIQUE NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.subject_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subject_catalog_select_all" ON public.subject_catalog FOR SELECT USING (true);
CREATE POLICY "subject_catalog_admin_all"  ON public.subject_catalog FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 6. MATERIAS POR GRADO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_subjects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id           uuid REFERENCES public.grades(id) ON DELETE CASCADE,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id) ON DELETE CASCADE,
  weekly_hours       int DEFAULT 5,
  sort_order         int DEFAULT 0,
  UNIQUE(grade_id, subject_catalog_id)
);

ALTER TABLE public.grade_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade_subjects_select_all" ON public.grade_subjects FOR SELECT USING (true);
CREATE POLICY "grade_subjects_admin_all"  ON public.grade_subjects FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 7. ASIGNACIONES DOCENTE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  grade_subject_id uuid REFERENCES public.grade_subjects(id) ON DELETE CASCADE,
  section_id       uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id   uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(grade_subject_id, section_id, school_year_id)
);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ta_select_authenticated" ON public.teacher_assignments FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ta_admin_all" ON public.teacher_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 8. MATRÍCULAS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid REFERENCES public.students(id) ON DELETE CASCADE,
  section_id     uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  status         text DEFAULT 'active' CHECK (status IN ('active','withdrawn','graduated')),
  enrolled_at    timestamptz DEFAULT now(),
  UNIQUE(student_id, school_year_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments_select_auth" ON public.enrollments FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "enrollments_admin_all" ON public.enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 9. LIBRO DE NOTAS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  student_id            uuid REFERENCES public.students(id) ON DELETE CASCADE,
  school_year_id        uuid REFERENCES public.school_years(id),
  month                 int NOT NULL CHECK (month BETWEEN 1 AND 12),
  week_type             text NOT NULL CHECK (week_type IN ('week1','week2','labs','exams')),
  score                 numeric(5,2) NOT NULL CHECK (score >= 0),
  max_score             numeric(5,2) DEFAULT 10,
  is_locked             boolean DEFAULT false,
  entered_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(teacher_assignment_id, student_id, month, week_type)
);

ALTER TABLE public.grade_entries ENABLE ROW LEVEL SECURITY;
-- Docente puede ver y editar sus propias notas (no locked)
CREATE POLICY "ge_docente_select" ON public.grade_entries FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion','contabilidad'))
      OR EXISTS (
        SELECT 1 FROM teacher_assignments ta
        JOIN teachers t ON t.id = ta.teacher_id
        WHERE ta.id = teacher_assignment_id AND t.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "ge_docente_insert" ON public.grade_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      JOIN teachers t ON t.id = ta.teacher_id
      WHERE ta.id = teacher_assignment_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY "ge_docente_update" ON public.grade_entries FOR UPDATE
  USING (NOT is_locked AND
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      JOIN teachers t ON t.id = ta.teacher_id
      WHERE ta.id = teacher_assignment_id AND t.user_id = auth.uid()
    )
  );
-- Alumno ve sus propias notas
CREATE POLICY "ge_alumno_select" ON public.grade_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM students WHERE id = student_id AND user_id = auth.uid())
  );
-- Padre ve notas de sus hijos
CREATE POLICY "ge_padre_select" ON public.grade_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN parents p ON p.id = s.parent_id
      WHERE s.id = student_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "ge_master_all" ON public.grade_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion')));

-- ─── 10. PROMEDIOS MENSUALES (calculados) ────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_grades (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  student_id            uuid REFERENCES public.students(id) ON DELETE CASCADE,
  month                 int NOT NULL CHECK (month BETWEEN 1 AND 12),
  school_year_id        uuid REFERENCES public.school_years(id),
  week1_score           numeric(5,2),
  week2_score           numeric(5,2),
  lab_score             numeric(5,2),
  exam_score            numeric(5,2),
  -- Ponderación FIJA: 10% / 20% / 30% / 40%
  final_score           numeric(5,2) GENERATED ALWAYS AS (
    ROUND(
      COALESCE(week1_score,0)*0.10 +
      COALESCE(week2_score,0)*0.20 +
      COALESCE(lab_score,0)*0.30 +
      COALESCE(exam_score,0)*0.40,
    2)
  ) STORED,
  is_closed             boolean DEFAULT false,
  closed_by             uuid REFERENCES public.profiles(id),
  closed_at             timestamptz,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(teacher_assignment_id, student_id, month, school_year_id)
);

ALTER TABLE public.monthly_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mg_select_auth" ON public.monthly_grades FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "mg_admin_all" ON public.monthly_grades FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 11. CONFIGURACIÓN DEL COLEGIO ───────────────────────────
CREATE TABLE IF NOT EXISTS public.school_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select_all" ON public.school_settings FOR SELECT USING (true);
CREATE POLICY "settings_master_all" ON public.school_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
);

-- ─── 12. NOTIFICACIONES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "notif_master_all" ON public.notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
);
CREATE POLICY "notif_system_insert" ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ─── SEED: CONFIGURACIÓN INICIAL ─────────────────────────────
INSERT INTO public.school_settings (key, value) VALUES
  ('school_name',    'Colegio E-OS Demo'),
  ('school_tagline', 'Educación con Tecnología e Innovación'),
  ('primary_color',  '#6366f1'),
  ('logo_url',       null),
  ('school_email',   'info@eos.edu.sv'),
  ('school_phone',   ''),
  ('school_address', 'El Salvador')
ON CONFLICT (key) DO NOTHING;
