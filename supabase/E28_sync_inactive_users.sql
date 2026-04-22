-- ============================================================
-- E-OS - E28: Sincronizar usuarios ya desactivados
-- Aplica is_active=false a students y enrollments para usuarios
-- que ya tenían profiles.is_active=false (desactivados con código viejo)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Desactivar students cuyo perfil está inactivo
UPDATE public.students s
SET is_active = false
FROM public.profiles p
WHERE s.user_id = p.id
  AND p.is_active = false
  AND s.is_active = true;

-- 2. Retirar matrículas activas de estudiantes inactivos
UPDATE public.enrollments e
SET status = 'withdrawn'
FROM public.students s
WHERE e.student_id = s.id
  AND s.is_active = false
  AND e.status = 'active';

-- Verificación:
-- SELECT p.full_name, p.is_active as perfil_activo, s.is_active as student_activo
-- FROM profiles p
-- JOIN students s ON s.user_id = p.id
-- WHERE p.is_active = false;
