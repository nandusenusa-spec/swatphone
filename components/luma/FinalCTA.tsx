'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { LumaButton } from './primitives';
import { useT } from '@/lib/luma/i18n';

export default function FinalCTA() {
  const { t } = useT();
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7 }}
        className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 md:py-24 text-center"
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)',
            opacity: 0.3,
          }}
        />
        <h2 className="relative text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          <span className="block">{t.final.line1}</span>
          <span className="block text-white/70">{t.final.line2}</span>
        </h2>
        <p className="relative mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
          {t.final.desc}
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <LumaButton label={t.final.cta} />
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white text-sm font-medium px-5 py-3 hover:bg-white/5 transition-colors"
          >
            {t.final.talk}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
