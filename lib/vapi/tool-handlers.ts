import { classifyLeadTemperature, notifyLeadTelegram } from '@/lib/notifications/telegram'
import {
  runCreateAppointment,
  runCreateFollowUp,
  runCreateWorkOrder,
  runFindCustomer,
  runGetJobStatus,
  runGetPriceQuote,
  runMarkSpamCall,
  runSaveLeadInfo,
} from '@/lib/voice-platform/service'
import { followUpCountForCallLog, getCallLogIdByVapiCallId } from '@/lib/voice-platform/repository'
import {
  persistCallArtifacts,
  persistFollowUp,
  persistTransfer,
} from '@/lib/vapi/persistence'
import { runPrepareWarmTransfer } from '@/lib/vapi/operator-handoff'
import { normalizePhone } from '@/lib/phone'
import { prepareCommercialFollowUpFromArgs } from '@/lib/vapi/commercial-follow-up'
import {
  buildCommercialMetaBlock,
  classificationSourceText,
  defaultFollowUpDueIsoTomorrow,
  detectWrapIntent,
  parseModelLeadClassification,
  prependCommercialBlockToNotes,
  type LeadCommercialFields,
} from '@/lib/vapi/lead-classification'

function leadFullNameValid(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0)
  return parts.length >= 2
}

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeTransferLanguage(raw: string): 'en' | 'es' | null {
  const v = raw.trim().toLowerCase()
  if (v === 'en' || v.startsWith('english')) return 'en'
  if (v === 'es' || v.startsWith('spanish') || v.startsWith('espanol') || v.startsWith('español')) return 'es'
  return null
}

