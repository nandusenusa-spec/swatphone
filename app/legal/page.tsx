const LAST_UPDATED = '26 de abril de 2026'

type SectionItem = {
  id: string
  title: string
}

const SECTIONS: SectionItem[] = [
  { id: 'aviso-general', title: 'A. Aviso general' },
  { id: 'no-asesoria', title: 'B. No asesoría profesional' },
  { id: 'consentimiento-comunicaciones', title: 'C. Consentimiento de comunicaciones' },
  { id: 'sms-llamadas-automatizacion', title: 'D. SMS, llamadas y automatización' },
  { id: 'exactitud-precios-pedidos', title: 'E. Exactitud de precios, pedidos y estados' },
  { id: 'limitacion-responsabilidad', title: 'F. Limitación de responsabilidad' },
  { id: 'indemnidad', title: 'G. Indemnidad' },
  { id: 'responsabilidades-cliente', title: 'H. Responsabilidades del cliente' },
  { id: 'ia-automatizacion', title: 'I. IA y automatización' },
  { id: 'suspension-uso-prohibido', title: 'J. Suspensión y uso prohibido' },
  { id: 'politica-cambios', title: 'K. Política de cambios' },
  { id: 'contacto-legal', title: 'L. Contacto legal' },
]

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10 md:py-14">
      {/* 
        CHECKLIST INTERNA DE REVISIÓN LEGAL
        - [REVISAR CON ABOGADO FLORIDA] Grabación y transcripción de llamadas (consentimiento y aviso previo)
        - [REVISAR CON ABOGADO FLORIDA] SMS/telemarketing: opt-in, opt-out, horarios y listas de no contactar
        - [REVISAR CON ABOGADO FLORIDA] Consentimiento por formularios web (evidencia de consentimiento)
        - [REVISAR CON ABOGADO FLORIDA] Cláusula de arbitraje / venue / ley aplicable
        - [REVISAR CON ABOGADO FLORIDA] DPA / Privacy Policy y flujo de datos entre tenants
        - [REVISAR CON ABOGADO FLORIDA] Retención y borrado de grabaciones/transcripciones
      */}

      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Términos, límites del servicio y consentimiento de comunicaciones
        </h1>
        <p className="text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>
      </header>

      <LegalNotice>
        <p className="font-medium">
          Este contenido no reemplaza revisión legal. Debe ser revisado por un abogado con práctica
          en Florida antes de ponerse en producción.
        </p>
        <p className="mt-2 text-sm">
          Marcadores activos: <strong>[REVISAR CON ABOGADO FLORIDA]</strong>
        </p>
      </LegalNotice>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Índice</h2>
        <ul className="grid gap-2 text-sm md:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-primary hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-6">
        <LegalSection id="aviso-general" title="A. Aviso general">
          <p>
            La plataforma se ofrece en modalidad <em>&quot;as is&quot;</em> y <em>&quot;as available&quot;</em>.
            El usuario acepta que la disponibilidad, continuidad y desempeño pueden variar por
            mantenimiento, integraciones de terceros, conectividad o eventos fuera de control del
            proveedor.
          </p>
          <p>
            El negocio que utiliza la plataforma es responsable de configurar, supervisar y mantener
            su operación (asistentes, números, transferencias, horarios, mensajes, flujos y
            permisos).
          </p>
          <p>
            No se garantiza disponibilidad ininterrumpida, exactitud perfecta de transcripciones ni
            ausencia total de errores en respuestas, clasificación, extracción de datos o
            automatizaciones.
          </p>
        </LegalSection>

        <LegalSection id="no-asesoria" title="B. No asesoría legal, financiera, médica ni profesional">
          <p>
            La plataforma no presta asesoría legal, financiera, contable, médica ni de otra
            naturaleza profesional.
          </p>
          <p>
            Las respuestas automatizadas no sustituyen criterio humano ni evaluación profesional en
            casos sensibles o de alto impacto.
          </p>
          <p>
            <strong>[REVISAR CON ABOGADO FLORIDA]</strong> Validar textos y disclaimers adicionales
            por sector regulado (salud, seguros, crédito, etc.).
          </p>
        </LegalSection>

        <LegalSection id="consentimiento-comunicaciones" title="C. Consentimiento de comunicaciones">
          <p>
            Al usar la plataforma, el cliente reconoce y autoriza que ciertas comunicaciones puedan
            ser grabadas, monitoreadas o transcritas cuando exista consentimiento aplicable.
          </p>
          <p>
            El negocio usuario es responsable de obtener consentimientos y de emitir los avisos
            requeridos antes de grabar o transcribir llamadas, conforme a la normativa aplicable.
          </p>
          <LegalNotice tone="warning">
            <p className="font-medium">
              No active grabación automática sin revisar cumplimiento legal aplicable.
            </p>
            <p className="mt-1 text-sm">
              <strong>[REVISAR CON ABOGADO FLORIDA]</strong>
            </p>
          </LegalNotice>
        </LegalSection>

        <LegalSection id="sms-llamadas-automatizacion" title="D. SMS, llamadas y automatización">
          <p>
            El usuario del sistema es responsable de cumplir requisitos de llamadas y mensajería:
            opt-in, opt-out, horarios permitidos, listas de no llamar y demás restricciones
            aplicables.
          </p>
          <p>
            El proveedor no garantiza que una campaña, guion o flujo automatizado sea legal por
            defecto.
          </p>
          <p>
            El usuario debe configurar y mantener consentimientos, exclusiones y textos de aviso en
            formularios, scripts y plantillas de comunicación.
          </p>
        </LegalSection>

        <LegalSection id="exactitud-precios-pedidos" title="E. Exactitud de precios, pedidos y estados">
          <p>
            Precios, estados de trabajos, fechas y disponibilidad pueden depender de integraciones y
            datos de terceros, por lo que pueden existir retrasos, diferencias o inconsistencias.
          </p>
          <p>
            El sistema no debe utilizarse para prometer información no verificada ni para confirmar
            compromisos comerciales sin validación del negocio.
          </p>
          <p>
            El usuario es responsable de revisar y auditar automatizaciones que comuniquen estados,
            fechas o precios.
          </p>
        </LegalSection>

        <LegalSection id="limitacion-responsabilidad" title="F. Limitación de responsabilidad">
          <p>
            En la máxima medida permitida por la normativa aplicable, el proveedor no será
            responsable por daños indirectos, incidentales, especiales, punitivos o consecuenciales,
            ni por pérdida de datos, pérdida de ingresos, pérdida de oportunidades o interrupción del
            negocio.
          </p>
          <p>
            La responsabilidad agregada total del proveedor, por cualquier concepto relacionado con
            el servicio, se limita al monto efectivamente pagado por el cliente en el período de
            <strong> [REVISAR CON ABOGADO FLORIDA: definir ventana temporal]</strong>.
          </p>
          <p>
            <strong>[REVISAR CON ABOGADO FLORIDA]</strong> Ajustar alcance de exclusiones según tipo
            de cliente y jurisdicciones de operación.
          </p>
        </LegalSection>

        <LegalSection id="indemnidad" title="G. Indemnidad">
          <p>
            El cliente de la plataforma acepta defender, indemnizar y mantener indemne al proveedor
            frente a reclamos de terceros derivados de:
          </p>
          <LegalChecklist
            items={[
              'uso ilegal o no autorizado del sistema',
              'grabación o mensajería sin consentimiento aplicable',
              'contenido engañoso, falso o no autorizado',
              'violación de derechos de terceros',
            ]}
          />
          <p>
            Esta cláusula debe interpretarse de forma razonable y proporcional a la conducta y
            control operativo del cliente.
          </p>
        </LegalSection>

        <LegalSection id="responsabilidades-cliente" title="H. Responsabilidades del cliente">
          <LegalChecklist
            items={[
              'mantener datos de negocio, precios, horarios y contactos actualizados',
              'configurar transferencias, mensajes y flujos de atención de forma correcta',
              'supervisar integraciones y calidad de datos de terceros',
              'revisar decisiones críticas con validación humana',
              'no usar el sistema para spam ni prácticas engañosas',
            ]}
          />
        </LegalSection>

        <LegalSection id="ia-automatizacion" title="I. IA y automatización">
          <p>
            Algunas funciones utilizan IA y automatización (por ejemplo, transcripción, clasificación,
            enrutamiento y respuestas automáticas).
          </p>
          <p>
            Estas funciones pueden cometer errores de interpretación, transcripción o respuesta.
          </p>
          <p>
            Se recomienda revisión humana en casos sensibles: cobros, confirmaciones contractuales,
            salud, urgencias, reclamaciones formales y cualquier situación con impacto legal o
            reputacional relevante.
          </p>
        </LegalSection>

        <LegalSection id="suspension-uso-prohibido" title="J. Suspensión y uso prohibido">
          <p>
            El proveedor puede suspender o terminar el acceso ante uso que represente riesgo
            operativo, legal o de seguridad.
          </p>
          <LegalChecklist
            items={[
              'spam, fraude, suplantación o engaño',
              'grabación no autorizada o uso abusivo de datos',
              'acoso, amenazas o conductas ilícitas',
              'cualquier actividad contraria a normativa aplicable',
            ]}
          />
        </LegalSection>

        <LegalSection id="politica-cambios" title="K. Política de cambios">
          <p>
            El proveedor puede actualizar estos términos para reflejar cambios del servicio, de
            proveedores tecnológicos o de contexto regulatorio.
          </p>
          <p>
            La versión vigente será la publicada en esta página con su fecha de última actualización.
          </p>
          <p>
            El uso continuado del servicio después de cambios razonablemente comunicados implica
            aceptación de la versión vigente.
          </p>
        </LegalSection>

        <LegalSection id="contacto-legal" title="L. Contacto legal">
          <p>
            Para asuntos legales o regulatorios, contacte a:
            <br />
            <strong>Email legal:</strong> legal@swatvoiceia.com <strong>[REVISAR CON ABOGADO FLORIDA]</strong>
            <br />
            <strong>Dirección comercial:</strong> [REVISAR CON ABOGADO FLORIDA]
          </p>
        </LegalSection>
      </div>
    </main>
  )
}

function LegalSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border bg-card p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  )
}

function LegalNotice({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'warning'
}) {
  const classes =
    tone === 'warning'
      ? 'rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100'
      : 'rounded-lg border border-destructive/30 bg-destructive/5 p-4'
  return <div className={classes}>{children}</div>
}

function LegalChecklist({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
