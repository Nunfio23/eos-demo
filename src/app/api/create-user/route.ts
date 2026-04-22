import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    // Verificar sesión del usuario que hace la petición
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autenticado', 401)

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) return err('No autenticado', 401)

    // Verificar permisos
    const { data: caller } = await anonClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!caller?.is_active || !['master', 'direccion'].includes(caller.role)) {
      return err('Sin permisos para crear usuarios', 403)
    }

    // Parsear body
    const {
      username, full_name, role, password, phone, nie,
      // Extended student fields
      address, date_of_birth, blood_type, emergency_contact,
      gender, nationality, id_type, handedness,
      shirt_size, pants_size, skirt_size, previous_school,
      interests, special_needs, special_needs_description, professional_support,
      extracurricular, auth_exit, auth_photos, auth_internet,
      siblings_in_school, siblings_info, additional_info,
      // Health data to pre-fill
      health_allergies, health_medications, health_conditions,
      health_doctor_name, health_doctor_phone,
      health_insurance_provider, health_insurance_number, health_notes,
    } = await req.json()

    if (!username || !full_name || !role || !password) {
      return err('Campos requeridos: usuario, nombre, rol, contraseña')
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return err('El usuario solo puede tener letras minúsculas, números, puntos y guiones (3–30 caracteres)')
    }
    if (password.length < 6) {
      return err('La contraseña debe tener al menos 6 caracteres')
    }

    // Cliente admin con service role (server-side, seguro)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `${username}@eos-school.app`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      const alreadyExists = authError.message?.toLowerCase().includes('already')
      return err(alreadyExists ? 'Ese nombre de usuario ya está en uso' : authError.message)
    }

    const userId = authData.user.id

    // Upsert en lugar de insert — el trigger de Supabase puede crear el perfil antes que nosotros
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id:        userId,
      email,
      full_name: full_name.trim(),
      role,
      phone:     phone?.trim() || null,
      address:   address?.trim() || null,
      is_active: true,
    }, { onConflict: 'id' })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId)
      return err(profileError.message, 500)
    }

    // Si es docente, crear registro en teachers
    if (role === 'docente') {
      const { count } = await adminClient.from('teachers').select('*', { count: 'exact', head: true })
      const empNum = `DOC-${String((count ?? 0) + 1).padStart(3, '0')}`
      await adminClient.from('teachers').insert({
        user_id: userId,
        employee_number: empNum,
        is_active: true,
      })
    }

    // Si es alumno, crear registro en students
    if (role === 'alumno') {
      const studentPayload: Record<string, unknown> = { user_id: userId, is_active: true }
      if (nie && typeof nie === 'string' && nie.trim()) studentPayload.enrollment_number = nie.trim()
      if (date_of_birth)              studentPayload.date_of_birth             = date_of_birth
      if (blood_type)                 studentPayload.blood_type                = blood_type
      if (emergency_contact)          studentPayload.emergency_contact         = emergency_contact?.trim()
      if (gender)                     studentPayload.gender                    = gender
      if (nationality)                studentPayload.nationality               = nationality?.trim()
      if (id_type)                    studentPayload.id_type                   = id_type?.trim()
      if (handedness)                 studentPayload.handedness                = handedness
      if (shirt_size)                 studentPayload.shirt_size                = shirt_size?.trim()
      if (pants_size)                 studentPayload.pants_size                = pants_size?.trim()
      if (skirt_size)                 studentPayload.skirt_size                = skirt_size?.trim()
      if (previous_school)            studentPayload.previous_school           = previous_school?.trim()
      if (interests)                  studentPayload.interests                 = interests?.trim()
      if (special_needs !== undefined) studentPayload.special_needs            = !!special_needs
      if (special_needs_description)  studentPayload.special_needs_description = special_needs_description?.trim()
      if (professional_support !== undefined) studentPayload.professional_support = !!professional_support
      if (extracurricular)            studentPayload.extracurricular           = extracurricular?.trim()
      if (auth_exit !== undefined)    studentPayload.auth_exit                 = !!auth_exit
      if (auth_photos !== undefined)  studentPayload.auth_photos               = !!auth_photos
      if (auth_internet !== undefined) studentPayload.auth_internet            = !!auth_internet
      if (siblings_in_school !== undefined) studentPayload.siblings_in_school  = !!siblings_in_school
      if (siblings_info)              studentPayload.siblings_info             = siblings_info?.trim()
      if (additional_info)            studentPayload.additional_info           = additional_info?.trim()

      const { data: newStudent, error: studentError } = await adminClient.from('students').insert(studentPayload).select('id').single()
      if (studentError) {
        return NextResponse.json({ success: true, userId, username, email, studentWarning: studentError.message })
      }

      // Pre-cargar datos de salud si se proporcionaron
      const studentId = (newStudent as any)?.id
      const hasHealthData = health_allergies || health_medications || health_conditions ||
        health_doctor_name || health_doctor_phone || health_insurance_provider ||
        health_insurance_number || health_notes
      if (studentId && hasHealthData) {
        const healthPayload: Record<string, unknown> = { student_id: studentId }
        if (health_allergies)          healthPayload.allergies          = health_allergies.trim()
        if (health_medications)        healthPayload.medications        = health_medications.trim()
        if (health_conditions)         healthPayload.medical_conditions = health_conditions.trim()
        if (health_doctor_name)        healthPayload.doctor_name        = health_doctor_name.trim()
        if (health_doctor_phone)       healthPayload.doctor_phone       = health_doctor_phone.trim()
        if (health_insurance_provider) healthPayload.insurance_provider = health_insurance_provider.trim()
        if (health_insurance_number)   healthPayload.insurance_number   = health_insurance_number.trim()
        if (health_notes)              healthPayload.notes              = health_notes.trim()
        await adminClient.from('student_health').insert(healthPayload)
      }
    }

    return NextResponse.json({ success: true, userId, username, email })
  } catch (e) {
    return err(String(e), 500)
  }
}
