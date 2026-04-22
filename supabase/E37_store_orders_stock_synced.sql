-- ============================================================
-- E37: Agregar columna stock_synced a store_orders
-- Permite rastrear si un pedido entregado ya fue contabilizado
-- en ventas del día (stock descontado). Solo admin/master puede
-- marcar como stock_synced = true.
-- ============================================================

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS stock_synced BOOLEAN DEFAULT FALSE NOT NULL;

-- Índice para consultar rápido los no sincronizados
CREATE INDEX IF NOT EXISTS idx_store_orders_stock_synced
  ON public.store_orders (stock_synced)
  WHERE status = 'delivered';
