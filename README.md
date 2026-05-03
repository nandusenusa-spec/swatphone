# SWAT-VoiceIA - Sellable Voice Platform MVP

Plataforma de atención telefónica inteligente con:

- `Next.js App Router` como backend/API
- `Supabase` como fuente de verdad multi-tenant
- `Vapi` como canal principal de voz
- `Twilio` para flujo telefónico MVP/base

Objetivo: resolver llamadas, filtrar spam/invalid, registrar todo y dejar próxima acción.

## 1) Estructura de módulos

```text
app/
  api/
    health/route.ts
    trabajos/search/route.ts
    recados/route.ts
    llamadas/route.ts
    bot/handle-intent/route.ts
    twilio/
      voice/
        incoming/route.ts
        status/route.ts
    vapi/
      events/route.ts
      tools/
        find-customer/route.ts
        get-job-status/route.ts
        create-appointment/route.ts
        create-work-order/route.ts
        get-price-quote/route.ts
        transfer-to-ramon/route.ts
        save-call-outcome/route.ts
        mark-spam-call/route.ts
        create-follow-up/route.ts

lib/
  schemas/
    vapi.ts
  vapi/
    dispatcher.ts
    runtime-config.ts
    tool-handlers.ts
    classification.ts
    transfer.ts
    persistence.ts
    prompts.ts
  supabase/
    service-role.ts
  mvp/
    intents.ts
    repository.ts
  twilio/
    twiml.ts
  voice-platform/
    types.ts
    validation.ts
    classifier.ts
    repository.ts
    service.ts

scripts/
  005_mvp_print_bot.sql
  006_voice_platform_multitenant.sql
  007_runtime_config_tables.sql
```

## 2) SQL / migraciones

### Orden mínimo recomendado (producción)

Partí siempre de un esquema con `organizations` (por ejemplo `scripts/001-create-tables.sql` si la base está vacía). Luego:

1. `scripts/005_mvp_print_bot.sql` — opcional (MVP imprenta / `trabajos`)
2. `scripts/006_voice_platform_multitenant.sql` — dominio voz multi-tenant (`customers`, `call_logs`, `organization_voice_settings`, etc.)
3. `scripts/007_runtime_config_tables.sql` — **obligatorio para el asistente**: `organization_ai_config`, `organization_routing`, `organization_catalog`, `organization_business_hours`
4. `scripts/008_seed_voice_platform_demo_org.sql` — opcional; alinea columnas que el código espera sobre 006/007 y carga org demo `11111111-…` (útil para E2E y `npm run verify:runtime-config`)
5. `scripts/010_transfer_destinations.sql` — columna `transfer_destinations` en `organization_routing` (idempotente; también puede venir en migraciones posteriores)
6. `scripts/016_assistant_configs_vapi_columns.sql` — columnas extra de `assistant_configs` si el Admin falla al guardar
7. `scripts/016_tenant_call_logs_customers_followups_rls.sql` — políticas RLS para que el dashboard con usuario vea datos de su tenant

Migraciones ad hoc (`012_*`, `014_*`, etc.) son para entornos ya existentes: revisá el comentario al inicio de cada archivo antes de ejecutarlas.

**Alternativa “bootstrap mínimo”:** `scripts/009_bootstrap_voice_platform_minimal.sql` define un subconjunto compacto; no mezclar ciegamente 009 con 006/007 sin revisar duplicados de tablas.

### Tablas clave nuevas

- `customers`
- `price_catalog`
- `work_orders`
- `appointments`
- `call_logs`
- `call_classifications`
- `follow_ups`
- `transfers`
- `notifications`
- `organization_voice_settings`

Todas incluyen `organization_id` para venta SaaS multi-tenant.

## 3) Endpoints Tools para Vapi

Todos esperan `organization_id`:

- `POST /api/vapi/tools/find-customer`
- `POST /api/vapi/tools/get-job-status`
- `POST /api/vapi/tools/create-appointment`
- `POST /api/vapi/tools/create-work-order`
- `POST /api/vapi/tools/get-price-quote`
- `POST /api/vapi/tools/transfer-to-ramon`
- `POST /api/vapi/tools/save-call-outcome`
- `POST /api/vapi/tools/mark-spam-call`
- `POST /api/vapi/tools/create-follow-up`

## 4) Endpoint único de eventos Vapi

- `POST /api/vapi/events`

Resuelve:
- `assistant-request`
- `tool-calls`
- `transfer-destination-request`
- `call-ended / transcript / summary`

Y registra:
- `call started` / in-progress
- transcript incremental
- summary
- tool calls
- `call ended`
- disposition final

Además aplica validación mínima y puede marcar spam/invalid sin escalar.

## Runtime config por organización

Toda la lógica vive en DB (no en Vapi):

