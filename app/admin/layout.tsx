'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { 
  LayoutDashboard, 
  Users, 
  Phone, 
  UserCheck, 
  BarChart3, 
  LogOut,
  Shield,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let active = true

    const checkAdminSession = async () => {
      // Skip auth check for login page
      if (pathname === '/admin/login') {
        if (active) setIsAuthenticated(true)
        return
      }

      // Fast path: existing local state.
      const adminToken = localStorage.getItem('admin_token')
      const adminUsername = localStorage.getItem('admin_username')
      if (adminToken && adminUsername) {
        if (active) setIsAuthenticated(true)
        return
      }

      // Fallback path: validate HttpOnly cookie session on server.
      try {
        const res = await fetch('/api/admin/data?type=stats', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          headers: getAdminAuthHeaders(),
        })
        if (res.ok) {
          if (active) setIsAuthenticated(true)
          return
        }
      } catch {
        // Ignore and redirect below.
      }

      if (active) {
        setIsAuthenticated(false)
        router.push('/admin/login')
      }
    }

    checkAdminSession()

    return () => {
      active = false
    }
  }, [pathname, router])

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      })
    } catch {
      // Ignore logout API errors and clear local state anyway.
    }
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_username')
    setIsAuthenticated(false)
    router.push('/admin/login')
  }

  // Tema oscuro solo en /admin; el resto de la app sigue en claro (:root).
  const adminShell = (content: ReactNode) => (
    <div className="dark min-h-screen bg-background text-foreground">{content}</div>
  )

  // Show login page without layout
  if (pathname === '/admin/login') {
    return adminShell(children)
  }

  if (isAuthenticated === null) {
    return adminShell(
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>,
    )
  }

  const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/admin/clients', icon: Users, label: 'Clientes' },
    { href: '/admin/all-calls', icon: Phone, label: 'Todas las Llamadas' },
    { href: '/admin/all-leads', icon: UserCheck, label: 'Todos los Leads' },
    { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { href: '/admin/settings', icon: Settings, label: 'Configuracion' },
  ]

  return adminShell(
    <div className="flex h-screen min-h-0">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar shrink-0">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-sidebar-foreground">SWAT-VoiceIA</h1>
                <p className="text-xs text-sidebar-accent-foreground">Super Admin</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                    isActive 
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-sidebar-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Cerrar Sesion
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background min-h-0">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>,
  )
}
