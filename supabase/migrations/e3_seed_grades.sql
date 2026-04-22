-- ============================================================
-- E-OS - E3: Seed Niveles, Grados y Año Escolar 2026
-- Ejecutar DESPUÉS de e3_academic_redesign.sql
-- ============================================================

-- ─── NIVELES ─────────────────────────────────────────────────
INSERT INTO public.levels (name, code, sort_order) VALUES
  ('Parvularia',    'PARV', 1),
  ('Elementary',    'ELEM', 2),
  ('Middle School', 'MID',  3),
  ('High School',   'HIGH', 4)
ON CONFLICT (code) DO NOTHING;

-- ─── GRADOS (15 exactos) ─────────────────────────────────────
INSERT INTO public.grades (level_id, name, code, sort_order)
SELECT l.id, g.name, g.code, g.ord
FROM (VALUES
  ('PARV', 'Parvularia 4',   'P4',  1),
  ('PARV', 'Parvularia 5',   'P5',  2),
  ('PARV', 'Parvularia 6',   'P6',  3),
  ('ELEM', 'Primer Grado',   '1G',  4),
  ('ELEM', 'Segundo Grado',  '2G',  5),
  ('ELEM', 'Tercer Grado',   '3G',  6),
  ('ELEM', 'Cuarto Grado',   '4G',  7),
  ('ELEM', 'Quinto Grado',   '5G',  8),
  ('ELEM', 'Sexto Grado',    '6G',  9),
  ('MID',  'Séptimo Grado',  '7G',  10),
  ('MID',  'Octavo Grado',   '8G',  11),
  ('MID',  'Noveno Grado',   '9G',  12),
  ('HIGH', 'Décimo Grado',   '10G', 13),
  ('HIGH', 'Onceavo Grado',  '11G', 14)
) AS g(lcode, name, code, ord)
JOIN public.levels l ON l.code = g.lcode
ON CONFLICT (code) DO NOTHING;

-- ─── SECCIONES (A y B para cada grado) ───────────────────────
INSERT INTO public.sections (grade_id, name, capacity)
SELECT g.id, s.name, 30
FROM public.grades g
CROSS JOIN (VALUES ('A'), ('B')) AS s(name)
ON CONFLICT (grade_id, name) DO NOTHING;

-- ─── AÑO ESCOLAR 2026 ────────────────────────────────────────
INSERT INTO public.school_years (name, start_date, end_date, is_active) VALUES
  ('2026', '2026-01-05', '2026-10-30', true)
ON CONFLICT DO NOTHING;

-- ─── CATÁLOGO DE MATERIAS ────────────────────────────────────
INSERT INTO public.subject_catalog (name, code) VALUES
  ('Lenguaje y Literatura',     'LEN'),
  ('Matemáticas',               'MAT'),
  ('Ciencias Naturales',        'CNAT'),
  ('Estudios Sociales',         'ESOC'),
  ('Educación Cristiana',       'ECRIS'),
  ('Inglés',                    'ING'),
  ('Educación Física',          'EDF'),
  ('Arte y Música',             'ARTE'),
  ('Computación',               'COMP'),
  ('Física',                    'FIS'),
  ('Química',                   'QUIM'),
  ('Biología',                  'BIO'),
  ('Historia Universal',        'HIST'),
  ('Emprendedurismo',           'EMP'),
  ('Orientación',               'ORIEN')
ON CONFLICT (code) DO NOTHING;

-- ─── MATERIAS POR NIVEL (asignar a todos los grados de cada nivel) ──────
-- Parvularia (P4, P5, P6): Lenguaje, Matemáticas, Educación Cristiana, Arte, Inglés, Ed.Física
INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id, sc.id, 5, sc.sort_order
FROM public.grades g
JOIN public.levels l ON l.id = g.level_id AND l.code = 'PARV'
CROSS JOIN (
  SELECT sc.id, row_number() OVER () AS sort_order FROM public.subject_catalog sc
  WHERE sc.code IN ('LEN','MAT','ECRIS','ARTE','ING','EDF')
) sc
ON CONFLICT (grade_id, subject_catalog_id) DO NOTHING;

