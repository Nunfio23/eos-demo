-- E12: Backfill monthly_grades desde calificaciones_notas
-- Corre DESPUÉS de e9_monthly_grades_docente_rls.sql
-- Sincroniza todas las notas ya guardadas en calificaciones_notas
-- hacia monthly_grades para que aparezcan en el Libro de Notas y Boleta.
--
-- Mapeado:
--   semana → mes_local = ceil(semana/4), tipoIdx = (semana-1)%4
--   trimestre + mes_local → mes_calendario (2=Feb, 3=Mar, etc.)
--   tipoIdx → campo (0=week1, 1=week2, 2=lab_score, 3=exam_score)

DO $$
DECLARE
  rec        RECORD;
  v_mes      INT;
  v_tipo_idx INT;
  v_calmonth INT;
  v_ta_id    UUID;
  v_field    TEXT;
  v_count    INT := 0;
BEGIN
  FOR rec IN
    SELECT cn.student_id, cn.subject_id, cn.section_id,
           cn.school_year_id, cn.trimestre, cn.semana, cn.score
    FROM   public.calificaciones_notas cn
    WHERE  cn.school_year_id IS NOT NULL
  LOOP
    -- Mes local dentro del trimestre (1, 2 ó 3)
    v_mes      := CEIL(rec.semana::float / 4)::INT;
    v_tipo_idx := (rec.semana - 1) % 4;

    -- Mes calendario
    v_calmonth := CASE
      WHEN rec.trimestre = '1er Trimestre' AND v_mes = 1 THEN 2   -- Feb
      WHEN rec.trimestre = '1er Trimestre' AND v_mes = 2 THEN 3   -- Mar
      WHEN rec.trimestre = '1er Trimestre' AND v_mes = 3 THEN 4   -- Abr
      WHEN rec.trimestre = '2do Trimestre' AND v_mes = 1 THEN 5   -- May
      WHEN rec.trimestre = '2do Trimestre' AND v_mes = 2 THEN 6   -- Jun
      WHEN rec.trimestre = '2do Trimestre' AND v_mes = 3 THEN 7   -- Jul
      WHEN rec.trimestre = '3er Trimestre' AND v_mes = 1 THEN 8   -- Ago
      WHEN rec.trimestre = '3er Trimestre' AND v_mes = 2 THEN 9   -- Sep
      WHEN rec.trimestre = '3er Trimestre' AND v_mes = 3 THEN 10  -- Oct
      ELSE NULL
    END;

    IF v_calmonth IS NULL THEN CONTINUE; END IF;

    -- Campo en monthly_grades
    v_field := CASE v_tipo_idx
      WHEN 0 THEN 'week1_score'
      WHEN 1 THEN 'week2_score'
      WHEN 2 THEN 'lab_score'
      WHEN 3 THEN 'exam_score'
      ELSE NULL
    END;

    IF v_field IS NULL THEN CONTINUE; END IF;

    -- Buscar teacher_assignment_id
    SELECT ta.id INTO v_ta_id
    FROM   public.teacher_assignments ta
    JOIN   public.grade_subjects gs ON gs.id = ta.grade_subject_id
    WHERE  ta.section_id        = rec.section_id
      AND  gs.subject_catalog_id = rec.subject_id
      AND  ta.school_year_id    = rec.school_year_id
      AND  (ta.is_active IS NOT FALSE)
    ORDER  BY ta.created_at DESC
    LIMIT  1;

    IF v_ta_id IS NULL THEN CONTINUE; END IF;

    -- Upsert en monthly_grades (solo sobreescribe si el campo estaba vacío)
    EXECUTE format(
      'INSERT INTO public.monthly_grades
         (teacher_assignment_id, student_id, school_year_id, month, %I)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (teacher_assignment_id, student_id, month, school_year_id)
       DO UPDATE SET %I = COALESCE(EXCLUDED.%I, public.monthly_grades.%I)',
      v_field, v_field, v_field, v_field
    ) USING v_ta_id, rec.student_id, rec.school_year_id, v_calmonth, rec.score;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill completado: % filas procesadas', v_count;
END $$;
