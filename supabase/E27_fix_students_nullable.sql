-- ============================================================
-- E-OS - E27: Hacer enrollment_number y grade_level opcionales
-- El grado/sección ahora se maneja via enrollments table.
-- enrollment_number se asigna durante matrícula, no al crear el usuario.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Eliminar la restricción NOT NULL de enrollment_number
ALTER TABLE public.students
  ALTER COLUMN enrollment_number DROP NOT NULL;

-- Eliminar la restricción NOT NULL de grade_level
ALTER TABLE public.students
  ALTER COLUMN grade_level DROP NOT NULL;

-- La restricción UNIQUE en enrollment_number causa problemas cuando hay NULLs
-- En PostgreSQL, múltiples NULLs en una columna UNIQUE son permitidos (correcto)
-- No se necesita cambiar nada más.

-- Verificación:
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'students' AND column_name IN ('enrollment_number', 'grade_level');
