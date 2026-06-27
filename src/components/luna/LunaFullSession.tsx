import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Coffee, ArrowLeft, RotateCcw, Zap, Monitor, Loader2, X, Mic, MicOff, Volume2, VolumeX, ImagePlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { LunaMark } from "./LunaMark";
import { LUNA_TAG_CONFIG } from "@/lib/luna-api";
import { getAccuracy, detectFatigue, resetSession as resetLunaSessionContext } from "@/lib/luna-context";
import { useLunaSessionTimer } from "@/hooks/use-luna-session-timer";
import { LunaMarkdown } from "./LunaMarkdown";
import { useXpMilestones } from "@/hooks/use-xp-milestones";
import { useLunaHistory } from "@/hooks/use-luna-history";
import { useLunaConversation, type ConversationMessage } from "@/hooks/use-luna-conversation";
import { LunaActions } from "./LunaActions";
import { LunaThinkingIndicator } from "./LunaThinkingIndicator";
import { useLunaVoice } from "@/hooks/use-luna-voice";
import { processUserImage } from "@/lib/luna-image";
import "./LunaSession.css";

type LunaMessage = ConversationMessage;

const INTRO_CONTENT = "Welcome to a deep learning session. 🌙 I'm Luna, your Socratic tutor. Tell me what you're working on, or pick a topic, and I'll guide you through it step by step. No shortcuts, just real understanding.";
const BREAK_MESSAGE = "You've been pushing through tough spots. 🌙 Take 5 minutes, grab some water, then come back fresh. I'll be here.";

