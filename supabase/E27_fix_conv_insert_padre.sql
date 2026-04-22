-- ============================================================
-- E-OS - E27: Fix conv_insert RLS para padre (403 Forbidden)
-- Problema: conv_insert usaba auth.role() = 'authenticated' que
--   puede fallar en algunas versiones de Supabase/PostgREST.
-- Solución: usar auth.uid() IS NOT NULL que es más confiable.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── Conversations: INSERT ────────────────────────────────────────────────
DROP POLICY IF EXISTS "conv_insert" ON public.conversations;

CREATE POLICY "conv_insert" ON public.conversations
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- ─── Conversation Participants: INSERT ───────────────────────────────────
DROP POLICY IF EXISTS "cp_insert" ON public.conversation_participants;

CREATE POLICY "cp_insert" ON public.conversation_participants
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- ─── Verificación ─────────────────────────────────────────────────────────
-- Autenticado como padre, ejecutar:
-- INSERT INTO conversations (type, created_by) VALUES ('direct', auth.uid()) RETURNING id;
-- Si retorna un id sin error, el fix funcionó.
