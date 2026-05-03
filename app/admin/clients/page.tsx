'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Minus,
  PartyPopper,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'

type OwnerCredentialList = {
  owner_email: string
  password_plaintext: string | null
  updated_at: string | null
} | null

interface Organization {
  id: string
  name: string
  slug: string
  vapi_api_key: string | null
  vapi_assistant_id: string | null
  vapi_phone_number: string | null
  owner_credential?: OwnerCredentialList
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Organization[]>([])
  const [credentialStoreAvailable, setCredentialStoreAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOwnerEmail, setNewOwnerEmail] = useState('')
  const [newOwnerPassword, setNewOwnerPassword] = useState('')
  const [newAssistantId, setNewAssistantId] = useState('')
  const [newTransferNumber, setNewTransferNumber] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [formErrorCode, setFormErrorCode] = useState<string | undefined>(undefined)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showOwnerPassword, setShowOwnerPassword] = useState(false)
  const [showCreateClientPanel, setShowCreateClientPanel] = useState(false)
  /** Por tarjeta: si la contraseña se muestra en claro */
  const [revealedPasswordByOrg, setRevealedPasswordByOrg] = useState<Record<string, boolean>>({})
  const [createdCredentials, setCreatedCredentials] = useState<null | {
    organization_id: string
    organization_slug: string
    owner_email: string
    owner_password: string
    login_url: string
  }>(null)

  useEffect(() => {
    const fetchClients = async () => {
      setListError('')
      try {
        const res = await fetch('/api/admin/data?type=organizations', {
          cache: 'no-store',
          credentials: 'include',
          headers: getAdminAuthHeaders(),
        })
        const json = await res.json()

        if (!res.ok) {
          setListError(
            typeof json.error === 'string'
              ? json.error
              : 'No se pudieron cargar las empresas. Revisá la sesión de admin o el servidor.',
          )
        } else {
          setClients((json.data as Organization[]) || [])
          if (typeof json.credential_store_available === 'boolean') {
            setCredentialStoreAvailable(json.credential_store_available)
          } else {
            setCredentialStoreAvailable(true)
          }
        }
      } catch {
        setListError('Error de red al cargar empresas.')
      }
      setLoading(false)
    }

    fetchClients()
  }, [])

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validateForm(): boolean {
    const e: Record<string, string> = {}
    if (!newOrgName.trim()) {
      e.orgName = 'Ingresá el nombre de la empresa.'
    }
    if (!newOwnerEmail.trim()) {
      e.email = 'Ingresá el email del responsable (owner).'
    } else if (!EMAIL_RE.test(newOwnerEmail.trim())) {
      e.email = 'El email no tiene un formato válido.'
    }
    if (newOwnerPassword.length < 8) {
      e.password = 'La contraseña temporal debe tener al menos 8 caracteres.'
    }
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function copyValue(key: string, text: string) {
    setFormError('')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setFormError('No se pudo copiar al portapapeles. Copiá el texto manualmente.')
    }
  }

  function credentialsSummaryText(
    c: NonNullable<typeof createdCredentials>,
    origin: string,
  ) {
    const webhook = `${origin}/api/voice/events?organization_id=${c.organization_id}`
    return [
      `Empresa: ${c.organization_slug}`,
      `ID organización: ${c.organization_id}`,
      `URL login CRM: ${c.login_url}`,
      `Email owner: ${c.owner_email}`,
      `Contraseña temporal: ${c.owner_password}`,
      `Webhook de voz (Server URL): ${webhook}`,
      '',
      'Pedile al cliente que cambie la contraseña al primer ingreso.',
    ].join('\n')
  }

  async function copyAllCredentials() {
    if (!createdCredentials || typeof window === 'undefined') return
    await copyValue(
      'all',
      credentialsSummaryText(createdCredentials, window.location.origin),
    )
  }

  const createOrganization = async () => {
    setFormError('')
    setFormErrorCode(undefined)
    if (!validateForm()) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          type: 'create_organization_with_owner',
          data: {
            name: newOrgName.trim(),
            owner_email: newOwnerEmail.trim(),
            owner_password: newOwnerPassword,
            vapi_assistant_id: newAssistantId.trim() || null,
            ramon_transfer_number: newTransferNumber.trim() || null,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : res.status === 409
              ? 'Ya existe una empresa o usuario con esos datos.'
              : 'No se pudo crear la empresa. Revisá los datos o probá de nuevo.'
        setFormError(msg)
        setFormErrorCode(typeof json.error_code === 'string' ? json.error_code : undefined)
        return
      }
      setCreatedCredentials(json.data || null)
      setNewOrgName('')
      setNewOwnerEmail('')
      setNewOwnerPassword('')
      setNewAssistantId('')
      setNewTransferNumber('')
      setFieldErrors({})
      const refetch = await fetch('/api/admin/data?type=organizations', {
        cache: 'no-store',
        credentials: 'include',
        headers: getAdminAuthHeaders(),
      })
      const refetchJson = await refetch.json()
      if (refetch.ok) {
        setClients((refetchJson.data as Organization[]) || [])
        if (typeof refetchJson.credential_store_available === 'boolean') {
          setCredentialStoreAvailable(refetchJson.credential_store_available)
        }
      }
    } catch (e) {
      console.error(e)
      setFormError('Error de red al crear la empresa.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8">Cargando...</div>
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alta de empresas y acceso al CRM para cada cliente.
        </p>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar el listado</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      {!credentialStoreAvailable ? (
        <Alert variant="destructive">
          <AlertTitle>Falta la tabla de credenciales en Supabase</AlertTitle>
          <AlertDescription>
            No se puede leer ni guardar contraseñas de owner hasta ejecutar{' '}
            <code className="rounded bg-muted px-1 text-xs">011_organization_owner_credential_store.sql</code> en
            el SQL Editor. El email del owner puede seguir mostrándose desde perfiles.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Nuevo cliente</CardTitle>
                <CardDescription>
                  Creá la empresa, el usuario owner y (opcional) el Assistant ID y el teléfono de transferencia.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateClientPanel((v) => !v)}
              className="shrink-0"
            >
              {showCreateClientPanel ? (
                <>
                  <Minus className="mr-1 h-4 w-4" />
                  Ocultar
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  Nuevo
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {showCreateClientPanel ? (
          <CardContent className="space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo completar el alta</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>{formError}</p>
                {formErrorCode ? (
                  <p className="text-xs opacity-90">Referencia: {formErrorCode}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nombre empresa</Label>
              <Input
                id="org-name"
                value={newOrgName}
                onChange={(e) => {
                  setNewOrgName(e.target.value)
                  clearFieldError('orgName')
                }}
                className={cn(fieldErrors.orgName && 'border-destructive')}
                aria-invalid={Boolean(fieldErrors.orgName)}
              />
              {fieldErrors.orgName ? (
                <p className="text-xs text-destructive">{fieldErrors.orgName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-email">Email del owner</Label>
              <Input
                id="owner-email"
                type="email"
                autoComplete="off"
                value={newOwnerEmail}
                onChange={(e) => {
                  setNewOwnerEmail(e.target.value)
                  clearFieldError('email')
                }}
                className={cn(fieldErrors.email && 'border-destructive')}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-password">Contraseña temporal</Label>
              <div className="relative">
                <Input
                  id="owner-password"
                  type={showOwnerPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newOwnerPassword}
                  onChange={(e) => {
                    setNewOwnerPassword(e.target.value)
                    clearFieldError('password')
                  }}
                  placeholder="Mínimo 8 caracteres"
                  className={cn('pr-10', fieldErrors.password && 'border-destructive')}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowOwnerPassword((v) => !v)}
                >
                  {showOwnerPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {fieldErrors.password ? (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  El cliente debería cambiarla al entrar al CRM.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistant-id">Assistant ID (opcional)</Label>
              <Input
                id="assistant-id"
                value={newAssistantId}
                onChange={(e) => setNewAssistantId(e.target.value)}
                placeholder="Si ya tenés el assistant creado"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="transfer-num">Número transferencia (opcional)</Label>
              <Input
                id="transfer-num"
                value={newTransferNumber}
                onChange={(e) => setNewTransferNumber(e.target.value)}
                placeholder="E.164 o formato del proveedor, ej. +1..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={createOrganization} disabled={saving}>
              {saving ? 'Creando…' : 'Crear cliente'}
            </Button>
            {createdCredentials ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreatedCredentials(null)
                  setFormError('')
                }}
              >
                Ocultar credenciales
              </Button>
            ) : null}
          </div>

          {createdCredentials ? (
            <Alert className="border-green-600/30 bg-green-600/5">
              <PartyPopper className="text-green-700 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-300">Empresa creada</AlertTitle>
              <AlertDescription className="space-y-4 text-foreground">
                <p className="text-sm text-muted-foreground">
                  Enviá estos datos al cliente por un canal seguro. Podés copiar cada campo o todo junto.
                </p>

                <div className="space-y-3 rounded-md border bg-card p-4 text-sm">
                  <CopyRow
                    label="ID organización"
                    value={createdCredentials.organization_id}
                    copied={copiedKey === 'orgId'}
                    onCopy={() => copyValue('orgId', createdCredentials.organization_id)}
                  />
                  <CopyRow
                    label="Slug"
                    value={createdCredentials.organization_slug}
                    copied={copiedKey === 'slug'}
                    onCopy={() => copyValue('slug', createdCredentials.organization_slug)}
                  />
                  <CopyRow
                    label="URL de login"
                    value={createdCredentials.login_url}
                    copied={copiedKey === 'login'}
                    onCopy={() => copyValue('login', createdCredentials.login_url)}
                  />
                  <CopyRow
                    label="Email owner"
                    value={createdCredentials.owner_email}
                    copied={copiedKey === 'email'}
                    onCopy={() => copyValue('email', createdCredentials.owner_email)}
                  />
                  <CopyRow
                    label="Contraseña temporal"
                    value={createdCredentials.owner_password}
                    copied={copiedKey === 'pass'}
                    onCopy={() => copyValue('pass', createdCredentials.owner_password)}
                    mono
                  />
                  {typeof window !== 'undefined' ? (
                    <CopyRow
                      label="Webhook de voz (Server URL)"
                      value={`${window.location.origin}/api/voice/events?organization_id=${createdCredentials.organization_id}`}
                      copied={copiedKey === 'webhook'}
                      onCopy={() =>
                        copyValue(
                          'webhook',
                          `${window.location.origin}/api/voice/events?organization_id=${createdCredentials.organization_id}`,
                        )
                      }
                      mono
                    />
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={copyAllCredentials}>
                    {copiedKey === 'all' ? (
                      <>
                        <Check className="mr-1 h-4 w-4" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-4 w-4" /> Copiar resumen completo
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={`/admin/clients/${createdCredentials.organization_id}`}>
                      Configurar empresa <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Panel colapsado. Tocá <strong>Nuevo</strong> para crear una empresa.
            </p>
          </CardContent>
        )}
      </Card>

      <div className="space-y-4">
        {clients.map((client) => (
          <div key={client.id} className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">{client.name}</h2>
                <p className="text-sm text-muted-foreground">Slug: {client.slug}</p>
              </div>
              <Link
                href={`/admin/clients/${client.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Ver detalles
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">API Key de voz</p>
                <p className="font-mono">{client.vapi_api_key ? '✓ Configurada' : '✗ No configurada'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assistant ID</p>
                <p className="font-mono">{client.vapi_assistant_id || 'No asignado'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Número teléfono</p>
                <p className="font-mono">{client.vapi_phone_number || 'No asignado'}</p>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-dashed bg-muted/30 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Acceso CRM (owner)
              </p>
              {client.owner_credential?.owner_email ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="break-all font-mono text-sm">{client.owner_credential.owner_email}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 h-8"
                      onClick={() => copyValue(`email-${client.id}`, client.owner_credential!.owner_email)}
                    >
                      {copiedKey === `email-${client.id}` ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copiar email
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Contraseña guardada</p>
                    {client.owner_credential.password_plaintext ? (
                      <>
                        <p className="font-mono text-sm">
                          {revealedPasswordByOrg[client.id]
                            ? client.owner_credential.password_plaintext
                            : '••••••••'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              setRevealedPasswordByOrg((prev) => ({
                                ...prev,
                                [client.id]: !prev[client.id],
                              }))
                            }
                          >
                            {revealedPasswordByOrg[client.id] ? (
                              <>
                                <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
                              </>
                            ) : (
                              <>
                                <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              copyValue(`pass-${client.id}`, client.owner_credential!.password_plaintext!)
                            }
                          >
                            {copiedKey === `pass-${client.id}` ? (
                              <>
                                <Check className="mr-1 h-3.5 w-3.5" /> Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No hay contraseña en el almacén. Entrá al detalle y guardá una, o ejecutá el SQL{' '}
                        <code className="text-xs">011</code> si falta la tabla.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin owner en perfil. Revisá el alta o Supabase → Authentication.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {clients.length === 0 && !listError ? (
        <div className="py-12 text-center text-muted-foreground">No hay clientes registrados aún.</div>
      ) : null}
    </div>
  )
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-[140px] text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className={cn('min-w-0 flex-1 break-all text-sm', mono && 'font-mono text-xs')}>{value}</p>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onCopy}>
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
