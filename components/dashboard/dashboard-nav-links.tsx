'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'

export const dashboardPrimaryNav: { name: string; href: string; icon: LucideIcon }[] = [
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

export const dashboardSecondaryNav: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'Configuracion', href: '/dashboard/settings', icon: Settings },
]

export function DashboardNavLinks({
  onNavigate,
  linkBaseClassName,
  activeClassName,
  inactiveClassName,
}: {
  onNavigate?: () => void
  linkBaseClassName?: string
  activeClassName?: string
  inactiveClassName?: string
}) {
  const pathname = usePathname()
  const base =
    linkBaseClassName ??
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  const active =
    activeClassName ?? 'bg-sidebar-accent text-sidebar-accent-foreground'
  const inactive =
    inactiveClassName ??
    'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'

  const renderLink = (item: (typeof dashboardPrimaryNav)[0]) => {
    const isActive =
      pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onNavigate}
        className={cn(base, isActive ? active : inactive)}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {item.name}
      </Link>
    )
  }

  return (
    <>
      <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
        Menu Principal
      </div>
      {dashboardPrimaryNav.map(renderLink)}
      <div className="mb-2 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
        Configuracion
      </div>
      {dashboardSecondaryNav.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={cn(base, isActive ? active : inactive)}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {item.name}
          </Link>
        )
      })}
    </>
  )
}

export function DashboardNavBrand({
  organizationName,
  demoMode,
}: {
  organizationName: string
  demoMode?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
        <MessageSquare className="h-5 w-5 text-sidebar-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 flex flex-col">
        <span className="text-sm font-semibold text-sidebar-foreground">SWAT-VoiceIA</span>
        <span className="block truncate text-xs text-sidebar-foreground/60">{organizationName}</span>
        {demoMode ? (
          <span className="mt-1 inline-flex w-fit rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400">
            Demo mode
          </span>
        ) : null}
      </div>
    </div>
  )
}
