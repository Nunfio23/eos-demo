-- ─────────────────────────────────────────────────────────────────────────────
-- E33_exam_submissions_rls.sql
-- Políticas RLS para exam_submissions y exam_answers
-- Ejecutar en: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── exam_submissions ──────────────────────────────────────────────────────────

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

-- Alumno ve solo sus propias entregas; docentes y admins ven todas
DROP POLICY IF EXISTS "exam_sub_select" ON public.exam_submissions;
CREATE POLICY "exam_sub_select" ON public.exam_submissions
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.has_any_role(ARRAY['master','direccion','administracion','docente'])
  );

-- Solo el alumno puede insertar sus propias entregas
DROP POLICY IF EXISTS "exam_sub_insert" ON public.exam_submissions;
CREATE POLICY "exam_sub_insert" ON public.exam_submissions
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Alumno puede actualizar (mientras no esté enviado); docente puede poner nota final
DROP POLICY IF EXISTS "exam_sub_update" ON public.exam_submissions;
CREATE POLICY "exam_sub_update" ON public.exam_submissions
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.has_any_role(ARRAY['master','direccion','administracion','docente'])
  );

-- ── exam_answers ──────────────────────────────────────────────────────────────

ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

-- Alumno ve sus propias respuestas; docentes y admins ven todas
DROP POLICY IF EXISTS "exam_ans_select" ON public.exam_answers;
CREATE POLICY "exam_ans_select" ON public.exam_answers
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM public.exam_submissions
      WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )
    OR public.has_any_role(ARRAY['master','direccion','administracion','docente'])
  );

-- Solo el alumno puede insertar/actualizar sus respuestas
DROP POLICY IF EXISTS "exam_ans_insert" ON public.exam_answers;
CREATE POLICY "exam_ans_insert" ON public.exam_answers
  FOR INSERT WITH CHECK (
    submission_id IN (
      SELECT id FROM public.exam_submissions
      WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "exam_ans_update" ON public.exam_answers;
CREATE POLICY "exam_ans_update" ON public.exam_answers
  FOR UPDATE USING (
    submission_id IN (
      SELECT id FROM public.exam_submissions
      WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )
  );
