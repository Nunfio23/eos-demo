-- ============================================================
-- E41: Notificación al padre cuando pedido es marcado entregado
-- Corre este script en Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_order_delivered_to_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_name TEXT;
  v_body         TEXT;
BEGIN
  -- Solo disparar cuando status cambia A 'delivered'
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN

    -- Obtener nombre del estudiante
    SELECT p.full_name INTO v_student_name
    FROM public.students s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = NEW.student_id
    LIMIT 1;

    v_body := COALESCE(v_student_name, 'Tu hijo/a') ||
              ' recibió su pedido de $' || NEW.total::TEXT || ' en el chalet';

    -- Notificar a todos los padres vinculados al estudiante
    INSERT INTO public.notifications (user_id, title, body, type)
    SELECT sp.parent_id,
           '✅ Pedido entregado',
           v_body,
           'store_order'
    FROM public.student_parents sp
    WHERE sp.student_id = NEW.student_id;

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_delivered ON public.store_orders;
CREATE TRIGGER trg_notify_order_delivered
  AFTER UPDATE OF status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_delivered_to_parent();
