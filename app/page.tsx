import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { 
  Phone, 
  Bot, 
  Users, 
  BarChart3, 
  Zap, 
  Globe,
  CheckCircle,
  ArrowRight,
  MessageSquare,
  Shield
} from 'lucide-react'

export default function HomePage() {
  const features = [
    {
      icon: Phone,
      title: 'Contesta Llamadas 24/7',
      description: 'Tu asistente nunca duerme. Atiende cada llamada con profesionalismo.',
    },
    {
      icon: Bot,
      title: 'Conversaciones Naturales',
      description: 'IA avanzada que habla como una persona real, no como un robot.',
    },
    {
      icon: Users,
      title: 'Captura Leads',
      description: 'Obtiene datos de contacto y califica clientes automaticamente.',
    },
    {
      icon: BarChart3,
      title: 'Dashboard Completo',
      description: 'Analiza llamadas, leads y rendimiento en tiempo real.',
    },
    {
      icon: Zap,
      title: 'Transferencia Inteligente',
      description: 'Redirige llamadas al miembro del equipo correcto cuando es necesario.',
    },
    {
      icon: Globe,
      title: 'Multiidioma',
      description: 'Soporte para espanol, ingles, portugues y mas idiomas.',
    },
  ]

  const benefits = [
    'Reduce costos de atencion telefonica hasta 70%',
    'Nunca pierdas una llamada de un cliente potencial',
    'Califica leads automaticamente antes de transferir',
    'Transcripciones y grabaciones de cada llamada',
    'Integracion con tu CRM existente',
    'Configuracion en minutos, no semanas',
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">SWAT-VoiceIA</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Acceso Clientes</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/sign-up">Comenzar Gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Tu Recepcionista Virtual con{' '}
            <span className="text-primary">Inteligencia Artificial</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            Contesta llamadas, captura leads, da precios y transfiere llamadas automaticamente. 
            Como tener un empleado que nunca duerme y siempre esta de buen humor.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth/sign-up">
                Prueba Gratis 14 Dias
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">
                Ver Caracteristicas
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-muted/30 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Todo lo que Necesitas</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Una plataforma completa para automatizar tu atencion telefonica
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Por que Elegir SWAT-VoiceIA?</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Transforma tu atencion telefonica con tecnologia de punta
              </p>
              <ul className="mt-8 space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-8" size="lg" asChild>
                <Link href="/auth/sign-up">
                  Comenzar Ahora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-card p-8">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                    <Phone className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Llamada entrante</p>
                    <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm italic">
                    &quot;Hola, gracias por llamar a Mi Empresa. Mi nombre es Ana, soy la asistente virtual. 
                    En que puedo ayudarte hoy?&quot;
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    Lead Capturado
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    Score: 85%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-primary px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-primary-foreground">
            Listo para Automatizar tu Atencion Telefonica?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Comienza gratis hoy y ve como SWAT-VoiceIA transforma tu negocio
          </p>
          <Button size="lg" variant="secondary" className="mt-8" asChild>
            <Link href="/auth/sign-up">
              Crear Cuenta Gratis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <MessageSquare className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">SWAT-VoiceIA</span>
            </div>
            <div className="flex items-center gap-6">
              <Link 
                href="/admin/login" 
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Shield className="h-3 w-3" />
                Admin
              </Link>
              <p className="text-sm text-muted-foreground">
                2026 SWAT-VoiceIA. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
