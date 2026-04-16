import { Link } from "@tanstack/react-router";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-2xl font-bold tracking-tighter text-neon-purple font-display">
            ECLIPTA
          </Link>
          <div className="hidden md:flex gap-6 text-sm font-medium tracking-wide text-muted-foreground">
            <Link to="/" className="hover:text-neon-purple transition-colors">ARENA</Link>
            <Link to="/progress" className="hover:text-neon-purple transition-colors">PROGRESS</Link>
            <Link to="/certified" className="hover:text-neon-purple transition-colors">CERTIFIED</Link>
            <Link to="/build-course" className="hover:text-neon-purple transition-colors">BUILD</Link>
            <Link to="/adaptive-tests" className="hover:text-neon-purple transition-colors">TESTS</Link>
            <Link to="/battles" className="hover:text-neon-purple transition-colors">BATTLES</Link>
            <Link to="/forum" className="hover:text-neon-purple transition-colors">FORUM</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="px-4 py-1.5 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-foreground transition-colors">
            LOGIN
          </button>
          <button className="px-4 py-1.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity">
            ENTER ARENA
          </button>
        </div>
      </div>
    </nav>
  );
}
