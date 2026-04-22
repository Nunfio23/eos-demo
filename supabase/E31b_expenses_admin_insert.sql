-- Permite a administracion insertar gastos
-- Ejecutar en Supabase SQL Editor

-- Verificar que RLS está habilitado en expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Política: master y contabilidad pueden hacer todo
DROP POLICY IF EXISTS "finance_roles_manage_expenses" ON public.expenses;
CREATE POLICY "finance_roles_manage_expenses" ON public.expenses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('master', 'contabilidad')
    )
  );

-- Política: administracion puede insertar y ver
DROP POLICY IF EXISTS "admin_insert_expenses" ON public.expenses;
CREATE POLICY "admin_insert_expenses" ON public.expenses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'administracion'
    )
  );

DROP POLICY IF EXISTS "admin_view_expenses" ON public.expenses;
CREATE POLICY "admin_view_expenses" ON public.expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('administracion', 'master', 'contabilidad', 'direccion')
    )
  );
