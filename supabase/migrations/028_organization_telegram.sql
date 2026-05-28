-- Per-tenant Telegram routing (leads/citas no van al chat global de SWATWORKS si hay chat propio).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS telegram_chat_ids TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;

COMMENT ON COLUMN public.organizations.telegram_chat_ids IS
  'Chat IDs de Telegram para este cliente (separados por coma). Si está definido, las notificaciones de esta org NO usan TELEGRAM_CHAT_ID global.';
COMMENT ON COLUMN public.organizations.telegram_bot_token IS
  'Opcional: bot token propio. Si vacío, se usa TELEGRAM_BOT_TOKEN de Vercel.';

NOTIFY pgrst, 'reload schema';
