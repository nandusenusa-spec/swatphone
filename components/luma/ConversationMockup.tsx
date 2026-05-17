'use client';

import { motion } from 'motion/react';
import {
  Sparkles,
  Inbox,
  Phone,
  MessageCircle,
  FileText,
  Mail,
  Archive,
  Search,
  Reply,
  Forward,
  Trash2,
  MoreHorizontal,
  Paperclip,
} from 'lucide-react';
import { useT } from '@/lib/luma/i18n';

export default function ConversationMockup() {
  const { t } = useT();

  const channels = [
    { icon: Inbox, label: t.inbox.channels.all, count: 12, active: true },
    { icon: MessageCircle, label: t.inbox.channels.whatsapp, count: 6 },
    { icon: Phone, label: t.inbox.channels.calls, count: 3 },
    { icon: FileText, label: t.inbox.channels.forms, count: 2 },
    { icon: Mail, label: t.inbox.channels.email },
    { icon: Archive, label: t.inbox.channels.archive },
  ];

  const labels = [
    { name: t.inbox.labels.hot, color: '#00d2ff' },
    { name: t.inbox.labels.meetings, color: '#A4F4FD' },
    { name: t.inbox.labels.followup, color: '#f59e0b' },
    { name: t.inbox.labels.closed, color: '#10b981' },
  ];

  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ delay: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
      >
        {/* Title bar */}
        <div className="flex items-center px-4 py-3 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 text-center text-xs text-white/50">{t.inbox.title}</div>
        </div>

        <div className="grid grid-cols-12 h-[520px]">
          {/* Sidebar */}
          <aside className="hidden md:flex col-span-3 border-r border-white/10 bg-black/30 p-4 flex-col">
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2 mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              {t.inbox.compose}
            </button>
            <nav className="flex flex-col gap-0.5">
              {channels.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.label}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      c.active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" />
                      {c.label}
                    </span>
                    {c.count ? (
                      <span className="text-[10px] text-white/40">{c.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-white/40 px-2 mb-2">
                {t.inbox.labels.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {labels.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-white/60 hover:bg-white/5"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: l.color }}
                    />
                    {l.name}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Message list */}
          <div className="col-span-12 md:col-span-4 border-r border-white/10 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 py-3 border-b border-white/10 text-xs text-white/40">
              <Search className="w-3.5 h-3.5" />
              <span>{t.inbox.searchPlaceholder}</span>
            </div>
            {t.inbox.messages.map((m, i) => (
              <button
                key={`${m.name}-${i}`}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors ${
                  i === 0 ? 'bg-white/[0.04]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {i < 2 && <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff]" />}
                    <span className="text-sm font-semibold text-white">{m.name}</span>
                  </div>
                  <span className="text-[10px] text-white/40">{m.time}</span>
                </div>
                <div className="text-xs text-white/70 truncate">{m.subject}</div>
                <div className="text-[11px] text-white/40 truncate mt-0.5">{m.preview}</div>
                <div className="text-[10px] text-white/30 mt-1">{m.channel}</div>
              </button>
            ))}
          </div>

          {/* Reader */}
          <div className="hidden md:flex col-span-5 flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <div className="flex items-center gap-1">
                {[Reply, Forward, Archive, Trash2].map((Icon, i) => (
                  <button
                    key={i}
                    className="w-7 h-7 rounded-md hover:bg-white/5 inline-flex items-center justify-center text-white/60 hover:text-white"
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              <button className="w-7 h-7 rounded-md hover:bg-white/5 inline-flex items-center justify-center text-white/60">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">{t.inbox.readerTitle}</h3>
              <div className="flex items-center gap-3 mt-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] flex items-center justify-center text-[11px] font-bold text-white">
                  S
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-white">{t.inbox.messages[0].name}</div>
                  <div className="text-[10px] text-white/40">{t.inbox.readerMeta}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#00d2ff]/30 text-[#00d2ff] bg-[#00d2ff]/5">
                  {t.inbox.hotLabel}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 overflow-y-auto text-xs text-white/80 space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: '#A4F4FD' }} />
                  <span className="text-[11px] font-semibold text-white">
                    {t.inbox.summaryLabel}
                  </span>
                </div>
                <p className="text-[11px] text-white/60 leading-[1.5]">{t.inbox.summaryText}</p>
              </div>

              {t.inbox.body.map((p, i) => (
                <p
                  key={i}
                  className={`leading-[1.6] ${
                    i === t.inbox.body.length - 1 ? 'text-white/50' : ''
                  }`}
                >
                  {p}
                </p>
              ))}

              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 bg-white/[0.02] text-[11px] text-white/70">
                <Paperclip className="w-3 h-3" />
                {t.inbox.attachment}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
