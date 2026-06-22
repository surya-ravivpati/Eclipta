import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Voice I/O for Luna.
 *
 * Dictation: MediaRecorder captures a short audio clip on a user gesture,
 * then we POST it to the luna-stt edge function which proxies to Lovable AI
 * (openai/gpt-4o-mini-transcribe). Works across every modern browser, unlike
 * the legacy webkitSpeechRecognition path that was Chrome-only and silently
 * failed in many environments.
 *
 * Read-aloud: text is sent to luna-tts → Lovable AI (openai/gpt-4o-mini-tts)
 * which returns natural, conversational audio. Beats the browser
 * SpeechSynthesis voices (which sound robotic) by a wide margin.
 */

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-tts`;
const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-stt`;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+\$/g, "")
    .replace(/\\\(([\s\S]*?)\\\)/g, "")
    .replace(/\\\[([\s\S]*?)\\\]/g, "")
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, "")
    .replace(/\[\[ACTION:[^\]]*\]\]/g, "")
    .replace(/\[(HINT|NUDGE|EXPLAIN|CHALLENGE|BREAK)\]\s*/gi, "")
    .replace(/[#*_>~`]/g, "")
    .replace(/🌙/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useLunaVoice(opts: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Stable ref so async callbacks always call the latest onTranscript.
  const onTranscriptRef = useRef(opts.onTranscript);
  useEffect(() => { onTranscriptRef.current = opts.onTranscript; }, [opts.onTranscript]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasGUM = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
    const ok = hasGUM && typeof MediaRecorder !== "undefined";
    setSupported(ok);
  }, []);

  const releaseRecorder = useCallback(() => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ""; } catch { /* ignore */ }
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob, ext: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const fd = new FormData();
      fd.append("file", blob, `recording.${ext}`);
      const r = await fetch(STT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: fd,
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setVoiceError(typeof data?.error === "string" ? data.error : `Transcription failed (${r.status}).`);
        return;
      }
      const data = await r.json();
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (text) onTranscriptRef.current(text);
    } catch {
      setVoiceError("Transcription request failed. Check your connection.");
    }
  }, []);

  const startListening = useCallback(async () => {
    if (listening) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        releaseRecorder();
        setListening(false);
        if (blob.size < 1024) {
          setVoiceError("That recording was too short — try again.");
          return;
        }
        const ext = type.includes("mp4") ? "mp4" : type.includes("mpeg") ? "mp3" : "webm";
        void transcribe(blob, ext);
      };
      recorder.start();
      setListening(true);
    } catch (err) {
      releaseRecorder();
      setListening(false);
      const name = (err as { name?: string })?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") setVoiceError("Microphone access denied. Allow mic permission in your browser settings and try again.");
      else if (name === "NotFoundError") setVoiceError("No microphone found. Plug one in and try again.");
      else if (name === "NotReadableError") setVoiceError("Microphone is in use by another app.");
      else setVoiceError("Couldn't start recording. Try again.");
    }
  }, [listening, releaseRecorder, transcribe]);

  const stopListening = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { releaseRecorder(); setListening(false); }
    } else {
      releaseRecorder();
      setListening(false);
    }
  }, [releaseRecorder]);

  const speak = useCallback(async (text: string) => {
    if (!speakEnabled) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    stopSpeaking();
    const ctrl = new AbortController();
    ttsAbortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text: clean.slice(0, 1800) }),
        signal: ctrl.signal,
      });
      if (!r.ok || ctrl.signal.aborted) return;
      const blob = await r.blob();
      if (ctrl.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
      };
      await audio.play().catch(() => { /* autoplay blocked / interrupted */ });
    } catch { /* aborted or network */ }
  }, [speakEnabled, stopSpeaking]);

  const setSpeakEnabledSafe: typeof setSpeakEnabled = useCallback((v) => {
    setSpeakEnabled(prev => {
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(prev) : v;
      if (!next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  // Cleanup on unmount: stop mic and any in-flight TTS audio.
  useEffect(() => () => { stopSpeaking(); releaseRecorder(); }, [stopSpeaking, releaseRecorder]);

  return {
    supported,
    listening,
    startListening,
    stopListening,
    speakEnabled,
    setSpeakEnabled: setSpeakEnabledSafe,
    speak,
    stopSpeaking,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
  };
}
