import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { LandingShowcase } from "@/components/landing/LandingShowcase";
import { StatsFooter } from "@/components/StatsFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eclipta - Learn Like You Play" },
      { name: "description", content: "Adaptive learning arena. Luna AI tutor, certified courses, custom syllabi, adaptive tests, knowledge battles, trophy road, and a course-tagged forum - all in one place." },
      { property: "og:title", content: "Eclipta - Learn Like You Play" },
      { property: "og:description", content: "AI tutor, adaptive tests, 1v1 knowledge battles, trophy road, and collectible Ecliptars. Eight surfaces, one arena." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <LandingShowcase />
      <StatsFooter />
    </div>
  );
}
