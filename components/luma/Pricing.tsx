'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useT } from '@/lib/luma/i18n';

export default function Pricing() {
  const { t } = useT();
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="c3-pricing-section relative z-10 scroll-mt-24">
      {/* Pricing-scoped noise filter (id referenced by .c3-watermark-main) */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute' }}
        aria-hidden
        focusable="false"
      >
        <filter id="luma-noise-pricing">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.5"
            numOctaves={2}
            stitchTiles="stitch"
          />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.075" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
        </filter>
      </svg>

      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">{t.pricing.watermark1}</span>
          <span className="c3-watermark-line-2">{t.pricing.watermark2}</span>
        </div>
      </div>

      <div className="c3-grid">
        {t.pricing.plans.map((p, i) => {
          const price = yearly ? p.priceYearly : p.priceMonthly;
          const isPro = i === 2;
          return (
            <div key={p.tier} className={`c3-card ${isPro ? 'c3-card-pro' : ''}`}>
              <div className="c3-tier-small">{p.tier}</div>
              <div className="c3-tier-large">{price}</div>
              <div className="c3-desc">{p.desc}</div>
              <ul className="c3-list">
                {p.features.map((f) => (
                  <li key={f}>
                    <span className="c3-check">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/sign-up" className="c3-btn">
                {t.pricing.choose}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="c3-toggle-wrap">
        <span>{t.pricing.monthly}</span>
        <button
          type="button"
          aria-label="Toggle billing period"
          onClick={() => setYearly((v) => !v)}
          className={`c3-toggle ${yearly ? 'active' : ''}`}
        >
          <span className="c3-toggle-knob" />
        </button>
        <span>{t.pricing.yearly}</span>
      </div>
    </section>
  );
}
