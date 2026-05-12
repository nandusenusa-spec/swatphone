'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, LogOut, Settings, User, Search, Menu } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DashboardNavBrand, DashboardNavLinks } from '@/components/dashboard/dashboard-nav-links'

interface Profile {
  id: string
  full_name: string | null
  email: string
  role: string
  organizations: {
    id: string
    name: string
  } | null
}

export function DashboardHeader({
  profile,
  demoMode = false,
}: {
  profile: Profile | null
  demoMode?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const handleSignOut = async () => {
    if (demoMode) {
      router.push('/dashboard')
      router.refresh()
      return
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-3 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex h-full w-[min(100vw-1rem,20rem)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
              <SheetHeader className="sr-only">
                <SheetTitle>Navegación</SheetTitle>
              </SheetHeader>
              <DashboardNavBrand
                organizationName={profile?.organizations?.name || 'Mi Empresa'}
                demoMode={demoMode}
              />
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <DashboardNavLinks onNavigate={() => setMobileNavOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 sm:flex-initial">
            <p className="text-xs text-muted-foreground">Panel de Control</p>
            <h1 className="truncate text-sm font-semibold">{profile?.organizations?.name || 'Mi Empresa'}</h1>
            {demoMode ? (
              <span className="mt-1 inline-flex rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400 sm:hidden">
                Demo mode
              </span>
            ) : null}
          </div>
          {demoMode ? (
            <span className="hidden rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400 sm:inline-flex">
              Demo mode
            </span>
          ) : null}
        </div>
        <div className="relative w-full min-w-0 sm:max-w-xs md:max-w-sm lg:w-80 lg:max-w-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar llamadas, leads..."
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            3
          </span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="hidden text-sm font-medium md:inline-block">
                {profile?.full_name || profile?.email?.split('@')[0]}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{profile?.full_name || 'Usuario'}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {profile?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Configuracion
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
