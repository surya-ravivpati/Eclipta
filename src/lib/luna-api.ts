// Luna AI streaming client
import { Lightbulb, Eye, Sparkles, Coffee, BookOpen, type LucideIcon } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; imageDataUrl?: string };

interface LunaContext {
  courseId?: string;
  lessonTitle?: string;
  currentQuestion?: string;
  difficulty?: string;
  weakAreas?: string[];
  streak?: number;
  incorrectCount?: number;
  avgResponseTime?: number;
  hintLevel?: number;
  consecutiveErrors?: number;
  rapidGuessCount?: number;
  accuracy?: number;
  sessionMinutes?: number;
  profile?: Record<string, unknown> | null;
  recentHistory?: Record<string, unknown>[] | null;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-chat`;

// Shared tag config so the mini panel and full session render the same way.
export type LunaTag = "hint" | "nudge" | "explain" | "challenge" | "break";
export const LUNA_TAG_CONFIG: Record<LunaTag, { icon: LucideIcon; color: string; label: string }> = {
  hint: { icon: Lightbulb, color: "text-neon-cyan", label: "HINT" },
  nudge: { icon: Sparkles, color: "text-neon-purple", label: "NUDGE" },
  explain: { icon: BookOpen, color: "text-neon-cyan", label: "EXPLAIN" },
  challenge: { icon: Eye, color: "text-neon-pink", label: "CHALLENGE" },
  break: { icon: Coffee, color: "text-neon-pink", label: "BREAK" },
};

// Shared localStorage key — the mini panel and full session share memory
// so dropping into the full session continues the same conversation.
export const LUNA_HISTORY_KEY = "luna:history:v2";

// Cap the rolling history we send to the model. Older turns are summarized
// into a single context line so token cost stays roughly linear.
export const LUNA_MAX_TURNS = 16;

/**
 * Trim a message list before sending to the model:
 *  - Strip image payloads from anything except the most recent user turn
 *    (the model only needs to "see" the latest screen, not every prior one).
 *  - Keep at most LUNA_MAX_TURNS of recent messages; collapse older turns
 *    into a single system-style assistant note so context isn't lost.
 */
export function trimMessagesForApi(msgs: Msg[]): Msg[] {
  const lastUserWithImageIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user" && msgs[i].imageDataUrl) return i;
    }
    return -1;
  })();
  const stripped: Msg[] = msgs.map((m, i) => {
    if (m.imageDataUrl && i !== lastUserWithImageIdx) {
      const { imageDataUrl: _drop, ...rest } = m;
      return { ...rest, content: rest.content || "[earlier shared screen]" };
    }
    return m;
  });
  if (stripped.length <= LUNA_MAX_TURNS) return stripped;
  const overflow = stripped.slice(0, stripped.length - LUNA_MAX_TURNS);
  const recent = stripped.slice(-LUNA_MAX_TURNS);
  const summary = `[Earlier in this session: ${overflow.length} messages exchanged. Topics touched: ${
    Array.from(new Set(overflow.map(m => m.content.split(/[.?!\n]/)[0].slice(0, 60)).filter(Boolean))).slice(0, 5).join("; ")
  }]`;
  return [{ role: "assistant", content: summary }, ...recent];
}

export async function streamLunaChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
  signal,
  reasoning,
  idleTimeoutMs,
}: {
  messages: Msg[];
  context?: LunaContext;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "none" };
  idleTimeoutMs?: number;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: trimMessagesForApi(messages), context, reasoning }),
      signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      // Surface 402/429 with explicit, user-readable messages so the UI can
      // toast them instead of dropping a raw "Error 429" into the chat bubble.
      let msg = err.error || `Error ${resp.status}`;
      if (resp.status === 429) msg = "Luna is getting a lot of questions right now. Try again in a moment.";
      else if (resp.status === 402) msg = "Luna's AI credits ran out. Add more in Workspace → Usage.";
      onError?.(msg);
      onDone();
      return;
    }

    if (!resp.body) {
      onError?.("No response stream");
      onDone();
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    // Idle-timeout: if no chunk arrives within idleTimeoutMs (default 60s),
    // abort the read so we don't hang the UI on a stuck SSE connection.
    const timeoutMs = idleTimeoutMs ?? 60000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleAborted = false;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleAborted = true;
        try { reader.cancel(); } catch { /* ignore */ }
      }, timeoutMs);
    };
    armIdle();

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
    if (idleTimer) clearTimeout(idleTimer);
    if (idleAborted) {
      onError?.("Luna went quiet. The connection timed out - try again.");
      onDone();
      return;
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      onDone();
      return;
    }
    onError?.((e as Error).message || "Connection failed");
    onDone();
  }
}

// Parse Luna's response tag
export function parseLunaTag(content: string): {
  tag: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
  text: string;
} {
  // Allow whitespace inside the brackets so e.g. "[ HINT ]" still parses.
  const match = content.match(/^\[\s*(HINT|NUDGE|EXPLAIN|CHALLENGE|BREAK)\s*\]\s*/i);
  if (match) {
    return {
      tag: match[1].toLowerCase() as any,
      text: content.slice(match[0].length),
    };
  }
  return { tag: null, text: content };
}
