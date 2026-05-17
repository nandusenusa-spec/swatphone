'use client';

import { motion } from 'motion/react';
import { LumaButton, shinyGradientStyle } from './primitives';
import { useT } from '@/lib/luma/i18n';

export default function Hero() {
  const { t } = useT();

  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 pt-12 md:pt-24 pb-16 md:pb-20 text-center flex flex-col items-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-4xl md:text-7xl font-semibold tracking-tight leading-[0.95]"
      >
        <span className="block text-white">{t.hero.line1}</span>
        <span className="block animate-shiny" style={shinyGradientStyle}>
          {t.hero.line2}
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="mt-8 text-white/60 max-w-md text-base leading-[1.5]"
      >
        {t.hero.subtitle}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="mt-8 flex flex-col items-center gap-3"
      >
        <LumaButton label={t.cta.tryLuma} />
        <span className="text-xs text-white/40">{t.cta.downloadSub}</span>
      </motion.div>
    </section>
  );
}
