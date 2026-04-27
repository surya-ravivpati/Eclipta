import { LunaIcon } from "@/components/luna/LunaIcon";
import { LunaChatPanel } from "@/components/luna/LunaChatPanel";
import { subscribeFatigue } from "@/lib/luna-context";
import { supabase } from "@/integrations/supabase/client";
import { useLunaHistory } from "@/hooks/use-luna-history";
import { useState, useEffect } from "react";

const GENERIC_INTROS = [
  "Hey, need a hand with anything? 🌙",
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
    const pick = weak[Math.floor(Math.random() * weak.length)];
    return `${greeting}, want to take another crack at ${pick}? Last time it tripped you up. 🌙`;
  }
  if (streak >= 5) {
    return `${greeting}, ${streak}-question streak going. Want a harder challenge? 🌙`;
  }
  if (xp === 0) {
    return `${greeting}, I'm Luna, your AI tutor. Ask me anything or try a course to start earning XP. 🌙`;
  }
  return `${greeting}, what are we working on today? 🌙`;
}

export function Luna() {
  const [open, setOpen] = useState(false);
  // Shared history — no local persistence here; the hook owns it.
  const { messages, setMessages } = useLunaHistory();
  const [hasNudged, setHasNudged] = useState(false);
  const [iconState, setIconState] = useState<"idle" | "thinking" | "alert" | "happy">("idle");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Intro is presentational — recomputed each open, never persisted.
  const [introContent, setIntroContent] = useState<string>("");

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

  useEffect(() => {
    // Event-driven fatigue → icon state. Resets to idle when fatigue clears
    // (and we aren't mid-stream), so the badge isn't a one-way write.
    const unsubscribe = subscribeFatigue((level) => {
      if (level === "none") {
        setIconState(prev => (prev === "alert" ? "idle" : prev));
      } else {
        setIconState("alert");
      }
    });
    return unsubscribe;
  }, []);

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
    // Recompute a fresh intro every time the panel opens with no transcript.
    // This is *not* pushed into messages — it renders as a placeholder until
    // the user sends their first turn.
    if (messages.length === 0) {
      setIntroContent(pickIntro(profile));
    }
  };

  const handleClose = () => setOpen(false);

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
        introContent={messages.length === 0 ? introContent : null}
      />
    </>
  );
}
