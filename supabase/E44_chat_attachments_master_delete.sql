-- ============================================================
-- E44: Adjuntos en chat + solo master puede eliminar mensajes
-- ============================================================

-- 1. Agregar columnas de adjunto a direct_messages
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT CHECK (attachment_type IN ('image', 'document')),
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size INT;

-- 2. Hacer body opcional (para mensajes que solo tienen adjunto)
ALTER TABLE public.direct_messages
  ALTER COLUMN body SET DEFAULT '';

-- No podemos quitar NOT NULL sin afectar datos existentes, así que
-- en el código enviamos '' cuando el mensaje es solo adjunto.
-- Si quieres hacerlo nullable:
-- ALTER TABLE public.direct_messages ALTER COLUMN body DROP NOT NULL;

-- 3. Actualizar RLS: solo master puede marcar mensajes como eliminados
--    (soft delete vía is_deleted = true)

-- Eliminar policies existentes de update/delete
DROP POLICY IF EXISTS "dm_delete_own"          ON public.direct_messages;
DROP POLICY IF EXISTS "dm_update_own"          ON public.direct_messages;
DROP POLICY IF EXISTS "dm_update_own_or_master" ON public.direct_messages;

-- Nueva policy de UPDATE:
--   - El remitente puede editar su propio mensaje (body, is_edited)
--   - Master puede soft-delete cualquier mensaje (is_deleted = true)
CREATE POLICY "dm_update_own_or_master" ON public.direct_messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

-- No hay DELETE real (es soft-delete), pero por si acaso:
CREATE POLICY "dm_delete_master_only" ON public.direct_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

-- 4. Crear bucket para adjuntos del chat (público para lectura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  20971520, -- 20 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies del bucket
DROP POLICY IF EXISTS "chat_att_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "chat_att_auth_upload"  ON storage.objects;
DROP POLICY IF EXISTS "chat_att_auth_delete"  ON storage.objects;

CREATE POLICY "chat_att_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_att_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-attachments' AND auth.role() = 'authenticated'
  );

CREATE POLICY "chat_att_auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-attachments' AND auth.role() = 'authenticated'
  );
