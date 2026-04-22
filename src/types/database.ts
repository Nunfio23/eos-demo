export type UserRole =
  | 'master'
  | 'direccion'
  | 'administracion'
  | 'docente'
  | 'alumno'
  | 'padre'
  | 'contabilidad'
  | 'biblioteca'
  | 'tienda'
  | 'marketing'
  | 'mantenimiento'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  phone?: string
  address?: string
  is_active: boolean
  blocked_modules?: string[]
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  user_id: string
  enrollment_number: string
  nie?: string          // Número de Identificación Estudiantil (El Salvador)
  grade_level: string
  section: string
  parent_id?: string
  date_of_birth?: string
  blood_type?: string
  emergency_contact?: string
  gender?: 'M' | 'F' | 'otro'
  nationality?: string
  id_type?: string
  handedness?: 'diestro' | 'zurdo'
  shirt_size?: string
  pants_size?: string
  skirt_size?: string
  previous_school?: string
  interests?: string
  special_needs?: boolean
  special_needs_description?: string
  professional_support?: boolean
  extracurricular?: string
  auth_exit?: boolean
  auth_photos?: boolean
  auth_internet?: boolean
  siblings_in_school?: boolean
  siblings_info?: string
  additional_info?: string
  is_active: boolean
  created_at: string
  profile?: Profile
}

export interface Teacher {
  id: string
  user_id: string
  employee_number: string
  specialization?: string
  hire_date?: string
  salary?: number
  is_active: boolean
  created_at: string
  profile?: Profile
}

export interface Parent {
  id: string
  user_id: string
  occupation?: string
  relationship_type: 'padre' | 'madre' | 'tutor'
  created_at: string
  profile?: Profile
}

export interface Subject {
  id: string
  name: string
  code: string
  description?: string
  grade_level: string
  teacher_id?: string
  credits?: number
  is_active: boolean
  created_at: string
  teacher?: Teacher
}

export interface ClassSchedule {
  id: string
  subject_id: string
  teacher_id: string
  grade_level: string
  section: string
  day_of_week: number
  start_time: string
  end_time: string
  classroom?: string
  created_at: string
  subject?: Subject
  teacher?: Teacher
}

export interface Attendance {
  id: string
  student_id: string
  subject_id: string
  date: string
  status: 'present' | 'absent' | 'late' | 'excused'
  notes?: string
  created_at: string
}

export interface Assignment {
  id: string
  subject_id: string
  teacher_id: string
  title: string
  description?: string
  due_date: string
  max_score: number
  is_published: boolean
  created_at: string
  subject?: Subject
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  content?: string
  file_url?: string
  score?: number
  feedback?: string
  submitted_at: string
  graded_at?: string
  status: 'pending' | 'submitted' | 'graded' | 'late'
}

export interface Grade {
  id: string
  student_id: string
  subject_id: string
  period: string
  score: number
  letter_grade?: string
  comments?: string
  created_at: string
}

export interface Payment {
  id: string
  student_id: string
  amount: number
  concept: string
  payment_date: string
  payment_method: 'cash' | 'transfer' | 'card' | 'check'
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  receipt_number?: string
  notes?: string
  created_at: string
  student?: Student
}

export interface Expense {
  id: string
  category: string
  description: string
  amount: number
  expense_date: string
  payment_method: string
  approved_by?: string
  receipt_url?: string
  notes?: string
  created_at: string
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: number
  min_quantity: number
  unit: string
  location?: string
  supplier?: string
  unit_cost?: number
  last_restocked?: string
  notes?: string
  created_at: string
}

export interface ActivityLog {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id?: string
  details?: Record<string, unknown>
  created_at: string
  profile?: Profile
}

// ─── E2: Nuevos tipos ────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  start_date: string
  end_date: string
  all_day: boolean
  audience: 'public' | 'teachers' | 'admin' | 'parents' | 'students' | 'all'
  grade_level?: string
  section?: string
  color: string
  location?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  audience: 'all' | 'teachers' | 'parents' | 'students' | 'admin' | 'specific_grade'
  grade_level?: string
  section?: string
  is_published: boolean
  requires_confirmation: boolean
  created_by?: string
  created_at: string
  updated_at: string
  author?: Profile
  read?: boolean
  confirmed?: boolean
}

export interface AnnouncementRead {
  id: string
  announcement_id: string
  user_id: string
  read_at: string
  confirmed_at?: string
}

export interface BillingPeriod {
  id: string
  name: string
  year: number
  month: number
  due_date: string
  grace_start_day: number
  grace_end_day: number
  late_fee_amount: number
  late_fee_type: 'fixed' | 'percentage'
  is_active: boolean
  created_at: string
}

export interface Invoice {
  id: string
  student_id: string
  billing_period_id?: string
  concept: string
  amount: number
  due_date: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partial'
  notes?: string
  created_by?: string
  created_at: string
  student?: Student
  billing_period?: BillingPeriod
}

export interface PaymentReceipt {
  id: string
  invoice_id: string
  student_id: string
  amount: number
  payment_method: 'cash' | 'transfer' | 'card' | 'check'
  receipt_url?: string
  reference_number?: string
  status: 'pending_review' | 'approved' | 'rejected'
  reviewed_by?: string
  reviewed_at?: string
  reject_reason?: string
  notes?: string
  submitted_at: string
}

export interface LateFee {
  id: string
  invoice_id: string
  student_id: string
  amount: number
  reason?: string
  status: 'pending' | 'paid' | 'waived'
  created_at: string
}

export interface AccessFlag {
  id: string
  student_id: string
  is_blocked: boolean
  block_reason?: string
  blocked_modules: string[]
  blocked_since?: string
  last_payment_date?: string
  updated_at: string
}

