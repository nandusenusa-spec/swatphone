'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  Headphones,
  MessageCircle,
  MessageSquare,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Volume2,
  Wrench,
  Zap,
} from 'lucide-react'

type Lang = 'en' | 'es'

const navKeys = ['solution', 'features', 'pricing', 'faq'] as const

const iconMap = {
  phone: Phone,
  clipboard: ClipboardCheck,
  clock: Clock,
  bell: Bell,
  shield: ShieldCheck,
  zap: Zap,
  file: FileText,
  calendar: CalendarClock,
  chart: BarChart3,
  sliders: SlidersHorizontal,
  wrench: Wrench,
  hvac: Headphones,
  plumbing: BriefcaseBusiness,
  cleaning: Sparkles,
  services: Users,
}

const copy = {
  en: {
    nav: {
      solution: 'Solution',
      features: 'Features',
      pricing: 'Pricing',
      faq: 'FAQ',
    },
    cta: 'Book a demo',
    login: 'Login',
    hero: {
      title: 'Never miss the call that could change your business.',
      subtitle:
        'SWAT VoiceIA answers calls, filters spam, captures lead details, and sends instant alerts to your phone - so no opportunity gets lost.',
      line: 'You never know which call could be the million-dollar call.',
      primary: 'Book a demo',
      secondary: 'View pricing',
      proof: ['No lead gets lost', 'Instant mobile alerts', 'Fully editable workflows'],
      callLabel: 'Incoming call',
      callMeta: 'New customer - urgent service',
      status: 'Qualifying',
      assistantLine:
        'Thanks for calling. I can help right away - what service do you need, and how urgent is it?',
      typed:
        'New qualified lead: Maria G. needs urgent service. Summary, priority, and next step sent to your phone.',
      alertTitle: 'Instant phone alert sent',
      alertText: 'Summary, priority, caller details, and next step delivered to your mobile team.',
    },
    problems: {
      title: 'The risk is not call volume. It is the opportunity you never see.',
      subtitle:
        'Missed calls, spam, and incomplete notes make service teams slower than the customers who are ready to buy.',
      items: [
        {
          icon: 'phone',
          title: 'Missed calls',
          description: 'When nobody answers, the customer often calls the next business.',
        },
        {
          icon: 'clipboard',
          title: 'Bad lead capture',
          description: 'Name, phone, urgency, address, and service details get scattered across notes.',
        },
        {
          icon: 'clock',
          title: 'Slow follow-up',
          description: 'Hot leads cool down when the team receives context hours later.',
        },
      ],
    },
    solution: {
      title: 'A voice agent that answers, filters, qualifies, and alerts.',
      subtitle:
        'SWAT VoiceIA gives every important call a clean path from conversation to action, without changing your critical backend call flow.',
      items: [
        'Answers calls with a professional voice built around your business.',
        'Filters spam and reduces noise before it reaches the team.',
        'Prioritizes important calls by urgency, service type, and customer intent.',
        'Sends instant mobile alerts so the right person can act fast.',
      ],
    },
    features: {
      title: 'Built for the moments where speed and context matter.',
      subtitle:
        'Capture every lead opportunity with clean summaries, configurable speech, editable workflows, and alerts your team can act on.',
      items: [
        {
          icon: 'bell',
          title: 'Instant phone alerts',
          description: 'Send qualified lead summaries, priority, and next steps directly to your phone.',
        },
        {
          icon: 'shield',
          title: 'Spam filtering',
          description: 'Reduce noise from wrong numbers, vendor pitches, and low-value calls.',
        },
        {
          icon: 'zap',
          title: 'Important-call prioritization',
          description: 'Surface urgent service requests, ready-to-book leads, and high-intent callers.',
        },
        {
          icon: 'clipboard',
          title: 'Lead capture',
          description: 'Collect name, phone, service need, urgency, location, and callback preference.',
        },
        {
          icon: 'file',
          title: 'Call summaries',
          description: 'Turn conversations into concise notes your team can review in seconds.',
        },
        {
          icon: 'calendar',
          title: 'Follow-up creation',
          description: 'Keep the next action visible so no lead gets lost after the call.',
        },
        {
          icon: 'sliders',
          title: 'Configurable bot speech',
          description: 'Adjust tone, questions, service language, and escalation wording.',
        },
        {
          icon: 'chart',
          title: 'Fully editable workflows',
          description: 'Customize how calls are qualified, summarized, prioritized, and routed.',
        },
      ],
    },
    steps: {
      title: 'How it works',
      subtitle: 'A simple path from incoming call to team action.',
      items: [
        ['Call', 'A customer calls your business.'],
        ['Filter', 'SWAT VoiceIA detects spam and identifies real opportunities.'],
        ['Qualify', 'The assistant asks the right questions for your service.'],
        ['Notify', 'Your phone receives the summary, priority, and next step.'],
        ['Follow up', 'Your team acts with context instead of guessing.'],
      ],
    },
    useCases: {
      title: 'For service businesses that cannot afford missed opportunities.',
      subtitle:
        'Contractors, HVAC, plumbing, cleaning, and local service teams use fast response to win trust.',
      items: [
        { icon: 'wrench', title: 'Contractors', description: 'Estimates, visits, urgent work, and project intake.' },
        { icon: 'hvac', title: 'HVAC', description: 'Repair, maintenance, installation, and comfort emergencies.' },
        { icon: 'plumbing', title: 'Plumbing', description: 'Leaks, clogs, emergency calls, and service scheduling.' },
        { icon: 'cleaning', title: 'Cleaning', description: 'Residential, commercial, recurring, and move-out jobs.' },
        { icon: 'services', title: 'Local services', description: 'Any team that wins by answering quickly and clearly.' },
      ],
    },
    pricing: {
      title: 'Simple plans for serious call capture.',
      subtitle: 'Start with the call volume and workflow depth that matches your operation.',
      setup: 'Setup included for early customers. Regular setup: $299 one-time setup.',
      button: 'Start with',
      plans: [
        {
          name: 'Starter',
          price: '$149',
          cadence: '/month',
          description: 'For teams that need reliable call answering and basic lead capture.',
          features: [
            'AI voice assistant',
            'Lead capture',
            'Call summaries',
            'Team alerts',
            'Basic dashboard',
            'Follow-up tracking',
            'Up to 100 calls/month',
          ],
        },
        {
          name: 'Pro',
          price: '$299',
          cadence: '/month',
          description: 'For teams that need stronger qualification and follow-up workflows.',
          featured: true,
          features: [
            'Everything in Starter',
            'Up to 300 calls/month',
            'Better lead qualification',
            'Follow-up workflows',
            'Priority setup',
            'Multiple service categories',
          ],
        },
        {
          name: 'Business',
          price: '$499+',
          cadence: '/month',
          description: 'For higher volume, custom workflows, and multi-location operations.',
          features: [
            'Everything in Pro',
            'Higher call volume',
            'Custom workflows',
            'Multi-location support',
            'Advanced routing/transfers',
            'Priority support',
          ],
        },
      ],
    },
    faq: {
      title: 'FAQ',
      subtitle: 'Direct answers before configuring your voice agent.',
      items: [
        ['What is SWAT VoiceIA?', 'An AI voice assistant for service businesses. It answers calls, filters spam, qualifies leads, captures details, creates follow-up context, and alerts your team.'],
        ['Does it replace my receptionist?', 'It can cover missed calls and support your front desk. Many teams use it as a first response layer, filter, and after-hours assistant.'],
        ['Can it send alerts to my team?', 'Yes. It can send instant phone alerts with caller details, summary, priority, and suggested next step.'],
        ['Does it create follow-ups?', 'Yes. It can prepare follow-up context so your team knows who to call, why they called, and how urgent it is.'],
        ['Can it connect to Google Calendar?', 'Calendar workflows can be configured depending on setup. The exact workflow depends on the business process.'],
        ['How fast can I launch?', 'Simple setups can launch quickly after services, qualification questions, alert rules, and basic workflows are defined.'],
        ['Can I cancel?', 'Yes. Plans are monthly and can be cancelled before the next billing cycle.'],
        ['Do you offer custom setup?', 'Yes. Custom setup is available for multiple services, locations, routing rules, and editable scripts.'],
      ],
    },
    final: {
      title: 'Never miss the call that matters.',
      subtitle:
        'Install SWAT VoiceIA to answer faster, filter noise, capture every lead opportunity, and alert your team instantly.',
      cta: 'Book a demo',
    },
    footer: 'AI voice assistant for service businesses.',
    rights: '2026 SWAT VoiceIA. All rights reserved.',
  },
  es: {
    nav: {
      solution: 'Solución',
      features: 'Funciones',
      pricing: 'Precios',
      faq: 'FAQ',
    },
    cta: 'Agendar demo',
    login: 'Login',
    hero: {
      title: 'Nunca pierdas la llamada que puede cambiar tu negocio.',
      subtitle:
        'SWAT VoiceIA contesta llamadas, filtra spam, captura datos del lead y envía alertas instantáneas a tu celular para que ninguna oportunidad se pierda.',
      line: 'Nunca sabes cuál llamada puede ser la llamada de un millón de dólares.',
      primary: 'Agendar demo',
      secondary: 'Ver precios',
      proof: ['Ningún lead se pierde', 'Alertas instantáneas al celular', 'Flujos 100% editables'],
      callLabel: 'Llamada entrante',
      callMeta: 'Cliente nuevo - servicio urgente',
      status: 'Calificando',
      assistantLine:
        'Gracias por llamar. Puedo ayudarte ahora - ¿qué servicio necesitas y qué tan urgente es?',
      typed:
        'Nuevo lead calificado: Maria G. necesita servicio urgente. Resumen, prioridad y próximo paso enviados a tu celular.',
      alertTitle: 'Alerta instantánea enviada al celular',
      alertText: 'Resumen, prioridad, datos del cliente y próximo paso enviados a tu equipo móvil.',
    },
    problems: {
      title: 'El riesgo no es recibir llamadas. Es no ver la oportunidad.',
      subtitle:
        'Llamadas perdidas, spam y notas incompletas hacen que tu equipo llegue tarde a clientes listos para comprar.',
      items: [
        {
          icon: 'phone',
          title: 'Llamadas perdidas',
          description: 'Cuando nadie contesta, el cliente suele llamar al siguiente negocio.',
        },
        {
          icon: 'clipboard',
          title: 'Mala captura de leads',
          description: 'Nombre, teléfono, urgencia, dirección y servicio quedan repartidos en notas.',
        },
        {
          icon: 'clock',
          title: 'Seguimiento lento',
          description: 'Los leads calientes se enfrían cuando el equipo recibe contexto horas después.',
        },
      ],
    },
    solution: {
      title: 'Un agente de voz que contesta, filtra, califica y alerta.',
      subtitle:
        'SWAT VoiceIA convierte cada llamada importante en una acción clara, sin cambiar tu flujo crítico de llamadas.',
      items: [
        'Contesta llamadas con una voz profesional adaptada a tu negocio.',
        'Filtra spam y reduce ruido antes de que llegue al equipo.',
        'Prioriza llamadas importantes por urgencia, servicio e intención.',
        'Envía alertas instantáneas al celular para actuar rápido.',
      ],
    },
    features: {
      title: 'Hecho para los momentos donde velocidad y contexto importan.',
      subtitle:
        'Captura cada oportunidad con resúmenes claros, speech configurable, flujos editables y alertas accionables.',
      items: [
        {
          icon: 'bell',
          title: 'Alertas instantáneas al celular',
          description: 'Envía resumen, prioridad y próximo paso del lead directamente al teléfono.',
        },
        {
          icon: 'shield',
          title: 'Filtro de spam',
          description: 'Reduce llamadas equivocadas, ventas de proveedores y contactos de bajo valor.',
        },
        {
          icon: 'zap',
          title: 'Priorización de llamadas importantes',
          description: 'Destaca urgencias, leads listos para agendar y clientes con alta intención.',
        },
        {
          icon: 'clipboard',
          title: 'Captura de leads',
          description: 'Recoge nombre, teléfono, servicio, urgencia, ubicación y horario de contacto.',
        },
        {
          icon: 'file',
          title: 'Resumen de llamadas',
          description: 'Convierte conversaciones en notas claras que tu equipo revisa en segundos.',
        },
        {
          icon: 'calendar',
          title: 'Creación de follow-ups',
          description: 'Mantiene visible la próxima acción para que ningún lead se pierda.',
        },
        {
          icon: 'sliders',
          title: 'Speech del bot configurable',
          description: 'Ajusta tono, preguntas, lenguaje de servicios y mensajes de escalación.',
        },
        {
          icon: 'chart',
          title: 'Flujos totalmente editables',
          description: 'Personaliza calificación, resúmenes, prioridades y rutas de atención.',
        },
      ],
    },
    steps: {
      title: 'Cómo funciona',
      subtitle: 'Un camino simple desde llamada entrante hasta acción del equipo.',
      items: [
        ['Call', 'El cliente llama a tu negocio.'],
        ['Filter', 'SWAT VoiceIA detecta spam e identifica oportunidades reales.'],
        ['Qualify', 'El asistente hace las preguntas correctas para tu servicio.'],
        ['Notify', 'Tu celular recibe resumen, prioridad y próximo paso.'],
        ['Follow up', 'Tu equipo actúa con contexto en vez de adivinar.'],
      ],
    },
    useCases: {
      title: 'Para negocios de servicios que no pueden perder oportunidades.',
      subtitle:
        'Contratistas, HVAC, plomería, limpieza y servicios locales ganan confianza respondiendo rápido.',
      items: [
        { icon: 'wrench', title: 'Contratistas', description: 'Presupuestos, visitas, urgencias y toma de proyectos.' },
        { icon: 'hvac', title: 'HVAC', description: 'Reparación, mantenimiento, instalación y emergencias.' },
        { icon: 'plumbing', title: 'Plomería', description: 'Fugas, tapones, llamadas urgentes y agenda de servicio.' },
        { icon: 'cleaning', title: 'Limpieza', description: 'Residencial, comercial, recurrente y mudanzas.' },
        { icon: 'services', title: 'Servicios locales', description: 'Equipos que ganan al responder rápido y claro.' },
      ],
    },
    pricing: {
      title: 'Planes simples para capturar llamadas importantes.',
      subtitle: 'Elige el volumen y nivel de flujo que encaja con tu operación.',
      setup: 'Setup incluido para clientes tempranos. Setup regular: $299 one-time setup.',
      button: 'Empezar con',
      plans: [
        {
          name: 'Starter',
          price: '$149',
          cadence: '/mes',
          description: 'Para equipos que necesitan contestar llamadas y capturar leads básicos.',
          features: [
            'AI voice assistant',
            'Lead capture',
            'Call summaries',
            'Team alerts',
            'Basic dashboard',
            'Follow-up tracking',
            'Up to 100 calls/month',
          ],
        },
        {
          name: 'Pro',
          price: '$299',
          cadence: '/mes',
          description: 'Para equipos que necesitan mejor calificación y follow-up.',
          featured: true,
          features: [
            'Everything in Starter',
            'Up to 300 calls/month',
            'Better lead qualification',
            'Follow-up workflows',
            'Priority setup',
            'Multiple service categories',
          ],
        },
        {
          name: 'Business',
          price: '$499+',
          cadence: '/mes',
          description: 'Para más volumen, flujos personalizados y multi-location.',
          features: [
            'Everything in Pro',
            'Higher call volume',
            'Custom workflows',
            'Multi-location support',
            'Advanced routing/transfers',
            'Priority support',
          ],
        },
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      subtitle: 'Respuestas directas antes de configurar tu agente de voz.',
      items: [
        ['¿Qué es SWAT VoiceIA?', 'Un asistente de voz con IA para negocios de servicios. Contesta llamadas, filtra spam, califica leads, captura datos, prepara seguimiento y alerta al equipo.'],
        ['¿Reemplaza a mi recepcionista?', 'Puede cubrir llamadas perdidas y apoyar a recepción. Muchos equipos lo usan como primera respuesta, filtro y asistente fuera de horario.'],
        ['¿Puede enviar alertas al equipo?', 'Sí. Puede enviar alertas instantáneas al celular con datos del cliente, resumen, prioridad y próximo paso.'],
        ['¿Crea follow-ups?', 'Sí. Puede preparar contexto de seguimiento para saber a quién llamar, por qué llamó y qué tan urgente es.'],
        ['¿Puede conectarse a Google Calendar?', 'Los flujos de calendario pueden configurarse dependiendo del setup. El flujo exacto depende del proceso del negocio.'],
        ['¿Qué tan rápido puedo lanzar?', 'Setups simples pueden lanzarse rápido después de definir servicios, preguntas, alertas y flujos básicos.'],
        ['¿Puedo cancelar?', 'Sí. Los planes son mensuales y puedes cancelar antes del siguiente ciclo de facturación.'],
        ['¿Ofrecen setup personalizado?', 'Sí. Hay setup personalizado para múltiples servicios, ubicaciones, reglas de ruta y scripts editables.'],
      ],
    },
    final: {
      title: 'Nunca pierdas la llamada que importa.',
      subtitle:
        'Instala SWAT VoiceIA para responder más rápido, filtrar ruido, capturar cada lead y alertar al equipo al instante.',
      cta: 'Agendar demo',
    },
    footer: 'Asistente de voz con IA para negocios de servicios.',
    rights: '2026 SWAT VoiceIA. Todos los derechos reservados.',
  },
}

export default function HomePage() {
  const [lang, setLang] = useState<Lang>('en')
  const t = copy[lang]

  return (
    <div className="min-h-screen overflow-hidden bg-[#f8fafc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="SWAT VoiceIA home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
              <MessageSquare className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">SWAT VoiceIA</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            {navKeys.map((key) => (
              <Link key={key} href={`#${key}`} className="transition-colors hover:text-slate-950">
                {t.nav[key]}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              {(['en', 'es'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLang(item)}
                  className={`rounded-full px-3 py-1.5 transition ${
                    lang === item ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'
                  }`}
                  aria-pressed={lang === item}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link href="/auth/login">{t.login}</Link>
            </Button>
            <Button className="hidden bg-slate-950 text-white hover:bg-slate-800 sm:inline-flex" asChild>
              <Link href="/auth/sign-up">{t.cta}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-5 pb-20 pt-16 sm:px-6 md:pb-28 md:pt-24">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_72%)]" />
          <div className="absolute left-1/2 top-0 -z-10 h-px w-[92rem] -translate-x-1/2 bg-gradient-to-r from-transparent via-sky-300 to-transparent" />

          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.98fr_1.02fr]">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
                {t.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
                {t.hero.subtitle}
              </p>
              <p className="mt-5 max-w-2xl text-base font-semibold text-slate-900">
                {t.hero.line}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="bg-slate-950 text-white hover:bg-slate-800" asChild>
                  <Link href="/auth/sign-up">
                    {t.hero.primary}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-slate-300 bg-white" asChild>
                  <Link href="#pricing">{t.hero.secondary}</Link>
                </Button>
              </div>

              <div className="mt-8 grid max-w-2xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
                {t.hero.proof.map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <HeroDemo t={t.hero} />
          </div>
        </section>

        <section id="problem" className="border-y border-slate-200 bg-white px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionIntro title={t.problems.title} subtitle={t.problems.subtitle} />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {t.problems.items.map((problem) => {
                const Icon = iconMap[problem.icon as keyof typeof iconMap]
                return (
                  <div key={problem.title} className="group rounded-xl border border-slate-200 bg-slate-50 p-6 transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:bg-white hover:shadow-xl hover:shadow-sky-100/60">
                    <Icon className="h-6 w-6 text-sky-600" />
                    <h3 className="mt-5 text-lg font-semibold">{problem.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{problem.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="solution" className="px-5 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <SectionIntro title={t.solution.title} subtitle={t.solution.subtitle} />
            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-100 blur-2xl" />
              <div className="grid gap-4 sm:grid-cols-2">
                {t.solution.items.map((item, index) => (
                  <div key={item} className="relative rounded-xl bg-slate-50 p-5 transition hover:bg-sky-50">
                    <span className="text-sm font-semibold text-sky-600">0{index + 1}</span>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-slate-200 bg-white px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.features.title}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{t.features.subtitle}</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {t.features.items.map((feature) => {
                const Icon = iconMap[feature.icon as keyof typeof iconMap]
                return (
                  <div key={feature.title} className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl hover:shadow-slate-200">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionIntro title={t.steps.title} subtitle={t.steps.subtitle} />
            <div className="mt-12 grid gap-4 md:grid-cols-5">
              {t.steps.items.map(([title, description], index) => (
                <div key={title} className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-sm font-semibold text-sky-600">{index + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="border-y border-slate-200 bg-white px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.useCases.title}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{t.useCases.subtitle}</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {t.useCases.items.map((useCase) => {
                const Icon = iconMap[useCase.icon as keyof typeof iconMap]
                return (
                  <div key={useCase.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:bg-white hover:shadow-lg hover:shadow-slate-200">
                    <Icon className="h-6 w-6 text-sky-600" />
                    <h3 className="mt-5 font-semibold">{useCase.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{useCase.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.pricing.title}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{t.pricing.subtitle}</p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {t.pricing.plans.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    plan.featured
                      ? 'rounded-2xl border-2 border-slate-950 bg-white p-6 shadow-2xl shadow-slate-300'
                      : 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    {plan.featured ? (
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="pb-1 text-sm text-slate-500">{plan.cadence}</span>
                  </div>
                  <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-7 w-full" variant={plan.featured ? 'default' : 'outline'} asChild>
                    <Link href="/auth/sign-up">
                      {t.pricing.button} {plan.name}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">
              {t.pricing.setup}
            </div>
          </div>
        </section>

        <section id="faq" className="border-y border-slate-200 bg-white px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.faq.title}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{t.faq.subtitle}</p>
            </div>
            <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
              {t.faq.items.map(([question, answer]) => (
                <details key={question} className="group p-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left font-semibold">
                    {question}
                    <ArrowRight className="h-4 w-4 flex-none text-slate-500 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-slate-950 px-6 py-14 text-center text-white shadow-2xl shadow-slate-300 md:px-12">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.final.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-300">{t.final.subtitle}</p>
            <Button size="lg" variant="secondary" className="mt-8" asChild>
              <Link href="/auth/sign-up">
                {t.final.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white">
              <MessageSquare className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">SWAT VoiceIA</p>
              <p className="text-sm text-slate-600">{t.footer}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
            <Link href="/legal" className="hover:text-slate-950">
              Legal
            </Link>
            <Link href="/auth/login" className="hover:text-slate-950">
              {t.login}
            </Link>
            <p>{t.rights}</p>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes waveform {
          0%,
          100% {
            transform: scaleY(0.35);
            opacity: 0.55;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }

        @keyframes typing {
          from {
            width: 0;
          }
          to {
            width: min(100%, 58ch);
          }
        }

        @keyframes caret {
          0%,
          45% {
            border-color: rgba(15, 23, 42, 0.8);
          }
          46%,
          100% {
            border-color: transparent;
          }
        }

        @keyframes float-card {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        .waveform-bar {
          animation: waveform 1.15s ease-in-out infinite;
          transform-origin: center;
        }

        .typing-message {
          animation: typing 4.8s steps(58, end) 0.45s both, caret 0.8s step-end infinite;
        }

        .float-card {
          animation: float-card 5.5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .waveform-bar,
          .typing-message,
          .float-card {
            animation: none;
          }

          .typing-message {
            width: 100%;
            border-right-color: transparent;
          }
        }
      `}</style>
    </div>
  )
}

function SectionIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-8 text-slate-600">{subtitle}</p>
    </div>
  )
}

function HeroDemo({ t }: { t: (typeof copy)['en']['hero'] }) {
  const bars = [28, 44, 64, 38, 78, 52, 88, 46, 72, 34, 58, 82, 48, 68, 36, 56]

  return (
    <div className="relative">
      <div className="absolute -left-6 top-8 hidden rounded-2xl border border-emerald-200 bg-white/90 p-4 shadow-xl shadow-emerald-100 lg:block">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">{t.alertTitle}</p>
            <p className="text-xs text-slate-500">Mobile notification</p>
          </div>
        </div>
      </div>

      <div className="float-card rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-300/80">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
              <Phone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t.callLabel}</p>
              <p className="text-xs text-slate-500">{t.callMeta}</p>
            </div>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
            {t.status}
          </span>
        </div>

        <div className="py-5">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <div className="mb-4 flex items-center gap-2 text-xs font-medium text-sky-200">
              <Volume2 className="h-4 w-4" />
              Animated voice waveform
            </div>
            <div className="flex h-24 items-center justify-center gap-2" aria-label="Animated voice waveform">
              {bars.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="waveform-bar block w-2 rounded-full bg-gradient-to-t from-sky-400 to-emerald-300"
                  style={{ height: `${height}%`, animationDelay: `${index * 75}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-100 p-4">
            <p className="text-sm leading-6 text-slate-700">"{t.assistantLine}"</p>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
              <MessageCircle className="h-4 w-4" />
              WhatsApp-style typing
            </div>
            <p className="max-w-full overflow-hidden whitespace-nowrap border-r-2 pr-1 text-sm font-medium leading-6 text-slate-900 typing-message">
              {t.typed}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t.alertTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{t.alertText}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
