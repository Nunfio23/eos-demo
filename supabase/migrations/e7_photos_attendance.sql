-- ============================================================
-- E-OS - E7: Storage de Fotos + Asistencia del Personal
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── 1. BUCKET DE FOTOS ──────────────────────────────────────
-- Crear el bucket público "photos" para fotos de empleados y estudiantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  true,
  5242880,  -- 5 MB límite
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Política: cualquier persona autenticada puede ver fotos
CREATE POLICY "photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');

-- Política: usuarios autenticados pueden subir fotos
CREATE POLICY "photos_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'photos' AND auth.role() = 'authenticated'
  );

-- Política: usuarios autenticados pueden actualizar fotos
CREATE POLICY "photos_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'photos' AND auth.role() = 'authenticated'
  );

-- Política: master y administración pueden eliminar fotos
CREATE POLICY "photos_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('master', 'direccion', 'administracion')
    )
  );

-- ─── 2. ASISTENCIA DEL PERSONAL ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  check_in     time,
  check_out    time,
  status       text NOT NULL DEFAULT 'presente'
    CHECK (status IN ('presente','ausente','tardanza','permiso','vacaciones')),
  notes        text,
  recorded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(staff_id, date)
);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Solo master acceso completo
CREATE POLICY "staff_att_master_all" ON public.staff_attendance
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'));

-- Dirección puede ver
CREATE POLICY "staff_att_direccion_select" ON public.staff_attendance
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'));

CREATE INDEX IF NOT EXISTS idx_staff_att_date    ON public.staff_attendance(date);
CREATE INDEX IF NOT EXISTS idx_staff_att_staff_id ON public.staff_attendance(staff_id);

-- Trigger updated_at
CREATE TRIGGER staff_att_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
