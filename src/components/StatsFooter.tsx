import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function StatsFooter() {
  const [learners, setLearners] = useState<number | null>(null);
  const [battles, setBattles] = useState<number | null>(null);
  const [ecliptars, setEcliptars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_platform_stats");
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setLearners(0); setBattles(0); setEcliptars(0);
        return;
      }
      setLearners(Number(row.learners) || 0);
      setBattles(Number(row.battles) || 0);
      setEcliptars(Number(row.ecliptars) || 0);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Stats bar */}
        <div className="py-12 flex flex-col md:flex-row justify-between items-center gap-8 border-b border-border">
          <div className="flex flex-wrap gap-8 md:gap-16">
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">{formatCount(learners)}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Learners Joined</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">{formatCount(battles)}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Battles Fought</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums font-display">{formatCount(ecliptars)}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Ecliptars Claimed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">Arena Status: Active</span>
          </div>
        </div>

        {/* Footer links */}
        <div className="py-12 flex flex-col md:flex-row justify-between items-center gap-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-neon-purple" />
            <span className="font-display font-bold tracking-tighter text-xl">ECLIPTA</span>
          </Link>
          <div className="flex flex-wrap justify-center gap-8 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Link to="/certified" className="hover:text-neon-purple transition-colors">Courses</Link>
            <Link to="/battles" className="hover:text-neon-purple transition-colors">Arena</Link>
            <Link to="/forum" className="hover:text-neon-purple transition-colors">Forum</Link>
            <Link to="/about" className="hover:text-neon-purple transition-colors">About</Link>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            © 2026 Eclipta Learning Systems
          </p>
        </div>
      </div>
    </footer>
  );
}
