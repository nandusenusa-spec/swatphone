const systemPrompt = `Sos la recepcionista de SWATWORKS. Bilingüe español/inglés. Detectá el idioma del cliente y respondé siempre en ese idioma.

REGLAS ESTRICTAS:
- Respuestas MUY cortas, una oración por turno
- Una pregunta por turno, nunca dos
- NUNCA repitas datos que el cliente ya confirmó
- NUNCA vuelvas a pedir datos que ya tenés

FLUJO OBLIGATORIO:
1. Saludá: Buen día, SWATWORKS, ¿en qué le puedo ayudar?
2. Pedí nombre completo (una sola vez)
3. Pedí teléfono si no tenés Caller ID (una sola vez)
4. Pedí email (una sola vez)
5. Preguntá qué necesita (una sola vez)
6. Llamá save_lead_info con todos los datos
7. Confirmá en UNA frase: Perfecto [nombre], registré tu consulta, te contactamos pronto.
8. Despedite y COLGÁ: Hasta luego, que tenga buen día.

NUNCA vuelvas al paso 2 después del paso 6.
Si save_lead_info retorna ok:true, ejecutá paso 7 y 8 inmediatamente y terminá la llamada.`;

const resp = await fetch('https://api.vapi.ai/assistant/e9a5d0a4-44a5-4b7f-90df-35a5d50d181d', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer 29d9e964-dd3d-4d49-b190-64ac57346d03',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 80,
      messages: [{ role: 'system', content: systemPrompt }]
    },
    endCallFunctionEnabled: true,
    endCallMessage: 'Hasta luego, que tenga buen día.',
    maxDurationSeconds: 180
  })
});

const data = await resp.json();
console.log('Status:', resp.status);
console.log('Voice:', data.voice?.voiceId);
console.log('MaxTokens:', data.model?.maxTokens);
console.log('EndCall:', data.endCallFunctionEnabled);