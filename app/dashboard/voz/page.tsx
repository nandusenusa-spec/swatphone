import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { loadClientSpeechSettings } from '@/lib/dashboard/client-speech'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ClientBotSpeechForm } from '@/components/dashboard/client-bot-speech-form'

export default async function DashboardVozPage() {
  const organizationId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()
  const settings = await loadClientSpeechSettings(service, organizationId)

  const defaultWelcome =
    settings.welcomeMessage ||
    `Hola, gracias por llamar a ${settings.organizationName}. ¿En qué puedo ayudarte hoy?`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voz del asistente</h1>
        <p className="text-muted-foreground">
          Corregí el saludo y el tono. La conexión técnica con el proveedor de voz la hace SWAT
          automáticamente al guardar.
        </p>
      </div>

      <ClientBotSpeechForm
        organizationName={settings.organizationName}
        initialWelcomeMessage={defaultWelcome}
        initialClientSpeechNotes={settings.clientSpeechNotes}
      />
    </div>
  )
}
