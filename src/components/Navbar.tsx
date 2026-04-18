import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User, Menu, X } from "lucide-react";
import { toast } from "sonner";

const NAV_LINKS = [
  { to: "/", label: "ARENA" },
  { to: "/progress", label: "PROGRESS" },
  { to: "/collection", label: "COLLECTION" },
  { to: "/certified", label: "CERTIFIED" },
  { to: "/build-course", label: "BUILD" },
  { to: "/adaptive-tests", label: "TESTS" },
  { to: "/battles", label: "BATTLES" },
  { to: "/luna", label: "LUNA" },
  { to: "/forum", label: "FORUM" },
  { to: "/about", label: "ABOUT" },
] as const;

export function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8 min-w-0">
          <Link to="/" className="text-2xl font-bold tracking-tighter text-neon-purple font-display shrink-0">
            ECLIPTA
          </Link>
          <div className="hidden lg:flex gap-5 text-sm font-medium tracking-wide text-muted-foreground">
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-neon-purple transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/30 border border-border hover:border-neon-purple/40 transition-colors"
                title="View profile"
              >
                <User className="w-3.5 h-3.5 text-neon-purple" />
                <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                  {user?.email?.split("@")[0]}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 text-muted-foreground hover:text-neon-pink transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-block px-4 py-1.5 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-foreground transition-colors">
                LOGIN
              </Link>
              <Link to="/signup" className="hidden sm:inline-block px-4 py-1.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity">
                SIGN UP
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 text-foreground hover:text-neon-purple transition-colors"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 text-sm font-medium tracking-wide text-muted-foreground hover:text-neon-purple hover:bg-secondary/30 transition-colors"
              >
                {l.label}
              </Link>
            ))}
            {!isAuthenticated && (
              <div className="flex gap-2 pt-3 border-t border-border mt-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-foreground transition-colors"
                >
                  LOGIN
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  SIGN UP
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
