import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { I18nProvider } from '@/lib/luma/i18n';
import '@/styles/luma-marketing.css';

const lumaSans = Inter({
  subsets: ['latin'],
  variable: '--font-luma-sans',
});

export const metadata: Metadata = {
  title: 'Luma — AI receptionist & CRM',
  description:
    'Luma is the AI receptionist that answers, qualifies, and books across phone, WhatsApp, and web. Never miss a lead again.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`luma-marketing min-h-screen ${lumaSans.variable} ${lumaSans.className}`}>
      <I18nProvider>{children}</I18nProvider>
    </div>
  );
}
