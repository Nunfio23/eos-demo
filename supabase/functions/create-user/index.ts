// v2
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    // Verificar sesion con el JWT del usuario
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'No autenticado' }, 401)

    // Verificar permisos
    const { data: caller } = await userClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!caller?.is_active || !['master', 'administracion', 'direccion'].includes(caller.role)) {
      return json({ error: 'Sin permisos para crear usuarios' }, 403)
    }

    // Parsear body
    const { username, full_name, role, password, phone } = await req.json()

    if (!username || !full_name || !role || !password) {
      return json({ error: 'Campos requeridos: usuario, nombre, rol, contrasena' }, 400)
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return json({ error: 'El usuario solo puede tener letras minusculas, numeros, puntos y guiones (3-30 caracteres)' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'La contrasena debe tener al menos 6 caracteres' }, 400)
    }

    // Cliente admin con service role
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `${username}@teslaschool.app`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      const alreadyExists = authError.message?.toLowerCase().includes('already')
      return json({ error: alreadyExists ? 'Ese nombre de usuario ya esta en uso' : authError.message }, 400)
    }

    const userId = authData.user.id

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: userId,
      email,
      full_name: full_name.trim(),
      role,
      phone: phone?.trim() || null,
      is_active: true,
    })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId)
      return json({ error: profileError.message }, 500)
    }

    return json({ success: true, userId, username, email })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
