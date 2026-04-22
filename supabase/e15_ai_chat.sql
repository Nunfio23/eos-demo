-- ============================================================
-- e15: Míster Tesla — AI Chat Messages
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name   text,
  user_role   text,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_user_idx ON public.ai_chat_messages (user_id, created_at DESC);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Users see their own; master/direccion see all
DROP POLICY IF EXISTS "ai_chat_select" ON public.ai_chat_messages;
CREATE POLICY "ai_chat_select" ON public.ai_chat_messages FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('master','direccion'))
);

-- Anyone authenticated can insert their own messages
DROP POLICY IF EXISTS "ai_chat_insert" ON public.ai_chat_messages;
CREATE POLICY "ai_chat_insert" ON public.ai_chat_messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);
