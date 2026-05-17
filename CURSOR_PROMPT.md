# CURSOR AGENT — SwatVoiceIA Full Task Brief

## ROL
Eres un senior full-stack engineer trabajando en el repo **SwatVoiceIA** (`swat-voiceia`).
Stack: Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind, Supabase (Postgres + Auth), Vapi, Twilio, Stripe (a implementar).

Carpeta raíz del proyecto: **la carpeta actual donde está este archivo**.

Antes de cualquier cambio:
1. Lee el archivo que vas a modificar completo.
2. Haz el cambio mínimo necesario — no reescribas lo que funciona.
3. Mantén el mismo estilo de código del archivo (imports, naming, error handling).
4. Si un cambio requiere una migración SQL, créala en `supabase/migrations/` con el número correcto.

---

## CONTEXTO DEL PROYECTO

Multi-tenant SaaS de recepcionista de voz con IA.
- Dos sistemas de auth: **CRM cliente** (Supabase Auth + cookie de sesión) y **Super Admin** (admin_credentials + HMAC cookie `admin_token`).
- Vapi maneja el asistente de voz; los webhooks llegan a `/api/vapi/events` y `/api/vapi/tools/*`.
- Twilio entrega las llamadas a Vapi.
- Notificaciones por Telegram.
- Dashboard cliente en `/dashboard`, panel super admin en `/admin`.

---

## TAREAS — EJECUTAR EN ORDEN

---

### TAREA 1 🔴 — Sacar IDs hardcodeados de `sync-assistant`

**Archivo**: `app/api/vapi/sync-assistant/route.ts`

**Problema**: líneas ~26–28 tienen valores reales hardcodeados en el código fuente:
```ts
const PRODUCTION_ORGANIZATION_ID = '9bb50e58-9ba6-4d54-8171-13922749f570'
const PRODUCTION_ASSISTANT_ID    = 'e9a5d0a4-44a5-4bf7-90df-35a5d50d181d'
const PRODUCTION_PHONE_NUMBER_ID = '56e9913c-4032-4356-98f0-3ac1f9713508'
const PRODUCTION_APP_BASE        = 'https://swatvoiceia.vercel.app'
```

**Fix**:
- Reemplazar con variables de entorno:
  ```ts
  const PRODUCTION_ORGANIZATION_ID = process.env.VAPI_PRODUCTION_ORG_ID || ''
  const PRODUCTION_ASSISTANT_ID    = process.env.VAPI_PRODUCTION_ASSISTANT_ID || ''
  const PRODUCTION_PHONE_NUMBER_ID = process.env.VAPI_PRODUCTION_PHONE_NUMBER_ID || ''
  const PRODUCTION_APP_BASE        = process.env.NEXT_PUBLIC_APP_URL || 'https://swatvoiceia.vercel.app'
  ```
- Agregar las mismas variables a `.env.example` con comentario explicativo.

**También**: `lib/vapi/vapi-org-resolution.ts` línea ~20 tiene un mapping `assistantId → orgId` hardcodeado. Moverlo a env o a la tabla `assistant_configs` que ya existe (tiene columna `vapi_assistant_id` en `organizations`). La resolución correcta ya está en la BD — eliminar el fallback hardcodeado o convertirlo en env var `VAPI_ASSISTANT_ORG_MAPPING` con formato `assistantId:orgId`.

---

### TAREA 2 🔴 — `VAPI_WEBHOOK_SECRET` obligatoria en producción

**Archivo**: `middleware.ts`

**Problema**: si `VAPI_WEBHOOK_SECRET` no está definida, el middleware omite el check y deja todas las APIs Vapi abiertas.

**Código actual** (~línea 20):
```ts
const vapiSecret = process.env.VAPI_WEBHOOK_SECRET?.trim()
if (vapiSecret && request.method === 'POST' && pathRequiresVapiWebhookSecret(pathname)) {
```

**Fix**: agregar un log de advertencia en desarrollo y en producción retornar 401 si el secret no está configurado:
```ts
const vapiSecret = process.env.VAPI_WEBHOOK_SECRET?.trim()
if (request.method === 'POST' && pathRequiresVapiWebhookSecret(pathname)) {
  if (!vapiSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
    }
    console.warn('[middleware] VAPI_WEBHOOK_SECRET not set — skipping check in dev')
  } else {
    const provided = readVapiSecretHeader(request)
    if (!timingSafeEqualUtf8(provided, vapiSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
}
```

