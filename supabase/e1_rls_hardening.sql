-- ============================================================
-- E1: RLS HARDENING — E-OS
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS (reemplazan get_my_role())
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(required_roles)
      AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.has_any_role(ARRAY['master', 'direccion', 'administracion']);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_teacher_id()
RETURNS UUID AS $$
  SELECT id FROM public.teachers
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_student_id()
RETURNS UUID AS $$
  SELECT id FROM public.students
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Retorna los IDs de estudiantes que son hijos del padre actual
CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF UUID AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.parents p ON s.parent_id = p.id
  WHERE p.user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Retorna los IDs de estudiantes asignados al docente actual
-- (por grade_level + section de sus class_schedules)
CREATE OR REPLACE FUNCTION public.my_teacher_student_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT s.id
  FROM public.students s
  JOIN public.class_schedules cs
    ON cs.grade_level = s.grade_level
    AND cs.section = s.section
  WHERE cs.teacher_id = public.my_teacher_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES — hardening
-- ============================================================
DROP POLICY IF EXISTS "Usuarios pueden ver perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Master y admin pueden gestionar perfiles" ON public.profiles;

-- Todos los autenticados pueden ver perfiles (necesario para UI)
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Solo actualiza su propio perfil si está activo (datos no sensibles)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND is_active = true);

-- Admin gestiona todos
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL
  USING (public.is_admin());

-- ============================================================
-- STUDENTS — políticas granulares
-- ============================================================
DROP POLICY IF EXISTS "Authenticated puede ver students" ON public.students;
DROP POLICY IF EXISTS "Admin puede gestionar students" ON public.students;

CREATE POLICY "students_select"
  ON public.students FOR SELECT
  USING (
    public.is_admin()
    OR public.has_any_role(ARRAY['contabilidad'])
    OR id IN (SELECT public.my_teacher_student_ids())
    OR id IN (SELECT public.my_children_ids())
    OR id = public.my_student_id()
  );

CREATE POLICY "students_insert"
  ON public.students FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "students_update"
  ON public.students FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "students_delete"
  ON public.students FOR DELETE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- ============================================================
-- TEACHERS — sin cambio estructural, mantener acceso
-- ============================================================
DROP POLICY IF EXISTS "Authenticated puede ver teachers" ON public.teachers;
DROP POLICY IF EXISTS "Admin puede gestionar teachers" ON public.teachers;

CREATE POLICY "teachers_select"
  ON public.teachers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "teachers_insert"
  ON public.teachers FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "teachers_update"
  ON public.teachers FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "teachers_delete"
  ON public.teachers FOR DELETE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- ============================================================
-- SUBJECTS — docente solo ve sus materias, otros ven todas
-- ============================================================
DROP POLICY IF EXISTS "Authenticated puede ver subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin y docentes pueden gestionar subjects" ON public.subjects;

CREATE POLICY "subjects_select"
  ON public.subjects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "subjects_insert"
  ON public.subjects FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "subjects_update"
  ON public.subjects FOR UPDATE
  USING (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id())
  );

CREATE POLICY "subjects_delete"
  ON public.subjects FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- ASSIGNMENTS — docente solo gestiona los suyos
-- ============================================================
DROP POLICY IF EXISTS "Authenticated puede ver assignments publicados" ON public.assignments;
DROP POLICY IF EXISTS "Docentes pueden gestionar sus assignments" ON public.assignments;

CREATE POLICY "assignments_select"
  ON public.assignments FOR SELECT
  USING (
    public.is_admin()
    OR teacher_id = public.my_teacher_id()
    OR (
      is_published = true
      AND subject_id IN (
        SELECT s.id FROM public.subjects s
        JOIN public.class_schedules cs ON cs.subject_id = s.id
        JOIN public.students st ON cs.grade_level = st.grade_level AND cs.section = st.section
        WHERE st.id = public.my_student_id()
           OR st.id IN (SELECT public.my_children_ids())
      )
    )
  );

CREATE POLICY "assignments_insert"
  ON public.assignments FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id())
  );

CREATE POLICY "assignments_update"
  ON public.assignments FOR UPDATE
  USING (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id())
  );

CREATE POLICY "assignments_delete"
  ON public.assignments FOR DELETE
  USING (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id())
  );

-- ============================================================
-- SUBMISSIONS — alumno gestiona las suyas, docente ve las de sus tareas
-- ============================================================
DROP POLICY IF EXISTS "Alumnos ven sus submissions" ON public.submissions;
DROP POLICY IF EXISTS "Alumnos pueden crear submissions" ON public.submissions;
DROP POLICY IF EXISTS "Docentes pueden actualizar submissions" ON public.submissions;

CREATE POLICY "submissions_select"
  ON public.submissions FOR SELECT
  USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR (
      public.has_any_role(ARRAY['docente'])
      AND assignment_id IN (
        SELECT id FROM public.assignments WHERE teacher_id = public.my_teacher_id()
      )
    )
  );

CREATE POLICY "submissions_insert"
  ON public.submissions FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR student_id = public.my_student_id()
  );

CREATE POLICY "submissions_update"
  ON public.submissions FOR UPDATE
  USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR (
      public.has_any_role(ARRAY['docente'])
      AND assignment_id IN (
        SELECT id FROM public.assignments WHERE teacher_id = public.my_teacher_id()
      )
    )
  );

