import { useEffect, useRef, useState, useCallback } from "react";

/** Pick the most natural-sounding voice available in the browser. */
function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lang = (navigator.language || "en-US").toLowerCase();
  const langMatches = voices.filter(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = langMatches.length ? langMatches : voices;
  // Prefer high-quality / neural / natural voices when available.
  const preferredNames = [
    "Google UK English Female", "Google US English",
    "Microsoft Aria", "Microsoft Jenny", "Microsoft Guy",
    "Samantha", "Karen", "Daniel", "Serena",
  ];
  for (const name of preferredNames) {
    const v = pool.find(x => x.name.includes(name));
    if (v) return v;
  }
  // Heuristic: prefer voices with "Natural", "Neural", "Online", "Premium" hints.
  const enhanced = pool.find(v => /natural|neural|online|premium|enhanced/i.test(v.name));
  if (enhanced) return enhanced;
  // Fall back to the default-flagged voice, then first match.
  return pool.find(v => v.default) ?? pool[0];
}

/** Web Speech API wrapper: push-to-talk dictation + optional spoken replies. */
export function useLunaVoice(opts: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

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

  // Voices load asynchronously in some browsers — listen for the change event.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const refresh = () => { voiceRef.current = pickBestVoice(); };
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
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
    const v = voiceRef.current ?? pickBestVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1.0;
    u.pitch = 1.05;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }, [speakEnabled]);

  // Wrap setSpeakEnabled to immediately silence ongoing speech when muting.
  const setSpeakEnabledSafe: typeof setSpeakEnabled = useCallback((v) => {
    setSpeakEnabled(prev => {
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(prev) : v;
      if (!next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  // Always stop any in-flight TTS when the consumer unmounts (panel closed, page left).
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return { supported, listening, startListening, stopListening, speakEnabled, setSpeakEnabled: setSpeakEnabledSafe, speak, stopSpeaking, voiceError, clearVoiceError: () => setVoiceError(null) };
}
