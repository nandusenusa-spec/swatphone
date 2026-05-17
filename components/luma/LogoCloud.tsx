'use client';

import { motion } from 'motion/react';
import { useT } from '@/lib/luma/i18n';

export default function LogoCloud() {
  const { t } = useT();
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-20">
      <div className="text-xs uppercase tracking-widest text-white/40 text-center">
        {t.logoCloud}
      </div>
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6">
        {t.industries.map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
            className="text-sm font-semibold tracking-tight text-white/50 hover:text-white text-center transition-colors"
          >
            {name}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
