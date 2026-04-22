-- ============================================================
-- E-OS DEMO — SEED DE DATOS FICTICIOS COHERENTES
-- PASO 1: Ejecuta primero FULL_SETUP.sql
-- PASO 2: Ejecuta este archivo completo
-- ============================================================

-- ============================================================
-- CONFIGURACION DEL COLEGIO
-- ============================================================
INSERT INTO public.school_settings (key, value) VALUES
  ('school_name',    'Colegio E-OS Demo'),
  ('school_tagline', 'Educacion con Tecnologia e Innovacion'),
  ('primary_color',  '#2E7FE8'),
  ('logo_url',       null),
  ('school_email',   'info@eos.edu.sv'),
  ('school_phone',   '2222-3333'),
  ('school_address', 'Col. Escalon, San Salvador, El Salvador')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- PASO 1: CREAR USUARIOS EN auth.users
-- Esto dispara el trigger que crea el perfil automaticamente
-- ============================================================
INSERT INTO auth.users (
  id, aud, role, email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new,
  is_super_admin
)
VALUES
  ('00000001-eos0-0000-0000-000000000001','authenticated','authenticated','admin@eos.edu.sv',          crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Carlos Mendez","role":"master"}',        NOW(),NOW(),'','','','',false),
  ('00000002-eos0-0000-0000-000000000002','authenticated','authenticated','director@eos.edu.sv',       crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Ana Sofia Rivas","role":"direccion"}',   NOW(),NOW(),'','','','',false),
  ('00000003-eos0-0000-0000-000000000003','authenticated','authenticated','administracion@eos.edu.sv', crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Roberto Fuentes","role":"administracion"}',NOW(),NOW(),'','','','',false),
  ('00000004-eos0-0000-0000-000000000004','authenticated','authenticated','docente1@eos.edu.sv',       crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Maria Elena Castillo","role":"docente"}', NOW(),NOW(),'','','','',false),
  ('00000005-eos0-0000-0000-000000000005','authenticated','authenticated','docente2@eos.edu.sv',       crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Jose Antonio Lopez","role":"docente"}',  NOW(),NOW(),'','','','',false),
  ('00000006-eos0-0000-0000-000000000006','authenticated','authenticated','alumno1@eos.edu.sv',        crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Diego Alejandro Morales","role":"alumno"}',NOW(),NOW(),'','','','',false),
  ('00000007-eos0-0000-0000-000000000007','authenticated','authenticated','alumno2@eos.edu.sv',        crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Sofia Isabel Herrera","role":"alumno"}', NOW(),NOW(),'','','','',false),
  ('00000008-eos0-0000-0000-000000000008','authenticated','authenticated','alumno3@eos.edu.sv',        crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Carlos Eduardo Flores","role":"alumno"}',NOW(),NOW(),'','','','',false),
  ('00000009-eos0-0000-0000-000000000009','authenticated','authenticated','padre1@eos.edu.sv',         crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Miguel Morales","role":"padre"}',        NOW(),NOW(),'','','','',false),
  ('00000010-eos0-0000-0000-000000000010','authenticated','authenticated','madre1@eos.edu.sv',         crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Laura Herrera","role":"padre"}',         NOW(),NOW(),'','','','',false),
  ('00000011-eos0-0000-0000-000000000011','authenticated','authenticated','padre2@eos.edu.sv',         crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Fernando Flores","role":"padre"}',       NOW(),NOW(),'','','','',false),
  ('00000012-eos0-0000-0000-000000000012','authenticated','authenticated','contabilidad@eos.edu.sv',   crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Patricia Gomez","role":"contabilidad"}', NOW(),NOW(),'','','','',false),
  ('00000013-eos0-0000-0000-000000000013','authenticated','authenticated','biblioteca@eos.edu.sv',     crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Sandra Martinez","role":"biblioteca"}',  NOW(),NOW(),'','','','',false),
  ('00000014-eos0-0000-0000-000000000014','authenticated','authenticated','tienda@eos.edu.sv',         crypt('EOS2026!',gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Juan Carlos Perez","role":"tienda"}',   NOW(),NOW(),'','','','',false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PASO 2: ACTUALIZAR ROLES EN PROFILES
-- El trigger ya cre los perfiles, solo actualizamos el rol y telefono
-- ============================================================
UPDATE public.profiles SET role='master',        phone='7111-0001' WHERE email='admin@eos.edu.sv';
UPDATE public.profiles SET role='direccion',     phone='7111-0002' WHERE email='director@eos.edu.sv';
UPDATE public.profiles SET role='administracion',phone='7111-0003' WHERE email='administracion@eos.edu.sv';
UPDATE public.profiles SET role='docente',       phone='7111-0004' WHERE email='docente1@eos.edu.sv';
UPDATE public.profiles SET role='docente',       phone='7111-0005' WHERE email='docente2@eos.edu.sv';
UPDATE public.profiles SET role='alumno',        phone='7111-0006' WHERE email='alumno1@eos.edu.sv';
UPDATE public.profiles SET role='alumno',        phone='7111-0007' WHERE email='alumno2@eos.edu.sv';
UPDATE public.profiles SET role='alumno',        phone='7111-0008' WHERE email='alumno3@eos.edu.sv';
UPDATE public.profiles SET role='padre',         phone='7111-0009' WHERE email='padre1@eos.edu.sv';
UPDATE public.profiles SET role='padre',         phone='7111-0010' WHERE email='madre1@eos.edu.sv';
UPDATE public.profiles SET role='padre',         phone='7111-0011' WHERE email='padre2@eos.edu.sv';
UPDATE public.profiles SET role='contabilidad',  phone='7111-0012' WHERE email='contabilidad@eos.edu.sv';
UPDATE public.profiles SET role='biblioteca',    phone='7111-0013' WHERE email='biblioteca@eos.edu.sv';
UPDATE public.profiles SET role='tienda',        phone='7111-0014' WHERE email='tienda@eos.edu.sv';

-- ============================================================
-- PASO 3: RESTO DE DATOS (usando subqueries para obtener UUIDs reales)
-- ============================================================
DO $$
DECLARE
  uid_master        UUID := '00000001-eos0-0000-0000-000000000001';
  uid_direccion     UUID := '00000002-eos0-0000-0000-000000000002';
  uid_admin         UUID := '00000003-eos0-0000-0000-000000000003';
  uid_docente1      UUID := '00000004-eos0-0000-0000-000000000004';
  uid_docente2      UUID := '00000005-eos0-0000-0000-000000000005';
  uid_alumno1       UUID := '00000006-eos0-0000-0000-000000000006';
  uid_alumno2       UUID := '00000007-eos0-0000-0000-000000000007';
  uid_alumno3       UUID := '00000008-eos0-0000-0000-000000000008';
  uid_padre1        UUID := '00000009-eos0-0000-0000-000000000009';
  uid_madre1        UUID := '00000010-eos0-0000-0000-000000000010';
  uid_padre2        UUID := '00000011-eos0-0000-0000-000000000011';
  uid_contabilidad  UUID := '00000012-eos0-0000-0000-000000000012';
  uid_biblioteca    UUID := '00000013-eos0-0000-0000-000000000013';
  uid_tienda        UUID := '00000014-eos0-0000-0000-000000000014';

  teacher1_id  UUID;
  teacher2_id  UUID;
  student1_id  UUID;
  student2_id  UUID;
  student3_id  UUID;
  parent1_id   UUID;
  parent2_id   UUID;
  parent3_id   UUID;
  grade_7g_id  UUID;
  grade_8g_id  UUID;
  sect_7a_id   UUID;
  sect_8a_id   UUID;
  sy_id        UUID;
  subj_len_id  UUID;
  subj_mat_id  UUID;
  subj_cnat_id UUID;
  subj_ing_id  UUID;
  gs_len_7_id  UUID;
  gs_mat_7_id  UUID;
  gs_cnat_7_id UUID;
  gs_ing_7_id  UUID;
  gs_len_8_id  UUID;
  gs_mat_8_id  UUID;
  ta_len_7a    UUID;
  ta_mat_7a    UUID;
  ta_cnat_7a   UUID;
  ta_ing_7a    UUID;
  ta_len_8a    UUID;
  ta_mat_8a    UUID;
  classroom_7a UUID;
  classroom_8a UUID;
  chan_gen_id  UUID;
  chan_doc_id  UUID;
  asess1_id    UUID;
  asess2_id    UUID;
  asess3_id    UUID;
  bp1 UUID; bp2 UUID; bp3 UUID; bp4 UUID;
  cat1 UUID; cat2 UUID; cat3 UUID;
  prod1 UUID; prod2 UUID;
  order1_id    UUID;
  book1_id     UUID;
  book2_id     UUID;

BEGIN

  -- Obtener IDs del schema academico
  SELECT id INTO sy_id       FROM public.school_years  WHERE is_active = true LIMIT 1;
  SELECT id INTO grade_7g_id FROM public.grades        WHERE code = '7G'     LIMIT 1;
  SELECT id INTO grade_8g_id FROM public.grades        WHERE code = '8G'     LIMIT 1;
  SELECT id INTO sect_7a_id  FROM public.sections      WHERE grade_id = grade_7g_id AND name = 'A' LIMIT 1;
  SELECT id INTO sect_8a_id  FROM public.sections      WHERE grade_id = grade_8g_id AND name = 'A' LIMIT 1;
  SELECT id INTO subj_len_id  FROM public.subject_catalog WHERE code = 'LEN'  LIMIT 1;
  SELECT id INTO subj_mat_id  FROM public.subject_catalog WHERE code = 'MAT'  LIMIT 1;
  SELECT id INTO subj_cnat_id FROM public.subject_catalog WHERE code = 'CNAT' LIMIT 1;
  SELECT id INTO subj_ing_id  FROM public.subject_catalog WHERE code = 'ING'  LIMIT 1;

  -- ============================================================
  -- DOCENTES
  -- ============================================================
  INSERT INTO public.teachers (user_id, employee_number, specialization, hire_date, salary, is_active)
  VALUES
    (uid_docente1, 'EMP-001', 'Lenguaje e Ingles',        '2022-01-10', 650.00, true),
    (uid_docente2, 'EMP-002', 'Matematicas y Ciencias',   '2021-06-01', 700.00, true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO teacher1_id FROM public.teachers WHERE user_id = uid_docente1 LIMIT 1;
  SELECT id INTO teacher2_id FROM public.teachers WHERE user_id = uid_docente2 LIMIT 1;

  -- ============================================================
  -- PADRES
  -- ============================================================
  INSERT INTO public.parents (user_id, occupation, relationship_type)
  VALUES
    (uid_padre1, 'Ingeniero',               'padre'),
    (uid_madre1, 'Docente universitaria',   'madre'),
    (uid_padre2, 'Comerciante',             'padre')
  ON CONFLICT DO NOTHING;

  SELECT id INTO parent1_id FROM public.parents WHERE user_id = uid_padre1 LIMIT 1;
  SELECT id INTO parent2_id FROM public.parents WHERE user_id = uid_madre1 LIMIT 1;
  SELECT id INTO parent3_id FROM public.parents WHERE user_id = uid_padre2 LIMIT 1;

  -- ============================================================
  -- ALUMNOS
  -- ============================================================
  INSERT INTO public.students (user_id, enrollment_number, grade_level, section, parent_id, date_of_birth, blood_type, emergency_contact, is_active)
  VALUES
    (uid_alumno1, 'EOS-2026-001', 'Septimo Grado', 'A', parent1_id, '2012-03-15', 'O+', 'Miguel Morales 7111-0009',  true),
    (uid_alumno2, 'EOS-2026-002', 'Septimo Grado', 'A', parent2_id, '2012-07-22', 'A+', 'Laura Herrera 7111-0010',   true),
    (uid_alumno3, 'EOS-2026-003', 'Octavo Grado',  'A', parent3_id, '2011-11-05', 'B+', 'Fernando Flores 7111-0011', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO student1_id FROM public.students WHERE user_id = uid_alumno1 LIMIT 1;
  SELECT id INTO student2_id FROM public.students WHERE user_id = uid_alumno2 LIMIT 1;
  SELECT id INTO student3_id FROM public.students WHERE user_id = uid_alumno3 LIMIT 1;

  -- Salud
  INSERT INTO public.student_health (student_id, blood_type, allergies, medical_conditions, doctor_name, doctor_phone)
  VALUES
    (student1_id, 'O+', 'Polvo ambiental', 'Ninguna',   'Dr. Ernesto Valle', '2222-5555'),
    (student2_id, 'A+', 'Ninguna',         'Asma leve', 'Dra. Carmen Rios',  '2222-6666'),
    (student3_id, 'B+', 'Mariscos',        'Ninguna',   'Dr. Luis Turcios',  '2222-7777')
  ON CONFLICT (student_id) DO NOTHING;

  -- ============================================================
  -- ASIGNACIONES DOCENTE-MATERIA-SECCION
  -- ============================================================
  SELECT id INTO gs_len_7_id  FROM public.grade_subjects WHERE grade_id = grade_7g_id AND subject_catalog_id = subj_len_id  LIMIT 1;
  SELECT id INTO gs_mat_7_id  FROM public.grade_subjects WHERE grade_id = grade_7g_id AND subject_catalog_id = subj_mat_id  LIMIT 1;
  SELECT id INTO gs_cnat_7_id FROM public.grade_subjects WHERE grade_id = grade_7g_id AND subject_catalog_id = subj_cnat_id LIMIT 1;
  SELECT id INTO gs_ing_7_id  FROM public.grade_subjects WHERE grade_id = grade_7g_id AND subject_catalog_id = subj_ing_id  LIMIT 1;
  SELECT id INTO gs_len_8_id  FROM public.grade_subjects WHERE grade_id = grade_8g_id AND subject_catalog_id = subj_len_id  LIMIT 1;
  SELECT id INTO gs_mat_8_id  FROM public.grade_subjects WHERE grade_id = grade_8g_id AND subject_catalog_id = subj_mat_id  LIMIT 1;

  INSERT INTO public.teacher_assignments (teacher_id, grade_subject_id, section_id, school_year_id, is_active)
  VALUES
    (teacher1_id, gs_len_7_id,  sect_7a_id, sy_id, true),
    (teacher1_id, gs_ing_7_id,  sect_7a_id, sy_id, true),
    (teacher2_id, gs_mat_7_id,  sect_7a_id, sy_id, true),
    (teacher2_id, gs_cnat_7_id, sect_7a_id, sy_id, true),
    (teacher1_id, gs_len_8_id,  sect_8a_id, sy_id, true),
    (teacher2_id, gs_mat_8_id,  sect_8a_id, sy_id, true)
  ON CONFLICT (grade_subject_id, section_id, school_year_id) DO NOTHING;

  SELECT id INTO ta_len_7a  FROM public.teacher_assignments WHERE grade_subject_id = gs_len_7_id  AND section_id = sect_7a_id LIMIT 1;
  SELECT id INTO ta_mat_7a  FROM public.teacher_assignments WHERE grade_subject_id = gs_mat_7_id  AND section_id = sect_7a_id LIMIT 1;
  SELECT id INTO ta_cnat_7a FROM public.teacher_assignments WHERE grade_subject_id = gs_cnat_7_id AND section_id = sect_7a_id LIMIT 1;
  SELECT id INTO ta_ing_7a  FROM public.teacher_assignments WHERE grade_subject_id = gs_ing_7_id  AND section_id = sect_7a_id LIMIT 1;
  SELECT id INTO ta_len_8a  FROM public.teacher_assignments WHERE grade_subject_id = gs_len_8_id  AND section_id = sect_8a_id LIMIT 1;
  SELECT id INTO ta_mat_8a  FROM public.teacher_assignments WHERE grade_subject_id = gs_mat_8_id  AND section_id = sect_8a_id LIMIT 1;

  -- ============================================================
  -- MATRICULAS
  -- ============================================================
  INSERT INTO public.enrollments (student_id, section_id, school_year_id, status)
  VALUES
    (student1_id, sect_7a_id, sy_id, 'active'),
    (student2_id, sect_7a_id, sy_id, 'active'),
    (student3_id, sect_8a_id, sy_id, 'active')
  ON CONFLICT (student_id, school_year_id) DO NOTHING;

  -- ============================================================
  -- CALIFICACIONES MENSUALES
  -- ============================================================
  INSERT INTO public.monthly_grades (teacher_assignment_id, student_id, month, school_year_id, week1_score, week2_score, lab_score, exam_score, is_closed)
  VALUES
    (ta_len_7a,  student1_id, 1, sy_id, 8.5, 9.0, 8.0, 8.5, true),
    (ta_len_7a,  student1_id, 2, sy_id, 9.0, 8.5, 9.5, 9.0, true),
    (ta_len_7a,  student1_id, 3, sy_id, 9.5, 9.0, 9.0, 9.5, false),
    (ta_mat_7a,  student1_id, 1, sy_id, 7.5, 8.0, 7.0, 7.5, true),
    (ta_mat_7a,  student1_id, 2, sy_id, 8.0, 8.5, 8.0, 8.0, true),
    (ta_mat_7a,  student1_id, 3, sy_id, 8.5, 9.0, 8.5, 9.0, false),
    (ta_cnat_7a, student1_id, 1, sy_id, 9.0, 9.5, 9.0, 8.5, true),
    (ta_cnat_7a, student1_id, 2, sy_id, 9.5, 9.0, 9.5, 9.0, true),
    (ta_len_7a,  student2_id, 1, sy_id, 9.5,10.0, 9.5, 9.5, true),
    (ta_len_7a,  student2_id, 2, sy_id,10.0, 9.5,10.0, 9.5, true),
    (ta_len_7a,  student2_id, 3, sy_id, 9.0, 9.5,10.0, 9.5, false),
    (ta_mat_7a,  student2_id, 1, sy_id, 8.5, 9.0, 8.5, 8.5, true),
    (ta_mat_7a,  student2_id, 2, sy_id, 9.0, 9.5, 9.0, 9.0, true),
    (ta_len_8a,  student3_id, 1, sy_id, 7.0, 7.5, 7.0, 6.5, true),
    (ta_len_8a,  student3_id, 2, sy_id, 7.5, 8.0, 7.5, 7.5, true),
    (ta_len_8a,  student3_id, 3, sy_id, 8.0, 7.5, 8.0, 8.0, false),
    (ta_mat_8a,  student3_id, 1, sy_id, 6.5, 7.0, 6.5, 7.0, true),
    (ta_mat_8a,  student3_id, 2, sy_id, 7.0, 7.5, 7.0, 7.5, true)
  ON CONFLICT (teacher_assignment_id, student_id, month, school_year_id) DO NOTHING;

  -- ============================================================
  -- AULAS VIRTUALES
  -- ============================================================
  INSERT INTO public.classrooms (section_id, school_year_id, name, description, color, is_active)
  VALUES
    (sect_7a_id, sy_id, '7 Grado A 2026', 'Aula virtual del Septimo Grado seccion A', '#2E7FE8', true),
    (sect_8a_id, sy_id, '8 Grado A 2026', 'Aula virtual del Octavo Grado seccion A',  '#00CFCF', true)
  ON CONFLICT (section_id, school_year_id) DO NOTHING;

  SELECT id INTO classroom_7a FROM public.classrooms WHERE section_id = sect_7a_id LIMIT 1;
  SELECT id INTO classroom_8a FROM public.classrooms WHERE section_id = sect_8a_id LIMIT 1;

  INSERT INTO public.classroom_teachers (classroom_id, teacher_id, is_primary)
  VALUES
    (classroom_7a, teacher1_id, true),
    (classroom_7a, teacher2_id, false),
    (classroom_8a, teacher1_id, true),
    (classroom_8a, teacher2_id, false)
  ON CONFLICT (classroom_id, teacher_id) DO NOTHING;

  INSERT INTO public.classroom_posts (classroom_id, author_id, content, created_at)
  VALUES
    (classroom_7a, uid_docente1, 'Bienvenidos al aula virtual de 7 Grado A. Aqui publicare materiales, tareas y avisos importantes. Mucho exito este ano!', NOW() - INTERVAL '30 days'),
    (classroom_7a, uid_docente1, 'Recordatorio: la tarea de Lenguaje sobre el cuento El Principito debe entregarse el viernes.', NOW() - INTERVAL '5 days'),
    (classroom_7a, uid_docente2, 'Matematicas: manana tenemos practica de fracciones. El examen mensual es el proximo miercoles.', NOW() - INTERVAL '2 days'),
    (classroom_8a, uid_docente2, 'Bienvenidos a 8 Grado A. Este ano trabajaremos con metodologia de proyectos. Listos para un gran ano!', NOW() - INTERVAL '28 days'),
    (classroom_8a, uid_docente1, 'El guion de Lenguaje de enero ya esta disponible. Por favor revisarlo antes de la clase del lunes.', NOW() - INTERVAL '10 days');

  -- ============================================================
  -- ASISTENCIA
  -- ============================================================
  asess1_id := gen_random_uuid();
  asess2_id := gen_random_uuid();
  asess3_id := gen_random_uuid();

  INSERT INTO public.attendance_sessions (id, section_id, school_year_id, teacher_id, session_date, subject_catalog_id, is_closed)
  VALUES
    (asess1_id, sect_7a_id, sy_id, teacher1_id, CURRENT_DATE - 5, subj_len_id,  true),
    (asess2_id, sect_7a_id, sy_id, teacher2_id, CURRENT_DATE - 4, subj_mat_id,  true),
    (asess3_id, sect_8a_id, sy_id, teacher2_id, CURRENT_DATE - 3, subj_mat_id,  true)
  ON CONFLICT (section_id, session_date, subject_catalog_id) DO NOTHING;

  INSERT INTO public.attendance_records (attendance_session_id, student_id, status)
  VALUES
    (asess1_id, student1_id, 'present'),
    (asess1_id, student2_id, 'present'),
    (asess2_id, student1_id, 'late'),
    (asess2_id, student2_id, 'present'),
    (asess3_id, student3_id, 'absent')
  ON CONFLICT (attendance_session_id, student_id) DO NOTHING;

  -- ============================================================
  -- FINANZAS
  -- ============================================================
  INSERT INTO public.billing_periods (name, year, month, due_date, late_fee_amount, late_fee_type, is_active)
  VALUES
    ('Enero 2026',   2026, 1, '2026-01-10', 5.00, 'fixed', true),
    ('Febrero 2026', 2026, 2, '2026-02-10', 5.00, 'fixed', true),
    ('Marzo 2026',   2026, 3, '2026-03-10', 5.00, 'fixed', true),
    ('Abril 2026',   2026, 4, '2026-04-10', 5.00, 'fixed', true)
  ON CONFLICT (year, month) DO NOTHING;

  SELECT id INTO bp1 FROM public.billing_periods WHERE year=2026 AND month=1 LIMIT 1;
  SELECT id INTO bp2 FROM public.billing_periods WHERE year=2026 AND month=2 LIMIT 1;
  SELECT id INTO bp3 FROM public.billing_periods WHERE year=2026 AND month=3 LIMIT 1;
  SELECT id INTO bp4 FROM public.billing_periods WHERE year=2026 AND month=4 LIMIT 1;

  INSERT INTO public.invoices (student_id, billing_period_id, concept, amount, due_date, status)
  VALUES
    (student1_id, bp1, 'Cuota mensual Enero 2026',   75.00, '2026-01-10', 'paid'),
    (student1_id, bp2, 'Cuota mensual Febrero 2026', 75.00, '2026-02-10', 'paid'),
    (student1_id, bp3, 'Cuota mensual Marzo 2026',   75.00, '2026-03-10', 'paid'),
    (student1_id, bp4, 'Cuota mensual Abril 2026',   75.00, '2026-04-10', 'pending'),
    (student2_id, bp1, 'Cuota mensual Enero 2026',   75.00, '2026-01-10', 'paid'),
    (student2_id, bp2, 'Cuota mensual Febrero 2026', 75.00, '2026-02-10', 'paid'),
    (student2_id, bp3, 'Cuota mensual Marzo 2026',   75.00, '2026-03-10', 'overdue'),
    (student2_id, bp4, 'Cuota mensual Abril 2026',   75.00, '2026-04-10', 'overdue'),
    (student3_id, bp1, 'Cuota mensual Enero 2026',   75.00, '2026-01-10', 'paid'),
    (student3_id, bp2, 'Cuota mensual Febrero 2026', 75.00, '2026-02-10', 'partial'),
    (student3_id, bp3, 'Cuota mensual Marzo 2026',   75.00, '2026-03-10', 'pending'),
    (student3_id, bp4, 'Cuota mensual Abril 2026',   75.00, '2026-04-10', 'pending');

  INSERT INTO public.payments (student_id, amount, concept, payment_date, payment_method, status, receipt_number)
  VALUES
    (student1_id, 75.00, 'Cuota Enero 2026',   '2026-01-08', 'transfer', 'paid', 'REC-001'),
    (student1_id, 75.00, 'Cuota Febrero 2026', '2026-02-07', 'cash',     'paid', 'REC-002'),
    (student1_id, 75.00, 'Cuota Marzo 2026',   '2026-03-09', 'transfer', 'paid', 'REC-003'),
    (student2_id, 75.00, 'Cuota Enero 2026',   '2026-01-09', 'transfer', 'paid', 'REC-004'),
    (student2_id, 75.00, 'Cuota Febrero 2026', '2026-02-10', 'cash',     'paid', 'REC-005'),
    (student3_id, 75.00, 'Cuota Enero 2026',   '2026-01-10', 'card',     'paid', 'REC-006'),
    (student3_id, 40.00, 'Cuota parcial Feb',  '2026-02-15', 'cash',     'paid', 'REC-007');

  INSERT INTO public.expenses (category, description, amount, expense_date, payment_method)
  VALUES
    ('Servicios Basicos', 'Electricidad enero',          180.00, '2026-01-05', 'transfer'),
    ('Servicios Basicos', 'Agua y alcantarillado enero',  45.00, '2026-01-05', 'transfer'),
    ('Mantenimiento',     'Reparacion sillas aula 7A',    85.00, '2026-01-12', 'cash'),
    ('Papeleria',         'Resmas de papel y marcadores', 60.00, '2026-01-15', 'cash'),
    ('Servicios Basicos', 'Electricidad febrero',        175.00, '2026-02-05', 'transfer'),
    ('Salarios',          'Planilla docentes febrero',  3200.00, '2026-02-28', 'transfer'),
    ('Tecnologia',        'Licencia antivirus',          120.00, '2026-03-01', 'transfer'),
    ('Papeleria',         'Material didactico ciencias',  95.00, '2026-03-10', 'cash'),
    ('Servicios Basicos', 'Electricidad marzo',          190.00, '2026-03-05', 'transfer'),
    ('Salarios',          'Planilla docentes marzo',    3200.00, '2026-03-31', 'transfer');

  -- ============================================================
  -- BIBLIOTECA
  -- ============================================================
  INSERT INTO public.books (title, author, isbn, category, publisher, publication_year, total_copies, available_copies, location, description, is_active)
  VALUES
    ('El Principito',          'Antoine de Saint-Exupery', '978-84-261-3455-0', 'Literatura',  'Salamandra', 2015, 5, 4, 'Estante A-1', 'Clasico de la literatura universal',    true),
    ('Matematicas 7 Grado',    'MINED El Salvador',        '978-99923-71-00-1', 'Textos',      'MINED',      2024, 8, 6, 'Estante B-2', 'Libro oficial de matematicas',          true),
    ('Ciencias Naturales 7',   'MINED El Salvador',        '978-99923-71-00-2', 'Textos',      'MINED',      2024, 8, 7, 'Estante B-3', 'Libro oficial de ciencias',             true),
    ('Historia de El Salvador', 'Jorge Larde y Larin',     '978-84-00-00501-4', 'Historia',    'CONCULTURA', 2018, 3, 3, 'Estante C-1', 'Historia nacional para estudiantes',    true),
    ('Algebra Elemental',      'Earl W. Swokowski',        '978-970-686-223-7', 'Matematicas', 'Cengage',    2019, 4, 3, 'Estante B-1', 'Algebra para bachillerato',             true),
    ('Ingles en Accion',       'Raymond Murphy',           '978-0-521-60061-4', 'Idiomas',     'Cambridge',  2021, 6, 5, 'Estante A-3', 'Grammar in use nivel intermedio',       true)
  ON CONFLICT (isbn) DO NOTHING;

  SELECT id INTO book1_id FROM public.books WHERE isbn = '978-84-261-3455-0' LIMIT 1;
  SELECT id INTO book2_id FROM public.books WHERE isbn = '978-99923-71-00-1' LIMIT 1;

  INSERT INTO public.book_loans (book_id, student_id, loaned_by, loan_date, due_date, status)
  VALUES
    (book1_id, student1_id, uid_biblioteca, CURRENT_DATE - 7,  CURRENT_DATE + 7,  'active'),
    (book2_id, student2_id, uid_biblioteca, CURRENT_DATE - 14, CURRENT_DATE - 2,  'overdue');

  -- ============================================================
  -- TIENDA
  -- ============================================================
  INSERT INTO public.store_categories (name, icon, is_active, sort_order)
  VALUES
    ('Utiles Escolares', '📏', true, 1),
    ('Snacks y Bebidas', '🥤', true, 2),
    ('Uniformes',        '👕', true, 3)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO cat1 FROM public.store_categories WHERE name = 'Utiles Escolares' LIMIT 1;
  SELECT id INTO cat2 FROM public.store_categories WHERE name = 'Snacks y Bebidas' LIMIT 1;
  SELECT id INTO cat3 FROM public.store_categories WHERE name = 'Uniformes'        LIMIT 1;

  INSERT INTO public.store_products (category_id, name, description, price, stock, min_stock, is_available)
  VALUES
    (cat1, 'Cuaderno universitario 100 hojas', 'Cuaderno rayado marca Norma',      1.50,  45, 10, true),
    (cat1, 'Lapicero azul BIC',                'Lapicero punto fino',              0.25, 120, 20, true),
    (cat1, 'Folder plastico A4',               'Folder transparente con ganchos',  0.75,  30,  5, true),
    (cat2, 'Agua purificada 500ml',            'Agua natural embotellada',         0.50,  80, 15, true),
    (cat2, 'Jugo de naranja 250ml',            'Jugo natural sin azucar',          0.75,  40, 10, true),
    (cat2, 'Galletas integrales',              'Paquete 30g sin conservantes',     0.35,  60, 10, true),
    (cat3, 'Camiseta blanca talla M',          'Camisa oficial del colegio',       8.00,  15,  3, true),
    (cat3, 'Pantalon azul marino talla 28',    'Pantalon de vestir oficial',      12.00,  10,  3, true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO prod1 FROM public.store_products WHERE name = 'Cuaderno universitario 100 hojas' LIMIT 1;
  SELECT id INTO prod2 FROM public.store_products WHERE name = 'Lapicero azul BIC'               LIMIT 1;

  order1_id := gen_random_uuid();
  INSERT INTO public.store_orders (id, student_id, ordered_by, status, total)
  VALUES (order1_id, student1_id, uid_alumno1, 'delivered', 2.25);
  INSERT INTO public.store_order_items (order_id, product_id, quantity, unit_price, subtotal)
  VALUES
    (order1_id, prod1, 1, 1.50, 1.50),
    (order1_id, prod2, 3, 0.25, 0.75);

  -- ============================================================
  -- INVENTARIO
  -- ============================================================
  INSERT INTO public.inventory (name, category, quantity, min_quantity, unit, location, supplier, unit_cost, last_restocked)
  VALUES
    ('Resmas de papel bond',         'Papeleria',  25,  5, 'resmas',   'Bodega A', 'Libreria Nacional',   4.50, '2026-01-15'),
    ('Marcadores de pizarra negros', 'Papeleria',  30, 10, 'unidades', 'Bodega A', 'Offimundo',           0.85, '2026-02-01'),
    ('Desinfectante multiusos',      'Limpieza',   12,  3, 'litros',   'Bodega B', 'Distribuidora Lima',  3.20, '2026-01-20'),
    ('Sillas escolares',             'Mobiliario', 80, 20, 'unidades', 'Aula 7A',  'Muebleria Central',  45.00, '2025-08-01'),
    ('Computadoras HP',              'Tecnologia', 20,  5, 'unidades', 'Lab Comp', 'TechSV',            450.00, '2025-06-15'),
    ('Tinta para impresora negra',   'Tecnologia',  4,  2, 'cartuchos','Bodega A', 'OfficeMax',          12.00, '2026-03-10'),
    ('Jabon liquido de manos',       'Limpieza',   10,  4, 'litros',   'Bodega B', 'Distribuidora Lima',  2.80, '2026-03-05')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- COMUNICADOS
  -- ============================================================
  INSERT INTO public.announcements (title, body, audience, is_published, requires_confirmation, published_at, created_by)
  VALUES
    ('Bienvenida ano escolar 2026',
     'Estimada comunidad educativa, bienvenidos al ano escolar 2026. Las clases inician el lunes 5 de enero.',
     'all', true, false, NOW() - INTERVAL '90 days', uid_master),
    ('Reunion de padres de familia Marzo',
     'Se convoca a todos los padres a la reunion informativa del primer trimestre el viernes 14 de marzo a las 3:00 PM en el auditorio.',
     'padres', true, true, NOW() - INTERVAL '20 days', uid_direccion),
    ('Semana de examenes primer trimestre',
     'Del 25 al 29 de marzo se realizaran los examenes del primer trimestre. Los horarios estan publicados en el calendario.',
     'alumnos', true, false, NOW() - INTERVAL '15 days', uid_docente1),
    ('Capacitacion docente uso del modulo de IA',
     'El sabado 8 de febrero se realizara capacitacion para docentes sobre generacion de examenes y calificacion automatica con IA.',
     'docentes', true, false, NOW() - INTERVAL '50 days', uid_admin)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CALENDARIO
  -- ============================================================
  INSERT INTO public.calendar_events (title, description, start_date, end_date, all_day, audience, color, created_by)
  VALUES
    ('Inicio ano escolar 2026',     'Primer dia de clases',              '2026-01-05 07:00:00', '2026-01-05 13:00:00', true,  'all',     '#2E7FE8', uid_master),
    ('Reunion de padres Q1',        'Entrega de notas primer trimestre', '2026-03-14 15:00:00', '2026-03-14 17:00:00', false, 'parents', '#00CFCF', uid_direccion),
    ('Examenes primer trimestre',   'Semana de examenes Q1',             '2026-03-25 07:00:00', '2026-03-29 13:00:00', true,  'all',     '#F59E0B', uid_docente1),
    ('Dia del maestro',             'Celebracion dia del educador',      '2026-06-22 07:00:00', '2026-06-22 13:00:00', true,  'all',     '#10B981', uid_admin),
    ('Vacaciones Semana Santa',     'Asueto vacacional',                 '2026-04-13 00:00:00', '2026-04-17 23:59:00', true,  'all',     '#6366F1', uid_master),
    ('Capacitacion docente IA',     'Taller uso modulo IA del sistema',  '2026-02-08 08:00:00', '2026-02-08 12:00:00', false, 'teachers','#EC4899', uid_admin),
    ('Acto de graduacion 2026',     'Ceremonia de graduacion anual',     '2026-10-24 10:00:00', '2026-10-24 14:00:00', false, 'all',     '#F59E0B', uid_master)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CHAT
  -- ============================================================
  INSERT INTO public.chat_channels (id, name, type, created_by, is_active)
  VALUES
    (gen_random_uuid(), 'General E-OS', 'group', uid_master,    true),
    (gen_random_uuid(), 'Docentes',     'group', uid_direccion, true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO chan_gen_id FROM public.chat_channels WHERE name = 'General E-OS' LIMIT 1;
  SELECT id INTO chan_doc_id FROM public.chat_channels WHERE name = 'Docentes'     LIMIT 1;

  INSERT INTO public.chat_memberships (channel_id, user_id, role)
  VALUES
    (chan_gen_id, uid_master,       'admin'),
    (chan_gen_id, uid_direccion,    'admin'),
    (chan_gen_id, uid_admin,        'member'),
    (chan_gen_id, uid_docente1,     'member'),
    (chan_gen_id, uid_docente2,     'member'),
    (chan_gen_id, uid_contabilidad, 'member'),
    (chan_gen_id, uid_biblioteca,   'member'),
    (chan_gen_id, uid_tienda,       'member'),
    (chan_doc_id, uid_master,       'admin'),
    (chan_doc_id, uid_direccion,    'admin'),
    (chan_doc_id, uid_docente1,     'member'),
    (chan_doc_id, uid_docente2,     'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  INSERT INTO public.chat_messages (channel_id, sender_id, body, created_at)
  VALUES
    (chan_gen_id, uid_master,    'Buenos dias a toda la comunidad E-OS. Bienvenidos al nuevo ano escolar 2026!', NOW() - INTERVAL '88 days'),
    (chan_gen_id, uid_docente1,  'Gracias director! Lista para un excelente ano.', NOW() - INTERVAL '88 days'),
    (chan_gen_id, uid_docente2,  'Buenos dias. Emocionados de comenzar con las nuevas herramientas de IA.', NOW() - INTERVAL '87 days'),
    (chan_gen_id, uid_admin,     'Recordatorio: subir planillas actualizadas antes del viernes.', NOW() - INTERVAL '10 days'),
    (chan_doc_id, uid_direccion, 'Estimados docentes, recuerden subir sus guiones de clase antes del lunes.', NOW() - INTERVAL '7 days'),
    (chan_doc_id, uid_docente1,  'Ya los subi, los revisen. Incluyo el temario de examen tambien.', NOW() - INTERVAL '6 days'),
    (chan_doc_id, uid_docente2,  'Confirmo, mis guiones estan cargados en el sistema para las 4 materias.', NOW() - INTERVAL '5 days');

  -- ============================================================
  -- DISCIPLINA
  -- ============================================================
  INSERT INTO public.student_disciplinary (student_id, date, type, description, reported_by, resolved)
  VALUES
    (student3_id, CURRENT_DATE - 20, 'warning',      'El alumno llego tarde 3 veces en la semana sin justificacion.',                    uid_docente2, false),
    (student1_id, CURRENT_DATE - 45, 'commendation', 'Excelente desempeno en proyecto de ciencias. Obtuvo el primer lugar del grado.',  uid_docente2, true),
    (student2_id, CURRENT_DATE - 30, 'commendation', 'Represento al colegio en el concurso de ortografia intercolegial.',               uid_docente1, true)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- STAFF
  -- ============================================================
  INSERT INTO public.staff (full_name, national_id, birth_date, gender, email, phone, staff_type, employee_number, position, department, hire_date, contract_type, salary, is_active, user_id)
  VALUES
    ('Maria Elena Castillo', '01234567-8', '1988-05-12', 'F', 'docente1@eos.edu.sv',       '7111-0004', 'docente',        'EMP-001', 'Docente de Lenguaje e Ingles',      'Academico',    '2022-01-10', 'tiempo_completo', 650.00, true, uid_docente1),
    ('Jose Antonio Lopez',   '09876543-2', '1985-09-20', 'M', 'docente2@eos.edu.sv',       '7111-0005', 'docente',        'EMP-002', 'Docente de Matematicas y Ciencias', 'Academico',    '2021-06-01', 'tiempo_completo', 700.00, true, uid_docente2),
    ('Roberto Fuentes',      '05555555-3', '1990-03-25', 'M', 'administracion@eos.edu.sv', '7111-0003', 'administracion', 'EMP-003', 'Encargado de Administracion',       'Administracion','2023-01-15', 'tiempo_completo', 550.00, true, uid_admin),
    ('Ana Sofia Rivas',      '07777777-4', '1978-11-30', 'F', 'director@eos.edu.sv',       '7111-0002', 'director',       'EMP-004', 'Directora Academica',               'Direccion',    '2019-06-01', 'tiempo_completo', 900.00, true, uid_direccion),
    ('Patricia Gomez',       '06666666-5', '1992-08-14', 'F', 'contabilidad@eos.edu.sv',   '7111-0012', 'administracion', 'EMP-005', 'Encargada de Contabilidad',         'Finanzas',     '2022-08-01', 'tiempo_completo', 580.00, true, uid_contabilidad)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- HORARIOS (7A)
  -- ============================================================
  INSERT INTO public.class_schedules (section_id, school_year_id, subject_catalog_id, teacher_id, day_of_week, start_time, end_time, color)
  VALUES
    (sect_7a_id, sy_id, subj_len_id,  teacher1_id, 'lunes',     '07:00', '08:20', '#2E7FE8'),
    (sect_7a_id, sy_id, subj_mat_id,  teacher2_id, 'lunes',     '08:20', '09:40', '#00CFCF'),
    (sect_7a_id, sy_id, subj_cnat_id, teacher2_id, 'lunes',     '10:00', '11:20', '#10B981'),
    (sect_7a_id, sy_id, subj_ing_id,  teacher1_id, 'lunes',     '11:20', '12:40', '#F59E0B'),
    (sect_7a_id, sy_id, subj_len_id,  teacher1_id, 'martes',    '07:00', '08:20', '#2E7FE8'),
    (sect_7a_id, sy_id, subj_mat_id,  teacher2_id, 'martes',    '08:20', '09:40', '#00CFCF'),
    (sect_7a_id, sy_id, subj_cnat_id, teacher2_id, 'miercoles', '07:00', '08:20', '#10B981'),
    (sect_7a_id, sy_id, subj_mat_id,  teacher2_id, 'miercoles', '08:20', '09:40', '#00CFCF'),
    (sect_7a_id, sy_id, subj_len_id,  teacher1_id, 'jueves',    '07:00', '08:20', '#2E7FE8'),
    (sect_7a_id, sy_id, subj_ing_id,  teacher1_id, 'jueves',    '08:20', '09:40', '#F59E0B'),
    (sect_7a_id, sy_id, subj_mat_id,  teacher2_id, 'viernes',   '07:00', '08:20', '#00CFCF'),
    (sect_7a_id, sy_id, subj_len_id,  teacher1_id, 'viernes',   '08:20', '09:40', '#2E7FE8')
  ON CONFLICT (section_id, school_year_id, day_of_week, start_time) DO NOTHING;

END $$;

-- ============================================================
-- VERIFICACION FINAL
-- ============================================================
SELECT 'Profiles:'      AS tabla, count(*) FROM public.profiles
UNION ALL SELECT 'Docentes:',     count(*) FROM public.teachers
UNION ALL SELECT 'Alumnos:',      count(*) FROM public.students
UNION ALL SELECT 'Padres:',       count(*) FROM public.parents
UNION ALL SELECT 'Matriculas:',   count(*) FROM public.enrollments
UNION ALL SELECT 'Calificaciones:',count(*) FROM public.monthly_grades
UNION ALL SELECT 'Asistencia:',   count(*) FROM public.attendance_records
UNION ALL SELECT 'Pagos:',        count(*) FROM public.payments
UNION ALL SELECT 'Facturas:',     count(*) FROM public.invoices
UNION ALL SELECT 'Libros:',       count(*) FROM public.books
UNION ALL SELECT 'Productos:',    count(*) FROM public.store_products
UNION ALL SELECT 'Inventario:',   count(*) FROM public.inventory
UNION ALL SELECT 'Comunicados:',  count(*) FROM public.announcements
UNION ALL SELECT 'Eventos:',      count(*) FROM public.calendar_events
UNION ALL SELECT 'Staff:',        count(*) FROM public.staff;
