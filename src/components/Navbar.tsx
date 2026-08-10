import { useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePlayerXp } from "@/hooks/use-player-xp";
import { useDailyStreak } from "@/hooks/use-daily-streak";
import { isAtRisk } from "@/lib/daily-streak";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import {
  LogOut,
  User,
  Menu,
  X,
  Zap,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Bell,
  Flame,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { BrandLockup } from "@/components/BrandLockup";
import { useLogoPresent } from "@/components/BrandPresent";

/**
 * Nav structure holds translation KEYS, not text. The uppercase styling of the
 * group labels is done in CSS (`uppercase`) rather than baked into the string,
 * because several languages — German nouns, Japanese, Hindi — either have no
 * case distinction or change meaning when force-cased.
 */
const NAV_GROUPS = [
  {
    labelKey: "nav.learn",
    items: [
      { to: "/courses", labelKey: "nav.courses", descKey: "nav.descCourses" },
      { to: "/build-course", labelKey: "nav.buildCourse", descKey: "nav.descBuildCourse" },
      { to: "/luna", labelKey: "nav.lunaTutor", descKey: "nav.descLuna" },
    ],
  },
  {
    labelKey: "nav.practice",
    items: [
      { to: "/battles", labelKey: "nav.knowledgeBattles", descKey: "nav.descBattles" },
      { to: "/progress", labelKey: "nav.trophyRoad", descKey: "nav.descProgress" },
      { to: "/collection", labelKey: "nav.collection", descKey: "nav.descCollection" },
    ],
  },
  {
    labelKey: "nav.community",
    items: [
      { to: "/forum", labelKey: "nav.forum", descKey: "nav.descForum" },
      { to: "/groups", labelKey: "nav.studyRooms", descKey: "nav.descGroups" },
      { to: "/about", labelKey: "nav.about", descKey: "nav.descAbout" },
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
  const { onLogoClick, present } = useLogoPresent();
  const { t, formatNumber } = useTranslation();

  const isGroupActive = (group: (typeof NAV_GROUPS)[number]) =>
    group.items.some((it) => pathname.startsWith(it.to));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success(t("nav.signedOut"));
  };

  return (
    <nav
      aria-label={t("nav.mainNavigation")}
      className="fixed top-0 w-full z-50 border-b border-border bg-background/70 backdrop-blur-xl"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-9 min-w-0">
          <Link to="/" className="shrink-0" aria-label={t("nav.eclipteHome")} onClick={onLogoClick}>
            <BrandLockup size="sm" />
          </Link>
          <div className="hidden lg:flex gap-1">
            {NAV_GROUPS.map((group) => {
              const active = isGroupActive(group);
              return (
                <DropdownMenu key={group.labelKey}>
                  <DropdownMenuTrigger
                    aria-current={active ? "true" : undefined}
                    className={`px-3 py-1.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors inline-flex items-center gap-1.5 ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(group.labelKey)}
                    <ChevronDown className="w-3 h-3 opacity-50" aria-hidden="true" />
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
                          <span className="text-sm font-medium">{t(it.labelKey)}</span>
                          <span className="text-[11px] text-muted-foreground">{t(it.descKey)}</span>
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
          {/* ⌘K is global, but a visible affordance matters: most users never
              discover a keyboard-only entry point. */}
          {isAuthenticated && <GlobalSearch />}
          {/* Language + theme used to be two always-visible controls; folded
              into one menu to cut down on navbar icon clutter. This also
              fixes a pre-existing gap where the language picker was hidden
              below the `sm` breakpoint with no mobile equivalent. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("common.settings")}
              title={t("common.settings")}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-background/95 backdrop-blur-xl border-border min-w-56 p-2"
            >
              <div className="px-1 py-1.5">
                <LanguageSelector />
              </div>
              <div className="my-1 h-px bg-border" />
              <DropdownMenuItem
                onClick={cycleTheme}
                className="cursor-pointer flex items-center gap-2 focus:bg-secondary/80 focus:text-foreground"
              >
                <ThemeIcon className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm">
                  {t("nav.themeSwitch", { current: theme, next: themeNext })}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isAuthenticated ? (
            <>
              <Link
                to="/notifications"
                className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={
                  unread > 0
                    ? t("nav.notificationsWithCount", { count: unread })
                    : t("nav.notificationsNone")
                }
                title={t("nav.notifications")}
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-neon-pink text-[9px] font-bold text-foreground flex items-center justify-center tabular-nums"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {dailyStreak > 0 && (
                <Link
                  to="/streak"
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary/30 border transition-colors ${streakAtRisk ? "border-primary/70 animate-pulse" : "border-border hover:border-primary/40"}`}
                  title={t("nav.streakDays", { count: dailyStreak })}
                  aria-label={
                    // "At risk" is signalled by a pulsing border, which is
                    // invisible to a screen reader — so say it.
                    streakAtRisk
                      ? `${t("nav.streakDays", { count: dailyStreak })}. ${t("nav.streakAtRisk")}`
                      : t("nav.streakDays", { count: dailyStreak })
                  }
                >
                  <Flame className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="text-xs font-bold tabular-nums text-foreground"
                  >
                    {dailyStreak}
                  </span>
                </Link>
              )}
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-secondary/30 border border-border hover:border-foreground/25 transition-colors"
                title={t("nav.profile")}
              >
                <span
                  className="flex items-center gap-1 text-xs font-bold tabular-nums text-neon-purple"
                  aria-label={t("nav.xpAmount", { amount: formatNumber(xp) })}
                >
                  <Zap className="w-3 h-3" aria-hidden="true" />
                  {/* Locale-aware grouping: 1,234 / 1.234 / 1 234 / 12,34,567. */}
                  {formatNumber(xp)}
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
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-block px-5 py-1.5 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                to="/signup"
                className="hidden sm:inline-block px-5 py-1.5 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                {t("onboarding.continue")}
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 text-foreground hover:text-muted-foreground transition-colors"
            aria-label={mobileOpen ? t("a11y.closeMenu") : t("a11y.openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className="lg:hidden border-t border-border bg-background/95 backdrop-blur-xl max-h-[calc(100vh-4rem)] overflow-y-auto"
        >
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
                    <Zap className="w-3 h-3" />
                    {xp.toLocaleString()} XP
                  </span>
                </Link>
                <Link
                  to="/notifications"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between px-3 py-3 border border-border rounded-md hover:border-foreground/25 transition-colors"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    Notifications
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
              {t("nav.home")}
            </Link>
            {NAV_GROUPS.map((group) => (
              <div key={group.labelKey}>
                <p className="px-3 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-1">
                  {t(group.labelKey)}
                </p>
                {group.items.map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    {t(it.labelKey)}
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
                  {t("nav.signIn")}
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2 rounded-full font-mono text-[11px] tracking-[0.22em] uppercase bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  {t("onboarding.continue")}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {present}
    </nav>
  );
}
