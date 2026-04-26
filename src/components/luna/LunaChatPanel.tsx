import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Lightbulb, Eye, Sparkles, Coffee, BookOpen, ArrowRight, Monitor, Loader2 } from "lucide-react";
import { streamLunaChat, parseLunaTag } from "@/lib/luna-api";
import { getLunaContext, detectFatigue, getSessionDuration, getAccuracy, escalateHint, resetHintLevel } from "@/lib/luna-context";
import { captureScreenFrame } from "@/lib/luna-screen";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "@/lib/milestones";

export type LunaMessage = {
  role: "assistant" | "user";
  content: string;
  tag?: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
  imageDataUrl?: string;
  id?: string;
};

interface LunaChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: LunaMessage[];
  setMessages: React.Dispatch<React.SetStateAction<LunaMessage[]>>;
}

const TAG_CONFIG = {
  hint: { icon: Lightbulb, color: "text-neon-cyan", label: "HINT" },
  nudge: { icon: Sparkles, color: "text-neon-purple", label: "NUDGE" },
  explain: { icon: BookOpen, color: "text-neon-cyan", label: "EXPLAIN" },
  challenge: { icon: Eye, color: "text-neon-pink", label: "CHALLENGE" },
  break: { icon: Coffee, color: "text-neon-pink", label: "BREAK" },
};

