import { normalizePhone } from '@/lib/phone'

export type TransferDestination = {
  extension: string
  name: string
  phoneE164: string
  /** Rol/cargo como en /dashboard/team (opcional). */
  role?: string
  department?: string
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

/** Internos numéricos equivalentes (90 vs 090). */
function canonicalExtensionDigits(ext: string): string {
  const t = (ext || '').trim()
  if (!/^\d+$/.test(t)) return t.toLowerCase()
  return String(parseInt(t, 10))
}

function findDestinationByExtension(
  destinations: TransferDestination[],
  extRaw: string,
): TransferDestination | undefined {
  const want = canonicalExtensionDigits(extRaw)
  return destinations.find((d) => canonicalExtensionDigits(d.extension || '') === want)
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
    const role =
      typeof o.role === 'string'
        ? o.role.trim()
        : typeof o.role_label === 'string'
          ? o.role_label.trim()
          : ''
    const department =
      typeof o.department === 'string'
        ? o.department.trim()
        : typeof o.dept === 'string'
          ? o.dept.trim()
          : ''
    if (!name || !phoneE164) continue
    out.push({
      extension,
      name,
      phoneE164,
      ...(role ? { role } : {}),
      ...(department ? { department } : {}),
    })
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

export function legacyPhone(runtime: RuntimeTransferSlice): string | null {
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
      console.info('[vapi/transfer-routing]', {
        input: null,
        matchedName: null,
        matchedRole: null,
        matchedDepartment: null,
        transferExtension: null,
        transferPhone: null,
        found: false,
        error: 'no_usable_destinations',
      })
      return null
    }
    const owner = runtime.transferPolicy.callbackDefaultOwner || 'Operador'
    console.info('[vapi/transfer-routing]', {
      input: null,
      matchedName: owner,
      matchedRole: null,
      matchedDepartment: null,
      transferExtension: null,
      transferPhone: legacy,
      found: true,
      error: null,
      path: 'legacy_no_destinations',
    })
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
    console.info('[vapi/transfer-routing]', {
      input: null,
      matchedName: d.name,
      matchedRole: d.role ?? null,
      matchedDepartment: d.department ?? null,
      transferExtension: d.extension || null,
      transferPhone: d.phoneE164.trim(),
      found: true,
      error: null,
      path: 'single_destination',
    })
    return {
      phoneE164: d.phoneE164.trim(),
      label: d.name,
      extension: d.extension || null,
    }
  }

  const ext = typeof input.extension === 'string' ? input.extension.trim() : ''

  const dept = typeof input.department === 'string' ? input.department.trim() : ''
  const cueExtra = typeof input.intentCue === 'string' ? input.intentCue.trim() : ''
  const nameBlob = [dept, cueExtra].filter(Boolean).join(' ').trim()

  const logRoute = (
    hit: ResolvedTransferTarget,
    meta: Record<string, unknown>,
    destMeta?: TransferDestination,
  ) => {
    console.info('[vapi/transfer-routing]', {
      input: nameBlob || ext || null,
      matchedName: destMeta?.name ?? hit.label,
      matchedRole: destMeta?.role ?? null,
      matchedDepartment: destMeta?.department ?? (dept || null),
      transferExtension: destMeta?.extension ?? hit.extension,
      transferPhone: hit.phoneE164,
      found: true,
      error: null as string | null,
      ...meta,
    })
  }

  if (ext) {
    const hit = findDestinationByExtension(destinations, ext)
    if (hit) {
      const res = {
        phoneE164: hit.phoneE164.trim(),
        label: hit.name,
        extension: hit.extension || null,
      }
      logRoute(res, { path: 'explicit_extension' }, hit)
      return res
    }
  }

  const inferredExt = nameBlob ? inferTransferExtensionFromKeywords(nameBlob) : null
  const effectiveExt = inferredExt || ''
  if (effectiveExt && (!ext || canonicalExtensionDigits(ext) !== canonicalExtensionDigits(effectiveExt))) {
    const hit = findDestinationByExtension(destinations, effectiveExt)
    if (hit) {
      const res = {
        phoneE164: hit.phoneE164.trim(),
        label: hit.name,
        extension: hit.extension || null,
      }
      logRoute(res, { path: 'keyword_extension', inferred_extension: effectiveExt }, hit)
      return res
    }
  }

  if (nameBlob) {
    const byName = matchDestinationByNameBlob(destinations, nameBlob)
    if (byName) {
      const destMeta = destinations.find(
        (d) => d.phoneE164.trim() === byName.phoneE164.trim() && d.name === byName.label,
      )
      logRoute(byName, { path: 'name_blob' }, destMeta)
      return byName
    }
  }

  const hadDisambiguation = Boolean(ext || nameBlob)

  if (destinations.length > 1 && !hadDisambiguation) {
    if (legacy) {
      const owner = runtime.transferPolicy.callbackDefaultOwner || 'Operador'
      const res = { phoneE164: legacy, label: owner, extension: null }
      console.info('[vapi/transfer-routing]', {
        input: null,
        matchedName: owner,
        matchedRole: null,
        matchedDepartment: null,
        transferExtension: null,
        transferPhone: legacy,
        found: true,
        error: null,
        path: 'legacy_multi_dest_default',
      })
      return res
    }
    const ownerName = (runtime.transferPolicy.callbackDefaultOwner || '').trim()
    if (ownerName) {
      const byOwner = matchDestinationByNameBlob(destinations, ownerName)
      if (byOwner) {
        const destMeta = destinations.find((d) => d.name === byOwner.label)
        logRoute(byOwner, { path: 'default_owner_multi_dest' }, destMeta)
        return byOwner
      }
    }
    const first = destinations[0]
    const res = {
      phoneE164: first.phoneE164.trim(),
      label: first.name,
      extension: first.extension || null,
    }
    console.info('[vapi/transfer-routing]', {
      input: null,
      matchedName: first.name,
      matchedRole: first.role ?? null,
      matchedDepartment: first.department ?? null,
      transferExtension: first.extension || null,
      transferPhone: first.phoneE164,
      found: true,
      error: null,
      path: 'first_destination_multi_default',
    })
    return res
  }

  if (legacy && !hadDisambiguation) {
    const owner = runtime.transferPolicy.callbackDefaultOwner || 'Operador'
    const res = { phoneE164: legacy, label: owner, extension: null }
    console.info('[vapi/transfer-routing]', {
      input: null,
      matchedName: owner,
      matchedRole: null,
      matchedDepartment: null,
      transferExtension: null,
      transferPhone: legacy,
      found: true,
      error: null,
      path: 'legacy_single_fallback',
    })
    return res
  }

  console.warn('[vapi/transfer-destinations] resolveTransferTarget: unresolved', {
    usable_count: destinations.length,
    had_extension: Boolean(ext),
    had_name_blob: Boolean(nameBlob),
    has_legacy: Boolean(legacy),
  })
  console.info('[vapi/transfer-routing]', {
    input: nameBlob || ext || null,
    matchedName: null,
    matchedRole: null,
    matchedDepartment: dept || null,
    transferExtension: null,
    transferPhone: null,
    found: false,
    error: 'unresolved',
  })
  return null
}

