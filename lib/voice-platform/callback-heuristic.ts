/** Detecta promesas de contacto / presupuesto típicas en español (evita depender solo del LLM). */
export function textSuggestsPromisedCallback(text: string): boolean {
  const t = text.toLowerCase()
  if (t.length < 16) return false
  const hints = [
    '24 horas',
    '24hs',
    'veinticuatro horas',
    'te contact',
    'nos comunicamos',
    'nos pondremos en contacto',
    'te llamamos',
    'te llamaremos',
    'presupuesto',
    'cotiz',
    'miembro del equipo',
    'alguien del equipo',
    'equipo se comunic',
    'se comunicará',
    'se comunicara',
    'a la brevedad',
    'darán presupuesto',
    'daran presupuesto',
  ]
  return hints.some((h) => t.includes(h))
}
