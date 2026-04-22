-- E8: Vincular staff con usuario del sistema
-- Agrega user_id a staff para relacionar expediente laboral con cuenta de acceso

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice para búsquedas por user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id) WHERE user_id IS NOT NULL;
