-- RPC: Retorna los últimos N usuarios que han iniciado sesión
-- Solo accesible para master y dirección (verificado en la función)
CREATE OR REPLACE FUNCTION public.get_recent_logins(limit_count int DEFAULT 10)
RETURNS TABLE (
  user_id      uuid,
  full_name    text,
  role         text,
  last_sign_in timestamptz,
  email        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo master y dirección pueden ver esto
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('master', 'direccion')
    AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT
    au.id           AS user_id,
    p.full_name,
    p.role::text,
    au.last_sign_in_at AS last_sign_in,
    au.email
  FROM auth.users au
  JOIN public.profiles p ON p.id = au.id
  WHERE au.last_sign_in_at IS NOT NULL
    AND p.is_active IS NOT FALSE
  ORDER BY au.last_sign_in_at DESC
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_logins(int) TO authenticated;
