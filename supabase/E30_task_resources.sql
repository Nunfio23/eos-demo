-- E30: Recursos adjuntos a tareas (enlaces y archivos)

alter table classroom_tasks
  add column if not exists resource_url   text,
  add column if not exists resource_label text;

comment on column classroom_tasks.resource_url   is 'URL del recurso o archivo adjunto (Google Drive, Storage, etc.)';
comment on column classroom_tasks.resource_label is 'Etiqueta descriptiva del recurso adjunto';

-- Crear bucket para archivos de tareas (ejecutar en Supabase Dashboard → Storage si no existe)
-- insert into storage.buckets (id, name, public) values ('task-resources', 'task-resources', true)
-- on conflict (id) do nothing;

-- RLS: docentes y admins pueden subir archivos
-- create policy "task_resources_upload" on storage.objects
--   for insert to authenticated
--   with check (bucket_id = 'task-resources');

-- RLS: cualquier usuario autenticado puede leer (para estudiantes)
-- create policy "task_resources_read" on storage.objects
--   for select to authenticated
--   using (bucket_id = 'task-resources');
