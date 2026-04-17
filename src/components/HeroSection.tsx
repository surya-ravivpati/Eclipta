import { motion } from "framer-motion";
import heroImage from "@/assets/hero-arena.jpg";

export function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-neon-purple/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[10%] left-[-5%] w-80 h-80 bg-neon-pink/10 rounded-full blur-[100px]" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative">
        <motion.div
          className="lg:col-span-7"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-block px-3 py-1 mb-6 border border-neon-pink/50 text-neon-pink text-[10px] font-bold tracking-[0.2em] uppercase">
            Season 01: The Awakening
          </div>
          <h1 className="text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 font-display">
            LEARN AT <br />
            <span className="text-neon-purple">
              VELOCITY.
            </span>
          </h1>
          <p className="max-w-[45ch] text-lg text-muted-foreground mb-10 leading-relaxed">
            The world's first adaptive learning arena. Master complex disciplines through
            AI-driven growth paths, high-stakes battles, and personalized courses.
          </p>
          <div className="flex flex-wrap gap-4">
            <button className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-widest flex items-center gap-3 group transition-all hover:scale-105 neon-glow-pink">
              START YOUR ASCENT
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
            <div className="flex -space-x-3 items-center">
              <div className="w-12 h-12 border border-border bg-card rounded-sm overflow-hidden">
                <div className="w-full h-full bg-neon-purple/20" />
              </div>
              <div className="w-12 h-12 border border-border bg-card rounded-sm overflow-hidden">
                <div className="w-full h-full bg-neon-pink/20" />
              </div>
              <div className="w-12 h-12 border border-border bg-card rounded-sm overflow-hidden">
                <div className="w-full h-full bg-neon-cyan/20" />
              </div>
              <div className="w-12 h-12 border border-border bg-acrylic flex items-center justify-center text-[10px] font-bold text-neon-purple">
                +12K
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle Preview Card */}
        <motion.div
          className="lg:col-span-5 relative"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="absolute -inset-1 bg-gradient-to-tr from-neon-purple/20 to-neon-pink/20 blur-2xl opacity-50" />
          <div className="relative glass-panel p-8">
            <div className="flex justify-between items-end mb-12">
              <div>
                <p className="text-[10px] tracking-widest text-muted-foreground mb-1 uppercase font-bold">Active Battle</p>
                <h3 className="text-2xl font-bold font-display">Quantum Mechanics</h3>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-neon-purple">04:12</p>
                <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Time Remaining</p>
              </div>
            </div>

            <div className="space-y-6 mb-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-neon-purple/20 border border-neon-purple flex items-center justify-center font-bold text-xs">1</div>
                    <span className="text-sm font-semibold tracking-tight">Kaito_Zero</span>
                  </div>
                  <span className="text-sm font-mono text-neon-purple">2,840 XP</span>
                </div>
                <div className="h-1 bg-secondary w-full"><div className="h-full bg-neon-purple w-[85%]" /></div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-secondary border border-border flex items-center justify-center font-bold text-xs text-muted-foreground">2</div>
                    <span className="text-sm font-semibold tracking-tight text-muted-foreground">Sarah_Vance</span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">2,410 XP</span>
                </div>
                <div className="h-1 bg-secondary w-full"><div className="h-full bg-muted-foreground/30 w-[62%]" /></div>
              </div>
            </div>

            <button className="w-full py-4 border border-border text-xs font-bold tracking-widest hover:bg-foreground hover:text-background transition-all">
              SPECTATE MATCH
            </button>
          </div>
        </motion.div>
      </div>

      {/* Hero Image */}
      <motion.div
        className="max-w-7xl mx-auto mt-20 relative"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <div className="absolute -inset-2 bg-gradient-to-r from-neon-purple/20 to-neon-pink/10 blur-3xl opacity-40" />
        <div className="relative border border-border rounded-xl overflow-hidden">
          <img src={heroImage} alt="Eclipta Arena" className="w-full aspect-video object-cover opacity-70" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          <div className="absolute bottom-8 left-8 glass-panel px-6 py-4 flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-neon-purple animate-pulse" />
            <span className="text-xs font-mono text-neon-purple tracking-tighter uppercase">Neural Engine Active • Personalization: 94%</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
