-- ============================================================
-- TESLAOS — FULL SETUP (UN SOLO SCRIPT)
-- Colegio E-OS Demo
-- Pega TODO este contenido en: Supabase > SQL Editor > Run
-- ============================================================

-- ============================================================
-- 0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SCHEMA BASE (profiles, students, teachers, payments...)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'alumno' CHECK (role IN (
        'master', 'direccion', 'administracion', 'docente',
        'alumno', 'padre', 'contabilidad', 'biblioteca',
        'tienda', 'marketing', 'mantenimiento'
    )),
    avatar_url TEXT,
    phone TEXT,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.students (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrollment_number TEXT NOT NULL UNIQUE,
    grade_level TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    parent_id UUID REFERENCES public.profiles(id),
    date_of_birth DATE,
    blood_type TEXT CHECK (blood_type IN ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
    emergency_contact TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_number TEXT NOT NULL UNIQUE,
    specialization TEXT,
    hire_date DATE,
    salary DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.parents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    occupation TEXT,
    relationship_type TEXT DEFAULT 'padre' CHECK (relationship_type IN ('padre','madre','tutor')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    grade_level TEXT NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id),
    credits INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id),
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_id, date)
);

CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.teachers(id),
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    max_score DECIMAL(5,2) DEFAULT 100,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    score DECIMAL(5,2),
    feedback TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    graded_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','submitted','graded','late')),
    UNIQUE(assignment_id, student_id)
);

-- NOTA: la tabla "grades" de este bloque es para notas/calificaciones.
-- Más abajo se CREA la tabla "grades" para grados escolares (Primer Grado, etc.)
-- y esta queda reemplazada. Usamos un nombre temporal aquí.
CREATE TABLE IF NOT EXISTS public.grade_scores_legacy (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    letter_grade TEXT,
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    concept TEXT NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer','card','check')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
    receipt_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'cash',
    approved_by UUID REFERENCES public.profiles(id),
    receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    quantity INTEGER NOT NULL DEFAULT 0,
    min_quantity INTEGER NOT NULL DEFAULT 5,
    unit TEXT NOT NULL DEFAULT 'unidades',
    location TEXT,
    supplier TEXT,
    unit_cost DECIMAL(10,2),
    last_restocked DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices base
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_grade ON public.students(grade_level, section);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON public.assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);

-- Función updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Función auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'alumno')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS base
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. FUNCIONES HELPER RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = ANY(required_roles) AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.has_any_role(ARRAY['master', 'direccion', 'administracion']);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_teacher_id()
RETURNS UUID AS $$
  SELECT id FROM public.teachers WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_student_id()
RETURNS UUID AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.students s
  JOIN public.parents p ON s.parent_id = p.id
  WHERE p.user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Placeholder: se redefine correctamente despues de crear class_schedules (seccion 8)
CREATE OR REPLACE FUNCTION public.my_teacher_student_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM public.students WHERE false;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. POLÍTICAS RLS
-- ============================================================

-- PROFILES
DROP POLICY IF EXISTS "Usuarios pueden ver perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Master y admin pueden gestionar perfiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;

CREATE POLICY "profiles_select"    ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id AND is_active = true);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (public.is_admin());

-- STUDENTS
DROP POLICY IF EXISTS "Authenticated puede ver students" ON public.students;
DROP POLICY IF EXISTS "Admin puede gestionar students" ON public.students;
DROP POLICY IF EXISTS "students_select" ON public.students;
DROP POLICY IF EXISTS "students_insert" ON public.students;
DROP POLICY IF EXISTS "students_update" ON public.students;
DROP POLICY IF EXISTS "students_delete" ON public.students;

CREATE POLICY "students_select" ON public.students FOR SELECT USING (
    public.is_admin() OR public.has_any_role(ARRAY['contabilidad'])
    OR id IN (SELECT public.my_teacher_student_ids())
    OR id IN (SELECT public.my_children_ids())
    OR id = public.my_student_id()
);
CREATE POLICY "students_insert" ON public.students FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "students_update" ON public.students FOR UPDATE USING (public.is_admin());
CREATE POLICY "students_delete" ON public.students FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- TEACHERS
DROP POLICY IF EXISTS "Authenticated puede ver teachers" ON public.teachers;
DROP POLICY IF EXISTS "Admin puede gestionar teachers" ON public.teachers;
DROP POLICY IF EXISTS "teachers_select" ON public.teachers;
DROP POLICY IF EXISTS "teachers_insert" ON public.teachers;
DROP POLICY IF EXISTS "teachers_update" ON public.teachers;
DROP POLICY IF EXISTS "teachers_delete" ON public.teachers;

CREATE POLICY "teachers_select" ON public.teachers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teachers_insert" ON public.teachers FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "teachers_update" ON public.teachers FOR UPDATE USING (public.is_admin());
CREATE POLICY "teachers_delete" ON public.teachers FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- SUBJECTS
DROP POLICY IF EXISTS "Authenticated puede ver subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin y docentes pueden gestionar subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete" ON public.subjects;

CREATE POLICY "subjects_select" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "subjects_insert" ON public.subjects FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "subjects_update" ON public.subjects FOR UPDATE USING (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id()));
CREATE POLICY "subjects_delete" ON public.subjects FOR DELETE USING (public.is_admin());

-- ASSIGNMENTS
DROP POLICY IF EXISTS "assignments_select" ON public.assignments;
DROP POLICY IF EXISTS "assignments_insert" ON public.assignments;
DROP POLICY IF EXISTS "assignments_update" ON public.assignments;
DROP POLICY IF EXISTS "assignments_delete" ON public.assignments;

CREATE POLICY "assignments_select" ON public.assignments FOR SELECT USING (
    public.is_admin() OR teacher_id = public.my_teacher_id()
    OR (is_published = true AND subject_id IN (
        SELECT s.id FROM public.subjects s
        JOIN public.students st ON s.grade_level = st.grade_level AND s.grade_level IS NOT NULL
        WHERE st.id = public.my_student_id() OR st.id IN (SELECT public.my_children_ids())
    ))
);
CREATE POLICY "assignments_insert" ON public.assignments FOR INSERT WITH CHECK (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id()));
CREATE POLICY "assignments_update" ON public.assignments FOR UPDATE USING (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id()));
CREATE POLICY "assignments_delete" ON public.assignments FOR DELETE USING (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND teacher_id = public.my_teacher_id()));

