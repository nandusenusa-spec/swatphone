import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify admin credentials
    const { data: admin, error } = await supabase
      .from('admin_credentials')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single()

    if (error || !admin) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password using pgcrypto
    const { data: passwordMatch } = await supabase.rpc('verify_admin_password', {
      input_username: username,
      input_password: password
    })

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Create admin session token
    const sessionToken = Buffer.from(
      JSON.stringify({
        adminId: admin.id,
        username: admin.username,
        email: admin.email,
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      })
    ).toString('base64')

    // Devolver token al cliente para que lo guarde en localStorage
    return NextResponse.json(
      {
        success: true,
        token: sessionToken,
        username: admin.username,
        email: admin.email
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}
