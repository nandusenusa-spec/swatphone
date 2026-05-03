import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Middleware para verificar admin token
async function verifyAdminToken(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  
  const token = authHeader.split(' ')[1]
  if (!token || token.length < 10) return false
  
  // Verificar token contra la base de datos
  const supabase = await createClient()
  const { data } = await supabase
    .from('admin_credentials')
    .select('username')
    .eq('is_active', true)
    .limit(1)
  
  return !!data && data.length > 0
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')

  // Usar service role para bypass RLS
  const supabase = await createClient()

  try {
    switch (type) {
      case 'organizations':
        const { data: orgs, error: orgsError } = await supabase
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (orgsError) throw orgsError
        return NextResponse.json({ data: orgs })

      case 'organization':
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
        
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', id)
          .single()
        
        if (orgError) throw orgError
        return NextResponse.json({ data: org })

      case 'products':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('organization_id', id)
          .order('name')
        
        if (productsError) throw productsError
        return NextResponse.json({ data: products })

      case 'faqs':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: faqs, error: faqsError } = await supabase
          .from('faqs')
          .select('*')
          .eq('organization_id', id)
        
        if (faqsError) throw faqsError
        return NextResponse.json({ data: faqs })

      case 'team':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: team, error: teamError } = await supabase
          .from('team_members')
          .select('*')
          .eq('organization_id', id)
        
        if (teamError) throw teamError
        return NextResponse.json({ data: team })

      case 'calls':
        const callsQuery = supabase
          .from('calls')
          .select('*, organizations(name)')
          .order('created_at', { ascending: false })
          .limit(100)
        
        if (id) callsQuery.eq('organization_id', id)
        
        const { data: calls, error: callsError } = await callsQuery
        if (callsError) throw callsError
        return NextResponse.json({ data: calls })

      case 'leads':
        const leadsQuery = supabase
          .from('leads')
          .select('*, organizations(name)')
          .order('created_at', { ascending: false })
          .limit(100)
        
        if (id) leadsQuery.eq('organization_id', id)
        
        const { data: leads, error: leadsError } = await leadsQuery
        if (leadsError) throw leadsError
        return NextResponse.json({ data: leads })

      case 'assistant_config':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: config, error: configError } = await supabase
          .from('assistant_configs')
          .select('*')
          .eq('organization_id', id)
          .single()
        
        if (configError && configError.code !== 'PGRST116') throw configError
        return NextResponse.json({ data: config })

      case 'stats':
        const [orgsCount, callsCount, leadsCount] = await Promise.all([
          supabase.from('organizations').select('id', { count: 'exact', head: true }),
          supabase.from('calls').select('id', { count: 'exact', head: true }),
          supabase.from('leads').select('id', { count: 'exact', head: true })
        ])
        
        return NextResponse.json({
          data: {
            organizations: orgsCount.count || 0,
            calls: callsCount.count || 0,
            leads: leadsCount.count || 0
          }
        })

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Admin data error:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const { type, id, data } = body

  const supabase = await createClient()

  try {
    switch (type) {
      case 'update_organization':
        const { error: updateOrgError } = await supabase
          .from('organizations')
          .update(data)
          .eq('id', id)
        
        if (updateOrgError) throw updateOrgError
        return NextResponse.json({ success: true })

      case 'update_assistant_config':
        const { error: upsertError } = await supabase
          .from('assistant_configs')
          .upsert({
            organization_id: id,
            ...data,
            updated_at: new Date().toISOString()
          })
        
        if (upsertError) throw upsertError
        return NextResponse.json({ success: true })

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Failed to update data' }, { status: 500 })
  }
}
