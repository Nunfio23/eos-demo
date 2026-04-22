-- ============================================================
-- E9: Corregir my_teacher_student_ids() para usar teacher_assignments
-- El sistema migró de class_schedules → teacher_assignments
-- pero la función RLS no fue actualizada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_teacher_student_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT e.student_id
  FROM public.teacher_assignments ta
  JOIN public.enrollments e ON e.section_id = ta.section_id
  WHERE ta.teacher_id = public.my_teacher_id()
    AND ta.is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
