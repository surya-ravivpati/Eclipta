import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FeaturesGrid } from "@/components/FeaturesGrid";
import { TrophyRoad } from "@/components/TrophyRoad";
import { StatsFooter } from "@/components/StatsFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eclipta – A Smarter Way to Learn" },
      { name: "description", content: "The world's first adaptive learning arena. Master complex disciplines through AI-driven growth paths, battles, and personalized courses." },
      { property: "og:title", content: "Eclipta – A Smarter Way to Learn" },
      { property: "og:description", content: "Adaptive learning arena with AI guidance, knowledge battles, and trophy roads." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <HeroSection />
      <FeaturesGrid />
      <TrophyRoad compact />
      <StatsFooter />
    </div>
  );
}
