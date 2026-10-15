/**
 * Tear-Off soundboard engine. Every sound is synthesised with the Web Audio
 * API (noise buffers, filters, oscillators, LFOs): no audio files, no licences.
 *
 * Shape of things:
 *  - `SoundEngine` lazily creates ONE AudioContext (call it from a user gesture),
 *    a master gain -> compressor chain and a shared synthetic reverb.
 *  - A preset is a small function `(env, rig, out) => ...` that builds a node
 *    graph into `out`. Everything it creates goes through the `Rig`, which
 *    stops sources, clears timers and disconnects nodes when the voice ends.
 *  - Beds loop until faded out; stingers return their duration in seconds.
 *
 * This module touches no browser globals at import time (it is unit-tested in Node).
 */
import type { SOUND_BEDS, SOUND_STINGERS } from "@/lib/schema";

export type SoundBed = (typeof SOUND_BEDS)[number];
export type SoundStinger = (typeof SOUND_STINGERS)[number];

type NoiseKind = "white" | "pink" | "brown";

/** Shared, per-context resources handed to every preset. */
export type Env = { ctx: AudioContext; noise: Record<NoiseKind, AudioBuffer> };

const TINY = 0.0001;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Rig: owns everything one voice creates so nothing leaks.
// ---------------------------------------------------------------------------

function safeDisconnect(n: AudioNode) {
  try {
    n.disconnect();
  } catch {
    /* already disconnected */
  }
}

export class Rig {
  private nodes = new Set<AudioNode>();
  private live = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;

  get disposed() {
    return this.dead;
  }

  /** Keep a long-lived node so `dispose` can disconnect it. */
  keep<T extends AudioNode>(n: T): T {
    this.nodes.add(n);
    return n;
  }

  /**
   * Track a (started or about to be started) source. `owned` nodes (a transient
   * filter/gain chain) are disconnected when the source ends, so short events
   * such as fire crackles don't accumulate.
   */
  src<T extends AudioScheduledSourceNode>(s: T, ...owned: AudioNode[]): T {
    this.live.set(s, owned);
    s.addEventListener("ended", () => this.release(s), { once: true });
    return s;
  }

  private release(s: AudioScheduledSourceNode) {
    const owned = this.live.get(s);
    this.live.delete(s);
    safeDisconnect(s);
    owned?.forEach(safeDisconnect);
  }

  /** setTimeout that dies with the rig. */
  after(ms: number, fn: () => void) {
    if (this.dead) return;
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.dead) fn();
    }, ms);
    this.timers.add(id);
  }

  /** Call `fn` at random intervals until the rig is disposed. */
  every(minMs: number, maxMs: number, fn: () => void, firstMs = rand(minMs, maxMs)) {
    const tick = () => {
      fn();
      this.after(rand(minMs, maxMs), tick);
    };
    this.after(firstMs, tick);
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    for (const s of [...this.live.keys()]) {
      try {
        s.stop();
      } catch {
        /* never started, or already stopped */
      }
      this.release(s);
    }
    this.nodes.forEach(safeDisconnect);
    this.nodes.clear();
  }
}

// ---------------------------------------------------------------------------
// Small node helpers
// ---------------------------------------------------------------------------

const G = (c: AudioContext, v: number) => {
  const g = c.createGain();
  g.gain.value = v;
  return g;
};

const F = (c: AudioContext, type: BiquadFilterType, freq: number, q = 1) => {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
};

/** Connect nodes in series; returns the last one. */
function wire(first: AudioNode, ...rest: AudioNode[]): AudioNode {
  let prev = first;
  for (const n of rest) {
    prev.connect(n);
    prev = n;
  }
  return prev;
}

/** Ramp-safe envelope: ~silent -> peak (linear attack) -> ~silent (exponential decay). */
function pluck(p: AudioParam, t: number, peak: number, attack: number, decay: number) {
  p.setValueAtTime(TINY, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(TINY, t + attack + decay);
}

/** Swell: 0 -> peak over `rise`, a quick fall to ~3% by 80% of `total`, then a linear tail to silence. */
function swell(p: AudioParam, t: number, peak: number, rise: number, total: number) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + rise);
  p.exponentialRampToValueAtTime(peak * 0.03, t + rise + (total - rise) * 0.8);
  p.linearRampToValueAtTime(0, t + total);
}

function noiseSrc(
  env: Env,
  rig: Rig,
  kind: NoiseKind,
  o: { rate?: number; t?: number; dur?: number; owned?: AudioNode[] } = {},
) {
  const s = env.ctx.createBufferSource();
  s.buffer = env.noise[kind];
  s.loop = true;
  s.playbackRate.value = o.rate ?? 1;
  const t = o.t ?? 0;
  s.start(t, rand(0, s.buffer.duration));
  if (o.dur !== undefined) s.stop(t + o.dur);
  return rig.src(s, ...(o.owned ?? []));
}

