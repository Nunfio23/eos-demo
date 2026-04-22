-- e20_curriculum_guidelines.sql
-- Programas de estudio MINED 2026 — Carga horaria sugerida por grado y materia
-- Fuente: PDFs oficiales en /DOCUMENTOS/PROGRAMAS DE ESTUDIO MINED 2026/
-- Escuela Cristiana E-OS (privada) — horas como REFERENCIA, no obligatorias

CREATE TABLE IF NOT EXISTS public.curriculum_guidelines (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  grade_codes     TEXT[] NOT NULL,    -- ej: ARRAY['2G'] o ARRAY['4G','5G','6G']
  cycle           TEXT NOT NULL,      -- 'Parvularia', 'I Ciclo', 'II Ciclo', 'III Ciclo', 'Bachillerato'
  subject_name    TEXT NOT NULL,
  weekly_hours    DECIMAL(4,1),       -- NULL = variable/integrado
  annual_hours    INTEGER,            -- NULL = variable
  notes           TEXT,
  source_file     TEXT,               -- nombre del PDF fuente
  is_extracurricular BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.curriculum_guidelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_read" ON public.curriculum_guidelines;
DROP POLICY IF EXISTS "curriculum_manage" ON public.curriculum_guidelines;

CREATE POLICY "curriculum_read"   ON public.curriculum_guidelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "curriculum_manage" ON public.curriculum_guidelines FOR ALL   USING (has_any_role(ARRAY['master']));

CREATE INDEX IF NOT EXISTS idx_curriculum_grade_codes ON public.curriculum_guidelines USING gin(grade_codes);

-- ─── DATOS: Parvularia ────────────────────────────────────────────────────────
-- Fuente: "04 Parvularia 4 y 5_Web.pdf", "05 Parvularia 6 y Primer grado_Web.pdf"
-- Enfoque integrado por ámbitos de experiencia, NO materias aisladas

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, source_file) VALUES
  (ARRAY['P4','P5'], 'Parvularia', 'Relaciones Sociales y Personales',  NULL, NULL, 'Enfoque integrado. Bloques de 30 min. No se trabaja por materias aisladas.', '04 Parvularia 4 y 5_Web.pdf'),
  (ARRAY['P4','P5'], 'Parvularia', 'Cuerpo y Movimiento',               NULL, NULL, 'Enfoque integrado. Bloques de 30 min.', '04 Parvularia 4 y 5_Web.pdf'),
  (ARRAY['P4','P5'], 'Parvularia', 'Lenguaje y Comunicación',           NULL, NULL, 'Enfoque integrado. Bloques de 30 min.', '04 Parvularia 4 y 5_Web.pdf'),
  (ARRAY['P4','P5'], 'Parvularia', 'Expresión Estética',                NULL, NULL, 'Enfoque integrado. Bloques de 30 min.', '04 Parvularia 4 y 5_Web.pdf'),
  (ARRAY['P4','P5'], 'Parvularia', 'Exploración del Entorno',           NULL, NULL, 'Enfoque integrado. Bloques de 30 min.', '04 Parvularia 4 y 5_Web.pdf'),

  (ARRAY['P6','1G'], 'Parvularia', 'Relaciones Sociales y Personales',  NULL, NULL, 'Enfoque integrado. Bloques de 40-45 min. Mayor profundidad que P4-P5.', '05 Parvularia 6 y Primer grado_Web.pdf'),
  (ARRAY['P6','1G'], 'Parvularia', 'Cuerpo y Movimiento',               NULL, NULL, 'Enfoque integrado. Bloques de 40-45 min.', '05 Parvularia 6 y Primer grado_Web.pdf'),
  (ARRAY['P6','1G'], 'Parvularia', 'Lenguaje y Comunicación',           NULL, NULL, 'Enfoque integrado. Bloques de 40-45 min.', '05 Parvularia 6 y Primer grado_Web.pdf'),
  (ARRAY['P6','1G'], 'Parvularia', 'Expresión Estética',                NULL, NULL, 'Enfoque integrado. Bloques de 40-45 min.', '05 Parvularia 6 y Primer grado_Web.pdf'),
  (ARRAY['P6','1G'], 'Parvularia', 'Exploración del Entorno',           NULL, NULL, 'Enfoque integrado. Bloques de 40-45 min.', '05 Parvularia 6 y Primer grado_Web.pdf');

