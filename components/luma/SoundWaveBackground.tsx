'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

/* Fullscreen animated sound-wave backdrop. Replaces the hero video. */
export default function SoundWaveBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setParticles(
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2,
        duration: 8 + Math.random() * 10,
        delay: Math.random() * 6,
      }))
    );
  }, []);

  const waveColors = [
    'rgba(0,210,255,0.10)',
    'rgba(164,244,253,0.08)',
    'rgba(11,37,81,0.18)',
    'rgba(0,210,255,0.06)',
    'rgba(255,255,255,0.05)',
  ];

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0c0c0c] via-[#0c0c0c] to-[#070d1a]" />

      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(900px circle at 50% -10%, rgba(0,210,255,0.10), transparent 60%)',
        }}
      />

      {mounted && (
        <>
          <svg
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            viewBox="0 0 1200 800"
            aria-hidden
          >
            {waveColors.map((color, i) => {
              const baseY = 380 + i * 32;
              const amp1 = 60 + i * 15;
              const amp2 = 50 + i * 12;
              return (
                <motion.path
                  key={i}
                  stroke={color}
                  strokeWidth={1.2}
                  fill="none"
                  initial={{
                    d: `M0,${baseY} Q300,${baseY - amp1} 600,${baseY} T1200,${baseY}`,
                  }}
                  animate={{
                    d: [
                      `M0,${baseY} Q300,${baseY - amp1} 600,${baseY + amp2} T1200,${baseY}`,
                      `M0,${baseY} Q300,${baseY + amp1} 600,${baseY - amp2} T1200,${baseY}`,
                      `M0,${baseY} Q300,${baseY - amp1} 600,${baseY + amp2} T1200,${baseY}`,
                    ],
                  }}
                  transition={{
                    duration: 9 + i * 1.7,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              );
            })}

            {[0, 1, 2].map((i) => (
              <motion.circle
                key={`pulse-${i}`}
                cx="600"
                cy="400"
                r="60"
                fill="none"
                stroke="rgba(0,210,255,0.18)"
                strokeWidth={0.8}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 3.4], opacity: [0.35, 0] }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: i * 2,
                }}
                style={{ transformOrigin: '600px 400px' }}
              />
            ))}
          </svg>

          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full bg-white/30"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
              }}
              animate={{
                y: [-10, 10, -10],
                opacity: [0.1, 0.5, 0.1],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: p.delay,
              }}
            />
          ))}
        </>
      )}

      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background: 'linear-gradient(to top, rgba(12,12,12,0.85), transparent)',
        }}
      />
    </div>
  );
}