function osc(
  env: Env,
  rig: Rig,
  type: OscillatorType,
  freq: number,
  t: number,
  dur?: number,
  ...owned: AudioNode[]
) {
  const o = env.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  if (dur !== undefined) o.stop(t + dur);
  return rig.src(o, ...owned);
}

/** Add an LFO to `param` (value = base + lfo * depth). Lives until the rig is disposed. */
function lfo(env: Env, rig: Rig, param: AudioParam, freq: number, depth: number, type: OscillatorType = "sine") {
  const g = rig.keep(G(env.ctx, depth));
  osc(env, rig, type, freq, 0, undefined, g).connect(g);
  g.connect(param);
}

// ---------------------------------------------------------------------------
// Shared resources: noise buffers + a synthetic reverb impulse response
// ---------------------------------------------------------------------------

/** Seamlessly loopable noise, RMS-normalised so every colour sits at the same level. */
export function makeNoise(ctx: AudioContext, kind: NoiseKind, seconds = 8): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.3);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") {
      raw[i] = w;
    } else if (kind === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    }
  }
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const out = buf.getChannelData(0);
  // Equal-power fold of the extra tail onto the head, so the loop point is continuous.
  for (let i = 0; i < n; i++) {
    if (i < fade) {
      const a = (Math.PI / 2) * (i / fade);
      out[i] = raw[i] * Math.sin(a) + raw[n + i] * Math.cos(a);
    } else {
      out[i] = raw[i];
    }
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += out[i] * out[i];
  const k = 0.25 / Math.sqrt(sum / n || 1);
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i] * k));
  return buf;
}

/** A dark, church-ish room: stereo noise with exponential decay that gets duller over time. */
function makeImpulse(ctx: AudioContext, seconds = 2.8): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.5 + 0.45 * t;
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.exp(-t * seconds * 2.5) * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

type Voicing = (env: Env, rig: Rig, out: AudioNode) => void;

/** Run a preset into its own level-trimmed sub-bus. */
function layer(env: Env, rig: Rig, out: AudioNode, level: number, fn: Voicing) {
  const g = rig.keep(G(env.ctx, level));
  g.connect(out);
  fn(env, rig, g);
}

/**
 * Band-passed babble: each "voice" is pink noise through two formant-ish
 * band-passes whose centres drift, chopped at syllable rate and gated by a
 * slow "who's talking" envelope.
 */
function babble(
  env: Env,
  rig: Rig,
  out: AudioNode,
  o: { voices: number; level: number; f1: [number, number]; f2: [number, number]; rate?: [number, number] },
) {
  const c = env.ctx;
  const rate = o.rate ?? [2.5, 5.5];
  for (let i = 0; i < o.voices; i++) {
    const f1 = rand(...o.f1);
    const f2 = rand(...o.f2);
    const bp1 = rig.keep(F(c, "bandpass", f1, rand(4, 7)));
    const bp2 = rig.keep(F(c, "bandpass", f2, rand(4, 7)));
    const syl = rig.keep(G(c, o.level));
    const talk = rig.keep(G(c, 0.55));
    const src = noiseSrc(env, rig, "pink", { rate: rand(0.85, 1.2) });
    src.connect(bp1);
    src.connect(bp2);
    bp1.connect(syl);
    bp2.connect(syl);
    syl.connect(talk);
    talk.connect(out);
    lfo(env, rig, syl.gain, rand(...rate), o.level * 0.55);
    lfo(env, rig, talk.gain, rand(0.12, 0.45), 0.45);
    lfo(env, rig, bp1.frequency, rand(0.25, 1), f1 * 0.25);
    lfo(env, rig, bp2.frequency, rand(0.3, 1.2), f2 * 0.2);
  }
}

