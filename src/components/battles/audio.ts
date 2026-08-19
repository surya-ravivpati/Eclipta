/**
 * The battle arena's sound.
 *
 * Web Audio tone synthesis rather than sample files: six short cues, no assets
 * to load, no request that can fail mid-match. The context is created on first
 * use because a browser refuses one before the player has interacted with the
 * page, and a battle only starts after several clicks.
 *
 * Split out of KnowledgeBattles.tsx, which held nine unrelated responsibilities
 * in 5,400 lines.
 */
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === "suspended") void _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur);
}
// Pitch rises with streak (220 Hz base + 22 Hz per streak hit, capped at 880 Hz)
export function sfxStreak(streak: number) {
  playTone(Math.min(220 + streak * 22, 880), 0.11, "sine", 0.09);
}
export function sfxBreak() {
  playTone(160, 0.22, "triangle", 0.11);
  setTimeout(() => playTone(110, 0.28, "triangle", 0.07), 90);
}
export function sfxCombo() {
  playTone(660, 0.08, "sine", 0.13);
  setTimeout(() => playTone(880, 0.14, "sine", 0.1), 80);
}
export function sfxWild() {
  [0, 55, 110].forEach((ms, i) =>
    setTimeout(() => playTone(300 + i * 130, 0.18, "sawtooth", 0.07), ms),
  );
}
// Rising major arpeggio for the win, falling minor slide for the loss
export function sfxVictory() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.22, "sine", 0.1), i * 110),
  );
}
export function sfxDefeat() {
  [330, 262, 196].forEach((f, i) => setTimeout(() => playTone(f, 0.3, "triangle", 0.1), i * 170));
}
