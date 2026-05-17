'use client';

import { motion } from 'motion/react';
import { useT } from '@/lib/luma/i18n';

export default function Testimonials() {
  const { t } = useT();
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 border-t border-white/10">
      <div className="grid md:grid-cols-3 gap-5">
        {t.testimonials.items.map((tt, i) => (
          <motion.figure
            key={tt.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
            className="liquid-glass rounded-2xl p-6"
          >
            <blockquote className="text-sm text-white/80 leading-[1.6]">
              &ldquo;{tt.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-6 pt-5 border-t border-white/10">
              <div className="text-sm font-semibold">{tt.name}</div>
              <div className="text-xs text-white/50">{tt.role}</div>
              <div className="text-xs text-white font-semibold tracking-wide mt-1">
                {tt.company}
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}
