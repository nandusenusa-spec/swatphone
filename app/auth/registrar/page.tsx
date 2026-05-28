'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Link from 'next/link'
import { motion } from 'motion/react'
import { RegisterOrganizationForm } from '@/components/auth/register-organization-form'
import { isPublicOrgRegistrationEnabledClient } from '@/lib/auth/public-org-registration'

export default function RegistrarEmpresaPage() {
  const enabled = isPublicOrgRegistrationEnabledClient()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-svh w-full items-center justify-center p-6 md:p-10"
    >
      <div className="w-full max-w-xl">
        <Card className="liquid-glass border-0 bg-transparent text-white shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Registrar tu empresa</CardTitle>
            <CardDescription className="text-white/70">
              Elegí el rubro, creá tu cuenta y empezá a configurar Luma. Los clientes que ya operan con
              nosotros siguen igual; este alta es para empresas nuevas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterOrganizationForm disabled={!enabled} />
            <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/60">
              <Link href="/" className="text-white/80 hover:text-white underline underline-offset-4">
                Volver al inicio
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
