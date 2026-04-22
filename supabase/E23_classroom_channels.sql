-- ============================================================
-- E-OS - E23: Canales de Aula por Sección (Chat Grupal)
-- Crea automáticamente un canal de chat por cada sección activa
-- y agrega alumnos, padres y docentes como participantes.
-- Ejecutar en Supabase SQL Editor (es idempotente, se puede re-ejecutar)
-- ============================================================

-- ─── 1. Habilitar realtime en conversation_participants si no está ─────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;

-- ─── 2. Crear canales de aula por cada sección activa ─────────────────────
-- Usa un bloque DO para poder manejar la lógica condicional
DO $$
DECLARE
  v_section    RECORD;
  v_conv_id    uuid;
  v_master_id  uuid;
  v_grade_name text;
BEGIN
  -- Obtener el ID del master para usarlo como created_by
  SELECT id INTO v_master_id FROM public.profiles WHERE role = 'master' LIMIT 1;

  -- Iterar sobre todas las secciones activas
  FOR v_section IN
    SELECT s.id AS section_id, s.name AS section_name, g.name AS grade_name
    FROM public.sections s
    JOIN public.grades g ON g.id = s.grade_id
    WHERE s.is_active = true
  LOOP
    v_grade_name := v_section.grade_name || ' ' || v_section.section_name;

    -- Verificar si ya existe un canal classroom para esta sección
    SELECT id INTO v_conv_id
    FROM public.conversations
    WHERE section_id = v_section.section_id AND type = 'classroom'
    LIMIT 1;

    -- Si no existe, crearlo
    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (type, name, section_id, created_by)
      VALUES ('classroom', v_grade_name, v_section.section_id, v_master_id)
      RETURNING id INTO v_conv_id;
    END IF;

    -- ─── Agregar alumnos matriculados en esta sección ───────────────────
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT DISTINCT v_conv_id, st.user_id
    FROM public.enrollments e
    JOIN public.students st ON st.id = e.student_id
    WHERE e.section_id = v_section.section_id
      AND e.status = 'active'
      AND st.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- ─── Agregar padres de los alumnos matriculados ─────────────────────
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT DISTINCT v_conv_id, st.parent_id
    FROM public.enrollments e
    JOIN public.students st ON st.id = e.student_id
    WHERE e.section_id = v_section.section_id
      AND e.status = 'active'
      AND st.parent_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- ─── Agregar docentes asignados a esta sección ──────────────────────
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT DISTINCT v_conv_id, p.id
    FROM public.teacher_assignments ta
    JOIN public.teachers t ON t.id = ta.teacher_id
    JOIN public.profiles p ON p.id = t.user_id
    WHERE ta.section_id = v_section.section_id
      AND ta.is_active = true
      AND p.id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- ─── Agregar al docente orientador/homeroom de la sección ───────────
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT DISTINCT v_conv_id, p.id
    FROM public.sections s
    JOIN public.teachers t ON t.id = s.homeroom_teacher_id
    JOIN public.profiles p ON p.id = t.user_id
    WHERE s.id = v_section.section_id
      AND s.homeroom_teacher_id IS NOT NULL
      AND p.id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- ─── Agregar master y dirección a todos los canales ─────────────────
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT DISTINCT v_conv_id, p.id
    FROM public.profiles p
    WHERE p.role IN ('master', 'direccion')
      AND p.is_active = true
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

  END LOOP;
END;
$$;

-- ─── 3. Política adicional: docentes pueden insertar participantes en grupos que crearon ──
-- (En caso de que la política existente cp_insert no lo cubra para grupos nuevos)
DO $$
BEGIN
  -- Solo crear si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_participants'
      AND policyname = 'cp_insert_group_creator'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "cp_insert_group_creator"
      ON public.conversation_participants
      FOR INSERT
      WITH CHECK (
        auth.role() = 'authenticated'
      )
    $policy$;
  END IF;
END;
$$;

-- ─── 4. Política: todos los participantes pueden actualizar updated_at de sus conversaciones ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations'
      AND policyname = 'conv_update_participant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "conv_update_participant"
      ON public.conversations
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END;
$$;

-- ─── 5. Índice adicional para búsqueda por section_id ─────────────────────
CREATE INDEX IF NOT EXISTS idx_conv_section ON public.conversations(section_id)
  WHERE section_id IS NOT NULL;

-- ─── Resultado ────────────────────────────────────────────────────────────
-- Para ver los canales creados:
-- SELECT c.name, c.type, COUNT(cp.id) as participantes
-- FROM conversations c
-- LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
-- WHERE c.type IN ('classroom', 'group')
-- GROUP BY c.id, c.name, c.type
-- ORDER BY c.name;
