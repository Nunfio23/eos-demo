-- ─────────────────────────────────────────────────────────────────────────────
-- e18_ai_grading.sql — Columnas de calificación IA en entregas de tareas
-- Correr en: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE classroom_task_submissions
  ADD COLUMN IF NOT EXISTS ai_score          DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS ai_justification  TEXT,
  ADD COLUMN IF NOT EXISTS ai_feedback       TEXT,
  ADD COLUMN IF NOT EXISTS ai_graded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teacher_approved  BOOLEAN NOT NULL DEFAULT FALSE;

-- Índices para el panel de revisión del docente
CREATE INDEX IF NOT EXISTS idx_cts_ai_graded
  ON classroom_task_submissions (ai_graded_at)
  WHERE ai_graded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cts_teacher_approved
  ON classroom_task_submissions (teacher_approved);