-- SUBMISSIONS
DROP POLICY IF EXISTS "submissions_select" ON public.submissions;
DROP POLICY IF EXISTS "submissions_insert" ON public.submissions;
DROP POLICY IF EXISTS "submissions_update" ON public.submissions;
DROP POLICY IF EXISTS "submissions_delete" ON public.submissions;

CREATE POLICY "submissions_select" ON public.submissions FOR SELECT USING (
    public.is_admin() OR student_id = public.my_student_id() OR student_id IN (SELECT public.my_children_ids())
    OR (public.has_any_role(ARRAY['docente']) AND assignment_id IN (SELECT id FROM public.assignments WHERE teacher_id = public.my_teacher_id()))
);
CREATE POLICY "submissions_insert" ON public.submissions FOR INSERT WITH CHECK (public.is_admin() OR student_id = public.my_student_id());
CREATE POLICY "submissions_update" ON public.submissions FOR UPDATE USING (public.is_admin() OR student_id = public.my_student_id() OR (public.has_any_role(ARRAY['docente']) AND assignment_id IN (SELECT id FROM public.assignments WHERE teacher_id = public.my_teacher_id())));
CREATE POLICY "submissions_delete" ON public.submissions FOR DELETE USING (public.is_admin());

-- PAYMENTS
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
DROP POLICY IF EXISTS "payments_delete" ON public.payments;

CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (
    public.has_any_role(ARRAY['master','direccion','contabilidad','administracion'])
    OR student_id = public.my_student_id() OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','contabilidad','administracion']));
CREATE POLICY "payments_update" ON public.payments FOR UPDATE USING (public.has_any_role(ARRAY['master','direccion','contabilidad','administracion']));
CREATE POLICY "payments_delete" ON public.payments FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- EXPENSES
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','contabilidad','administracion']));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- INVENTORY
DROP POLICY IF EXISTS "inventory_select" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update" ON public.inventory;
DROP POLICY IF EXISTS "inventory_delete" ON public.inventory;

CREATE POLICY "inventory_select" ON public.inventory FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca','tienda','mantenimiento','contabilidad']));
CREATE POLICY "inventory_insert" ON public.inventory FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','administracion','biblioteca','tienda','mantenimiento']));
CREATE POLICY "inventory_update" ON public.inventory FOR UPDATE USING (public.has_any_role(ARRAY['master','administracion','biblioteca','tienda','mantenimiento']));
CREATE POLICY "inventory_delete" ON public.inventory FOR DELETE USING (public.has_any_role(ARRAY['master','direccion','administracion']));

-- ATTENDANCE
DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;

CREATE POLICY "attendance_select" ON public.attendance FOR SELECT USING (
    public.is_admin() OR student_id = public.my_student_id() OR student_id IN (SELECT public.my_children_ids())
    OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids()))
);
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT WITH CHECK (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids())));
CREATE POLICY "attendance_update" ON public.attendance FOR UPDATE USING (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids())));
CREATE POLICY "attendance_delete" ON public.attendance FOR DELETE USING (public.is_admin());

-- ACTIVITY LOGS
DROP POLICY IF EXISTS "logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;

CREATE POLICY "logs_select" ON public.activity_logs FOR SELECT USING (user_id = auth.uid() OR public.has_any_role(ARRAY['master','direccion']));
CREATE POLICY "logs_insert" ON public.activity_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- PARENTS
DROP POLICY IF EXISTS "parents_select" ON public.parents;
DROP POLICY IF EXISTS "parents_insert" ON public.parents;
DROP POLICY IF EXISTS "parents_update" ON public.parents;
DROP POLICY IF EXISTS "parents_delete" ON public.parents;

CREATE POLICY "parents_select" ON public.parents FOR SELECT USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "parents_insert" ON public.parents FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "parents_update" ON public.parents FOR UPDATE USING (public.is_admin());
CREATE POLICY "parents_delete" ON public.parents FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- ============================================================
-- 4. E2: TABLAS ADICIONALES (calendario, comunicados, pagos avanzados,
--        biblioteca, tienda, aulas virtuales, expediente)
-- ============================================================

-- CALENDARIO
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL, description TEXT,
    start_date TIMESTAMPTZ NOT NULL, end_date TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT false,
    audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public','teachers','admin','parents','students','all')),
    grade_level TEXT, section TEXT,
    color TEXT DEFAULT '#6366f1', location TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE INDEX IF NOT EXISTS idx_calendar_start    ON public.calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_audience ON public.calendar_events(audience);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_select" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_insert" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_update" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_delete" ON public.calendar_events;
CREATE POLICY "calendar_select" ON public.calendar_events FOR SELECT USING (audience IN ('public','all') OR public.is_admin() OR (audience='teachers' AND public.has_any_role(ARRAY['docente','master','direccion','administracion'])) OR (audience='parents' AND public.has_any_role(ARRAY['padre','master','direccion','administracion'])) OR (audience='students' AND public.has_any_role(ARRAY['alumno','padre','docente','master','direccion','administracion'])));
CREATE POLICY "calendar_insert" ON public.calendar_events FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','marketing','docente']));
CREATE POLICY "calendar_update" ON public.calendar_events FOR UPDATE USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "calendar_delete" ON public.calendar_events FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- COMUNICADOS
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL, body TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','docentes','alumnos','padres','administrativo')),
    is_published BOOLEAN DEFAULT false, requires_confirmation BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(), confirmed_at TIMESTAMPTZ,
    UNIQUE(announcement_id, user_id)
);
CREATE OR REPLACE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE INDEX IF NOT EXISTS idx_announcements_audience  ON public.announcements(audience);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(is_published);
CREATE INDEX IF NOT EXISTS idx_ann_reads_user          ON public.announcement_reads(user_id);
ALTER TABLE public.announcements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ann_select"       ON public.announcements;
DROP POLICY IF EXISTS "ann_insert"       ON public.announcements;
DROP POLICY IF EXISTS "ann_update"       ON public.announcements;
DROP POLICY IF EXISTS "ann_delete"       ON public.announcements;
DROP POLICY IF EXISTS "ann_reads_select" ON public.announcement_reads;
DROP POLICY IF EXISTS "ann_reads_insert" ON public.announcement_reads;
DROP POLICY IF EXISTS "ann_reads_update" ON public.announcement_reads;
CREATE POLICY "ann_select"       ON public.announcements FOR SELECT USING (is_published=true OR public.is_admin() OR created_by=auth.uid());
CREATE POLICY "ann_insert"       ON public.announcements FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','marketing','docente']));
CREATE POLICY "ann_update"       ON public.announcements FOR UPDATE USING (public.is_admin() OR created_by=auth.uid());
CREATE POLICY "ann_delete"       ON public.announcements FOR DELETE USING (public.is_admin() OR created_by=auth.uid());
CREATE POLICY "ann_reads_select" ON public.announcement_reads FOR SELECT USING (user_id=auth.uid() OR public.is_admin());
CREATE POLICY "ann_reads_insert" ON public.announcement_reads FOR INSERT WITH CHECK (user_id=auth.uid());
CREATE POLICY "ann_reads_update" ON public.announcement_reads FOR UPDATE USING (user_id=auth.uid());