- `organization_ai_config`
- `organization_routing`
- `organization_catalog`
- `organization_business_hours`

Servicio:
- `getOrganizationRuntimeConfig(organizationId)` en `lib/vapi/runtime-config.ts`

Retorna:
- prompt
- tools habilitadas
- reglas de spam
- horarios
- política de transferencia
- catálogo de precios
- mensaje de bienvenida

## 5) Anti-spam y clasificación

Implementado en:
- `lib/voice-platform/classifier.ts`
- `lib/voice-platform/service.ts` (`shouldRejectByValidation`)

Clasificaciones:
- `trusted_customer`
- `lead`
- `existing_job`
- `spam`
- `invalid`
- `urgent`
- `transfer_candidate`

Regla crítica: si falla validación mínima 2 veces -> `spam_or_invalid` y cortar flujo caro.

## 6) Persistencia de transcript, summary, follow-up

`runSaveCallOutcome` persiste en `call_logs`:
- intent
- call_type
- validation_status
- transcript
- summary
- structured_extraction
- result
- owner
- follow_up_date
- transfer flags
- spam_score
- next_action

`runCreateFollowUp` crea `follow_ups` + `notifications`.

## 7) Transferencia a Ramon

`runTransferToRamon` resuelve el destino en este orden:

1. `organization_routing` vía `getOrganizationRuntimeConfig`: si `urgent`, `urgent_transfer_number`; si no, `ramon_transfer_number`, `default_transfer_number`, o el primer `transfer_destinations[].phone_e164`
2. `organization_voice_settings.transfer_target_phone` (tabla de 006; compatibilidad)
3. variable de entorno `TWILIO_FORWARD_NUMBER`

El nombre mostrado prioriza `organization_voice_settings.transfer_target_name` y si no hay, `callback_default_owner` o el nombre del primer destino configurado.

Si no hay teléfono:

- crea callback prioritario (`follow_ups`)
- crea notificación

## 8) Variables de entorno

Copiar `.env.example` -> `.env.local` y completar:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_API_KEY`
- `VAPI_WEBHOOK_SECRET`
- `ADMIN_TOKEN_SECRET`
- `TWILIO_FORWARD_NUMBER` (opcional)

## 9) Ejemplos payload Vapi tools

### find_customer

```json
{
  "organization_id": "ORG_UUID",
  "phone": "+15551234567",
  "name": "Juan"
}
```

### get_job_status

**Vapi (dashboard / tool con Server URL):** usá `POST https://<tu-dominio>/api/vapi/tools/get-job-status`. Vapi envía el cuerpo `tool-calls` y espera `{ "results": [ { "toolCallId", "name", "result" } ] }` (este endpoint lo soporta). Si en Vercel tenés `VAPI_WEBHOOK_SECRET`, configurá la misma credencial en Vapi para el header **`X-Vapi-Secret`** ([docs](https://docs.vapi.ai/server-url/server-authentication)). **No** uses `Authorization` ni `INTERNAL_API_KEY` en este tool.

**cURL / integraciones (JSON plano):**

```json
{
  "organization_id": "ORG_UUID",
  "phone": "+15551234567"
}
```

Opcional: `job_number` en lugar de `phone` si el cliente da número de orden.

### save_call_outcome

```json
{
  "organization_id": "ORG_UUID",
  "vapi_call_id": "call_abc123",
  "phone": "+15551234567",
  "intent": "estado_trabajo",
  "validation_status": "validated",
  "summary": "Cliente consulta estado de trabajo WO-12345",
  "result": "resolved",
  "next_action": "Sin seguimiento requerido",
  "structured_extraction": {
    "customer_name": "Juan",
    "intent": "estado_trabajo",
    "job_number": "WO-12345",
    "follow_up_required": false
  }
}
```

## 10) Checklist deploy

- [ ] Migraciones aplicadas según §2 (como mínimo **006 + 007**; **008** recomendado para demo/E2E)
- [ ] `.env` / secrets configurados en el entorno (ver §8)
- [ ] Por organización: filas en `organization_routing` (números y/o `transfer_destinations`) y/o `organization_voice_settings` con teléfono de transferencia
- [ ] Catálogo: `organization_catalog` y/o `price_catalog` y/o `products` según cómo cotice el negocio
- [ ] Vapi tools apuntando a `POST /api/vapi/tools/*` (URL pública HTTPS)
- [ ] Vapi server URL / events apuntando a `POST /api/vapi/events` (o la ruta de webhook que uses en este proyecto)
- [ ] `npm run build` OK en CI o local antes de publicar
- [ ] Smoke tests:
  - [ ] `GET /api/health` (o ruta `health` que expongas)
  - [ ] `find-customer`
  - [ ] `get-job-status`
  - [ ] `save-call-outcome`
  - [ ] `mark-spam-call`
