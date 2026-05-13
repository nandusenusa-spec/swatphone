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
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'

const navItems = [
  { label: 'Solucion', href: '#solution' },
  { label: 'Funciones', href: '#features' },
  { label: 'Precios', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const problems = [
  {
    icon: Phone,
    title: 'Llamadas perdidas',
    description: 'Cuando nadie contesta, el cliente llama al siguiente negocio.',
  },
  {
    icon: ClipboardCheck,
    title: 'Datos incompletos',
    description: 'Nombre, telefono, servicio, urgencia y direccion quedan repartidos en notas o mensajes.',
  },
  {
    icon: Clock,
    title: 'Seguimiento lento',
    description: 'Los leads calientes se enfrian cuando el equipo responde horas despues.',
  },
]

const solution = [
  'Contesta llamadas entrantes con una voz clara y profesional.',
  'Califica el lead con preguntas utiles para tu tipo de servicio.',
  'Guarda la informacion importante para que tu equipo pueda actuar.',
  'Crea seguimiento y alerta al equipo para no perder oportunidades.',
]

const features = [
  {
    icon: ClipboardCheck,
    title: 'Captura de leads',
    description: 'Recoge nombre, telefono, servicio, ubicacion, urgencia y notas clave de cada llamada.',
  },
  {
    icon: FileText,
    title: 'Resumen de llamadas',
    description: 'Convierte conversaciones en informacion clara para revisar rapido y tomar accion.',
  },
  {
    icon: CalendarClock,
    title: 'Follow-ups',
    description: 'Mantiene el seguimiento visible para que ningun prospecto quede olvidado.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard',
    description: 'Organiza llamadas, leads y actividad en un panel simple para operar con orden.',
  },
  {
    icon: Bell,
    title: 'Alertas al equipo',
    description: 'Notifica cuando entra una oportunidad, una llamada importante o una accion pendiente.',
  },
  {
    icon: ShieldCheck,
    title: 'Flujos controlados',
    description: 'Diseñado para apoyar al negocio sin tocar decisiones criticas sin configuracion previa.',
  },
]

const steps = [
  { title: 'Call', description: 'El cliente llama a tu numero.' },
  { title: 'Qualify', description: 'La IA entiende la necesidad y filtra la oportunidad.' },
  { title: 'Save', description: 'Guarda datos del cliente y contexto de la llamada.' },
  { title: 'Notify', description: 'Avisa al equipo con la informacion necesaria.' },
  { title: 'Follow up', description: 'Deja el seguimiento listo para cerrar el ciclo.' },
]

const useCases = [
  { icon: Wrench, title: 'Contratistas', description: 'Solicitudes de presupuesto, visitas y trabajos urgentes.' },
  { icon: Headphones, title: 'HVAC', description: 'Llamadas de reparacion, mantenimiento e instalacion.' },
  { icon: BriefcaseBusiness, title: 'Plomeria', description: 'Emergencias, cotizaciones y datos del servicio.' },
  { icon: Sparkles, title: 'Limpieza', description: 'Clientes residenciales, comerciales y seguimientos.' },
  { icon: Users, title: 'Servicios locales', description: 'Negocios que dependen de responder rapido y bien.' },
]

const pricing = [
  {
    name: 'Starter',
    price: '$149',
    cadence: '/month',
    description: 'Para negocios que quieren dejar de perder llamadas basicas.',
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
    description: 'Para equipos que necesitan mejor calificacion y seguimiento.',
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
    description: 'Para operaciones con mas volumen, ubicaciones o flujos especiales.',
    features: [
      'Everything in Pro',
      'Higher call volume',
      'Custom workflows',
      'Multi-location support',
      'Advanced routing/transfers',
      'Priority support',
    ],
  },
]

const faqs = [
  {
    question: 'What is SWAT VoiceIA?',
    answer:
      'SWAT VoiceIA es un asistente de voz con IA para negocios de servicios. Contesta llamadas, hace preguntas utiles, guarda informacion del cliente, crea seguimiento y avisa al equipo.',
  },
  {
    question: 'Does it replace my receptionist?',
    answer:
      'Puede cubrir llamadas cuando tu equipo no esta disponible y puede apoyar la recepcion diaria. En muchos negocios funciona mejor como primera linea de respuesta y filtro.',
  },
  {
    question: 'Can it send alerts to my team?',
    answer:
      'Si. Puede alertar al equipo cuando llega un lead, una llamada importante o una accion pendiente, segun la configuracion del negocio.',
  },
  {
    question: 'Does it create follow-ups?',
    answer:
      'Si. Puede dejar seguimientos listos para que el equipo sepa a quien llamar, por que motivo y con que prioridad.',
  },
  {
    question: 'Can it connect to Google Calendar?',
    answer:
      'Los flujos de calendario pueden configurarse dependiendo del setup. No todos los negocios necesitan el mismo flujo, asi que se revisa durante la configuracion.',
  },
  {
    question: 'How fast can I launch?',
    answer:
      'La mayoria de setups simples pueden arrancar rapido despues de definir servicios, preguntas de calificacion, alertas y reglas basicas.',
  },
  {
    question: 'Can I cancel?',
    answer:
      'Si. Los planes son mensuales y puedes cancelar antes del siguiente ciclo de facturacion.',
  },
  {
    question: 'Do you offer custom setup?',
    answer:
      'Si. Para negocios con multiples servicios, ubicaciones, rutas o transferencias, se puede preparar una configuracion personalizada.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="SWAT VoiceIA home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <MessageSquare className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">SWAT VoiceIA</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button className="hidden sm:inline-flex" asChild>
              <Link href="/auth/sign-up">Agendar demo</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="overflow-hidden px-5 py-20 sm:px-6 md:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Deja de perder llamadas. SWAT VoiceIA contesta, califica y avisa a tu equipo.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
                Un asistente de voz con IA para negocios de servicios. Atiende llamadas, captura datos,
                resume conversaciones, crea follow-ups y alerta al equipo para responder mas rapido.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/auth/sign-up">
                    Agendar demo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="#pricing">Ver precios</Link>
                </Button>
              </div>
              <div className="mt-8 grid max-w-2xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  Sin pago integrado aun
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  Setup guiado
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  Para servicios locales
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/10">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Phone className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Llamada entrante</p>
                      <p className="text-xs text-muted-foreground">Cliente nuevo - servicio urgente</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-foreground">
                    Calificando
                  </span>
                </div>

                <div className="space-y-4 py-5">
                  <div className="rounded-xl bg-muted p-4">
                    <p className="text-sm leading-6">
                      "Gracias por llamar. Para ayudarte rapido, dime que servicio necesitas y en que zona
                      estas ubicado."
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Servicio', 'Reparacion urgente'],
                      ['Cliente', 'Maria G.'],
                      ['Telefono', 'Guardado'],
                      ['Prioridad', 'Alta'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Alerta enviada al equipo</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Nuevo lead guardado con resumen, prioridad y siguiente accion.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="problem" className="border-y border-border bg-muted/30 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                El problema no es recibir llamadas. Es responderlas a tiempo.
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                En servicios locales, cada llamada puede ser una oportunidad. SWAT VoiceIA ayuda a que
                tu negocio no dependa de que alguien este libre justo en ese momento.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {problems.map((problem) => (
                <div key={problem.title} className="rounded-xl border border-border bg-card p-6">
                  <problem.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-5 text-lg font-semibold">{problem.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{problem.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="solution" className="px-5 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Una primera respuesta profesional, incluso cuando tu equipo esta ocupado.
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                SWAT VoiceIA convierte llamadas en informacion accionable: quien llamo, que necesita,
                que tan urgente es y que debe hacer el equipo despues.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {solution.map((item, index) => (
                  <div key={item} className="rounded-xl bg-muted/60 p-5">
                    <span className="text-sm font-semibold text-primary">0{index + 1}</span>
                    <p className="mt-3 text-sm leading-6">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-border bg-muted/30 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Lo esencial para capturar y mover oportunidades.
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                Funciones practicas para que las llamadas no se queden en memoria, notas sueltas o mensajes
                sin seguimiento.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-border bg-card p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Como funciona</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                Un flujo simple para convertir una llamada en una accion clara para tu equipo.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-5">
              {steps.map((step, index) => (
                <div key={step.title} className="relative rounded-xl border border-border bg-card p-5">
                  <span className="text-sm font-semibold text-primary">{index + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="border-y border-border bg-muted/30 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Hecho para negocios de servicios.
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                Ideal para equipos que reciben llamadas de clientes nuevos, solicitudes urgentes y trabajos
                que necesitan respuesta rapida.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {useCases.map((useCase) => (
                <div key={useCase.title} className="rounded-xl border border-border bg-card p-5">
                  <useCase.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-5 font-semibold">{useCase.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{useCase.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Precios simples</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                Elige el volumen y nivel de configuracion que mejor encaja con tu operacion.
              </p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {pricing.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    plan.featured
                      ? 'rounded-2xl border-2 border-primary bg-card p-6 shadow-xl shadow-primary/10'
                      : 'rounded-2xl border border-border bg-card p-6'
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    {plan.featured ? (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="pb-1 text-sm text-muted-foreground">{plan.cadence}</span>
                  </div>
                  <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-accent" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-7 w-full" variant={plan.featured ? 'default' : 'outline'} asChild>
                    <Link href="/auth/sign-up">Empezar con {plan.name}</Link>
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5 text-center text-sm text-muted-foreground">
              Setup included for early customers. Precio regular de setup: $299 one-time setup.
            </div>
          </div>
        </section>

        <section id="faq" className="border-y border-border bg-muted/30 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Preguntas frecuentes</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                Respuestas directas antes de configurar tu asistente.
              </p>
            </div>
            <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map((faq) => (
                <details key={faq.question} className="group p-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left font-semibold">
                    {faq.question}
                    <ArrowRight className="h-4 w-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground md:px-12">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Haz que cada llamada tenga una siguiente accion.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-primary-foreground/80">
              Configura SWAT VoiceIA para responder, calificar y avisar al equipo sin agregar carga manual
              a tu operacion.
            </p>
            <Button size="lg" variant="secondary" className="mt-8" asChild>
              <Link href="/auth/sign-up">
                Agendar demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">SWAT VoiceIA</p>
              <p className="text-sm text-muted-foreground">AI voice assistant for service businesses.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/legal" className="hover:text-foreground">
              Legal
            </Link>
            <Link href="/auth/login" className="hover:text-foreground">
              Login
            </Link>
            <p>2026 SWAT VoiceIA. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