export function LunaFullSession() {
  const { messages, setMessages, clear: clearHistory } = useLunaHistory() as {
    messages: LunaMessage[];
    setMessages: React.Dispatch<React.SetStateAction<LunaMessage[]>>;
    clear: () => void;
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const {
    input, setInput,
    isStreaming,
    pendingImage, setPendingImage,
    capturing,
    handleScreenShare,
    send, retryLast, abort,
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

  // Reset clears chat history AND the timer/streak/accuracy context. Before,
  // the old session's startTime would persist into the new one, so a fresh
  // "session" would immediately display a multi-hour duration.
  const resetSession = () => {
    abort();
    clearHistory();
    resetLunaSessionContext();
  };

  const accuracy = getAccuracy();
  // Live timer — re-renders every second, pauses when the tab is hidden,
  // and stays paused during streaming so partial assistant replies don't
  // inflate the user's effective study time.
  const { label: durationLabel } = useLunaSessionTimer();
  const fatigue  = detectFatigue();

  return (
    <div className="luna-shell">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="luna-topbar">
        <div className="luna-topbar-left">
          <Link to="/" className="luna-back" aria-label="Back to home">
            <ArrowLeft size={16} />
          </Link>
          <div className="luna-brand-row">
            <span className="luna-moon-glyph" aria-hidden="true"><LunaMark size={20} /></span>
            <div>
              <div className="luna-name">Luna</div>
              <div className="luna-sub">Deep tutoring session</div>
            </div>
          </div>
        </div>

        <div className="luna-topbar-right">
          <div className="luna-stats">
            <div className="luna-stat">
              <Zap size={12} />
              <span>{accuracy}% accuracy</span>
            </div>
            <div className={`luna-stat${fatigue !== "none" ? " luna-stat--warn" : ""}`}>
              <Coffee size={12} />
              <span>{durationLabel} session</span>
            </div>
          </div>
          <button onClick={resetSession} className="luna-reset-btn">
            <RotateCcw size={12} />
            New session
          </button>
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────── */}
      <div ref={scrollRef} className="luna-body">
        <div className="luna-body-inner">

          {/* Intro placeholder */}
          {messages.length === 0 && (
            <div className="luna-intro-row">
              <div className="luna-intro-bubble">
                <LunaMarkdown>{INTRO_CONTENT}</LunaMarkdown>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className={`luna-row luna-row--${msg.role === "user" ? "user" : "ai"}`}
            >
              <div className={`luna-bubble luna-bubble--${msg.role === "user" ? "user" : "ai"}`}>

                {/* Tag header */}
                {msg.role === "assistant" && msg.tag && LUNA_TAG_CONFIG[msg.tag] && (
                  <div className="luna-tag-row">
                    {(() => {
                      const Icon = LUNA_TAG_CONFIG[msg.tag].icon;
                      return <Icon size={13} className={LUNA_TAG_CONFIG[msg.tag].color} />;
                    })()}
                    <span className={`luna-tag-label ${LUNA_TAG_CONFIG[msg.tag].color}`}>
                      {LUNA_TAG_CONFIG[msg.tag].label}
                    </span>
                  </div>
                )}

                {/* Shared screen */}
                {msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt="Shared screen"
                    className="luna-shared-img"
                  />
                )}

                <LunaMarkdown className="[&>ul]:mt-1 [&>ol]:mt-1">{msg.content}</LunaMarkdown>

                {/* Actions */}
                {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                  <LunaActions actions={msg.actions} onSendBack={(t) => send({ text: t, image: null })} />
                )}

                {/* Retry on error */}
                {msg.role === "assistant" && typeof msg.id === "string" && msg.id.startsWith("err-") && (
                  <button
                    type="button"
                    onClick={retryLast}
                    disabled={isStreaming}
                    className="luna-retry-btn"
                  >
                    <RotateCcw size={11} /> Retry
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {/* Thinking indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="luna-thinking-row">
              <div className="luna-thinking-bubble">
                <LunaThinkingIndicator />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Input bar ────────────────────────────────────────────── */}
      <div className="luna-inputbar">
        <div className="luna-inputbar-inner">

          {/* Voice error */}
          {voice.voiceError && (
            <div className="luna-voice-error">
              <span>{voice.voiceError}</span>
              <button type="button" onClick={voice.clearVoiceError} className="luna-voice-error-close">✕</button>
            </div>
          )}

          {/* Screen preview */}
          {pendingImage && (
            <div className="luna-screen-preview">
              <img src={pendingImage} alt="Screen preview" className="luna-screen-thumb" />
              <span className="luna-screen-label">Screen attached</span>
              <button type="button" onClick={() => setPendingImage(null)} className="luna-screen-remove" aria-label="Remove">
                <X size={13} />
              </button>
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); send(); }} className="luna-input-row">

            <button
              type="button"
              onClick={handleScreenShare}
              disabled={capturing || isStreaming}
              title="Share your screen with Luna"
              className="luna-act-btn"
            >
              {capturing ? <Loader2 size={16} className="animate-spin" /> : <Monitor size={16} />}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Upload an image"
              className="luna-act-btn"
            >
              <ImagePlus size={16} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePick}
            />

            {voice.supported && (
              <>
                <button
                  type="button"
                  onClick={() => voice.listening ? voice.stopListening() : voice.startListening()}
                  disabled={isStreaming}
                  title={voice.listening ? "Stop listening" : "Speak to Luna"}
                  className={`luna-act-btn${voice.listening ? " luna-act-btn--listening" : ""}`}
                >
                  {voice.listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => voice.setSpeakEnabled((v: boolean) => !v)}
                  title={voice.speakEnabled ? "Mute Luna" : "Hear Luna's replies"}
                  className={`luna-act-btn${voice.speakEnabled ? " luna-act-btn--speaking" : ""}`}
                >
                  {voice.speakEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </>
            )}

            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={pendingImage ? "Ask Luna about your screen…" : "Ask a question, describe what you're stuck on, or tell Luna what you're learning…"}
              className="luna-input"
            />

            <button
              type="submit"
              disabled={(!input.trim() && !pendingImage) || isStreaming}
              className="luna-send-btn"
            >
              <Send size={16} />
            </button>

          </form>
        </div>
      </div>

    </div>
  );
}
