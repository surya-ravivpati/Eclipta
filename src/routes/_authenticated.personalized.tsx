import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { PersonalizedLearning } from "@/components/PersonalizedLearning";

export const Route = createFileRoute("/_authenticated/personalized")({
  head: () => ({
    meta: [
      { title: "Personalized Learning – Eclipta" },
      { name: "description", content: "Eclipta learns your interests, pace, and weak spots over time to deliver a learning experience tailored specifically to you." },
      { property: "og:title", content: "Personalized Learning – Eclipta" },
      { property: "og:description", content: "The more you use Eclipta, the more it adapts to how you learn." },
    ],
  }),
  component: PersonalizedPage,
});

function PersonalizedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <PersonalizedLearning />
    </div>
  );
}
