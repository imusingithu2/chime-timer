// Static sanity checks for the deployable files. Run with:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const norm = (u) => u.replace(/^\.\//, '').split('?')[0];

const html = read('index.html');
const sw = read('sw.js');
const referenced = [...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => norm(m[1]));
const precache = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => norm(m[1])).filter((f) => f !== '');

test('every file referenced by index.html exists and is precached by sw.js', () => {
  assert.ok(referenced.length >= 10);
  for (const f of referenced) {
    assert.ok(exists(f), 'missing file: ' + f);
    assert.ok(precache.includes(f), 'not in sw.js precache: ' + f);
  }
});

test('every file in the sw.js precache list exists', () => {
  for (const f of precache) if (f !== '') assert.ok(exists(f), 'precache lists a missing file: ' + f);
});

test('all 6 sounds + silent.wav are in the precache and in the engine list', () => {
  const E = require_engine();
  for (const n of [...E.SOUNDS, 'silent']) assert.ok(precache.includes('sounds/' + n + '.wav'), n);
});
function require_engine() {
  return JSON.parse(JSON.stringify({ SOUNDS: [...read('js/engine.js').matchAll(/SOUNDS\s*=\s*\[([^\]]+)\]/g)][0][1].split(',').map((s) => s.trim().replace(/['"]/g, '')) }));
}

test('no absolute (leading "/") URLs: the site lives under /chime-timer/', () => {
  assert.equal(/(?:href|src)="\/[^"]/.test(html), false);
  for (const f of ['js/platform.js', 'js/ui-main.js', 'sw.js', 'manifest.webmanifest']) {
    assert.equal(/['"]\/(?:sounds|icons|js|styles|sw\.js)/.test(read(f)), false, f);
  }
});

test('manifest is valid and its icons exist', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(exists(i.src), i.src);
});

test('version has a single source (js/version.js) used by index.html and sw.js', () => {
  assert.match(read('js/version.js'), /APP_VERSION\s*=\s*'\d+\.\d+\.\d+'/);
  assert.match(sw, /importScripts\('\.\/js\/version\.js'\)/);
  assert.ok(referenced.includes('js/version.js'));
});

test('PNG icons have the right size; WAV files are valid', () => {
  const sizes = { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/icon-maskable-512.png': 512 };
  for (const [f, px] of Object.entries(sizes)) {
    const b = fs.readFileSync(path.join(ROOT, f));
    assert.equal(b.subarray(1, 4).toString(), 'PNG', f);
    assert.equal(b.readUInt32BE(16), px, f + ' width');
    assert.equal(b.readUInt32BE(20), px, f + ' height');
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'sounds'))) {
    const b = fs.readFileSync(path.join(ROOT, 'sounds', f));
    assert.equal(b.subarray(0, 4).toString(), 'RIFF', f);
    assert.equal(b.subarray(8, 12).toString(), 'WAVE', f);
    assert.ok(b.length > 1000, f);
  }
});

test('classic scripts only (no ES modules) and source files stay small', () => {
  assert.equal(/type="module"/.test(html), false);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    const src = read('js/' + f);
    assert.equal(/^\s*(import|export)\s/m.test(src), false, f + ' uses import/export');
    assert.ok(src.split('\n').length < 400, f + ' is too long');
  }
});

test('.nojekyll exists (GitHub Pages must not run Jekyll)', () => assert.ok(exists('.nojekyll')));
