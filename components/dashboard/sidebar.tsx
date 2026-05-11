'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Phone,
  Users,
  Package,
  UserCircle,
  LayoutDashboard,
  Settings,
  Plug,
  HelpCircle,
  MessageSquare,
  CalendarClock,
  ListTodo,
} from 'lucide-react'

interface Profile {
  id: string
  full_name: string | null
  email: string
  role: string
  organizations: {
    id: string
    name: string
    slug: string
  } | null
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Llamadas', href: '/dashboard/calls', icon: Phone },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Follow-ups', href: '/dashboard/follow-ups', icon: ListTodo },
  { name: 'Citas', href: '/dashboard/appointments', icon: CalendarClock },
  { name: 'Productos', href: '/dashboard/products', icon: Package },
  { name: 'Equipo', href: '/dashboard/team', icon: UserCircle },
  { name: 'FAQs', href: '/dashboard/faqs', icon: HelpCircle },
  { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
]

const secondaryNavigation = [
  { name: 'Configuracion', href: '/dashboard/settings', icon: Settings },
]

export function DashboardSidebar({
  profile,
  demoMode = false,
}: {
  profile: Profile | null
  demoMode?: boolean
}) {
  const pathname = usePathname()

  return (
    <aside className="flex w-64 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
          <MessageSquare className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">SWAT-VoiceIA</span>
          <span className="text-xs text-sidebar-foreground/60">
            {profile?.organizations?.name || 'Mi Empresa'}
          </span>
          {demoMode ? (
            <span className="mt-1 inline-flex w-fit rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400">
              Demo mode
            </span>
          ) : null}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Menu Principal
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}

        <div className="mb-2 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Configuracion
        </div>
        {secondaryNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
            {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {profile?.full_name || profile?.email?.split('@')[0]}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {profile?.role === 'owner' ? 'Propietario' : profile?.role === 'admin' ? 'Admin' : 'Miembro'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