---

### TAREA 3 🔴 — Proteger `/api/telegram/test`

**Archivo**: `app/api/telegram/test/route.ts`

**Problema**: endpoint abierto que permite a cualquiera enviar mensajes al bot de Telegram del negocio.

**Fix**: al inicio del handler GET, verificar `x-admin-secret` usando la función ya existente en `lib/admin/admin-secret-auth.ts`:
```ts
import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
// ...
export async function GET(req: Request) {
  if (!verifyXAdminSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // resto del código...
}
```

---

### TAREA 4 🟠 — Twilio Signature Validation

**Archivo**: `app/api/twilio/voice/incoming/route.ts`

**Problema**: cualquiera puede hacer POST a este endpoint y crear recados/llenar la BD. Twilio firma cada request con HMAC-SHA1.

**Fix**:
1. Instalar: `npm install twilio`
2. Al inicio del handler POST, validar la firma antes de leer el form:
```ts
import twilio from 'twilio'

// Dentro del POST, antes de await request.formData():
const authToken = process.env.TWILIO_AUTH_TOKEN
if (authToken) {
  const twilioSignature = request.headers.get('X-Twilio-Signature') || ''
  const url = process.env.NEXT_PUBLIC_APP_URL + '/api/twilio/voice/incoming' + (request.url.includes('?') ? '?' + request.url.split('?')[1] : '')
  // Para validar necesitamos el body como objeto — leer primero como text
  const bodyText = await request.text()
  const params: Record<string, string> = {}
  new URLSearchParams(bodyText).forEach((v, k) => { params[k] = v })
  const valid = twilio.validateRequest(authToken, twilioSignature, url, params)
  if (!valid) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  // Re-parsear params desde el objeto ya leído (no volver a leer el stream)
  // Adaptar el resto del handler para usar `params` en lugar de `request.formData()`
}
```
3. Si `TWILIO_AUTH_TOKEN` no está definida, solo logear un warning en dev (para no romper tests locales).

---

### TAREA 5 🟠 — Proteger Google Calendar endpoints

**Archivos**:
- `app/api/integrations/google-calendar/connect/route.ts`
- `app/api/integrations/google-calendar/callback/route.ts`
- `app/api/integrations/google-calendar/disconnect/route.ts`
- `app/api/integrations/google-calendar/status/route.ts`

**Problema**: ninguno verifica sesión de usuario.

**Fix**: en cada handler, al inicio, verificar sesión con `getDashboardOrganizationId()` de `lib/auth/dashboard-session.ts`. Si devuelve null, retornar 401. Usar el `organizationId` para filtrar datos de la integración.

---

### TAREA 6 🟠 — Mover migraciones 006–019 a `supabase/migrations/`

**Problema**: las migraciones críticas están en `scripts/` pero no en `supabase/migrations/`, por lo que `supabase db push` no las aplica.

**Archivos a mover/renombrar** (de `scripts/` a `supabase/migrations/`):
```
scripts/006_voice_platform_multitenant.sql      → supabase/migrations/006_voice_platform_multitenant.sql
scripts/007_runtime_config_tables.sql           → supabase/migrations/007_runtime_config_tables.sql
scripts/010_transfer_destinations.sql           → supabase/migrations/010_transfer_destinations.sql
scripts/011_organization_owner_credential_store.sql → supabase/migrations/011_organization_owner_credential_store.sql
scripts/015_team_members_allow_duplicate_phone.sql → supabase/migrations/015_team_members_allow_duplicate_phone.sql
scripts/016_assistant_configs_vapi_columns.sql  → supabase/migrations/016_assistant_configs_vapi_columns.sql
scripts/016_tenant_call_logs_customers_followups_rls.sql → supabase/migrations/016b_tenant_rls.sql
scripts/017_profiles_add_email.sql              → supabase/migrations/017_profiles_add_email.sql
scripts/018_phone_call_screening.sql            → supabase/migrations/018_phone_call_screening.sql
scripts/019_plan_b_vapi_raw_events.sql          → supabase/migrations/019_vapi_raw_events.sql
```

