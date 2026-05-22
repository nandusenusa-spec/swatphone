import type { Metadata } from 'next'
import { SiteFooter } from '@/components/site-footer'

export const metadata: Metadata = {
  title: 'Términos y privacidad — SWAT Voice IA',
  description:
    'Términos del servicio, consentimiento de comunicaciones y política de uso de datos de Google Calendar.',
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex-1">{children}</div>
      <SiteFooter variant="light" />
    </div>
  )
}
