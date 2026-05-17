'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { SectionEyebrow } from './primitives';
import { useT } from '@/lib/luma/i18n';

const BAR_COUNT = 56;

type VoiceBar = {
  id: number;
  idle: number;
  peak1: number;
  peak2: number;
  peak3: number;
  duration: number;
  delay: number;
};

export default function VoiceDemo() {
  const { t } = useT();
  const [playing, setPlaying] = useState(false);
  const [bars, setBars] = useState<VoiceBar[]>([]);
  const [mounted, setMounted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setMounted(true);
    setBars(
      Array.from({ length: BAR_COUNT }, (_, i) => ({
        id: i,
        idle: 8 + Math.random() * 22,
        peak1: 30 + Math.random() * 70,
        peak2: 20 + Math.random() * 80,
        peak3: 25 + Math.random() * 75,
        duration: 0.6 + Math.random() * 0.6,
        delay: i * 0.015,
      }))
    );
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) {
      setPlaying((p) => !p);
      return;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(true);
      }
    }
  };

  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          <SectionEyebrow label={t.voice.eyebrow} tag={t.voice.tag} />
          <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
            <span className="block">{t.voice.title1}</span>
            <span className="block text-white/70">{t.voice.title2}</span>
          </h2>
          <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">{t.voice.desc}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="liquid-glass rounded-3xl p-6 md:p-8"
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t.voice.pause : t.voice.play}
              className="shrink-0 w-14 h-14 rounded-full bg-white text-black inline-flex items-center justify-center hover:scale-[1.03] active:scale-[0.97] transition-transform"
            >
              {playing ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 translate-x-[1px]" />
              )}
            </button>

            <div className="flex-1 h-24 flex items-center gap-[3px]">
              {!mounted
                ? Array.from({ length: BAR_COUNT }, (_, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-full bg-gradient-to-t from-[#0B2551] via-[#00d2ff] to-[#A4F4FD] opacity-85"
                      style={{ height: '18%' }}
                    />
                  ))
                : bars.map((b) => (
                    <motion.span
                      key={b.id}
                      className="flex-1 rounded-full bg-gradient-to-t from-[#0B2551] via-[#00d2ff] to-[#A4F4FD]"
                      initial={{ height: `${b.idle}%` }}
                      animate={
                        playing
                          ? {
                              height: [
                                `${b.idle}%`,
                                `${b.peak1}%`,
                                `${b.peak2}%`,
                                `${b.peak3}%`,
                                `${b.idle}%`,
                              ],
                            }
                          : { height: `${b.idle}%` }
                      }
                      transition={{
                        duration: b.duration,
                        repeat: playing ? Infinity : 0,
                        ease: 'easeInOut',
                        delay: b.delay,
                      }}
                      style={{ opacity: 0.85 }}
                    />
                  ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-white/40">
            <span>{t.voice.caption}</span>
            <span>{playing ? '● rec' : '○ ready'}</span>
          </div>

          <audio
            ref={audioRef}
            src="/luma-voice-sample.wav"
            preload="none"
            onEnded={() => setPlaying(false)}
          />
        </motion.div>
      </div>
    </section>
  );
}
