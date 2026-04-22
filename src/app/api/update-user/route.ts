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
      return err('Sin permisos para editar usuarios', 403)
    }

    const { userId, username, full_name, role, phone } = await req.json()
    if (!userId) return err('userId es requerido')

    if (username && !/^[a-z0-9._-]{3,30}$/.test(username)) {
      return err('El usuario solo puede tener letras minúsculas, números, puntos y guiones (3–30 caracteres)')
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Si cambia el username, actualizar email en auth + profiles
    if (username) {
      const newEmail = `${username}@eos-school.app`

      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        email: newEmail,
      })
      if (authError) {
        const alreadyExists = authError.message?.toLowerCase().includes('already')
        return err(alreadyExists ? 'Ese nombre de usuario ya está en uso' : authError.message, 400)
      }

      const { error: profileEmailError } = await adminClient
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', userId)
      if (profileEmailError) return err(profileEmailError.message, 500)
    }

    // Actualizar resto de campos del perfil
    const profileUpdates: Record<string, unknown> = {}
    if (full_name !== undefined) profileUpdates.full_name = full_name.trim()
    if (role !== undefined) profileUpdates.role = role
    if (phone !== undefined) profileUpdates.phone = phone || null

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)
      if (profileError) return err(profileError.message, 500)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return err(String(e), 500)
  }
}
