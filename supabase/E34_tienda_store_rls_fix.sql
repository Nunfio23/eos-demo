-- ============================================================
-- E34: Fix RLS de Tienda + flujo padre→hijo
-- ============================================================

-- 1. Fix so_update: el UPDATE de draft→placed fallaba porque
--    sin WITH CHECK explícito, PostgreSQL aplica USING al nuevo valor también.
--    Ahora: USING verifica la fila existente (puede ser draft o placed),
--    WITH CHECK solo verifica que ordered_by siga siendo el mismo usuario.
DROP POLICY IF EXISTS "so_update" ON public.store_orders;
CREATE POLICY "so_update" ON public.store_orders
FOR UPDATE
USING (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR (ordered_by = auth.uid() AND status IN ('draft', 'placed'))
)
WITH CHECK (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR ordered_by = auth.uid()
);

-- 2. Fix so_select: usar student_parents (nueva tabla) además de my_student_id()
--    para que el padre vea los pedidos de sus hijos correctamente.
DROP POLICY IF EXISTS "so_select" ON public.store_orders;
CREATE POLICY "so_select" ON public.store_orders FOR SELECT USING (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR ordered_by = auth.uid()
  OR student_id = public.my_student_id()
  OR student_id IN (
    SELECT sp.student_id
    FROM public.student_parents sp
    WHERE sp.parent_id = auth.uid()
  )
);

-- 3. Fix soi_select: padre puede ver ítems de pedidos de sus hijos
DROP POLICY IF EXISTS "soi_select" ON public.store_order_items;
CREATE POLICY "soi_select" ON public.store_order_items FOR SELECT USING (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR order_id IN (
    SELECT id FROM public.store_orders WHERE ordered_by = auth.uid()
  )
  OR order_id IN (
    SELECT so.id
    FROM public.store_orders so
    JOIN public.student_parents sp ON so.student_id = sp.student_id
    WHERE sp.parent_id = auth.uid()
  )
);

-- 4. Fix soi_manage: padre puede insertar ítems en pedidos propios en draft
--    (sin cambio de lógica, pero lo dejamos explícito con WITH CHECK)
DROP POLICY IF EXISTS "soi_manage" ON public.store_order_items;
CREATE POLICY "soi_manage" ON public.store_order_items
FOR ALL
USING (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR order_id IN (
    SELECT id FROM public.store_orders
    WHERE ordered_by = auth.uid() AND status = 'draft'
  )
)
WITH CHECK (
  public.has_any_role(ARRAY['master','tienda','administracion'])
  OR order_id IN (
    SELECT id FROM public.store_orders
    WHERE ordered_by = auth.uid() AND status = 'draft'
  )
);
