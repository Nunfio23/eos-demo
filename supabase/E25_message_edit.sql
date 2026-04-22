-- ============================================================
-- E-OS - E25: Edición de mensajes directos
-- Agrega campos updated_at e is_edited a direct_messages
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;

-- Política UPDATE para mensajes propios (solo si RLS está habilitado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'direct_messages' AND policyname = 'dm_update_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "dm_update_own" ON public.direct_messages
      FOR UPDATE USING (sender_id = auth.uid())
    $policy$;
  END IF;
END;
$$;
