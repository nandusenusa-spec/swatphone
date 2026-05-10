'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Upload, FileSpreadsheet, Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

// Plantilla de ejemplo descargable
const TEMPLATE_CSV = `nombre,descripcion,precio,tipo_precio,precio_min,precio_max,moneda
Tarjetas personales x100,"Cartulina mate 350gsm, full color frente y dorso",25,fijo,,,USD
Banner 2x1m,"Banner vinilo full color con ojales",,rango,80,150,USD
Wrap vehicular,"Wrap completo, requiere medicion del auto",,cotizar,,,USD
Diseno grafico,"Diseno personalizado por hora",75,hora,,,USD
`

const PRICE_TYPE_MAP: Record<string, string> = {
  fijo: 'fixed',
  fixed: 'fixed',
  hora: 'hourly',
  hourly: 'hourly',
  rango: 'range',
  range: 'range',
  cotizar: 'quote',
  quote: 'quote',
  '': 'fixed',
}

type ParsedRow = {
  raw: Record<string, string>
  ok: boolean
  reason?: string
  payload?: {
    name: string
    description: string | null
    price: number | null
    price_type: string
    price_min: number | null
    price_max: number | null
    currency: string
    is_active: boolean
  }
}

function num(v: string | undefined): number | null {
  if (!v) return null
  const cleaned = v.replace(/[^0-9.\-]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function normalizeRow(r: Record<string, string>): ParsedRow {
  // Soportar columnas en español o inglés
  const get = (...keys: string[]) =>
    keys.map((k) => r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]).find((v) => v != null) ?? ''

  const name = String(get('nombre', 'name')).trim()
  if (!name) {
    return { raw: r, ok: false, reason: 'falta nombre' }
  }

  const description = String(get('descripcion', 'description')).trim() || null
  const price = num(String(get('precio', 'price')))
  const priceTypeRaw = String(get('tipo_precio', 'price_type')).trim().toLowerCase()
  const price_type = PRICE_TYPE_MAP[priceTypeRaw] ?? 'fixed'
  const price_min = num(String(get('precio_min', 'price_min')))
  const price_max = num(String(get('precio_max', 'price_max')))
  const currency = (String(get('moneda', 'currency')).trim() || 'USD').toUpperCase()

  return {
    raw: r,
    ok: true,
    payload: {
      name,
      description,
      price,
      price_type,
      price_min,
      price_max,
      currency,
      is_active: true,
    },
  }
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-productos-aloha.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ImportProductsDialog({ onImported }: { onImported?: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const validRows = rows.filter((r) => r.ok)
  const invalidRows = rows.filter((r) => !r.ok)

  function reset() {
    setRows([])
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleFile(file: File) {
    setParsing(true)
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        const parsed = (result.data || []).map(normalizeRow)
        setRows(parsed)
        setParsing(false)
        if (parsed.length === 0) {
          toast.error('Archivo vacio o sin filas validas')
        } else {
          toast.success(`${parsed.length} filas detectadas`, {
            description: `${parsed.filter((r) => r.ok).length} validas, ${parsed.filter((r) => !r.ok).length} con problemas`,
          })
        }
      },
      error: (err) => {
        setParsing(false)
        toast.error('Error parseando archivo', { description: err.message })
      },
    })
  }

  async function doImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error(authErr?.message || 'Sesion expirada')

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      if (profErr || !profile?.organization_id) {
        throw new Error(profErr?.message || 'No se encontro tu organizacion')
      }

      const payloads = validRows.map((r) => ({
        ...r.payload!,
        organization_id: profile.organization_id,
      }))

      const { data: inserted, error } = await supabase
        .from('products')
        .insert(payloads)
        .select('id')

      if (error) {
        const code = (error as { code?: string }).code
        const detail = [error.message, error.details, error.hint, code ? `code=${code}` : '']
          .filter(Boolean)
          .join(' . ')
        throw new Error(detail || 'Error desconocido')
      }

      toast.success('Productos importados', {
        description: `${inserted?.length || payloads.length} productos cargados`,
      })
      setOpen(false)
      reset()
      onImported?.()
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      console.error('[import-products]', err)
      toast.error('No se pudieron importar', { description: msg, duration: 10000 })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar productos desde CSV</DialogTitle>
          <DialogDescription>
            Subi un archivo CSV con tus productos para cargarlos todos juntos. Si tu archivo es Excel,
            guardalo como CSV (Archivo &rarr; Guardar como &rarr; CSV UTF-8).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plantilla descargable */}
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Necesitas una plantilla?</p>
                <p className="text-xs text-muted-foreground">
                  Descargala con las columnas correctas y ejemplos
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla
            </Button>
          </div>

          {/* Input de archivo */}
          <div>
            <label
              htmlFor="csv-file"
              className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-background px-6 py-8 text-center hover:bg-muted/40"
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {fileName ? fileName : 'Click para elegir un archivo CSV'}
              </p>
              <p className="text-xs text-muted-foreground">o arrastra y solta</p>
              <input
                ref={inputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
          </div>

          {/* Estado de parseo */}
          {parsing && (
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-4 py-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando archivo...
            </div>
          )}

          {/* Preview */}
          {!parsing && rows.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border bg-green-50 px-4 py-3 dark:bg-green-950/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Validos</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
                    {validRows.length}
                  </p>
                </div>
                <div className="rounded-md border bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">Con problemas</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {invalidRows.length}
                  </p>
                </div>
              </div>

              {/* Tabla preview de validos */}
              {validRows.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60 text-left">
                      <tr>
                        <th className="px-3 py-2">Nombre</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Precio</th>
                        <th className="px-3 py-2">Moneda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-medium">{r.payload!.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.payload!.price_type}</td>
                          <td className="px-3 py-2">
                            {r.payload!.price_type === 'range'
                              ? `${r.payload!.price_min ?? '?'} - ${r.payload!.price_max ?? '?'}`
                              : r.payload!.price_type === 'quote'
                                ? 'A cotizar'
                                : r.payload!.price ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.payload!.currency}</td>
                        </tr>
                      ))}
                      {validRows.length > 50 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">
                            ... y {validRows.length - 50} mas
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Lista de filas con problemas */}
              {invalidRows.length > 0 && (
                <details className="rounded-md border bg-amber-50/50 dark:bg-amber-950/10">
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                    Ver {invalidRows.length} fila{invalidRows.length === 1 ? '' : 's'} con problemas
                  </summary>
                  <ul className="px-4 pb-3 text-xs">
                    {invalidRows.slice(0, 20).map((r, i) => (
                      <li key={i} className="border-t py-1">
                        Fila {i + 2}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={doImport} disabled={validRows.length === 0 || importing || parsing}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              `Importar ${validRows.length} producto${validRows.length === 1 ? '' : 's'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
