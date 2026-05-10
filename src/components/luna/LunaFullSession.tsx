import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Coffee, ArrowLeft, RotateCcw, Zap, Monitor, Loader2, X, Mic, MicOff, Volume2, VolumeX, ImagePlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { LUNA_TAG_CONFIG } from "@/lib/luna-api";
import { LunaThinkingIndicator } from "./LunaThinkingIndicator";
import { getAccuracy, getSessionDuration, detectFatigue } from "@/lib/luna-context";
import { LunaMarkdown } from "./LunaMarkdown";
import { Navbar } from "@/components/Navbar";
import { useXpMilestones } from "@/hooks/use-xp-milestones";
import { useLunaHistory } from "@/hooks/use-luna-history";
import { useLunaConversation, type ConversationMessage } from "@/hooks/use-luna-conversation";
import { LunaActions } from "./LunaActions";
import { LunaThinkingIndicator } from "./LunaThinkingIndicator";
import { useLunaVoice } from "@/hooks/use-luna-voice";
import { processUserImage } from "@/lib/luna-image";

type LunaMessage = ConversationMessage;

// Presentational intro, rendered when history is empty, never persisted.
const INTRO_CONTENT = "Welcome to a deep learning session. 🌙 I'm Luna, your Socratic tutor. Tell me what you're working on, or pick a topic, and I'll guide you through it step by step. No shortcuts, just real understanding.";
const BREAK_MESSAGE = "You've been pushing through tough spots. 🌙 Take 5 minutes, grab some water, then come back fresh. I'll be here.";

export function LunaFullSession() {
  const { messages, setMessages, clear: clearHistory } = useLunaHistory() as {
    messages: LunaMessage[];
    setMessages: React.Dispatch<React.SetStateAction<LunaMessage[]>>;
    clear: () => void;
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    input, setInput,
    isStreaming,
    pendingImage, setPendingImage,
    capturing,
    handleScreenShare,
    send,
    retryLast,
    abort,
  } = useLunaConversation({
    messages, setMessages,
    sessionType: "luna-session",
    reasoning: { effort: "low" },
    breakMessage: BREAK_MESSAGE,
    active: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const voice = useLunaVoice({ onTranscript: (t: string) => setInput((prev: string) => (prev ? prev + " " : "") + t) });
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.speakEnabled || isStreaming) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.content && last.id !== lastSpokenRef.current) {
      lastSpokenRef.current = last.id ?? last.content.slice(0, 32);
      voice.speak(last.content);
    }
  }, [messages, isStreaming, voice]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const processed = await processUserImage(f);
    if (processed) setPendingImage(processed);
  };

  useXpMilestones({
    onLunaMessages: (msgs) => {
      setMessages(prev => [
        ...prev,
        ...msgs.map(content => ({ role: "assistant" as const, content, tag: "nudge" as const })),
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const resetSession = () => {
    abort();
    clearHistory();
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
            {messages.length === 0 && (
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-3 text-sm leading-relaxed rounded-lg bg-secondary/40 border border-border text-foreground">
                  <LunaMarkdown>{INTRO_CONTENT}</LunaMarkdown>
                </div>
              </div>
            )}
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
                  <LunaMarkdown className="[&>ul]:mt-1 [&>ol]:mt-1">{msg.content}</LunaMarkdown>
                  {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                    <LunaActions actions={msg.actions} onSendBack={(t) => send({ text: t, image: null })} />
                  )}
                  {msg.role === "assistant" && typeof msg.id === "string" && msg.id.startsWith("err-") && (
                    <button
                      type="button"
                      onClick={retryLast}
                      disabled={isStreaming}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-neon-purple hover:text-neon-pink transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" /> RETRY
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-secondary/40 border border-border rounded-lg">
                  <LunaThinkingIndicator />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-4">
          {voice.voiceError && (
            <div className="max-w-2xl mx-auto mb-2 flex items-center justify-between gap-2 px-2 py-1.5 border border-destructive/50 bg-destructive/10 rounded text-[10px] text-destructive font-medium">
              <span>{voice.voiceError}</span>
              <button type="button" onClick={voice.clearVoiceError} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}
          {pendingImage && (
            <div className="max-w-2xl mx-auto mb-2 flex items-center gap-2 p-1.5 border border-neon-cyan/30 bg-neon-cyan/5 rounded">
              <img src={pendingImage} alt="screen preview" className="w-12 h-8 object-cover rounded-sm border border-border" />
              <span className="text-[10px] font-bold tracking-widest text-neon-cyan flex-1">SCREEN ATTACHED</span>
              <button type="button" onClick={() => setPendingImage(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remove screen attachment">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); send(); }} className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={handleScreenShare}
              disabled={capturing || isStreaming}
              title="Share your screen with Luna"
              className="p-3 border border-input bg-secondary/30 hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors disabled:opacity-30 rounded-md"
            >
              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Upload an image"
              className="p-3 border border-input bg-secondary/30 hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors disabled:opacity-30 rounded-md"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
            {voice.supported && (
              <>
                <button
                  type="button"
                  onClick={() => voice.listening ? voice.stopListening() : voice.startListening()}
                  disabled={isStreaming}
                  title={voice.listening ? "Stop listening" : "Speak to Luna"}
                  className={`p-3 border border-input transition-colors disabled:opacity-30 rounded-md ${voice.listening ? "bg-neon-pink/20 border-neon-pink text-neon-pink" : "bg-secondary/30 hover:border-neon-pink/50 hover:text-neon-pink"}`}
                >
                  {voice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => voice.setSpeakEnabled((v: boolean) => !v)}
                  title={voice.speakEnabled ? "Mute Luna" : "Hear Luna's replies"}
                  className={`p-3 border border-input transition-colors rounded-md ${voice.speakEnabled ? "bg-neon-purple/20 border-neon-purple text-neon-purple" : "bg-secondary/30 hover:border-neon-purple/50 hover:text-neon-purple"}`}
                >
                  {voice.speakEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={pendingImage ? "Ask Luna about your screen..." : "Ask a question, describe what you're stuck on, or tell Luna what you're learning..."}
              className="flex-1 bg-secondary/30 border border-input rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-neon-purple/50"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !pendingImage) || isStreaming}
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
