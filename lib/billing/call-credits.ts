import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyLowCallBalanceTelegram } from '@/lib/notifications/telegram'

const DEFAULT_MARGIN_USD = 0.1
const DEFAULT_LOW_THRESHOLD_USD = 10
const DEFAULT_FALLBACK_PER_MINUTE_USD = 0.25

function parseUsdEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function getCallCreditMarginUsd(): number {
  return parseUsdEnv('CALL_CREDIT_MARGIN_USD', DEFAULT_MARGIN_USD)
}

export function getCallCreditFallbackPerMinuteUsd(): number {
  return parseUsdEnv('CALL_CREDIT_FALLBACK_PER_MINUTE_USD', DEFAULT_FALLBACK_PER_MINUTE_USD)
}

export function computeCallChargeUsd(input: {
  vapiCostUsd: number | null | undefined
  durationSeconds: number | null | undefined
}): { vapiCostUsd: number; marginUsd: number; totalUsd: number } {
  const marginUsd = getCallCreditMarginUsd()
  let vapiCostUsd =
    typeof input.vapiCostUsd === 'number' && Number.isFinite(input.vapiCostUsd) && input.vapiCostUsd >= 0
      ? input.vapiCostUsd
      : null

  if (vapiCostUsd === null) {
    const sec =
      typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
        ? input.durationSeconds
        : 0
    const minutes = sec > 0 ? sec / 60 : 1
    vapiCostUsd = Math.round(minutes * getCallCreditFallbackPerMinuteUsd() * 10000) / 10000
  }

  const totalUsd = Math.round((vapiCostUsd + marginUsd) * 10000) / 10000
  return { vapiCostUsd, marginUsd, totalUsd }
}

type WalletRow = {
  organization_id: string
  balance_usd: number | string
  low_balance_threshold_usd: number | string
  last_low_balance_alert_at: string | null
}

function num(v: number | string | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = (err.message || '').toLowerCase()
  return m.includes('organization_call_wallet') || m.includes('organization_call_credit_ledger')
}

export async function ensureCallWallet(organizationId: string): Promise<WalletRow | null> {
  const supabase = createServiceRoleClient()
  const { data: existing, error: readErr } = await supabase
    .from('organization_call_wallets')
    .select('organization_id, balance_usd, low_balance_threshold_usd, last_low_balance_alert_at')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (readErr) {
    if (isMissingTableError(readErr)) {
      console.warn('[call-credits] wallet table missing — run migration 026')
      return null
    }
    throw readErr
  }
  if (existing) return existing as WalletRow

  const { data: created, error: insErr } = await supabase
    .from('organization_call_wallets')
    .insert({
      organization_id: organizationId,
      balance_usd: 0,
      low_balance_threshold_usd: DEFAULT_LOW_THRESHOLD_USD,
    })
    .select('organization_id, balance_usd, low_balance_threshold_usd, last_low_balance_alert_at')
    .single()

  if (insErr) {
    if (isMissingTableError(insErr)) return null
    throw insErr
  }
  return created as WalletRow
}

export type CallCreditSummary = {
  available: boolean
  balanceUsd: number
  thresholdUsd: number
  marginUsd: number
  usedThisMonthUsd: number
  isLow: boolean
  estimatedMinutesLeft: number | null
}