-- ─── DATOS: I Ciclo — 2° y 3° Grado ─────────────────────────────────────────
-- Fuente: "Programa de estudio de segundo y tercer grado.pdf"
--         "Programas de estudio_Comunicación_2.° y 3.° grados.pdf"
--         "Programa de estudios Ciudadanía y Valores 2.° y 3.° grados.pdf"
--         "Programas de estudios_Artes_I ciclo.pdf"
--         "Programas de estudio_Desarrollo corporal_I ciclo.pdf"
-- Año lectivo: 40 semanas

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, source_file) VALUES
  (ARRAY['2G'], 'I Ciclo', 'Comunicación',          6.0, 240, '40 semanas', 'Programas de estudio_Comunicación_2.° y 3.° grados.pdf'),
  (ARRAY['2G'], 'I Ciclo', 'Matemática',             5.0, 200, '40 semanas', 'Programa de estudio de segundo y tercer grado.pdf'),
  (ARRAY['2G'], 'I Ciclo', 'Ciudadanía y Valores',   3.0, 120, '40 semanas', 'Programa de estudios Ciudadanía y Valores 2.° y 3.° grados.pdf'),
  (ARRAY['2G'], 'I Ciclo', 'Artes',                  2.0,  64, '32 semanas efectivas', 'Programas de estudios_Artes_I ciclo.pdf'),
  (ARRAY['2G'], 'I Ciclo', 'Desarrollo Corporal',    NULL, NULL, 'Horas variables según unidad didáctica', 'Programas de estudio_Desarrollo corporal_I ciclo.pdf'),

  (ARRAY['3G'], 'I Ciclo', 'Comunicación',           5.0, 200, '40 semanas', 'Programas de estudio_Comunicación_2.° y 3.° grados.pdf'),
  (ARRAY['3G'], 'I Ciclo', 'Matemática',             5.0, 200, '40 semanas', 'Programa de estudio de segundo y tercer grado.pdf'),
  (ARRAY['3G'], 'I Ciclo', 'Ciudadanía y Valores',   4.0, 160, '40 semanas', 'Programa de estudios Ciudadanía y Valores 2.° y 3.° grados.pdf'),
  (ARRAY['3G'], 'I Ciclo', 'Artes',                  2.0,  64, '32 semanas efectivas', 'Programas de estudios_Artes_I ciclo.pdf'),
  (ARRAY['3G'], 'I Ciclo', 'Desarrollo Corporal',    NULL, NULL, 'Horas variables según unidad didáctica', 'Programas de estudio_Desarrollo corporal_I ciclo.pdf');

-- ─── DATOS: II Ciclo — 4°, 5°, 6° Grado ─────────────────────────────────────
-- Fuente: "Programa de estudio II ciclo.pdf"
--         "Programas de estudio_Comunicación y Literatura_II ciclo.pdf"
--         "Programa de estudios Ciudadanía y Valores II ciclo.pdf"
--         "Programas de estudios_Artes_II ciclo.pdf"
--         "Programas de estudio_Desarrollo corporal_II ciclo.pdf"
--         "Programas de estudio_Ciencia y Tecnología_2.° a 6.° grados.pdf"
-- Año lectivo: 40 semanas

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, source_file) VALUES
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Comunicación y Literatura', 5.0, 200, '40 semanas', 'Programas de estudio_Comunicación y Literatura_II ciclo.pdf'),
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Matemática',                5.0, 200, '40 semanas', 'Programa de estudio II ciclo.pdf'),
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Ciudadanía y Valores',      4.0, 160, '40 semanas', 'Programa de estudios Ciudadanía y Valores II ciclo.pdf'),
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Artes',                     3.0,  96, '32 semanas efectivas', 'Programas de estudios_Artes_II ciclo.pdf'),
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Desarrollo Corporal',       NULL, NULL, 'Variable: 33 horas por unidad', 'Programas de estudio_Desarrollo corporal_II ciclo.pdf'),
  (ARRAY['4G','5G','6G'], 'II Ciclo', 'Ciencia y Tecnología',      NULL, NULL, 'Ver programa específico', 'Programas de estudio_Ciencia y Tecnología_2.° a 6.° grados.pdf');

-- ─── DATOS: III Ciclo — 7°, 8°, 9° Grado ────────────────────────────────────
-- Fuente: "Programa de estudio III ciclo.pdf"
--         "Programas de estudio_Lengua y Literatura_III ciclo.pdf"
--         "Programa de estudios Ciudadanía y Valores III ciclo.pdf"
--         "Programa de estudio_Educación Física_III ciclo.pdf"
--         "Programas de estudio_Ciencia y Tecnología_III ciclo.pdf"
-- Año lectivo: 40 semanas

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, source_file) VALUES
  (ARRAY['7G','8G','9G'], 'III Ciclo', 'Lengua y Literatura',      5.0, 200, '40 semanas', 'Programas de estudio_Lengua y Literatura_III ciclo.pdf'),
  (ARRAY['7G','8G','9G'], 'III Ciclo', 'Matemática',               5.0, 200, '40 semanas', 'Programa de estudio III ciclo.pdf'),
  (ARRAY['7G','8G','9G'], 'III Ciclo', 'Ciudadanía y Valores',     5.0, 200, '40 semanas', 'Programa de estudios Ciudadanía y Valores III ciclo.pdf'),
  (ARRAY['7G','8G','9G'], 'III Ciclo', 'Educación Física',         NULL, NULL, 'Unidades de 9 a 12 semanas según planificación', 'Programa de estudio_Educación Física_III ciclo.pdf'),
  (ARRAY['7G','8G','9G'], 'III Ciclo', 'Ciencia y Tecnología',     NULL, NULL, 'Ver programa específico III ciclo', 'Programas de estudio_Ciencia y Tecnología_III ciclo.pdf');

