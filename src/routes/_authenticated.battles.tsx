import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { KnowledgeBattles } from "@/components/KnowledgeBattles";

export const Route = createFileRoute("/_authenticated/battles")({
  head: () => ({
    meta: [
      { title: "Knowledge Battles – Eclipta" },
      { name: "description", content: "Pokémon-style PvP duels powered by what you've learned. Build combos, climb ranks, and earn XP." },
      { property: "og:title", content: "Knowledge Battles – Eclipta" },
      { property: "og:description", content: "Real-time knowledge battles with combo systems, leaderboards, and daily challenges." },
    ],
  }),
  component: BattlesPage,
});

function BattlesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <KnowledgeBattles />
    </div>
  );
}
