'use client'

import { createClient } from '@/lib/supabase/client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const noOrgHint =
    searchParams.get('reason') === 'no_org'
      ? 'Tu sesión es válida, pero tu usuario no está vinculado a una organización en la base de datos. Pide a un admin que te dé acceso (fila en profiles con organization_id) o revisa el seed / SQL de tu entorno.'
      : null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
            `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      router.refresh()
      router.push('/dashboard')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-svh w-full items-center justify-center p-6 md:p-10"
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card className="liquid-glass border-0 bg-transparent text-white shadow-none">
            <CardHeader>
              <CardTitle className="text-2xl">Login</CardTitle>
              <CardDescription className="text-white/70">
                Enter your email below to login to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-white">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="liquid-glass h-10 border-white/10 bg-white/5 text-white shadow-none placeholder:text-white/40 focus-visible:border-white/20 focus-visible:ring-white/10"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-white">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="liquid-glass h-10 border-white/10 bg-white/5 text-white shadow-none placeholder:text-white/40 focus-visible:border-white/20 focus-visible:ring-white/10"
                    />
                  </div>
                  {noOrgHint && (
                    <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
                      {noOrgHint}
                    </p>
                  )}
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <button
                    type="submit"
                    className="c3-btn w-full disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Logging in...' : 'Login'}
                  </button>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-4 space-y-2 text-center text-sm text-white/70"
                >
                  <p>
                    ¿Super administrador de la plataforma?{' '}
                    <Link href="/admin/login" className="text-white underline underline-offset-4">
                      Entrar al panel admin
                    </Link>
                  </p>
                  <p>
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/sign-up" className="text-white underline underline-offset-4">
                      Sign up
                    </Link>
                  </p>
                </motion.div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex min-h-svh w-full items-center justify-center p-6 text-sm text-white/70"
        >
          Cargando…
        </motion.div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
