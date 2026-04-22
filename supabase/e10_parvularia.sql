-- E10: Sistema de evaluación de indicadores de logro para Parvularia
-- Evaluación trimestral (T1/T2/T3) con valores S (Sí lo logra) / N (No lo logra) / P (En proceso)

-- ─────────────────────────────────────────────────────────
-- TABLAS
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parv_areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_code text NOT NULL,   -- P4 | P5 | P6
  name       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  UNIQUE(grade_code, name)
);
ALTER TABLE public.parv_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parv_areas_select" ON public.parv_areas;
DROP POLICY IF EXISTS "parv_areas_admin"  ON public.parv_areas;
CREATE POLICY "parv_areas_select" ON public.parv_areas FOR SELECT USING (true);
CREATE POLICY "parv_areas_admin"  ON public.parv_areas FOR ALL    USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.parv_indicators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id    uuid NOT NULL REFERENCES public.parv_areas(id) ON DELETE CASCADE,
  text       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0
);
ALTER TABLE public.parv_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parv_ind_select" ON public.parv_indicators;
DROP POLICY IF EXISTS "parv_ind_admin"  ON public.parv_indicators;
CREATE POLICY "parv_ind_select" ON public.parv_indicators FOR SELECT USING (true);
CREATE POLICY "parv_ind_admin"  ON public.parv_indicators FOR ALL    USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.parv_evaluations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  indicator_id uuid NOT NULL REFERENCES public.parv_indicators(id) ON DELETE CASCADE,
  section_id   uuid NOT NULL REFERENCES public.sections(id)        ON DELETE CASCADE,
  trimestre    text NOT NULL CHECK (trimestre IN ('T1','T2','T3')),
  value        text NOT NULL CHECK (value    IN ('S','N','P')),
  evaluated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(student_id, indicator_id, trimestre)
);
ALTER TABLE public.parv_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parv_eval_select"        ON public.parv_evaluations;
DROP POLICY IF EXISTS "parv_eval_admin"         ON public.parv_evaluations;
DROP POLICY IF EXISTS "parv_eval_docente_write" ON public.parv_evaluations;

CREATE POLICY "parv_eval_select" ON public.parv_evaluations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "parv_eval_admin" ON public.parv_evaluations
  FOR ALL USING (public.is_admin());

CREATE POLICY "parv_eval_docente_write" ON public.parv_evaluations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      JOIN public.teachers t ON t.id = ta.teacher_id
      WHERE ta.section_id = parv_evaluations.section_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      JOIN public.teachers t ON t.id = ta.teacher_id
      WHERE ta.section_id = parv_evaluations.section_id
        AND t.user_id = auth.uid()
    )
  );

-- También permitir que el docente de homeroom (sections.homeroom_teacher_id) pueda evaluar
CREATE POLICY "parv_eval_homeroom_write" ON public.parv_evaluations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sections s
      JOIN public.teachers t ON t.id = s.homeroom_teacher_id
      WHERE s.id = parv_evaluations.section_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sections s
      JOIN public.teachers t ON t.id = s.homeroom_teacher_id
      WHERE s.id = parv_evaluations.section_id
        AND t.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────
-- SEED: Áreas por grado
-- ─────────────────────────────────────────────────────────
INSERT INTO public.parv_areas (grade_code, name, sort_order) VALUES
  ('P4', 'Desarrollo personal y social',             1),
  ('P4', 'Expresión, comunicación y representación', 2),
  ('P4', 'Relación con el entorno',                  3),
  ('P5', 'Desarrollo personal y social',             1),
  ('P5', 'Expresión, comunicación y representación', 2),
  ('P5', 'Relación con el entorno',                  3),
  ('P6', 'Desarrollo personal y social',             1),
  ('P6', 'Expresión, comunicación y representación', 2),
  ('P6', 'Relación con el entorno',                  3)
