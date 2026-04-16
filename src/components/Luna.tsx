import { useState, useEffect } from "react";
import { LunaIcon } from "@/components/luna/LunaIcon";
import { LunaChatPanel, type LunaMessage } from "@/components/luna/LunaChatPanel";
import { detectFatigue } from "@/lib/luna-context";

const LUNA_INTROS = [
  "Hey, I noticed you've been here a while. Need a hand? 🌙",
  "I see you're exploring — want me to suggest a path?",
  "Ready to learn something new? I'm here if you need guidance. 🌙",
];

export function Luna() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LunaMessage[]>([]);
  const [hasNudged, setHasNudged] = useState(false);
  const [iconState, setIconState] = useState<"idle" | "thinking" | "alert" | "happy">("idle");

  // Nudge after 30s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNudged && !open) setHasNudged(true);
    }, 30000);
    return () => clearTimeout(timer);
  }, [hasNudged, open]);

  // Monitor fatigue for icon state
  useEffect(() => {
    const interval = setInterval(() => {
      const fatigue = detectFatigue();
      if (fatigue !== "none") setIconState("alert");
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Detect streaming for thinking state
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.tag === null && messages.length > 1) {
      setIconState("happy");
      setTimeout(() => setIconState("idle"), 2000);
    }
  }, [messages]);

  const handleOpen = () => {
    setOpen(true);
    setHasNudged(false);
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: LUNA_INTROS[Math.floor(Math.random() * LUNA_INTROS.length)],
        tag: null,
      }]);
    }
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
        onClose={() => setOpen(false)}
        messages={messages}
        setMessages={setMessages}
      />
    </>
  );
}
