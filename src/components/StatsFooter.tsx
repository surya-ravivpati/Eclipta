export function StatsFooter() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Stats bar */}
        <div className="py-12 flex flex-col md:flex-row justify-between items-center gap-8 border-b border-border">
          <div className="flex gap-16">
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">842K</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Learners Active</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">14.2M</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Battles Fought</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">2.1K</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Courses Live</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">Arena Status: Active</span>
          </div>
        </div>

        {/* Footer links */}
        <div className="py-12 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-neon-purple" />
            <span className="font-display font-bold tracking-tighter text-xl">ECLIPTA</span>
          </div>
          <div className="flex gap-8 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <a href="#" className="hover:text-neon-purple transition-colors">Courses</a>
            <a href="#" className="hover:text-neon-purple transition-colors">Arena</a>
            <a href="#" className="hover:text-neon-purple transition-colors">Forum</a>
            <a href="#" className="hover:text-neon-purple transition-colors">About</a>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            © 2026 Eclipta Learning Systems
          </p>
        </div>
      </div>
    </footer>
  );
}
