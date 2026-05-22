import Link from 'next/link'

type SiteFooterProps = {
  variant?: 'dark' | 'light'
}

export function SiteFooter({ variant = 'dark' }: SiteFooterProps) {
  const isDark = variant === 'dark'

  return (
    <footer
      className={
        isDark
          ? 'relative z-10 border-t border-white/10 bg-[#0c0c0c] text-white/50'
          : 'border-t border-border bg-background text-muted-foreground'
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm sm:flex-row">
        <p className={isDark ? 'text-white/40' : undefined}>
          © {new Date().getFullYear()} SWAT Voice IA
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link
            href="/"
            className={
              isDark
                ? 'hover:text-white/80 transition-colors'
                : 'text-foreground/80 hover:text-foreground transition-colors'
            }
          >
            Inicio
          </Link>
          <Link
            href="/legal"
            className={
              isDark
                ? 'hover:text-white/80 transition-colors underline-offset-4 hover:underline'
                : 'text-foreground hover:underline underline-offset-4'
            }
          >
            Términos y privacidad
          </Link>
          <Link
            href="/auth/login"
            className={
              isDark
                ? 'hover:text-white/80 transition-colors'
                : 'text-foreground/80 hover:text-foreground transition-colors'
            }
          >
            Iniciar sesión
          </Link>
        </nav>
      </div>
    </footer>
  )
}