-- PAGOS AVANZADOS
CREATE TABLE IF NOT EXISTS public.billing_periods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    due_date DATE NOT NULL, grace_start_day INTEGER DEFAULT 28, grace_end_day INTEGER DEFAULT 1,
    late_fee_amount DECIMAL(10,2) DEFAULT 0, late_fee_type TEXT DEFAULT 'fixed' CHECK (late_fee_type IN ('fixed','percentage')),
    is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(year,month)
);
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    billing_period_id UUID REFERENCES public.billing_periods(id),
    concept TEXT NOT NULL, amount DECIMAL(10,2) NOT NULL, due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled','partial')),
    notes TEXT, created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id),
    amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'transfer' CHECK (payment_method IN ('cash','transfer','card','check')),
    receipt_url TEXT, reference_number TEXT,
    status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
    reviewed_by UUID REFERENCES public.profiles(id), reviewed_at TIMESTAMPTZ,
    reject_reason TEXT, notes TEXT, submitted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.late_fees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id),
    amount DECIMAL(10,2) NOT NULL, reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','waived')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.access_flags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE,
    is_blocked BOOLEAN DEFAULT false, block_reason TEXT,
    blocked_modules TEXT[] DEFAULT '{}', blocked_since DATE, last_payment_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_student  ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_period   ON public.invoices(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_receipts_student  ON public.payment_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status   ON public.payment_receipts(status);
CREATE INDEX IF NOT EXISTS idx_late_fees_student ON public.late_fees(student_id);
ALTER TABLE public.billing_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_fees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_flags     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bp_select"   ON public.billing_periods;
DROP POLICY IF EXISTS "bp_manage"   ON public.billing_periods;
DROP POLICY IF EXISTS "inv_select"  ON public.invoices;
DROP POLICY IF EXISTS "inv_manage"  ON public.invoices;
DROP POLICY IF EXISTS "rcpt_select" ON public.payment_receipts;
DROP POLICY IF EXISTS "rcpt_insert" ON public.payment_receipts;
DROP POLICY IF EXISTS "rcpt_update" ON public.payment_receipts;
DROP POLICY IF EXISTS "lf_select"   ON public.late_fees;
DROP POLICY IF EXISTS "lf_manage"   ON public.late_fees;
DROP POLICY IF EXISTS "af_select"   ON public.access_flags;
DROP POLICY IF EXISTS "af_manage"   ON public.access_flags;
CREATE POLICY "bp_select" ON public.billing_periods FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "bp_manage" ON public.billing_periods FOR ALL USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "inv_select" ON public.invoices FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','contabilidad','administracion']) OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "inv_manage" ON public.invoices FOR ALL USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "rcpt_select" ON public.payment_receipts FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','contabilidad']) OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "rcpt_insert" ON public.payment_receipts FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','contabilidad']) OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "rcpt_update" ON public.payment_receipts FOR UPDATE USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "lf_select" ON public.late_fees FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','contabilidad']) OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "lf_manage" ON public.late_fees FOR ALL USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));
CREATE POLICY "af_select" ON public.access_flags FOR SELECT USING (public.is_admin() OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "af_manage" ON public.access_flags FOR ALL USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));

-- BIBLIOTECA
CREATE TABLE IF NOT EXISTS public.books (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL, author TEXT NOT NULL, isbn TEXT UNIQUE, category TEXT,
    publisher TEXT, publication_year INTEGER,
    total_copies INTEGER NOT NULL DEFAULT 1, available_copies INTEGER NOT NULL DEFAULT 1,
    location TEXT, cover_url TEXT, description TEXT, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT books_copies_check CHECK (available_copies >= 0 AND available_copies <= total_copies)
);
CREATE TABLE IF NOT EXISTS public.book_loans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id),
    loaned_by UUID REFERENCES public.profiles(id),
    loan_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE NOT NULL, return_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','returned','overdue','lost')),
    fine_amount DECIMAL(10,2) DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION public.handle_book_loan() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        UPDATE public.books SET available_copies=available_copies-1 WHERE id=NEW.book_id AND available_copies>0;
        IF NOT FOUND THEN RAISE EXCEPTION 'No hay ejemplares disponibles'; END IF;
    ELSIF TG_OP='UPDATE' AND NEW.status IN ('returned','lost') AND OLD.status='active' THEN
        UPDATE public.books SET available_copies=available_copies+1 WHERE id=NEW.book_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS book_loan_copies_trigger ON public.book_loans;
