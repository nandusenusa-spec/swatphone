import { normalizePhone } from '@/lib/phone'

export type TransferDestination = {
  extension: string
  name: string
  phoneE164: string
}

/** Slice mínimo de runtime para resolver destino (evita ciclo con runtime-config). */
export type RuntimeTransferSlice = {
  transferPolicy: {
    transferDestinations: TransferDestination[]
    urgentTransferNumber: string | null
    ramonTransferNumber: string | null
    defaultTransferNumber: string | null
    callbackDefaultOwner: string | null
  }
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function normKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

export function parseTransferDestinations(raw: unknown): TransferDestination[] {
  if (!Array.isArray(raw)) return []
  const out: TransferDestination[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const extension =
      typeof o.extension === 'string'
        ? o.extension.trim()
        : typeof o.internal === 'string'
          ? o.internal.trim()
          : ''
    const name =
      typeof o.name === 'string'
        ? o.name.trim()
        : typeof o.label === 'string'
          ? o.label.trim()
          : ''
    const phoneE164 =
      typeof o.phone_e164 === 'string'
        ? o.phone_e164.trim()
        : typeof o.phoneE164 === 'string'
          ? o.phoneE164.trim()
          : typeof o.phone === 'string'
            ? o.phone.trim()
            : ''
    if (!name || !phoneE164) continue
    out.push({ extension, name, phoneE164 })
  }
  return out
}

export type ResolvedTransferTarget = {
  phoneE164: string
  label: string
  extension: string | null
}

/** E.164 mínimo para transfer (Vapi/Twilio). */
function isPlausibleE164(s: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test((s || '').trim())
}

function usableDestinations(list: TransferDestination[]): TransferDestination[] {
  return list
    .map((d) => {
      const normalized = normalizePhone(d.phoneE164)
      return {
        ...d,
        phoneE164: normalized || d.phoneE164.trim(),
      }
    })
    .filter((d) => d.name.trim().length > 0 && isPlausibleE164(d.phoneE164))
}

function legacyPhone(runtime: RuntimeTransferSlice): string | null {
  const p = runtime.transferPolicy
  const raw = p.urgentTransferNumber || p.ramonTransferNumber || p.defaultTransferNumber || null
  if (!raw?.trim()) return null
  const norm = normalizePhone(raw)
  if (!norm || !isPlausibleE164(norm)) return null
  return norm
}

function matchDestinationByNameBlob(
  destinations: TransferDestination[],
  blob: string,
): ResolvedTransferTarget | null {
  const n = normKey(blob)
  if (!n) return null

  const exact = destinations.find((d) => normKey(d.name) === n)
  if (exact) {
    return { phoneE164: exact.phoneE164.trim(), label: exact.name, extension: exact.extension || null }
  }
  const partial = destinations.find((d) => {
    const dn = normKey(d.name)
    return dn.includes(n) || n.includes(dn)
  })
  if (partial) {
    return { phoneE164: partial.phoneE164.trim(), label: partial.name, extension: partial.extension || null }
  }
  const wordHit = destinations.find((d) => {
    const words = normKey(d.name).split(/\s+/)
    return words.some((w) => w.length > 2 && (n.includes(w) || w.includes(n)))
  })
  if (wordHit) {
    return { phoneE164: wordHit.phoneE164.trim(), label: wordHit.name, extension: wordHit.extension || null }
  }
  return null
}

function buildIntentCue(
  department: string | null | undefined,
  intent: string | null | undefined,
  shortSummary: string | null | undefined,
): string {
  const parts = [
    typeof department === 'string' ? department : '',
    typeof intent === 'string' ? intent : '',
    typeof shortSummary === 'string' ? shortSummary : '',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.join(' ').trim()
}

/** Encuentra destino por interno o por nombre/área (lo que dijo el cliente). */
export function resolveTransferTarget(
  runtime: RuntimeTransferSlice,
  input: {
    extension?: string | null
    department?: string | null
    /** Texto libre (p. ej. intent + resumen) para resolver “Ramon” sin depender solo de transfer_department. */
    intentCue?: string | null
  },
): ResolvedTransferTarget | null {
  const rawList = runtime.transferPolicy.transferDestinations || []
  const destinations = usableDestinations(rawList)
  const legacy = legacyPhone(runtime)
  const dropped = rawList.length - destinations.length

  if (destinations.length === 0) {
    if (!legacy) {
      console.warn('[vapi/transfer-destinations] resolveTransferTarget: no_usable_destinations_no_legacy', {
        raw_count: rawList.length,
        dropped_invalid_e164_or_name: dropped,
      })
      return null
    }
    const owner = runtime.transferPolicy.callbackDefaultOwner || 'Operador'
    return { phoneE164: legacy, label: owner, extension: null }
  }

  if (destinations.length === 1) {
    const d = destinations[0]
    if (dropped > 0) {
      console.warn('[vapi/transfer-destinations] resolveTransferTarget: single_usable_after_filter', {
        used_label: d.name,
        dropped_invalid_e164_or_name: dropped,
      })
    }
    return {
      phoneE164: d.phoneE164.trim(),
      label: d.name,
      extension: d.extension || null,
    }
  }

  const ext = typeof input.extension === 'string' ? input.extension.trim() : ''

  if (ext) {
    const hit = destinations.find((d) => d.extension === ext)
    if (hit) {
      return {
        phoneE164: hit.phoneE164.trim(),
        label: hit.name,
        extension: hit.extension || null,
      }
    }
  }

  const dept = typeof input.department === 'string' ? input.department.trim() : ''
  const cueExtra = typeof input.intentCue === 'string' ? input.intentCue.trim() : ''
  const nameBlob = [dept, cueExtra].filter(Boolean).join(' ').trim()

  if (nameBlob) {
    const byName = matchDestinationByNameBlob(destinations, nameBlob)
    if (byName) return byName
  }

  const hadDisambiguation = Boolean(ext || nameBlob)

  if (legacy && !hadDisambiguation) {
    const owner = runtime.transferPolicy.callbackDefaultOwner || 'Operador'
    return { phoneE164: legacy, label: owner, extension: null }
  }

  if (destinations.length > 1 && !legacy && !hadDisambiguation) {
    const d0 = destinations[0]
    console.warn('[vapi/transfer-destinations] resolveTransferTarget: no legacy/disambiguation; using first usable destination', {
      default_label: d0.name,
    })
    return {
      phoneE164: d0.phoneE164.trim(),
      label: d0.name,
      extension: d0.extension || null,
    }
  }

  console.warn('[vapi/transfer-destinations] resolveTransferTarget: unresolved', {
    usable_count: destinations.length,
    had_extension: Boolean(ext),
    had_name_blob: Boolean(nameBlob),
    has_legacy: Boolean(legacy),
  })
  return null
}

/** Expuesto para logs / tests. */
export { buildIntentCue, isPlausibleE164, usableDestinations }

export function transferDestinationsSummary(destinations: TransferDestination[]): string {
  if (destinations.length === 0) return ''
  return destinations
    .map((d) =>
      d.extension
        ? `interno ${d.extension} — ${d.name}`
        : d.name,
    )
    .join('; ')
}
