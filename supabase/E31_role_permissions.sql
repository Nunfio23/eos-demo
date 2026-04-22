-- Tabla dinámica de permisos por rol y módulo
-- Permite al super admin ver y modificar permisos desde la UI

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role    TEXT NOT NULL,
  module  TEXT NOT NULL,
  actions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (role, module)
);

-- RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer (para que can() funcione)
DROP POLICY IF EXISTS "authenticated_read_role_permissions" ON public.role_permissions;
CREATE POLICY "authenticated_read_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Solo master puede modificar
DROP POLICY IF EXISTS "master_write_role_permissions" ON public.role_permissions;
CREATE POLICY "master_write_role_permissions" ON public.role_permissions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  );

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);

-- Seed con los permisos actuales del sistema
INSERT INTO public.role_permissions (role, module, actions) VALUES
  -- usuarios
  ('master',         'usuarios',     '{view,create,edit,delete,approve}'),
  ('direccion',      'usuarios',     '{view,create,edit}'),
  ('administracion', 'usuarios',     '{view,create,edit}'),
  -- estudiantes
  ('master',         'estudiantes',  '{view,create,edit,delete}'),
  ('direccion',      'estudiantes',  '{view,create,edit,delete}'),
  ('administracion', 'estudiantes',  '{view,create,edit}'),
  ('docente',        'estudiantes',  '{view}'),
  ('contabilidad',   'estudiantes',  '{view}'),
  ('padre',          'estudiantes',  '{view}'),
  ('alumno',         'estudiantes',  '{view}'),
  -- docentes
  ('master',         'docentes',     '{view,create,edit,delete}'),
  ('direccion',      'docentes',     '{view,create,edit}'),
  ('administracion', 'docentes',     '{view,create,edit}'),
  -- finanzas
  ('master',         'finanzas',     '{view,create,edit,delete,approve}'),
  ('contabilidad',   'finanzas',     '{view,create,edit,approve}'),
  ('administracion', 'finanzas',     '{view,create}'),
  ('padre',          'finanzas',     '{view}'),
  ('alumno',         'finanzas',     '{view}'),
  -- inventario
  ('master',         'inventario',   '{view,create,edit,delete}'),
  ('direccion',      'inventario',   '{view}'),
  ('administracion', 'inventario',   '{view,create,edit}'),
  ('biblioteca',     'inventario',   '{view,create,edit}'),
  ('tienda',         'inventario',   '{view,create,edit}'),
  ('mantenimiento',  'inventario',   '{view,create,edit}'),
  ('contabilidad',   'inventario',   '{view}'),
  -- reportes
  ('master',         'reportes',     '{view}'),
  ('contabilidad',   'reportes',     '{view}'),
  ('administracion', 'reportes',     '{view}'),
  -- asistencia
  ('master',         'asistencia',   '{view,create,edit,delete}'),
  ('direccion',      'asistencia',   '{view,create,edit}'),
  ('administracion', 'asistencia',   '{view}'),
  ('docente',        'asistencia',   '{view,create,edit}'),
  ('padre',          'asistencia',   '{view}'),
  ('alumno',         'asistencia',   '{view}'),
  -- academico
  ('master',         'academico',    '{view,create,edit,delete}'),
  ('direccion',      'academico',    '{view}'),
  ('administracion', 'academico',    '{view}'),
  ('docente',        'academico',    '{view,edit}'),
  ('alumno',         'academico',    '{view}'),
  ('padre',          'academico',    '{view}'),
  -- calendario
  ('master',         'calendario',   '{view,create,edit,delete}'),
  ('direccion',      'calendario',   '{view,create,edit,delete}'),
  ('administracion', 'calendario',   '{view,create,edit}'),
  ('marketing',      'calendario',   '{view}'),
  ('docente',        'calendario',   '{view}'),
  ('alumno',         'calendario',   '{view}'),
  ('padre',          'calendario',   '{view}'),
  ('contabilidad',   'calendario',   '{view}'),
  ('biblioteca',     'calendario',   '{view}'),
  ('tienda',         'calendario',   '{view}'),
  ('mantenimiento',  'calendario',   '{view}'),
  -- comunicados
  ('master',         'comunicados',  '{view,create,edit,delete}'),
  ('direccion',      'comunicados',  '{view,create,edit,delete}'),
  ('administracion', 'comunicados',  '{view,create,edit}'),
  ('contabilidad',   'comunicados',  '{view,create,edit}'),
  ('marketing',      'comunicados',  '{view}'),
  ('docente',        'comunicados',  '{view}'),
  ('alumno',         'comunicados',  '{view}'),
  ('padre',          'comunicados',  '{view}'),
  ('biblioteca',     'comunicados',  '{view}'),
  ('tienda',         'comunicados',  '{view}'),
  ('mantenimiento',  'comunicados',  '{view}'),
  -- horarios
  ('master',         'horarios',     '{view,create,edit,delete}'),
  ('direccion',      'horarios',     '{view,create,edit}'),
  ('administracion', 'horarios',     '{view,create,edit}'),
  ('docente',        'horarios',     '{view}'),
  ('alumno',         'horarios',     '{view}'),
  ('padre',          'horarios',     '{view}'),
  -- aulas
  ('master',         'aulas',        '{view,create,edit,delete}'),
  ('direccion',      'aulas',        '{view}'),
  ('docente',        'aulas',        '{view,create,edit}'),
  ('alumno',         'aulas',        '{view,create}'),
  ('padre',          'aulas',        '{view}'),
  -- biblioteca
  ('master',         'biblioteca',   '{view,create,edit,delete}'),
  ('direccion',      'biblioteca',   '{view}'),
  ('administracion', 'biblioteca',   '{view}'),
  ('biblioteca',     'biblioteca',   '{view,create,edit,delete}'),
  ('docente',        'biblioteca',   '{view}'),
  ('alumno',         'biblioteca',   '{view}'),
  ('padre',          'biblioteca',   '{view}'),
  -- tienda
  ('master',         'tienda',       '{view,create,edit,delete}'),
  ('tienda',         'tienda',       '{view,create,edit}'),
  ('administracion', 'tienda',       '{view}'),
  ('alumno',         'tienda',       '{view,create}'),
  ('padre',          'tienda',       '{view,create}'),
  ('docente',        'tienda',       '{view}'),
  -- expediente
  ('master',         'expediente',   '{view,create,edit,delete}'),
  ('direccion',      'expediente',   '{view,edit}'),
  ('administracion', 'expediente',   '{view,edit}'),
  ('docente',        'expediente',   '{view}'),
  ('alumno',         'expediente',   '{view}'),
  ('padre',          'expediente',   '{view}'),
  -- carnet
  ('master',         'carnet',       '{view,create,edit,delete}'),
  ('direccion',      'carnet',       '{view,create}'),
  ('administracion', 'carnet',       '{view,create}')
ON CONFLICT (role, module) DO NOTHING;
