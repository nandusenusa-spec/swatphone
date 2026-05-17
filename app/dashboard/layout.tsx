import { loadDashboardLayoutProfile } from '@/lib/auth/dashboard-session'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { NoiseFilters } from '@/components/luma/primitives'
import { Inter } from 'next/font/google'
import '@/styles/luma-marketing.css'

const lumaSans = Inter({
  subsets: ['latin'],
  variable: '--font-luma-sans',
})

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, demoMode } = await loadDashboardLayoutProfile()

  return (
    <div
      className={`luma-marketing relative flex min-h-dvh flex-col bg-[#0c0c0c] text-white md:h-screen md:flex-row ${lumaSans.variable} ${lumaSans.className}`}
    >
      <NoiseFilters />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[480px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-[#00d2ff]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-dvh w-full flex-col md:h-screen md:flex-row">
        <DashboardSidebar profile={profile} demoMode={demoMode} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <DashboardHeader profile={profile} demoMode={demoMode} />
          <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
