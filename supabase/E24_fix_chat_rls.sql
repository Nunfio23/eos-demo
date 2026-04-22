-- ============================================================
-- E-OS - E24: Fix RLS recursion en tablas de chat
-- El problema: cp_select se referenciaba a sí misma → loop infinito → 500
-- Solución: función SECURITY DEFINER que bypasea RLS para obtener IDs
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. Función auxiliar (SECURITY DEFINER evita la recursión) ────────────
CREATE OR REPLACE FUNCTION public.get_my_conversation_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT conversation_id
  FROM public.conversation_participants
  WHERE user_id = auth.uid();
$$;

-- ─── 2. Eliminar políticas problemáticas ──────────────────────────────────
DROP POLICY IF EXISTS "conv_select"   ON public.conversations;
DROP POLICY IF EXISTS "conv_insert"   ON public.conversations;
DROP POLICY IF EXISTS "conv_update"   ON public.conversations;
DROP POLICY IF EXISTS "conv_update_participant" ON public.conversations;
DROP POLICY IF EXISTS "cp_select"     ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert"     ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_group_creator" ON public.conversation_participants;
DROP POLICY IF EXISTS "dm_select"     ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert"     ON public.direct_messages;
DROP POLICY IF EXISTS "dm_delete_own" ON public.direct_messages;

-- ─── 3. Políticas para CONVERSATIONS ──────────────────────────────────────

CREATE POLICY "conv_select" ON public.conversations
FOR SELECT USING (
  id IN (SELECT public.get_my_conversation_ids())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('master', 'direccion', 'administracion')
  )
);

CREATE POLICY "conv_insert" ON public.conversations
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "conv_update" ON public.conversations
FOR UPDATE USING (
  id IN (SELECT public.get_my_conversation_ids())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('master', 'direccion')
  )
);

-- ─── 4. Políticas para CONVERSATION_PARTICIPANTS ───────────────────────────

CREATE POLICY "cp_select" ON public.conversation_participants
FOR SELECT USING (
  conversation_id IN (SELECT public.get_my_conversation_ids())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('master', 'direccion')
  )
);

CREATE POLICY "cp_insert" ON public.conversation_participants
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "cp_update_own" ON public.conversation_participants
FOR UPDATE USING (
  user_id = auth.uid()
);

-- ─── 5. Políticas para DIRECT_MESSAGES ────────────────────────────────────

CREATE POLICY "dm_select" ON public.direct_messages
FOR SELECT USING (
  conversation_id IN (SELECT public.get_my_conversation_ids())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('master', 'direccion')
  )
);

CREATE POLICY "dm_insert" ON public.direct_messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (SELECT public.get_my_conversation_ids())
);

CREATE POLICY "dm_delete_own" ON public.direct_messages
FOR DELETE USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('master', 'direccion')
  )
);

-- ─── Verificación ─────────────────────────────────────────────────────────
-- Después de ejecutar, prueba con:
-- SELECT * FROM conversations LIMIT 5;
-- Si ya no da error 500, el fix funcionó.
