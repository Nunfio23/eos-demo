-- ============================================================
-- E2: NUEVAS TABLAS — E-OS
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Requiere: e1_rls_hardening.sql ya ejecutado
-- ============================================================

-- ============================================================
-- 1. CALENDARIO ESCOLAR
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT,
    start_date   TIMESTAMPTZ NOT NULL,
    end_date     TIMESTAMPTZ NOT NULL,
    all_day      BOOLEAN DEFAULT false,
    -- audience: quién puede ver el evento
    audience     TEXT NOT NULL DEFAULT 'public'
                   CHECK (audience IN ('public','teachers','admin','parents','students','all')),
    grade_level  TEXT,    -- NULL = todos los grados
    section      TEXT,    -- NULL = todas las secciones
    color        TEXT DEFAULT '#6366f1',
    location     TEXT,
    created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER calendar_events_updated_at
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_calendar_start ON public.calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_audience ON public.calendar_events(audience);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- SELECT: según audience
CREATE POLICY "calendar_select" ON public.calendar_events FOR SELECT USING (
    audience = 'public'
    OR audience = 'all'
    OR public.is_admin()
    OR (audience = 'teachers'  AND public.has_any_role(ARRAY['docente','master','direccion','administracion']))
    OR (audience = 'admin'     AND public.is_admin())
    OR (audience = 'parents'   AND public.has_any_role(ARRAY['padre','master','direccion','administracion']))
    OR (audience = 'students'  AND public.has_any_role(ARRAY['alumno','padre','docente','master','direccion','administracion']))
);
CREATE POLICY "calendar_insert" ON public.calendar_events FOR INSERT
    WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','marketing','docente']));
CREATE POLICY "calendar_update" ON public.calendar_events FOR UPDATE
    USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "calendar_delete" ON public.calendar_events FOR DELETE
    USING (public.is_admin() OR created_by = auth.uid());


-- ============================================================
-- 2. COMUNICADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcements (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title                 TEXT NOT NULL,
    body                  TEXT NOT NULL,
    audience              TEXT NOT NULL DEFAULT 'all'
                            CHECK (audience IN ('all','teachers','parents','students','admin','specific_grade')),
    grade_level           TEXT,    -- si audience = 'specific_grade'
    section               TEXT,
    is_published          BOOLEAN DEFAULT false,
    requires_confirmation BOOLEAN DEFAULT false,
    created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    UNIQUE(announcement_id, user_id)
);

CREATE TRIGGER announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_announcements_audience   ON public.announcements(audience);
CREATE INDEX IF NOT EXISTS idx_announcements_published  ON public.announcements(is_published);
CREATE INDEX IF NOT EXISTS idx_ann_reads_user           ON public.announcement_reads(user_id);

ALTER TABLE public.announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_select" ON public.announcements FOR SELECT USING (
    is_published = true
    OR public.is_admin()
    OR created_by = auth.uid()
);
CREATE POLICY "ann_insert" ON public.announcements FOR INSERT
    WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','marketing','docente']));
CREATE POLICY "ann_update" ON public.announcements FOR UPDATE
    USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "ann_delete" ON public.announcements FOR DELETE
    USING (public.is_admin() OR created_by = auth.uid());

CREATE POLICY "ann_reads_select" ON public.announcement_reads FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "ann_reads_insert" ON public.announcement_reads FOR INSERT
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "ann_reads_update" ON public.announcement_reads FOR UPDATE
    USING (user_id = auth.uid());


-- ============================================================
-- 3. PAGOS AVANZADOS (BLOQUEO POR MORA)
-- ============================================================

-- 3a. Periodos de facturación
CREATE TABLE IF NOT EXISTS public.billing_periods (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name             TEXT NOT NULL,                    -- "Enero 2025"
    year             INTEGER NOT NULL,
    month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    due_date         DATE NOT NULL,                    -- fecha límite de pago
    grace_start_day  INTEGER DEFAULT 28,               -- día mes anterior: abre ventana sin mora
    grace_end_day    INTEGER DEFAULT 1,                -- día del mes: cierra ventana sin mora
    late_fee_amount  DECIMAL(10,2) DEFAULT 0,
    late_fee_type    TEXT DEFAULT 'fixed'
                       CHECK (late_fee_type IN ('fixed','percentage')),
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
);

