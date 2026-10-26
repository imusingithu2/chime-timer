#!/usr/bin/env node
/* Generates the 6 original ring sounds + silent.wav into ../sounds (Node built-ins only).
   Every sound is EXACTLY 1.000 s, 44.1 kHz, mono, 16-bit, and starts and ends at silence, so
   "ring for N seconds" = N seamless loops and the stop point never clicks. */
'use strict';
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const LEN = RATE;                       // 1.000 s
const OUT = path.join(__dirname, '..', 'sounds');
const TAU = Math.PI * 2;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/* A tone with a fast attack and an exponential decay, starting at time `t0` (seconds). */
function addTone(buf, t0, freq, amp, decay, opts = {}) {
  const attack = opts.attack || 0.004;
  const dur = opts.dur || 1.0;
  const start = Math.floor(t0 * RATE);
  for (let i = start; i < Math.min(LEN, start + Math.floor(dur * RATE)); i++) {
    const t = (i - start) / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    let s = Math.sin(TAU * freq * t);
    if (opts.square) s = s + Math.sin(TAU * freq * 3 * t) / 3 + Math.sin(TAU * freq * 5 * t) / 5;
    buf[i] += s * amp * env;
  }
}

/* A flat beep with short ramps (used by Pulse / Digital). */
function addBeep(buf, t0, freq, dur, amp, harmonics) {
  const start = Math.floor(t0 * RATE), n = Math.floor(dur * RATE), ramp = Math.floor(0.006 * RATE);
  for (let i = 0; i < n && start + i < LEN; i++) {
    const env = Math.min(1, i / ramp, (n - i) / ramp);
    let s = Math.sin(TAU * freq * i / RATE);
    if (harmonics) s = 0.75 * s + 0.25 * Math.sin(TAU * freq * 2 * i / RATE);
    buf[start + i] += s * amp * env;
  }
}

/* Normalise to a peak of 0.85 and force the last 40 ms to fade to exactly zero. */
function finish(buf) {
  let peak = 0;
  buf.forEach((v) => { peak = Math.max(peak, Math.abs(v)); });
  const gain = peak > 0 ? 0.85 / peak : 1;
  const fade = Math.floor(0.04 * RATE);
  for (let i = 0; i < LEN; i++) {
    let v = buf[i] * gain;
    if (i >= LEN - fade) v *= 0.5 * (1 + Math.cos(Math.PI * (i - (LEN - fade)) / fade));
    buf[i] = v;
  }
  buf[0] = 0; buf[LEN - 1] = 0;
  return buf;
}

const sounds = {
  // A struck bell: inharmonic partials that decay at different speeds.
  Bell() {
    const b = new Float64Array(LEN);
    [[1, 1.0, 0.30], [2.76, 0.55, 0.20], [5.40, 0.35, 0.12], [8.93, 0.20, 0.07]]
      .forEach(([r, a, d]) => addTone(b, 0, 660 * r, a, d));
    return finish(b);
  },
  // Two bright notes, the second a fifth above.
  Chime() {
    const b = new Float64Array(LEN);
    addTone(b, 0.00, 1318.5, 0.9, 0.16);
    addTone(b, 0.00, 2637, 0.25, 0.08);
    addTone(b, 0.22, 1975.5, 0.9, 0.18);
    addTone(b, 0.22, 3951, 0.2, 0.08);
    return finish(b);
  },
  // Wooden three-note arpeggio.
  Marimba() {
    const b = new Float64Array(LEN);
    [[0.00, 392], [0.20, 523.25], [0.40, 659.25]].forEach(([t, f]) => {
      addTone(b, t, f, 0.9, 0.11, { attack: 0.002 });
      addTone(b, t, f * 4, 0.35, 0.03, { attack: 0.002 });
    });
    return finish(b);
  },
  // Soft sonar-like double ping.
  Beacon() {
    const b = new Float64Array(LEN);
    addTone(b, 0.00, 740, 0.9, 0.22, { attack: 0.01 });
    addTone(b, 0.00, 1480, 0.18, 0.12, { attack: 0.01 });
    addTone(b, 0.30, 740, 0.7, 0.22, { attack: 0.01 });
    addTone(b, 0.30, 1480, 0.14, 0.12, { attack: 0.01 });
    return finish(b);
  },
  // Three quick beeps.
  Pulse() {
    const b = new Float64Array(LEN);
    [0, 0.16, 0.32].forEach((t) => addBeep(b, t, 1000, 0.09, 0.9, true));
    return finish(b);
  },
  // Digital-watch alarm: four short high beeps.
  Digital() {
    const b = new Float64Array(LEN);
    [0, 0.12, 0.24, 0.36].forEach((t) => addBeep(b, t, 2000, 0.06, 0.8, false));
    return finish(b);
  }
};

fs.mkdirSync(OUT, { recursive: true });
Object.keys(sounds).forEach((name) => {
  const buf = wav(sounds[name]());
  fs.writeFileSync(path.join(OUT, name + '.wav'), buf);
  console.log(name.padEnd(8), (buf.length / 1024).toFixed(1) + ' KB');
});
fs.writeFileSync(path.join(OUT, 'silent.wav'), wav(new Float64Array(Math.floor(RATE * 0.5))));
console.log('silent   0.5 s of silence');
