'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
import { cn } from '@/lib/utils'

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

const iconBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white'

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
    <header className="liquid-glass flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-transparent px-3 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button type="button" className={cn(iconBtnClass, 'md:hidden')} aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="liquid-glass flex h-full w-[min(100vw-1rem,20rem)] flex-col gap-0 border-white/10 bg-[#0c0c0c]/95 p-0 text-white"
            >
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
            <p className="text-xs text-white/60">Panel de Control</p>
            <h1 className="truncate text-sm font-semibold text-white">
              {profile?.organizations?.name || 'Mi Empresa'}
            </h1>
            {demoMode ? (
              <span className="mt-1 inline-flex rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-300 sm:hidden">
                Demo mode
              </span>
            ) : null}
          </div>
          {demoMode ? (
            <span className="hidden rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-300 sm:inline-flex">
              Demo mode
            </span>
          ) : null}
        </div>
        <div className="relative w-full min-w-0 sm:max-w-xs md:max-w-sm lg:w-80 lg:max-w-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <Input
            type="search"
            placeholder="Buscar llamadas, leads..."
            className="liquid-glass border-white/10 bg-white/5 pl-10 text-white shadow-none placeholder:text-white/40 focus-visible:border-white/20 focus-visible:ring-white/10"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <button type="button" className={cn(iconBtnClass, 'relative')} aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-medium text-black">
            3
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="btn-ghost flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-medium text-black">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="hidden text-sm font-medium md:inline-block">
                {profile?.full_name || profile?.email?.split('@')[0]}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="liquid-glass w-56 border-white/10 bg-[#0c0c0c]/95 text-white"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{profile?.full_name || 'Usuario'}</span>
                <span className="text-xs font-normal text-white/60">{profile?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="focus:bg-white/10 focus:text-white">
              <User className="mr-2 h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuItem className="focus:bg-white/10 focus:text-white">
              <Settings className="mr-2 h-4 w-4" />
              Configuracion
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-400 focus:bg-red-500/10 focus:text-red-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
