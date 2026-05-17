import { Inter } from 'next/font/google'
import { NoiseFilters } from '@/components/luma/primitives'
import '@/styles/luma-marketing.css'

const lumaSans = Inter({
  subsets: ['latin'],
  variable: '--font-luma-sans',
})

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`luma-marketing relative min-h-svh bg-[#0c0c0c] text-white ${lumaSans.variable} ${lumaSans.className}`}
    >
      <NoiseFilters />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-[#00d2ff]/10 blur-[120px]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