/** One thunder roll; `dist` 0 = overhead (with a crack), 1 = far away. Returns its length in seconds. */
function thunder(env: Env, rig: Rig, out: AudioNode, dist: number, t = env.ctx.currentTime + 0.01): number {
  const c = env.ctx;
  const dur = 5 + 4 * dist + rand(0, 1.5);
  const peak = 1.3 - 0.7 * dist;

  const lp = F(c, "lowpass", 1000 - 650 * dist, 0.7);
  lp.frequency.setValueAtTime(1000 - 650 * dist, t);
  lp.frequency.exponentialRampToValueAtTime(70, t + dur);
  const g = G(c, 0);
  // Rolling envelope: rise, then alternating dips and weaker bumps.
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.05 + dist * 0.6);
  let tt = 0.4 + dist * 0.6;
  for (let k = 1; tt < dur - 1.2; k++) {
    const bump = peak * Math.pow(0.66, k) * rand(0.7, 1.3);
    g.gain.linearRampToValueAtTime(bump * 0.35, t + tt);
    g.gain.linearRampToValueAtTime(bump, t + tt + rand(0.15, 0.4));
    tt += rand(0.5, 1.2);
  }
  g.gain.linearRampToValueAtTime(0, t + dur);
  g.connect(out);

  noiseSrc(env, rig, "brown", { rate: 0.8, t, dur: dur + 0.1, owned: [lp, g] }).connect(lp);
  lp.connect(g);
  // A little low-mid body so phone speakers have something to play.
  const body = F(c, "lowpass", 220);
  noiseSrc(env, rig, "pink", { rate: 0.7, t, dur: dur + 0.1, owned: [body] }).connect(body);
  body.connect(g);

  if (dist < 0.55) {
    for (let k = 0; k < 3; k++) {
      const ct = t + k * rand(0.04, 0.12);
      const hp = F(c, "highpass", 1200);
      const cg = G(c, 0);
      pluck(cg.gain, ct, (1 - dist) * 0.9 / (k + 1), 0.002, rand(0.1, 0.25));
      noiseSrc(env, rig, "white", { t: ct, dur: 0.4, owned: [hp, cg] }).connect(hp);
      wire(hp, cg, out);
    }
  }
  return dur + 0.3;
}

type PartialSpec = [ratio: number, amp: number, decay: number];

/** Additive synthesis of inharmonic partials. Returns the time the last partial dies. */
function additive(
  env: Env,
  rig: Rig,
  dest: AudioNode,
  t: number,
  base: number,
  parts: PartialSpec[],
  o: { attack?: number; bloom?: number; beat?: number } = {},
): number {
  const c = env.ctx;
  let end = 0;
  parts.forEach(([ratio, amp, decay], i) => {
    const attack = (o.attack ?? 0.004) + (o.bloom ?? 0) * i;
    const voices = o.beat ? [0, rand(0.35, o.beat)] : [0];
    voices.forEach((dt, k) => {
      const g = G(c, 0);
      pluck(g.gain, t, amp * (k ? 0.6 : 1), attack, decay);
      g.connect(dest);
      osc(env, rig, "sine", base * ratio + dt, t, attack + decay + 0.1, g).connect(g);
    });
    end = Math.max(end, attack + decay);
  });
  return end;
}

// ---------------------------------------------------------------------------
// Beds
// ---------------------------------------------------------------------------

const rain: Voicing = (env, rig, out) => {
  const c = env.ctx;
  // Hiss
  const hiss = rig.keep(G(c, 0.45));
  wire(noiseSrc(env, rig, "white"), F(c, "highpass", 900), F(c, "lowpass", 8000), hiss, out);
  lfo(env, rig, hiss.gain, 0.11, 0.06);
  // Body
  const body = rig.keep(G(c, 0.4));
  wire(noiseSrc(env, rig, "pink", { rate: 1.3 }), F(c, "bandpass", 2200, 0.6), body, out);
  lfo(env, rig, body.gain, 0.07, 0.06);
  // Individual drops
  rig.every(110, 650, () => {
    const t = c.currentTime;
    const g = G(c, 0);
    pluck(g.gain, t, rand(0.015, 0.05), 0.002, rand(0.025, 0.06));
    osc(env, rig, "sine", rand(1800, 3800), t, 0.12, g).connect(g);
    g.connect(out);
  });
};

const wind: Voicing = (env, rig, out) => {
  const c = env.ctx;
  const bp = rig.keep(F(c, "bandpass", 520, 1.6));
  const g = rig.keep(G(c, 0.9));
  wire(noiseSrc(env, rig, "pink"), bp, g, out);
  lfo(env, rig, bp.frequency, 0.13, 260);
  lfo(env, rig, bp.frequency, 0.37, 120);
  lfo(env, rig, g.gain, 0.09, 0.45);
  lfo(env, rig, g.gain, 0.23, 0.15);
  // Thin whistle
  const bp2 = rig.keep(F(c, "bandpass", 1300, 9));
  const g2 = rig.keep(G(c, 0.6));
  wire(noiseSrc(env, rig, "white"), bp2, g2, out);
  lfo(env, rig, bp2.frequency, 0.17, 350);
  lfo(env, rig, g2.gain, 0.07, 0.4);
};

