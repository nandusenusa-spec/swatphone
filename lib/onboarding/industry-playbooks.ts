export type OnboardingPlaybook = {
  title: string
  subtitle: string
  checklist: { label: string; href: string }[]
  voiceTips: string[]
}

const PLAYBOOKS: Record<string, OnboardingPlaybook> = {
  venue: {
    title: 'Tu venue con Luma',
    subtitle:
      'Configurá el asistente para captar tours, fechas y cotizaciones mientras atendés en el salón.',
    checklist: [
      { label: 'Completar nombre y datos de la empresa', href: '/dashboard/settings' },
      { label: 'Cargar FAQs (capacidad, paquetes, catering)', href: '/dashboard/faqs' },
      { label: 'Equipo y transferencias al coordinador', href: '/dashboard/team' },
      { label: 'Revisar plantilla CRM (rubro Venue)', href: '/dashboard/settings/crm' },
    ],
    voiceTips: [
      'Mencioná en el saludo el nombre del venue y que pueden agendar un tour.',
      'Definí en FAQs: capacidad por salón, horarios, política de ruido y estacionamiento.',
      'El asistente debe preguntar tipo de evento, fecha tentativa e invitados en cada lead.',
    ],
  },
  restaurant: {
    title: 'Tu restaurante con Luma',
    subtitle: 'Reservas y eventos privados por teléfono, sin perder llamadas en hora pico.',
    checklist: [
      { label: 'Configuración de empresa', href: '/dashboard/settings' },
      { label: 'FAQs de menú y reservas', href: '/dashboard/faqs' },
      { label: 'Equipo / host', href: '/dashboard/team' },
    ],
    voiceTips: [
      'Confirmá cantidad de personas, fecha y restricciones alimentarias.',
      'Ofrecé lista de espera si no hay mesa en el horario pedido.',
    ],
  },
  general: {
    title: 'Bienvenido a Luma',
    subtitle: 'Tu CRM y asistente de voz listos para personalizar.',
    checklist: [
      { label: 'Perfil y empresa', href: '/dashboard/settings' },
      { label: 'Rubro e industria CRM', href: '/dashboard/settings/crm' },
      { label: 'Preguntas frecuentes', href: '/dashboard/faqs' },
    ],
    voiceTips: [
      'Completá FAQs con las 10 preguntas que más recibís por teléfono.',
      'Configurá a quién transferir cuando pidan hablar con una persona.',
    ],
  },
}

export function getOnboardingPlaybook(industryKey: string): OnboardingPlaybook {
  return PLAYBOOKS[industryKey] ?? PLAYBOOKS.general
}
