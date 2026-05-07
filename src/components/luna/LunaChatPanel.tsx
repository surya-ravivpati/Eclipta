import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, ArrowRight, Monitor, Loader2, RotateCcw, Mic, MicOff, Volume2, VolumeX, ImagePlus } from "lucide-react";
import { parseLunaTag, LUNA_TAG_CONFIG } from "@/lib/luna-api";
import { LunaThinkingIndicator } from "./LunaThinkingIndicator";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useXpMilestones } from "@/hooks/use-xp-milestones";
import { useLunaConversation, type ConversationMessage } from "@/hooks/use-luna-conversation";
import { LunaActions } from "./LunaActions";
import { useLunaVoice } from "@/hooks/use-luna-voice";
import { processUserImage } from "@/lib/luna-image";

export type LunaMessage = ConversationMessage;

interface LunaChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: LunaMessage[];
  setMessages: React.Dispatch<React.SetStateAction<LunaMessage[]>>;
  onStreamingChange?: (streaming: boolean) => void;
  /** Presentational intro shown when messages is empty. Not persisted. */
  introContent?: string | null;
}

const BREAK_MESSAGE = "You've been pushing through tough spots. 🌙 How about a 5-minute break? Or we could switch to a battle for some fun?";

export function LunaChatPanel({ open, onClose, messages, setMessages, onStreamingChange, introContent }: LunaChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
    sessionType: "chat",
    breakMessage: BREAK_MESSAGE,
    active: open,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const voice = useLunaVoice({ onTranscript: (t: string) => { setInput((prev: string) => (prev ? prev + " " : "") + t); } });

  // Stop any in-flight TTS the moment the panel is hidden.
  useEffect(() => {
    if (!open) voice.stopSpeaking();
  }, [open, voice]);

  // Speak each newly-completed assistant turn (when TTS toggle is on).
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

  // Lift streaming status so the floating Luna icon can show the thinking emoji.
  useEffect(() => { onStreamingChange?.(isStreaming); }, [isStreaming, onStreamingChange]);

  // XP milestones append celebration messages directly into chat.
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

  const tagIcon = (tag?: string | null) => {
    if (!tag || !(tag in LUNA_TAG_CONFIG)) return null;
    const config = LUNA_TAG_CONFIG[tag as keyof typeof LUNA_TAG_CONFIG];
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
          className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[min(520px,80vh)] flex flex-col glass-panel border border-acrylic-border overflow-hidden rounded-lg"
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
                onClick={() => { abort(); voice.stopSpeaking(); onClose(); }}
              >
                FULL SESSION <ArrowRight className="w-3 h-3" />
              </Link>
              <button onClick={() => { abort(); voice.stopSpeaking(); onClose(); }} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px] max-h-[min(360px,55vh)]">
            {messages.length === 0 && introContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 text-sm leading-relaxed rounded bg-secondary/50 border border-border text-foreground">
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{introContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
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
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
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
                <div className="bg-secondary/50 border border-border rounded">
                  <LunaThinkingIndicator compact />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-border">
            {voice.voiceError && (
              <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1.5 border border-destructive/50 bg-destructive/10 rounded text-[10px] text-destructive font-medium">
                <span>{voice.voiceError}</span>
                <button type="button" onClick={voice.clearVoiceError} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
              </div>
            )}
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                title="Upload an image"
                className="p-2 border border-input bg-secondary/30 hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors disabled:opacity-30 rounded-sm"
              >
                <ImagePlus className="w-3.5 h-3.5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
              {voice.supported && (
                <>
                  <button
                    type="button"
                    onClick={() => voice.listening ? voice.stopListening() : voice.startListening()}
                    disabled={isStreaming}
                    title={voice.listening ? "Stop listening" : "Speak to Luna"}
                    className={`p-2 border border-input transition-colors disabled:opacity-30 rounded-sm ${voice.listening ? "bg-neon-pink/20 border-neon-pink text-neon-pink" : "bg-secondary/30 hover:border-neon-pink/50 hover:text-neon-pink"}`}
                  >
                    {voice.listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => voice.setSpeakEnabled((v: boolean) => !v)}
                    title={voice.speakEnabled ? "Mute Luna's voice" : "Hear Luna's replies"}
                    className={`p-2 border border-input transition-colors rounded-sm ${voice.speakEnabled ? "bg-neon-purple/20 border-neon-purple text-neon-purple" : "bg-secondary/30 hover:border-neon-purple/50 hover:text-neon-purple"}`}
                  >
                    {voice.speakEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
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