const sea: Voicing = (env, rig, out) => {
  const c = env.ctx;
  // Swell: loudness and brightness rise together on a ~11 s wave.
  const lp = rig.keep(F(c, "lowpass", 700, 0.5));
  const swellG = rig.keep(G(c, 0.45));
  wire(noiseSrc(env, rig, "pink"), lp, swellG, out);
  lfo(env, rig, lp.frequency, 0.09, 500);
  lfo(env, rig, swellG.gain, 0.09, 0.3);
  lfo(env, rig, swellG.gain, 0.043, 0.1);
  // Foam
  const foam = rig.keep(G(c, 0.08));
  wire(noiseSrc(env, rig, "white"), F(c, "highpass", 2500), foam, out);
  lfo(env, rig, foam.gain, 0.085, 0.07);
  // Sub rumble
  wire(noiseSrc(env, rig, "brown"), F(c, "lowpass", 200), rig.keep(G(c, 0.3)), out);
};

const fire: Voicing = (env, rig, out) => {
  const c = env.ctx;
  // Roar: dark pink noise with flicker
  const roar = rig.keep(G(c, 0.3));
  wire(noiseSrc(env, rig, "pink"), F(c, "lowpass", 350), roar, out);
  lfo(env, rig, roar.gain, 0.7, 0.08);
  lfo(env, rig, roar.gain, 0.23, 0.1);
  // Hiss
  const hiss = rig.keep(G(c, 0.05));
  wire(noiseSrc(env, rig, "white"), F(c, "highpass", 5000), hiss, out);
  lfo(env, rig, hiss.gain, 1.3, 0.03);
  // Crackle impulses (sometimes in little bursts), plus the odd low pop
  const snap = (t: number) => {
    const pop = Math.random() < 0.12;
    const bp = F(c, "bandpass", pop ? rand(500, 900) : rand(1200, 6000), pop ? 3 : 1.5);
    const dur = pop ? 0.03 : rand(0.004, 0.014);
    const g = G(c, 0);
    pluck(g.gain, t, pop ? rand(1.2, 2.2) : rand(0.4, 1.6), 0.001, dur * 3);
    noiseSrc(env, rig, "white", { t, dur: dur + 0.01, owned: [bp, g] }).connect(bp);
    wire(bp, g, out);
  };
  rig.every(35, 260, () => {
    const t = c.currentTime;
    const n = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 3) : 1;
    for (let i = 0; i < n; i++) snap(t + i * rand(0.015, 0.06));
  });
};

const tavern: Voicing = (env, rig, out) => {
  const c = env.ctx;
  const room = rig.keep(F(c, "lowpass", 3600));
  room.connect(out);
  babble(env, rig, room, { voices: 6, level: 1.1, f1: [320, 780], f2: [900, 2300] });
  wire(noiseSrc(env, rig, "pink"), F(c, "lowpass", 250), rig.keep(G(c, 0.12)), out);
  // Clinks of cups and the odd mug thunk
  rig.every(2500, 7500, () => {
    const t = c.currentTime;
    const f = rand(2400, 4200);
    const g = G(c, 0);
    pluck(g.gain, t, rand(0.02, 0.05), 0.001, rand(0.09, 0.2));
    g.connect(out);
    osc(env, rig, "sine", f, t, 0.35, g).connect(g);
    osc(env, rig, "sine", f * 1.51, t, 0.35, g).connect(g);
    if (Math.random() < 0.3) {
      const tg = G(c, 0);
      pluck(tg.gain, t + 0.08, 0.07, 0.003, 0.08);
      tg.connect(out);
      const th = osc(env, rig, "sine", 180, t + 0.08, 0.2, tg);
      th.frequency.setValueAtTime(180, t + 0.08);
      th.frequency.exponentialRampToValueAtTime(110, t + 0.16);
      th.connect(tg);
    }
  });
};

const crowd: Voicing = (env, rig, out) => {
  const c = env.ctx;
  const mass = rig.keep(G(c, 1));
  wire(mass, F(c, "lowpass", 4200), out);
  babble(env, rig, mass, { voices: 14, level: 0.6, f1: [300, 900], f2: [900, 2800] });
  lfo(env, rig, mass.gain, 0.07, 0.2);
  wire(noiseSrc(env, rig, "pink"), F(c, "lowpass", 300), rig.keep(G(c, 0.1)), out);
};

const drone: Voicing = (env, rig, out) => {
  const c = env.ctx;
  const lp = rig.keep(F(c, "lowpass", 420, 0.8));
  const g = rig.keep(G(c, 0.16));
  wire(lp, g, out);
  lfo(env, rig, lp.frequency, 0.05, 160);
  lfo(env, rig, g.gain, 0.08, 0.05);
  const voices: [OscillatorType, number, number, number][] = [
    ["sawtooth", 55, -7, 0.35],
    ["sawtooth", 55, 6, 0.35],
    ["sawtooth", 82.41, 3, 0.18],
    ["sawtooth", 58.27, 0, 0.1], // a flat-ninth-ish smudge for unease
    ["triangle", 110, -4, 0.12],
    ["sine", 27.5, 0, 0.5],
  ];
  for (const [type, freq, cents, level] of voices) {
    const vg = rig.keep(G(c, level));
    const o = osc(env, rig, type, freq, 0);
    o.detune.value = cents;
    o.connect(vg);
    vg.connect(lp);
    lfo(env, rig, o.detune, rand(0.03, 0.09), 8);
  }
};

