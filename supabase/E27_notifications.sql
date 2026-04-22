-- E27: Sistema de notificaciones (recordatorios MINED y generales)
-- Ejecutar en Supabase SQL Editor

create table if not exists notifications (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  title       text        not null,
  body        text,
  type        text        default 'general',   -- 'mined_reminder' | 'general'
  event_date  date,
  is_read     boolean     default false,
  created_at  timestamptz default now()
);

-- Índices
create index if not exists notifications_user_id_idx    on notifications(user_id);
create index if not exists notifications_is_read_idx    on notifications(user_id, is_read);
create index if not exists notifications_created_at_idx on notifications(created_at desc);

-- RLS
alter table notifications enable row level security;

drop policy if exists "notif_own_select" on notifications;
drop policy if exists "notif_own_update" on notifications;
drop policy if exists "notif_service_insert" on notifications;

-- Usuario solo ve sus propias notificaciones
create policy "notif_own_select" on notifications
  for select using (auth.uid() = user_id);

-- Usuario puede marcar como leída
create policy "notif_own_update" on notifications
  for update using (auth.uid() = user_id);

-- El cron (service role) puede insertar para cualquier usuario
create policy "notif_service_insert" on notifications
  for insert with check (true);