export function LunaChatPanel({ open, onClose, messages, setMessages }: LunaChatPanelProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileRef = useRef<Record<string, unknown> | null>(null);
  const historyRef = useRef<Record<string, unknown>[] | null>(null);
  const lastXpRef = useRef<number>(0);

  // Load user profile, recent history, and initialize milestones
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, historyRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("learning_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
      ]);
      if (profileRes.data) {
        profileRef.current = profileRes.data;
        const xp = (profileRes.data as any).xp ?? 0;
        markExistingMilestones(xp);
        lastXpRef.current = xp;
      }
      if (historyRes.data) historyRef.current = historyRes.data;
    })();
  }, [open]);

  // Poll for XP changes to detect milestones
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_profiles").select("xp").eq("user_id", user.id).maybeSingle();
      if (!data) return;
      const newXp = (data as any).xp ?? 0;
      const prevXp = lastXpRef.current;
      if (newXp > prevXp) {
        lastXpRef.current = newXp;
        const { toasts, lunaMessages } = checkMilestones(prevXp, newXp);
        fireMilestoneToasts(toasts);
        if (lunaMessages.length > 0) {
          setMessages(prev => [
            ...prev,
            ...lunaMessages.map(msg => ({
              role: "assistant" as const,
              content: msg,
              tag: "nudge" as const,
            })),
          ]);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [open, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Proactive fatigue check
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      const fatigue = detectFatigue();
      const duration = getSessionDuration();
      if (fatigue === "severe" || duration > 45) {
        const hasBreakMsg = messages.some(m => m.tag === "break");
        if (!hasBreakMsg) {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: fatigue === "severe"
              ? "Hey, I can see you're pushing through some tough spots. 🌙 How about a 5-minute break? Or we could switch to a battle for some fun?"
              : "You've been at it for a while! Your brain could use a breather. Take 5, grab some water — I'll be right here when you're back.",
            tag: "break",
          }]);
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [open, messages, setMessages]);

  const handleScreenShare = async () => {
    if (capturing || isStreaming) return;
    setCapturing(true);
    const dataUrl = await captureScreenFrame();
    setCapturing(false);
    if (dataUrl) {
      setPendingImage(dataUrl);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isStreaming) return;
    setInput("");
    const attachedImage = pendingImage;
    setPendingImage(null);

    const userMsg: LunaMessage = {
      role: "user",
      content: text || (attachedImage ? "Here's my screen — can you help with what I'm looking at?" : ""),
      ...(attachedImage ? { imageDataUrl: attachedImage } : {}),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    // Detect explicit demands for the answer. We avoid generic phrases like
    // "what is X" (legitimate learning questions) so the hint budget isn't
    // burned on the first turn.
    const askingForAnswer = /\b(just (tell|give) me|tell me the answer|give me the answer|what(?:'s| is) the answer|the solution|skip the hint|stop hinting)\b/i.test(text);
    if (askingForAnswer) {
      escalateHint();
    } else {
      resetHintLevel();
    }

    const ctx = getLunaContext();
    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
    }));

    let assistantSoFar = "";
    const abortController = new AbortController();
    abortRef.current = abortController;
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const { tag, text: cleanText } = parseLunaTag(assistantSoFar);

      setMessages(prev => {
        // Update by stream id so an auto-inserted [BREAK]/[NUDGE] message
        // landing during the stream can't be clobbered by the next chunk.
        const idx = prev.findIndex(m => m.id === streamId);
        if (idx !== -1) {
          return prev.map((m, i) => i === idx ? { ...m, content: cleanText, tag } : m);
        }
        return [...prev, { role: "assistant" as const, content: cleanText, tag, id: streamId }];
      });
    };

    await streamLunaChat({
      messages: apiMessages,
      context: {
        courseId: ctx.courseId,
        lessonTitle: ctx.lessonTitle,
        currentQuestion: ctx.currentQuestion,
        difficulty: ctx.difficulty,
        weakAreas: ctx.weakAreas,
        streak: ctx.streak,
        incorrectCount: ctx.incorrectCount,
        avgResponseTime: ctx.avgResponseTime,
        hintLevel: ctx.hintLevel,
        consecutiveErrors: ctx.consecutiveErrors,
        rapidGuessCount: ctx.rapidGuessCount,
        accuracy: getAccuracy(),
        sessionMinutes: Math.round(getSessionDuration()),
        profile: profileRef.current,
        recentHistory: historyRef.current,
      },
      onDelta: upsertAssistant,
      onDone: () => {
        setIsStreaming(false);
        // Record this interaction to learning_history
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { tag } = parseLunaTag(assistantSoFar);
            await supabase.from("learning_history").insert({
              user_id: user.id,
              session_type: "chat",
              topic: ctx.lessonTitle || ctx.courseId || null,
              question_text: text.slice(0, 500),
              hint_level_used: ctx.hintLevel,
              luna_summary: tag ? `[${tag.toUpperCase()}] ${assistantSoFar.slice(0, 200)}` : assistantSoFar.slice(0, 200),
            });
          } catch { /* non-critical — don't break chat */ }
        })();
      },
      onError: (err) => {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Hmm, something went wrong on my end. 🌙 ${err}. Try again in a moment?`,
          tag: null,
        }]);
        setIsStreaming(false);
      },
      signal: abortController.signal,
    });
  };

  const tagIcon = (tag?: string | null) => {
    if (!tag || !(tag in TAG_CONFIG)) return null;
    const config = TAG_CONFIG[tag as keyof typeof TAG_CONFIG];
    const Icon = config.icon;
    return (
      <div className="flex items-center gap-1 mb-1">
        <Icon className={`w-3 h-3 ${config.color}`} />
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">{config.label}</span>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[520px] flex flex-col glass-panel border border-acrylic-border overflow-hidden rounded-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌙</span>
              <div>
                <span className="font-display font-bold text-sm tracking-wide">LUNA</span>
                <span className="text-[10px] text-muted-foreground ml-2 tracking-widest">AI TUTOR</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/luna"
                className="text-[10px] font-bold tracking-widest text-neon-purple hover:text-neon-pink transition-colors flex items-center gap-1"
                onClick={onClose}
              >
                FULL SESSION <ArrowRight className="w-3 h-3" />
              </Link>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[360px]">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed rounded ${
                  msg.role === "user"
                    ? "bg-neon-purple/20 border border-neon-purple/20 text-foreground"
                    : "bg-secondary/50 border border-border text-foreground"
                }`}>
                  {msg.role === "assistant" && tagIcon(msg.tag)}
                  {msg.imageDataUrl && (
                    <img
                      src={msg.imageDataUrl}
                      alt="Shared screen"
                      className="rounded mb-2 border border-border max-w-full"
                    />
                  )}
                  {msg.content && (
                    <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-secondary/50 border border-border px-3 py-2 text-sm text-muted-foreground rounded">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                    Luna is thinking...
                  </motion.span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-border">
            {pendingImage && (
              <div className="mb-2 flex items-center gap-2 p-1.5 border border-neon-cyan/30 bg-neon-cyan/5 rounded">
                <img src={pendingImage} alt="screen preview" className="w-12 h-8 object-cover rounded-sm border border-border" />
                <span className="text-[10px] font-bold tracking-widest text-neon-cyan flex-1">SCREEN ATTACHED</span>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove screen attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleScreenShare}
                disabled={capturing || isStreaming}
                title="Share your screen with Luna"
                className="p-2 border border-input bg-secondary/30 hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors disabled:opacity-30 rounded-sm"
              >
                {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
              </button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={pendingImage ? "Ask about your screen..." : "Ask Luna anything..."}
                className="flex-1 bg-secondary/30 border border-input rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
              />
              <button
                type="submit"
                disabled={(!input.trim() && !pendingImage) || isStreaming}
                className="p-2 bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 rounded-sm"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