const storm: Voicing = (env, rig, out) => {
  layer(env, rig, out, 1.3, rain);
  layer(env, rig, out, 0.9, wind);
  rig.every(9000, 24000, () => thunder(env, rig, out, rand(0.45, 1)), rand(3000, 8000));
};

// ---------------------------------------------------------------------------
// Stingers (each returns its length in seconds)
// ---------------------------------------------------------------------------

type Stinging = (env: Env, rig: Rig, out: AudioNode) => number;

/** Inharmonic partials of a tuned bell (hum, prime, tierce, quint, nominal, ...). */
const BELL_RATIOS = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215];
const BELL_AMPS = [0.55, 1, 0.7, 0.6, 0.8, 0.35, 0.3, 0.3, 0.2, 0.12, 0.08, 0.05];

/** A big storm/church bell: long hum, beating partials, clapper strike. */
const bell: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const sum = rig.keep(G(c, 0.18));
  sum.connect(out);
  const parts: PartialSpec[] = BELL_RATIOS.map((r, i) => [r, BELL_AMPS[i], 12 / Math.pow(r, 0.7)]);
  const end = additive(env, rig, sum, t, 150, parts, { beat: 1.7 });
  // Clapper: a bright tick and a dull knock
  const tick = G(c, 0);
  pluck(tick.gain, t, 0.35, 0.001, 0.06);
  const bp = F(c, "bandpass", 2400, 1.2);
  noiseSrc(env, rig, "white", { t, dur: 0.15, owned: [bp, tick] }).connect(bp);
  wire(bp, tick, out);
  const knock = G(c, 0);
  pluck(knock.gain, t, 0.5, 0.002, 0.12);
  const lp = F(c, "lowpass", 700);
  noiseSrc(env, rig, "pink", { t, dur: 0.25, owned: [lp, knock] }).connect(lp);
  wire(lp, knock, out);
  return end + 0.3;
};

const GONG_RATIOS = [1, 1.52, 2.11, 2.63, 3.28, 3.97, 4.82, 5.41, 6.7, 8.2];

/** Gong: dense inharmonic partials that bloom after the strike, with a sweeping wash. */
const gong: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const sum = rig.keep(G(c, 0.17));
  sum.connect(out);
  const parts: PartialSpec[] = GONG_RATIOS.map((r, i) => [r, 1 / (1 + i * 0.35), 10 - i * 0.5]);
  const end = additive(env, rig, sum, t, 96, parts, { attack: 0.01, bloom: 0.03, beat: 2.2 });
  const bp = F(c, "bandpass", 400, 0.8);
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2500, t + 1.5);
  bp.frequency.exponentialRampToValueAtTime(800, t + 6);
  const wash = G(c, 0);
  pluck(wash.gain, t, 0.5, 0.4, 5);
  noiseSrc(env, rig, "pink", { t, dur: 6, owned: [bp, wash] }).connect(bp);
  wire(bp, wash, out);
  const thump = G(c, 0);
  pluck(thump.gain, t, 0.25, 0.005, 0.4);
  const th = osc(env, rig, "sine", 90, t, 0.6, thump);
  th.frequency.exponentialRampToValueAtTime(60, t + 0.4);
  wire(th, thump, out);
  return end + 0.3;
};

const thunderStinger: Stinging = (env, rig, out) => thunder(env, rig, out, 0.1);

/** Rising then ebbing swell: a wave arriving and washing back. */
const tide: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const up = 3.6;
  const total = 9;
  const bp = F(c, "bandpass", 180, 0.9);
  bp.frequency.setValueAtTime(180, t);
  bp.frequency.exponentialRampToValueAtTime(1300, t + up);
  bp.frequency.exponentialRampToValueAtTime(220, t + total);
  const g = G(c, 0);
  swell(g.gain, t, 1.2, up, total);
  noiseSrc(env, rig, "pink", { t, dur: total + 0.1, owned: [bp, g] }).connect(bp);
  wire(bp, g, out);
  const foam = G(c, 0);
  swell(foam.gain, t, 0.22, up, total);
  const hp = F(c, "highpass", 2800);
  noiseSrc(env, rig, "white", { t, dur: total + 0.1, owned: [hp, foam] }).connect(hp);
  wire(hp, foam, out);
  return total + 0.3;
};

