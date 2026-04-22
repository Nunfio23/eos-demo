-- ============================================================
-- TESLAOS - Colegio E-OS Demo
-- Base de Datos Completa para Supabase
-- Ejecuta este SQL en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: profiles (usuarios del sistema)
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

-- ============================================================
-- TABLA: students
-- ============================================================
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

-- ============================================================
-- TABLA: teachers
-- ============================================================
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

-- ============================================================
-- TABLA: parents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    occupation TEXT,
    relationship_type TEXT DEFAULT 'padre' CHECK (relationship_type IN ('padre','madre','tutor')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: subjects (materias)
-- ============================================================
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

-- ============================================================
-- TABLA: class_schedules (horarios)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.class_schedules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.teachers(id),
    grade_level TEXT NOT NULL,
    section TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    classroom TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: attendance (asistencia)
-- ============================================================
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

-- ============================================================
-- TABLA: assignments (tareas)
-- ============================================================
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

-- ============================================================
-- TABLA: submissions (entregas de tareas)
-- ============================================================
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

-- ============================================================
-- TABLA: grades (calificaciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.grades (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    letter_grade TEXT,
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: payments (pagos)
-- ============================================================
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

-- ============================================================
-- TABLA: expenses (gastos)
-- ============================================================
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

-- ============================================================
-- TABLA: inventory (inventario)
-- ============================================================
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

-- ============================================================
-- TABLA: activity_logs (bitácora de actividad)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para mejor rendimiento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_grade ON public.students(grade_level, section);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON public.assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);

-- ============================================================
-- FUNCIÓN: Auto-actualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCIÓN: Auto-crear perfil cuando se registra usuario
-- ============================================================
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

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- POLÍTICAS PROFILES
CREATE POLICY "Usuarios pueden ver perfiles"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Master y admin pueden gestionar perfiles"
    ON public.profiles FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion'));

-- POLÍTICAS STUDENTS
CREATE POLICY "Authenticated puede ver students"
    ON public.students FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin puede gestionar students"
    ON public.students FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion'));

-- POLÍTICAS TEACHERS
CREATE POLICY "Authenticated puede ver teachers"
    ON public.teachers FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin puede gestionar teachers"
    ON public.teachers FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion'));

-- POLÍTICAS SUBJECTS
CREATE POLICY "Authenticated puede ver subjects"
    ON public.subjects FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin y docentes pueden gestionar subjects"
    ON public.subjects FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion', 'docente'));

-- POLÍTICAS ASSIGNMENTS
CREATE POLICY "Authenticated puede ver assignments publicados"
    ON public.assignments FOR SELECT
    USING (auth.role() = 'authenticated' AND (is_published = true OR public.get_my_role() IN ('master','direccion','docente')));

CREATE POLICY "Docentes pueden gestionar sus assignments"
    ON public.assignments FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'docente'));

-- POLÍTICAS SUBMISSIONS
CREATE POLICY "Alumnos ven sus submissions"
    ON public.submissions FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
            OR public.get_my_role() IN ('master', 'direccion', 'docente')
        )
    );

CREATE POLICY "Alumnos pueden crear submissions"
    ON public.submissions FOR INSERT
    WITH CHECK (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        OR public.get_my_role() IN ('master', 'docente')
    );

CREATE POLICY "Docentes pueden actualizar submissions"
    ON public.submissions FOR UPDATE
    USING (public.get_my_role() IN ('master', 'docente'));

-- POLÍTICAS GRADES
CREATE POLICY "Alumnos ven sus calificaciones"
    ON public.grades FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
            OR public.get_my_role() IN ('master', 'direccion', 'docente', 'padre')
        )
    );

CREATE POLICY "Docentes pueden gestionar calificaciones"
    ON public.grades FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'docente'));

-- POLÍTICAS PAYMENTS
CREATE POLICY "Finanzas puede ver payments"
    ON public.payments FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
            OR public.get_my_role() IN ('master', 'direccion', 'contabilidad', 'administracion')
        )
    );

CREATE POLICY "Contabilidad puede gestionar payments"
    ON public.payments FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'contabilidad', 'administracion'));

-- POLÍTICAS EXPENSES
CREATE POLICY "Contabilidad puede ver gastos"
    ON public.expenses FOR SELECT
    USING (public.get_my_role() IN ('master', 'direccion', 'contabilidad', 'administracion'));

CREATE POLICY "Contabilidad puede gestionar gastos"
    ON public.expenses FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'contabilidad'));

-- POLÍTICAS INVENTORY
CREATE POLICY "Admin puede ver inventario"
    ON public.inventory FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin puede gestionar inventario"
    ON public.inventory FOR ALL
    USING (public.get_my_role() IN ('master', 'administracion', 'biblioteca', 'tienda', 'mantenimiento'));

-- POLÍTICAS ATTENDANCE
CREATE POLICY "Attendance visible para authorized"
    ON public.attendance FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
            OR public.get_my_role() IN ('master', 'direccion', 'docente', 'administracion')
        )
    );

CREATE POLICY "Docentes gestionan attendance"
    ON public.attendance FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'docente'));

-- POLÍTICAS ACTIVITY LOGS
CREATE POLICY "Ver logs propio o si es admin"
    ON public.activity_logs FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.get_my_role() IN ('master', 'direccion')
    );

CREATE POLICY "Todos pueden insertar logs"
    ON public.activity_logs FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- POLÍTICAS CLASS_SCHEDULES
CREATE POLICY "Todos ven horarios"
    ON public.class_schedules FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin gestiona horarios"
    ON public.class_schedules FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion'));

-- POLÍTICAS PARENTS
CREATE POLICY "Ver parents"
    ON public.parents FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin gestiona parents"
    ON public.parents FOR ALL
    USING (public.get_my_role() IN ('master', 'direccion', 'administracion'));

-- ============================================================
-- DATOS DEMO (opcional - descomenta para usar)
-- ============================================================
-- Nota: El primer usuario (master) debes crearlo desde
-- Supabase Authentication > Add User con:
--   Email: admin@eos.edu.sv
--   Password: Tesla2024!
-- Luego actualiza su rol en la tabla profiles:
-- UPDATE public.profiles SET role = 'master' WHERE email = 'admin@eos.edu.sv';

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================
