-- ============================================================
-- E38: Tabla notifications + trigger para pedidos de Tienda Chalet
-- Corre este script COMPLETO en Supabase SQL Editor
-- ============================================================

-- 1. Crear tabla notifications (si no existe aún - E27)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT,
  type        TEXT        DEFAULT 'general',
  event_date  DATE,
  is_read     BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS notifications_user_id_idx    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx    ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_own_select"    ON public.notifications;
DROP POLICY IF EXISTS "notif_own_update"    ON public.notifications;
DROP POLICY IF EXISTS "notif_service_insert" ON public.notifications;

CREATE POLICY "notif_own_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notif_own_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notif_service_insert" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- GRANT para authenticated
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT ON public.notifications TO service_role;

-- 2. Función trigger: notificar a admin/master cuando llega un pedido placed
CREATE OR REPLACE FUNCTION public.notify_store_order_placed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body TEXT;
BEGIN
  -- Solo disparar cuando status cambia A 'placed'
  IF NEW.status = 'placed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'placed') THEN
    v_body := 'Nuevo pedido por $' || NEW.total::TEXT ||
              CASE WHEN NEW.notes IS NOT NULL THEN ' — ' || NEW.notes ELSE '' END;

    -- Insertar notificación para cada usuario con rol admin o master
    INSERT INTO public.notifications (user_id, title, body, type)
    SELECT p.id,
           '🛒 Nuevo pedido en Tienda Chalet',
           v_body,
           'store_order'
    FROM public.profiles p
    WHERE p.role IN ('administracion', 'master');
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Crear trigger en store_orders
DROP TRIGGER IF EXISTS trg_notify_store_order_placed ON public.store_orders;
CREATE TRIGGER trg_notify_store_order_placed
  AFTER INSERT OR UPDATE OF status
  ON public.store_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_store_order_placed();

-- 4. Habilitar Realtime en la tabla notifications (para que el Header se actualice sin recargar)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