async function saveAndNotifyTransferRequestLead(input: {
  organizationId: string
  phone: string
  vapiCallId?: string | null
  args: Record<string, unknown>
  requestedDepartment: string
  language: 'en' | 'es' | null
}) {
  const phone = normalizePhone(input.phone)
  const requestedDepartment = input.requestedDepartment.trim()
  if (!phone || !requestedDepartment) {
    console.info('[vapi/transfer-request-lead] skipped', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      has_phone: Boolean(phone),
      requested_department: requestedDepartment || null,
    })
    return
  }

  const language = input.language || 'unknown'
  const requestSummary =
    requestedDepartment.toLowerCase().includes('graphic') ||
    requestedDepartment.toLowerCase().includes('logo') ||
    requestedDepartment.toLowerCase().includes('brand')
      ? 'Caller requested transfer to graphic design'
      : `Caller requested transfer to ${requestedDepartment}`
  const customerName = strArg(input.args, 'customer_name') || undefined
  const notes = [
    `request_summary: ${requestSummary}`,
    `requested_department: ${requestedDepartment}`,
    `language: ${language}`,
    'status: transfer_requested',
    input.vapiCallId ? `call_id: ${input.vapiCallId}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const commercialSnapshot = {
    category: 'support',
    intent: 'transfer_request',
    priority: 'normal',
    source: 'vapi_call',
    callback_required: false,
    summary: requestSummary,
    next_action: `Transfer caller to ${requestedDepartment}.`,
    requested_department: requestedDepartment,
    request_summary: requestSummary,
    language,
    status: 'transfer_requested',
    call_id: input.vapiCallId || null,
  }

  let leadSaved = false
  let leadId: string | null = null
  try {
    const out = await runSaveLeadInfo({
      organizationId: input.organizationId,
      phone,
      name: customerName,
      notes,
      commercialSnapshot,
      vapiCallId: input.vapiCallId ?? null,
    })
    leadSaved = Boolean(out.ok)
    leadId = out.ok ? out.lead?.id ?? null : null
    console.info('[vapi/transfer-request-lead] saved', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      language,
      saved: leadSaved,
      lead_id: leadId,
      error: out.ok ? null : out.error,
    })
  } catch (err) {
    console.error('[vapi/transfer-request-lead] save_error', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const tgOk = await notifyLeadTelegram({
      temperature: 'lukewarm',
      customerName: customerName || 'Transfer request',
      phone,
      need: requestSummary,
      priceRequested: false,
      category: 'transfer_request',
      summary: requestSummary,
      nextAction: `Transfer to ${requestedDepartment}`,
    })
    console.info('[vapi/transfer-request-lead] telegram', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      lead_saved: leadSaved,
      lead_id: leadId,
      sent: tgOk,
    })
  } catch (err) {
    console.error('[vapi/transfer-request-lead] telegram_error', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function tryAutoFollowUpAfterLeadSave(input: {
  organizationId: string
  phone: string
  vapiCallId: string | null | undefined
  toolCallId: string | null | undefined
  leadId: string | null
  commercial: Partial<LeadCommercialFields> & Record<string, unknown>
  customerName: string | undefined
  args: Record<string, unknown>
}) {
  const c = input.commercial
  const needsHuman =
    input.args.needs_human_follow_up === true ||
    (typeof input.args.needs_human_follow_up === 'string' &&
      input.args.needs_human_follow_up === 'true')

  const transferFailed =
    input.args.transfer_failed === true ||
    (typeof input.args.transfer_failed === 'string' && input.args.transfer_failed === 'true')

  const shouldAuto =
    c.category === 'wrap' ||
    c.intent === 'quote_request' ||
    c.callback_required === true ||
    needsHuman ||
    transferFailed

  if (!shouldAuto) return

  let callLogId: string | undefined =
    input.vapiCallId && input.vapiCallId.trim()
      ? (await getCallLogIdByVapiCallId(input.organizationId, input.vapiCallId)) || undefined
      : undefined
  if (callLogId) {
    const n = await followUpCountForCallLog(callLogId)
    if (n > 0) {
      console.info('[vapi/follow-up]', {
        source: 'auto_after_lead' as const,
        toolCallId: input.toolCallId ?? null,
        leadId: input.leadId,
        organization_id: input.organizationId,
        title: null,
        category: c.category ?? null,
        priority: null,
        due_at: null,
        callback_required: null,
        created: false,
        followUpId: null,
        table: 'follow_ups',
        error: 'already_exists_for_call_log',
      })
      return
    }
  }

  const title =
    c.category === 'wrap'
      ? 'Llamar por cotización de wrap'
      : 'Seguimiento: cotización o contacto solicitado'

  const notes = [
    input.customerName ? `Cliente: ${input.customerName}` : null,
    `Tel: ${input.phone}`,
    c.summary ? `Resumen: ${c.summary}` : null,
    c.next_action ? `Próxima acción: ${c.next_action}` : null,
    c.category ? `Categoría: ${c.category}` : null,
    c.intent ? `Intent: ${c.intent}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const dueAt = defaultFollowUpDueIsoTomorrow()
  const priority = c.category === 'wrap' ? 'high' : 'normal'

  try {
    const out = await runCreateFollowUp({
      organizationId: input.organizationId,
      callLogId,
      phone: input.phone,
      title,
      notes,
      dueAt,
      priority,
      callbackRequired: true,
    })
    const fu = out.follow_up as { id?: string } | undefined
    console.info('[vapi/follow-up]', {
      source: 'auto_after_lead' as const,
      toolCallId: input.toolCallId ?? null,
      leadId: input.leadId,
      callLogId: callLogId ?? null,
      organization_id: input.organizationId,
      title: title.slice(0, 120),
      category: c.category ?? null,
      priority,
      due_at: dueAt,
      callback_required: true,
      created: true,
      followUpId: fu?.id ?? null,
      table: 'follow_ups',
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[vapi/follow-up]', {
      source: 'auto_after_lead',
      toolCallId: input.toolCallId ?? null,
      leadId: input.leadId,
      callLogId: callLogId ?? null,
      organization_id: input.organizationId,
      title: title.slice(0, 120),
      category: c.category ?? null,
      priority,
      due_at: dueAt,
      callback_required: true,
      created: false,
      followUpId: null,
      table: 'follow_ups',
      error: msg.slice(0, 400),
    })
  }
}

type ToolContext = {
  organizationId: string
  phone: string
  vapiCallId: string
  /** Id de tool call de Vapi (logging). */
  toolCallId?: string | null
  transcript?: string | null
  latestUserText?: string | null
  callSummary?: string | null
}

function stripAccentsForMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function inferTransferDestinationFromText(text: string): {
  department: string
  extension: string | null
  language: 'en' | 'es' | null
  reason: string
} | null {
  const normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const designHit =
    /\bdiseno\b/.test(normalized) ||
    /\bdiseno grafico\b/.test(normalized) ||
    /\bdisenador grafico\b/.test(normalized) ||
    /\bgraphic design\b/.test(normalized) ||
    /\bdesign\b/.test(normalized) ||
    /\blogo(s)?\b/.test(normalized) ||
    /\bbranding\b/.test(normalized)

  if (!designHit) return null

  const language: 'en' | 'es' =
    /\bgraphic design\b|\bdesign\b|\blogo(s)?\b|\bbranding\b/.test(normalized) &&
    !/\bdiseno\b|\bdisenador\b/.test(normalized)
      ? 'en'
      : 'es'

  return {
    department: language === 'en' ? 'graphic design' : 'diseño gráfico',
    extension: '90',
    language,
    reason: 'design_keyword_context',
  }
}

export async function executeToolHandler(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext,
) {
  const missing = (fields: string[], primary = 'Me falta un dato para continuar.') => ({
    ok: false as const,
    error: 'missing_required_fields' as const,
    missing_fields: fields,
    fields,
    primary_message_for_caller: primary,
  })

  switch (toolName) {
    case 'find_customer':
      if (!args.phone && !context.phone) return missing(['phone'])
      return runFindCustomer({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        name: typeof args.name === 'string' ? args.name : undefined,
      })
    case 'get_client_status': {
      if (!context.phone?.trim()) {
        return missing(['phone'])
      }
      return runGetJobStatus({
        organizationId: context.organizationId,
        phone: context.phone,
      })
    }
    case 'get_job_status': {
      const jobNumber =
        typeof args.job_number === 'string'
          ? args.job_number
          : typeof args.order_number === 'string'
            ? args.order_number
            : undefined
      return runGetJobStatus({
        organizationId: context.organizationId,
        jobNumber,
        phone: typeof args.phone === 'string' ? args.phone : context.phone,
      })
    }
    case 'create_appointment':
      if (!args.appointment_at) return missing(['appointment_at'])
      return runCreateAppointment({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        appointmentAt: String(args.appointment_at || ''),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      })
    case 'create_work_order':
      if (!args.title) return missing(['title'])
      return runCreateWorkOrder({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        title: String(args.title || 'Nuevo trabajo'),
        issueDescription:
          typeof args.issue_description === 'string' ? args.issue_description : undefined,
      })
    case 'get_price_quote':
      console.info('[vapi/tool-call] get_price_quote', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        service_name_preview: String(args.service_name ?? '').slice(0, 120),
      })
      if (!args.service_name) return missing(['service_name'])
      return runGetPriceQuote({
        organizationId: context.organizationId,
        serviceName: String(args.service_name || ''),
        logContext: { toolCallId: context.vapiCallId || null, toolName: 'get_price_quote' },
      })
    case 'get_product_price': {
      const name =
        typeof args.product_name === 'string'
          ? args.product_name
          : typeof args.service_name === 'string'
            ? args.service_name
            : ''
      console.info('[vapi/tool-call] get_product_price', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        product_name_preview: name.slice(0, 120),
      })
      if (!name.trim()) return missing(['product_name'])
      return runGetPriceQuote({
        organizationId: context.organizationId,
        serviceName: name,
        logContext: { toolCallId: context.vapiCallId || null, toolName: 'get_product_price' },
      })
    }
    case 'save_lead_info': {
      console.log('[vapi/tool-call]', {
        callId: context.vapiCallId || null,
        toolName: 'save_lead_info',
        toolCallId: context.toolCallId || null,
        organization_id: context.organizationId,
        argKeys: Object.keys(args).slice(0, 32),
      })
      console.info('[vapi/tool-call] save_lead_info', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        arg_keys: Object.keys(args).slice(0, 24),
        has_phone_arg: Boolean(
          typeof args.phone === 'string' && String(args.phone).trim(),
        ),
        has_context_phone: Boolean(context.phone?.trim()),
      })
      const argPhone = typeof args.phone === 'string' ? normalizePhone(args.phone) : ''
      const ctxPhone = context.phone ? normalizePhone(context.phone) : ''
      const phone = argPhone || ctxPhone || ''
      if (!phone) {
        return missing(['phone'], 'Me falta un dato para registrar tu solicitud.')
      }

      const first = typeof args.first_name === 'string' ? args.first_name.trim() : ''
      const last = typeof args.last_name === 'string' ? args.last_name.trim() : ''
      const full = typeof args.full_name === 'string' ? args.full_name.trim() : ''
      const nameOnly = typeof args.name === 'string' ? args.name.trim() : ''
      const mergedName =
        [first, last].filter(Boolean).join(' ').trim() || full || nameOnly || undefined

      const noteParts = [
        typeof args.notes === 'string' ? args.notes.trim() : '',
        typeof args.need === 'string' ? args.need.trim() : '',
        typeof args.motivo === 'string' ? args.motivo.trim() : '',
        typeof args.reason === 'string' ? args.reason.trim() : '',
      ].filter(Boolean)
      const mergedNotes = noteParts.join('\n').trim() || undefined

      const needPresent = Boolean(mergedNotes && mergedNotes.trim().length >= 3)
      const namePresent = leadFullNameValid(mergedName)

      if (!namePresent) {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: false,
          phone_present: true,
          need_present: needPresent,
          saved: false,
          leadId: null,
          error: 'missing_name',
        })
        return {
          ok: false as const,
          error: 'missing_name' as const,
          primary_message_for_caller: '¿Cuál es tu nombre y apellido?',
        }
      }

      if (!needPresent) {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: false,
          saved: false,
          leadId: null,
          error: 'missing_need',
        })
        return {
          ok: false as const,
          error: 'missing_need' as const,
          primary_message_for_caller:
            '¿En qué podemos ayudarte o qué necesitás cotizar?',
        }
      }

      let commercial = parseModelLeadClassification(args)
      const sniff = classificationSourceText(noteParts)
      if (detectWrapIntent(sniff)) {
        commercial = {
          category: 'wrap',
          intent: commercial.intent || 'quote_request',
          priority: 'high',
          estimated_value_level: 'high',
          summary:
            commercial.summary ||
            'Cliente solicita cotización para wrap vehicular.',
          next_action:
            commercial.next_action ||
            'Llamar cuanto antes para pedir detalles del vehículo y alcance del wrap.',
          source: commercial.source || 'vapi_call',
          callback_required: true,
        }
      } else if (!commercial.category && sniff) {
        commercial = {
          ...commercial,
          category: commercial.category || 'general_quote',
          intent: commercial.intent || 'inquiry',
          priority: commercial.priority || 'normal',
          estimated_value_level: commercial.estimated_value_level || 'low_medium',
          source: commercial.source || 'vapi_call',
        }
      }

      const metaBlock = buildCommercialMetaBlock(commercial)
      const notesWithMeta = prependCommercialBlockToNotes(metaBlock, mergedNotes)

      console.info('[vapi/lead-classification]', {
        toolCallId: context.toolCallId || null,
        input: {
          has_need: Boolean(typeof args.need === 'string' && args.need.trim()),
          has_motivo: Boolean(typeof args.motivo === 'string' && args.motivo.trim()),
        },
        category: commercial.category ?? null,
        intent: commercial.intent ?? null,
        priority: commercial.priority ?? null,
        estimated_value_level: commercial.estimated_value_level ?? null,
        next_action: commercial.next_action ? String(commercial.next_action).slice(0, 160) : null,
        wrap_sniff: detectWrapIntent(sniff),
      })

      const out = await runSaveLeadInfo({
        organizationId: context.organizationId,
        phone,
        name: mergedName,
        email: typeof args.email === 'string' ? args.email : undefined,
        company: typeof args.company === 'string' ? args.company : undefined,
        notes: notesWithMeta || mergedNotes,
        commercialSnapshot: commercial,
        vapiCallId: context.vapiCallId ?? null,
      })

      if (out.ok) {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: true,
          saved: true,
          leadId: out.lead?.id ?? null,
          error: null,
        })
        try {
          const tgOk = await notifyLeadTelegram({
            temperature: classifyLeadTemperature({
              customerName: mergedName, phone,
              email: typeof args.email==='string'?args.email:null,
              need: mergedNotes||'',
              priceRequested: commercial.intent==='quote_request',
              dateNeeded: typeof args.date_needed==='string'?args.date_needed:null,
            }),
            customerName: mergedName||'Sin nombre', phone,
            email: typeof args.email==='string'?args.email:null,
            need: mergedNotes||'',
            priceRequested: commercial.intent==='quote_request',
            dateNeeded: typeof args.date_needed==='string'?args.date_needed:null,
            category: commercial.category||null,
            summary: commercial.summary||null,
            nextAction: commercial.next_action||null,
          })
          console.info('[vapi/save-lead] telegram', { sent: tgOk, leadId: out.lead?.id ?? null })
        } catch (tgErr) {
          console.error('[vapi/save-lead] telegram_error', tgErr)
        }
        await tryAutoFollowUpAfterLeadSave({
          organizationId: context.organizationId,
          phone,
          vapiCallId: context.vapiCallId,
          toolCallId: context.toolCallId ?? null,
          leadId: out.lead?.id ?? null,
          commercial,
          customerName: mergedName,
          args,
        })
      } else {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: true,
          saved: false,
          leadId: null,
          error: out.error,
        })
      }

      return out
    }
    case 'prepare_warm_transfer': {
      const rawArgsPhone = typeof args.phone === 'string' ? args.phone : ''
      const ctxPhone = context.phone || ''
      let transferDepartment = strArg(args, 'transfer_department')
      const transferPerson = strArg(args, 'transfer_person')
      let transferExtension = strArg(args, 'transfer_extension')
      const intent = strArg(args, 'intent')
      const shortSummary = strArg(args, 'short_summary')
      let language = normalizeTransferLanguage(strArg(args, 'language'))
      const contextText = [
        context.latestUserText || '',
        context.transcript || '',
        context.callSummary || '',
        intent,
        shortSummary,
      ].filter(Boolean).join('\n')
      const inferredDestination =
        !transferDepartment && !transferPerson && !transferExtension
          ? inferTransferDestinationFromText(contextText)
          : null
      if (inferredDestination) {
        transferDepartment = inferredDestination.department
        transferExtension = inferredDestination.extension || ''
        language = language || inferredDestination.language
      }
      const requestedDestination =
        transferDepartment || transferPerson || intent || shortSummary || transferExtension
      const chosenPhoneSource =
        rawArgsPhone.trim() ? 'tool_args.phone' : ctxPhone.trim() ? 'webhook_context.phone' : 'none'
      console.log('[vapi/tool-handlers] prepare_warm_transfer input', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        transfer_department: transferDepartment || null,
        transfer_person: transferPerson || null,
        transfer_extension: transferExtension || null,
        language: language || null,
        intent_preview:
          intent ? intent.slice(0, 200) : null,
        short_summary_set: Boolean(shortSummary),
        inferred_destination: inferredDestination
          ? {
              department: inferredDestination.department,
              extension: inferredDestination.extension,
              language: inferredDestination.language,
              reason: inferredDestination.reason,
            }
          : null,
        context_text_preview: contextText ? contextText.slice(0, 220) : null,
        context_phone_suffix: ctxPhone.length >= 4 ? ctxPhone.slice(-4) : null,
        args_phone_suffix: rawArgsPhone.length >= 4 ? rawArgsPhone.slice(-4) : null,
        chosen_phone_source: chosenPhoneSource,
      })
      if (!requestedDestination.trim()) {
        console.warn('[vapi/tool-handlers] prepare_warm_transfer FAIL missing transfer destination', {
          failure_code: 'missing_transfer_destination',
          organization_id: context.organizationId,
          vapi_call_id: context.vapiCallId || null,
          loop_prevention_result: 'returned_transfer_destination_needed_instead_of_missing_transfer_destination',
        })
        return {
          ok: false as const,
          error: 'transfer_destination_needed' as const,
          primary_message_for_caller:
            language === 'en'
              ? 'Which department or person should I transfer you to?'
              : '¿Con qué departamento o persona querés que te transfiera?',
        }
      }
      if (!context.vapiCallId) {
        console.warn(
          '[vapi/tool-handlers] prepare_warm_transfer FAIL missing vapi_call_id → ok:false (missing_required_fields)',
          {
            failure_code: 'missing_required_fields:vapi_call_id',
            organization_id: context.organizationId,
            context_phone_suffix: ctxPhone.length >= 4 ? ctxPhone.slice(-4) : null,
            args_phone_suffix: rawArgsPhone.length >= 4 ? rawArgsPhone.slice(-4) : null,
          },
        )
        return missing(['vapi_call_id'])
      }
      if (!args.phone && !context.phone) {
        console.warn(
          '[vapi/tool-handlers] prepare_warm_transfer FAIL missing phone in args and webhook → ok:false (missing_required_fields)',
          {
            failure_code: 'missing_required_fields:phone',
            organization_id: context.organizationId,
            vapi_call_id: context.vapiCallId,
          },
        )
        return missing(['phone'])
      }
      await saveAndNotifyTransferRequestLead({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        args,
        requestedDepartment: transferDepartment || transferPerson || requestedDestination,
        language,
      })
      console.info('[vapi/tool-handlers] prepare_warm_transfer minimal_transfer_lead_requested', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        requested_department: transferDepartment || transferPerson || requestedDestination,
        language: language || null,
        phone_suffix: String(args.phone || context.phone || '').slice(-4) || null,
        inferred: Boolean(inferredDestination),
      })
      const prepared = await runPrepareWarmTransfer({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : null,
        orderNumber: typeof args.order_number === 'string' ? args.order_number : null,
        intent: intent || null,
        shortSummary: shortSummary || null,
        transferExtension: transferExtension || null,
        transferDepartment: transferDepartment || null,
        transferPerson: transferPerson || null,
        language,
      })
      console.info('[vapi/tool-handlers] prepare_warm_transfer result', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        ok: Boolean(prepared && typeof prepared === 'object' && 'ok' in prepared && prepared.ok),
        error:
          prepared && typeof prepared === 'object' && 'error' in prepared
            ? prepared.error
            : null,
      })
      return prepared
    }
    case 'transfer_to_ramon': {
      const fromArgs =
        typeof args.call_log_id === 'string' && args.call_log_id.trim()
          ? args.call_log_id.trim()
          : null
      const callLogId =
        fromArgs ||
        (context.vapiCallId
          ? await getCallLogIdByVapiCallId(context.organizationId, context.vapiCallId)
          : null)
      if (!callLogId) {
        console.info('[vapi/transfer-routing]', {
          input: 'transfer_to_ramon',
          matchedName: null,
          matchedRole: null,
          matchedDepartment: null,
          transferExtension: null,
          transferPhone: null,
          found: true,
          prepared: true,
          transferred: true,
          error: null,
          note: 'native_transfer_no_call_log_row',
        })
        console.info('[vapi/tool-handlers] transfer_to_ramon result', {
          organization_id: context.organizationId,
          vapi_call_id: context.vapiCallId || null,
          ok: true,
          native_transfer: true,
          call_log_id: null,
        })
        return { ok: true, native_transfer: true }
      }
      const pt = await persistTransfer({
        organizationId: context.organizationId,
        callLogId,
        reason: String(args.reason || 'Transfer requested by caller'),
        urgent: Boolean(args.urgent),
      })
      console.info('[vapi/transfer-routing]', {
        input: 'transfer_to_ramon',
        matchedName: null,
        matchedRole: null,
        matchedDepartment: null,
        transferExtension: null,
        transferPhone: null,
        found: true,
        prepared: true,
        transferred: true,
        error: null,
        call_log_id: callLogId,
      })
      console.info('[vapi/tool-handlers] transfer_to_ramon result', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        ok: Boolean(pt && typeof pt === 'object' && 'ok' in pt ? pt.ok : pt),
        call_log_id: callLogId,
      })
      return pt
    }
    case 'save_call_outcome':
      if (!args.phone && !context.phone) return missing(['phone'])
      return persistCallArtifacts({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        intent: typeof args.intent === 'string' ? args.intent : undefined,
        transcript: typeof args.transcript === 'string' ? args.transcript : undefined,
        summary: typeof args.summary === 'string' ? args.summary : undefined,
        outcome: typeof args.result === 'string' ? args.result : undefined,
        nextAction: typeof args.next_action === 'string' ? args.next_action : undefined,
        callbackRequired: Boolean(args.callback_required),
        followUpDate: typeof args.follow_up_date === 'string' ? args.follow_up_date : undefined,
        spamScore: typeof args.spam_score === 'number' ? args.spam_score : undefined,
        ended: true,
      })
    case 'mark_spam_call':
      if (!args.phone && !context.phone) return missing(['phone'])
      return runMarkSpamCall({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        reason: typeof args.reason === 'string' ? args.reason : undefined,
        spamScore: typeof args.spam_score === 'number' ? args.spam_score : undefined,
      })
    case 'create_follow_up': {
      console.log('[vapi/tool-call]', {
        callId: context.vapiCallId || null,
        toolName: 'create_follow_up',
        toolCallId: context.toolCallId || null,
        organization_id: context.organizationId,
        argKeys: Object.keys(args).slice(0, 32),
      })
      console.info('[vapi/tool-call] create_follow_up', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        title_preview: String(args.title ?? '').slice(0, 120),
        callback_required: Boolean(args.callback_required),
      })
      if (!args.title)
        return missing(
          ['title'],
          'Me falta un dato para registrar el seguimiento.',
        )
      const prep = prepareCommercialFollowUpFromArgs(args)

      let callLogId: string | undefined =
        typeof args.call_log_id === 'string' && args.call_log_id.trim()
          ? args.call_log_id.trim()
          : undefined
      if (!callLogId && context.vapiCallId) {
        callLogId =
          (await getCallLogIdByVapiCallId(context.organizationId, context.vapiCallId)) || undefined
      }

      try {
        const out = await persistFollowUp({
          organizationId: context.organizationId,
          callLogId,
          phone: typeof args.phone === 'string' ? args.phone : context.phone,
          customerId: typeof args.customer_id === 'string' ? args.customer_id : undefined,
          title: prep.title,
          notes: prep.notesMerged,
          owner: typeof args.owner === 'string' ? args.owner : undefined,
          dueAt: prep.dueAt,
          priority: prep.priority,
          callbackRequired: prep.callbackRequired,
        })
        const fu = out && typeof out === 'object' && 'follow_up' in out ? (out as { follow_up?: { id?: string } }).follow_up : null
        console.info('[vapi/follow-up]', {
          source: 'tool' as const,
          toolCallId: context.toolCallId || null,
          callId: context.vapiCallId || null,
          organization_id: context.organizationId,
          title: prep.title.slice(0, 120),
          category: prep.category,
          priority: prep.priority ?? null,
          due_at: prep.dueAt ?? null,
          callback_required: prep.callbackRequired,
          created: true,
          followUpId: fu?.id ?? null,
          table: 'follow_ups',
          error: null,
        })
        return out
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[vapi/follow-up]', {
          source: 'tool' as const,
          toolCallId: context.toolCallId || null,
          callId: context.vapiCallId || null,
          organization_id: context.organizationId,
          title: prep.title.slice(0, 120),
          category: prep.category,
          priority: prep.priority ?? null,
          due_at: prep.dueAt ?? null,
          callback_required: prep.callbackRequired,
          created: false,
          followUpId: null,
          table: 'follow_ups',
          error: msg.slice(0, 400),
        })
        return {
          ok: false as const,
          error: 'follow_up_failed' as const,
          primary_message_for_caller:
            'No pude registrar el seguimiento en el sistema. Podemos intentar de nuevo en un momento.',
        }
      }
    }
    default:
      console.warn('[vapi/tool-call] unknown_tool_no_handler', { toolName })
      return {
        ok: false as const,
        error: 'unknown_tool' as const,
        toolName,
      }
  }
}
