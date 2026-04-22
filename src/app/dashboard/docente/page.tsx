'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import StatCard from '@/components/ui/StatCard'
import { BookOpen, Users, ClipboardList, ClipboardCheck, ArrowRight, Calendar } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

export default function DocenteDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ subjects: 0, students: 0, assignments: 0, pendingGrading: 0 })
  const [upcomingAssignments, setUpcomingAssignments] = useState<{ id: string; title: string; due_date: string; subject: { name: string } | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      const { data: teacher } = await supabase.from('teachers').select('id').eq('user_id', profile.id).single()
      if (!teacher) { setLoading(false); return }
      const tid = teacher.id

      const { data: activeYear } = await supabase.from('school_years').select('id').eq('is_active', true).single()
      if (!activeYear) { setLoading(false); return }

      const { data: ta } = await supabase
        .from('teacher_assignments')
        .select('id, section_id, grade_subject_id')
        .eq('teacher_id', tid)
        .eq('school_year_id', activeYear.id)
        .eq('is_active', true)

      const assignments = ta ?? []
      const uniqueSubjects = new Set(assignments.map((a: any) => a.grade_subject_id)).size

      const sectionIds = [...new Set(assignments.map((a: any) => a.section_id).filter(Boolean))] as string[]
      let studentCount = 0
      if (sectionIds.length > 0) {
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('student_id')
          .in('section_id', sectionIds)
          .eq('school_year_id', activeYear.id)
          .eq('status', 'active')
        studentCount = new Set((enrolls ?? []).map((e: any) => e.student_id)).size
      }

      setStats(s => ({ ...s, subjects: uniqueSubjects, students: studentCount }))
      setLoading(false)
    }

    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [profile])

  return (
    <div className="space-y-8">
      <BackButton />
      <div>
        <h1 className="page-title">¡Bienvenido, {profile?.full_name?.split(' ')[0]}!</h1>
        <p className="page-subtitle">Panel del Docente · Colegio E-OS Demo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Mis Materias" value={loading ? '...' : stats.subjects} icon={BookOpen} iconColor="text-eos-600" iconBg="bg-eos-50" />
        <StatCard title="Estudiantes" value={loading ? '...' : stats.students} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatCard title="Tareas Activas" value={loading ? '...' : stats.assignments} icon={ClipboardList} iconColor="text-violet-600" iconBg="bg-violet-50" />
        <StatCard title="Por Calificar" value={loading ? '...' : stats.pendingGrading} icon={ClipboardCheck} iconColor="text-amber-500" iconBg="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming assignments */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Próximas Entregas</h3>
            <Link href="/dashboard/academico/tareas" className="text-xs text-eos-600 hover:text-eos-700 flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {upcomingAssignments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-400">
                No hay tareas próximas
              </div>
            ) : (
              upcomingAssignments.map(a => (
                <div key={a.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-400">{a.subject?.name}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(a.due_date)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Acciones Rápidas</h3>
          <div className="space-y-3">
            {[
              { label: 'Registrar Asistencia', href: '/dashboard/asistencia', icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-600' },
              { label: 'Crear Tarea', href: '/dashboard/academico/tareas', icon: ClipboardList, color: 'bg-violet-50 text-violet-600' },
              { label: 'Mis Materias', href: '/dashboard/academico/materias', icon: BookOpen, color: 'bg-eos-50 text-eos-600' },
              { label: 'Calificaciones', href: '/dashboard/academico/calificaciones', icon: ClipboardCheck, color: 'bg-blue-50 text-blue-600' },
            ].map(({ label, href, icon: Icon, color }) => (
              <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 ml-auto transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
