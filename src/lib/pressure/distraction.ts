import { prefersReducedMotion } from "@/lib/a11y";

/**
 * Distraction layer for exam realism.
 *
 * Sounds are **synthesised with Web Audio**, not shipped as files. Three reasons:
 * a room-tone loop long enough not to sound looped is megabytes; synthesis
 * randomises so it never repeats identically; and it needs no asset pipeline or
 * licensing. The trade-off is that these are impressions of a room rather than
 * field recordings - which is the right trade for a distraction that must sit
 * *under* the task, not become the task.
 *
 * Everything here is opt-in and instantly stoppable. Two guardrails:
 *   - Volume is capped well below the UI's own sounds. A distraction that makes
 *     the timer inaudible is a bug, not immersion.
 *   - It respects the reduced-motion preference. Users who ask for calm are
 *     frequently the same users for whom unexpected sound is genuinely
 *     disabling, so `reduce` disables the ambient layer by default.
 */

export type DistractionKind = "classroom" | "typing" | "clock" | "announcements";

export interface DistractionConfig {
  kinds: DistractionKind[];
  /** 0-1, scaled internally to a ceiling that never masks UI audio. */
  intensity: number;
}

const VOLUME_CEILING = 0.14;

export class DistractionEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private nodes: AudioScheduledSourceNode[] = [];
  private running = false;

  /** True when the engine declined to start (reduced motion, no audio). */
  suppressed = false;

  start(config: DistractionConfig): void {
    if (this.running) this.stop();
    if (config.kinds.length === 0) return;

    // Honour the calm preference rather than overriding it for "realism".
    if (prefersReducedMotion()) {
      this.suppressed = true;
      return;
    }

    try {
      this.ctx = new AudioContext();
    } catch {
      this.suppressed = true;
      return;
    }

    this.running = true;
    this.suppressed = false;
    this.master = this.ctx.createGain();
    this.master.gain.value = Math.min(VOLUME_CEILING, config.intensity * VOLUME_CEILING);
    this.master.connect(this.ctx.destination);

    if (config.kinds.includes("classroom")) this.roomTone();
    if (config.kinds.includes("typing")) this.typing(config.intensity);
    if (config.kinds.includes("clock")) this.clock();
    if (config.kinds.includes("announcements")) this.announcements(config.intensity);
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.nodes = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Room tone: filtered brown noise. Brown rather than white because white noise
   * reads as a hiss or a fault, while brown sits low and reads as "a room with
   * people in it" - which is what an exam hall actually sounds like.
   */
  private roomTone(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // Roll off the top so it never becomes a hiss.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    src.connect(lp).connect(gain).connect(master);
    src.start();
    this.nodes.push(src);
  }

  /** Irregular keystrokes. Even spacing reads as a machine, not a person. */
  private typing(intensity: number): void {
    const tick = () => {
      if (!this.running) return;
      this.click(1400 + Math.random() * 900, 0.012, 0.5);
      // 60-260ms gaps, plus occasional longer pauses for thinking.
      const gap = Math.random() < 0.12 ? 700 + Math.random() * 1400 : 60 + Math.random() * 200;
      this.timers.push(setTimeout(tick, gap / Math.max(0.3, intensity)));
    };
    this.timers.push(setTimeout(tick, 400));
  }

  /**
   * Clock tick. Deliberately the quietest layer: a metronome directly above a
   * countdown is closer to a horror-film device than exam practice, and the
   * point is to train focus, not to induce panic.
   */
  private clock(): void {
    const tick = () => {
      if (!this.running) return;
      this.click(2600, 0.008, 0.22);
      this.timers.push(setTimeout(tick, 1000));
    };
    this.timers.push(setTimeout(tick, 1000));
  }

  /**
   * Distant announcement: a muffled two-tone chime rather than speech. Synthetic
   * speech would be intelligible, and an intelligible sentence is not a
   * distraction - it is a second task.
   */
  private announcements(intensity: number): void {
    const fire = () => {
      if (!this.running) return;
      this.chime();
      // Every 45-150s, so it stays startling rather than expected.
      this.timers.push(
        setTimeout(fire, (45_000 + Math.random() * 105_000) / Math.max(0.4, intensity)),
      );
    };
    this.timers.push(setTimeout(fire, 30_000));
  }

  private click(freq: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
    this.nodes.push(osc);
  }

  private chime(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700; // muffled, as if through a wall
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.42;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.5, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.connect(lp).connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.62);
      this.nodes.push(osc);
    });
  }
}

/**
 * Scheduled interruptions - "pencils down", an invigilator walking past.
 *
 * Returns the delays rather than firing them, so the session owns the timing and
 * a paused or finished session cannot be interrupted by a stale timer. Never in
 * the last 20% of a session: interrupting someone during their final minutes
 * teaches nothing and only costs them marks.
 */
export function planInterruptions(durationSeconds: number, count: number): number[] {
  if (count <= 0 || durationSeconds < 120) return [];
  const usable = durationSeconds * 0.8;
  const spacing = usable / (count + 1);
  return Array.from({ length: count }, (_, i) =>
    Math.round(spacing * (i + 1) + (Math.random() - 0.5) * spacing * 0.4),
  );
}
