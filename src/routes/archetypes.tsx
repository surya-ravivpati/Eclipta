import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { ArchetypesCompass } from "@/components/archetypes/ArchetypesCompass";

export const Route = createFileRoute("/archetypes")({
  head: () => ({
    meta: [
      { title: "Archetypes – Eclipta" },
      { name: "description", content: "Travel the compass of Eclipta. Eight archetypes, eight philosophies, one arena." },
      { property: "og:title", content: "Archetypes – Eclipta" },
      { property: "og:description", content: "An immersive scroll-driven tour through the eight Eclipta archetypes." },
    ],
  }),
  component: ArchetypesPage,
});

function ArchetypesPage() {
  return (
    <div className="bg-background text-foreground antialiased">
      {/* Intro — one viewport tall, sets the tone before the compass begins. */}
      <section className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 50%, oklch(0.55 0.25 290 / 0.10) 0%, transparent 70%), radial-gradient(40% 60% at 80% 20%, oklch(0.60 0.24 350 / 0.08) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 pointer-events-none opacity-[0.25]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, oklch(1 0 0 / 0.18) 1px, transparent 1.5px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(circle at 50% 50%, black 0%, transparent 80%)",
          }}
          aria-hidden
        />

        <motion.div
          className="relative max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-purple/30 bg-neon-purple/10 text-neon-purple text-[10px] font-bold tracking-[0.4em] uppercase mb-8">
            <Sparkles className="w-3 h-3" />
            THE COMPASS
          </div>
          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-tight leading-[1.02] mb-6">
            Every fighter starts<br />
            <span className="text-neon-pink">at a direction.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            Eight archetypes. Eight philosophies of combat. Travel the wheel
            and let each one introduce itself. There is no neutral here —
            every player picks a heading and follows it into the arena.
          </p>
          <div className="inline-flex flex-col items-center gap-3 text-muted-foreground">
            <p className="text-[10px] font-bold tracking-[0.4em] uppercase">
              Scroll to begin
            </p>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowDown className="w-5 h-5" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* The compass itself — eight pinned acts. */}
      <ArchetypesCompass />

      {/* Outro CTA — once the wheel is finished, push to the arena. */}
      <section className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 50%, oklch(0.60 0.24 350 / 0.12) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <motion.div
          className="relative max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <p className="text-[10px] font-bold tracking-[0.4em] text-neon-cyan uppercase mb-6">
            The journey ends in the arena
          </p>
          <h2 className="font-display font-bold text-4xl md:text-6xl tracking-tight mb-6 leading-[1.05]">
            Pick your heading.<br />
            <span className="text-neon-pink">Then prove it.</span>
          </h2>
          <p className="text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed">
            Every archetype rewards a different kind of player. Find yours
            inside a live battle — the only honest way to know.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-neon-pink text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
            >
              ENTER THE ARENA
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 border border-border text-xs font-bold tracking-widest hover:border-neon-purple transition-colors"
            >
              BACK TO HOME
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