-- Elementary (1G-6G): + Ciencias, Sociales, Computación
INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id, sc.id, 5, sc.sort_order
FROM public.grades g
JOIN public.levels l ON l.id = g.level_id AND l.code = 'ELEM'
CROSS JOIN (
  SELECT sc.id, row_number() OVER () AS sort_order FROM public.subject_catalog sc
  WHERE sc.code IN ('LEN','MAT','CNAT','ESOC','ECRIS','ING','EDF','ARTE','COMP')
) sc
ON CONFLICT (grade_id, subject_catalog_id) DO NOTHING;

-- Middle School (7G-9G): + Historia, Orientación
INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id, sc.id, 5, sc.sort_order
FROM public.grades g
JOIN public.levels l ON l.id = g.level_id AND l.code = 'MID'
CROSS JOIN (
  SELECT sc.id, row_number() OVER () AS sort_order FROM public.subject_catalog sc
  WHERE sc.code IN ('LEN','MAT','CNAT','ESOC','ECRIS','ING','EDF','COMP','HIST','ORIEN')
) sc
ON CONFLICT (grade_id, subject_catalog_id) DO NOTHING;

-- High School (10G-11G): + Física, Química, Biología, Emprendedurismo
INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id, sc.id, 5, sc.sort_order
FROM public.grades g
JOIN public.levels l ON l.id = g.level_id AND l.code = 'HIGH'
CROSS JOIN (
  SELECT sc.id, row_number() OVER () AS sort_order FROM public.subject_catalog sc
  WHERE sc.code IN ('LEN','MAT','FIS','QUIM','BIO','ECRIS','ING','EDF','HIST','EMP','COMP')
) sc
ON CONFLICT (grade_id, subject_catalog_id) DO NOTHING;

-- ─── SEED: Vincular usuarios de prueba a teachers/students ───
-- Crear entrada en teachers para docente@teslaos.com
INSERT INTO public.teachers (user_id, employee_number, is_active)
SELECT p.id, 'DOC-001', true
FROM public.profiles p
WHERE p.email = 'docente@teslaos.com'
  AND p.role = 'docente'
  AND NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id = p.id)
ON CONFLICT DO NOTHING;

-- Crear entrada en students para alumno@teslaos.com
INSERT INTO public.students (user_id, enrollment_number, grade_level, section, is_active)
SELECT p.id, 'ALU-001', '1G', 'A', true
FROM public.profiles p
WHERE p.email = 'alumno@teslaos.com'
  AND p.role = 'alumno'
  AND NOT EXISTS (SELECT 1 FROM public.students WHERE user_id = p.id)
ON CONFLICT DO NOTHING;

-- Crear entrada en parents para padres@teslaos.com
INSERT INTO public.parents (user_id, relationship_type)
SELECT p.id, 'padre'
FROM public.profiles p
WHERE p.email = 'padres@teslaos.com'
  AND p.role = 'padre'
  AND NOT EXISTS (SELECT 1 FROM public.parents WHERE user_id = p.id)
ON CONFLICT DO NOTHING;

-- Matricular al alumno en la sección 1G-A del año 2026
INSERT INTO public.enrollments (student_id, section_id, school_year_id, status)
SELECT s.id, sec.id, sy.id, 'active'
FROM public.students s
JOIN public.profiles p ON p.id = s.user_id AND p.email = 'alumno@teslaos.com'
CROSS JOIN public.sections sec
JOIN public.grades g ON g.id = sec.grade_id AND g.code = '1G' AND sec.name = 'A'
CROSS JOIN public.school_years sy WHERE sy.name = '2026' AND sy.is_active = true
ON CONFLICT DO NOTHING;

-- ─── VERIFICACIÓN FINAL ───────────────────────────────────────
SELECT 'Niveles:'    AS tabla, count(*) FROM public.levels
UNION ALL SELECT 'Grados:',    count(*) FROM public.grades
UNION ALL SELECT 'Secciones:', count(*) FROM public.sections
UNION ALL SELECT 'School years:', count(*) FROM public.school_years
UNION ALL SELECT 'Catálogo materias:', count(*) FROM public.subject_catalog
UNION ALL SELECT 'Grade subjects:', count(*) FROM public.grade_subjects;
