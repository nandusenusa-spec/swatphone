import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    const supabase = await createClient()
    
    // Get the current user (must be authenticated)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if current user is already super admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_super_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Find user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) throw listError

    const targetUser = users.find((u) => u.email === email)
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Update profile to mark as super_admin
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_super_admin: true })
      .eq('id', targetUser.id)

    if (updateError) throw updateError

    return NextResponse.json({ 
      success: true, 
      message: `${email} is now a super admin` 
    })
  } catch (error) {
    console.error('Error setting super admin:', error)
    return NextResponse.json({ error: 'Failed to set super admin' }, { status: 500 })
  }
}
