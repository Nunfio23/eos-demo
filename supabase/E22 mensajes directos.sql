-- ============================================================
-- E-OS - E22: Sistema de Mensajes Directos
-- Red de comunicación interna: alumno↔docente, padre↔docente
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. CONVERSACIONES (reemplaza canales para mensajes directos) ─────────────
-- Una conversación es entre DOS usuarios específicos (tipo DM)
-- O puede ser un grupo (tipo classroom_chat para toda la sección)

CREATE TABLE IF NOT EXISTS public.conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL DEFAULT 'direct'
                CHECK (type IN ('direct', 'group', 'classroom')),
  name          text,                          -- solo para grupos/classroom
  section_id    uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()      -- para ordenar por actividad reciente
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ─── 2. PARTICIPANTES DE LA CONVERSACIÓN ─────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz DEFAULT now(),   -- para calcular mensajes no leídos
  joined_at       timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- ─── 3. MENSAJES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            text NOT NULL,
  reply_to        uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  is_deleted      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- ─── 4. ROW LEVEL SECURITY ───────────────────────────────────

-- Conversations: ver solo si eres participante (o admin)
CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('master', 'direccion', 'administracion')
  )
);

CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

CREATE POLICY "conv_update" ON public.conversations FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('master', 'direccion')
  )
);

-- Participants: ver los de tus conversaciones
CREATE POLICY "cp_select" ON public.conversation_participants FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_id AND cp2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('master', 'direccion')
  )
);

CREATE POLICY "cp_insert" ON public.conversation_participants FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

CREATE POLICY "cp_update_own" ON public.conversation_participants FOR UPDATE USING (
  user_id = auth.uid()
);

-- Messages: ver si eres participante
CREATE POLICY "dm_select" ON public.direct_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('master', 'direccion')
  )
);

CREATE POLICY "dm_insert" ON public.direct_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "dm_delete_own" ON public.direct_messages FOR DELETE USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('master', 'direccion')
  )
);

-- ─── 5. FUNCIÓN: Crear o encontrar conversación directa ──────
-- Evita duplicados: si ya existe DM entre A y B, retorna ese ID
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id uuid;
  v_my_id   uuid := auth.uid();
BEGIN
  -- Buscar conversación directa existente entre los dos usuarios
  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  JOIN public.conversations c
    ON c.id = cp1.conversation_id
  WHERE cp1.user_id = v_my_id
    AND cp2.user_id = other_user_id
    AND c.type = 'direct'
  LIMIT 1;

  -- Si no existe, crear
  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (type, created_by)
    VALUES ('direct', v_my_id)
    RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_my_id), (v_conv_id, other_user_id);
  END IF;

  RETURN v_conv_id;
END;
$$;

-- ─── 6. FUNCIÓN: Actualizar updated_at al recibir mensaje ─────
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conv_timestamp
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();

-- ─── 7. ÍNDICES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dm_conv ON public.direct_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cp_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_updated ON public.conversations(updated_at DESC);

-- ─── 8. HABILITAR REALTIME ────────────────────────────────────
-- Ir a Supabase Dashboard → Database → Replication
-- Agregar las tablas: direct_messages, conversation_participants, conversations
-- O ejecutar:
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ─── 9. CREAR CANALES DE AULA AUTOMÁTICAMENTE ────────────────
-- Crea un chat grupal por cada sección activa del año escolar vigente
-- Ejecutar después de tener secciones creadas
-- INSERT INTO public.conversations (type, name, section_id, created_by)
-- SELECT 'classroom', s.name, s.id, (SELECT id FROM profiles WHERE role = 'master' LIMIT 1)
-- FROM public.sections s
-- WHERE s.is_active = true
-- ON CONFLICT DO NOTHING;
