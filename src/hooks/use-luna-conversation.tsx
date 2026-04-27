/**
 * Shared conversation engine for both Luna surfaces. Owns the message stream
 * lifecycle: send, retry, abort, screen-share capture, fatigue-driven [BREAK]
 * suggestions, and learning_history logging. The JSX (which differs between
 * the mini panel and the full session) stays in the components.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { streamLunaChat, parseLunaTag } from "@/lib/luna-api";
import { getLunaContext, getAccuracy, getSessionDuration, escalateHint, resetHintLevel, subscribeFatigue } from "@/lib/luna-context";
import { captureScreenFrame } from "@/lib/luna-screen";
import { supabase } from "@/integrations/supabase/client";
import { useLunaProfile } from "@/hooks/use-luna-profile";

export type ConversationMessage = {
  role: "assistant" | "user";
  content: string;
  tag?: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
  imageDataUrl?: string;
  id?: string;
};

type SetMessages = React.Dispatch<React.SetStateAction<ConversationMessage[]>>;

interface Options {
  messages: ConversationMessage[];
  setMessages: SetMessages;
  /** learning_history.session_type tag — "chat" for the mini panel, "luna-session" for the full surface. */
  sessionType: "chat" | "luna-session";
  /** Optional reasoning effort passed to the gateway. Full session uses "low"; mini panel omits. */
  reasoning?: { effort: "low" | "medium" | "high" };
  /** Copy used for the [BREAK] suggestion fired when fatigue hits severe. */
  breakMessage: string;
  /** Active = panel is open / on-screen. Subscriptions and aborts hinge on this. */
  active: boolean;
}

export function useLunaConversation({ messages, setMessages, sessionType, reasoning, breakMessage, active }: Options) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<{ text: string; image: string | null } | null>(null);
  const { profileRef, historyRef } = useLunaProfile();

  // Abort any in-flight stream when the surface goes inactive.
  useEffect(() => {
    if (active) return;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [active]);

  // Event-driven fatigue → inject [BREAK] suggestion exactly once.
  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeFatigue((level) => {
      if (level !== "severe") return;
      setMessages(prev => {
        if (prev.some(m => m.tag === "break")) return prev;
        return [...prev, { role: "assistant", content: breakMessage, tag: "break" }];
      });
    });
    return unsubscribe;
  }, [active, breakMessage, setMessages]);

  const handleScreenShare = async () => {
    if (capturing || isStreaming) return;
    setCapturing(true);
    const result = await captureScreenFrame();
    setCapturing(false);
    if (result.ok) setPendingImage(result.dataUrl);
    else toast.error(result.message);
  };

  const send = async (override?: { text: string; image: string | null }) => {
    const text = override ? override.text : input.trim();
    const attachedImage = override ? override.image : pendingImage;
    if ((!text && !attachedImage) || isStreaming) return;
    if (!override) {
      setInput("");
      setPendingImage(null);
    }
    lastSendRef.current = { text, image: attachedImage };

    const userMsg: ConversationMessage = {
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
      ...(reasoning ? { reasoning } : {}),
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
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { tag } = parseLunaTag(assistantSoFar);
            await supabase.from("learning_history").insert({
              user_id: user.id,
              session_type: sessionType,
              topic: ctx.lessonTitle || ctx.courseId || null,
              question_text: text.slice(0, 500),
              hint_level_used: ctx.hintLevel,
              luna_summary: tag ? `[${tag.toUpperCase()}] ${assistantSoFar.slice(0, 200)}` : assistantSoFar.slice(0, 200),
            });
          } catch { /* non-critical, don't break chat */ }
        })();
        // Stream succeeded — clear the retry buffer entirely so we don't keep
        // the prior turn (and any base64 screen-share image) in memory.
        // retryLast() is gated on a trailing err-* bubble, which can't exist
        // after a successful stream, so dropping this is safe.
        lastSendRef.current = null;
      },
      onError: (err) => {
        toast.error(err);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Hmm, ${err} 🌙`,
          tag: null,
          id: `err-${Date.now()}`,
        }]);
        setIsStreaming(false);
      },
      signal: abortController.signal,
    });
  };

  const retryLast = () => {
    const last = lastSendRef.current;
    if (!last || isStreaming) return;
    setMessages(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant" && typeof prev[i].id === "string" && prev[i].id!.startsWith("err-")) {
          const trimmed = prev.slice(0, i);
          while (trimmed.length && trimmed[trimmed.length - 1].role === "user") trimmed.pop();
          return trimmed;
        }
      }
      return prev;
    });
    void send(last);
  };

  const abort = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  return {
    input, setInput,
    isStreaming,
    pendingImage, setPendingImage,
    capturing,
    handleScreenShare,
    send,
    retryLast,
    abort,
  };
}
