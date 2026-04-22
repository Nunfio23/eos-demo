-- ============================================================
-- E-OS - E6: Equipo de Trabajo / Expediente Laboral
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE public.staff (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Información personal
  full_name               text NOT NULL,
  national_id             text,                          -- DUI
  birth_date              date,
  gender                  text CHECK (gender IN ('M','F','otro')),
  nationality             text DEFAULT 'Salvadoreña',
  photo_url               text,

  -- Contacto
  email                   text,
  phone                   text,
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,

  -- Datos laborales
  staff_type              text NOT NULL DEFAULT 'otro'
    CHECK (staff_type IN (
      'docente','director','sub_director','administracion',
      'recepcionista','asistente','mantenimiento','limpieza',
      'tienda','vigilancia','otro'
    )),
  employee_number         text,
  position                text,                          -- Cargo específico
  department              text,
  hire_date               date,
  end_date                date,
  contract_type           text
    CHECK (contract_type IN ('tiempo_completo','medio_tiempo','eventual','contrato')),
  salary                  numeric(10,2),

  -- Seguridad social (El Salvador)
  isss_number             text,                          -- N° ISSS
  afp_number              text,                          -- N° AFP
  afp_provider            text
    CHECK (afp_provider IN ('AFP Crecer','AFP Confia')),

  -- Estado y notas
  is_active               boolean DEFAULT true,
  notes                   text,

  -- Metadata
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Solo master tiene acceso completo
CREATE POLICY "staff_master_all" ON public.staff
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'));

-- Dirección puede ver (solo lectura)
CREATE POLICY "staff_direccion_select" ON public.staff
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_staff_type   ON public.staff(staff_type);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(is_active);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
