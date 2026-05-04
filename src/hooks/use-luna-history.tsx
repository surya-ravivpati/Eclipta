import { useState, useEffect, useRef } from "react";
import { LUNA_HISTORY_KEY } from "@/lib/luna-api";
import type { LunaAction } from "@/lib/luna-api";

export type StoredLunaMessage = {
  role: "assistant" | "user";
  content: string;
  tag?: "hint" | "nudge" | "explain" | "challenge" | "break" | null;
  imageDataUrl?: string;
  id?: string;
  actions?: LunaAction[];
};

const MAX_PERSISTED = 100;

function loadInitial(): StoredLunaMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LUNA_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredLunaMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Single source of truth for Luna chat history. Both the mini panel and the
 * full session call this hook so they share state via localStorage + a
 * cross-tab/cross-mount storage event subscription.
 */
export function useLunaHistory() {
  const [messages, setMessages] = useState<StoredLunaMessage[]>(loadInitial);
  // Track the last value we wrote so storage events triggered by *our own*
  // setItem don't cause a feedback loop.
  const lastWriteRef = useRef<string | null>(null);

  // Persist on change.
  useEffect(() => {
    try {
      const serialized = JSON.stringify(messages.slice(-MAX_PERSISTED));
      lastWriteRef.current = serialized;
      localStorage.setItem(LUNA_HISTORY_KEY, serialized);
    } catch { /* ignore */ }
  }, [messages]);

  // Sync across instances / tabs. When another mount writes the key, mirror
  // it into local state.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LUNA_HISTORY_KEY || e.newValue === null) return;
      if (e.newValue === lastWriteRef.current) return;
      try {
        const parsed = JSON.parse(e.newValue) as StoredLunaMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clear = () => {
    setMessages([]);
    try { localStorage.removeItem(LUNA_HISTORY_KEY); } catch { /* ignore */ }
    lastWriteRef.current = null;
  };

  return { messages, setMessages, clear };
}
