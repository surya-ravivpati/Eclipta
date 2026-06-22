import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * Cozy lofi player — loops /lofi.mp3 in the background of a study room.
 * Drop the track at public/lofi.mp3 and it plays here. Browsers block autoplay
 * until a user gesture, so it starts paused with a clear Play control.
 */
export function LofiPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setMissing(true);
      }
    }
  };

  return (
    <div className="sr-lofi">
      <audio
        ref={audioRef}
        src="/lofi.mp3"
        loop
        preload="auto"
        onError={() => setMissing(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        className="sr-lofi-toggle"
        onClick={toggle}
        aria-label={playing ? "Pause lofi" : "Play lofi"}
        title={missing ? "Add public/lofi.mp3 to enable music" : "Lofi beats"}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
        <Music size={13} className="sr-lofi-note" />
        <span className="sr-lofi-label">{playing ? "lofi · playing" : "lofi beats"}</span>
      </button>
      <button
        className="sr-lofi-mute"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <input
        className="sr-lofi-vol"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
        aria-label="Volume"
      />
      {missing && <span className="sr-lofi-missing">add public/lofi.mp3</span>}
    </div>
  );
}
