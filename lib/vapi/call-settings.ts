/**
 * Ajustes de llamada Vapi (duración, latencia de respuesta, silencio).
 * Override por env sin redeploy de lógica: VAPI_MAX_CALL_DURATION_SECONDS, etc.
 */

export const VAPI_MAX_CALL_DURATION_SECONDS = (() => {
  const n = Number(process.env.VAPI_MAX_CALL_DURATION_SECONDS)
  return Number.isFinite(n) && n >= 60 ? Math.floor(n) : 360
})()

export const VAPI_SILENCE_TIMEOUT_SECONDS = (() => {
  const n = Number(process.env.VAPI_SILENCE_TIMEOUT_SECONDS)
  return Number.isFinite(n) && n >= 10 ? Math.floor(n) : 25
})()

function startWaitSeconds(): number {
  const n = Number(process.env.VAPI_START_WAIT_SECONDS)
  if (Number.isFinite(n) && n >= 0 && n <= 2) return n
  return 0.25
}

/** Menor espera tras fin de frase del cliente → la voz responde antes. */
export function buildVapiSpeechPipelineConfig(): Record<string, unknown> {
  return {
    startSpeakingPlan: {
      waitSeconds: startWaitSeconds(),
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.1,
        onNoPunctuationSeconds: 1.0,
        onNumberSeconds: 0.4,
      },
    },
    stopSpeakingPlan: {
      numWords: 0,
      voiceSeconds: 0.2,
      backoffSeconds: 0.8,
    },
  }
}

export function buildVapiAssistantCallBehavior(): Record<string, unknown> {
  return {
    endCallFunctionEnabled: true,
    endCallMessage: 'Hasta luego, que tenga buen día.',
    maxDurationSeconds: VAPI_MAX_CALL_DURATION_SECONDS,
    silenceTimeoutSeconds: VAPI_SILENCE_TIMEOUT_SECONDS,
    ...buildVapiSpeechPipelineConfig(),
  }
}

/** Deepgram: endpointing más bajo = detecta fin de turno antes. */
export function enhanceTranscriberForLowLatency(
  transcriber: Record<string, unknown>,
): Record<string, unknown> {
  const provider = String(transcriber.provider || '').toLowerCase()
  if (provider !== 'deepgram') return transcriber
  const raw = Number(process.env.VAPI_DEEPGRAM_ENDPOINTING_MS)
  const endpointing = Number.isFinite(raw) && raw >= 100 && raw <= 2000 ? Math.floor(raw) : 250
  return { ...transcriber, endpointing }
}