/** Low groan (two detuned, vibrato'd saws through a moving formant) plus gurgling bubbles. */
const drowned: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const total = 4.8;
  const bp = rig.keep(F(c, "bandpass", 350, 4));
  bp.frequency.setValueAtTime(350, t);
  bp.frequency.linearRampToValueAtTime(800, t + 1.6);
  bp.frequency.linearRampToValueAtTime(300, t + 4);
  const lp = rig.keep(F(c, "lowpass", 1000));
  const g = rig.keep(G(c, 0));
  swell(g.gain, t, 0.9, 0.9, total);
  wire(bp, lp, g, out);
  for (const f0 of [70, 72.7]) {
    const o = osc(env, rig, "sawtooth", f0, t, total + 0.1);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.66, t + 4);
    lfo(env, rig, o.frequency, 4.6, 1.8);
    o.connect(bp);
  }
  // Gurgle: wobbling narrow band of noise...
  const gbp = rig.keep(F(c, "bandpass", 380, 6));
  const gg = rig.keep(G(c, 0.5));
  const gEnv = rig.keep(G(c, 0));
  swell(gEnv.gain, t + 0.2, 0.9, 0.8, 4);
  wire(noiseSrc(env, rig, "pink", { t, dur: total }), gbp, gg, gEnv, out);
  lfo(env, rig, gbp.frequency, 11, 140);
  lfo(env, rig, gg.gain, 7, 0.45);
  // ...and rising bubbles
  for (let i = 0; i < 14; i++) {
    const bt = t + rand(0.3, 3.8);
    const f0 = rand(180, 420);
    const d = rand(0.04, 0.09);
    const bg = G(c, 0);
    pluck(bg.gain, bt, rand(0.05, 0.14), 0.004, d + 0.03);
    const b = osc(env, rig, "sine", f0, bt, d + 0.1, bg);
    b.frequency.setValueAtTime(f0, bt);
    b.frequency.exponentialRampToValueAtTime(f0 * rand(1.8, 2.6), bt + d);
    wire(b, bg, out);
  }
  return total + 0.4;
};

/** FM creak with stick-slip, then a wooden thud. */
const door: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const len = 1.25;
  const car = osc(env, rig, "sawtooth", 150, t, len + 0.1);
  const steps = 14;
  car.frequency.setValueAtTime(150, t);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    car.frequency.linearRampToValueAtTime(150 + 170 * Math.sin(Math.PI * u) + 60 * u + rand(-15, 15), t + len * u);
  }
  const modG = G(c, 60);
  osc(env, rig, "sine", 61, t, len + 0.1, modG).connect(modG);
  modG.connect(car.frequency);
  const am = rig.keep(G(c, 0.5));
  lfo(env, rig, am.gain, 19, 0.35, "triangle");
  const shape = rig.keep(G(c, 0));
  shape.gain.setValueAtTime(0, t);
  shape.gain.linearRampToValueAtTime(0.5, t + 0.12);
  shape.gain.setValueAtTime(0.5, t + len - 0.2);
  shape.gain.linearRampToValueAtTime(0, t + len);
  wire(car, am, rig.keep(F(c, "bandpass", 650, 2.5)), rig.keep(F(c, "lowpass", 2400)), shape, out);
  // Thud as it meets the frame
  const tt = t + len - 0.05;
  const tg = G(c, 0);
  pluck(tg.gain, tt, 0.9, 0.004, 0.35);
  const th = osc(env, rig, "sine", 95, tt, 0.5, tg);
  th.frequency.setValueAtTime(95, tt);
  th.frequency.exponentialRampToValueAtTime(42, tt + 0.22);
  wire(th, tg, out);
  const kg = G(c, 0);
  pluck(kg.gain, tt, 0.5, 0.003, 0.1);
  const klp = F(c, "lowpass", 380);
  noiseSrc(env, rig, "pink", { t: tt, dur: 0.2, owned: [klp, kg] }).connect(klp);
  wire(klp, kg, out);
  return len + 0.7;
};

/** Lub-dub: two low thumps with a harmonic and a soft click so phone speakers can reproduce them. */
const heartbeat: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const master = rig.keep(G(c, 0.6));
  master.connect(out);
  const thump = (at: number, f0: number, peak: number) => {
    const g = G(c, 0);
    pluck(g.gain, at, peak, 0.006, 0.28);
    const o = osc(env, rig, "sine", f0, at, 0.4, g);
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, at + 0.14);
    wire(o, g, master);
    const hg = G(c, 0);
    pluck(hg.gain, at, peak * 0.5, 0.004, 0.12);
    const h = osc(env, rig, "triangle", f0 * 2, at, 0.25, hg);
    wire(h, hg, master);
    const cg = G(c, 0);
    pluck(cg.gain, at, peak * 0.6, 0.003, 0.07);
    const clp = F(c, "lowpass", 260);
    noiseSrc(env, rig, "pink", { t: at, dur: 0.12, owned: [clp, cg] }).connect(clp);
    wire(clp, cg, master);
  };
  thump(t, 78, 1);
  thump(t + 0.3, 66, 0.75);
  return 1;
};