CREATE POLICY "submissions_delete"
  ON public.submissions FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- GRADES — docente solo califica a sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Alumnos ven sus calificaciones" ON public.grades;
DROP POLICY IF EXISTS "Docentes pueden gestionar calificaciones" ON public.grades;

CREATE POLICY "grades_select"
  ON public.grades FOR SELECT
  USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "grades_insert"
  ON public.grades FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "grades_update"
  ON public.grades FOR UPDATE
  USING (
    public.is_admin()
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "grades_delete"
  ON public.grades FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- ATTENDANCE — docente solo registra la de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Attendance visible para authorized" ON public.attendance;
DROP POLICY IF EXISTS "Docentes gestionan attendance" ON public.attendance;

CREATE POLICY "attendance_select"
  ON public.attendance FOR SELECT
  USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "attendance_insert"
  ON public.attendance FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "attendance_update"
  ON public.attendance FOR UPDATE
  USING (
    public.is_admin()
    OR (
      public.has_any_role(ARRAY['docente'])
      AND student_id IN (SELECT public.my_teacher_student_ids())
    )
  );

CREATE POLICY "attendance_delete"
  ON public.attendance FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- PAYMENTS — alumno/padre solo ven sus propios pagos
-- ============================================================
DROP POLICY IF EXISTS "Finanzas puede ver payments" ON public.payments;
DROP POLICY IF EXISTS "Contabilidad puede gestionar payments" ON public.payments;

CREATE POLICY "payments_select"
  ON public.payments FOR SELECT
  USING (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad', 'administracion'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
  );

CREATE POLICY "payments_insert"
  ON public.payments FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad', 'administracion'])
  );

CREATE POLICY "payments_update"
  ON public.payments FOR UPDATE
  USING (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad', 'administracion'])
  );

CREATE POLICY "payments_delete"
  ON public.payments FOR DELETE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- ============================================================
-- EXPENSES — solo finanzas
-- ============================================================
DROP POLICY IF EXISTS "Contabilidad puede ver gastos" ON public.expenses;
DROP POLICY IF EXISTS "Contabilidad puede gestionar gastos" ON public.expenses;

CREATE POLICY "expenses_select"
  ON public.expenses FOR SELECT
  USING (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad', 'administracion'])
  );

CREATE POLICY "expenses_insert"
  ON public.expenses FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad'])
  );

CREATE POLICY "expenses_update"
  ON public.expenses FOR UPDATE
  USING (
    public.has_any_role(ARRAY['master', 'direccion', 'contabilidad'])
  );

CREATE POLICY "expenses_delete"
  ON public.expenses FOR DELETE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- ============================================================
-- INVENTORY — por rol especializado
-- ============================================================
DROP POLICY IF EXISTS "Admin puede ver inventario" ON public.inventory;
DROP POLICY IF EXISTS "Admin puede gestionar inventario" ON public.inventory;

CREATE POLICY "inventory_select"
  ON public.inventory FOR SELECT
  USING (
    public.has_any_role(ARRAY['master','direccion','administracion','biblioteca','tienda','mantenimiento','contabilidad'])
  );

CREATE POLICY "inventory_insert"
  ON public.inventory FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['master','administracion','biblioteca','tienda','mantenimiento'])
  );

CREATE POLICY "inventory_update"
  ON public.inventory FOR UPDATE
  USING (
    public.has_any_role(ARRAY['master','administracion','biblioteca','tienda','mantenimiento'])
  );

CREATE POLICY "inventory_delete"
  ON public.inventory FOR DELETE
  USING (public.has_any_role(ARRAY['master','direccion','administracion']));

-- ============================================================
-- CLASS_SCHEDULES — todos ven, solo admin edita
-- ============================================================
DROP POLICY IF EXISTS "Todos ven horarios" ON public.class_schedules;
DROP POLICY IF EXISTS "Admin gestiona horarios" ON public.class_schedules;

CREATE POLICY "schedules_select"
  ON public.class_schedules FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "schedules_insert"
  ON public.class_schedules FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "schedules_update"
  ON public.class_schedules FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "schedules_delete"
  ON public.class_schedules FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- PARENTS — admin gestiona
-- ============================================================
DROP POLICY IF EXISTS "Ver parents" ON public.parents;
DROP POLICY IF EXISTS "Admin gestiona parents" ON public.parents;

CREATE POLICY "parents_select"
  ON public.parents FOR SELECT
  USING (
    public.is_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY "parents_insert"
  ON public.parents FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "parents_update"
  ON public.parents FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "parents_delete"
  ON public.parents FOR DELETE
  USING (public.has_any_role(ARRAY['master', 'direccion']));

-- ============================================================
-- ACTIVITY_LOGS — sin cambio
-- ============================================================
DROP POLICY IF EXISTS "Ver logs propio o si es admin" ON public.activity_logs;
DROP POLICY IF EXISTS "Todos pueden insertar logs" ON public.activity_logs;

CREATE POLICY "logs_select"
  ON public.activity_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_any_role(ARRAY['master', 'direccion'])
  );

CREATE POLICY "logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- FIN E1 — RLS HARDENING
-- ============================================================
