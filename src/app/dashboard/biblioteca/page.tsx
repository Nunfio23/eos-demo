'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { usePermissions } from '@/lib/permissions'
import toast from 'react-hot-toast'
import {
  BookOpen, Plus, X, Search, RefreshCw, BookMarked,
  CheckCircle, AlertCircle, Edit2, Trash2, ArrowLeftRight
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

interface Book {
  id: string
  title: string
  author: string
  isbn: string | null
  category: string | null
  publisher: string | null
  publication_year: number | null
  total_copies: number
  available_copies: number
  location: string | null
  description: string | null
  is_active: boolean
}

interface BookLoan {
  id: string
  book_id: string
  student_id: string
  loan_date: string
  due_date: string
  return_date: string | null
  status: 'active' | 'returned' | 'overdue' | 'lost'
  fine_amount: number
  notes: string | null
  book?: { title: string; author: string }
  student?: { enrollment_number: string; profile?: { full_name: string } | null }
}

const emptyBook = {
  title: '', author: '', isbn: '', category: '', publisher: '',
  publication_year: '', total_copies: '1', location: '', description: '',
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-blue-100 text-blue-700',
  returned: 'bg-emerald-100 text-emerald-700',
  overdue:  'bg-red-100 text-red-700',
  lost:     'bg-slate-100 text-slate-500',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo', returned: 'Devuelto', overdue: 'Vencido', lost: 'Perdido',
}

export default function BibliotecaPage() {
  const { profile } = useAuth()
  const perms = usePermissions()

  const [tab, setTab]     = useState<'catalogo' | 'prestamos'>('catalogo')
  const [books, setBooks] = useState<Book[]>([])
  const [loans, setLoans] = useState<BookLoan[]>([])
  const [students, setStudents] = useState<{ id: string; enrollment_number: string; profile?: { full_name: string } | null }[]>([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showBookModal, setShowBookModal]  = useState(false)
  const [showLoanModal, setShowLoanModal]  = useState(false)
  const [editBook, setEditBook] = useState<Book | null>(null)
  const [bookForm, setBookForm] = useState(emptyBook)
  const [loanForm, setLoanForm] = useState({ book_id: '', student_id: '', due_date: '', notes: '' })
  const [saving, setSaving]     = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const canManage = perms.canCreate('biblioteca')
  const isAlumno  = perms.isAlumno
  const isPadre   = perms.role === 'padre'

  const loadBooks = useCallback(async () => {
    setLoading(true)
    const { data } = await db
      .from('books').select('*').eq('is_active', true).order('title')
    setBooks(data ?? [])
    setLoading(false)
  }, [])

  const loadLoans = useCallback(async () => {
    setLoading(true)
    let q = db
      .from('book_loans')
      .select(`
        *, book:books(title, author),
        student:students(enrollment_number, profile:profiles(full_name))
      `)
      .order('created_at', { ascending: false })

    // Students only see their loans; parents see their children's loans (handled by RLS)
    const { data } = await q
    setLoans((data ?? []) as BookLoan[])
    setLoading(false)
  }, [])

  const loadStudents = useCallback(async () => {
    if (!canManage) return
    const { data } = await supabase
      .from('students')
      .select('id, enrollment_number, profile:profiles(full_name)')
      .eq('is_active', true)
      .order('enrollment_number')
    setStudents((data ?? []) as typeof students)
  }, [canManage])

  useEffect(() => {
    if (tab === 'catalogo') loadBooks()
    else loadLoans()
  }, [tab, loadBooks, loadLoans])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadStudents().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadStudents])

  const openNewBook = () => {
    setEditBook(null)
    setBookForm(emptyBook)
    setShowBookModal(true)
  }

  const openEditBook = (b: Book) => {
    setEditBook(b)
    setBookForm({
      title: b.title, author: b.author, isbn: b.isbn ?? '',
      category: b.category ?? '', publisher: b.publisher ?? '',
      publication_year: b.publication_year ? String(b.publication_year) : '',
      total_copies: String(b.total_copies), location: b.location ?? '',
      description: b.description ?? '',
    })
    setShowBookModal(true)
  }

  const handleSaveBook = async () => {
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      toast.error('Título y autor son obligatorios')
      return
    }
    setSaving(true)
    const payload = {
      title:            bookForm.title.trim(),
      author:           bookForm.author.trim(),
      isbn:             bookForm.isbn || null,
      category:         bookForm.category || null,
      publisher:        bookForm.publisher || null,
      publication_year: bookForm.publication_year ? parseInt(bookForm.publication_year) : null,
      total_copies:     parseInt(bookForm.total_copies) || 1,
      available_copies: parseInt(bookForm.total_copies) || 1,
      location:         bookForm.location || null,
      description:      bookForm.description || null,
    }
    let error
    if (!editBook) {
      ({ error } = await db.from('books').insert(payload))
    } else {
      // Keep available_copies proportional
      const diff = payload.total_copies - editBook.total_copies
      const newAvailable = Math.max(0, editBook.available_copies + diff)
      ;({ error } = await db.from('books')
        .update({ ...payload, available_copies: newAvailable }).eq('id', editBook.id))
    }
    setSaving(false)
    if (error) { toast.error(error.message || 'Error al guardar libro'); return }
    toast.success(!editBook ? 'Libro registrado' : 'Libro actualizado')
    setShowBookModal(false)
    loadBooks()
  }

  const handleDeleteBook = async (id: string) => {
    if (!confirm('¿Eliminar este libro del catálogo?')) return
    const { error } = await db.from('books').update({ is_active: false }).eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Libro eliminado del catálogo')
    loadBooks()
  }

  const handleLoan = async () => {
    if (!loanForm.book_id || !loanForm.student_id || !loanForm.due_date) {
      toast.error('Selecciona libro, estudiante y fecha de devolución')
      return
    }
    setSaving(true)
    const { error } = await db.from('book_loans').insert({
      book_id:    loanForm.book_id,
      student_id: loanForm.student_id,
      loaned_by:  profile!.id,
      due_date:   loanForm.due_date,
      notes:      loanForm.notes || null,
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Error al registrar préstamo'); return }
    toast.success('Préstamo registrado')
    setShowLoanModal(false)
    setLoanForm({ book_id: '', student_id: '', due_date: '', notes: '' })
    loadBooks()
    loadLoans()
  }

  const handleReturn = async (loan: BookLoan) => {
    if (!confirm('¿Marcar este libro como devuelto?')) return
    const { error } = await db.from('book_loans')
      .update({ status: 'returned', return_date: new Date().toISOString().split('T')[0] })
      .eq('id', loan.id)
    if (error) { toast.error('Error al registrar devolución'); return }
    toast.success('Devolución registrada')
    loadLoans()
    loadBooks()
  }

  const filtered = books.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.author.toLowerCase().includes(search.toLowerCase()) ||
    (b.isbn ?? '').includes(search) ||
    (b.category ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeLoans  = loans.filter(l => l.status === 'active' || l.status === 'overdue')
  const pastLoans    = loans.filter(l => l.status === 'returned' || l.status === 'lost')

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="page-title">Biblioteca</h1>
            <p className="page-subtitle">Catálogo y préstamos de libros</p>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowLoanModal(true)} className="btn-secondary">
              <ArrowLeftRight className="w-4 h-4" /> Nuevo Préstamo
            </button>
            <button onClick={openNewBook} className="btn-primary">
              <Plus className="w-4 h-4" /> Agregar Libro
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit">
        {(['catalogo', 'prestamos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium transition-colors capitalize
              ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {t === 'catalogo' ? 'Catálogo' : 'Préstamos'}
          </button>
        ))}
      </div>

      {/* CATALOG TAB */}
      {tab === 'catalogo' && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="input pl-9" placeholder="Buscar por título, autor, ISBN..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={loadBooks} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="card p-12 text-center text-slate-400 text-sm">Cargando catálogo...</div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No se encontraron libros</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(book => (
                <div key={book.id} className="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <BookMarked className="w-5 h-5 text-amber-500" />
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => openEditBook(book)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteBook(book.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900 leading-snug">{book.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{book.author}</p>
                    {book.category && (
                      <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        {book.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
                    <div className={`flex items-center gap-1.5 text-xs font-medium
                      ${book.available_copies > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {book.available_copies > 0
                        ? <><CheckCircle className="w-3.5 h-3.5" /> {book.available_copies} disponible{book.available_copies !== 1 ? 's' : ''}</>
                        : <><AlertCircle className="w-3.5 h-3.5" /> Sin ejemplares</>
                      }
                    </div>
                    <span className="text-xs text-slate-400">{book.total_copies} total</span>
                  </div>
                  {book.location && (
                    <p className="text-[11px] text-slate-400">📍 {book.location}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* LOANS TAB */}
      {tab === 'prestamos' && (
        <div className="space-y-4">
          {/* Active loans */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-800">
                Préstamos Activos ({activeLoans.length})
              </h3>
            </div>
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Cargando...</div>
            ) : activeLoans.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">No hay préstamos activos</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {activeLoans.map(loan => {
                  const isOverdue = new Date(loan.due_date) < new Date() && loan.status === 'active'
                  return (
                    <div key={loan.id} className="flex items-center justify-between px-5 py-4">
                      <div>
                        <p className="font-medium text-sm text-slate-900">{loan.book?.title}</p>
                        <p className="text-xs text-slate-500">{loan.book?.author}</p>
                        {loan.student && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {loan.student.profile?.full_name} · #{loan.student.enrollment_number}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full
                            ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {isOverdue ? 'Vencido' : 'Activo'}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">
                            Dev: {new Date(loan.due_date + 'T12:00:00').toLocaleDateString('es-CR')}
                          </p>
                        </div>
                        {canManage && (
                          <button onClick={() => handleReturn(loan)}
                            className="btn-secondary text-xs py-1.5 px-3">
                            <CheckCircle className="w-3.5 h-3.5" /> Devolver
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Past loans */}
          {pastLoans.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-sm text-slate-800">
                  Historial ({pastLoans.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {pastLoans.slice(0, 20).map(loan => (
                  <div key={loan.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="font-medium text-sm text-slate-700">{loan.book?.title}</p>
                      {loan.student && (
                        <p className="text-xs text-slate-400">{loan.student.profile?.full_name}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[loan.status]}`}>
                      {STATUS_LABELS[loan.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOOK MODAL */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-900">{!editBook ? 'Agregar Libro' : 'Editar Libro'}</h2>
              <button onClick={() => setShowBookModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="label">Título *</label>
                  <input className="input" value={bookForm.title}
                    onChange={e => setBookForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Autor *</label>
                  <input className="input" value={bookForm.author}
                    onChange={e => setBookForm(p => ({ ...p, author: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ISBN</label>
                  <input className="input" value={bookForm.isbn}
                    onChange={e => setBookForm(p => ({ ...p, isbn: e.target.value }))} placeholder="978-..." />
                </div>
                <div>
                  <label className="label">Categoría</label>
                  <input className="input" value={bookForm.category}
                    onChange={e => setBookForm(p => ({ ...p, category: e.target.value }))} placeholder="Ej: Matemáticas" />
                </div>
                <div>
                  <label className="label">Editorial</label>
                  <input className="input" value={bookForm.publisher}
                    onChange={e => setBookForm(p => ({ ...p, publisher: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Año publicación</label>
                  <input type="number" className="input" value={bookForm.publication_year}
                    onChange={e => setBookForm(p => ({ ...p, publication_year: e.target.value }))}
                    placeholder="2024" min="1900" max="2099" />
                </div>
                <div>
                  <label className="label">Ejemplares totales</label>
                  <input type="number" className="input" value={bookForm.total_copies} min="1"
                    onChange={e => setBookForm(p => ({ ...p, total_copies: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Ubicación física</label>
                  <input className="input" value={bookForm.location}
                    onChange={e => setBookForm(p => ({ ...p, location: e.target.value }))}
                    placeholder="Ej: Estante A-3" />
                </div>
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input resize-none min-h-[70px]" value={bookForm.description}
                  onChange={e => setBookForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowBookModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveBook} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : !editBook ? 'Registrar Libro' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAN MODAL */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Registrar Préstamo</h2>
              <button onClick={() => setShowLoanModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Libro *</label>
                <select className="input" value={loanForm.book_id}
                  onChange={e => setLoanForm(p => ({ ...p, book_id: e.target.value }))}>
                  <option value="">Seleccionar libro...</option>
                  {books.filter(b => b.available_copies > 0).map(b => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.available_copies} disp.)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Estudiante *</label>
                <select className="input" value={loanForm.student_id}
                  onChange={e => setLoanForm(p => ({ ...p, student_id: e.target.value }))}>
                  <option value="">Seleccionar estudiante...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.profile?.full_name} — #{s.enrollment_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Fecha de devolución *</label>
                <input type="date" className="input" value={loanForm.due_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setLoanForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea className="input resize-none" rows={2} value={loanForm.notes}
                  onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Condición del libro, observaciones..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowLoanModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleLoan} disabled={saving} className="btn-primary">
                {saving ? 'Registrando...' : 'Registrar Préstamo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
