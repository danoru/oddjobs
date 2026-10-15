/** A short paper-rip, synthesised so there's no audio file to ship. */
let ctx: AudioContext | null = null;

export function playRip() {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    ctx ??= new AudioContext();
    const dur = 0.32;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Crackly noise: random bursts that thin out toward the end.
      const t = i / data.length;
      const crackle = Math.random() < 0.35 + 0.4 * (1 - t) ? 1 : 0.15;
      data[i] = (Math.random() * 2 - 1) * crackle * (1 - t) ** 1.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2400;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* no audio, no problem */
  }
}
