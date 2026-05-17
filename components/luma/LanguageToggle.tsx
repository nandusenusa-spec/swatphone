'use client';

import { useT } from '@/lib/luma/i18n';

export default function LanguageToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-3 py-1 rounded-full transition-colors ${
          lang === 'en' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('es')}
        className={`px-3 py-1 rounded-full transition-colors ${
          lang === 'es' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        ES
      </button>
    </div>
  );
}
