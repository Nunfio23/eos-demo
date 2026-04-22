-- ============================================================
-- E36: Fix my_children_ids() para usar student_parents
-- ============================================================
-- La función original usaba: students -> parents (tabla vieja)
-- El admin ahora vincula via: student_parents (parent_id = profiles.id)
-- Esto afectaba TODO el ecosistema del padre:
--   students, grades, attendance, payments, submissions, etc.
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF UUID AS $$
  -- Nueva tabla: student_parents.parent_id = profiles.id = auth.uid()
  SELECT student_id
  FROM public.student_parents
  WHERE parent_id = auth.uid()

  UNION

  -- Tabla legacy: students.parent_id -> parents.id -> parents.user_id
  -- (para no romper padres que no fueron migrados a la nueva tabla)
  SELECT s.id
  FROM public.students s
  JOIN public.parents p ON s.parent_id = p.id
  WHERE p.user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
