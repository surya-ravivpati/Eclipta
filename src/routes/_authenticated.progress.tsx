import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { ProgressDashboard } from "@/components/ProgressDashboard";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({
    meta: [
      { title: "Your Progress – Eclipta" },
      { name: "description", content: "Track your learning progress, explore structured paths, earn trophies, and collaborate with study groups on Eclipta." },
      { property: "og:title", content: "Your Progress – Eclipta" },
      { property: "og:description", content: "Course tracking, learning paths, trophy milestones, AI recommendations, and collaboration tools." },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <ProgressDashboard />
    </div>
  );
}