const GLASS_PARTIALS: PartialSpec[] = [
  [1, 1, 1.4],
  [2.32, 0.45, 0.9],
  [4.25, 0.25, 0.5],
  [6.63, 0.12, 0.3],
];

/** A struck wine glass: a few high, slightly beating partials. */
const glass: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const sum = rig.keep(G(c, 0.16));
  sum.connect(out);
  const end = additive(env, rig, sum, t, 1850, GLASS_PARTIALS, { attack: 0.001, beat: 3 });
  const hp = F(c, "highpass", 4000);
  const cg = G(c, 0);
  pluck(cg.gain, t, 0.12, 0.001, 0.02);
  noiseSrc(env, rig, "white", { t, dur: 0.06, owned: [hp, cg] }).connect(hp);
  wire(hp, cg, out);
  return end + 0.2;
};

/** A brief crowd swell with a few whoops. */
const cheer: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const total = 3.4;
  const g = rig.keep(G(c, 0));
  swell(g.gain, t, 1, 0.5, total);
  wire(g, F(c, "lowpass", 4500), out);
  babble(env, rig, g, { voices: 12, level: 1.0, f1: [380, 1000], f2: [1100, 3000], rate: [4, 7] });
  for (let i = 0; i < 3; i++) {
    const wt = t + rand(0.1, 1.2);
    const f = rand(330, 480);
    const wg = G(c, 0);
    pluck(wg.gain, wt, 0.12, 0.08, 0.4);
    const w = osc(env, rig, "sawtooth", f, wt, 0.6, wg);
    w.frequency.setValueAtTime(f, wt);
    w.frequency.exponentialRampToValueAtTime(f * 1.6, wt + 0.45);
    wire(w, F(c, "lowpass", 2000), wg, out);
  }
  return total + 0.4;
};

/** Noise with a band-pass that sweeps up and back down. */
const whoosh: Stinging = (env, rig, out) => {
  const c = env.ctx;
  const t = c.currentTime + 0.01;
  const total = 1.7;
  const sweep = (kind: NoiseKind, q: number, lo: number, hi: number, peak: number, delay: number) => {
    const bp = F(c, "bandpass", lo, q);
    bp.frequency.setValueAtTime(lo, t + delay);
    bp.frequency.exponentialRampToValueAtTime(hi, t + delay + 0.75);
    bp.frequency.exponentialRampToValueAtTime(lo * 1.2, t + delay + total - 0.1);
    const g = G(c, 0);
    swell(g.gain, t + delay, peak, 0.7, total - 0.1);
    noiseSrc(env, rig, kind, { t: t + delay, dur: total, owned: [bp, g] }).connect(bp);
    wire(bp, g, out);
  };
  sweep("pink", 1.4, 250, 3200, 1.4, 0);
  sweep("white", 3, 900, 6000, 0.3, 0.08);
  return total + 0.2;
};

// ---------------------------------------------------------------------------
// Preset maps. Typed with Record<enum, ...> so a missing implementation is a compile error.
// ---------------------------------------------------------------------------

/** `wet` is how much of the voice is sent to the shared reverb (0..1). */
export type BedPreset = { wet: number; play: Voicing };
export type StingerPreset = { wet: number; play: Stinging };

export const BED_PRESETS: Record<SoundBed, BedPreset> = {
  storm: { wet: 0.15, play: storm },
  rain: { wet: 0.1, play: rain },
  sea: { wet: 0.12, play: sea },
  wind: { wet: 0.12, play: wind },
  fire: { wet: 0.05, play: fire },
  tavern: { wet: 0.1, play: tavern },
  drone: { wet: 0.25, play: drone },
  crowd: { wet: 0.2, play: crowd },
};

export const STINGER_PRESETS: Record<SoundStinger, StingerPreset> = {
  bell: { wet: 0.4, play: bell },
  thunder: { wet: 0.25, play: thunderStinger },
  tide: { wet: 0.2, play: tide },
  drowned: { wet: 0.3, play: drowned },
  door: { wet: 0.2, play: door },
  heartbeat: { wet: 0.05, play: heartbeat },
  gong: { wet: 0.4, play: gong },
  glass: { wet: 0.3, play: glass },
  cheer: { wet: 0.2, play: cheer },
  whoosh: { wet: 0.15, play: whoosh },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** One playing preset: its rig, its fader bus and its reverb send. */
class Voice {
  readonly rig = new Rig();
  readonly bus: GainNode;
  private send: GainNode | null = null;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    reverb: AudioNode,
    wet: number,
  ) {
    this.bus = G(ctx, 0);
    this.bus.connect(dest);
    if (wet > 0) {
      this.send = G(ctx, wet);
      this.bus.connect(this.send);
      this.send.connect(reverb);
    }
  }

  /** Smooth, click-free linear fade from wherever the fader is now. */
  fadeTo(level: number, ms: number) {
    const p = this.bus.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(level, now + Math.max(ms, 15) / 1000);
  }

  release() {
    this.rig.dispose();
    safeDisconnect(this.bus);
    if (this.send) safeDisconnect(this.send);
  }
}

