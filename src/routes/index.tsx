import { createFileRoute } from "@tanstack/react-router";
import { CinematicFilm } from "@/components/landing/CinematicFilm";
import { MissionControl } from "@/components/dashboard/MissionControl";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eclipta - The arena is open." },
      {
        name: "description",
        content:
          "1v1 knowledge battles, 8 classes, 8 ranked tiers, and collectible Ecliptars. Eclipta turns learning into a competitive arena.",
      },
      { property: "og:title", content: "Eclipta - The arena is open." },
      {
        property: "og:description",
        content:
          "Pick a class. Queue up. Land combos. Climb the ranks. Eclipta is the learning arena - battle-first, AI-tutored, fully gamified.",
      },
    ],
  }),
  component: Index,
});

/**
 * The root route serves two entirely different products.
 *
 * A signed-in learner landing on the marketing film has to scroll past a pitch
 * for something they already bought before they can do anything - so they get
 * Mission Control instead. Signed-out visitors still get the film.
 *
 * `loading` renders neither: flashing the marketing page for a frame before
 * swapping to the dashboard is worse than a brief blank, because the layout
 * shift is large and lands exactly where the user is about to click.
 */
function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen" aria-hidden="true" />;
  return isAuthenticated ? <MissionControl /> : <CinematicFilm />;
}
