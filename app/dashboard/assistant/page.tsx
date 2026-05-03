import { redirect } from 'next/navigation'

/** La integración del proveedor de voz, la voz del bot y la sincronización del asistente las gestiona el Super Admin (Admin → Clientes). */
export default function AssistantPage() {
  redirect('/dashboard')
}
