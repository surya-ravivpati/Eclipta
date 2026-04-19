import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Target, Zap, BookOpen, Sparkles, Loader2, MessageSquare, LogOut, Sun, Moon, Settings, Check, Lock, ExternalLink, AlertTriangle, Camera } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { ECLIPTARS, getEcliptarsByArchetype } from "@/lib/ecliptars";
import { useOwnedEcliptars } from "@/hooks/use-player-xp";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile – Eclipta" },
      { name: "description", content: "Settings, XP, ecliptars, courses, and forum activity." },
    ],
  }),
  component: ProfilePage,
});

type Profile = {
  username: string | null;
  xp: number; current_streak: number; best_streak: number;
  total_correct: number; total_questions: number; total_sessions: number;
  preferred_pace: string; preferred_style: string;
  equipped_ecliptar: string | null;
  avatar_url: string | null;
};
type Ecliptar = { id: string; ecliptar_name: string; archetype: string; claimed_at: string };
type Enrollment = { id: string; course_slug: string; course_title: string; enrolled_at: string };
type ForumActivity = { id: string; title: string; created_at: string };

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ecliptars, setEcliptars] = useState<Ecliptar[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [threads, setThreads] = useState<ForumActivity[]>([]);
  const [answersCount, setAnswersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) return;
    const [p, e, en, t, a] = await Promise.all([
      supabase.from("user_profiles").select("username,xp,current_streak,best_streak,total_correct,total_questions,total_sessions,preferred_pace,preferred_style,equipped_ecliptar,avatar_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_ecliptars").select("id,ecliptar_name,archetype,claimed_at").eq("user_id", user.id).order("claimed_at", { ascending: false }),
      supabase.from("enrollments").select("id,course_slug,course_title,enrolled_at").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
      supabase.from("forum_threads").select("id,title,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("forum_answers").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    setProfile((p.data as Profile) || null);
    setEcliptars((e.data as Ecliptar[]) || []);
    setEnrollments((en.data as Enrollment[]) || []);
    setThreads((t.data as ForumActivity[]) || []);
    setAnswersCount(a.count || 0);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  if (!user) return null;

  const displayName = profile?.username || user.email?.split("@")[0] || "Learner";
  const accuracy = profile && profile.total_questions > 0
    ? Math.round((profile.total_correct / profile.total_questions) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header */}
          <motion.div
            className="glass-panel p-8 mb-6 flex flex-col md:flex-row items-center md:items-start gap-6"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <AvatarUploader
              userId={user.id}
              avatarUrl={profile?.avatar_url ?? null}
              equippedSlug={profile?.equipped_ecliptar ?? null}
              onUploaded={reload}
            />
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold font-display tracking-tight">{displayName}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start items-center">
                <span className="text-[10px] font-bold tracking-widest bg-neon-purple/10 text-neon-purple border border-neon-purple/30 px-2 py-0.5">
                  {profile?.preferred_pace?.toUpperCase() || "NORMAL"} PACE
                </span>
                <span className="text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5">
                  {profile?.preferred_style?.toUpperCase() || "MIXED"} STYLE
                </span>
                {profile?.username && (
                  <Link
                    to="/u/$username"
                    params={{ username: profile.username }}
                    className="text-[10px] font-bold tracking-widest text-muted-foreground hover:text-neon-purple inline-flex items-center gap-1 border border-border px-2 py-0.5 transition-colors"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />/u/{profile.username}
                  </Link>
                )}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-muted-foreground hover:text-neon-pink transition-colors inline-flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />SIGN OUT
            </button>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard icon={<Zap className="w-4 h-4" />} label="XP" value={profile?.xp ?? 0} color="text-neon-purple" />
                <StatCard icon={<Flame className="w-4 h-4" />} label="Streak" value={profile?.current_streak ?? 0} color="text-neon-pink" />
                <StatCard icon={<Trophy className="w-4 h-4" />} label="Best Streak" value={profile?.best_streak ?? 0} color="text-neon-cyan" />
                <StatCard icon={<Target className="w-4 h-4" />} label="Accuracy" value={`${accuracy}%`} color="text-foreground" />
              </div>

              {/* Settings */}
              <SettingsPanel
                profile={profile}
                userId={user.id}
                onSaved={reload}
              />

              {/* Activity cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card title="Enrolled Courses" icon={<BookOpen className="w-4 h-4 text-neon-cyan" />} count={enrollments.length}>
                  {enrollments.length === 0 ? (
                    <EmptyState text="No courses enrolled." cta={<Link to="/certified" className="text-neon-cyan hover:underline">Browse certified →</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {enrollments.slice(0, 6).map((en) => (
                        <li key={en.id} className="text-xs border-b border-border/50 pb-2">
                          <Link to="/certified/$slug" params={{ slug: en.course_slug }} className="font-medium hover:text-neon-cyan transition-colors">
                            {en.course_title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Forum Threads" icon={<MessageSquare className="w-4 h-4 text-neon-pink" />} count={threads.length}>
                  {threads.length === 0 ? (
                    <EmptyState text="No threads posted." cta={<Link to="/forum" className="text-neon-pink hover:underline">Start a discussion →</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {threads.slice(0, 5).map((t) => (
                        <li key={t.id} className="text-xs border-b border-border/50 pb-2">
                          <Link to="/forum/$threadId" params={{ threadId: t.id }} className="font-medium hover:text-neon-pink transition-colors line-clamp-1">
                            {t.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Lifetime Activity" icon={<Target className="w-4 h-4 text-foreground" />} count={null}>
                  <div className="space-y-2 text-xs">
                    <Row label="Sessions" value={profile?.total_sessions ?? 0} />
                    <Row label="Questions answered" value={profile?.total_questions ?? 0} />
                    <Row label="Correct" value={profile?.total_correct ?? 0} />
                    <Row label="Forum answers" value={answersCount} />
                  </div>
                </Card>

                <Card title="Ecliptars Claimed" icon={<Sparkles className="w-4 h-4 text-neon-purple" />} count={ecliptars.length}>
                  {ecliptars.length === 0 ? (
                    <EmptyState text="No ecliptars yet." cta={<Link to="/progress" className="text-neon-purple hover:underline">Walk the trophy road →</Link>} />
                  ) : (
                    <p className="text-xs text-muted-foreground">Click any ecliptar below to equip ↓</p>
                  )}
                </Card>
              </div>

              {/* Embedded Collection w/ click-to-equip */}
              <CollectionSection
                equippedSlug={profile?.equipped_ecliptar ?? null}
                userId={user.id}
                onEquipped={reload}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* =================== Settings Panel =================== */

function SettingsPanel({ profile, userId, onSaved }: {
  profile: Profile | null; userId: string; onSaved: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [username, setUsername] = useState(profile?.username || "");
  const [pace, setPace] = useState(profile?.preferred_pace || "normal");
  const [style, setStyle] = useState(profile?.preferred_style || "mixed");
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "current">("idle");

  useEffect(() => {
    setUsername(profile?.username || "");
    setPace(profile?.preferred_pace || "normal");
    setStyle(profile?.preferred_style || "mixed");
  }, [profile?.username, profile?.preferred_pace, profile?.preferred_style]);

  const validateUsername = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

  // Debounced availability check
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) { setAvailability("idle"); return; }
    if (trimmed === profile?.username) { setAvailability("current"); return; }
    if (!validateUsername(trimmed)) { setAvailability("invalid"); return; }
    setAvailability("checking");
    const handle = setTimeout(async () => {
      const { count } = await supabase
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("username", trimmed);
      setAvailability((count ?? 0) > 0 ? "taken" : "available");
    }, 400);
    return () => clearTimeout(handle);
  }, [username, profile?.username]);

  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!validateUsername(trimmed)) {
      return toast.error("Username must be 3–20 chars: letters, numbers, underscores");
    }
    if (trimmed === profile?.username) return;
    if (availability === "taken") return toast.error("That username is already taken");
    setSaving(true);
    const { error } = await supabase.from("user_profiles").update({ username: trimmed }).eq("user_id", userId);
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("That username is already taken");
      return toast.error(error.message);
    }
    toast.success("Username updated — visible publicly");
    onSaved();
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    const { error } = await supabase.from("user_profiles")
      .update({ preferred_pace: pace, preferred_style: style })
      .eq("user_id", userId);
    setSavingPrefs(false);
    if (error) return toast.error(error.message);
    toast.success("Learning preferences saved");
    onSaved();
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      toast.message("Click again to confirm. This signs you out and removes your local data.");
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    // We don't have admin API to hard-delete an auth user from the client.
    // Best-effort: clear profile data, sign out.
    await supabase.from("user_profiles").update({
      username: null, equipped_ecliptar: null,
    }).eq("user_id", userId);
    await supabase.auth.signOut();
    toast.success("Account data cleared. Contact support to fully delete the account.");
  };

  return (
    <motion.div className="glass-panel p-6 mb-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2 mb-5">
        <Settings className="w-4 h-4 text-neon-purple" />
        <h2 className="font-display font-bold text-sm tracking-widest uppercase">Settings</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Username */}
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Public Username</label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-2">Shown on your forum threads, answers, and public profile.</p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              placeholder="your_username"
              className="flex-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
            <button
              onClick={saveUsername}
              disabled={saving || username.trim() === (profile?.username || "") || availability === "taken" || availability === "invalid" || availability === "checking"}
              className="px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              SAVE
            </button>
          </div>
          <p className={cn(
            "text-[10px] mt-1 font-bold tracking-widest",
            availability === "available" && "text-emerald-400",
            availability === "taken" && "text-destructive",
            availability === "invalid" && "text-neon-pink",
            (availability === "idle" || availability === "current" || availability === "checking") && "text-muted-foreground",
          )}>
            {availability === "checking" && "CHECKING…"}
            {availability === "available" && "✓ AVAILABLE"}
            {availability === "taken" && "✗ ALREADY TAKEN"}
            {availability === "invalid" && "INVALID — 3–20 chars, letters/numbers/underscore"}
            {(availability === "idle" || availability === "current") && "3–20 chars. Letters, numbers, underscores only."}
          </p>
        </div>

        {/* Theme */}
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Appearance</label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-2">Switch between dark and light arena.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-bold tracking-widest border transition-colors inline-flex items-center justify-center gap-2",
                theme === "dark"
                  ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                  : "border-border text-muted-foreground hover:border-neon-purple/40"
              )}
            >
              <Moon className="w-3.5 h-3.5" />DARK
            </button>
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-bold tracking-widest border transition-colors inline-flex items-center justify-center gap-2",
                theme === "light"
                  ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                  : "border-border text-muted-foreground hover:border-neon-purple/40"
              )}
            >
              <Sun className="w-3.5 h-3.5" />LIGHT
            </button>
          </div>
        </div>

        {/* Learning preferences */}
        <div className="md:col-span-2 border-t border-border pt-5">
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Learning Preferences</label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-3">Tunes how Luna paces hints and selects question styles.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-1.5">PACE</p>
              <div className="flex gap-1">
                {(["slow", "normal", "fast"] as const).map((opt) => (
                  <button key={opt} onClick={() => setPace(opt)} className={cn(
                    "flex-1 px-2 py-1.5 text-[10px] font-bold tracking-widest border transition-colors",
                    pace === opt ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan" : "border-border text-muted-foreground hover:border-neon-cyan/40"
                  )}>{opt.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-1.5">STYLE</p>
              <div className="flex gap-1">
                {(["visual", "verbal", "mixed", "applied"] as const).map((opt) => (
                  <button key={opt} onClick={() => setStyle(opt)} className={cn(
                    "flex-1 px-2 py-1.5 text-[10px] font-bold tracking-widest border transition-colors",
                    style === opt ? "border-neon-pink bg-neon-pink/10 text-neon-pink" : "border-border text-muted-foreground hover:border-neon-pink/40"
                  )}>{opt.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={savePrefs}
              disabled={savingPrefs || (pace === profile?.preferred_pace && style === profile?.preferred_style)}
              className="px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
            >
              {savingPrefs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              SAVE PREFERENCES
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="md:col-span-2 border-t border-destructive/30 pt-5">
          <label className="text-[10px] font-bold tracking-widest text-destructive uppercase flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />Danger Zone
          </label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-3">
            Clears your username and signs you out. Full deletion of historical battle/forum data requires emailing support.
          </p>
          <button
            onClick={deleteAccount}
            className={cn(
              "px-4 py-2 text-xs font-bold tracking-widest border transition-colors",
              confirmDelete
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-destructive/40 text-destructive hover:bg-destructive/10"
            )}
          >
            {confirmDelete ? "CONFIRM — CLEAR & SIGN OUT" : "CLEAR ACCOUNT DATA"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* =================== Avatar Uploader =================== */

function AvatarUploader({ userId, avatarUrl, equippedSlug, onUploaded }: {
  userId: string; avatarUrl: string | null; equippedSlug: string | null; onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const equipped = equippedSlug ? ECLIPTARS.find((e) => e.slug === equippedSlug) : null;
  const equippedArch = equipped ? ARCHETYPES[equipped.archetype as MonsterArchetypeKey] : null;
  const FallbackIcon = equipped?.icon ?? User;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Max 2 MB");
    if (!file.type.startsWith("image/")) return toast.error("Image files only");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600", upsert: true, contentType: file.type,
    });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: dbErr } = await supabase.from("user_profiles")
      .update({ avatar_url: pub.publicUrl }).eq("user_id", userId);
    setUploading(false);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("Profile picture updated");
    onUploaded();
  };

  return (
    <div className="relative shrink-0">
      <div className={cn(
        "w-20 h-20 rounded-full border-2 flex items-center justify-center overflow-hidden bg-secondary/30",
        equippedArch ? equippedArch.borderColor : "border-neon-purple/40"
      )}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="Your avatar" className="w-full h-full object-cover" />
        ) : (
          <FallbackIcon className={cn("w-10 h-10", equippedArch?.color ?? "text-neon-purple")} />
        )}
      </div>
      <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-neon-purple text-primary-foreground flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity shadow-lg" title="Change profile picture">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
        <input type="file" accept="image/*" className="sr-only" onChange={onPick} disabled={uploading} />
      </label>
    </div>
  );
}

/* =================== Embedded Collection (click-to-equip) =================== */

function CollectionSection({ equippedSlug, userId, onEquipped }: {
  equippedSlug: string | null; userId: string; onEquipped: () => void;
}) {
  const { slugs, loading } = useOwnedEcliptars();
  const total = ECLIPTARS.length;
  const owned = ECLIPTARS.filter((e) => slugs.has(e.slug)).length;
  const archetypeKeys = Object.keys(ARCHETYPES) as MonsterArchetypeKey[];

  const equip = async (slug: string) => {
    if (!slugs.has(slug)) return;
    const next = equippedSlug === slug ? null : slug;
    const { error } = await supabase.from("user_profiles")
      .update({ equipped_ecliptar: next })
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success(next ? "Ecliptar equipped" : "Ecliptar unequipped");
    onEquipped();
  };

  return (
    <div className="mt-10">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-purple/30 bg-neon-purple/10 text-neon-purple text-[10px] font-bold tracking-widest mb-2">
            <Sparkles className="w-3 h-3" />ECLIPTAR COLLECTION
          </div>
          <h2 className="text-3xl font-bold font-display tracking-tight">My Ecliptars</h2>
          <p className="text-xs text-muted-foreground mt-1">Click any owned ecliptar to equip it as your public avatar.</p>
        </div>
        <p className="text-sm font-bold tracking-widest text-neon-purple">{owned} / {total} COLLECTED</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">Loading collection…</div>
      ) : (
        <div className="space-y-8">
          {archetypeKeys.map((archKey) => {
            const arch = ARCHETYPES[archKey];
            const eclips = getEcliptarsByArchetype(archKey);
            const ownedCount = eclips.filter((e) => slugs.has(e.slug)).length;

            return (
              <div key={archKey}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <arch.icon className={cn("w-6 h-6", arch.color)} />
                    <div>
                      <h3 className={cn("text-base font-bold font-display", arch.color)}>{arch.name}</h3>
                      <p className="text-[10px] font-bold tracking-widest text-muted-foreground">{arch.passive}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold tracking-widest px-2 py-1 rounded-full border",
                    ownedCount === eclips.length ? "border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground"
                  )}>
                    {ownedCount}/{eclips.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {eclips.map((e) => {
                    const isOwned = slugs.has(e.slug);
                    const isEquipped = equippedSlug === e.slug;
                    return (
                      <button
                        key={e.slug}
                        type="button"
                        onClick={() => equip(e.slug)}
                        disabled={!isOwned}
                        title={!isOwned ? "Locked — claim on the Trophy Road" : isEquipped ? "Click to unequip" : "Click to equip as avatar"}
                        className={cn(
                          "glass-panel p-4 border text-center relative overflow-hidden transition-all",
                          isOwned ? `${arch.borderColor} hover:scale-[1.03] cursor-pointer` : "border-border/30 opacity-60 cursor-not-allowed",
                          isEquipped && "ring-2 ring-neon-purple ring-offset-2 ring-offset-background shadow-[0_0_24px_rgba(168,85,247,0.55)] bg-neon-purple/15 scale-[1.02]"
                        )}
                      >
                        {!isOwned && (
                          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        {isEquipped && (
                          <div className="absolute top-1 right-1 z-10 bg-neon-purple text-primary-foreground text-[9px] font-bold tracking-widest px-2 py-0.5 inline-flex items-center gap-1 shadow-md">
                            <Check className="w-2.5 h-2.5" />EQUIPPED
                          </div>
                        )}
                        <e.icon className={cn("w-10 h-10 mx-auto mb-2", isOwned ? arch.color : "text-muted-foreground", isEquipped && "drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]")} />
                        <div className={cn("text-sm font-bold font-display", isOwned ? arch.color : "text-muted-foreground")}>{e.name}</div>
                        <div className="text-[9px] tracking-widest text-muted-foreground mt-1">{arch.name.toUpperCase()}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center mt-10">
        <Link to="/progress" className="inline-block px-6 py-3 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity">
          UNLOCK MORE ON THE TROPHY ROAD
        </Link>
      </div>
    </div>
  );
}

/* =================== Small UI helpers =================== */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="glass-panel p-4">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>{icon}<span className="text-[10px] font-bold tracking-widest uppercase">{label}</span></div>
      <p className={`text-2xl font-bold font-display tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number | null; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">{icon}<h3 className="font-display font-bold text-sm tracking-tight uppercase">{title}</h3></div>
        {count !== null && <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, cta }: { text: string; cta: React.ReactNode }) {
  return (
    <div className="text-center py-4">
      <p className="text-xs text-muted-foreground mb-2">{text}</p>
      <p className="text-xs font-bold tracking-widest">{cta}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b border-border/50 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