ON CONFLICT (grade_code, name) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- SEED: Indicadores (45 en total: 3 grados × 3 áreas × 5 indicadores)
-- Inserta solo si el texto no existe para el área
-- ─────────────────────────────────────────────────────────
INSERT INTO public.parv_indicators (area_id, text, sort_order)
SELECT a.id, i.txt, i.so
FROM public.parv_areas a
JOIN (VALUES
  -- ── Parvularia 4 ──────────────────────────────────────
  ('P4','Desarrollo personal y social','Comparte materiales y juguetes con sus compañeros',1),
  ('P4','Desarrollo personal y social','Reconoce y verbaliza sus emociones básicas',2),
  ('P4','Desarrollo personal y social','Cuida su higiene personal con supervisión',3),
  ('P4','Desarrollo personal y social','Respeta turnos y reglas en juegos grupales',4),
  ('P4','Desarrollo personal y social','Se integra a actividades en grupo con facilidad',5),

  ('P4','Expresión, comunicación y representación','Se expresa oralmente con oraciones simples',1),
  ('P4','Expresión, comunicación y representación','Diferencia y nombra colores, formas y tamaños',2),
  ('P4','Expresión, comunicación y representación','Canta canciones y participa en rondas',3),
  ('P4','Expresión, comunicación y representación','Representa personajes y situaciones en el juego simbólico',4),
  ('P4','Expresión, comunicación y representación','Escucha y comprende cuentos sencillos',5),

  ('P4','Relación con el entorno','Identifica objetos y seres vivos de su entorno',1),
  ('P4','Relación con el entorno','Clasifica objetos por forma, color y tamaño',2),
  ('P4','Relación con el entorno','Reconoce cambios en el clima y las estaciones',3),
  ('P4','Relación con el entorno','Observa y describe características de animales y plantas',4),
  ('P4','Relación con el entorno','Muestra curiosidad por explorar su entorno natural',5),

  -- ── Parvularia 5 ──────────────────────────────────────
  ('P5','Desarrollo personal y social','Maneja conflictos con pares usando el diálogo',1),
  ('P5','Desarrollo personal y social','Identifica y expresa emociones propias y ajenas',2),
  ('P5','Desarrollo personal y social','Participa activamente en actividades del salón',3),
  ('P5','Desarrollo personal y social','Respeta normas de convivencia establecidas en el aula',4),
  ('P5','Desarrollo personal y social','Muestra autonomía en actividades cotidianas',5),

  ('P5','Expresión, comunicación y representación','Narra experiencias personales con secuencia lógica',1),
  ('P5','Expresión, comunicación y representación','Reconoce letras y números en su entorno',2),
  ('P5','Expresión, comunicación y representación','Realiza trazos con control motriz adecuado',3),
  ('P5','Expresión, comunicación y representación','Crea dibujos y pinturas con intención comunicativa',4),
  ('P5','Expresión, comunicación y representación','Participa en conversaciones y debates grupales',5),

  ('P5','Relación con el entorno','Identifica y describe características del entorno comunitario',1),
  ('P5','Relación con el entorno','Comprende conceptos numéricos básicos (más/menos, antes/después)',2),
  ('P5','Relación con el entorno','Reconoce normas de seguridad personal y vial',3),
  ('P5','Relación con el entorno','Relaciona causas y efectos en situaciones simples',4),
  ('P5','Relación con el entorno','Manifiesta respeto por el entorno natural',5),

  -- ── Parvularia 6 ──────────────────────────────────────
  ('P6','Desarrollo personal y social','Regula su conducta de acuerdo con las normas del grupo',1),
  ('P6','Desarrollo personal y social','Identifica sus fortalezas y áreas de mejora personal',2),
  ('P6','Desarrollo personal y social','Colabora con sus compañeros en proyectos grupales',3),
  ('P6','Desarrollo personal y social','Manifiesta independencia en el trabajo individual',4),
  ('P6','Desarrollo personal y social','Resuelve conflictos cotidianos con estrategias asertivas',5),

  ('P6','Expresión, comunicación y representación','Escribe su nombre y palabras familiares con claridad',1),
  ('P6','Expresión, comunicación y representación','Lee y comprende textos sencillos con apoyo visual',2),
  ('P6','Expresión, comunicación y representación','Utiliza el conteo y los números en situaciones cotidianas',3),
  ('P6','Expresión, comunicación y representación','Expresa ideas mediante el arte, la música y el drama',4),
  ('P6','Expresión, comunicación y representación','Participa activamente en dramatizaciones y presentaciones',5),

  ('P6','Relación con el entorno','Diferencia y describe ecosistemas básicos de su entorno',1),
  ('P6','Relación con el entorno','Aplica nociones matemáticas en actividades cotidianas',2),
  ('P6','Relación con el entorno','Identifica características de su comunidad y su historia',3),
  ('P6','Relación con el entorno','Muestra actitudes de conservación ambiental',4),
  ('P6','Relación con el entorno','Comprende y practica hábitos de vida saludable',5)
) AS i(gc, an, txt, so)
  ON a.grade_code = i.gc AND a.name = i.an
WHERE NOT EXISTS (
  SELECT 1 FROM public.parv_indicators pi
  WHERE pi.area_id = a.id AND pi.text = i.txt
);
