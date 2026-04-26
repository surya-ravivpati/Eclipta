import { useState, useEffect } from "react";
import { LunaIcon } from "@/components/luna/LunaIcon";
import { LunaChatPanel, type LunaMessage } from "@/components/luna/LunaChatPanel";
import { detectFatigue } from "@/lib/luna-context";
import { supabase } from "@/integrations/supabase/client";
import { LUNA_HISTORY_KEY } from "@/lib/luna-api";

// Unified key so the mini panel and the full session share one history.
const STORAGE_KEY = LUNA_HISTORY_KEY;

const GENERIC_INTROS = [
  "Hey — need a hand with anything? 🌙",
  "I'm here if you want to think through something together.",
  "Ready to learn? Drop a question and we'll work through it. 🌙",
];

function pickIntro(profile: Record<string, unknown> | null): string {
  if (!profile) return GENERIC_INTROS[Math.floor(Math.random() * GENERIC_INTROS.length)];
  const name = (profile.username as string | null) || "";
  const weak = (profile.weak_areas as string[] | null) || [];
  const streak = (profile.current_streak as number) || 0;
  const xp = (profile.xp as number) || 0;

  const greeting = name ? `Hey ${name}` : "Hey";
  if (weak.length > 0) {
    return `${greeting} — want to take another crack at ${weak[0]}? Last time it tripped you up. 🌙`;
  }
  if (streak >= 5) {
    return `${greeting} — ${streak}-question streak going. Want a harder challenge? 🌙`;
  }
  if (xp === 0) {
    return `${greeting} — I'm Luna, your AI tutor. Ask me anything or try a course to start earning XP. 🌙`;
  }
  return `${greeting} — what are we working on today? 🌙`;
}

export function Luna() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LunaMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LunaMessage[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [hasNudged, setHasNudged] = useState(false);
  const [iconState, setIconState] = useState<"idle" | "thinking" | "alert" | "happy">("idle");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Load profile once on mount so the intro can be personalized
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("username, weak_areas, current_streak, xp")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setProfile(data as Record<string, unknown>);
    })();
  }, []);

  // Persist mini-panel history
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
  }, [messages]);

  // Nudge after 30s of inactivity. After the user dismisses (opens the panel),
  // re-arm on a 5-minute cooldown so Luna can gently remind once per session
  // gap, not constantly.
  useEffect(() => {
    if (open || hasNudged) return;
    const timer = setTimeout(() => setHasNudged(true), 30000);
    return () => clearTimeout(timer);
  }, [open, hasNudged]);

  useEffect(() => {
    if (open || !hasNudged) return;
    const cooldown = setTimeout(() => setHasNudged(false), 5 * 60 * 1000);
    return () => clearTimeout(cooldown);
  }, [open, hasNudged]);

  // Monitor fatigue for icon state
  useEffect(() => {
    const interval = setInterval(() => {
      const fatigue = detectFatigue();
      if (fatigue !== "none") setIconState("alert");
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Drive icon state from streaming + happy completion ping.
  useEffect(() => {
    if (isStreaming) { setIconState("thinking"); return; }
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && messages.length > 1) {
      setIconState("happy");
      const t = setTimeout(() => setIconState("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [messages, isStreaming]);

  const handleOpen = () => {
    setOpen(true);
    setHasNudged(false);
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: pickIntro(profile),
        tag: null,
      }]);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <LunaIcon
        state={iconState}
        hasNudge={hasNudged && !open}
        onClick={handleOpen}
      />
      <LunaChatPanel
        open={open}
        onClose={handleClose}
        messages={messages}
        setMessages={setMessages}
        onStreamingChange={setIsStreaming}
      />
    </>
  );
}
