import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Forum } from "@/components/Forum";

export const Route = createFileRoute("/_authenticated/forum")({
  head: () => ({
    meta: [
      { title: "Forum – Eclipta Community" },
      { name: "description", content: "Ask questions, rate answers, and join course-specific discussions. The best insights rise to the top." },
      { property: "og:title", content: "Forum – Eclipta Community" },
      { property: "og:description", content: "Community-driven Q&A with rated answers and course-specific discussions." },
    ],
  }),
  component: ForumPage,
});

function ForumPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <Forum />
    </div>
  );
}
