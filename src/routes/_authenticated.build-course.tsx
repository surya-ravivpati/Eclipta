import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { CourseBuilder } from "@/components/CourseBuilder";

export const Route = createFileRoute("/_authenticated/build-course")({
  head: () => ({
    meta: [
      { title: "Build a Course – Eclipta" },
      { name: "description", content: "Create and share your own learning courses on Eclipta. Choose a topic, set your level, and design the perfect learning path." },
      { property: "og:title", content: "Build a Course – Eclipta" },
      { property: "og:description", content: "Create and share your own learning courses on Eclipta." },
    ],
  }),
  component: BuildCoursePage,
});

function BuildCoursePage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <CourseBuilder />
    </div>
  );
}
