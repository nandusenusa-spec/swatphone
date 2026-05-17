import Navbar from '@/components/luma/Navbar';
import Hero from '@/components/luma/Hero';
import MenuBar from '@/components/luma/MenuBar';
import ConversationMockup from '@/components/luma/ConversationMockup';
import FeatureTriage from '@/components/luma/FeatureTriage';
import VoiceDemo from '@/components/luma/VoiceDemo';
import LogoCloud from '@/components/luma/LogoCloud';
import Testimonials from '@/components/luma/Testimonials';
import Pricing from '@/components/luma/Pricing';
import FinalCTA from '@/components/luma/FinalCTA';
import SoundWaveBackground from '@/components/luma/SoundWaveBackground';
import { NoiseFilters, GuideLines } from '@/components/luma/primitives';

export default function MarketingHomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white">
      <NoiseFilters />
      <SoundWaveBackground />
      <GuideLines />

      <Navbar />
      <Hero />
      <MenuBar />
      <ConversationMockup />
      <FeatureTriage />
      <VoiceDemo />
      <LogoCloud />
      <Testimonials />
      <Pricing />
      <FinalCTA />
    </main>
  );
}