**IMPORTANTE**: no eliminar los archivos de `scripts/` — solo copiarlos. El número de archivo en `scripts/` es el mismo que en `migrations/`. Revisar que no haya conflictos con los scripts de seed (001–005 ya están).

---

### TAREA 7 🟠 — Implementar Stripe Billing completo

Esta es la tarea más grande. Implementar el sistema de pagos para los planes definidos en la landing.

#### 7a. Instalar dependencias
```bash
npm install stripe @stripe/stripe-js
```

#### 7b. Variables de entorno (agregar a `.env.example`)
```
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=        # price_xxx del plan Starter $149/mo
STRIPE_PRICE_PRO=             # price_xxx del plan Pro $299/mo
STRIPE_PRICE_ENTERPRISE=      # price_xxx del plan Enterprise $499/mo
STRIPE_PRICE_SETUP=           # price_xxx del setup fee $299 one-time
```

#### 7c. Migración SQL — crear en `supabase/migrations/021_subscriptions.sql`
```sql
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'trial',  -- 'trial' | 'starter' | 'pro' | 'enterprise'
  status text not null default 'trialing', -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  setup_fee_paid boolean not null default false,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "org members can view own subscription"
  on public.subscriptions for select
  using (organization_id in (
    select organization_id from public.profiles where id = auth.uid()
  ));

create index on public.subscriptions(organization_id);
create index on public.subscriptions(stripe_subscription_id);
create index on public.subscriptions(stripe_customer_id);
```

#### 7d. Lib: `lib/stripe/client.ts`
```ts
import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
})
```

#### 7e. API: `app/api/billing/checkout/route.ts`
Handler POST que:
1. Verifica sesión del usuario (`getDashboardOrganizationId`).
2. Recibe `{ plan: 'starter' | 'pro' | 'enterprise', include_setup: boolean }`.
3. Crea/recupera Stripe Customer para la organización.
4. Crea Stripe Checkout Session con:
   - El price del plan mensual
   - Si `include_setup: true`, agrega el precio del setup como line item adicional (one-time)
   - `trial_period_days: 14`
   - `success_url` y `cancel_url`
5. Retorna `{ url: session.url }`.

#### 7f. API: `app/api/billing/webhook/route.ts`
Handler POST con `export const config = { api: { bodyParser: false } }`:
1. Verifica Stripe webhook signature con `stripe.webhooks.constructEvent`.
2. Maneja eventos:
   - `checkout.session.completed` → crear/actualizar fila en `subscriptions`, marcar `setup_fee_paid` si aplica
   - `customer.subscription.updated` → actualizar `status`, `current_period_*`, `plan`
   - `customer.subscription.deleted` → actualizar `status = 'canceled'`
   - `invoice.payment_failed` → actualizar `status = 'past_due'`, opcional: notificar por Telegram
3. Siempre retornar `{ received: true }` con status 200 (Stripe necesita 200 para no reintentar).

#### 7g. API: `app/api/billing/portal/route.ts`
Handler POST que crea una Stripe Customer Portal Session para que el cliente maneje su suscripción.

#### 7h. Página: `app/dashboard/settings/billing/page.tsx`
Componente server que muestra:
- Plan actual y status
- Fecha de próximo cobro o fin del trial
- Botón "Manage Subscription" → llama a `/api/billing/portal`
- Si `status === 'trialing'`: contador de días restantes + CTA para activar plan

#### 7i. Middleware de suscripción
En `middleware.ts`, para rutas `/dashboard/*`, verificar que la organización tiene suscripción activa o en trial. Si está cancelada/expirada, redirigir a `/dashboard/settings/billing` con banner de advertencia.

---

### TAREA 8 🟡 — Rate limiting admin login persistente

**Archivo**: `app/api/admin/login/route.ts`

**Problema**: el `Map<string, LoginAttemptState>` en memoria se resetea en cada cold start de Vercel.

**Fix**: reemplazar el `Map` por una tabla Supabase `admin_login_attempts` o usar Vercel KV si está disponible.

Opción mínima sin KV: mover el rate limiting a la tabla `admin_credentials` misma, agregando columnas `failed_attempts int default 0`, `blocked_until timestamptz`. Usar `supabase.rpc('check_and_register_admin_attempt', {...})` — crear la función SQL en una migración.

