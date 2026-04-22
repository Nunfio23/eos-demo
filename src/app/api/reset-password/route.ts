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
      return err('Sin permisos para restablecer contraseñas', 403)
    }

    const { userId, newPassword } = await req.json()

    if (!userId || !newPassword) return err('userId y newPassword son requeridos')
    if (newPassword.length < 6) return err('La contraseña debe tener al menos 6 caracteres')

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (resetError) return err(resetError.message, 500)

    return NextResponse.json({ success: true })
  } catch (e) {
    return err(String(e), 500)
  }
}
