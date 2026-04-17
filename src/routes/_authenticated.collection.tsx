import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sparkles, Lock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { ECLIPTARS, getEcliptarsByArchetype } from "@/lib/ecliptars";
import { useOwnedEcliptars, usePlayerXp } from "@/hooks/use-player-xp";
import { cn } from "@/lib/utils";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export const Route = createFileRoute("/_authenticated/collection")({
  head: () => ({
    meta: [
      { title: "My Ecliptars – Eclipta" },
      { name: "description", content: "Browse your claimed Ecliptars, organized by archetype, and track collection progress." },
      { property: "og:title", content: "My Ecliptars – Eclipta" },
      { property: "og:description", content: "Your personal Ecliptar collection." },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { slugs, loading } = useOwnedEcliptars();
  const { xp } = usePlayerXp();
  const total = ECLIPTARS.length;
  const owned = ECLIPTARS.filter((e) => slugs.has(e.slug)).length;
  const archetypeKeys = Object.keys(ARCHETYPES) as MonsterArchetypeKey[];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16 max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-purple/30 bg-neon-purple/10 text-neon-purple text-xs font-bold tracking-widest mb-6">
            <Sparkles className="w-3 h-3" />
            ECLIPTAR COLLECTION
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-display tracking-tight mb-4">
            My{" "}
            <span className="text-neon-pink">
              Ecliptars
            </span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto mb-2">
            Monsters you've claimed from the Trophy Road. Use them in battle.
          </p>
          <p className="text-sm font-bold tracking-widest text-neon-purple">
            {owned} / {total} COLLECTED · {xp.toLocaleString()} XP
          </p>
        </motion.div>

        {loading ? (
          <div className="text-center text-muted-foreground py-20">Loading your collection…</div>
        ) : (
          <div className="space-y-10">
            {archetypeKeys.map((archKey) => {
              const arch = ARCHETYPES[archKey];
              const eclips = getEcliptarsByArchetype(archKey);
              const ownedCount = eclips.filter((e) => slugs.has(e.slug)).length;

              return (
                <motion.div
                  key={archKey}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{arch.emoji}</span>
                      <div>
                        <h2 className={cn("text-xl font-bold font-display", arch.color)}>{arch.name}</h2>
                        <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
                          {arch.passive}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-bold tracking-widest px-2 py-1 rounded-full border",
                        ownedCount === eclips.length
                          ? "border-emerald-500/50 text-emerald-400"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {ownedCount}/{eclips.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {eclips.map((e) => {
                      const isOwned = slugs.has(e.slug);
                      return (
                        <motion.div
                          key={e.slug}
                          className={cn(
                            "glass-panel p-4 border text-center relative overflow-hidden",
                            isOwned ? arch.borderColor : "border-border/30 opacity-60"
                          )}
                          whileHover={isOwned ? { scale: 1.04, y: -2 } : {}}
                        >
                          {!isOwned && (
                            <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex items-center justify-center">
                              <Lock className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="text-4xl mb-2">{e.avatar}</div>
                          <div className={cn("text-sm font-bold font-display", isOwned ? arch.color : "text-muted-foreground")}>
                            {e.name}
                          </div>
                          <div className="text-[9px] tracking-widest text-muted-foreground mt-1">
                            {arch.name.toUpperCase()}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="text-center mt-12">
          <Link
            to="/progress"
            className="inline-block px-6 py-3 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
          >
            UNLOCK MORE ON THE TROPHY ROAD
          </Link>
        </div>
      </section>
    </div>
  );
}
