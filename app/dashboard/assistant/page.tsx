import { redirect } from 'next/navigation'

/** Vapi / sync técnico = Admin. El cliente edita saludo y tono en /dashboard/voz. */
export default function AssistantPage() {
  redirect('/dashboard/voz')
}
