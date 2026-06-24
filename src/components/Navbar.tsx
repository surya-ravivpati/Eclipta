import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePlayerXp } from "@/hooks/use-player-xp";
import { useDailyStreak } from "@/hooks/use-daily-streak";
import { isAtRisk } from "@/lib/daily-streak";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User, Menu, X, Zap, ChevronDown, Sun, Moon, Monitor, Bell, Flame } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { BrandLockup } from "@/components/BrandLockup";

const NAV_GROUPS = [
  {
    label: "LEARN",
    items: [
      { to: "/certified", label: "Certified Courses", desc: "Curated learning tracks" },
      { to: "/courses", label: "Community Courses", desc: "Built by learners" },
      { to: "/build-course", label: "Build a Course", desc: "Personalized syllabi" },
      { to: "/luna", label: "Luna Tutor", desc: "Your AI guide" },
    ],
  },
  {
    label: "PRACTICE",
    items: [
      { to: "/battles", label: "Knowledge Battles", desc: "1v1 duels" },
      { to: "/progress", label: "Trophy Road", desc: "Your progression map" },
    ],
  },
  {
    label: "COMMUNITY",
    items: [
      { to: "/forum", label: "Forum", desc: "Ask & share" },
      { to: "/groups", label: "Study Rooms", desc: "Learn together, live" },
      { to: "/about", label: "About", desc: "Mission & team" },
    ],
  },
] as const;

export function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const { xp } = usePlayerXp();
  const streakState = useDailyStreak();
  const dailyStreak = streakState.dailyStreak;
  const streakAtRisk = isAtRisk(streakState);
  const { theme, setTheme } = useTheme();
  const { unread } = useNotifications();
  const cycleTheme = () => {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
  };
  // Icon represents the CURRENT mode (so users see what's active),
  // tooltip describes what clicking will switch to next.
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeNext = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const isGroupActive = (group: typeof NAV_GROUPS[number]) =>
    group.items.some((it) => pathname.startsWith(it.to));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-9 min-w-0">
          <Link to="/" className="shrink-0" aria-label="Eclipta home">
            <BrandLockup size="sm" />
          </Link>
          <div className="hidden lg:flex gap-1">
            {NAV_GROUPS.map((group) => {
              const active = isGroupActive(group);
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger
                    className={`px-3 py-1.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors inline-flex items-center gap-1.5 outline-none ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {group.label}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="bg-background/95 backdrop-blur-xl border-border min-w-56"
                  >
                    {group.items.map((it) => (
                      <DropdownMenuItem key={it.to} asChild>
                        <Link
                          to={it.to}
                          className="flex flex-col items-start gap-0.5 cursor-pointer focus:bg-secondary/80 focus:text-foreground"
                        >
                          <span className="text-sm font-medium">{it.label}</span>
                          <span className="text-[11px] text-muted-foreground">{it.desc}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={cycleTheme}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title={`Theme: ${theme} — click to switch to ${themeNext}`}
            aria-label={`Theme: ${theme}. Click to switch to ${themeNext}.`}
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
          {isAuthenticated ? (
            <>
              <Link
                to="/notifications"
                className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-neon-pink text-[9px] font-bold text-foreground flex items-center justify-center tabular-nums">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {dailyStreak > 0 && (
                <Link
                  to="/streak"
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary/30 border transition-colors ${streakAtRisk ? "border-primary/70 animate-pulse" : "border-border hover:border-primary/40"}`}
                  title={streakAtRisk ? `${dailyStreak}-day streak at risk — practice today!` : `${dailyStreak}-day practice streak — keep it alive`}
                  aria-label={`${dailyStreak} day practice streak`}
                >
                  <Flame className={`w-3.5 h-3.5 text-primary ${streakAtRisk ? "" : ""}`} />
                  <span className="text-xs font-bold tabular-nums text-foreground">{dailyStreak}</span>
                </Link>
              )}
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-secondary/30 border border-border hover:border-foreground/25 transition-colors"
                title="View profile"
              >
                <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-neon-purple">
                  <Zap className="w-3 h-3" />
                  {xp.toLocaleString()}
                </span>
                <span className="w-px h-3 bg-border" />
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
                    {user?.email?.split("@")[0]}
                  </span>
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
              <Link to="/login" className="hidden sm:inline-block px-5 py-1.5 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground transition-colors">
                Login
              </Link>
              <Link to="/signup" className="hidden sm:inline-block px-5 py-1.5 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase bg-foreground text-background hover:opacity-90 transition-opacity">
                Sign up
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 text-foreground hover:text-muted-foreground transition-colors"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background/95 backdrop-blur-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
            {isAuthenticated && (
              <>
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between px-3 py-3 border border-border rounded-md"
                >
                  <span className="text-sm font-medium">{user?.email?.split("@")[0]}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-neon-purple tabular-nums">
                    <Zap className="w-3 h-3" />{xp.toLocaleString()} XP
                  </span>
                </Link>
                <Link
                  to="/notifications"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between px-3 py-3 border border-border rounded-md hover:border-foreground/25 transition-colors"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Bell className="w-4 h-4 text-muted-foreground" />Notifications
                  </span>
                  {unread > 0 && (
                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-neon-pink text-[10px] font-bold text-foreground flex items-center justify-center tabular-nums">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              </>
            )}
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2 font-mono text-[11px] tracking-[0.22em] uppercase text-foreground hover:text-muted-foreground"
            >
              Home
            </Link>
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-1">{group.label}</p>
                {group.items.map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
            {!isAuthenticated && (
              <div className="flex gap-2 pt-3 border-t border-border">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