CREATE TRIGGER book_loan_copies_trigger AFTER INSERT OR UPDATE OF status ON public.book_loans FOR EACH ROW EXECUTE FUNCTION public.handle_book_loan();
CREATE INDEX IF NOT EXISTS idx_books_title   ON public.books(title);
CREATE INDEX IF NOT EXISTS idx_books_isbn    ON public.books(isbn);
CREATE INDEX IF NOT EXISTS idx_loans_student ON public.book_loans(student_id);
CREATE INDEX IF NOT EXISTS idx_loans_status  ON public.book_loans(status);
ALTER TABLE public.books      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "books_select" ON public.books;
DROP POLICY IF EXISTS "books_manage" ON public.books;
DROP POLICY IF EXISTS "loans_select" ON public.book_loans;
DROP POLICY IF EXISTS "loans_insert" ON public.book_loans;
DROP POLICY IF EXISTS "loans_update" ON public.book_loans;
DROP POLICY IF EXISTS "loans_delete" ON public.book_loans;
CREATE POLICY "books_select" ON public.books FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "books_manage" ON public.books FOR ALL USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));
CREATE POLICY "loans_select" ON public.book_loans FOR SELECT USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']) OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "loans_insert" ON public.book_loans FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));
CREATE POLICY "loans_update" ON public.book_loans FOR UPDATE USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));
CREATE POLICY "loans_delete" ON public.book_loans FOR DELETE USING (public.has_any_role(ARRAY['master','biblioteca']));

-- TIENDA
CREATE TABLE IF NOT EXISTS public.store_categories (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, name TEXT NOT NULL UNIQUE, icon TEXT, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.store_products (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, category_id UUID REFERENCES public.store_categories(id), name TEXT NOT NULL, description TEXT, price DECIMAL(10,2) NOT NULL, stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER DEFAULT 2, image_url TEXT, is_available BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT products_price_check CHECK (price>=0), CONSTRAINT products_stock_check CHECK (stock>=0));
CREATE TABLE IF NOT EXISTS public.store_orders (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, student_id UUID REFERENCES public.students(id), ordered_by UUID REFERENCES public.profiles(id), status TEXT DEFAULT 'draft' CHECK (status IN ('draft','placed','paid','delivered','cancelled')), total DECIMAL(10,2) DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.store_order_items (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, order_id UUID REFERENCES public.store_orders(id) ON DELETE CASCADE, product_id UUID REFERENCES public.store_products(id), quantity INTEGER NOT NULL DEFAULT 1, unit_price DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT items_qty_check CHECK (quantity>0));
CREATE OR REPLACE TRIGGER store_products_updated_at BEFORE UPDATE ON public.store_products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER store_orders_updated_at   BEFORE UPDATE ON public.store_orders    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE INDEX IF NOT EXISTS idx_products_category ON public.store_products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_student    ON public.store_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.store_orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.store_order_items(order_id);
ALTER TABLE public.store_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sc_select"  ON public.store_categories;
DROP POLICY IF EXISTS "sc_manage"  ON public.store_categories;
DROP POLICY IF EXISTS "sp_select"  ON public.store_products;
DROP POLICY IF EXISTS "sp_manage"  ON public.store_products;
DROP POLICY IF EXISTS "so_select"  ON public.store_orders;
DROP POLICY IF EXISTS "so_insert"  ON public.store_orders;
DROP POLICY IF EXISTS "so_update"  ON public.store_orders;
DROP POLICY IF EXISTS "so_delete"  ON public.store_orders;
DROP POLICY IF EXISTS "soi_select" ON public.store_order_items;
DROP POLICY IF EXISTS "soi_manage" ON public.store_order_items;
CREATE POLICY "sc_select" ON public.store_categories  FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "sc_manage" ON public.store_categories  FOR ALL    USING (public.has_any_role(ARRAY['master','tienda','administracion']));
CREATE POLICY "sp_select" ON public.store_products    FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "sp_manage" ON public.store_products    FOR ALL    USING (public.has_any_role(ARRAY['master','tienda','administracion']));
CREATE POLICY "so_select" ON public.store_orders FOR SELECT USING (public.has_any_role(ARRAY['master','tienda','administracion']) OR ordered_by=auth.uid() OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "so_insert" ON public.store_orders FOR INSERT WITH CHECK (public.has_any_role(ARRAY['master','tienda','administracion']) OR ordered_by=auth.uid());
CREATE POLICY "so_update" ON public.store_orders FOR UPDATE USING (public.has_any_role(ARRAY['master','tienda','administracion']) OR (ordered_by=auth.uid() AND status='draft'));
CREATE POLICY "so_delete" ON public.store_orders FOR DELETE USING (public.has_any_role(ARRAY['master','tienda']));
CREATE POLICY "soi_select" ON public.store_order_items FOR SELECT USING (public.has_any_role(ARRAY['master','tienda','administracion']) OR order_id IN (SELECT id FROM public.store_orders WHERE ordered_by=auth.uid()));
CREATE POLICY "soi_manage" ON public.store_order_items FOR ALL    USING (public.has_any_role(ARRAY['master','tienda','administracion']) OR order_id IN (SELECT id FROM public.store_orders WHERE ordered_by=auth.uid() AND status='draft'));

-- EXPEDIENTE ESTUDIANTIL
CREATE TABLE IF NOT EXISTS public.student_health (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, student_id UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE, blood_type TEXT CHECK (blood_type IN ('A+','A-','B+','B-','O+','O-','AB+','AB-')), allergies TEXT, medical_conditions TEXT, medications TEXT, doctor_name TEXT, doctor_phone TEXT, insurance_provider TEXT, insurance_number TEXT, notes TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.student_documents (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, student_id UUID REFERENCES public.students(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK (type IN ('birth_certificate','id_card','photo','vaccination','transfer','other')), name TEXT NOT NULL, file_url TEXT NOT NULL, uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.student_disciplinary (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, student_id UUID REFERENCES public.students(id) ON DELETE CASCADE, date DATE NOT NULL DEFAULT CURRENT_DATE, type TEXT NOT NULL CHECK (type IN ('warning','suspension','commendation','note')), description TEXT NOT NULL, reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, resolved BOOLEAN DEFAULT false, resolution TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_health_student       ON public.student_health(student_id);
CREATE INDEX IF NOT EXISTS idx_docs_student         ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_student ON public.student_disciplinary(student_id);
ALTER TABLE public.student_health       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_disciplinary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_select" ON public.student_health;
DROP POLICY IF EXISTS "health_insert" ON public.student_health;
DROP POLICY IF EXISTS "health_update" ON public.student_health;
DROP POLICY IF EXISTS "health_delete" ON public.student_health;
DROP POLICY IF EXISTS "docs_select"   ON public.student_documents;
DROP POLICY IF EXISTS "docs_insert"   ON public.student_documents;
DROP POLICY IF EXISTS "docs_delete"   ON public.student_documents;
DROP POLICY IF EXISTS "disc_select"   ON public.student_disciplinary;
DROP POLICY IF EXISTS "disc_insert"   ON public.student_disciplinary;
DROP POLICY IF EXISTS "disc_update"   ON public.student_disciplinary;
DROP POLICY IF EXISTS "disc_delete"   ON public.student_disciplinary;
CREATE POLICY "health_select" ON public.student_health FOR SELECT USING (public.is_admin() OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()));
CREATE POLICY "health_insert" ON public.student_health FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "health_update" ON public.student_health FOR UPDATE USING (public.is_admin());
CREATE POLICY "health_delete" ON public.student_health FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));
CREATE POLICY "docs_select" ON public.student_documents FOR SELECT USING (public.is_admin() OR student_id=public.my_student_id() OR student_id IN (SELECT public.my_children_ids()) OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids())));
CREATE POLICY "docs_insert" ON public.student_documents FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "docs_delete" ON public.student_documents FOR DELETE USING (public.has_any_role(ARRAY['master','direccion','administracion']));
CREATE POLICY "disc_select" ON public.student_disciplinary FOR SELECT USING (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids())));
CREATE POLICY "disc_insert" ON public.student_disciplinary FOR INSERT WITH CHECK (public.is_admin() OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids())));
CREATE POLICY "disc_update" ON public.student_disciplinary FOR UPDATE USING (public.is_admin());
CREATE POLICY "disc_delete" ON public.student_disciplinary FOR DELETE USING (public.has_any_role(ARRAY['master','direccion']));