Migración `supabase/migrations/022_admin_rate_limit.sql`:
```sql
alter table public.admin_credentials
  add column if not exists failed_attempts int not null default 0,
  add column if not exists blocked_until timestamptz;

create or replace function public.check_admin_rate_limit(p_username text, p_ip text)
returns jsonb language plpgsql security definer as $$
declare
  v_row record;
  v_key text := lower(trim(p_username)) || '|' || p_ip;
  v_window interval := interval '10 minutes';
  v_block interval := interval '15 minutes';
  v_max int := 5;
begin
  select * into v_row from public.admin_credentials
    where lower(trim(username)) = lower(trim(p_username)) and is_active = true limit 1;
  if not found then
    return jsonb_build_object('blocked', false);
  end if;
  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    return jsonb_build_object('blocked', true, 'blocked_until', v_row.blocked_until);
  end if;
  return jsonb_build_object('blocked', false);
end;
$$;
```

---

### TAREA 9 🟡 — Proteger endpoints legacy MVP

**Archivos**:
- `app/api/llamadas/route.ts`
- `app/api/recados/route.ts`
- `app/api/trabajos/search/route.ts`
- `app/api/bot/handle-intent/route.ts`

**Fix**: agregar al inicio de cada handler la verificación de `INTERNAL_API_KEY` usando la función ya existente:
```ts
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'
// ...
if (!isValidInternalApiKey(request)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

### TAREA 10 🟡 — Refactorizar `dispatcher.ts` (1473 líneas)

**Archivo**: `lib/vapi/dispatcher.ts`

**Objetivo**: dividir en módulos sin cambiar la interfaz pública (`dispatchVapiEvent`).

Estructura propuesta:
```
lib/vapi/
  dispatcher.ts              ← solo el switch principal y la función pública
  handlers/
    handle-end-of-call.ts   ← toda la lógica de end-of-call-report
    handle-tool-calls.ts    ← toda la lógica de tool-calls
    handle-assistant-request.ts  ← toda la lógica de assistant-request
    handle-status-update.ts ← status-update y transfer-update
```

Mantener la firma exacta: `export async function dispatchVapiEvent(input: {...}): Promise<...>`.

---

### TAREA 11 🟡 — `setup/seed-print-shop` — agregar guard de entorno

**Archivo**: `app/api/setup/seed-print-shop/route.ts`

Este endpoint borra y reinserta products/FAQs/team de una organización. Es peligroso en producción.

**Fix**: agregar al inicio:
```ts
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_ENDPOINTS !== 'true') {
  return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
}
```

---

## CHECKLIST FINAL (verificar después de cada tarea)

- [ ] `npm run build` pasa sin errores TypeScript
- [ ] `npm run lint` sin errores nuevos
- [ ] Ningún secret/UUID de producción hardcodeado en código (buscar con `grep -r "9bb50e58\|e9a5d0a4\|56e9913"`)
- [ ] Toda variable nueva agregada a `.env.example` con comentario
- [ ] Toda migración nueva en `supabase/migrations/` con número correlativo
- [ ] No se rompió la interfaz existente de `dispatchVapiEvent`, `getDashboardOrganizationId`, `createServiceRoleClient`

---

## NOTAS PARA CURSOR

- El proyecto usa **Next.js App Router**. Los route handlers son `async function GET/POST/DELETE(request: NextRequest)`. No usar `req.query` ni Pages Router patterns.
- Supabase service role client: siempre importar de `@/lib/supabase/service-role` — no crear instancias nuevas.
- Para auth de dashboard usar siempre `getDashboardOrganizationId()` de `@/lib/auth/dashboard-session`.
- Para comparar secrets usar siempre `timingSafeEqualUtf8` de `@/lib/security/timing-safe` — nunca `===`.
- Los errores de Supabase con `code: 'PGRST205'` significan tabla no existe — manejar gracefully como ya hace el resto del código.
- TypeScript estricto: no usar `any`, tipar todo explícitamente.
- El dispatcher retorna siempre un objeto JSON serializable — no lanzar excepciones al caller de Vapi, siempre capturar y retornar `{ error: 'internal_error' }`.
