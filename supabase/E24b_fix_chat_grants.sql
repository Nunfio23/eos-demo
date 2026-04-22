-- ============================================================
-- E-OS - E24b: Grants para tablas de chat
-- Las tablas creadas via SQL Editor no tienen permisos automáticos
-- para el rol 'authenticated'. Esto los otorga.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;

-- También para anon (solo lectura si aplica)
GRANT SELECT ON public.conversations TO anon;
GRANT SELECT ON public.conversation_participants TO anon;
GRANT SELECT ON public.direct_messages TO anon;
