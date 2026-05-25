/** true = warm-transfer-experimental (solo Twilio/Vapi number). Por defecto blind (más fiable). */
export function useWarmTransferExperimental(): boolean {
  return process.env.VAPI_TRANSFER_WARM?.trim().toLowerCase() === 'true'
}
