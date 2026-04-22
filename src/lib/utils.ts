import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { UserRole } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const ROLE_LABELS: Record<UserRole, string> = {
  master: 'Super Admin',
  direccion: 'Dirección',
  administracion: 'Administración',
  docente: 'Docente',
  alumno: 'Alumno',
  padre: 'Padre/Madre',
  contabilidad: 'Contabilidad',
  biblioteca: 'Biblioteca',
  tienda: 'Tienda',
  marketing: 'Marketing',
  mantenimiento: 'Mantenimiento',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  master: 'bg-purple-100 text-purple-800',
  direccion: 'bg-blue-100 text-blue-800',
  administracion: 'bg-indigo-100 text-indigo-800',
  docente: 'bg-green-100 text-green-800',
  alumno: 'bg-yellow-100 text-yellow-800',
  padre: 'bg-orange-100 text-orange-800',
  contabilidad: 'bg-cyan-100 text-cyan-800',
  biblioteca: 'bg-pink-100 text-pink-800',
  tienda: 'bg-rose-100 text-rose-800',
  marketing: 'bg-violet-100 text-violet-800',
  mantenimiento: 'bg-gray-100 text-gray-800',
}

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  master: '/dashboard/master',
  direccion: '/dashboard/master',
  administracion: '/dashboard/administracion',
  docente: '/dashboard/docente',
  alumno: '/dashboard/alumno',
  padre: '/dashboard/padre',
  contabilidad: '/dashboard/contabilidad',
  biblioteca: '/dashboard/administracion',
  tienda: '/dashboard/administracion',
  marketing: '/dashboard/administracion',
  mantenimiento: '/dashboard/administracion',
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const val = row[header]
        const str = val === null || val === undefined ? '' : String(val)
        return str.includes(',') ? `"${str}"` : str
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