/** Expuesto para logs / tests. */
export { buildIntentCue, isPlausibleE164, usableDestinations }

export function transferDestinationsSummary(destinations: TransferDestination[]): string {
  if (destinations.length === 0) return ''
  return destinations
    .map((d) => {
      const roleBit = d.role || d.department
      const core = d.extension ? `interno ${d.extension} — ${d.name}` : d.name
      return roleBit ? `${core} (${roleBit})` : core
    })
    .join('; ')
}

/**
 * Mapeo por palabras clave (área/persona) → interno. Solo si ese interno existe en destinos activos.
 */
export function inferTransferExtensionFromKeywords(blob: string): string | null {
  const n = stripAccents(blob || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!n) return null
  if (/fernando/.test(n)) return '105'
  if (
    /dise[nñ]ador\s+gr[aá]fico/.test(n) ||
    /dise[nñ]o\s+gr[aá]fico/.test(n) ||
    /\bgraphic\s+design\b/.test(n) ||
    /\blogo(s)?\b/.test(n) ||
    /\bbranding\b/.test(n) ||
    /\bbrand\s+design\b/.test(n)
  ) return '90'
  if (/\bcnc\b/.test(n) || /\bleandro\b/.test(n)) return '107'
  if (/\brafael\b/.test(n)) return '106'
  if (/producci[oó]n/.test(n)) return '106'
  if (/\bram[oó]n\b|\bramon\b/.test(n)) return '100'
  if (/administraci[oó]n/.test(n)) return '91'
  if (/\bdise[nñ]ador\b/.test(n)) return '105'
  if (/\bdise[nñ]o\b/.test(n)) return '90'
  if (/\bdesign\b/.test(n) && !/graphic/.test(n)) return '90'
  return null
}
