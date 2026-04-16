// Luna AI streaming client

type Msg = { role: "user" | "assistant"; content: string };

interface LunaContext {
  courseId?: string;
  lessonTitle?: string;
  currentQuestion?: string;
  difficulty?: string;
  weakAreas?: string[];
  streak?: number;
  incorrectCount?: number;
  avgResponseTime?: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-chat`;

export async function streamLunaChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: Msg[];
  context?: LunaContext;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, context }),
      signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      onError?.(err.error || `Error ${resp.status}`);
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

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
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
  const match = content.match(/^\[(HINT|NUDGE|EXPLAIN|CHALLENGE|BREAK)\]\s*/i);
  if (match) {
    return {
      tag: match[1].toLowerCase() as any,
      text: content.slice(match[0].length),
    };
  }
  return { tag: null, text: content };
}
