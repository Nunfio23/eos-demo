'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import StatCard from '@/components/ui/StatCard'
import type { InventoryItem } from '@/types/database'
import toast from 'react-hot-toast'
import { Plus, Package, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState({
    name: '', category: '', quantity: '', min_quantity: '5',
    unit: 'unidades', location: '', supplier: '', unit_cost: '', notes: ''
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const lowStock = items.filter(i => i.quantity <= i.min_quantity)
  const totalValue = items.reduce((s, i) => s + (i.quantity * (i.unit_cost ?? 0)), 0)

  const openEdit = (item: InventoryItem) => {
    setSelected(item)
    setForm({
      name: item.name, category: item.category,
      quantity: String(item.quantity), min_quantity: String(item.min_quantity),
      unit: item.unit, location: item.location ?? '',
      supplier: item.supplier ?? '', unit_cost: String(item.unit_cost ?? ''),
      notes: item.notes ?? ''
    })
    setModal(true)
  }

  const openCreate = () => {
    setSelected(null)
    setForm({ name: '', category: '', quantity: '', min_quantity: '5', unit: 'unidades', location: '', supplier: '', unit_cost: '', notes: '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.quantity) { toast.error('Nombre y cantidad son requeridos'); return }
    setSaving(true)
    const data = {
      name: form.name, category: form.category,
      quantity: parseInt(form.quantity), min_quantity: parseInt(form.min_quantity),
      unit: form.unit, location: form.location || null,
      supplier: form.supplier || null,
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
      notes: form.notes || null
    }
    const { error } = selected
      ? await supabase.from('inventory').update(data).eq('id', selected.id)
      : await supabase.from('inventory').insert(data)
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success(selected ? 'Actualizado' : 'Artículo agregado')
    setModal(false)
    load()
  }

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    setSaving(false)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Artículo eliminado')
    load()
  }

  const columns = [
    { key: 'name', label: 'Artículo', render: (i: InventoryItem) => (
      <div>
        <p className="font-medium text-sm text-slate-900">{i.name}</p>
        <p className="text-xs text-slate-400">{i.category}</p>
      </div>
    )},
    { key: 'quantity', label: 'Stock', render: (i: InventoryItem) => (
      <div className="flex items-center gap-2">
        <span className={`font-semibold text-sm ${i.quantity <= i.min_quantity ? 'text-red-600' : 'text-slate-900'}`}>
          {i.quantity}
        </span>
        <span className="text-xs text-slate-400">{i.unit}</span>
        {i.quantity <= i.min_quantity && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        )}
      </div>
    )},
    { key: 'min_quantity', label: 'Stock Mín.', render: (i: InventoryItem) => `${i.min_quantity} ${i.unit}` },
    { key: 'location', label: 'Ubicación', render: (i: InventoryItem) => i.location ?? '—' },
    { key: 'unit_cost', label: 'Costo Unit.', render: (i: InventoryItem) => i.unit_cost ? formatCurrency(i.unit_cost) : '—' },
    { key: 'last_restocked', label: 'Último Abasto', render: (i: InventoryItem) => i.last_restocked ? formatDate(i.last_restocked) : '—' },
    {
      key: 'actions', label: '', render: (i: InventoryItem) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(i)} className="p-1.5 text-slate-400 hover:text-eos-600 hover:bg-eos-50 rounded-lg transition-colors" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleDelete(i)} disabled={saving} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Eliminar">
            {saving ? <div className="w-3.5 h-3.5 border border-red-400/50 border-t-red-600 rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )
    },
  ]

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">{items.length} artículos registrados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title="Total Artículos" value={items.length} icon={Package} iconColor="text-eos-600" iconBg="bg-eos-50" />
        <StatCard title="Stock Bajo" value={lowStock.length} subtitle="Requieren reabasto" icon={AlertTriangle} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard title="Valor Total" value={formatCurrency(totalValue)} icon={Package} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
      </div>

      {lowStock.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Stock bajo en {lowStock.length} artículo(s)</p>
            <p className="text-xs text-amber-600 mt-0.5">{lowStock.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      <DataTable
        data={items as unknown as Record<string, unknown>[]}
        columns={columns as Parameters<typeof DataTable>[0]['columns']}
        loading={loading}
        onRefresh={load}
        exportFilename="inventario"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nuevo Artículo
          </button>
        }
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={selected ? 'Editar Artículo' : 'Nuevo Artículo'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del artículo" />
            </div>
            <div>
              <label className="label">Categoría</label>
              <input className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ej: Papelería" />
            </div>
            <div>
              <label className="label">Unidad</label>
              <input className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="unidades, kg, litros..." />
            </div>
            <div>
              <label className="label">Cantidad *</label>
              <input type="number" className="input" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="label">Stock Mínimo</label>
              <input type="number" className="input" value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))} />
            </div>
            <div>
              <label className="label">Ubicación</label>
              <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Bodega, Aula..." />
            </div>
            <div>
              <label className="label">Costo Unitario</label>
              <input type="number" step="0.01" className="input" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="label">Proveedor</label>
            <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
