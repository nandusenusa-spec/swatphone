import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normalizeVapiApiKey(rawKey: string | null | undefined): string {
  if (!rawKey) return ''
  return rawKey.replace(/^Bearer\s+/i, '').trim()
}

function isProbablyPublicOrInvalidVapiKey(apiKey: string): boolean {
  if (!apiKey) return true
  if (apiKey.length < 20) return true
  if (/\s/.test(apiKey)) return true
  return /^(pk_|public_|pub_)/i.test(apiKey)
}

function buildVapiAuthErrorMessage(vapiMessage?: string): string {
  const lower = (vapiMessage || '').toLowerCase()
  const indicatesKeyTypeMismatch =
    lower.includes('invalid key') ||
    lower.includes('private key') ||
    lower.includes('public key') ||
    lower.includes('unauthorized')

  if (indicatesKeyTypeMismatch) {
    return 'Vapi rejected the API key. This endpoint requires a Vapi Private/Server API key (not a public/client key). Update it in Settings > Vapi API Key.'
  }

  return 'Vapi API request failed. Verify the saved Vapi Private/Server API key and try again.'
}

// This endpoint syncs the assistant configuration to Vapi
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user's organization
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, organizations(vapi_api_key, vapi_assistant_id)')
      .eq('id', user.id)
      .single()

    const vapiApiKey = normalizeVapiApiKey(profile?.organizations?.vapi_api_key)
    if (!vapiApiKey) {
      return NextResponse.json(
        { error: 'Vapi Private/Server API key is not configured' },
        { status: 400 }
      )
    }

    if (isProbablyPublicOrInvalidVapiKey(vapiApiKey)) {
      return NextResponse.json(
        {
          error:
            'Invalid Vapi key format. Use a Vapi Private/Server API key (secret key), not a public/client key.',
        },
        { status: 400 }
      )
    }

    // Get assistant config
    const { data: config } = await supabase
      .from('assistant_configs')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .single()

    if (!config) {
      return NextResponse.json({ error: 'No assistant config found' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is not configured' },
        { status: 500 }
      )
    }

    // Get products for tool
    const { data: products } = await supabase
      .from('products')
      .select('name')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)

    // Get FAQs for context
    const { data: faqs } = await supabase
      .from('faqs')
      .select('question, answer')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .limit(10)

    // Build system prompt with context
    let systemPrompt = config.system_prompt || ''
    
    if (products && products.length > 0) {
      systemPrompt += `\n\nProductos disponibles: ${products.map(p => p.name).join(', ')}`
    }
    
    if (faqs && faqs.length > 0) {
      systemPrompt += '\n\nPreguntas frecuentes:\n'
      faqs.forEach(f => {
        systemPrompt += `- ${f.question}: ${f.answer}\n`
      })
    }

    // Vapi assistant configuration
    const assistantConfig = {
      name: config.name,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        systemPrompt,
      },
      voice: {
        provider: config.voice_provider,
        voiceId: config.voice_id,
      },
      firstMessage: config.first_message,
      transcriber: {
        provider: 'deepgram',
        language: config.language,
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // Tool definitions
      model_tools: [
        {
          type: 'function',
          function: {
            name: 'get_product_price',
            description: 'Busca el precio de un producto o servicio',
            parameters: {
              type: 'object',
              properties: {
                product_name: {
                  type: 'string',
                  description: 'Nombre del producto a buscar',
                },
              },
              required: ['product_name'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'save_lead_info',
            description: 'Guarda informacion del cliente (nombre, email, empresa)',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Nombre del cliente' },
                email: { type: 'string', description: 'Email del cliente' },
                company: { type: 'string', description: 'Empresa del cliente' },
                notes: { type: 'string', description: 'Notas adicionales' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'qualify_lead',
            description: 'Califica al lead basado en la conversacion',
            parameters: {
              type: 'object',
              properties: {
                score: { 
                  type: 'number', 
                  description: 'Score de 0 a 100 basado en interes y potencial' 
                },
                reasons: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Razones de la calificacion' 
                },
                interests: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Productos o servicios de interes' 
                },
              },
              required: ['score', 'reasons', 'interests'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'transfer_call',
            description: 'Transfiere la llamada a un miembro del equipo',
            parameters: {
              type: 'object',
              properties: {
                team_member_name: { 
                  type: 'string', 
                  description: 'Nombre del miembro del equipo' 
                },
                department: { 
                  type: 'string', 
                  description: 'Departamento (ventas, soporte, etc)' 
                },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'search_faq',
            description: 'Busca en las preguntas frecuentes',
            parameters: {
              type: 'object',
              properties: {
                query: { 
                  type: 'string', 
                  description: 'Termino de busqueda' 
                },
              },
              required: ['query'],
            },
          },
        },
      ],
    }

    const assistantId = profile.organizations.vapi_assistant_id

    let response
    if (assistantId) {
      // Update existing assistant
      response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantConfig),
      })
    } else {
      // Create new assistant
      response = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantConfig),
      })
    }

    const rawResponse = await response.text()
    let result: any = null
    try {
      result = rawResponse ? JSON.parse(rawResponse) : null
    } catch {
      result = { message: rawResponse || null }
    }

    if (!response.ok) {
      console.error('[v0] Vapi API error:', result)
      const errorMessage = buildVapiAuthErrorMessage(result?.message)
      return NextResponse.json(
        {
          error: errorMessage,
          vapiMessage: result?.message || null,
        },
        { status: response.status === 401 ? 401 : 500 }
      )
    }

    // Save assistant ID if new
    if (!assistantId && result.id) {
      await supabase
        .from('organizations')
        .update({ vapi_assistant_id: result.id })
        .eq('id', profile.organization_id)
    }

    return NextResponse.json({ 
      success: true, 
      assistantId: result.id,
      message: assistantId ? 'Assistant updated' : 'Assistant created'
    })
  } catch (error) {
    console.error('[v0] Sync assistant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
