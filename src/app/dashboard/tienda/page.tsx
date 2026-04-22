'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  ShoppingBag, Plus, X, ShoppingCart, Trash2, Edit2,
  Package, RefreshCw, Tag, BarChart3, Boxes,
  CheckCircle2, Clock, AlertTriangle,
  Minus, Save, Search
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

interface Category {
  id: string
  name: string
  icon: string | null
  is_active: boolean
  sort_order: number
}

interface Product {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  stock: number
  min_stock: number
  image_url: string | null
  is_available: boolean
  updated_at: string
  category?: { name: string; icon: string | null }
}

interface CartItem { product: Product; qty: number }

interface Order {
  id: string
  student_id: string | null
  ordered_by: string
  status: 'draft' | 'placed' | 'paid' | 'delivered' | 'cancelled'
  total: number
  notes: string | null
  created_at: string
  delivered_at: string | null
  stock_synced: boolean
  items?: { id: string; quantity: number; unit_price: number; subtotal: number; product?: { name: string } }[]
}

interface ChildOption {
  student_id: string
  name: string
  enrollment: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  draft:     { label: 'Borrador',   color: 'bg-slate-100 text-slate-600',   icon: Clock },
  placed:    { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700',   icon: Clock },
  paid:      { label: 'Pagado',     color: 'bg-blue-100 text-blue-700',     icon: CheckCircle2 },
  delivered: { label: 'Entregado',  color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado',  color: 'bg-red-100 text-red-700',      icon: X },
}

// Category emoji map for chalet categories
const CATEGORY_EMOJI: Record<string, string> = {
  bebidas:   '🥤',
  alimentos: '🍔',
  comida:    '🍔',
  'utensilios': '🍴',
  'utensilios de cocina': '🍴',
  postres:   '🍰',
  snacks:    '🍿',
  default:   '📦',
}

function getCategoryEmoji(name: string, icon?: string | null): string {
  if (icon && !icon.startsWith('icon')) return icon
  const lower = name.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lower.includes(key)) return emoji
  }
  return CATEGORY_EMOJI.default
}

type Tab = 'catalogo' | 'ventas' | 'inventario' | 'pedidos'
type PedidoSubTab = 'activos' | 'historial'

function PaginationBar({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-slate-100">
      <button disabled={page === 1} onClick={() => onPage(page - 1)}
        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
        ← Anterior
      </button>
      <span className="text-xs text-slate-500">{page} / {totalPages}</span>
      <button disabled={page === totalPages} onClick={() => onPage(page + 1)}
        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
        Siguiente →
      </button>
    </div>
  )
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const times = [0, 0.15, 0.3]
    times.forEach(t => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = t === 0 ? 880 : t === 0.15 ? 1100 : 880
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.12)
    })
  } catch { /* browser bloqueó audio */ }
}