export async function getOrganizationCallCreditSummary(organizationId: string): Promise<CallCreditSummary> {
  const marginUsd = getCallCreditMarginUsd()
  const wallet = await ensureCallWallet(organizationId)
  if (!wallet) {
    return {
      available: false,
      balanceUsd: 0,
      thresholdUsd: DEFAULT_LOW_THRESHOLD_USD,
      marginUsd,
      usedThisMonthUsd: 0,
      isLow: false,
      estimatedMinutesLeft: null,
    }
  }

  const supabase = createServiceRoleClient()
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from('organization_call_credit_ledger')
    .select('amount_usd, vapi_cost_usd, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', startOfMonth.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (ledgerErr && !isMissingTableError(ledgerErr)) throw ledgerErr

  const debits = (ledgerRows || []).filter((r) => num(r.amount_usd) < 0)
  const usedThisMonthUsd = debits.reduce((sum, r) => sum + Math.abs(num(r.amount_usd)), 0)

  const balanceUsd = num(wallet.balance_usd)
  const thresholdUsd = num(wallet.low_balance_threshold_usd) || DEFAULT_LOW_THRESHOLD_USD
  const avgVapi =
    debits.length > 0
      ? debits.reduce((s, r) => s + Math.max(0, num(r.vapi_cost_usd)), 0) / debits.length
      : getCallCreditFallbackPerMinuteUsd()
  const avgPerCall = avgVapi + marginUsd
  const estimatedMinutesLeft =
    avgPerCall > 0 && balanceUsd > 0
      ? Math.floor((balanceUsd / getCallCreditFallbackPerMinuteUsd()) * 10) / 10
      : balanceUsd > 0
        ? null
        : 0

  return {
    available: true,
    balanceUsd,
    thresholdUsd,
    marginUsd,
    usedThisMonthUsd: Math.round(usedThisMonthUsd * 100) / 100,
    isLow: balanceUsd <= thresholdUsd,
    estimatedMinutesLeft,
  }
}

export async function setOrganizationCallCreditBalance(input: {
  organizationId: string
  balanceUsd: number
  lowBalanceThresholdUsd?: number
}): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(input.balanceUsd) || input.balanceUsd < 0) {
    return { ok: false, error: 'balance_usd_invalid' }
  }
  const wallet = await ensureCallWallet(input.organizationId)
  if (!wallet) return { ok: false, error: 'wallet_table_missing' }

  const supabase = createServiceRoleClient()
  const patch: Record<string, unknown> = {
    balance_usd: Math.round(input.balanceUsd * 10000) / 10000,
    last_low_balance_alert_at: null,
  }
  if (
    typeof input.lowBalanceThresholdUsd === 'number' &&
    Number.isFinite(input.lowBalanceThresholdUsd) &&
    input.lowBalanceThresholdUsd > 0
  ) {
    patch.low_balance_threshold_usd = input.lowBalanceThresholdUsd
  }

  const { error } = await supabase
    .from('organization_call_wallets')
    .update(patch)
    .eq('organization_id', input.organizationId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

const LOW_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function debitCallCreditForEndedCall(input: {
  organizationId: string
  callLogId?: string | null
  vapiCallId?: string | null
  vapiCostUsd?: number | null
  durationSeconds?: number | null
  organizationDisplayName?: string | null
}): Promise<{ charged: boolean; totalUsd?: number; balanceAfterUsd?: number; skipped?: string }> {
  const wallet = await ensureCallWallet(input.organizationId)
  if (!wallet) return { charged: false, skipped: 'wallet_unavailable' }

  const vapiCallId = (input.vapiCallId || '').trim()
  const supabase = createServiceRoleClient()

  if (vapiCallId) {
    const { data: prior } = await supabase
      .from('organization_call_credit_ledger')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('vapi_call_id', vapiCallId)
      .maybeSingle()
    if (prior?.id) return { charged: false, skipped: 'already_charged' }
  }

  const { vapiCostUsd, marginUsd, totalUsd } = computeCallChargeUsd({
    vapiCostUsd: input.vapiCostUsd,
    durationSeconds: input.durationSeconds,
  })

  const balanceBefore = num(wallet.balance_usd)
  const balanceAfter = Math.max(0, Math.round((balanceBefore - totalUsd) * 10000) / 10000)

  const { error: walletErr } = await supabase
    .from('organization_call_wallets')
    .update({ balance_usd: balanceAfter })
    .eq('organization_id', input.organizationId)

  if (walletErr) {
    console.error('[call-credits] wallet_update_failed', walletErr.message)
    return { charged: false, skipped: 'wallet_update_failed' }
  }

  const { error: ledgerErr } = await supabase.from('organization_call_credit_ledger').insert({
    organization_id: input.organizationId,
    call_log_id: input.callLogId || null,
    vapi_call_id: vapiCallId || null,
    amount_usd: -totalUsd,
    vapi_cost_usd: vapiCostUsd,
    margin_usd: marginUsd,
    balance_after_usd: balanceAfter,
    note: 'call_ended',
  })

  if (ledgerErr) {
    console.error('[call-credits] ledger_insert_failed', ledgerErr.message)
    await supabase
      .from('organization_call_wallets')
      .update({ balance_usd: balanceBefore })
      .eq('organization_id', input.organizationId)
    return { charged: false, skipped: 'ledger_insert_failed' }
  }

  const threshold = num(wallet.low_balance_threshold_usd) || DEFAULT_LOW_THRESHOLD_USD
  if (balanceAfter <= threshold) {
    const lastAlert = wallet.last_low_balance_alert_at
      ? new Date(wallet.last_low_balance_alert_at).getTime()
      : 0
    const cooldownOk = !lastAlert || Date.now() - lastAlert >= LOW_ALERT_COOLDOWN_MS
    if (cooldownOk) {
      const sent = await notifyLowCallBalanceTelegram({
        organizationId: input.organizationId,
        organizationName: input.organizationDisplayName || 'Cliente',
        balanceUsd: balanceAfter,
        thresholdUsd: threshold,
        lastChargeUsd: totalUsd,
      }).catch(() => false)
      if (sent) {
        await supabase
          .from('organization_call_wallets')
          .update({ last_low_balance_alert_at: new Date().toISOString() })
          .eq('organization_id', input.organizationId)
      }
    }
  }

  console.info('[call-credits] debited', {
    organization_id: input.organizationId,
    vapi_call_id: vapiCallId || null,
    total_usd: totalUsd,
    vapi_cost_usd: vapiCostUsd,
    margin_usd: marginUsd,
    balance_after_usd: balanceAfter,
  })

  return { charged: true, totalUsd, balanceAfterUsd: balanceAfter }
}
