'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { LogoMark, LumaButton } from './primitives';
import LanguageToggle from './LanguageToggle';
import { useT } from '@/lib/luma/i18n';

const NAV_LINKS = [
  { key: 'solutions' as const, href: '#solutions' },
  { key: 'pricing' as const, href: '#pricing' },
] as const;

export default function Navbar() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative z-20 max-w-6xl mx-auto px-6 py-5"
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Luma home">
          <LogoMark className="w-8 h-8 text-white" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ key, href }, i) => (
            <motion.a
              key={key}
              href={href}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
              className="text-white/70 text-sm font-medium hover:text-white transition-colors"
            >
              {t.nav[key]}
            </motion.a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LanguageToggle />
          <div className="hidden md:block">
            <LumaButton label={t.cta.tryLuma} />
          </div>
          <Link
            href="/auth/login"
            className="hidden md:inline text-white/70 text-sm font-medium hover:text-white transition-colors"
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
            aria-expanded={open}
            className="md:hidden w-10 h-10 rounded-full border border-white/10 bg-white/5 inline-flex items-center justify-center text-white/80 hover:text-white"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="absolute top-full left-0 right-0 bg-black/95 backdrop-blur-md border-b border-white/10 p-4 md:hidden flex flex-col gap-3"
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              onClick={() => setOpen(false)}
              className="text-white/80 text-sm font-medium hover:text-white transition-colors py-2"
            >
              {t.nav[key]}
            </a>
          ))}
          <Link
            href="/auth/login"
            onClick={() => setOpen(false)}
            className="text-white/80 text-sm font-medium hover:text-white transition-colors py-2"
          >
            Log in
          </Link>
        </nav>
      )}
    </motion.nav>
  );
}