-- ─── DATOS: Bachillerato — 10° y 11° Grado ───────────────────────────────────
-- Fuente: "Programa de estudio bachillerato.pdf"
--         "Programas de estudio_Lengua y Literatura_Bachillerato.pdf"
--         "Programa de estudio Ciudadanía y Valores Educación Media.pdf"
--         "PROGRAMA Finanzas y Economía.pdf"
--         "Programas_de_estudio_Proyecto_de_Vida_y_Carrera.pdf"
--         "Programas de estudio_Educación Física_Bachillerato.pdf"
--         "Programas de estudio_Ciencia y Tecnología_Bachillerato.pdf"
--         "Programas_de_estudio_Ciencias_de_la_Computacion.pdf"
-- Materias básicas: 40 semanas | Especialidades: 32 semanas

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, source_file) VALUES
  -- 1er Año (10°)
  (ARRAY['10G'], 'Bachillerato', 'Matemática (Precálculo)',      6.0, 240, '40 semanas', 'Programa de estudio bachillerato.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Lengua y Literatura',          5.0, 200, '40 semanas', 'Programas de estudio_Lengua y Literatura_Bachillerato.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Ciudadanía y Valores',         5.0, 200, '40 semanas', 'Programa de estudio Ciudadanía y Valores Educación Media.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Finanzas y Economía',          4.0, 128, '32 semanas (especialidad)', 'PROGRAMA Finanzas y Economía.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Proyecto de Vida y Carrera',   2.0,  64, '32 semanas (especialidad)', 'Programas_de_estudio_Proyecto_de_Vida_y_Carrera.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Educación Física',             NULL, NULL, 'Variable según unidades (~8 semanas)', 'Programas de estudio_Educación Física_Bachillerato.pdf'),
  (ARRAY['10G'], 'Bachillerato', 'Ciencias de la Computación',   NULL, NULL, 'Ver programa específico', 'Programas_de_estudio_Ciencias_de_la_Computacion.pdf'),

  -- 2do Año (11°)
  (ARRAY['11G'], 'Bachillerato', 'Matemática (Precálculo)',      6.0, 240, '40 semanas', 'Programa de estudio bachillerato.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Lengua y Literatura',          5.0, 200, '40 semanas', 'Programas de estudio_Lengua y Literatura_Bachillerato.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Ciudadanía y Valores',         5.0, 200, '40 semanas', 'Programa de estudio Ciudadanía y Valores Educación Media.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Finanzas y Economía',          2.0,  64, '32 semanas (especialidad)', 'PROGRAMA Finanzas y Economía.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Proyecto de Vida y Carrera',   2.0,  64, '32 semanas (especialidad)', 'Programas_de_estudio_Proyecto_de_Vida_y_Carrera.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Educación Física',             NULL, NULL, 'Variable según planificación', 'Programas de estudio_Educación Física_Bachillerato.pdf'),
  (ARRAY['11G'], 'Bachillerato', 'Ciencias de la Computación',   NULL, NULL, 'Ver programa específico', 'Programas_de_estudio_Ciencias_de_la_Computacion.pdf');

-- ─── Materias extracurriculares / complementarias (privada) ──────────────────
-- La Escuela Cristiana E-OS, como escuela privada, puede agregar:
-- Inglés, Música, Informática, Teatro, Coro, Educación Cristiana, etc.
-- Estas NO están en el MINED pero son válidas y suelen compartir docente entre secciones.

INSERT INTO public.curriculum_guidelines (grade_codes, cycle, subject_name, weekly_hours, annual_hours, notes, is_extracurricular) VALUES
  (ARRAY['P4','P5','P6','1G','2G','3G','4G','5G','6G','7G','8G','9G','10G','11G'],
   'Todos los ciclos', 'Inglés', 3.0, NULL,
   'Materia complementaria privada. Candidata para unir secciones del mismo grado.', TRUE),

  (ARRAY['P4','P5','P6','1G','2G','3G','4G','5G','6G','7G','8G','9G','10G','11G'],
   'Todos los ciclos', 'Informática / Computación', 2.0, NULL,
   'Materia complementaria privada. Candidata para unir secciones del mismo grado.', TRUE),

  (ARRAY['P4','P5','P6','1G','2G','3G','4G','5G','6G','7G','8G','9G'],
   'Todos los ciclos', 'Educación Cristiana / Biblia', 2.0, NULL,
   'Materia institucional. Escuela cristiana.', TRUE),

  (ARRAY['P4','P5','P6','1G','2G','3G','4G','5G','6G','7G','8G','9G'],
   'Todos los ciclos', 'Música / Coro', 1.0, NULL,
   'Extracurricular. Candidata para unir secciones o grados completos.', TRUE),

  (ARRAY['P4','P5','P6','1G','2G','3G','4G','5G','6G','7G','8G','9G'],
   'Todos los ciclos', 'Teatro / Arte Dramático', 1.0, NULL,
   'Extracurricular. Candidata para unir secciones.', TRUE);
