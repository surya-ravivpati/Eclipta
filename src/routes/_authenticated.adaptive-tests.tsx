import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { AdaptiveTests } from "@/components/AdaptiveTests";

export const Route = createFileRoute("/_authenticated/adaptive-tests")({
  head: () => ({
    meta: [
      { title: "Adaptive Tests – Eclipta" },
      { name: "description", content: "Tests that evolve with you. Eclipta's adaptive engine targets your weak spots, scales difficulty in real time, and matches test formats to your course." },
      { property: "og:title", content: "Adaptive Tests – Eclipta" },
      { property: "og:description", content: "Dynamic tests that adapt to your performance and focus on your weak spots." },
    ],
  }),
  component: AdaptiveTestsPage,
});

function AdaptiveTestsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <AdaptiveTests />
    </div>
  );
}
