import { useEffect, useRef, useState, useCallback } from "react";

/** Web Speech API wrapper: push-to-talk dictation + optional spoken replies. */
export function useLunaVoice(opts: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Stable ref so recognition callbacks always call the latest onTranscript
  // without needing to be recreated when the prop changes.
  const onTranscriptRef = useRef(opts.onTranscript);
  useEffect(() => { onTranscriptRef.current = opts.onTranscript; }, [opts.onTranscript]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const startListening = useCallback(() => {
    if (listening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Always create a fresh instance — browsers often reject re-starting the
    // same recognition object, silently failing after the first use.
    try {
      const r = new SR();
      r.continuous = false;
      r.interimResults = false;
      r.lang = navigator.language || "en-US";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        const t = Array.from(e.results)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((res: any) => res[0].transcript)
          .join(" ")
          .trim();
        if (t) onTranscriptRef.current(t);
      };

      r.onend = () => setListening(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onerror = (e: any) => {
        setListening(false);
        // "no-speech" is a normal timeout — not worth surfacing as an error.
        if (e.error && e.error !== "no-speech") {
          const messages: Record<string, string> = {
            "not-allowed": "Microphone access denied. Allow mic permission in your browser and try again.",
            "network":     "Network error during voice recognition. Check your connection.",
            "aborted":     "",   // user-triggered, silent
            "audio-capture": "No microphone found. Plug one in and try again.",
          };
          const msg = messages[e.error as string] ?? `Voice error: ${e.error}`;
          if (msg) setVoiceError(msg);
        }
      };

      r.start();
      setListening(true);
      setVoiceError(null);
    } catch {
      setListening(false);
    }
  }, [listening]);

  const stopListening = useCallback(() => {
    // The recognition auto-stops via onend; we just update state immediately
    // so the UI reflects the intent without waiting for the onend callback.
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!speakEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = text
      .replace(/```[\s\S]*?```/g, "")   // strip code blocks
      .replace(/`[^`]*`/g, "")          // strip inline code
      .replace(/\$\$[\s\S]*?\$\$/g, "") // strip block math
      .replace(/\$[^$\n]+\$/g, "")      // strip inline math
      .replace(/[#*_>~`]/g, "")
      .replace(/🌙/g, "")
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean.slice(0, 800));
    u.rate = 1.05;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }, [speakEnabled]);

  return { supported, listening, startListening, stopListening, speakEnabled, setSpeakEnabled, speak, voiceError, clearVoiceError: () => setVoiceError(null) };
}
