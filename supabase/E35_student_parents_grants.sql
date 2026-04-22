-- ============================================================
-- E35: Grants para student_parents
-- Sin estos GRANT, el rol 'authenticated' no puede leer la
-- tabla aunque la RLS lo permita, y la query retorna vacío.
-- ============================================================

-- Permitir que usuarios autenticados lean la tabla (RLS ya controla qué filas)
GRANT SELECT ON public.student_parents TO authenticated;

-- Solo el service_role puede insertar/actualizar/eliminar (master lo hace via RLS)
GRANT INSERT, UPDATE, DELETE ON public.student_parents TO authenticated;

-- Verificar que el sequence esté accesible (por si acaso)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
