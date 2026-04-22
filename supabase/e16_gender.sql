-- ============================================================
-- e16: Agrega columna gender a students
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('M', 'F', 'otro'));

-- Opcional: actualizar con heurística de nombre para datos existentes
-- (solo un ejemplo, ajustar manualmente según sea necesario)
-- UPDATE public.students s
--   SET gender = 'F'
--   FROM public.profiles p
--   WHERE s.user_id = p.id
--   AND lower(split_part(p.full_name, ' ', 1)) LIKE '%a';