-- ============================================================
-- 5. E3: MÓDULO ACADÉMICO (niveles, grados escolares, materias)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text UNIQUE NOT NULL, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "levels_select_all" ON public.levels;
DROP POLICY IF EXISTS "levels_admin_all"  ON public.levels;
CREATE POLICY "levels_select_all" ON public.levels FOR SELECT USING (true);
CREATE POLICY "levels_admin_all"  ON public.levels FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

-- grades = grados escolares (Primer Grado, Segundo Grado, etc.)
CREATE TABLE IF NOT EXISTS public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid REFERENCES public.levels(id) ON DELETE CASCADE,
  name text NOT NULL, code text UNIQUE NOT NULL, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grades_select_all" ON public.grades;
DROP POLICY IF EXISTS "grades_admin_all"  ON public.grades;
CREATE POLICY "grades_select_all" ON public.grades FOR SELECT USING (true);
CREATE POLICY "grades_admin_all"  ON public.grades FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid REFERENCES public.grades(id) ON DELETE CASCADE,
  name text NOT NULL, capacity int DEFAULT 30, is_active boolean DEFAULT true,
  UNIQUE(grade_id, name)
);
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sections_select_all" ON public.sections;
DROP POLICY IF EXISTS "sections_admin_all"  ON public.sections;
CREATE POLICY "sections_select_all" ON public.sections FOR SELECT USING (true);
CREATE POLICY "sections_admin_all"  ON public.sections FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.school_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
  is_active boolean DEFAULT false, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_years_select_all" ON public.school_years;
DROP POLICY IF EXISTS "school_years_admin_all"  ON public.school_years;
CREATE POLICY "school_years_select_all" ON public.school_years FOR SELECT USING (true);
CREATE POLICY "school_years_admin_all"  ON public.school_years FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE TABLE IF NOT EXISTS public.subject_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text UNIQUE NOT NULL, description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subject_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subject_catalog_select_all" ON public.subject_catalog;
DROP POLICY IF EXISTS "subject_catalog_admin_all"  ON public.subject_catalog;
CREATE POLICY "subject_catalog_select_all" ON public.subject_catalog FOR SELECT USING (true);
CREATE POLICY "subject_catalog_admin_all"  ON public.subject_catalog FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.grade_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid REFERENCES public.grades(id) ON DELETE CASCADE,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id) ON DELETE CASCADE,
  weekly_hours int DEFAULT 5, sort_order int DEFAULT 0,
  UNIQUE(grade_id, subject_catalog_id)
);
ALTER TABLE public.grade_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grade_subjects_select_all" ON public.grade_subjects;
DROP POLICY IF EXISTS "grade_subjects_admin_all"  ON public.grade_subjects;
CREATE POLICY "grade_subjects_select_all" ON public.grade_subjects FOR SELECT USING (true);
CREATE POLICY "grade_subjects_admin_all"  ON public.grade_subjects FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  grade_subject_id uuid REFERENCES public.grade_subjects(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(),
  UNIQUE(grade_subject_id, section_id, school_year_id)
);
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ta_select_authenticated" ON public.teacher_assignments;
DROP POLICY IF EXISTS "ta_admin_all"            ON public.teacher_assignments;
CREATE POLICY "ta_select_authenticated" ON public.teacher_assignments FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "ta_admin_all"            ON public.teacher_assignments FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  status text DEFAULT 'active' CHECK (status IN ('active','withdrawn','graduated')),
  enrolled_at timestamptz DEFAULT now(),
  UNIQUE(student_id, school_year_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enrollments_select_auth" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_admin_all"   ON public.enrollments;
CREATE POLICY "enrollments_select_auth" ON public.enrollments FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "enrollments_admin_all"   ON public.enrollments FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.grade_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id),
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  week_type text NOT NULL CHECK (week_type IN ('week1','week2','labs','exams')),
  score numeric(5,2) NOT NULL CHECK (score >= 0),
  max_score numeric(5,2) DEFAULT 10, is_locked boolean DEFAULT false,
  entered_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(teacher_assignment_id, student_id, month, week_type)
);
ALTER TABLE public.grade_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ge_docente_select" ON public.grade_entries;
DROP POLICY IF EXISTS "ge_docente_insert" ON public.grade_entries;
DROP POLICY IF EXISTS "ge_docente_update" ON public.grade_entries;
DROP POLICY IF EXISTS "ge_alumno_select"  ON public.grade_entries;
DROP POLICY IF EXISTS "ge_padre_select"   ON public.grade_entries;
DROP POLICY IF EXISTS "ge_master_all"     ON public.grade_entries;
CREATE POLICY "ge_docente_select" ON public.grade_entries FOR SELECT USING (auth.role()='authenticated' AND (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion','contabilidad')) OR EXISTS (SELECT 1 FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.id=teacher_assignment_id AND t.user_id=auth.uid())));
CREATE POLICY "ge_docente_insert" ON public.grade_entries FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.id=teacher_assignment_id AND t.user_id=auth.uid()));
CREATE POLICY "ge_docente_update" ON public.grade_entries FOR UPDATE USING (NOT is_locked AND EXISTS (SELECT 1 FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.id=teacher_assignment_id AND t.user_id=auth.uid()));
CREATE POLICY "ge_alumno_select"  ON public.grade_entries FOR SELECT USING (EXISTS (SELECT 1 FROM students WHERE id=student_id AND user_id=auth.uid()));
CREATE POLICY "ge_padre_select"   ON public.grade_entries FOR SELECT USING (EXISTS (SELECT 1 FROM students s JOIN parents p ON p.id=s.parent_id WHERE s.id=student_id AND p.user_id=auth.uid()));
CREATE POLICY "ge_master_all"     ON public.grade_entries FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE TABLE IF NOT EXISTS public.monthly_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  school_year_id uuid REFERENCES public.school_years(id),
  week1_score numeric(5,2), week2_score numeric(5,2), lab_score numeric(5,2), exam_score numeric(5,2),
  final_score numeric(5,2) GENERATED ALWAYS AS (ROUND(COALESCE(week1_score,0)*0.10+COALESCE(week2_score,0)*0.20+COALESCE(lab_score,0)*0.30+COALESCE(exam_score,0)*0.40,2)) STORED,
  is_closed boolean DEFAULT false, closed_by uuid REFERENCES public.profiles(id), closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(teacher_assignment_id, student_id, month, school_year_id)
);
ALTER TABLE public.monthly_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mg_select_auth" ON public.monthly_grades;
DROP POLICY IF EXISTS "mg_admin_all"   ON public.monthly_grades;
CREATE POLICY "mg_select_auth" ON public.monthly_grades FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "mg_admin_all"   ON public.monthly_grades FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.school_settings (
  key text PRIMARY KEY, value text,
  updated_by uuid REFERENCES public.profiles(id), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_select_all" ON public.school_settings;
DROP POLICY IF EXISTS "settings_master_all" ON public.school_settings;
CREATE POLICY "settings_select_all" ON public.school_settings FOR SELECT USING (true);
CREATE POLICY "settings_master_all" ON public.school_settings FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL, title text NOT NULL, body text, data jsonb DEFAULT '{}',
  read_at timestamptz, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select_own"    ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"    ON public.notifications;
DROP POLICY IF EXISTS "notif_master_all"    ON public.notifications;
DROP POLICY IF EXISTS "notif_system_insert" ON public.notifications;
CREATE POLICY "notif_select_own"   ON public.notifications FOR SELECT USING (user_id=auth.uid());
CREATE POLICY "notif_update_own"   ON public.notifications FOR UPDATE USING (user_id=auth.uid());
CREATE POLICY "notif_master_all"   ON public.notifications FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));
CREATE POLICY "notif_system_insert" ON public.notifications FOR INSERT WITH CHECK (auth.role()='authenticated');

