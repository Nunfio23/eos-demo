-- ============================================================
-- E-OS - E26: Fix RLS padre → hijos
-- Problema: my_children_ids() usaba JOIN con tabla 'parents'
--   pero la vinculación admin guarda profiles.id directamente
--   en students.parent_id. La función nunca retornaba rows.
-- Solución: reescribir la función usando students.parent_id = auth.uid()
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. Reescribir la función my_children_ids() ───────────────────────────
CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF UUID AS $$
  SELECT id
  FROM public.students
  WHERE parent_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 2. La política students_select ya usa my_children_ids() ──────────────
-- No es necesario tocarla. Con la función corregida, el padre
-- podrá SELECT sus hijos automáticamente.

-- ─── 3. También asegurar que padre pueda ver enrollments/sections/grades ──
-- Verificar si existe política en enrollments para padre
DO $$
BEGIN
  -- enrollments: padre puede ver enrollments de sus hijos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'enrollments' AND policyname = 'enrollments_padre_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "enrollments_padre_select"
      ON public.enrollments FOR SELECT
      USING (
        student_id IN (SELECT public.my_children_ids())
      )
    $policy$;
  END IF;
END;
$$;

-- ─── Verificación ─────────────────────────────────────────────────────────
-- Después de ejecutar, prueba (autenticado como padre):
-- SELECT * FROM students WHERE parent_id = auth.uid();
-- Debería retornar el/los hijos vinculados.
