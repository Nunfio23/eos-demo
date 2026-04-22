import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * POST /api/create-parent
 * Crea un usuario con rol 'padre', actualiza su perfil y lo vincula al estudiante.
 * Body: { student_id, full_name, phone?, address?, relationship, email? }
 * El email se genera como username@eos-school.app si no se proporciona.
 */
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

    if (!caller?.is_active || !['master', 'direccion'].includes(caller.role)) {
      return err('Sin permisos para crear usuarios', 403)
    }

    const { student_id, full_name, phone, address, relationship, email: providedEmail } = await req.json()

    if (!full_name?.trim()) return err('El nombre del padre/madre es requerido')
    if (!student_id)        return err('Se requiere el ID del estudiante')

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generar username desde el nombre
    const nameParts    = full_name.trim().toLowerCase().split(/\s+/)
    const usernameBase = nameParts.slice(0, 2).join('.').replace(/[^a-z0-9._-]/g, '').slice(0, 26)
    const username     = usernameBase.length >= 3 ? usernameBase : `padre${Date.now().toString().slice(-6)}`
    const email        = providedEmail?.trim() || `${username}@eos-school.app`
    const tempPassword = Math.random().toString(36).slice(2, 10)

    // Verificar si ya existe un perfil con ese email
    const { data: existingUser } = await adminClient.auth.admin.listUsers()
    const existing = existingUser?.users?.find(u => u.email === email)

    let parentUserId: string

    if (existing) {
      // El padre ya tiene cuenta — solo vinculamos
      parentUserId = existing.id
    } else {
      // Crear nueva cuenta de auth
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      })
      if (authError) {
        const alreadyExists = authError.message?.toLowerCase().includes('already')
        return err(alreadyExists ? 'Ya existe una cuenta con ese correo' : authError.message)
      }
      parentUserId = authData.user.id

      // Crear/actualizar perfil
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id:        parentUserId,
        email,
        full_name: full_name.trim(),
        role:      'padre',
        phone:     phone?.trim() || null,
        address:   address?.trim() || null,
        is_active: true,
      }, { onConflict: 'id' })

      if (profileError) {
        await adminClient.auth.admin.deleteUser(parentUserId)
        return err(profileError.message, 500)
      }
    }

    // Vincular al estudiante via student_parents
    const { error: linkError } = await adminClient.from('student_parents').upsert({
      student_id,
      parent_id:    parentUserId,
      relationship: relationship || 'parent',
      primary_contact: false,
    }, { onConflict: 'student_id,parent_id' })

    if (linkError) {
      return err('Padre creado pero error al vincular: ' + linkError.message, 500)
    }

    return NextResponse.json({
      success:     true,
      parentUserId,
      email,
      tempPassword: existing ? null : tempPassword,
      wasExisting:  !!existing,
    })
  } catch (e) {
    return err(String(e), 500)
  }
}
