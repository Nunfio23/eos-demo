-- E9: Permitir a docentes escribir en monthly_grades para sus propias asignaciones
-- Sin esto, el upsert desde la página de Calificaciones falla silenciosamente
-- y las notas no aparecen en el Libro de Notas.

DROP POLICY IF EXISTS "mg_docente_write" ON public.monthly_grades;

CREATE POLICY "mg_docente_write" ON public.monthly_grades
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      JOIN public.teachers t ON t.id = ta.teacher_id
      WHERE ta.id = teacher_assignment_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      JOIN public.teachers t ON t.id = ta.teacher_id
      WHERE ta.id = teacher_assignment_id
        AND t.user_id = auth.uid()
    )
  );
