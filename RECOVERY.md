# Recovery Plan — SWAT-VoiceIA

## Objetivo

Recuperar la aplicación si el proyecto Supabase principal falla, se elimina o pierdes acceso: nueva instancia, datos restaurados y/o modo demo operativo.

Este proyecto usa **Next.js** y un modelo **organizations + profiles** (no “workspaces”). El esquema canónico está en `scripts/000_rebuild_supabase_schema.sql` y parches `scripts/00x_*.sql`.

## Estructura relevante

| Ruta | Rol |
|------|-----|
| `scripts/000_rebuild_supabase_schema.sql` | DDL principal |
| `scripts/999_demo_full_rebuild.sql` | Variante demo/rebuild |
| `scripts/001_seed_swatworks.sql` … `011_*.sql` | Seeds y parches |
| `supabase/migrations/001_initial_schema.sql` | DDL + índices + triggers (sync con `000` hasta COMMIT) |
| `supabase/migrations/002_rls_policies.sql` | RLS mínimo tenant (`call_logs`, `customers`, `follow_ups`) |
| `supabase/migrations/003_indexes.sql` | Placeholder para índices nuevos post-baseline |
| `supabase/seed.sql` | Puntero documentado a seeds reales |
| `scripts/backup-db.sh` | Backup schema + data |
| `scripts/restore-db.sh` | Restore vía `psql` |
| `backups/` | Artefactos locales **no** versionados (salvo `.gitkeep`) |
| `.env.local` | Variables locales (no commitear) |
| `.env.backup.example` | Plantilla proyecto backup |

## Checklist antes de una demo crítica

1. Probar la app contra Supabase principal (`npm run dev`, login CRM y/o admin).
2. Ejecutar `npm run check:supabase-schema` con service role configurado.
3. Ejecutar backup manual ver [Cómo hacer backup](#cómo-hacer-backup).
4. Confirmar que existen archivos nuevos en `backups/` **fuera** del repo o en almacenamiento seguro.
5. Si usás demo sin Auth: documentar `DEMO_BYPASS_AUTH=true` y org fija en código (`lib/auth/demo-bypass.ts`).
6. Tener a mano URL/keys del proyecto Supabase backup (Preview/staging).

## Cómo hacer backup

Requiere `DATABASE_URL` (cadena Postgres del proyecto, Settings → Database → URI).

En Git Bash / WSL / macOS / Linux:

```bash
export DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres'
./scripts/backup-db.sh
```

Si está instalado [Supabase CLI](https://supabase.com/docs/guides/cli), el script usa `supabase db dump`. Si no, usa `pg_dump` si está en el PATH.

Salida esperada: `backups/YYYY-MM-DD_HH-MM-SS_schema.sql` y `_data.sql`.

**No commitees** backups con datos reales.

## Cómo restaurar en un Supabase nuevo (staging/backup)

1. Crear proyecto Supabase vacío.
2. Ejecutar DDL base desde `scripts/000_rebuild_supabase_schema.sql` (y parches necesarios) **o** restaurar tu último `_schema.sql` si fue generado desde el mismo baseline.
3. Restaurar datos:

```bash
export DATABASE_URL='postgresql://...nuevo-proyecto...'
./scripts/restore-db.sh backups/TU_FECHA_data.sql
```

Probar primero en **staging**. Restaurar datos sobre producción puede borrar/conflictar si el schema difiere.

## Cómo cambiar al Supabase backup

1. En Vercel (o `.env.local`): reemplazar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` por los del proyecto backup (Dashboard → Settings → API).
2. Si usás `DATABASE_URL` para scripts, actualizar también.
3. Redeploy (Next.js inlining de `NEXT_PUBLIC_*` en build).
4. Verificar Auth: URL de redirect en Supabase → Authentication → URL configuration debe incluir tu dominio (`https://tu-app.vercel.app`, etc.).

## Modo demo / bypass actual

La app **no** usa aún `NEXT_PUBLIC_DEMO_MODE` en código; el bypass documentado es:

- `DEMO_BYPASS_AUTH=true` — el middleware permite `/dashboard` sin sesión Supabase; los datos usan service role y `DEMO_ORGANIZATION_ID` (sigue necesitando **tablas** en Supabase con esa org).

Plantilla: `.env.demo.example`.

## Si Supabase principal desaparece

1. No hace falta cambiar código para sobrevivir el primer día si tenés backup SQL y keys nuevas.
2. Crear proyecto Supabase nuevo.
3. Aplicar schema (`000` + parches según RECOVERY / equipo).
4. Restaurar último backup de datos compatible.
5. Actualizar variables en Vercel y redeploy.
6. Si no hay tiempo: habilitar bypass demo solo para mostrar UI (con datos mínimos en DB o trabajo futuro de demo 100% offline).

## Seguridad

- No subir `SUPABASE_SERVICE_ROLE_KEY` ni `DATABASE_URL` al frontend.
- No commitear `.env.local`, `.env.backup`, `.env.demo` con secretos.
- No commitear `backups/*.sql` con PII.
- Rotar keys si un backup o `.env` se expuso.

## Scripts opcionales

`./scripts/switch-env.sh` — si existe, copia plantillas hacia `.env.local` con confirmación (evitar sobrescribir sin querer).

## Verificación de tablas esperadas

```bash
npm run check:supabase-schema
```

Lista alineada con `scripts/check-supabase-schema.ts`.
