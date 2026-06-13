import { createFileRoute } from "@tanstack/react-router";
import { CinematicFilm } from "@/components/landing/CinematicFilm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eclipta — The arena is open." },
      { name: "description", content: "1v1 knowledge battles, 8 classes, 8 ranked tiers, and collectible Ecliptars. Eclipta turns learning into a competitive arena." },
      { property: "og:title", content: "Eclipta — The arena is open." },
      { property: "og:description", content: "Pick a class. Queue up. Land combos. Climb the ranks. Eclipta is the learning arena — battle-first, AI-tutored, fully gamified." },
    ],
  }),
  component: Index,
});

function Index() {
  return <CinematicFilm />;
}
