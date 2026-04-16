import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Lightbulb, Eye, Sparkles, Coffee, BookOpen, ArrowLeft, RotateCcw, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { streamLunaChat, parseLunaTag } from "@/lib/luna-api";
import { getLunaContext, getAccuracy, getSessionDuration, detectFatigue, escalateHint, resetHintLevel } from "@/lib/luna-context";
import ReactMarkdown from "react-markdown";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "@/lib/milestones";

type LunaMessage = {
  role: "assistant" | "user";
  content: string;
  tag?: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
};

const TAG_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  hint: { icon: Lightbulb, color: "text-neon-cyan", label: "HINT" },
  nudge: { icon: Sparkles, color: "text-neon-purple", label: "NUDGE" },
  explain: { icon: BookOpen, color: "text-neon-cyan", label: "EXPLAIN" },
  challenge: { icon: Eye, color: "text-neon-pink", label: "CHALLENGE" },
  break: { icon: Coffee, color: "text-neon-pink", label: "BREAK" },
};

export function LunaFullSession() {
  const [messages, setMessages] = useState<LunaMessage[]>([
    {
      role: "assistant",
      content: "Welcome to a deep learning session. 🌙 I'm Luna, your Socratic tutor. Tell me what you're working on, or pick a topic — I'll guide you through it step by step. No shortcuts, just real understanding.",
      tag: null,
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileRef = useRef<Record<string, unknown> | null>(null);
  const historyRef = useRef<Record<string, unknown>[] | null>(null);
  const lastXpRef = useRef<number>(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load user profile, history, and init milestones
  useEffect(() => {
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
  }, []);

  // Poll for XP changes to detect milestones
  useEffect(() => {
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
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    const userMsg: LunaMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const askingForAnswer = /\b(answer|tell me|what is|solution|just tell|give me)\b/i.test(text);
    if (askingForAnswer) escalateHint();
    else resetHintLevel();

    const ctx = getLunaContext();
    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let assistantSoFar = "";
    const abortController = new AbortController();
    abortRef.current = abortController;

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const { tag, text: cleanText } = parseLunaTag(assistantSoFar);

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: cleanText, tag } : m);
        }
        return [...prev, { role: "assistant" as const, content: cleanText, tag }];
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
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Something went wrong. 🌙 ${err}. Let's try again?`,
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
                  {msg.role === "assistant" && msg.tag && TAG_CONFIG[msg.tag] && (
                    <div className="flex items-center gap-1 mb-2">
                      {(() => {
                        const Icon = TAG_CONFIG[msg.tag].icon;
                        return <Icon className={`w-3.5 h-3.5 ${TAG_CONFIG[msg.tag].color}`} />;
                      })()}
                      <span className={`text-[9px] font-bold tracking-widest uppercase ${TAG_CONFIG[msg.tag].color}`}>
                        {TAG_CONFIG[msg.tag].label}
                      </span>
                    </div>
                  )}
                  <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>ul]:mt-1 [&>ol]:mt-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
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
