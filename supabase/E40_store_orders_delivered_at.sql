-- ============================================================
-- E40: Agregar columna delivered_at a store_orders
-- Corre este script en Supabase SQL Editor
-- ============================================================

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS store_orders_delivered_at_idx
  ON public.store_orders(delivered_at)
  WHERE delivered_at IS NOT NULL;