export default function TiendaPage() {
  const { profile } = useAuth()
  // tienda, master, administracion pueden operar (pedidos, ventas, inventario)
  const canOperate = ['master', 'administracion', 'tienda', 'contabilidad'].includes(profile?.role ?? '')
  // Solo master y administracion pueden gestionar precios y crear categorías
  const canManage  = ['master', 'administracion'].includes(profile?.role ?? '')
  // Alumno solo puede ver el catálogo y sus pedidos, no puede agregar al carrito
  const isAlumno   = profile?.role === 'alumno'
  const canBuy     = !isAlumno

  const [tab, setTab] = useState<Tab>('catalogo')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts]     = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [orders, setOrders]         = useState<Order[]>([])
  const [cart, setCart]             = useState<CartItem[]>([])
  const [saleCart, setSaleCart]     = useState<CartItem[]>([])
  const [selCategory, setSelCategory] = useState<string>('all')
  const [loading, setLoading]       = useState(true)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showCartModal, setShowCartModal]       = useState(false)
  const [editProduct, setEditProduct]           = useState<Product | null>(null)
  const [editCategory, setEditCategory]         = useState<Category | null>(null)
  const [productForm, setProductForm] = useState({
    name: '', description: '', price: '', stock: '', min_stock: '2',
    category_id: '', is_available: true,
  })
  const [categoryForm, setCategoryForm] = useState({
    name: '', icon: '', sort_order: '0',
  })
  const [orderNotes, setOrderNotes] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({})
  const [savingStock, setSavingStock] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pedidoSubTab, setPedidoSubTab] = useState<PedidoSubTab>('activos')
  const [studentNamesMap, setStudentNamesMap] = useState<Record<string, string>>({})
  // Paginación
  const [catalogPage, setCatalogPage]       = useState(1)
  const [inventarioPage, setInventarioPage] = useState(1)
  const [pedidosPage, setPedidosPage]       = useState(1)
  const PAGE_SIZE = 10
  // Flujo padre→hijo
  const [myChildren, setMyChildren] = useState<ChildOption[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: cats }, { data: prods }, { data: allProds }] = await Promise.all([
      supabase.from('store_categories').select('*').order('sort_order'),
      supabase.from('store_products')
        .select('*, category:store_categories(name, icon)')
        .eq('is_available', true)
        .order('name'),
      supabase.from('store_products')
        .select('*, category:store_categories(name, icon)')
        .order('name'),
    ])
    setCategories((cats ?? []) as Category[])
    setProducts((prods ?? []) as Product[])
    setAllProducts((allProds ?? []) as Product[])
    setLoading(false)
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const baseQuery = supabase
      .from('store_orders')
      .select(`*, items:store_order_items(id, quantity, unit_price, subtotal, product:store_products(name))`)
      .order('created_at', { ascending: false })

    const { data, error } = canOperate
      ? await baseQuery
      : profile?.role === 'alumno'
        ? await baseQuery
        : await baseQuery.eq('ordered_by', profile?.id ?? '')

    if (error) {
      console.error('[loadOrders]', error)
      toast.error('Error al cargar pedidos')
    }
    const rows = (data ?? []) as Order[]
    setOrders(rows)

    // Cargar nombres de estudiantes para mostrar en pedidos
    const studentIds = Array.from(new Set(rows.map(o => o.student_id).filter((id): id is string => !!id)))
    if (studentIds.length > 0) {
      const { data: studs } = await supabase
        .from('students')
        .select('id, enrollment_number, user_id')
        .in('id', studentIds)
      const studRows = (studs ?? []) as { id: string; enrollment_number: string; user_id: string }[]
      if (studRows.length > 0) {
        const userIds = studRows.map(s => s.user_id).filter(Boolean)
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
        const profMap = Object.fromEntries((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
        const nameMap: Record<string, string> = {}
        studRows.forEach(s => { nameMap[s.id] = profMap[s.user_id] ?? `Matrícula ${s.enrollment_number}` })
        setStudentNamesMap(nameMap)
      }
    }
    setLoading(false)
  }, [canOperate, profile?.id, profile?.role])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadData().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadData])

  // Cargar hijos vinculados cuando el usuario es padre
  useEffect(() => {
    if (profile?.role !== 'padre' || !profile?.id) return
    const loadChildren = async () => {
      // 1. Obtener student_ids del padre
      const { data: spRows } = await supabase
        .from('student_parents')
        .select('student_id')
        .eq('parent_id', profile.id)
      if (!spRows || spRows.length === 0) return
      const ids = spRows.map(r => r.student_id)
      // 2. Obtener datos del estudiante (nombre + matrícula)
      const { data: students } = await supabase
        .from('students')
        .select('id, enrollment_number, user_id')
        .in('id', ids)
        .eq('is_active', true)
      if (!students) return
      const userIds = students.map(s => s.user_id).filter(Boolean)
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
      const nameMap = Object.fromEntries((profileRows ?? []).map(p => [p.id, p.full_name]))
      setMyChildren(students.map(s => ({
        student_id: s.id,
        name: nameMap[s.user_id] ?? `Matrícula ${s.enrollment_number}`,
        enrollment: s.enrollment_number,
      })))
    }
    loadChildren()
  }, [profile?.role, profile?.id])
  useEffect(() => { if (tab === 'pedidos') loadOrders() }, [tab, loadOrders])
  useEffect(() => { setSearchQuery(''); setCatalogPage(1); setInventarioPage(1); setPedidosPage(1) }, [tab])
  useEffect(() => { setCatalogPage(1) }, [searchQuery, selCategory])

  // Abrir tab correcto al entrar (desde notificación o por rol tienda)
  useEffect(() => {
    const stored = localStorage.getItem('tienda_open_tab') as Tab | null
    if (stored) { setTab(stored); localStorage.removeItem('tienda_open_tab') }
    else if (profile?.role === 'tienda') setTab('pedidos')
  }, [profile?.role])

  // Escuchar evento de notificación (cuando ya estamos en la página de tienda)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as Tab
      setTab(tab)
    }
    window.addEventListener('tienda:open-tab', handler)
    return () => window.removeEventListener('tienda:open-tab', handler)
  }, [])

  // Notificaciones en tiempo real para admin/master
  useEffect(() => {
    if (!['master', 'administracion'].includes(profile?.role ?? '')) return
    const channel = supabase
      .channel('store-orders-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'store_orders' }, () => {
        playNotificationSound()
        toast('🛒 ¡Nuevo pedido recibido!', {
          duration: 12000,
          style: {
            background: '#1e40af',
            color: '#fff',
            fontWeight: '600',
            fontSize: '15px',
            padding: '14px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(30,64,175,0.35)',
          },
          iconTheme: { primary: '#fff', secondary: '#1e40af' },
        })
        if (tab === 'pedidos') loadOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.role, tab, loadOrders])

  // ─── Catálogo / Carrito ───────────────────────────────────────────────────────
  const filteredProducts = products.filter(p =>
    (selCategory === 'all' || p.category_id === selCategory) &&
    (!searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const filteredAllProducts = allProducts.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const addToCart = (product: Product, targetCart: 'buy' | 'sale' = 'buy') => {
    const setter = targetCart === 'buy' ? setCart : setSaleCart
    setter(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock) { toast.error('Sin stock disponible'); return prev }
        return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const removeFromCart = (id: string, targetCart: 'buy' | 'sale' = 'buy') => {
    const setter = targetCart === 'buy' ? setCart : setSaleCart
    setter(prev => prev.filter(i => i.product.id !== id))
  }

  const updateQty = (id: string, qty: number, targetCart: 'buy' | 'sale' = 'buy') => {
    if (qty < 1) { removeFromCart(id, targetCart); return }
    const setter = targetCart === 'buy' ? setCart : setSaleCart
    setter(prev => prev.map(i => i.product.id === id ? { ...i, qty } : i))
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.qty, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)
  const saleTotal = saleCart.reduce((sum, i) => sum + i.product.price * i.qty, 0)

  // ─── Confirmar pedido de catálogo ────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !profile) return
    // Padre debe seleccionar un hijo
    if (profile.role === 'padre' && !selectedStudentId) {
      toast.error('Selecciona para qué hijo es el pedido')
      return
    }
    setSaving(true)
    const orderPayload: Record<string, unknown> = {
      ordered_by: profile.id,
      status: 'draft',
      total: cartTotal,
      notes: orderNotes || null,
    }
    // Asignar el alumno si es padre o si hay un alumno seleccionado
    if (selectedStudentId) orderPayload.student_id = selectedStudentId

    // 1. Crear pedido como 'draft' (RLS de store_order_items requiere status='draft' para insertar)
    const { data: order, error: oErr } = await supabase
      .from('store_orders')
      .insert(orderPayload)
      .select('id').single()
    if (oErr || !order) { toast.error('Error al crear pedido'); setSaving(false); return }
    // 2. Insertar los ítems
    const { error: iErr } = await supabase.from('store_order_items').insert(
      cart.map(i => ({ order_id: order.id, product_id: i.product.id, quantity: i.qty, unit_price: i.product.price, subtotal: i.product.price * i.qty }))
    )
    if (iErr) { toast.error('Error al agregar productos'); setSaving(false); return }
    // 3. Actualizar estado a 'placed' (E34 fix: so_update ahora tiene WITH CHECK correcto)
    const { error: uErr } = await supabase.from('store_orders').update({ status: 'placed' }).eq('id', order.id)
    if (uErr) { toast.error('Error al confirmar pedido'); setSaving(false); return }
    setSaving(false)
    toast.success('¡Pedido realizado!')
    setCart([])
    setOrderNotes('')
    setSelectedStudentId('')
    setShowCartModal(false)
    loadData()
    // Ir automáticamente al tab de pedidos para que el padre vea su pedido
    setTab('pedidos')
    loadOrders()
  }

  // ─── Agregar pedido entregado a ventas del día (descuenta stock) ────────────
  const handleAddToSales = async (orderId: string) => {
    setSaving(true)
    // 1. Obtener los ítems del pedido con sus product_ids y cantidades
    const { data: orderItems } = await supabase
      .from('store_order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId)
    if (!orderItems || orderItems.length === 0) { toast.error('Sin ítems'); setSaving(false); return }
    // 2. Obtener stock actual de esos productos
    const prodIds = orderItems.map(i => i.product_id)
    const { data: prods } = await supabase.from('store_products').select('id, stock').in('id', prodIds)
    if (prods) {
      await Promise.all(orderItems.map(item => {
        const prod = prods.find(p => p.id === item.product_id)
        if (!prod) return Promise.resolve()
        return supabase.from('store_products').update({ stock: Math.max(0, prod.stock - item.quantity) }).eq('id', item.product_id)
      }))
    }
    // 3. Marcar como stock_synced
    const { error } = await supabase.from('store_orders').update({ stock_synced: true }).eq('id', orderId)
    setSaving(false)
    if (error) { toast.error('Error al registrar'); return }
    toast.success('Agregado a ventas del día — stock actualizado')
    loadOrders()
    loadData()
  }

  // ─── Registrar venta del día ─────────────────────────────────────────────────
  const handleRegisterSale = async () => {
    if (saleCart.length === 0 || !profile) return
    setSaving(true)
    const { data: order, error: oErr } = await supabase
      .from('store_orders')
      .insert({ ordered_by: profile.id, status: 'delivered', total: saleTotal, notes: saleNotes || null })
      .select('id').single()
    if (oErr || !order) { toast.error('Error al registrar venta'); setSaving(false); return }
    const { error: iErr } = await supabase.from('store_order_items').insert(
      saleCart.map(i => ({ order_id: order.id, product_id: i.product.id, quantity: i.qty, unit_price: i.product.price, subtotal: i.product.price * i.qty }))
    )
    if (iErr) { toast.error('Error al registrar ítems'); setSaving(false); return }
    // Update stock
    await Promise.all(saleCart.map(i =>
      supabase.from('store_products').update({ stock: Math.max(0, i.product.stock - i.qty) }).eq('id', i.product.id)
    ))
    setSaving(false)
    toast.success(`Venta registrada — $${saleTotal.toFixed(2)}`)
    setSaleCart([])
    setSaleNotes('')
    loadData()
  }

  // ─── Estado de pedidos ───────────────────────────────────────────────────────
  const handleStatusChange = async (orderId: string, status: Order['status']) => {
    const update: Record<string, unknown> = { status }
    if (status === 'delivered') update.delivered_at = new Date().toISOString()
    const { error } = await supabase.from('store_orders').update(update).eq('id', orderId)
    if (error) { toast.error('Error al actualizar'); return }
    toast.success('Estado actualizado')
    loadOrders()
  }

  // ─── Guardar producto ─────────────────────────────────────────────────────────
  const openNewProduct = () => {
    setEditProduct(null)
    setProductForm({ name: '', description: '', price: '', stock: '', min_stock: '2', category_id: '', is_available: true })
    setShowProductModal(true)
  }
  const openEditProduct = (p: Product) => {
    setEditProduct(p)
    setProductForm({ name: p.name, description: p.description ?? '', price: String(p.price), stock: String(p.stock), min_stock: String(p.min_stock), category_id: p.category_id ?? '', is_available: p.is_available })
    setShowProductModal(true)
  }
  const handleSaveProduct = async () => {
    if (!productForm.name.trim() || !productForm.price) { toast.error('Nombre y precio son obligatorios'); return }
    setSaving(true)
    const payload = {
      name: productForm.name.trim(), description: productForm.description || null,
      price: parseFloat(productForm.price), stock: parseInt(productForm.stock) || 0,
      min_stock: parseInt(productForm.min_stock) || 2,
      category_id: productForm.category_id || null, is_available: productForm.is_available,
    }
    const { error } = editProduct
      ? await supabase.from('store_products').update(payload).eq('id', editProduct.id)
      : await supabase.from('store_products').insert(payload)
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success(editProduct ? 'Producto actualizado' : 'Producto agregado')
    setShowProductModal(false)
    loadData()
  }

  // ─── Ajustar stock en inventario ─────────────────────────────────────────────
  const saveStock = async (productId: string) => {
    const val = parseInt(stockEdits[productId] ?? '')
    if (isNaN(val) || val < 0) { toast.error('Cantidad inválida'); return }
    setSavingStock(productId)
    const { error } = await supabase.from('store_products').update({ stock: val }).eq('id', productId)
    setSavingStock(null)
    if (error) { toast.error('Error al actualizar stock'); return }
    toast.success('Stock actualizado')
    setStockEdits(e => { const n = { ...e }; delete n[productId]; return n })
    loadData()
  }

  // ─── Eliminar producto (solo master) ──────────────────────────────────────────
  const deleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar "${productName}"? Esta acción no se puede deshacer.`)) return
    setSavingStock(productId)
    const { error } = await supabase.from('store_products').delete().eq('id', productId)
    setSavingStock(null)
    if (error) { toast.error('Error al eliminar producto'); return }
    toast.success('Producto eliminado')
    loadData()
  }

  // ─── Crear/Editar categoría ───────────────────────────────────────────────────
  const openNewCategory = () => {
    setEditCategory(null)
    setCategoryForm({ name: '', icon: '', sort_order: '0' })
    setShowCategoryModal(true)
  }
  const openEditCategory = (c: Category) => {
    setEditCategory(c)
    setCategoryForm({ name: c.name, icon: c.icon ?? '', sort_order: String(c.sort_order ?? 0) })
    setShowCategoryModal(true)
  }
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { toast.error('El nombre de la categoría es obligatorio'); return }
    setSaving(true)
    const payload = {
      name: categoryForm.name.trim(),
      icon: categoryForm.icon || null,
      sort_order: parseInt(categoryForm.sort_order) || 0,
      is_active: true,
    }
    const { error } = editCategory
      ? await supabase.from('store_categories').update(payload).eq('id', editCategory.id)
      : await supabase.from('store_categories').insert(payload)
    setSaving(false)
    if (error) { toast.error('Error al guardar categoría'); return }
    toast.success(editCategory ? 'Categoría actualizada' : 'Categoría creada')
    setShowCategoryModal(false)
    loadData()
  }

  // ─── Eliminar categoría (solo master) ──────────────────────────────────────────
  const deleteCategory = async (categoryId: string, categoryName: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la categoría "${categoryName}"? Los productos sin categoría asignada no se verán afectados.`)) return
    setSaving(true)
    const { error } = await supabase.from('store_categories').delete().eq('id', categoryId)
    setSaving(false)
    if (error) { toast.error('Error al eliminar categoría'); return }
    toast.success('Categoría eliminada')
    loadData()
  }

  const TABS: { key: Tab; label: string; icon: typeof ShoppingBag; onlyOperate?: boolean }[] = [
    { key: 'catalogo',   label: 'Catálogo',      icon: ShoppingBag },
    { key: 'ventas',     label: 'Ventas del Día', icon: BarChart3,  onlyOperate: true },
    { key: 'inventario', label: 'Inventario',     icon: Boxes,       onlyOperate: true },
    { key: 'pedidos',    label: 'Pedidos',        icon: ShoppingCart },
  ]

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl">🥤</div>
          <div>
            <h1 className="page-title">Tienda Chalet</h1>
            <p className="page-subtitle">Bebidas, alimentos y utensilios escolares</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && tab === 'catalogo' && canBuy && (
            <button onClick={() => setShowCartModal(true)} className="relative btn-secondary flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" /> Mi carrito
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            </button>
          )}
          {canManage && tab !== 'ventas' && (
            <button onClick={openNewProduct} className="btn-primary flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Producto
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.filter(t => !t.onlyOperate || canOperate).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CATÁLOGO ═══════════════════════════════════════════════════════════ */}
      {tab === 'catalogo' && (
        <>
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="input pl-9 w-full"
            />
          </div>

          {/* Category pills */}
          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelCategory('all')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selCategory === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                Todos
              </button>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelCategory(c.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5 ${
                    selCategory === c.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  <span>{getCategoryEmoji(c.name, c.icon)}</span> {c.name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="card p-12 text-center text-slate-400 text-sm">Cargando productos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="card p-16 text-center">
              <div className="text-4xl mb-3">🛒</div>
              <p className="text-slate-400 text-sm">No hay productos disponibles en esta categoría</p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.slice((catalogPage-1)*PAGE_SIZE, catalogPage*PAGE_SIZE).map(product => {
                const inCart = cart.find(i => i.product.id === product.id)
                const lowStock = product.stock > 0 && product.stock <= product.min_stock
                const emoji = getCategoryEmoji(product.category?.name ?? '', product.category?.icon)
                return (
                  <div key={product.id} className="card overflow-hidden flex flex-col group">
                    {/* Image / placeholder */}
                    <div className="h-32 bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center relative">
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        : <span className="text-5xl opacity-60">{emoji}</span>
                      }
                      {lowStock && (
                        <span className="absolute top-2 right-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Poco stock
                        </span>
                      )}
                      {canManage && (
                        <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => openEditProduct(product)}
                            className="p-1.5 bg-white/80 hover:bg-white rounded-lg shadow-sm"
                            title="Editar producto"
                          >
                            <Edit2 className="w-3 h-3 text-slate-500" />
                          </button>
                          {profile?.role === 'master' && (
                            <button
                              onClick={() => deleteProduct(product.id, product.name)}
                              className="p-1.5 bg-white/80 hover:bg-red-50 rounded-lg shadow-sm"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      {product.category && (
                        <span className="text-[11px] text-blue-500 font-medium flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" /> {product.category.name}
                        </span>
                      )}
                      <p className="font-semibold text-sm text-slate-900 leading-tight">{product.name}</p>
                      {product.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <span className="font-bold text-slate-900 text-base">
                          ${product.price.toFixed(2)}
                        </span>
                        <span className={`text-xs ${lowStock ? 'text-amber-500 font-medium' : 'text-slate-400'}`}>
                          {product.stock} uds
                        </span>
                      </div>
                      {canBuy ? (
                        product.stock > 0 ? (
                          inCart ? (
                            <div className="flex items-center gap-2 mt-1">
                              <button onClick={() => updateQty(inCart.product.id, inCart.qty - 1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="flex-1 text-center text-sm font-semibold">{inCart.qty}</span>
                              <button onClick={() => addToCart(product)}
                                className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => removeFromCart(inCart.product.id)}
                                className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(product)}
                              className="w-full py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-all mt-1"
                            >
                              Agregar al carrito
                            </button>
                          )
                        ) : (
                          <div className="w-full py-2 rounded-xl text-sm text-center text-slate-400 bg-slate-50 mt-1">
                            Sin stock
                          </div>
                        )
                      ) : (
                        <div className={`w-full py-2 rounded-xl text-sm text-center mt-1 ${product.stock > 0 ? 'text-slate-500 bg-slate-50' : 'text-slate-400 bg-slate-50'}`}>
                          {product.stock > 0 ? `${product.stock} disponibles` : 'Sin stock'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <PaginationBar page={catalogPage} total={filteredProducts.length} pageSize={PAGE_SIZE} onPage={setCatalogPage} />
            </>
          )}
        </>
      )}

      {/* ═══ VENTAS DEL DÍA ════════════════════════════════════════════════════ */}
      {tab === 'ventas' && canOperate && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product picker */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-slate-700">Seleccionar productos</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="input pl-9 w-48"
                />
              </div>
            </div>
            {loading ? (
              <div className="card p-8 text-center text-slate-400 text-sm">Cargando...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => {
                  const inSale = saleCart.find(i => i.product.id === p.id)
                  const emoji = getCategoryEmoji(p.category?.name ?? '', p.category?.icon)
                  return (
                    <button
                      key={p.id}
                      onClick={() => p.stock > 0 && addToCart(p, 'sale')}
                      disabled={p.stock === 0}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        inSale
                          ? 'border-blue-500 bg-blue-50'
                          : p.stock === 0
                            ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <span className="text-2xl block mb-1">{emoji}</span>
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">{p.name}</p>
                      <p className="text-xs font-bold text-blue-600 mt-0.5">${p.price.toFixed(2)}</p>
                      {inSale && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">×{inSale.qty}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sale summary */}
          <div className="card p-5 flex flex-col gap-4 h-fit sticky top-4">
            <p className="font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" /> Venta actual
            </p>
            {saleCart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                <p className="text-2xl mb-2">🛒</p>
                Haz clic en un producto para agregar
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {saleCart.map(item => (
                    <div key={item.product.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{item.product.name}</p>
                        <p className="text-[11px] text-slate-400">${item.product.price.toFixed(2)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(item.product.id, item.qty - 1, 'sale')}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                        <button onClick={() => updateQty(item.product.id, item.qty + 1, 'sale')}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-14 text-right">
                        ${(item.product.price * item.qty).toFixed(2)}
                      </span>
                      <button onClick={() => removeFromCart(item.product.id, 'sale')}
                        className="text-slate-300 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Total</span>
                    <span className="text-xl font-bold text-slate-900">${saleTotal.toFixed(2)}</span>
                  </div>
                  <textarea
                    value={saleNotes} onChange={e => setSaleNotes(e.target.value)}
                    placeholder="Notas (opcional)..." rows={2}
                    className="input resize-none text-xs"
                  />
                  <button
                    onClick={handleRegisterSale}
                    disabled={saving}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {saving
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <CheckCircle2 className="w-4 h-4" />
                    }
                    Registrar venta
                  </button>
                  <button onClick={() => setSaleCart([])} className="btn-secondary w-full text-sm">
                    Limpiar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ INVENTARIO ════════════════════════════════════════════════════════ */}
      {tab === 'inventario' && canOperate && (
        <div className="space-y-5">
          {/* Gestión de categorías */}
          {canManage && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Categorías ({categories.length})</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Gestiona las categorías de productos</p>
                </div>
                <button onClick={openNewCategory} className="btn-primary text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nueva Categoría
                </button>
              </div>
              {categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5">
                      <span className="text-sm">{getCategoryEmoji(c.name, c.icon)} {c.name}</span>
                      {profile?.role === 'master' && (
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => openEditCategory(c)}
                            className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteCategory(c.id, c.name)}
                            className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabla de productos */}
          <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-500" /> Stock de productos ({filteredAllProducts.length})
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="input pl-9 w-44 py-1.5 text-sm"
                />
              </div>
              <button onClick={loadData} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              {canManage && (
                <button onClick={openNewProduct} className="btn-primary text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nuevo
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Cargando inventario...</div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-semibold">
                  <th className="text-left px-5 py-3">Producto</th>
                  <th className="text-left px-4 py-3">Categoría</th>
                  <th className="text-right px-4 py-3">Precio</th>
                  <th className="text-center px-4 py-3">Stock</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  {canManage && <th className="px-4 py-3 sticky right-0 bg-slate-50 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredAllProducts.slice((inventarioPage-1)*PAGE_SIZE, inventarioPage*PAGE_SIZE).map(p => {
                  const lowStock = p.stock > 0 && p.stock <= p.min_stock
                  const outOfStock = p.stock === 0
                  const isEditing = productForm.stock !== undefined && stockEdits[p.id] !== undefined
                  const emoji = getCategoryEmoji(p.category?.name ?? '', p.category?.icon)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{emoji}</span>
                          <div>
                            <p className="font-medium text-slate-800">{p.name}</p>
                            {p.description && <p className="text-xs text-slate-400 line-clamp-1">{p.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {p.category?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        ${p.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-center">
                          {/* Stock input */}
                          <input
                            type="number"
                            value={stockEdits[p.id] ?? p.stock}
                            onChange={e => setStockEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-16 text-center px-2 py-1 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            min="0"
                          />
                          {stockEdits[p.id] !== undefined && (
                            <button
                              onClick={() => saveStock(p.id)}
                              disabled={savingStock === p.id}
                              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                              {savingStock === p.id
                                ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                : <Save className="w-3 h-3" />
                              }
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-center text-slate-400 mt-1">mín. {p.min_stock}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {outOfStock ? (
                          <span className="badge bg-red-50 text-red-600 text-xs">Sin stock</span>
                        ) : lowStock ? (
                          <span className="badge bg-amber-50 text-amber-600 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Bajo
                          </span>
                        ) : (
                          <span className="badge bg-emerald-50 text-emerald-600 text-xs">OK</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 flex items-center gap-2 sticky right-0 bg-white">
                          <button
                            onClick={() => openEditProduct(p)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar producto"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {profile?.role === 'master' && (
                            <button
                              onClick={() => deleteProduct(p.id, p.name)}
                              disabled={savingStock === p.id}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Eliminar producto"
                            >
                              {savingStock === p.id
                                ? <div className="w-3.5 h-3.5 border border-red-400/50 border-t-red-600 rounded-full animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            <PaginationBar page={inventarioPage} total={filteredAllProducts.length} pageSize={PAGE_SIZE} onPage={setInventarioPage} />
            </>
          )}
          </div>
        </div>
      )}

      {/* ═══ PEDIDOS ════════════════════════════════════════════════════════════ */}
      {tab === 'pedidos' && (() => {
        const today = new Date().toDateString()
        const activeOrders   = orders.filter(o => ['draft','placed','paid'].includes(o.status))
        const historialOrders = orders.filter(o =>
          profile?.role === 'tienda'
            ? o.status === 'delivered'
            : ['delivered','cancelled'].includes(o.status)
        )
        const currentOrders  = (canOperate && pedidoSubTab === 'historial') ? historialOrders : (canOperate ? activeOrders : orders)
        const pendienteDeAgregar = historialOrders.filter(o =>
          o.status === 'delivered' && !o.stock_synced && new Date(o.created_at).toDateString() !== today
        )
        const getStudentName = (sid: string | null) => {
          if (!sid) return null
          return studentNamesMap[sid] ?? myChildren.find(c => c.student_id === sid)?.name ?? `ID:${sid.slice(0,8)}`
        }
        return (
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-800">
                  {canOperate ? 'Todos los Pedidos' : 'Mis Pedidos'} ({canOperate ? (pedidoSubTab === 'activos' ? activeOrders.length : historialOrders.length) : orders.length})
                </h3>
                <button onClick={loadOrders} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              {/* Alerta: pedidos de días anteriores sin agregar a ventas */}
              {canManage && pendienteDeAgregar.length > 0 && (
                <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2"
                  onClick={() => setPedidoSubTab('historial')} style={{cursor:'pointer'}}>
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">
                    {pendienteDeAgregar.length} pedido{pendienteDeAgregar.length > 1 ? 's' : ''} entregado{pendienteDeAgregar.length > 1 ? 's' : ''} de días anteriores pendiente{pendienteDeAgregar.length > 1 ? 's' : ''} de agregar a ventas — <span className="underline">ver historial</span>
                  </p>
                </div>
              )}
              {/* Sub-tabs Activos / Historial (solo canOperate) */}
              {canOperate && (
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  <button onClick={() => setPedidoSubTab('activos')}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${pedidoSubTab === 'activos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Activos ({activeOrders.length})
                  </button>
                  <button onClick={() => setPedidoSubTab('historial')}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors relative ${pedidoSubTab === 'historial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Historial ({historialOrders.length})
                    {pendienteDeAgregar.length > 0 && pedidoSubTab !== 'historial' && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {pendienteDeAgregar.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Lista de pedidos */}
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Cargando pedidos...</div>
            ) : currentOrders.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-3xl mb-2">{pedidoSubTab === 'historial' ? '📦' : '📋'}</p>
                <p className="text-slate-400 text-sm">{pedidoSubTab === 'historial' ? 'Sin historial aún' : 'No hay pedidos activos'}</p>
              </div>
            ) : (
              <>
              <div className="divide-y divide-slate-50">
                {currentOrders.slice((pedidosPage-1)*PAGE_SIZE, pedidosPage*PAGE_SIZE).map(order => {
                  const cfg = STATUS_CONFIG[order.status]
                  const studentName = getStudentName(order.student_id)
                  const isOldPending = order.status === 'delivered' && !order.stock_synced && new Date(order.created_at).toDateString() !== today
                  return (
                    <div key={order.id} className={`px-5 py-4 flex items-start justify-between gap-4 ${isOldPending ? 'bg-amber-50/40' : ''}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                          {isOldPending && (
                            <span className="text-xs bg-amber-100 text-amber-600 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Pendiente ventas
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            🕐 {new Date(order.created_at).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {order.delivered_at && (
                            <span className="text-xs text-emerald-600">
                              ✅ {new Date(order.delivered_at).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium mt-0.5" style={{ color: studentName ? '#2563eb' : '#94a3b8' }}>
                          {studentName ? `👦 Para: ${studentName}` : '🏫 Pedido hecho por administración'}
                        </p>
                        {order.items && order.items.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {order.items.map(item => (
                              <p key={item.id} className="text-xs text-slate-500">
                                {item.quantity}× {item.product?.name} — <span className="font-mono">${item.subtotal.toFixed(2)}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {order.notes && <p className="text-xs text-slate-400 mt-1 italic">"{order.notes}"</p>}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900 text-base">${order.total.toFixed(2)}</p>
                        <div className="flex flex-col gap-1 mt-2">
                          {/* Admin/Master: marcar pagado */}
                          {canManage && order.status === 'placed' && (<>
                            <button onClick={() => handleStatusChange(order.id, 'paid')}
                              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                              Marcar Pagado
                            </button>
                            <button onClick={() => handleStatusChange(order.id, 'cancelled')}
                              className="text-xs px-3 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                              Cancelar
                            </button>
                          </>)}
                          {/* Tienda: marcar entregado cuando pagado */}
                          {profile?.role === 'tienda' && order.status === 'paid' && (
                            <button onClick={() => handleStatusChange(order.id, 'delivered')}
                              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                              Marcar Entregado
                            </button>
                          )}
                          {/* Admin/Master: agregar a ventas del día en historial */}
                          {canManage && order.status === 'delivered' && !order.stock_synced && (
                            <button onClick={() => handleAddToSales(order.id)} disabled={saving}
                              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50">
                              + Ventas del Día
                            </button>
                          )}
                          {canManage && order.status === 'delivered' && order.stock_synced && (
                            <span className="text-xs text-emerald-600 font-medium">✓ En ventas</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <PaginationBar page={pedidosPage} total={currentOrders.length} pageSize={PAGE_SIZE} onPage={setPedidosPage} />
              </>
            )}
          </div>
        )
      })()}

      {/* ═══ MODAL: Carrito de compra ════════════════════════════════════════════ */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Mi carrito ({cartCount} artículos)</h2>
              <button onClick={() => setShowCartModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Selector de hijo para padres */}
              {profile?.role === 'padre' && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <label className="block text-xs font-semibold text-blue-700 mb-2">
                    ¿Para qué hijo es este pedido? *
                  </label>
                  {myChildren.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">
                      No tienes hijos vinculados. Contacta a la administración.
                    </p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={e => setSelectedStudentId(e.target.value)}
                      className="input text-sm"
                    >
                      <option value="">— Selecciona un alumno —</option>
                      {myChildren.map(c => (
                        <option key={c.student_id} value={c.student_id}>
                          {c.name} ({c.enrollment})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Lista de productos */}
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-slate-900 truncate">{item.product.name}</p>
                      <p className="text-xs text-slate-400">${item.product.price.toFixed(2)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateQty(item.product.id, item.qty - 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.qty}</span>
                      <button onClick={() => updateQty(item.product.id, item.qty + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeFromCart(item.product.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="label">Notas</label>
                <textarea className="input resize-none" rows={2} value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)} placeholder="Talla, preferencia..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Total</span>
                <span className="font-bold text-lg text-slate-900">${cartTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={saving || (profile?.role === 'padre' && (!selectedStudentId || myChildren.length === 0))}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Enviando...' : 'Confirmar Pedido'}
              </button>
              {profile?.role === 'padre' && !selectedStudentId && myChildren.length > 0 && (
                <p className="text-xs text-center text-amber-600">Selecciona un alumno para continuar</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Producto ══════════════════════════════════════════════════════ */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{!editProduct ? 'Nuevo Producto' : 'Editar Producto'}</h2>
              <button onClick={() => setShowProductModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" value={productForm.name}
                  onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input resize-none" rows={2} value={productForm.description}
                  onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Precio ($) *</label>
                  <input type="number" className="input" value={productForm.price} min="0" step="0.25"
                    onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Stock</label>
                  <input type="number" className="input" value={productForm.stock} min="0"
                    onChange={e => setProductForm(p => ({ ...p, stock: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Mínimo</label>
                  <input type="number" className="input" value={productForm.min_stock} min="0"
                    onChange={e => setProductForm(p => ({ ...p, min_stock: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Categoría</label>
                <select className="input" value={productForm.category_id}
                  onChange={e => setProductForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{getCategoryEmoji(c.name, c.icon)} {c.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={productForm.is_available}
                  onChange={e => setProductForm(p => ({ ...p, is_available: e.target.checked }))} />
                <span className="text-sm text-slate-700">Disponible para venta</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowProductModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : editProduct ? 'Guardar cambios' : 'Agregar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Categoría ══════════════════════════════════════════════════════ */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{!editCategory ? 'Nueva Categoría' : 'Editar Categoría'}</h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input 
                  className="input" 
                  value={categoryForm.name}
                  placeholder="Ej: Bebidas, Alimentos, Postres..."
                  onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))} 
                />
              </div>
              <div>
                <label className="label">Icono (Emoji o URL)</label>
                <input 
                  className="input" 
                  value={categoryForm.icon}
                  placeholder="Ej: 🥤 o https://ejemplo.com/icono.png"
                  onChange={e => setCategoryForm(p => ({ ...p, icon: e.target.value }))} 
                />
              </div>
              <div>
                <label className="label">Orden de visualización</label>
                <input 
                  type="number" 
                  className="input" 
                  value={categoryForm.sort_order}
                  min="0"
                  onChange={e => setCategoryForm(p => ({ ...p, sort_order: e.target.value }))} 
                />
                <p className="text-xs text-slate-400 mt-1">Números bajos aparecen primero (0, 1, 2...)</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-2">
                <span className="text-2xl">{getCategoryEmoji(categoryForm.name, categoryForm.icon)}</span>
                <span className="text-sm text-slate-600">Vista previa: <strong>{categoryForm.name || 'Nombre aquí'}</strong></span>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowCategoryModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveCategory} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : editCategory ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
