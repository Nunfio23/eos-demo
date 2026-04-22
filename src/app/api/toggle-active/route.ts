import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autenticado', 401)

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) return err('No autenticado', 401)

    const { data: caller } = await anonClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!caller?.is_active || !['master', 'administracion', 'direccion'].includes(caller.role)) {
      return err('Sin permisos', 403)
    }

    const { userId, activate } = await req.json()
    if (!userId) return err('userId es requerido')

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Ban/unban en Supabase Auth — impide o permite el login y cierra sesiones activas
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: activate ? 'none' : '876600h', // 100 años = ban permanente
    })
    if (authError) return err(authError.message, 500)

    // 2. Actualizar profiles.is_active
    await adminClient.from('profiles').update({ is_active: activate }).eq('id', userId)

    // 3. Actualizar students.is_active si tiene registro de estudiante
    const { data: studentRec } = await adminClient
      .from('students')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (studentRec?.id) {
      await adminClient.from('students').update({ is_active: activate }).eq('id', studentRec.id)

      // 4. Si se desactiva, retirar matrículas activas
      if (!activate) {
        await adminClient
          .from('enrollments')
          .update({ status: 'withdrawn' })
          .eq('student_id', studentRec.id)
          .eq('status', 'active')
      }
    }

    return NextResponse.json({ success: true, is_active: activate })
  } catch (e) {
    return err(String(e), 500)
  }
}
