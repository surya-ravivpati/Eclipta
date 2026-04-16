import { createFileRoute } from "@tanstack/react-router";
import { LunaFullSession } from "@/components/luna/LunaFullSession";

export const Route = createFileRoute("/_authenticated/luna")({
  head: () => ({
    meta: [
      { title: "Luna – Your AI Tutor | Eclipta" },
      { name: "description", content: "Deep 1-on-1 Socratic tutoring session with Luna, your adaptive AI learning companion." },
      { property: "og:title", content: "Luna – Your AI Tutor | Eclipta" },
      { property: "og:description", content: "Deep 1-on-1 Socratic tutoring session with Luna." },
    ],
  }),
  component: LunaPage,
});

function LunaPage() {
  return <LunaFullSession />;
}
