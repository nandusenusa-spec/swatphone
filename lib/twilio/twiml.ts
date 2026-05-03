function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function voiceResponse(parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join('')}</Response>`
}

export function say(message: string, language = 'es-ES'): string {
  return `<Say language="${language}">${xmlEscape(message)}</Say>`
}

export function gather(opts: { action: string; input?: 'speech dtmf' | 'speech' | 'dtmf'; timeout?: number; numDigits?: number; say: string }): string {
  const input = opts.input || 'speech dtmf'
  const timeout = opts.timeout ?? 5
  const numDigitsAttr = opts.numDigits ? ` numDigits="${opts.numDigits}"` : ''
  return `<Gather input="${input}" timeout="${timeout}" action="${xmlEscape(opts.action)}" method="POST"${numDigitsAttr}>${say(opts.say)}</Gather>`
}

export function dial(number: string): string {
  return `<Dial>${xmlEscape(number)}</Dial>`
}
