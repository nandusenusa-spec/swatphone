import {
  buildCommercialMetaBlock,
  classificationSourceText,
  defaultFollowUpDueIsoTomorrow,
  detectWrapIntent,
  parseModelLeadClassification,
  prependCommercialBlockToNotes,
} from '@/lib/vapi/lead-classification'

export type FollowUpPriority = 'low' | 'normal' | 'high' | 'urgent'

export function prepareCommercialFollowUpFromArgs(args: Record<string, unknown>): {
  title: string
  notesMerged: string | undefined
  dueAt: string | undefined
  priority: FollowUpPriority | undefined
  callbackRequired: boolean
  isWrap: boolean
  category: string | null
} {
  const titleStr = String(args.title || '').trim() || 'Follow-up'
  const rawNotes = typeof args.notes === 'string' ? args.notes.trim() : ''
  const catArg = typeof args.category === 'string' ? args.category.trim() : ''
  const sniffText = classificationSourceText([titleStr, rawNotes, catArg])
  const isWrap = catArg === 'wrap' || detectWrapIntent(sniffText)

  const commercial = parseModelLeadClassification({
    ...args,
    category: catArg || (isWrap ? 'wrap' : args.category),
    priority: args.priority || (isWrap ? 'high' : undefined),
    callback_required: args.callback_required === true || isWrap,
  })

  const metaBlock = buildCommercialMetaBlock({
    ...commercial,
    category: commercial.category || (isWrap ? 'wrap' : undefined),
    callback_required: commercial.callback_required || isWrap,
  })
  const notesMerged = prependCommercialBlockToNotes(metaBlock, rawNotes || undefined) || undefined

  const priorityRaw =
    args.priority === 'low' ||
    args.priority === 'normal' ||
    args.priority === 'high' ||
    args.priority === 'urgent'
      ? args.priority
      : isWrap
        ? 'high'
        : undefined

  let dueAt = typeof args.due_at === 'string' && args.due_at.trim() ? args.due_at.trim() : undefined
  if (!dueAt && isWrap) dueAt = defaultFollowUpDueIsoTomorrow()

  return {
    title: titleStr,
    notesMerged,
    dueAt,
    priority: priorityRaw,
    callbackRequired: Boolean(args.callback_required) || isWrap,
    isWrap,
    category: commercial.category || (isWrap ? 'wrap' : null),
  }
}
