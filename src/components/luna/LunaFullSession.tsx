import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Coffee, ArrowLeft, RotateCcw, Zap, Monitor, Loader2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { streamLunaChat, parseLunaTag, LUNA_TAG_CONFIG, LUNA_HISTORY_KEY } from "@/lib/luna-api";
import { getLunaContext, getAccuracy, getSessionDuration, detectFatigue, escalateHint, resetHintLevel, subscribeFatigue } from "@/lib/luna-context";
import { captureScreenFrame } from "@/lib/luna-screen";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useXpMilestones } from "@/hooks/use-xp-milestones";
import { toast } from "sonner";

type LunaMessage = {
  role: "assistant" | "user";
  content: string;
  tag?: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
  imageDataUrl?: string;
  id?: string;
};

// Mini panel and full session share one history so dropping in mid-flow
// continues the same conversation.
const STORAGE_KEY = LUNA_HISTORY_KEY;
const INTRO_MSG: LunaMessage = {
  role: "assistant",
  content: "Welcome to a deep learning session. 🌙 I'm Luna, your Socratic tutor. Tell me what you're working on, or pick a topic, and I'll guide you through it step by step. No shortcuts, just real understanding.",
  tag: null,
};

export function LunaFullSession() {
  const [messages, setMessages] = useState<LunaMessage[]>(() => {
    if (typeof window === "undefined") return [INTRO_MSG];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LunaMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [INTRO_MSG];
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileRef = useRef<Record<string, unknown> | null>(null);
  const historyRef = useRef<Record<string, unknown>[] | null>(null);

  useXpMilestones({
    onLunaMessages: (msgs) => {
      setMessages(prev => [
        ...prev,
        ...msgs.map(content => ({ role: "assistant" as const, content, tag: "nudge" as const })),
      ]);
    },
  });

  // Persist chat history
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100))); } catch { /* ignore */ }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load user profile + recent history.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, historyRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("learning_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
      ]);
      if (profileRes.data) profileRef.current = profileRes.data;
      if (historyRes.data) historyRef.current = historyRes.data;
    })();
  }, []);

  // Event-driven fatigue: surface a [BREAK] suggestion the moment recordAnswer
  // drives the level to severe.
  useEffect(() => {
    const unsubscribe = subscribeFatigue((level) => {
      if (level !== "severe") return;
      setMessages(prev => {
        if (prev.some(m => m.tag === "break")) return prev;
        return [...prev, {
          role: "assistant",
          content: "You've been pushing through tough spots. 🌙 Take 5 minutes, grab some water, then come back fresh. I'll be here.",
          tag: "break",
        }];
      });
    });
    return unsubscribe;
  }, []);

  const handleScreenShare = async () => {
    if (capturing || isStreaming) return;
    setCapturing(true);
    const dataUrl = await captureScreenFrame();
    setCapturing(false);
    if (dataUrl) setPendingImage(dataUrl);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isStreaming) return;
    setInput("");
    const attachedImage = pendingImage;
    setPendingImage(null);

    const userMsg: LunaMessage = {
      role: "user",
      content: text || (attachedImage ? "Here's my screen, can you help with what I'm looking at?" : ""),
      ...(attachedImage ? { imageDataUrl: attachedImage } : {}),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const askingForAnswer = /\b(just (tell|give) me|tell me the answer|give me the answer|what(?:'s| is) the answer|the solution|skip the hint|stop hinting)\b/i.test(text);
    if (askingForAnswer) escalateHint();
    else resetHintLevel();

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
        // Record interaction
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { tag } = parseLunaTag(assistantSoFar);
            await supabase.from("learning_history").insert({
              user_id: user.id,
              session_type: "luna-session",
              topic: ctx.lessonTitle || ctx.courseId || null,
              question_text: text.slice(0, 500),
              hint_level_used: ctx.hintLevel,
              luna_summary: tag ? `[${tag.toUpperCase()}] ${assistantSoFar.slice(0, 200)}` : assistantSoFar.slice(0, 200),
            });
          } catch { /* non-critical */ }
        })();
      },
      onError: (err) => {
        toast.error(err);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Something went wrong. 🌙 ${err}`,
          tag: null,
        }]);
        setIsStreaming(false);
      },
      signal: abortController.signal,
    });
  };

  const resetSession = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([{
      role: "assistant",
      content: "Fresh start! 🌙 What would you like to work on?",
      tag: null,
    }]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setIsStreaming(false);
  };

  const accuracy = getAccuracy();
  const duration = Math.round(getSessionDuration());
  const fatigue = detectFatigue();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 flex flex-col h-screen">
        {/* Top bar */}
        <div className="border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xl">🌙</span>
              <div>
                <h1 className="font-display font-bold text-lg tracking-wide">LUNA</h1>
                <p className="text-[10px] tracking-widest text-muted-foreground">DEEP TUTORING SESSION</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-neon-cyan" />
                <span>{accuracy}% accuracy</span>
              </div>
              <div className="flex items-center gap-1">
                <Coffee className={`w-3 h-3 ${fatigue !== "none" ? "text-neon-pink" : "text-muted-foreground"}`} />
                <span>{duration}m session</span>
              </div>
            </div>
            <button
              onClick={resetSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> New Session
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
          <div className="max-w-2xl mx-auto py-6 space-y-4">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed rounded-lg ${
                  msg.role === "user"
                    ? "bg-neon-purple/15 border border-neon-purple/20 text-foreground"
                    : "bg-secondary/40 border border-border text-foreground"
                }`}>
                  {msg.role === "assistant" && msg.tag && LUNA_TAG_CONFIG[msg.tag] && (
                    <div className="flex items-center gap-1 mb-2">
                      {(() => {
                        const Icon = LUNA_TAG_CONFIG[msg.tag].icon;
                        return <Icon className={`w-3.5 h-3.5 ${LUNA_TAG_CONFIG[msg.tag].color}`} />;
                      })()}
                      <span className={`text-[9px] font-bold tracking-widest uppercase ${LUNA_TAG_CONFIG[msg.tag].color}`}>
                        {LUNA_TAG_CONFIG[msg.tag].label}
                      </span>
                    </div>
                  )}
                  {msg.imageDataUrl && (
                    <img src={msg.imageDataUrl} alt="Shared screen" className="rounded mb-2 border border-border max-w-full" />
                  )}
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:mt-1 [&>ol]:mt-1">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-secondary/40 border border-border px-4 py-3 text-sm text-muted-foreground rounded-lg">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                    Luna is thinking...
                  </motion.span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-4">
          <form onSubmit={e => { e.preventDefault(); send(); }} className="max-w-2xl mx-auto flex items-center gap-3">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question, describe what you're stuck on, or tell Luna what you're learning..."
              className="flex-1 bg-secondary/30 border border-input rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-neon-purple/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-3 bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 rounded-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
