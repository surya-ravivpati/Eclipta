import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { CertifiedCourses } from "@/components/CertifiedCourses";

export const Route = createFileRoute("/_authenticated/certified")({
  head: () => ({
    meta: [
      { title: "Certified Courses – Eclipta" },
      { name: "description", content: "Premium, verified courses crafted by Eclipta's team and trusted creators. Structured paths to recognized mastery." },
      { property: "og:title", content: "Certified Courses – Eclipta" },
      { property: "og:description", content: "Premium verified courses with clear outcomes and recognized qualifications." },
    ],
  }),
  component: CertifiedPage,
});

function CertifiedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <CertifiedCourses />
    </div>
  );
}
