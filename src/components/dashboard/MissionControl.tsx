import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Brain,
  Flame,
  Pause,
  Play,
  Sparkles,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { getDashboard, type DashboardData } from "@/repositories/dashboard";
import { AlertTriangle } from "lucide-react";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { getEcliptarBySlug, ecliptarSpriteUrl } from "@/lib/ecliptars";
import { ROAD_NODES } from "@/lib/trophy-road-data";
import { ratingToTier } from "@/lib/rating";
import { useTranslation } from "@/i18n/use-translation";
import { useAppReducedMotion } from "@/hooks/use-reduced-motion";
import { progressLabel } from "@/lib/a11y";
import { cn } from "@/lib/utils";

/**
 * Mission Control - the authenticated home.
 *
 * The organising principle is **one obvious next action**. A dashboard that
 * presents nine equally-weighted panels is a menu, not a control surface, and
 * the user has to decide what to do before they can do anything. So the hero
 * owns the top of the page and everything else is reference material below it.
 *
 * Panels render only when they have something to say. An empty "Recent battles"
 * card teaches the user that this area is dead space; omitting it means every
 * card on screen is worth reading.
 */

export function MissionControl() {
  const { t, formatNumber } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void getDashboard().then((res) => {
      if (!alive) return;
      if (res.status === "error") setFailure(res.reason);
      else {
        setData(res.data);
        setDegraded(res.status === "degraded" ? res.reason : null);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (!data) return <DashboardError reason={failure} />;

  const xp = data.profile.xp ?? 0;
  const streak = data.profile.daily_streak ?? 0;

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* A reduced dashboard still works, but say so rather than quietly
            showing zeroes that look like real data. */}
        {degraded && (
          <div
            role="status"
            className="flex gap-3 p-3 rounded-xl border border-primary/40 bg-primary/5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <p className="text-[13px] text-muted-foreground">
              <span className="text-foreground font-bold">{t("dashboard.limitedTitle")}</span>{" "}
              {t("dashboard.limitedBody")} <span className="font-mono text-[11px]">{degraded}</span>
            </p>
          </div>
        )}

        <Hero data={data} streak={streak} />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <SmartInsights data={data} />
            <CompetitivePanel data={data} />
            <ContinueAnywhere data={data} />
          </div>
          <div className="space-y-5">
            <CommandCenter data={data} />
            <TrophyRoadPanel xp={xp} claimed={data.chests_claimed} />
            <EcliptarPanel data={data} />
            <CommunityFeed data={data} />
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-2">
          {t("dashboard.xpTotal", { xp: formatNumber(xp) })}
        </p>
      </div>
    </div>
  );
}

// --- Hero --------------------------------------------------------------------

function Hero({ data, streak }: { data: DashboardData; streak: number }) {
  const { t } = useTranslation();
  const resume = data.resume;
  const goalXp = 150;
  const pct = Math.min(100, Math.round((data.today.xp / goalXp) * 100));

  return (
    <section className="glass-panel border border-border rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-muted-foreground mb-2">
            {data.today.practised ? t("dashboard.backAtIt") : t("dashboard.readyWhenYouAre")}
          </p>

          {/* The single most important element on the page: one button that
              puts you back exactly where you stopped. */}
          {resume ? (
            <>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-1">
                {resume.course_title ?? t("dashboard.yourCourse")}
              </h1>
              <p className="text-sm text-muted-foreground mb-4">
                {t("dashboard.lessonProgress", {
                  done: resume.lessons_done,
                  total: resume.lessons_total,
                })}
              </p>
              <Link
                to="/courses/$slug"
                params={{ slug: resume.course_slug }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                {t("dashboard.continueLearning")}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-1">
                {t("dashboard.startSomething")}
              </h1>
              <p className="text-sm text-muted-foreground mb-4">{t("dashboard.noCourseYet")}</p>
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                {t("dashboard.browseCourses")}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-6 lg:gap-8">
          <GoalRing pct={pct} current={data.today.xp} goal={goalXp} />
          <div className="space-y-3">
            <Stat
              icon={Flame}
              label={t("dashboard.streak")}
              value={t("progress.streakDays", { count: streak })}
              warn={!data.today.practised && streak > 0}
            />
            <Stat icon={Target} label={t("dashboard.todayXp")} value={`+${data.today.xp}`} />
            <StudyTimer />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Today's goal as a ring. SVG, so it scales and prints cleanly. */
function GoalRing({ pct, current, goal }: { pct: number; current: number; goal: number }) {
  const { t } = useTranslation();
  const reduce = useAppReducedMotion();
  const r = 42;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      className="relative shrink-0"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={current}
      aria-valuetext={progressLabel(t("dashboard.todayGoal"), current, goal)}
    >
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
        <circle cx="52" cy="52" r={r} className="stroke-secondary" strokeWidth="8" fill="none" />
        <motion.circle
          cx="52"
          cy="52"
          r={r}
          className="stroke-primary"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          transform="rotate(-90 52 52)"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-display font-bold tabular-nums">{pct}%</span>
        <span className="text-[9px] tracking-widest uppercase text-muted-foreground">
          {t("dashboard.today")}
        </span>
      </div>
    </div>
  );
}

/**
 * Study timer.
 *
 * Wall-clock based, like the Pressure Mode clock - an accumulating interval
 * drifts and is throttled in background tabs, so a session timed while the user
 * reads a PDF in another tab would under-count badly.
 */
function StudyTimer() {
  const { t } = useTranslation();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  const [, force] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = accumulated + (startedAt !== null ? Date.now() - startedAt : 0);
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);

  return (
    <div className="flex items-center gap-2">
      <Timer className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[9px] tracking-widest uppercase text-muted-foreground">
          {t("dashboard.studyTimer")}
        </p>
        <p className="text-sm font-bold tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (startedAt === null) setStartedAt(Date.now());
          else {
            setAccumulated((a) => a + (Date.now() - startedAt));
            setStartedAt(null);
          }
        }}
        aria-label={startedAt === null ? t("dashboard.startTimer") : t("dashboard.pauseTimer")}
        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground active:scale-[0.97]"
      >
        {startedAt === null ? (
          <Play className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Pause className="w-3 h-3" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn("w-4 h-4 shrink-0", warn ? "text-primary" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <div>
        <p className="text-[9px] tracking-widest uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

// --- Panels ------------------------------------------------------------------

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof Brain;
  action?: { label: string; to: string };
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-muted-foreground">
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {title}
        </h2>
        {action && (
          <Link to={action.to} className="text-[11px] text-muted-foreground hover:text-foreground">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function SmartInsights({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  if (data.weakest.length === 0 && data.due_review === 0 && data.strongest.length === 0) {
    return null;
  }
  return (
    <Panel title={t("dashboard.insights")} icon={Brain}>
      {data.due_review > 0 && (
        <Link
          to="/courses"
          className="flex items-center justify-between gap-3 p-3 mb-3 rounded-xl border border-primary/40 bg-primary/5"
        >
          <span className="text-sm">{t("dashboard.dueReview", { count: data.due_review })}</span>
          <ArrowRight className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
        </Link>
      )}

      {data.weakest.length > 0 && (
        <>
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
            {t("dashboard.worthRevisiting")}
          </p>
          <ul className="space-y-2 mb-4">
            {data.weakest.map((w) => (
              <li key={`${w.subject}-${w.concept}`} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{w.concept}</p>
                  <p className="text-[11px] text-muted-foreground">{w.subject}</p>
                </div>
                {/* Confidence as a bar AND a number: colour alone would not
                    survive a colour-blind reader or a screen reader. */}
                <div
                  className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(w.confidence * 100)}
                  aria-valuetext={`${w.concept}: ${Math.round(w.confidence * 100)}% confidence`}
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.max(4, w.confidence * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.strongest.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          {t("dashboard.strongestIn", {
            subjects: data.strongest.map((s) => s.subject).join(", "),
          })}
        </p>
      )}
    </Panel>
  );
}

function CompetitivePanel({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const rating = data.rating.rating ?? 1000;
  const wins = data.rating.wins ?? 0;
  const losses = data.rating.losses ?? 0;
  const games = wins + losses;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : null;
  const tier = ratingToTier(rating);

  return (
    <Panel
      title={t("dashboard.competitive")}
      icon={Swords}
      action={{ label: t("nav.battles"), to: "/battles" }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Figure label={t("dashboard.elo")} value={String(rating)} />
        <Figure label={t("dashboard.league")} value={tier} />
        <Figure label={t("dashboard.winRate")} value={winRate === null ? "-" : `${winRate}%`} />
        <Figure label={t("dashboard.record")} value={games > 0 ? `${wins}-${losses}` : "-"} />
      </div>

      {data.recent_battles.length > 0 ? (
        <ul className="space-y-1.5">
          {data.recent_battles.map((b) => (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              {/* Win/loss by glyph and text, never colour alone. */}
              <span
                className={cn(
                  "w-5 shrink-0 text-center font-bold",
                  b.won ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {b.won ? "W" : "L"}
              </span>
              <span className="sr-only">{b.won ? t("battle.victory") : t("battle.defeat")}</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground">
                {ARCHETYPES[b.archetype]?.name ?? b.archetype}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {b.correct_answers}/{b.total_questions}
              </span>
              {b.rating_delta !== null && (
                <span className="text-[11px] tabular-nums shrink-0 w-10 text-right">
                  {b.rating_delta >= 0 ? "+" : ""}
                  {b.rating_delta}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Link
          to="/battles"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm"
        >
          <Swords className="w-4 h-4" aria-hidden="true" />
          {t("dashboard.quickBattle")}
        </Link>
      )}
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] tracking-widest uppercase text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-display font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CommandCenter({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const topics = data.recent_topics.slice(0, 4);
  return (
    <Panel title={t("dashboard.commandCenter")} icon={Sparkles}>
      <Link
        to="/luna"
        className="flex items-center gap-2 w-full px-4 py-3 mb-3 rounded-xl border border-border hover:bg-secondary/40 transition-colors"
      >
        <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-sm">{t("luna.askPlaceholder")}</span>
      </Link>
      {topics.length > 0 && (
        <>
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
            {t("dashboard.pickUpOn")}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <li key={topic}>
                <Link
                  to="/luna"
                  className="inline-block px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {topic}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function TrophyRoadPanel({ xp, claimed }: { xp: number; claimed: number[] }) {
  const { t, formatNumber } = useTranslation();
  const next = useMemo(() => ROAD_NODES.find((n) => n.xp > xp), [xp]);
  const unclaimed = useMemo(
    () => ROAD_NODES.filter((n) => n.xp <= xp && !claimed.includes(n.id)).length,
    [xp, claimed],
  );

  return (
    <Panel
      title={t("dashboard.trophyRoad")}
      icon={Trophy}
      action={{ label: t("common.next"), to: "/progress" }}
    >
      {unclaimed > 0 && (
        <Link
          to="/progress"
          className="flex items-center justify-between gap-2 p-3 mb-3 rounded-xl border border-primary/50 bg-primary/10"
        >
          <span className="text-sm font-bold">
            {t("dashboard.rewardsWaiting", { count: unclaimed })}
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
        </Link>
      )}
      {next ? (
        <>
          <p className="text-sm mb-1">{next.label}</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            {t("dashboard.xpRemaining", { xp: formatNumber(next.xp - xp) })}
          </p>
          <div
            className="h-2 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={next.xp}
            aria-valuenow={xp}
            aria-valuetext={progressLabel(next.label, xp, next.xp)}
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, (xp / next.xp) * 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("dashboard.roadComplete")}</p>
      )}
    </Panel>
  );
}

function EcliptarPanel({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const equipped = data.profile.equipped_ecliptar
    ? getEcliptarBySlug(data.profile.equipped_ecliptar)
    : undefined;
  const mostUsed = data.archetype_use[0];

  if (!equipped && !mostUsed && data.ecliptars_owned === 0) return null;

  return (
    <Panel
      title={t("dashboard.ecliptars")}
      icon={Users}
      action={{ label: t("nav.collection"), to: "/collection" }}
    >
      {equipped && (
        <div className="flex items-center gap-3 mb-3">
          <img
            src={ecliptarSpriteUrl(equipped.slug)}
            alt=""
            aria-hidden="true"
            className="w-12 h-12 object-contain shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{equipped.name}</p>
            <p className="text-[11px] text-muted-foreground">{t("dashboard.equipped")}</p>
          </div>
        </div>
      )}
      {mostUsed && (
        <p className="text-[12px] text-muted-foreground mb-2">
          {t("dashboard.mostPlayed", {
            archetype: ARCHETYPES[mostUsed.archetype]?.name ?? mostUsed.archetype,
            count: mostUsed.battles_played,
          })}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t("dashboard.collected", { owned: data.ecliptars_owned, total: 32 })}
      </p>
    </Panel>
  );
}

function CommunityFeed({ data }: { data: DashboardData }) {
  const { t, formatRelative } = useTranslation();
  if (data.notifications.length === 0) return null;
  return (
    <Panel
      title={t("dashboard.community")}
      icon={Bell}
      action={{ label: t("nav.notifications"), to: "/notifications" }}
    >
      <ul className="space-y-2.5">
        {data.notifications.slice(0, 5).map((n) => (
          <li key={n.id} className="flex items-start gap-2">
            {!n.read && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <div className={cn("min-w-0", n.read && "pl-3.5")}>
              <p className="text-[13px] leading-snug">{t(`notificationType.${n.type}`)}</p>
              <p className="text-[10px] text-muted-foreground">{formatRelative(n.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ContinueAnywhere({ data }: { data: DashboardData }) {
  const { t, formatRelative } = useTranslation();
  if (data.recent_courses.length === 0) return null;
  return (
    <Panel title={t("dashboard.continueAnywhere")} icon={TrendingUp}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.recent_courses.map((c) => (
          <li key={c.course_slug}>
            <Link
              to="/courses/$slug"
              params={{ slug: c.course_slug }}
              className="block p-3 rounded-xl border border-border hover:bg-secondary/40 transition-colors"
            >
              <p className="text-sm truncate mb-1">{c.course_title ?? c.course_slug}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${c.percent}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {Math.round(c.percent)}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {formatRelative(c.last_opened_at)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- States ------------------------------------------------------------------

function DashboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen pt-24 px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="h-48 rounded-2xl bg-secondary/40 animate-pulse" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <div className="h-56 rounded-2xl bg-secondary/40 animate-pulse" />
            <div className="h-48 rounded-2xl bg-secondary/40 animate-pulse" />
          </div>
          <div className="space-y-5">
            <div className="h-40 rounded-2xl bg-secondary/40 animate-pulse" />
            <div className="h-40 rounded-2xl bg-secondary/40 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardError({ reason }: { reason: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen pt-32 px-6 text-center">
      <p className="text-muted-foreground mb-2">{t("common.error")}</p>
      {/* Name the cause. "Something went wrong" sends people hunting in the
          wrong place; the actual Postgres message usually says exactly what. */}
      {reason && (
        <p className="max-w-lg mx-auto mb-4 text-[12px] font-mono text-muted-foreground/80">
          {reason}
        </p>
      )}
      <Link
        to="/courses"
        className="inline-block px-4 py-2 rounded-lg border border-border text-sm"
      >
        {t("dashboard.browseCourses")}
      </Link>
    </div>
  );
}
