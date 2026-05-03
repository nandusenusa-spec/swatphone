"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle, Printer, Wrench, Stethoscope, Home, Store, UtensilsCrossed } from "lucide-react"
import { useRouter } from "next/navigation"

const businessTemplates = [
  {
    id: "print-shop",
    name: "Imprenta / Print Shop",
    icon: Printer,
    description: "Business cards, flyers, banners, signage",
    endpoint: "/api/setup/seed-print-shop",
  },
  {
    id: "contractor",
    name: "Contractor / Home Services",
    icon: Wrench,
    description: "Plumbing, electrical, HVAC, remodeling",
    endpoint: "/api/setup/seed-contractor",
    comingSoon: true,
  },
  {
    id: "medical",
    name: "Medical / Dental Office",
    icon: Stethoscope,
    description: "Appointments, patient inquiries",
    endpoint: "/api/setup/seed-medical",
    comingSoon: true,
  },
  {
    id: "real-estate",
    name: "Real Estate / Property",
    icon: Home,
    description: "Property inquiries, showings, management",
    endpoint: "/api/setup/seed-real-estate",
    comingSoon: true,
  },
  {
    id: "retail",
    name: "Retail / Store",
    icon: Store,
    description: "Product inquiries, hours, inventory",
    endpoint: "/api/setup/seed-retail",
    comingSoon: true,
  },
  {
    id: "restaurant",
    name: "Restaurant / Food Service",
    icon: UtensilsCrossed,
    description: "Reservations, orders, catering",
    endpoint: "/api/setup/seed-restaurant",
    comingSoon: true,
  },
]

export function BusinessTemplateLoader() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLoadTemplate = async () => {
    const template = businessTemplates.find(t => t.id === selectedTemplate)
    if (!template || template.comingSoon) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(template.endpoint, {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to load template")
      }

      setSuccess(true)
      
      // Refresh the page after a short delay
      setTimeout(() => {
        router.refresh()
      }, 1500)

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading template")
    } finally {
      setLoading(false)
    }
  }

  const selectedTemplateData = businessTemplates.find(t => t.id === selectedTemplate)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">Tipo de Negocio</label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tu tipo de negocio" />
            </SelectTrigger>
            <SelectContent>
              {businessTemplates.map((template) => {
                const Icon = template.icon
                return (
                  <SelectItem 
                    key={template.id} 
                    value={template.id}
                    disabled={template.comingSoon}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{template.name}</span>
                      {template.comingSoon && (
                        <span className="text-xs text-muted-foreground">(Proximamente)</span>
                      )}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleLoadTemplate}
          disabled={!selectedTemplate || loading || selectedTemplateData?.comingSoon}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </>
          ) : success ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Cargado!
            </>
          ) : (
            "Cargar Plantilla"
          )}
        </Button>
      </div>

      {selectedTemplateData && !selectedTemplateData.comingSoon && (
        <p className="text-sm text-muted-foreground">
          Esto cargara productos, FAQs, y configuracion del asistente pre-configurados para una {selectedTemplateData.name.toLowerCase()}.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {success && (
        <p className="text-sm text-green-600">
          Plantilla cargada exitosamente! Revisa las secciones de Productos, FAQs y Asistente.
        </p>
      )}
    </div>
  )
}
