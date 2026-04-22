-- ============================================================
-- E42 — Bloqueo de módulos por usuario específico
-- Permite bloquear acceso a módulos concretos sin cambiar el rol.
-- Uso principal: usuario administración que NO debe ver Finanzas.
-- ============================================================

-- 1. Agregar columna a profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS blocked_modules text[] DEFAULT '{}';

-- 2. Bloquear finanzas para Alejandra Ortiz
--    (Gissel sí puede verlo; solo Alejandra queda restringida)
UPDATE profiles
SET blocked_modules = ARRAY['finanzas']
WHERE LOWER(full_name) LIKE '%alejandra%ortiz%';

-- Verifica qué usuario quedó afectado (opcional, para confirmar)
-- SELECT id, full_name, email, role, blocked_modules
-- FROM profiles
-- WHERE LOWER(full_name) LIKE '%alejandra%ortiz%';