const MAX_STINGERS = 12;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private env: Env | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private volume: number;
  private bed: { preset: SoundBed; voice: Voice } | null = null;
  private fading = new Set<Voice>();
  private stingers = new Set<Voice>();
  private closed = false;

  constructor(opts: { volume?: number } = {}) {
    this.volume = Math.min(1, Math.max(0, opts.volume ?? 0.8));
  }

  static isSupported(): boolean {
    return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
  }

  get currentBed(): SoundBed | null {
    return this.bed?.preset ?? null;
  }

  /** Create the context on first use. Call from a user gesture (tap) so iOS/Chrome allow it to start. */
  private ensure(): Env | null {
    if (this.closed || !SoundEngine.isSupported()) return null;
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = G(ctx, this.masterGain(this.volume));
      const comp = ctx.createDynamicsCompressor(); // glues layers together and catches peaks
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = makeImpulse(ctx);
      const reverbIn = G(ctx, 1);
      const verbOut = G(ctx, 0.7);
      wire(reverbIn, verb, verbOut, master);
      this.ctx = ctx;
      this.master = master;
      this.reverb = reverbIn;
      this.env = {
        ctx,
        noise: { white: makeNoise(ctx, "white"), pink: makeNoise(ctx, "pink"), brown: makeNoise(ctx, "brown") },
      };
    }
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    return this.env;
  }

  private masterGain(v: number) {
    return v * v;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.masterGain(this.volume), this.ctx.currentTime, 0.03);
    }
  }

  /** Loop a bed, crossfading from the current one. Re-requesting the playing bed does nothing. */
  playBed(preset: SoundBed, { fadeMs = 2000 }: { fadeMs?: number } = {}) {
    const env = this.ensure();
    if (!env || !this.master || !this.reverb) return;
    if (this.bed?.preset === preset) return;
    const def = BED_PRESETS[preset];
    const voice = new Voice(env.ctx, this.master, this.reverb, def.wet);
    def.play(env, voice.rig, voice.bus);
    const crossfading = this.bed !== null;
    if (this.bed) this.retire(this.bed.voice, fadeMs);
    this.bed = { preset, voice };
    voice.fadeTo(1, crossfading ? fadeMs : Math.min(fadeMs, 900));
  }

  stopBed({ fadeMs = 1000 }: { fadeMs?: number } = {}) {
    if (!this.bed) return;
    this.retire(this.bed.voice, fadeMs);
    this.bed = null;
  }

  /** Fire a one-shot over whatever is playing. */
  playStinger(preset: SoundStinger) {
    const env = this.ensure();
    if (!env || !this.master || !this.reverb) return;
    const def = STINGER_PRESETS[preset];
    if (this.stingers.size >= MAX_STINGERS) {
      const oldest = this.stingers.values().next().value;
      if (oldest) this.retire(oldest, 150);
    }
    const voice = new Voice(env.ctx, this.master, this.reverb, def.wet);
    this.stingers.add(voice);
    voice.bus.gain.value = 1;
    const dur = def.play(env, voice.rig, voice.bus);
    voice.rig.after(dur * 1000 + 400, () => {
      this.stingers.delete(voice);
      this.fading.delete(voice);
      voice.release();
    });
  }

  /** Fade out the bed and any ringing stingers. */
  stopAll() {
    this.stopBed({ fadeMs: 400 });
    for (const v of [...this.stingers]) this.retire(v, 300);
  }

  /** Fade a voice to silence, then tear it down. */
  private retire(voice: Voice, fadeMs: number) {
    this.stingers.delete(voice);
    if (this.fading.has(voice)) return;
    this.fading.add(voice);
    voice.fadeTo(0, fadeMs);
    // Re-register the cleanup so it survives the stinger's own end-of-life timer.
    voice.rig.after(fadeMs + 150, () => {
      this.fading.delete(voice);
      voice.release();
    });
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.bed?.voice.release();
    this.bed = null;
    this.fading.forEach((v) => v.release());
    this.fading.clear();
    this.stingers.forEach((v) => v.release());
    this.stingers.clear();
    const ctx = this.ctx;
    this.ctx = this.env = this.master = this.reverb = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}
