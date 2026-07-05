// SYNAPSE · Vivarium — audio cue engine (Web Audio, fully synthesized).
// The "beep" half of the fault indicator. Every cue is triggered by a REAL logged beat (the same
// forward-play transient layer that fires the visual FX) — audio never invents an event. Tones are
// synthesized on the fly (oscillator + gain envelope): no asset files, so the offline/air-gapped
// product story holds. Browsers block autoplay, so the context is created lazily and resumed on the
// first user gesture (unlock()); a mute toggle gates everything.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  }

  // one enveloped voice: freq (with optional linear glide to slideTo) over dur seconds
  function voice(when, { freq, slideTo, dur, type = "sine", gain = 0.2, attack = 0.008 }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, when + dur);
    // short attack, exponential decay -> a clean "beep" rather than a click
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // cue name -> a small score of voices, scheduled from "now"
  const SCORES = {
    // urgent confirmed-fault / escalation: three quick high square beeps
    fault(t0) {
      for (let i = 0; i < 3; i++)
        voice(t0 + i * 0.13, { freq: 920, dur: 0.1, type: "square", gain: 0.22 });
    },
    // self-quarantine (STALE): a slow descending two-tone amber "warble" — the down-swing
    stale(t0) {
      voice(t0, { freq: 500, slideTo: 360, dur: 0.34, type: "sawtooth", gain: 0.16 });
      voice(t0 + 0.36, { freq: 420, slideTo: 300, dur: 0.4, type: "sawtooth", gain: 0.14 });
    },
    // systemic batch-defect klaxon: alternating two-tone, louder, repeated
    klaxon(t0) {
      for (let i = 0; i < 3; i++) {
        voice(t0 + i * 0.28, { freq: 740, dur: 0.14, type: "sawtooth", gain: 0.22 });
        voice(t0 + i * 0.28 + 0.14, { freq: 560, dur: 0.14, type: "sawtooth", gain: 0.22 });
      }
    },
    // teacher publishes a signature: a short mid "ping"
    teach(t0) {
      voice(t0, { freq: 660, dur: 0.12, type: "triangle", gain: 0.16 });
    },
    // born-wise learn: a soft high blip
    learn(t0) {
      voice(t0, { freq: 1180, dur: 0.09, type: "sine", gain: 0.12 });
    },
    // recovery / rejoin: a rising C-E-G "all-clear" chime
    recover(t0) {
      [523.25, 659.25, 783.99].forEach((f, i) =>
        voice(t0 + i * 0.12, { freq: f, dur: 0.28, type: "sine", gain: 0.17 }));
    },
    // channel-integrity reject: a terse two-note "denied" buzz — the comparator throwing out a
    // tampered copy. Low, gritty, clearly distinct from the high fault beeps and the systemic klaxon.
    reject(t0) {
      voice(t0, { freq: 300, slideTo: 190, dur: 0.14, type: "square", gain: 0.2 });
      voice(t0 + 0.16, { freq: 240, slideTo: 150, dur: 0.18, type: "square", gain: 0.18 });
    },
  };

  return {
    // resume the context inside a user gesture (autoplay policy)
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") c.resume();
    },
    setEnabled(v) {
      enabled = !!v;
      if (master) master.gain.value = enabled ? 0.9 : 0.0;
    },
    isEnabled: () => enabled,
    // play a logged-beat cue (no-op if muted or unsupported)
    cue(name) {
      if (!enabled) return;
      const c = ensure();
      if (!c || !SCORES[name]) return;
      if (c.state === "suspended") c.resume();
      const t0 = c.currentTime + 0.001;
      SCORES[name](clamp(t0, 0, Infinity));
    },
  };
}