-- 3b. Cargos/facturas por estudiante
CREATE TABLE IF NOT EXISTS public.invoices (
    id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id        UUID REFERENCES public.students(id) ON DELETE CASCADE,
    billing_period_id UUID REFERENCES public.billing_periods(id),
    concept           TEXT NOT NULL,
    amount            DECIMAL(10,2) NOT NULL,
    due_date          DATE NOT NULL,
    status            TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','overdue','cancelled','partial')),
    notes             TEXT,
    created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3c. Comprobantes de pago (para transferencias/depósitos que finanzas debe aprobar)
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id       UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    student_id       UUID REFERENCES public.students(id),
    amount           DECIMAL(10,2) NOT NULL,
    payment_method   TEXT DEFAULT 'transfer'
                       CHECK (payment_method IN ('cash','transfer','card','check')),
    receipt_url      TEXT,                 -- comprobante subido a storage
    reference_number TEXT,
    status           TEXT DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review','approved','rejected')),
    reviewed_by      UUID REFERENCES public.profiles(id),
    reviewed_at      TIMESTAMPTZ,
    reject_reason    TEXT,
    notes            TEXT,
    submitted_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 3d. Multas por mora
CREATE TABLE IF NOT EXISTS public.late_fees (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id),
    amount     DECIMAL(10,2) NOT NULL,
    reason     TEXT,
    status     TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','waived')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3e. Flags de acceso (bloqueo por mora)
CREATE TABLE IF NOT EXISTS public.access_flags (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id       UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE,
    is_blocked       BOOLEAN DEFAULT false,
    block_reason     TEXT,
    blocked_modules  TEXT[] DEFAULT '{}',  -- ej: ARRAY['aulas','calificaciones']
    blocked_since    DATE,
    last_payment_date DATE,
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_student    ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_period     ON public.invoices(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_receipts_student    ON public.payment_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status     ON public.payment_receipts(status);
CREATE INDEX IF NOT EXISTS idx_late_fees_student   ON public.late_fees(student_id);

ALTER TABLE public.billing_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_fees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_flags      ENABLE ROW LEVEL SECURITY;

-- billing_periods: solo finanzas gestiona, todos pueden ver
CREATE POLICY "bp_select" ON public.billing_periods FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bp_manage" ON public.billing_periods FOR ALL
    USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));

-- invoices
CREATE POLICY "inv_select" ON public.invoices FOR SELECT USING (
    public.has_any_role(ARRAY['master','direccion','contabilidad','administracion'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "inv_manage" ON public.invoices FOR ALL
    USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));

-- payment_receipts: alumno/padre sube, finanzas aprueba
CREATE POLICY "rcpt_select" ON public.payment_receipts FOR SELECT USING (
    public.has_any_role(ARRAY['master','direccion','contabilidad'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "rcpt_insert" ON public.payment_receipts FOR INSERT WITH CHECK (
    public.has_any_role(ARRAY['master','direccion','contabilidad'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "rcpt_update" ON public.payment_receipts FOR UPDATE
    USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));

-- late_fees
CREATE POLICY "lf_select" ON public.late_fees FOR SELECT USING (
    public.has_any_role(ARRAY['master','direccion','contabilidad'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "lf_manage" ON public.late_fees FOR ALL
    USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));

-- access_flags
CREATE POLICY "af_select" ON public.access_flags FOR SELECT USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "af_manage" ON public.access_flags FOR ALL
    USING (public.has_any_role(ARRAY['master','direccion','contabilidad']));


-- ============================================================
-- 4. BIBLIOTECA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.books (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title            TEXT NOT NULL,
    author           TEXT NOT NULL,
    isbn             TEXT UNIQUE,
    category         TEXT,
    publisher        TEXT,
    publication_year INTEGER,
    total_copies     INTEGER NOT NULL DEFAULT 1,
    available_copies INTEGER NOT NULL DEFAULT 1,
    location         TEXT,               -- ubicación física: estante/pasillo
    cover_url        TEXT,
    description      TEXT,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT books_copies_check CHECK (available_copies >= 0 AND available_copies <= total_copies)
);

CREATE TABLE IF NOT EXISTS public.book_loans (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    book_id     UUID REFERENCES public.books(id) ON DELETE CASCADE,
    student_id  UUID REFERENCES public.students(id),
    loaned_by   UUID REFERENCES public.profiles(id),  -- bibliotecario
    loan_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date    DATE NOT NULL,
    return_date DATE,
    status      TEXT DEFAULT 'active'
                  CHECK (status IN ('active','returned','overdue','lost')),
    fine_amount DECIMAL(10,2) DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Función: decrementar available_copies al prestar
CREATE OR REPLACE FUNCTION public.handle_book_loan()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.books
           SET available_copies = available_copies - 1
         WHERE id = NEW.book_id AND available_copies > 0;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No hay ejemplares disponibles para este libro';
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('returned','lost') AND OLD.status = 'active' THEN
        UPDATE public.books
           SET available_copies = available_copies + 1
         WHERE id = NEW.book_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS book_loan_copies_trigger ON public.book_loans;
CREATE TRIGGER book_loan_copies_trigger
    AFTER INSERT OR UPDATE OF status ON public.book_loans
    FOR EACH ROW EXECUTE FUNCTION public.handle_book_loan();

CREATE INDEX IF NOT EXISTS idx_books_title      ON public.books(title);
CREATE INDEX IF NOT EXISTS idx_books_isbn       ON public.books(isbn);
CREATE INDEX IF NOT EXISTS idx_loans_student    ON public.book_loans(student_id);
CREATE INDEX IF NOT EXISTS idx_loans_status     ON public.book_loans(status);

ALTER TABLE public.books       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_loans  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books_select" ON public.books FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "books_manage" ON public.books FOR ALL
    USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));

CREATE POLICY "loans_select" ON public.book_loans FOR SELECT USING (
    public.has_any_role(ARRAY['master','direccion','administracion','biblioteca'])
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "loans_insert" ON public.book_loans FOR INSERT
    WITH CHECK (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));
CREATE POLICY "loans_update" ON public.book_loans FOR UPDATE
    USING (public.has_any_role(ARRAY['master','direccion','administracion','biblioteca']));
CREATE POLICY "loans_delete" ON public.book_loans FOR DELETE
    USING (public.has_any_role(ARRAY['master','biblioteca']));


-- ============================================================
-- 5. TIENDA CHALET
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_categories (
    id        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    icon      TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_products (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_id UUID REFERENCES public.store_categories(id),
    name        TEXT NOT NULL,
    description TEXT,
    price       DECIMAL(10,2) NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    min_stock   INTEGER DEFAULT 2,
    image_url   TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT products_price_check CHECK (price >= 0),
    CONSTRAINT products_stock_check CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS public.store_orders (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id  UUID REFERENCES public.students(id),
    ordered_by  UUID REFERENCES public.profiles(id),  -- padre o alumno
    status      TEXT DEFAULT 'draft'
                  CHECK (status IN ('draft','placed','paid','delivered','cancelled')),
    total       DECIMAL(10,2) DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_order_items (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id   UUID REFERENCES public.store_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.store_products(id),
    quantity   INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal   DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT items_qty_check CHECK (quantity > 0)
);

CREATE TRIGGER store_products_updated_at
    BEFORE UPDATE ON public.store_products
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER store_orders_updated_at
    BEFORE UPDATE ON public.store_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_category  ON public.store_products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_student     ON public.store_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON public.store_orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON public.store_order_items(order_id);

ALTER TABLE public.store_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sc_select" ON public.store_categories FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sc_manage" ON public.store_categories FOR ALL
    USING (public.has_any_role(ARRAY['master','tienda','administracion']));

CREATE POLICY "sp_select" ON public.store_products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sp_manage" ON public.store_products FOR ALL
    USING (public.has_any_role(ARRAY['master','tienda','administracion']));

CREATE POLICY "so_select" ON public.store_orders FOR SELECT USING (
    public.has_any_role(ARRAY['master','tienda','administracion'])
    OR ordered_by = auth.uid()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "so_insert" ON public.store_orders FOR INSERT WITH CHECK (
    public.has_any_role(ARRAY['master','tienda','administracion'])
    OR ordered_by = auth.uid()
);
CREATE POLICY "so_update" ON public.store_orders FOR UPDATE USING (
    public.has_any_role(ARRAY['master','tienda','administracion'])
    OR (ordered_by = auth.uid() AND status = 'draft')
);
CREATE POLICY "so_delete" ON public.store_orders FOR DELETE
    USING (public.has_any_role(ARRAY['master','tienda']));

CREATE POLICY "soi_select" ON public.store_order_items FOR SELECT USING (
    public.has_any_role(ARRAY['master','tienda','administracion'])
    OR order_id IN (SELECT id FROM public.store_orders WHERE ordered_by = auth.uid())
);
CREATE POLICY "soi_manage" ON public.store_order_items FOR ALL USING (
    public.has_any_role(ARRAY['master','tienda','administracion'])
    OR order_id IN (SELECT id FROM public.store_orders WHERE ordered_by = auth.uid() AND status = 'draft')
);


-- ============================================================
-- 6. AULAS VIRTUALES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.virtual_classrooms (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id  UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id  UUID REFERENCES public.teachers(id),
    name        TEXT NOT NULL,
    description TEXT,
    grade_level TEXT NOT NULL,
    section     TEXT NOT NULL DEFAULT 'A',
    cover_color TEXT DEFAULT '#6366f1',
    meet_link   TEXT,          -- enlace Meet/Zoom externo
    zoom_link   TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classroom_posts (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    classroom_id UUID REFERENCES public.virtual_classrooms(id) ON DELETE CASCADE,
    author_id    UUID REFERENCES public.profiles(id),
    type         TEXT NOT NULL DEFAULT 'announcement'
                   CHECK (type IN ('announcement','material','assignment')),
    title        TEXT NOT NULL,
    body         TEXT,
    due_date     DATE,                   -- solo para assignments
    max_score    DECIMAL(5,2) DEFAULT 100, -- solo para assignments
    file_url     TEXT,
    external_url TEXT,
    is_published BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classroom_submissions (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    post_id      UUID REFERENCES public.classroom_posts(id) ON DELETE CASCADE,
    student_id   UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content      TEXT,
    file_url     TEXT,
    score        DECIMAL(5,2),
    feedback     TEXT,
    status       TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending','submitted','graded','late')),
    submitted_at TIMESTAMPTZ,
    graded_at    TIMESTAMPTZ,
    UNIQUE(post_id, student_id)
);

CREATE TRIGGER classroom_posts_updated_at
    BEFORE UPDATE ON public.classroom_posts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_vc_subject       ON public.virtual_classrooms(subject_id);
CREATE INDEX IF NOT EXISTS idx_vc_teacher       ON public.virtual_classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cp_classroom     ON public.classroom_posts(classroom_id);
CREATE INDEX IF NOT EXISTS idx_cs_post          ON public.classroom_submissions(post_id);
CREATE INDEX IF NOT EXISTS idx_cs_student       ON public.classroom_submissions(student_id);

ALTER TABLE public.virtual_classrooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_submissions ENABLE ROW LEVEL SECURITY;

-- Función: ¿el alumno pertenece a esta aula?
CREATE OR REPLACE FUNCTION public.student_in_classroom(classroom_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.virtual_classrooms vc
    JOIN public.students s
      ON s.grade_level = vc.grade_level AND s.section = vc.section
    WHERE vc.id = classroom_id
      AND s.id = public.my_student_id()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "vc_select" ON public.virtual_classrooms FOR SELECT USING (
    public.is_admin()
    OR teacher_id = public.my_teacher_id()
    OR public.student_in_classroom(id)
    OR (public.has_any_role(ARRAY['padre']) AND id IN (
        SELECT vc.id FROM public.virtual_classrooms vc
        JOIN public.students s ON s.grade_level = vc.grade_level AND s.section = vc.section
        WHERE s.id IN (SELECT public.my_children_ids())
    ))
);
CREATE POLICY "vc_manage" ON public.virtual_classrooms FOR ALL
    USING (public.is_admin() OR teacher_id = public.my_teacher_id());

CREATE POLICY "cp_select" ON public.classroom_posts FOR SELECT USING (
    public.is_admin()
    OR author_id = auth.uid()
    OR (is_published = true AND public.student_in_classroom(classroom_id))
    OR classroom_id IN (
        SELECT id FROM public.virtual_classrooms
        WHERE teacher_id = public.my_teacher_id()
    )
);
CREATE POLICY "cp_insert" ON public.classroom_posts FOR INSERT WITH CHECK (
    public.is_admin()
    OR classroom_id IN (
        SELECT id FROM public.virtual_classrooms
        WHERE teacher_id = public.my_teacher_id()
    )
);
CREATE POLICY "cp_update" ON public.classroom_posts FOR UPDATE
    USING (public.is_admin() OR author_id = auth.uid());
CREATE POLICY "cp_delete" ON public.classroom_posts FOR DELETE
    USING (public.is_admin() OR author_id = auth.uid());

CREATE POLICY "cs_select" ON public.classroom_submissions FOR SELECT USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR post_id IN (
        SELECT cp.id FROM public.classroom_posts cp
        JOIN public.virtual_classrooms vc ON vc.id = cp.classroom_id
        WHERE vc.teacher_id = public.my_teacher_id()
    )
);
CREATE POLICY "cs_insert" ON public.classroom_submissions FOR INSERT WITH CHECK (
    public.is_admin()
    OR student_id = public.my_student_id()
);
CREATE POLICY "cs_update" ON public.classroom_submissions FOR UPDATE USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR post_id IN (
        SELECT cp.id FROM public.classroom_posts cp
        JOIN public.virtual_classrooms vc ON vc.id = cp.classroom_id
        WHERE vc.teacher_id = public.my_teacher_id()
    )
);


-- ============================================================
-- 7. EXPEDIENTE ESTUDIANTIL (EXTENSIÓN)
-- ============================================================

-- 7a. Salud
CREATE TABLE IF NOT EXISTS public.student_health (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id         UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE,
    blood_type         TEXT CHECK (blood_type IN ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
    allergies          TEXT,
    medical_conditions TEXT,
    medications        TEXT,
    doctor_name        TEXT,
    doctor_phone       TEXT,
    insurance_provider TEXT,
    insurance_number   TEXT,
    notes              TEXT,
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 7b. Documentos adjuntos
CREATE TABLE IF NOT EXISTS public.student_documents (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id  UUID REFERENCES public.students(id) ON DELETE CASCADE,
    type        TEXT NOT NULL
                  CHECK (type IN ('birth_certificate','id_card','photo','vaccination','transfer','other')),
    name        TEXT NOT NULL,
    file_url    TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 7c. Registro disciplinario
CREATE TABLE IF NOT EXISTS public.student_disciplinary (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id  UUID REFERENCES public.students(id) ON DELETE CASCADE,
    date        DATE NOT NULL DEFAULT CURRENT_DATE,
    type        TEXT NOT NULL
                  CHECK (type IN ('warning','suspension','commendation','note')),
    description TEXT NOT NULL,
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved    BOOLEAN DEFAULT false,
    resolution  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_student       ON public.student_health(student_id);
CREATE INDEX IF NOT EXISTS idx_docs_student         ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_student ON public.student_disciplinary(student_id);

ALTER TABLE public.student_health       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_disciplinary ENABLE ROW LEVEL SECURITY;

-- Salud: datos sensibles — master/admin/coordinación pueden ver/editar
CREATE POLICY "health_select" ON public.student_health FOR SELECT USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
);
CREATE POLICY "health_insert" ON public.student_health FOR INSERT
    WITH CHECK (public.is_admin());
CREATE POLICY "health_update" ON public.student_health FOR UPDATE
    USING (public.is_admin());
CREATE POLICY "health_delete" ON public.student_health FOR DELETE
    USING (public.has_any_role(ARRAY['master','direccion']));

-- Documentos
CREATE POLICY "docs_select" ON public.student_documents FOR SELECT USING (
    public.is_admin()
    OR student_id = public.my_student_id()
    OR student_id IN (SELECT public.my_children_ids())
    OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids()))
);
CREATE POLICY "docs_insert" ON public.student_documents FOR INSERT
    WITH CHECK (public.is_admin());
CREATE POLICY "docs_delete" ON public.student_documents FOR DELETE
    USING (public.has_any_role(ARRAY['master','direccion','administracion']));

-- Disciplinario: docente puede reportar, dirección edita
CREATE POLICY "disc_select" ON public.student_disciplinary FOR SELECT USING (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids()))
);
CREATE POLICY "disc_insert" ON public.student_disciplinary FOR INSERT WITH CHECK (
    public.is_admin()
    OR (public.has_any_role(ARRAY['docente']) AND student_id IN (SELECT public.my_teacher_student_ids()))
);
CREATE POLICY "disc_update" ON public.student_disciplinary FOR UPDATE
    USING (public.is_admin());
CREATE POLICY "disc_delete" ON public.student_disciplinary FOR DELETE
    USING (public.has_any_role(ARRAY['master','direccion']));


-- ============================================================
-- 8. STORAGE BUCKETS (ejecutar manualmente en Storage > New Bucket)
-- ============================================================
-- Crear los siguientes buckets en Supabase Storage:
--   • student-documents  (privado)
--   • payment-receipts   (privado)
--   • classroom-files    (privado)
--   • store-images       (público)
--   • book-covers        (público)
-- Las políticas de storage se configuran en el dashboard de Storage.


-- ============================================================
-- FIN E2 — MIGRACIÓN COMPLETA
-- ============================================================
