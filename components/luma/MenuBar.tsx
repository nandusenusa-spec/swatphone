'use client';

import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import { LogoMark } from './primitives';
import { useT } from '@/lib/luma/i18n';

export default function MenuBar() {
  const { t } = useT();

  const items = [t.menu.file, t.menu.edit, t.menu.view, t.menu.go, t.menu.window, t.menu.help];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.5 }}
      className="relative z-10 h-10 bg-black/40 backdrop-blur-md border-t border-b border-white/10"
    >
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between text-xs text-white/80">
        <div className="flex items-center gap-4">
          <LogoMark className="w-3.5 h-3.5 text-white" />
          <span className="font-bold text-white">Luma</span>
          {items.map((label, i) => (
            <span
              key={label}
              className={`text-white/70 hover:text-white transition-colors ${
                i > 2 ? 'hidden sm:inline' : ''
              } ${i > 3 ? 'hidden md:inline' : ''}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-white/60">
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t.menu.date}</span>
        </div>
      </div>
    </motion.div>
  );
}
