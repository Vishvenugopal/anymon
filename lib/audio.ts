// Lightweight client-side audio manager.
//   - Music: looped WAV tracks (ambient ↔ battle) with crossfade, at 50% volume.
//   - SFX: synthesized with the WebAudio API (no asset files needed), at 75%.
// Browsers block audio until a user gesture, so nothing plays until unlockAudio()
// is called from the first tap/click (wired up in app/page.tsx).

const MUSIC_VOL = 0.5;
const SFX_VOL = 0.75;

export type MusicTrack = "ambient" | "battle";
export type Sfx =
  | "click"
  | "capture"
  | "success"
  | "error"
  | "hit"
  | "deploy"
  | "victory"
  | "defeat";

let ctx: AudioContext | null = null;
let ambient: HTMLAudioElement | null = null;
let battle: HTMLAudioElement | null = null;
let desired: MusicTrack = "ambient";
let unlocked = false;
const fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();

function el(track: MusicTrack): HTMLAudioElement {
  if (track === "ambient") {
    if (!ambient) {
      ambient = new Audio("/music/AmbientMusic.wav");
      ambient.loop = true;
      ambient.volume = 0;
      ambient.preload = "auto";
    }
    return ambient;
  }
  if (!battle) {
    battle = new Audio("/music/BattleMusic.wav");
    battle.loop = true;
    battle.volume = 0;
    battle.preload = "auto";
  }
  return battle;
}

function fadeTo(audio: HTMLAudioElement, target: number, ms = 600) {
  const existing = fadeTimers.get(audio);
  if (existing) clearInterval(existing);
  const steps = 12;
  const start = audio.volume;
  const dv = (target - start) / steps;
  let i = 0;
  const id = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, start + dv * i));
    if (i >= steps) {
      clearInterval(id);
      fadeTimers.delete(audio);
      if (target === 0) audio.pause();
    }
  }, ms / steps);
  fadeTimers.set(audio, id);
}

/** Call once from a user gesture (first tap) to satisfy autoplay policies. */
export function unlockAudio() {
  if (unlocked || typeof window === "undefined") return;
  unlocked = true;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  playMusic(desired);
}

/** Switch the looping background music (crossfades). Safe before unlock. */
export function playMusic(track: MusicTrack) {
  desired = track;
  if (!unlocked || typeof window === "undefined") return;
  const on = el(track);
  const off = el(track === "ambient" ? "battle" : "ambient");
  on.play().catch(() => {});
  fadeTo(on, MUSIC_VOL);
  if (!off.paused) fadeTo(off, 0);
}

/** Fire a short synthesized sound effect. No-op until audio is unlocked. */
export function playSfx(kind: Sfx) {
  if (!ctx || !unlocked) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t0 = ctx.currentTime;

  // Each effect is a little sequence of {freq, start, dur, type, gain} notes.
  const note = (
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = "sine",
    gain = 1,
  ) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = SFX_VOL * gain;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  };

  switch (kind) {
    case "click":
      note(660, 0, 0.06, "square", 0.35);
      break;
    case "deploy":
      note(440, 0, 0.08, "triangle", 0.5);
      note(660, 0.07, 0.1, "triangle", 0.5);
      break;
    case "capture":
      note(523, 0, 0.09, "sine", 0.6);
      note(784, 0.08, 0.12, "sine", 0.6);
      break;
    case "success":
      note(659, 0, 0.1, "sine", 0.6);
      note(988, 0.09, 0.16, "sine", 0.6);
      break;
    case "victory":
      note(523, 0, 0.12, "triangle", 0.6);
      note(659, 0.12, 0.12, "triangle", 0.6);
      note(784, 0.24, 0.12, "triangle", 0.6);
      note(1047, 0.36, 0.24, "triangle", 0.6);
      break;
    case "defeat":
      note(440, 0, 0.16, "sawtooth", 0.4);
      note(330, 0.16, 0.16, "sawtooth", 0.4);
      note(247, 0.32, 0.3, "sawtooth", 0.4);
      break;
    case "hit":
      note(180, 0, 0.1, "square", 0.5);
      break;
    case "error":
      note(220, 0, 0.16, "sawtooth", 0.4);
      break;
  }
}
