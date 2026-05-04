import { useEffect, useRef, useState, useCallback } from "react";

/** Web Speech API wrapper: push-to-talk dictation + optional spoken replies. */
export function useLunaVoice(opts: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = Array.from(e.results).map((res: any) => res[0].transcript).join(" ").trim();
      if (t) opts.onTranscript(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    return () => { try { r.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    if (!recRef.current || listening) return;
    try { recRef.current.start(); setListening(true); } catch { /* ignore */ }
  }, [listening]);

  const stopListening = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!speakEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = text
      .replace(/`[^`]*`/g, "")
      .replace(/\$\$[\s\S]*?\$\$/g, "")
      .replace(/\$[^$\n]+\$/g, "")
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

  return { supported, listening, startListening, stopListening, speakEnabled, setSpeakEnabled, speak };
}