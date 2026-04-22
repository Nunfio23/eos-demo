-- E29: Agregar campo NIP al perfil de docentes y personal
-- NIP = Número de Identificación Personal (DUI u otro documento)

alter table teachers
  add column if not exists nip text;

alter table staff
  add column if not exists nip text;

comment on column teachers.nip is 'Número de Identificación Personal del docente (DUI u otro documento oficial)';
comment on column staff.nip is 'Número de Identificación Personal del empleado (DUI u otro documento oficial)';
