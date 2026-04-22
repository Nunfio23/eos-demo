-- ============================================================
-- E-OS - E4: Chat, Aulas Virtuales, Asistencia por Grado
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. AULAS VIRTUALES POR GRADO ────────────────────────────
CREATE TABLE IF NOT EXISTS public.classrooms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  color          text DEFAULT '#6366f1',
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(section_id, school_year_id)
);

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classrooms_select_auth" ON public.classrooms FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "classrooms_admin_all" ON public.classrooms FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);


-- ─── 2. DOCENTES POR AULA ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_teachers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id   uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  is_primary   boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(classroom_id, teacher_id)
);

ALTER TABLE public.classroom_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_select_auth" ON public.classroom_teachers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ct_admin_all" ON public.classroom_teachers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 3. ANUNCIOS DEL AULA ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  attachment_url text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.classroom_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select_auth" ON public.classroom_posts FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "cp_docente_insert" ON public.classroom_posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "cp_author_delete" ON public.classroom_posts FOR DELETE
  USING (author_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
  );

-- ─── 4. SESIONES DE ASISTENCIA ───────────────────────────────
-- Cada sesión = un día de clase para una sección
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  teacher_id     uuid REFERENCES public.teachers(id),
  session_date   date NOT NULL,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id),
  notes          text,
  is_closed      boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(section_id, session_date, subject_catalog_id)
);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as_select_auth" ON public.attendance_sessions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "as_teacher_insert" ON public.attendance_sessions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
      OR EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_id)
    )
  );
CREATE POLICY "as_teacher_update" ON public.attendance_sessions FOR UPDATE
  USING (
    NOT is_closed AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
      OR EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_id)
    )
  );

-- ─── 5. REGISTROS DE ASISTENCIA ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id            uuid REFERENCES public.students(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','late','excused')),
  note                  text,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar_select_auth" ON public.attendance_records FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ar_teacher_all" ON public.attendance_records FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
    OR EXISTS (
      SELECT 1 FROM attendance_sessions s
      JOIN teachers t ON t.id = s.teacher_id
      WHERE s.id = attendance_session_id AND t.user_id = auth.uid()
    )
  );

-- ─── 6. CANALES DE CHAT ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'group'
    CHECK (type IN ('direct','group','classroom','announcement')),
  section_id  uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES public.profiles(id),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
-- NOTA: La policy cc_select_member se crea DESPUÉS de chat_memberships (ver más abajo)
CREATE POLICY "cc_admin_all" ON public.chat_channels FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
);

-- ─── 7. MIEMBROS DEL CANAL ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at  timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.chat_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_select_own" ON public.chat_memberships FOR SELECT
  USING (user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
  );
CREATE POLICY "cm_admin_insert" ON public.chat_memberships FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
    OR user_id = auth.uid()
  );
CREATE POLICY "cm_own_delete" ON public.chat_memberships FOR DELETE
  USING (user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
  );

-- ─── 8. MENSAJES DE CHAT ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        text NOT NULL,
  attachment_url text,
  reply_to    uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_select_member" ON public.chat_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id = channel_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
  );
CREATE POLICY "msg_member_insert" ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id = channel_id AND cm.user_id = auth.uid())
  );
CREATE POLICY "msg_own_delete" ON public.chat_messages FOR DELETE
  USING (sender_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
  );

-- ─── 9. POLICY cc_select_member (requiere chat_memberships) ──
-- Se crea aquí porque referencia chat_memberships (creada arriba)
CREATE POLICY "cc_select_member" ON public.chat_channels FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('master','direccion','administracion'))
    OR EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id = id AND cm.user_id = auth.uid())
  );

-- ─── 10. HABILITAR REALTIME EN CHAT ──────────────────────────
-- Ejecutar MANUALMENTE en Supabase Dashboard > Database > Replication
-- Agregar tablas: chat_messages, chat_memberships a replication

-- ─── 11. ÍNDICES DE RENDIMIENTO ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_section ON public.attendance_sessions(section_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON public.enrollments(section_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_grade_entries_ta ON public.grade_entries(teacher_assignment_id, student_id);
