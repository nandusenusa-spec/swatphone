'use client'

import { DashboardNavBrand, DashboardNavLinks } from '@/components/dashboard/dashboard-nav-links'

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

export function DashboardSidebar({
  profile,
  demoMode = false,
}: {
  profile: Profile | null
  demoMode?: boolean
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <DashboardNavBrand
        organizationName={profile?.organizations?.name || 'Mi Empresa'}
        demoMode={demoMode}
      />

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <DashboardNavLinks />
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
            {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1 truncate">
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
