-- E11: Nombre de display para estudiantes
-- Permite a docentes corregir el nombre que aparece en boletas y listas
-- sin alterar la cuenta de usuario del estudiante.

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS display_name text;

-- Permitir a docentes actualizar display_name de estudiantes en sus secciones
-- (via homeroom_teacher_id o teacher_assignments)
DROP POLICY IF EXISTS "students_docente_name" ON public.students;

CREATE POLICY "students_docente_name" ON public.students
  FOR UPDATE
  USING (
    -- Homeroom teacher of any section the student is enrolled in
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.sections s ON s.id = e.section_id
      JOIN public.teachers t ON t.id = s.homeroom_teacher_id
      WHERE e.student_id = students.id
        AND t.user_id = auth.uid()
    )
    OR
    -- Teacher with an assignment in any section the student is enrolled in
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.teacher_assignments ta ON ta.section_id = e.section_id
      JOIN public.teachers t ON t.id = ta.teacher_id
      WHERE e.student_id = students.id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (true);
