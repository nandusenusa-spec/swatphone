import { MessageCircle, Send } from 'lucide-react';

export function ComingSoon() {
  return (
    <section id="coming-soon" className="py-20 px-4 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold mb-4">Chat with us soon</h2>
        <p className="text-white/60 mb-12">
          Connect directly via WhatsApp & Instagram. Available soon.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 justify-center">
          {/* WhatsApp - Coming Soon */}
          <div className="liquid-glass p-8 rounded-xl flex-1">
            <MessageCircle size={40} className="mx-auto mb-4 text-white/40" />
            <h3 className="font-semibold mb-2">WhatsApp</h3>
            <p className="text-sm text-white/50 mb-4">Direct messaging</p>
            <button disabled className="btn-ghost opacity-50 cursor-not-allowed w-full">
              Coming Soon
            </button>
          </div>

          {/* Instagram - Coming Soon */}
          <div className="liquid-glass p-8 rounded-xl flex-1">
            <Send size={40} className="mx-auto mb-4 text-white/40" />
            <h3 className="font-semibold mb-2">Instagram DM</h3>
            <p className="text-sm text-white/50 mb-4">Direct messages</p>
            <button disabled className="btn-ghost opacity-50 cursor-not-allowed w-full">
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
