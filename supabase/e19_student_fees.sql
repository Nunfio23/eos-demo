-- e19_student_fees.sql
-- Cuota mensual por estudiante (solo master puede asignar/cambiar)

CREATE TABLE IF NOT EXISTS public.student_fees (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id     UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE,
  monthly_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  assigned_by    UUID REFERENCES public.profiles(id),
  assigned_at    TIMESTAMPTZ DEFAULT NOW(),
  effective_from DATE DEFAULT CURRENT_DATE,
  notes          TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fees_select" ON public.student_fees;
DROP POLICY IF EXISTS "fees_manage" ON public.student_fees;

CREATE POLICY "fees_select" ON public.student_fees
  FOR SELECT USING (has_any_role(ARRAY['master','contabilidad','administracion','direccion']));

CREATE POLICY "fees_manage" ON public.student_fees
  FOR ALL USING (has_any_role(ARRAY['master']));

-- Allow parents/students to see their own fee
CREATE POLICY "fees_own" ON public.student_fees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_fees.student_id
        AND (s.user_id = auth.uid() OR s.parent_id = auth.uid())
    )
  );

-- Make invoice_id nullable on payment_receipts so parents can submit without an invoice
ALTER TABLE public.payment_receipts ALTER COLUMN invoice_id DROP NOT NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON public.student_fees(student_id);