-- ============================================================
-- 6. SEED: Configuración, niveles, grados, secciones, materias
-- ============================================================

INSERT INTO public.school_settings (key, value) VALUES
  ('school_name',    'Colegio E-OS Demo'),
  ('school_tagline', 'Educación con Tecnología e Innovación'),
  ('primary_color',  '#6366f1'),
  ('logo_url',       null),
  ('school_email',   'info@eos.edu.sv'),
  ('school_phone',   ''),
  ('school_address', 'El Salvador')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.levels (name, code, sort_order) VALUES
  ('Parvularia',    'PARV', 1),
  ('Elementary',    'ELEM', 2),
  ('Middle School', 'MID',  3),
  ('High School',   'HIGH', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.grades (level_id, name, code, sort_order)
SELECT l.id, g.name, g.code, g.ord
FROM (VALUES
  ('PARV','Parvularia 4','P4',1),('PARV','Parvularia 5','P5',2),('PARV','Parvularia 6','P6',3),
  ('ELEM','Primer Grado','1G',4),('ELEM','Segundo Grado','2G',5),('ELEM','Tercer Grado','3G',6),
  ('ELEM','Cuarto Grado','4G',7),('ELEM','Quinto Grado','5G',8),('ELEM','Sexto Grado','6G',9),
  ('MID','Séptimo Grado','7G',10),('MID','Octavo Grado','8G',11),('MID','Noveno Grado','9G',12),
  ('HIGH','Décimo Grado','10G',13),('HIGH','Onceavo Grado','11G',14)
) AS g(lcode,name,code,ord)
JOIN public.levels l ON l.code=g.lcode
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.sections (grade_id, name, capacity)
SELECT g.id, s.name, 30 FROM public.grades g
CROSS JOIN (VALUES ('A'),('B')) AS s(name)
ON CONFLICT (grade_id, name) DO NOTHING;

INSERT INTO public.school_years (name, start_date, end_date, is_active) VALUES
  ('2026','2026-01-05','2026-10-30',true)
ON CONFLICT DO NOTHING;

INSERT INTO public.subject_catalog (name, code) VALUES
  ('Lenguaje y Literatura','LEN'),('Matemáticas','MAT'),('Ciencias Naturales','CNAT'),
  ('Estudios Sociales','ESOC'),('Educación Cristiana','ECRIS'),('Inglés','ING'),
  ('Educación Física','EDF'),('Arte y Música','ARTE'),('Computación','COMP'),
  ('Física','FIS'),('Química','QUIM'),('Biología','BIO'),
  ('Historia Universal','HIST'),('Emprendedurismo','EMP'),('Orientación','ORIEN')
ON CONFLICT (code) DO NOTHING;

-- Materias por nivel
INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id,sc.id,5,sc.so FROM public.grades g
JOIN public.levels l ON l.id=g.level_id AND l.code='PARV'
CROSS JOIN (SELECT sc.id,row_number() OVER() AS so FROM public.subject_catalog sc WHERE sc.code IN ('LEN','MAT','ECRIS','ARTE','ING','EDF')) sc
ON CONFLICT (grade_id,subject_catalog_id) DO NOTHING;

INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id,sc.id,5,sc.so FROM public.grades g
JOIN public.levels l ON l.id=g.level_id AND l.code='ELEM'
CROSS JOIN (SELECT sc.id,row_number() OVER() AS so FROM public.subject_catalog sc WHERE sc.code IN ('LEN','MAT','CNAT','ESOC','ECRIS','ING','EDF','ARTE','COMP')) sc
ON CONFLICT (grade_id,subject_catalog_id) DO NOTHING;

INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id,sc.id,5,sc.so FROM public.grades g
JOIN public.levels l ON l.id=g.level_id AND l.code='MID'
CROSS JOIN (SELECT sc.id,row_number() OVER() AS so FROM public.subject_catalog sc WHERE sc.code IN ('LEN','MAT','CNAT','ESOC','ECRIS','ING','EDF','COMP','HIST','ORIEN')) sc
ON CONFLICT (grade_id,subject_catalog_id) DO NOTHING;

INSERT INTO public.grade_subjects (grade_id, subject_catalog_id, weekly_hours, sort_order)
SELECT g.id,sc.id,5,sc.so FROM public.grades g
JOIN public.levels l ON l.id=g.level_id AND l.code='HIGH'
CROSS JOIN (SELECT sc.id,row_number() OVER() AS so FROM public.subject_catalog sc WHERE sc.code IN ('LEN','MAT','FIS','QUIM','BIO','ECRIS','ING','EDF','HIST','EMP','COMP')) sc
ON CONFLICT (grade_id,subject_catalog_id) DO NOTHING;

-- ============================================================
-- 7. E4: AULAS, CHAT Y ASISTENCIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  name text NOT NULL, description text, color text DEFAULT '#6366f1',
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(),
  UNIQUE(section_id,school_year_id)
);
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classrooms_select_auth" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_admin_all"   ON public.classrooms;
CREATE POLICY "classrooms_select_auth" ON public.classrooms FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "classrooms_admin_all"   ON public.classrooms FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.classroom_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false, created_at timestamptz DEFAULT now(),
  UNIQUE(classroom_id,teacher_id)
);
ALTER TABLE public.classroom_teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ct_select_auth" ON public.classroom_teachers;
DROP POLICY IF EXISTS "ct_admin_all"   ON public.classroom_teachers;
CREATE POLICY "ct_select_auth" ON public.classroom_teachers FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "ct_admin_all"   ON public.classroom_teachers FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.classroom_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL, attachment_url text, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.classroom_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cp_select_auth"    ON public.classroom_posts;
DROP POLICY IF EXISTS "cp_docente_insert" ON public.classroom_posts;
DROP POLICY IF EXISTS "cp_author_delete"  ON public.classroom_posts;
CREATE POLICY "cp_select_auth"    ON public.classroom_posts FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "cp_docente_insert" ON public.classroom_posts FOR INSERT WITH CHECK (auth.role()='authenticated');
CREATE POLICY "cp_author_delete"  ON public.classroom_posts FOR DELETE USING (author_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id),
  session_date date NOT NULL,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id),
  notes text, is_closed boolean DEFAULT false, created_at timestamptz DEFAULT now(),
  UNIQUE(section_id,session_date,subject_catalog_id)
);
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "as_select_auth"    ON public.attendance_sessions;
DROP POLICY IF EXISTS "as_teacher_insert" ON public.attendance_sessions;
DROP POLICY IF EXISTS "as_teacher_update" ON public.attendance_sessions;
CREATE POLICY "as_select_auth"   ON public.attendance_sessions FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "as_teacher_insert" ON public.attendance_sessions FOR INSERT WITH CHECK (auth.role()='authenticated' AND (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')) OR EXISTS (SELECT 1 FROM teachers WHERE user_id=auth.uid() AND id=teacher_id)));
CREATE POLICY "as_teacher_update" ON public.attendance_sessions FOR UPDATE USING (NOT is_closed AND (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')) OR EXISTS (SELECT 1 FROM teachers WHERE user_id=auth.uid() AND id=teacher_id)));

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
  note text, created_at timestamptz DEFAULT now(),
  UNIQUE(attendance_session_id,student_id)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_select_auth" ON public.attendance_records;
DROP POLICY IF EXISTS "ar_teacher_all" ON public.attendance_records;
CREATE POLICY "ar_select_auth" ON public.attendance_records FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "ar_teacher_all" ON public.attendance_records FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')) OR EXISTS (SELECT 1 FROM attendance_sessions s JOIN teachers t ON t.id=s.teacher_id WHERE s.id=attendance_session_id AND t.user_id=auth.uid()));

-- CHAT
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'group' CHECK (type IN ('direct','group','classroom','announcement')),
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id),
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cc_admin_all"    ON public.chat_channels;
DROP POLICY IF EXISTS "cc_select_member" ON public.chat_channels;
CREATE POLICY "cc_admin_all" ON public.chat_channels FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.chat_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(channel_id,user_id)
);
ALTER TABLE public.chat_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cm_select_own"   ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_admin_insert" ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_own_delete"   ON public.chat_memberships;
CREATE POLICY "cm_select_own"   ON public.chat_memberships FOR SELECT USING (user_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));
CREATE POLICY "cm_admin_insert" ON public.chat_memberships FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')) OR user_id=auth.uid());
CREATE POLICY "cm_own_delete"   ON public.chat_memberships FOR DELETE USING (user_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL, attachment_url text,
  reply_to uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean DEFAULT false, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_select_member" ON public.chat_messages;
DROP POLICY IF EXISTS "msg_member_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "msg_own_delete"    ON public.chat_messages;
CREATE POLICY "msg_select_member" ON public.chat_messages FOR SELECT USING (EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id=channel_id AND cm.user_id=auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));
CREATE POLICY "msg_member_insert" ON public.chat_messages FOR INSERT WITH CHECK (sender_id=auth.uid() AND EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id=channel_id AND cm.user_id=auth.uid()));
CREATE POLICY "msg_own_delete"    ON public.chat_messages FOR DELETE USING (sender_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion')));

CREATE POLICY "cc_select_member" ON public.chat_channels FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion'))
    OR EXISTS (SELECT 1 FROM chat_memberships cm WHERE cm.channel_id=id AND cm.user_id=auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel     ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_section ON public.attendance_sessions(section_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section        ON public.enrollments(section_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_grade_entries_ta           ON public.grade_entries(teacher_assignment_id, student_id);

-- ============================================================
-- 8. E5: HORARIOS (nuevo schema)
-- ============================================================

DROP TABLE IF EXISTS public.class_schedules CASCADE;

CREATE TABLE public.class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  subject_catalog_id uuid REFERENCES public.subject_catalog(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('lunes','martes','miercoles','jueves','viernes','sabado')),
  start_time time NOT NULL, end_time time NOT NULL,
  color text DEFAULT '#6366f1', notes text, created_at timestamptz DEFAULT now(),
  UNIQUE(section_id, school_year_id, day_of_week, start_time)
);
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_select_auth"   ON public.class_schedules FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "cs_admin_all"     ON public.class_schedules FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));
CREATE POLICY "cs_teacher_insert" ON public.class_schedules FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')) OR EXISTS (SELECT 1 FROM teachers WHERE user_id=auth.uid() AND id=teacher_id));
CREATE INDEX IF NOT EXISTS idx_class_schedules_section ON public.class_schedules(section_id, school_year_id, day_of_week);

-- Redefinicion correcta de my_teacher_student_ids ahora que class_schedules existe
CREATE OR REPLACE FUNCTION public.my_teacher_student_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT e.student_id
  FROM public.class_schedules cs
  JOIN public.enrollments e ON e.section_id = cs.section_id
    AND e.school_year_id = cs.school_year_id
  WHERE cs.teacher_id = public.my_teacher_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 9. E6: EQUIPO / EXPEDIENTE LABORAL
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL, national_id text, birth_date date,
  gender text CHECK (gender IN ('M','F','otro')), nationality text DEFAULT 'Salvadoreña', photo_url text,
  email text, phone text, address text,
  emergency_contact_name text, emergency_contact_phone text,
  staff_type text NOT NULL DEFAULT 'otro' CHECK (staff_type IN ('docente','director','sub_director','administracion','recepcionista','asistente','mantenimiento','limpieza','tienda','vigilancia','otro')),
  employee_number text, position text, department text,
  hire_date date, end_date date,
  contract_type text CHECK (contract_type IN ('tiempo_completo','medio_tiempo','eventual','contrato')),
  salary numeric(10,2), isss_number text, afp_number text,
  afp_provider text CHECK (afp_provider IN ('AFP Crecer','AFP Confia')),
  is_active boolean DEFAULT true, notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_master_all"              ON public.staff;
DROP POLICY IF EXISTS "staff_direccion_select"        ON public.staff;
DROP POLICY IF EXISTS "staff_administracion_select"   ON public.staff;
DROP POLICY IF EXISTS "staff_administracion_insert"   ON public.staff;
DROP POLICY IF EXISTS "staff_administracion_update"   ON public.staff;
CREATE POLICY "staff_master_all"            ON public.staff FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='master'));
CREATE POLICY "staff_direccion_select"      ON public.staff FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='direccion'));
CREATE POLICY "staff_administracion_select" ON public.staff FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administracion'));
CREATE POLICY "staff_administracion_insert" ON public.staff FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administracion'));
CREATE POLICY "staff_administracion_update" ON public.staff FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administracion'));
CREATE INDEX IF NOT EXISTS idx_staff_type   ON public.staff(staff_type);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(is_active);
DROP TRIGGER IF EXISTS staff_updated_at ON public.staff;
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 10. E7: STORAGE DE FOTOS + ASISTENCIA DEL PERSONAL
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photos','photos',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "photos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "photos_auth_upload"  ON storage.objects;
DROP POLICY IF EXISTS "photos_auth_update"  ON storage.objects;
DROP POLICY IF EXISTS "photos_admin_delete" ON storage.objects;
CREATE POLICY "photos_public_read"  ON storage.objects FOR SELECT USING (bucket_id='photos');
CREATE POLICY "photos_auth_upload"  ON storage.objects FOR INSERT WITH CHECK (bucket_id='photos' AND auth.role()='authenticated');
CREATE POLICY "photos_auth_update"  ON storage.objects FOR UPDATE USING (bucket_id='photos' AND auth.role()='authenticated');
CREATE POLICY "photos_admin_delete" ON storage.objects FOR DELETE USING (bucket_id='photos' AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('master','direccion','administracion')));

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  check_in time, check_out time,
  status text NOT NULL DEFAULT 'presente' CHECK (status IN ('presente','ausente','tardanza','permiso','vacaciones')),
  notes text, recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, date)
);
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_att_master_all"              ON public.staff_attendance;
DROP POLICY IF EXISTS "staff_att_direccion_select"        ON public.staff_attendance;
DROP POLICY IF EXISTS "staff_att_administracion_select"   ON public.staff_attendance;
CREATE POLICY "staff_att_master_all"              ON public.staff_attendance FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='master'));
CREATE POLICY "staff_att_direccion_select"        ON public.staff_attendance FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='direccion'));
CREATE POLICY "staff_att_administracion_select"   ON public.staff_attendance FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administracion'));
CREATE INDEX IF NOT EXISTS idx_staff_att_date     ON public.staff_attendance(date);
CREATE INDEX IF NOT EXISTS idx_staff_att_staff_id ON public.staff_attendance(staff_id);
DROP TRIGGER IF EXISTS staff_att_updated_at ON public.staff_attendance;
CREATE TRIGGER staff_att_updated_at BEFORE UPDATE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT 'Niveles:'          AS tabla, count(*) FROM public.levels
UNION ALL SELECT 'Grados escolares:', count(*) FROM public.grades
UNION ALL SELECT 'Secciones:',        count(*) FROM public.sections
UNION ALL SELECT 'Año escolar:',      count(*) FROM public.school_years
UNION ALL SELECT 'Cat. materias:',    count(*) FROM public.subject_catalog
UNION ALL SELECT 'Materias/grado:',   count(*) FROM public.grade_subjects
UNION ALL SELECT 'Profiles:',         count(*) FROM public.profiles;

-- ============================================================
-- PRÓXIMO PASO: crear usuario master en
--   Supabase > Authentication > Add User
--   Email: admin@eos.edu.sv  Password: EOS2026!
-- Luego ejecutar:
--   UPDATE public.profiles SET role='master' WHERE email='admin@eos.edu.sv';
-- ============================================================
