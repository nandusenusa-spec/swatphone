'use client';

import { motion } from 'motion/react';
import { SectionEyebrow } from './primitives';
import { useT } from '@/lib/luma/i18n';

export default function FeatureTriage() {
  const { t } = useT();

  return (
    <section id="solutions" className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 scroll-mt-24">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          <SectionEyebrow label={t.triage.eyebrow} tag={t.triage.tag} />
          <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
            <span className="block">{t.triage.title1}</span>
            <span className="block text-white/70">{t.triage.title2}</span>
          </h2>
          <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">{t.triage.desc}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {t.triage.chips.map((c) => (
              <span
                key={c}
                className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
              >
                {c}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Right column — triage card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <div className="text-xs text-white/50 mb-4 px-1">{t.triage.cardTitle}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.triage.groups.map((g) => (
              <div key={g.name} className="liquid-glass rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="text-xs font-medium text-white">{g.name}</span>
                  </div>
                  <span className="text-[10px] text-white/40">({g.count})</span>
                </div>
                <ul className="space-y-1">
                  {g.items.map((it, i) => (
                    <li key={i} className="text-[11px] text-white/55 truncate">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