export interface Book {
  id: string
  title: string
  author: string
  isbn?: string
  category?: string
  publisher?: string
  publication_year?: number
  total_copies: number
  available_copies: number
  location?: string
  cover_url?: string
  description?: string
  is_active: boolean
  created_at: string
}

export interface BookLoan {
  id: string
  book_id: string
  student_id: string
  loaned_by?: string
  loan_date: string
  due_date: string
  return_date?: string
  status: 'active' | 'returned' | 'overdue' | 'lost'
  fine_amount: number
  notes?: string
  created_at: string
  book?: Book
  student?: Student
}

export interface StoreCategory {
  id: string
  name: string
  icon?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface StoreProduct {
  id: string
  category_id?: string
  name: string
  description?: string
  price: number
  stock: number
  min_stock: number
  image_url?: string
  is_available: boolean
  created_at: string
  updated_at: string
  category?: StoreCategory
}

export interface StoreOrder {
  id: string
  student_id?: string
  ordered_by?: string
  status: 'draft' | 'placed' | 'paid' | 'delivered' | 'cancelled'
  total: number
  notes?: string
  created_at: string
  updated_at: string
  student?: Student
  items?: StoreOrderItem[]
}

export interface StoreOrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
  product?: StoreProduct
}

export interface VirtualClassroom {
  id: string
  subject_id: string
  teacher_id?: string
  name: string
  description?: string
  grade_level: string
  section: string
  cover_color: string
  meet_link?: string
  zoom_link?: string
  is_active: boolean
  created_at: string
  subject?: Subject
  teacher?: Teacher
}

export interface ClassroomPost {
  id: string
  classroom_id: string
  author_id?: string
  type: 'announcement' | 'material' | 'assignment'
  title: string
  body?: string
  due_date?: string
  max_score?: number
  file_url?: string
  external_url?: string
  is_published: boolean
  created_at: string
  updated_at: string
  author?: Profile
  submissions_count?: number
}

export interface ClassroomSubmission {
  id: string
  post_id: string
  student_id: string
  content?: string
  file_url?: string
  score?: number
  feedback?: string
  status: 'pending' | 'submitted' | 'graded' | 'late'
  submitted_at?: string
  graded_at?: string
  student?: Student
}

export interface StudentHealth {
  id: string
  student_id: string
  blood_type?: string
  allergies?: string
  medical_conditions?: string
  medications?: string
  doctor_name?: string
  doctor_phone?: string
  insurance_provider?: string
  insurance_number?: string
  notes?: string
  updated_at: string
}

export interface StudentDocument {
  id: string
  student_id: string
  type: 'birth_certificate' | 'id_card' | 'photo' | 'vaccination' | 'transfer' | 'other'
  name: string
  file_url: string
  uploaded_by?: string
  notes?: string
  created_at: string
}

export interface StudentDisciplinary {
  id: string
  student_id: string
  date: string
  type: 'warning' | 'suspension' | 'commendation' | 'note'
  description: string
  reported_by?: string
  resolved: boolean
  resolution?: string
  created_at: string
  reporter?: Profile
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

// Dashboard Stats
export interface MasterStats {
  totalStudents: number
  totalTeachers: number
  totalParents: number
  totalUsers: number
  monthlyIncome: number
  monthlyExpenses: number
  totalIncome: number
  totalExpenses: number
  recentActivity: ActivityLog[]
  attendanceRate: number
  pendingPayments: number
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      students: {
        Row: Student
        Insert: Omit<Student, 'id' | 'created_at'>
        Update: Partial<Omit<Student, 'id' | 'created_at'>>
      }
      teachers: {
        Row: Teacher
        Insert: Omit<Teacher, 'id' | 'created_at'>
        Update: Partial<Omit<Teacher, 'id' | 'created_at'>>
      }
      parents: {
        Row: Parent
        Insert: Omit<Parent, 'id' | 'created_at'>
        Update: Partial<Omit<Parent, 'id' | 'created_at'>>
      }
      subjects: {
        Row: Subject
        Insert: Omit<Subject, 'id' | 'created_at'>
        Update: Partial<Omit<Subject, 'id' | 'created_at'>>
      }
      class_schedules: {
        Row: ClassSchedule
        Insert: Omit<ClassSchedule, 'id' | 'created_at'>
        Update: Partial<Omit<ClassSchedule, 'id' | 'created_at'>>
      }
      attendance: {
        Row: Attendance
        Insert: Omit<Attendance, 'id' | 'created_at'>
        Update: Partial<Omit<Attendance, 'id' | 'created_at'>>
      }
      assignments: {
        Row: Assignment
        Insert: Omit<Assignment, 'id' | 'created_at'>
        Update: Partial<Omit<Assignment, 'id' | 'created_at'>>
      }
      submissions: {
        Row: Submission
        Insert: Omit<Submission, 'id'>
        Update: Partial<Omit<Submission, 'id'>>
      }
      grades: {
        Row: Grade
        Insert: Omit<Grade, 'id' | 'created_at'>
        Update: Partial<Omit<Grade, 'id' | 'created_at'>>
      }
      payments: {
        Row: Payment
        Insert: Omit<Payment, 'id' | 'created_at'>
        Update: Partial<Omit<Payment, 'id' | 'created_at'>>
      }
      expenses: {
        Row: Expense
        Insert: Omit<Expense, 'id' | 'created_at'>
        Update: Partial<Omit<Expense, 'id' | 'created_at'>>
      }
      inventory: {
        Row: InventoryItem
        Insert: Omit<InventoryItem, 'id' | 'created_at'>
        Update: Partial<Omit<InventoryItem, 'id' | 'created_at'>>
      }
      activity_logs: {
        Row: ActivityLog
        Insert: Omit<ActivityLog, 'id' | 'created_at'>
        Update: never
      }
    }
  }
}
