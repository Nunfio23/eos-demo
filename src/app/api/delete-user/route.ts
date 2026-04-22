import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autenticado', 401)

    // Verificar que quien llama es master
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) return err('No autenticado', 401)

    const { data: callerProfile } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'master') {
      return err('Solo el Super Admin puede eliminar usuarios', 403)
    }

    const { userId } = await req.json()
    if (!userId) return err('userId requerido')

    // No permitir auto-eliminación
    if (userId === user.id) return err('No puedes eliminar tu propia cuenta')

    // Usar service role para eliminar de auth
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verificar que el usuario a eliminar no es master
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', userId)
      .single()

    if (targetProfile?.role === 'master') {
      return err('No se puede eliminar a otro Super Admin')
    }

    // Eliminar de auth (cascada elimina el profile por FK)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) return err('Error al eliminar: ' + deleteError.message)

    return NextResponse.json({ ok: true, message: `Usuario eliminado correctamente` })
  } catch (e: unknown) {
    return err((e as Error).message ?? 'Error interno', 500)
  }
}
