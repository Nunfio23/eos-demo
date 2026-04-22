-- ============================================================
-- E1 PATCH: Calificaciones — E-OS
-- Ejecutar DESPUÉS de e1_rls_hardening.sql
-- ============================================================

-- ============================================================
-- 1) Restricción de rango 0-100
-- ============================================================
ALTER TABLE public.grades
  DROP CONSTRAINT IF EXISTS grades_score_range;

ALTER TABLE public.grades
  ADD CONSTRAINT grades_score_range
  CHECK (score >= 0 AND score <= 100);

-- ============================================================
-- 2) Función de letra automática (escala El Salvador)
--    90-100 → Excelente  (A)
--    80-89  → Muy Bueno  (B)
--    70-79  → Bueno      (C)
--    60-69  → Regular    (D)
--    0-59   → Insuficiente (F)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calc_letter_grade(score DECIMAL)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN score >= 90 THEN 'Excelente'
    WHEN score >= 80 THEN 'Muy Bueno'
    WHEN score >= 70 THEN 'Bueno'
    WHEN score >= 60 THEN 'Regular'
    ELSE 'Insuficiente'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 3) Trigger: calcula letter_grade automáticamente al
--    insertar o actualizar una nota
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_letter_grade()
RETURNS TRIGGER AS $$
BEGIN
  NEW.letter_grade := public.calc_letter_grade(NEW.score);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grades_letter_grade_trigger ON public.grades;

CREATE TRIGGER grades_letter_grade_trigger
  BEFORE INSERT OR UPDATE OF score ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_letter_grade();

-- Actualizar registros existentes (si los hay)
UPDATE public.grades
  SET letter_grade = public.calc_letter_grade(score)
  WHERE letter_grade IS NULL OR letter_grade != public.calc_letter_grade(score);

-- ============================================================
-- 4) RLS granular para grades
--    • INSERT : master, direccion o docente (solo sus alumnos)
--    • UPDATE : SOLO master y direccion
--    • DELETE : SOLO master
-- ============================================================

-- Quitar las políticas creadas en e1_rls_hardening.sql
DROP POLICY IF EXISTS "grades_select"  ON public.grades;
DROP POLICY IF EXISTS "grades_insert"  ON public.grades;
DROP POLICY IF EXISTS "grades_update"  ON public.grades;
DROP POLICY IF EXISTS "grades_delete"  ON public.grades;

-- SELECT: master/admin/docente(sus alumnos)/alumno(las suyas)/padre(sus hijos)
CREATE POLICY "grades_select"
  ON public.grades FOR SELECT
  USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

-- INSERT: master, direccion o docente para sus propios alumnos
--         El docente NO puede insertar si ya existe una nota (UNIQUE lo previene)
CREATE POLICY "grades_insert"
  ON public.grades FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['master', 'direccion'])
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

-- UPDATE: SOLO master y direccion
CREATE POLICY "grades_update"
  ON public.grades FOR UPDATE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- DELETE: SOLO master
CREATE POLICY "grades_delete"
  ON public.grades FOR DELETE
  USING (public.has_any_role(ARRAY['master']));

-- ============================================================
-- 5) UNIQUE: evitar duplicados (alumno + materia + periodo)
-- ============================================================
ALTER TABLE public.grades
  DROP CONSTRAINT IF EXISTS grades_student_subject_period_unique;

ALTER TABLE public.grades
  ADD CONSTRAINT grades_student_subject_period_unique
  UNIQUE (student_id, subject_id, period);

-- ============================================================
-- FIN PATCH grades
-- ============================================================
