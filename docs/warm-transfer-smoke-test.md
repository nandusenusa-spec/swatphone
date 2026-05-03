# Warm Transfer Smoke Test

Objetivo: validar el flujo completo de warm transfer con contexto dinámico y fallback.

## Precondiciones

- `organization_routing.allow_live_transfer = true`
- `organization_routing.ramon_transfer_number` o `default_transfer_number` cargado
- `organization_ai_config.allowed_tools` incluye:
  - `prepare_warm_transfer`
  - `transfer_to_ramon`
- `NEXT_PUBLIC_APP_URL` definido y accesible
- (Opcional) `VAPI_TRANSFER_HOLD_AUDIO_URL` configurado

## Caso A - Operador acepta (camino feliz)

1. Iniciar una llamada de prueba al número Vapi.
2. Pedir explícitamente hablar con operador/Ramon.
3. Verificar en logs de `tool-calls`:
   - primero se ejecuta `prepare_warm_transfer`
   - luego `transfer_to_ramon`
4. Verificar en DB (`call_logs`) que `structured_extraction.operator_handoff` tenga:
   - `customer_name`
   - `order_number`
   - `intent`
   - `short_summary`
   - `first_message`
5. Verificar evento `transfer-destination-request`:
   - respuesta incluye `transferPlan.mode = warm-transfer-experimental`
   - `transferAssistant.firstMessage` usa el contexto dinámico
6. Hacer que el operador acepte.
7. Confirmar `transfer-update` y `transfers.status = completed`.

## Caso B - Operador no responde/rechaza/voicemail

1. Repetir pasos 1-5.
2. Simular no respuesta, rechazo o voicemail.
3. Verificar:
   - `transferCancel` ejecutado por transfer assistant
   - finaliza con `endedReason` de warm transfer fallido/cancelado
   - se crea follow-up de callback (ver `follow_ups`/tabla equivalente)
   - el bot vuelve a ofrecer callback al cliente

## SQL de chequeo rápido

```sql
-- Últimos call logs con handoff
select id, vapi_call_id, phone, structured_extraction, updated_at
from call_logs
where structured_extraction ? 'operator_handoff'
order by updated_at desc
limit 10;

-- Últimos eventos de transferencia
select *
from transfers
order by created_at desc
limit 20;
```

## Criterios de aceptación

- Nunca hay copy hardcodeado del operador en Vapi Dashboard.
- El contexto del operador siempre viene desde la app (hoy en `operator_handoff`).
- Si falla la transferencia, se dispara callback/follow-up automáticamente.
