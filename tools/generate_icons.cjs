#!/usr/bin/env node
/* Generates the app icons into ../icons (Node built-ins only: fs, zlib).
   Design: black square, thick orange ring, white clock ticks, a white hand pointing at 12.
   Drawn with 4x4 supersampling for smooth edges. Corners are NOT rounded (iOS masks them). */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
const SS = 4;                                  // supersampling per axis

/* ---------- PNG encoder ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgb) {                     // rgb: Uint8Array size*size*3
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;               // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- drawing (all coordinates in units of the icon size, centre = 0.5) ---------- */
const BLACK = [0, 0, 0], ORANGE = [255, 159, 10], WHITE = [255, 255, 255];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function colourAt(x, y, k) {                  // k = art scale (1 = normal, <1 for the maskable icon)
  const dx = x - 0.5, dy = y - 0.5, r = Math.hypot(dx, dy);
  // white things first (they sit on top)
  const handLen = 0.17 * k, handW = 0.022 * k;
  if (distToSegment(x, y, 0.5, 0.5, 0.5, 0.5 - handLen) <= handW) return WHITE;
  if (r <= 0.036 * k) return WHITE;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, major = i % 3 === 0;
    const r1 = (major ? 0.205 : 0.225) * k, r2 = 0.262 * k, w = (major ? 0.017 : 0.011) * k;
    if (distToSegment(x, y, 0.5 + Math.sin(a) * r1, 0.5 - Math.cos(a) * r1,
      0.5 + Math.sin(a) * r2, 0.5 - Math.cos(a) * r2) <= w) return WHITE;
  }
  if (r >= 0.30 * k && r <= 0.375 * k) return ORANGE;
  return BLACK;
}

function render(size, k) {
  const px = new Uint8Array(size * size * 3);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, k);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = (y * size + x) * 3;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n);
    }
  }
  return px;
}

fs.mkdirSync(OUT, { recursive: true });
[
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.82]       // art kept well inside the maskable safe zone
].forEach(([name, size, k]) => {
  const buf = png(size, render(size, k));
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(name.padEnd(24), size + 'x' + size, (buf.length / 1024).toFixed(1) + ' KB');
});
