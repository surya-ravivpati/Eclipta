import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";

export function Navbar() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

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
            <Link to="/luna" className="hover:text-neon-purple transition-colors">LUNA</Link>
            <Link to="/forum" className="hover:text-neon-purple transition-colors">FORUM</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/30 border border-border">
                <User className="w-3.5 h-3.5 text-neon-purple" />
                <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                  {user?.email?.split("@")[0]}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-muted-foreground hover:text-neon-pink transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-4 py-1.5 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-foreground transition-colors">
                LOGIN
              </Link>
              <Link to="/signup" className="px-4 py-1.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity">
                SIGN UP
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
