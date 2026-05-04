import { loadDashboardLayoutProfile } from '@/lib/auth/dashboard-session'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, demoMode } = await loadDashboardLayoutProfile()

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar profile={profile} demoMode={demoMode} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader profile={profile} demoMode={demoMode} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
