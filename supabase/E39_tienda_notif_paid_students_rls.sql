-- ============================================================
-- E39: Notificación a tienda cuando pedido es marcado pagado
--      + acceso de lectura a students para roles canOperate
-- ============================================================

-- 1. Trigger: notificar a tienda cuando status → 'paid'
CREATE OR REPLACE FUNCTION public.notify_store_order_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_body TEXT;
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    v_body := 'Pedido por $' || NEW.total::TEXT || ' está pagado y listo para entregar';
    INSERT INTO public.notifications (user_id, title, body, type)
    SELECT p.id, '✅ Pedido pagado — listo para entregar', v_body, 'store_order'
    FROM public.profiles p
    WHERE p.role = 'tienda';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_store_order_paid ON public.store_orders;
CREATE TRIGGER trg_notify_store_order_paid
  AFTER UPDATE OF status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_order_paid();

-- 2. Permitir que roles operativos lean estudiantes (para mostrar nombres en pedidos)
--    Primero eliminar si ya existe la política con ese nombre
DROP POLICY IF EXISTS "students_staff_select" ON public.students;
CREATE POLICY "students_staff_select" ON public.students
  FOR SELECT USING (
    public.has_any_role(ARRAY['master','administracion','tienda','contabilidad','docente'])
  );
