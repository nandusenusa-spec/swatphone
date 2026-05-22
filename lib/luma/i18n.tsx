'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type Lang = 'en' | 'es';

type Dict = typeof dict.en;

const dict = {
  en: {
    nav: {
      solutions: 'Solutions',
      pricing: 'Pricing',
      blog: 'Blog',
      docs: 'Documentation',
      careers: 'Careers',
    },
    cta: {
      tryLuma: 'Try Luma',
      downloadSub: 'Available on Web · iOS · Android',
      talkToSales: 'Talk to sales',
    },
    hero: {
      line1: 'Your reception.',
      line2: 'Reinvented',
      subtitle:
        'Luma is the AI receptionist that answers, qualifies, and books — across phone, WhatsApp, and web. Never lose a lead again.',
    },
    menu: {
      file: 'File',
      edit: 'Edit',
      view: 'View',
      go: 'Go',
      window: 'Window',
      help: 'Help',
      date: 'Wed May 6 · 1:09 PM',
    },
    inbox: {
      title: 'Luma — Conversations',
      compose: 'New conversation',
      searchPlaceholder: 'Search conversations',
      channels: {
        all: 'All channels',
        whatsapp: 'WhatsApp',
        calls: 'Calls',
        web: 'Web chat',
        forms: 'Forms',
        email: 'Email',
        archive: 'Archive',
      },
      labels: {
        title: 'Labels',
        hot: 'Hot leads',
        meetings: 'Meetings',
        followup: 'Follow-up',
        closed: 'Closed',
      },
      summaryLabel: 'Summary by Luma',
      summaryText:
        'New qualified lead. Asked for Pro plan pricing and requested a 30-min demo on Thursday at 3 PM. Calendar invite drafted.',
      readerTitle: 'Pricing inquiry — Pro plan',
      readerMeta: 'WhatsApp · 9:41 AM',
      hotLabel: 'Hot lead',
      attachment: 'pricing-pro.pdf',
      body: [
        'Hi Sophia,',
        'Thanks for reaching out. The Pro plan includes unlimited conversations, all channels, and a fully customizable voice.',
        'I have you penciled in for a 30-minute demo this Thursday at 3 PM. I will send the calendar invite shortly.',
        'Let me know if a different time works better.',
        '— Luma',
      ],
      messages: [
        {
          name: 'Sophia Chen',
          subject: 'Pricing inquiry — Pro plan',
          preview: 'Hi, does the Pro plan include unlimited channels?',
          time: '9:41 AM',
          channel: 'WhatsApp',
        },
        {
          name: 'Carlos Méndez',
          subject: 'Booking for 4 — Saturday 8 PM',
          preview: 'Table for four near the window if possible.',
          time: '8:12 AM',
          channel: 'Call',
        },
        {
          name: 'Web form',
          subject: 'New form submission',
          preview: 'Quote request for legal services — corporate.',
          time: 'Yesterday',
          channel: 'Form',
        },
        {
          name: 'Dr. Pérez',
          subject: 'Reschedule appointment',
          preview: 'Can we move Tuesday at 10 to Wednesday?',
          time: 'Yesterday',
          channel: 'WhatsApp',
        },
        {
          name: 'David Lim',
          subject: 'Contract follow-up',
          preview: 'Ready to sign — sending updated terms.',
          time: 'Mon',
          channel: 'Email',
        },
        {
          name: 'Tavola Studio',
          subject: 'Reservation confirmed',
          preview: 'Confirmed for 4 guests, 8 PM Saturday.',
          time: 'Mon',
          channel: 'Web',
        },
      ],
    },
    triage: {
      eyebrow: 'Automation',
      tag: 'AI-native',
      title1: 'Clear every channel',
      title2: 'in a single pass.',
      desc: 'Luma reads every message, understands intent, and routes the noise away from the signal. Your team only handles what truly matters.',
      chips: ['Auto-categorize', 'Auto-reply FAQs', 'Schedule bookings', 'Smart escalation'],
      cardTitle: 'Today · 42 conversations handled',
      groups: [
        {
          name: 'Hot leads',
          count: 4,
          color: '#ffffff',
          items: ['Sophia Chen — Pro plan demo', 'David Lim — contract signoff'],
        },
        {
          name: 'Meetings booked',
          count: 7,
          color: '#e5e5e5',
          items: ['Dr. Pérez — 4 patients', 'Studio Tavola — 3 bookings'],
        },
        {
          name: 'Follow-up',
          count: 18,
          color: '#a3a3a3',
          items: ['Marcus — design review', 'Quote pending — legal'],
        },
        {
          name: 'Archived',
          count: 13,
          color: '#525252',
          items: ['FAQ · Hours · Pricing replies'],
        },
      ],
    },
    voice: {
      eyebrow: 'Voice',
      tag: '100% customizable',
      title1: 'Hear Luma',
      title2: 'speak.',
      desc: 'Train Luma to sound like your brand — warm, professional, on point. Choose voice, tone, pace, and script. The result feels human, never robotic.',
      play: 'Play sample',
      pause: 'Pause',
      caption: 'English · Neutral · 0:24',
    },
    logoCloud: 'Built for teams that answer every channel',
    industries: ['Clinics', 'Restaurants', 'Law firms', 'Agencies', 'Real estate', 'Retail', 'Studios', 'SaaS'],
    testimonials: {
      items: [
        {
          quote:
            'Luma freed up our front desk so we could focus on patient care. Bookings doubled in a single month.',
          name: 'Dr. María Pérez',
          role: 'Clinic Director',
          company: 'CLÍNICA NOVA',
        },
        {
          quote:
            'We stopped losing reservations after hours. The voice is so natural that guests think it is human.',
          name: 'Tomás Riveros',
          role: 'Operations Manager',
          company: 'TAVOLA',
        },
        {
          quote:
            'Triage that actually understands context. Our SDRs only get calls worth taking.',
          name: 'Elena Suárez',
          role: 'Head of Growth',
          company: 'NORTH STUDIO',
        },
      ],
    },
    pricing: {
      watermark1: 'Your reception.',
      watermark2: 'Reinvented',
      monthly: 'Monthly',
      yearly: 'Yearly',
      choose: 'Choose plan',
      plans: [
        {
          tier: 'Trial',
          priceMonthly: '14-day trial',
          priceYearly: '14-day trial',
          desc: 'Try SWAT Voice IA on your business line before you commit.',
          features: [
            'AI phone receptionist',
            'Lead capture + call log',
            'Catalog price quotes by voice',
            'Dashboard in Spanish / English',
            'No credit card for trial',
          ],
        },
        {
          tier: 'Starter',
          priceMonthly: '$149/mo',
          priceYearly: '$1,490/yr',
          desc: 'For print shops and local businesses with steady inbound calls.',
          features: [
            'Dedicated phone line via Vapi',
            'Warm transfer to your team',
            'Leads + follow-ups in dashboard',
            'FAQ + product catalog sync',
            'Email support',
          ],
        },
        {
          tier: 'Pro',
          priceMonthly: '$299/mo',
          priceYearly: '$2,990/yr',
          desc: 'Higher volume, multiple destinations, and tighter operations.',
          features: [
            'Everything in Starter',
            'Google Calendar appointments',
            'Advanced routing + spam screening',
            'Call recordings + transcripts',
            'Priority support',
          ],
        },
      ],
    },
    final: {
      line1: 'Stop missing leads.',
      line2: 'Start closing them.',
      desc: 'Join the teams that treat reception like a system — not a bottleneck.',
      cta: 'Try Luma',
      talk: 'Talk to sales',
    },
  },
  es: {
    nav: {
      solutions: 'Soluciones',
      pricing: 'Precios',
      blog: 'Blog',
      docs: 'Documentación',
      careers: 'Empleos',
    },
    cta: {
      tryLuma: 'Probar Luma',
      downloadSub: 'Disponible en Web · iOS · Android',
      talkToSales: 'Hablar con ventas',
    },
    hero: {
      line1: 'Tu recepción.',
      line2: 'Reinventada',
      subtitle:
        'Luma es la recepcionista con IA que responde, califica y agenda — por teléfono, WhatsApp y web. No vuelvas a perder un lead.',
    },
    menu: {
      file: 'Archivo',
      edit: 'Editar',
      view: 'Vista',
      go: 'Ir',
      window: 'Ventana',
      help: 'Ayuda',
      date: 'Mié 6 May · 13:09',
    },
    inbox: {
      title: 'Luma — Conversaciones',
      compose: 'Nueva conversación',
      searchPlaceholder: 'Buscar conversaciones',
      channels: {
        all: 'Todos los canales',
        whatsapp: 'WhatsApp',
        calls: 'Llamadas',
        web: 'Chat web',
        forms: 'Formularios',
        email: 'Email',
        archive: 'Archivo',
      },
      labels: {
        title: 'Etiquetas',
        hot: 'Leads calientes',
        meetings: 'Reuniones',
        followup: 'Seguimiento',
        closed: 'Cerrados',
      },
      summaryLabel: 'Resumen de Luma',
      summaryText:
        'Lead calificado nuevo. Consultó por el plan Pro y pidió una demo de 30 min el jueves a las 15:00. Invitación de calendario preparada.',
      readerTitle: 'Consulta de precios — Plan Pro',
      readerMeta: 'WhatsApp · 9:41',
      hotLabel: 'Lead caliente',
      attachment: 'plan-pro.pdf',
      body: [
        'Hola Sophia,',
        'Gracias por escribirnos. El plan Pro incluye conversaciones ilimitadas, todos los canales y voz totalmente personalizable.',
        'Te dejé reservada una demo de 30 minutos este jueves a las 15:00. Te envío la invitación de calendario en breve.',
        'Avisame si te queda mejor otro horario.',
        '— Luma',
      ],
      messages: [
        {
          name: 'Sophia Chen',
          subject: 'Consulta de precios — Plan Pro',
          preview: 'Hola, ¿el plan Pro incluye canales ilimitados?',
          time: '9:41',
          channel: 'WhatsApp',
        },
        {
          name: 'Carlos Méndez',
          subject: 'Reserva para 4 — Sábado 20:00',
          preview: 'Mesa para cuatro cerca de la ventana si es posible.',
          time: '8:12',
          channel: 'Llamada',
        },
        {
          name: 'Formulario web',
          subject: 'Nueva consulta recibida',
          preview: 'Cotización de servicios legales — corporativo.',
          time: 'Ayer',
          channel: 'Form',
        },
        {
          name: 'Dr. Pérez',
          subject: 'Reagendar cita',
          preview: '¿Podemos pasar el martes 10:00 al miércoles?',
          time: 'Ayer',
          channel: 'WhatsApp',
        },
        {
          name: 'David Lim',
          subject: 'Seguimiento contrato',
          preview: 'Listo para firmar — enviando términos finales.',
          time: 'Lun',
          channel: 'Email',
        },
        {
          name: 'Tavola Studio',
          subject: 'Reserva confirmada',
          preview: 'Confirmada para 4 personas, sábado 20:00.',
          time: 'Lun',
          channel: 'Web',
        },
      ],
    },
    triage: {
      eyebrow: 'Automatización',
      tag: 'IA nativa',
      title1: 'Despejá cada canal',
      title2: 'en una sola pasada.',
      desc: 'Luma lee cada mensaje, entiende la intención y separa el ruido de la señal. Tu equipo solo atiende lo que de verdad importa.',
      chips: ['Auto-categorizar', 'Responder FAQs', 'Agendar reservas', 'Escalar al equipo'],
      cardTitle: 'Hoy · 42 conversaciones atendidas',
      groups: [
        {
          name: 'Leads calientes',
          count: 4,
          color: '#ffffff',
          items: ['Sophia Chen — Demo plan Pro', 'David Lim — firma de contrato'],
        },
        {
          name: 'Reuniones agendadas',
          count: 7,
          color: '#e5e5e5',
          items: ['Dr. Pérez — 4 pacientes', 'Tavola Studio — 3 reservas'],
        },
        {
          name: 'Seguimiento',
          count: 18,
          color: '#a3a3a3',
          items: ['Marcus — revisión de diseño', 'Cotización pendiente — legal'],
        },
        {
          name: 'Archivadas',
          count: 13,
          color: '#525252',
          items: ['FAQ · Horarios · Precios respondidos'],
        },
      ],
    },
    voice: {
      eyebrow: 'Voz',
      tag: '100% personalizable',
      title1: 'Escuchá a Luma',
      title2: 'hablar.',
      desc: 'Entrená a Luma para que suene como tu marca — cálida, profesional y precisa. Elegí voz, tono, ritmo y guion. El resultado se siente humano, nunca robótico.',
      play: 'Reproducir muestra',
      pause: 'Pausar',
      caption: 'Español · Neutro · 0:24',
    },
    logoCloud: 'Hecho para equipos que atienden todos los canales',
    industries: ['Clínicas', 'Restaurantes', 'Estudios legales', 'Agencias', 'Inmobiliarias', 'Comercio', 'Estudios', 'SaaS'],
    testimonials: {
      items: [
        {
          quote:
            'Luma liberó a nuestra recepción para que se concentre en la atención al paciente. Las reservas se duplicaron en un mes.',
          name: 'Dra. María Pérez',
          role: 'Directora médica',
          company: 'CLÍNICA NOVA',
        },
        {
          quote:
            'Dejamos de perder reservas fuera de horario. La voz es tan natural que los clientes creen que es humana.',
          name: 'Tomás Riveros',
          role: 'Gerente de operaciones',
          company: 'TAVOLA',
        },
        {
          quote:
            'Un triage que entiende el contexto. Nuestros vendedores solo atienden las llamadas que valen la pena.',
          name: 'Elena Suárez',
          role: 'Head of Growth',
          company: 'NORTH STUDIO',
        },
      ],
    },
    pricing: {
      watermark1: 'Tu recepción.',
      watermark2: 'Reinventada',
      monthly: 'Mensual',
      yearly: 'Anual',
      choose: 'Elegir plan',
      plans: [
        {
          tier: 'Prueba',
          priceMonthly: '14 días gratis',
          priceYearly: '14 días gratis',
          desc: 'Probá la contestadora IA en tu línea antes de contratar.',
          features: [
            'Recepcionista telefónica con IA',
            'Captura de leads y historial de llamadas',
            'Cotización por voz desde tu catálogo',
            'Panel en español / inglés',
            'Sin tarjeta para la prueba',
          ],
        },
        {
          tier: 'Starter',
          priceMonthly: '$149/mes',
          priceYearly: '$1.490/año',
          desc: 'Para imprentas y negocios locales con llamadas entrantes constantes.',
          features: [
            'Línea dedicada (Vapi + Twilio)',
            'Transferencia en caliente al equipo',
            'Leads y seguimientos en el panel',
            'FAQ y catálogo de productos',
            'Soporte por email',
          ],
        },
        {
          tier: 'Pro',
          priceMonthly: '$299/mes',
          priceYearly: '$2.990/año',
          desc: 'Más volumen, varios destinos y operación más ajustada.',
          features: [
            'Todo lo de Starter',
            'Citas en Google Calendar',
            'Ruteo avanzado y filtro anti-spam',
            'Grabaciones y transcripciones',
            'Soporte prioritario',
          ],
        },
      ],
    },
    final: {
      line1: 'Dejá de perder leads.',
      line2: 'Empezá a cerrarlos.',
      desc: 'Sumate a los equipos que tratan la recepción como un sistema — no como un cuello de botella.',
      cta: 'Probar Luma',
      talk: 'Hablar con ventas',
    },
  },
} as const;

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const value: I18nContextValue = { lang, setLang, t: dict[lang] };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within I18nProvider');
  return ctx;
}
