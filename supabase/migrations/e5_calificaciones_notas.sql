-- ============================================================
-- MIGRACIÓN E5: Tabla de Calificaciones (libro de notas)
-- ============================================================
-- Ejecutar en: Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Esta tabla reemplaza el uso incorrecto de `grades` (niveles escolares)
-- para almacenar notas. Soporta ponderación por semana (max_score).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calificaciones_notas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid        NOT NULL REFERENCES public.students(id)         ON DELETE CASCADE,
  subject_id       uuid        NOT NULL REFERENCES public.subject_catalog(id)  ON DELETE CASCADE,
  section_id       uuid        NOT NULL REFERENCES public.sections(id)         ON DELETE CASCADE,
  school_year_id   uuid        NOT NULL REFERENCES public.school_years(id)     ON DELETE CASCADE,
  trimestre        text        NOT NULL CHECK (trimestre IN ('1er Trimestre','2do Trimestre','3er Trimestre')),
  semana           int         NOT NULL CHECK (semana BETWEEN 1 AND 12),
  score            numeric(6,2)         CHECK (score >= 0),
  max_score        numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  is_locked        boolean     NOT NULL DEFAULT false,
  entered_by       uuid        REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, subject_id, section_id, school_year_id, trimestre, semana)
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cn_updated_at ON public.calificaciones_notas;
CREATE TRIGGER trg_cn_updated_at
  BEFORE UPDATE ON public.calificaciones_notas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_cn_section_year ON public.calificaciones_notas(section_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_cn_student      ON public.calificaciones_notas(student_id);

-- RLS
ALTER TABLE public.calificaciones_notas ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer
DROP POLICY IF EXISTS "cn_select"        ON public.calificaciones_notas;
DROP POLICY IF EXISTS "cn_admin_all"     ON public.calificaciones_notas;
DROP POLICY IF EXISTS "cn_docente_ins"   ON public.calificaciones_notas;
DROP POLICY IF EXISTS "cn_docente_upd"   ON public.calificaciones_notas;

CREATE POLICY "cn_select"
  ON public.calificaciones_notas FOR SELECT
  USING (auth.role() = 'authenticated');

-- master, direccion y administracion: control total
CREATE POLICY "cn_admin_all"
  ON public.calificaciones_notas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('master','direccion','administracion')
  ));

-- docentes: pueden insertar notas no bloqueadas
CREATE POLICY "cn_docente_ins"
  ON public.calificaciones_notas FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'docente'
  ));

-- docentes: pueden actualizar notas no bloqueadas
CREATE POLICY "cn_docente_upd"
  ON public.calificaciones_notas FOR UPDATE
  USING (
    NOT is_locked AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'docente'
    )
  );

COMMENT ON TABLE public.calificaciones_notas IS
  'Libro de notas por semana. max_score = ponderación de la semana.';
