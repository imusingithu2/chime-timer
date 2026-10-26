// Unit tests for the REAL js/engine.js (the same file the app loads in the browser).
// Run:  node --test   (no arguments; "node --test tests/" fails on Node 22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../js/engine.js');

const T0 = 1_000_000;
const sec = (n) => n * 1000;
const chime = (over = {}) => ({ id: 'c1', mode: 'fromStart', time: sec(60), ringSeconds: 3, sound: 'Bell', ...over });

function runningTimer(cfg) {
  const s = E.createState({ totalMs: sec(120), endSound: 'Bell', endRingSeconds: 3, chimes: [chime()], ...cfg });
  return E.start(s, T0);
}

// Replays the app's tick loop: ticks every 100 ms and returns what rang and when.
function simulate(s, fromMs, toMs, step = 100) {
  const log = [];
  for (let t = fromMs; t <= toMs; t += step) {
    const due = E.dueEvents(s, T0 + t);
    due.ring.forEach((c) => log.push({ at: t, type: 'chime', id: c.id, ringSeconds: c.ringSeconds }));
    if (due.end) log.push({ at: t, type: 'end-' + due.end });
    E.applyDue(s, due);
  }
  return log;
}

test('the 2:00 example: chime at 1:00 for 3 s, end ring at 2:00', () => {
  const s = runningTimer();
  const log = simulate(s, 0, sec(125));
  assert.equal(log.length, 2);
  assert.equal(log[0].type, 'chime');
  assert.ok(log[0].at >= sec(60) && log[0].at < sec(60) + 200, 'chime within one tick of 1:00');
  assert.equal(log[0].ringSeconds, 3);
  assert.equal(log[1].type, 'end-ring');
  assert.ok(log[1].at >= sec(120) && log[1].at < sec(120) + 200, 'end within one tick of 2:00');
  assert.equal(s.status, 'ended');
});

test('a chime rings exactly once even though it stays due', () => {
  const s = runningTimer();
  const log = simulate(s, sec(59), sec(70));
  assert.equal(log.filter((l) => l.type === 'chime').length, 1);
});

test('beforeEnd mode rings when the remaining time reaches the chime time', () => {
  const s = runningTimer({ chimes: [chime({ mode: 'beforeEnd', time: sec(30) })] });
  const log = simulate(s, 0, sec(121));
  assert.equal(log[0].type, 'chime');
  assert.ok(log[0].at >= sec(90) && log[0].at < sec(90) + 200);
});

test('multiple chimes, sorted, with their own ring length', () => {
  const s = runningTimer({
    chimes: [chime({ id: 'b', time: sec(90), ringSeconds: 5 }), chime({ id: 'a', time: sec(30), ringSeconds: 1 })]
  });
  const log = simulate(s, 0, sec(121)).filter((l) => l.type === 'chime');
  assert.deepEqual(log.map((l) => l.id), ['a', 'b']);
  assert.deepEqual(log.map((l) => l.ringSeconds), [1, 5]);
});

test('pause keeps elapsed time and resume shifts the schedule', () => {
  const s = runningTimer();
  E.pause(s, T0 + sec(30));
  assert.equal(s.status, 'paused');
  assert.equal(E.elapsedMs(s, T0 + sec(500)), sec(30), 'time does not move while paused');
  assert.equal(E.dueEvents(s, T0 + sec(500)).ring.length, 0, 'nothing rings while paused');
  E.resume(s, T0 + sec(100));
  assert.equal(E.elapsedMs(s, T0 + sec(100)), sec(30));
  assert.equal(E.elapsedMs(s, T0 + sec(129)), sec(59));
  assert.equal(E.dueEvents(s, T0 + sec(129)).ring.length, 0);
  assert.equal(E.dueEvents(s, T0 + sec(130)).ring.length, 1, 'chime at 1:00 of ELAPSED time');
});

test('a chime outside the timer is invalid and never rings', () => {
  const s = runningTimer({
    totalMs: sec(30),
    chimes: [chime({ id: 'late', time: sec(60) }), chime({ id: 'zero', time: 0 }),
      chime({ id: 'equal', time: sec(30) }), chime({ id: 'be0', mode: 'beforeEnd', time: 0 }),
      chime({ id: 'bebig', mode: 'beforeEnd', time: sec(45) })]
  });
  const r = E.resolveChimes(s.chimes, s.totalMs);
  assert.ok(r.every((c) => !c.valid));
  assert.equal(simulate(s, 0, sec(35)).filter((l) => l.type === 'chime').length, 0);
});

test('chimes at the same moment merge into one ring with the longer ring', () => {
  const chimes = [chime({ id: 'x', ringSeconds: 2 }), chime({ id: 'y', mode: 'beforeEnd', time: sec(60), ringSeconds: 7 })];
  const r = E.resolveChimes(chimes, sec(120));
  assert.equal(r.length, 1);
  assert.equal(r[0].ringSeconds, 7);
  assert.deepEqual(r[0].ids, ['x', 'y']);
  const s = runningTimer({ chimes });
  assert.equal(simulate(s, 0, sec(70)).filter((l) => l.type === 'chime').length, 1);
});

test('changing the total re-resolves the chimes', () => {
  const cs = [chime({ time: sec(60) })];
  assert.equal(E.resolveChimes(cs, sec(120))[0].valid, true);
  assert.equal(E.resolveChimes(cs, sec(30))[0].valid, false);
  assert.equal(E.resolveChimes(cs, sec(61))[0].valid, true);
  assert.equal(E.resolveChimes(cs, sec(60))[0].valid, false);
  const be = [chime({ mode: 'beforeEnd', time: sec(40) })];
  assert.equal(E.resolveChimes(be, sec(120))[0].atElapsedMs, sec(80));
  assert.equal(E.resolveChimes(be, sec(30))[0].valid, false);
});

test('catch-up: up to 2 s late still rings', () => {
  const s = runningTimer();
  const due = E.dueEvents(s, T0 + sec(60) + 2000);
  assert.equal(due.ring.length, 1);
  assert.equal(due.missed.length, 0);
});

test('catch-up: later than 2 s is marked missed and never rings', () => {
  const s = runningTimer();
  const due = E.dueEvents(s, T0 + sec(60) + 2001);
  assert.equal(due.ring.length, 0);
  assert.deepEqual(due.missed, ['c1']);
  E.applyDue(s, due);
  assert.deepEqual(s.missedIds, ['c1']);
  assert.equal(E.chimeState(s, E.resolveChimes(s.chimes, s.totalMs)[0]), 'missed');
  assert.equal(E.dueEvents(s, T0 + sec(61)).fired.length, 0, 'does not fire again');
});

test('catch-up: the whole timer ended while the page was frozen -> silent end', () => {
  const s = runningTimer();
  const due = E.dueEvents(s, T0 + sec(500));
  assert.equal(due.end, 'silent');
  assert.equal(due.ring.length, 0);
  assert.deepEqual(due.missed, ['c1']);
  assert.equal(due.endedAt, T0 + sec(120));
  E.applyDue(s, due);
  assert.equal(s.status, 'ended');
  assert.equal(s.endedSilently, true);
  assert.equal(s.endedAt, T0 + sec(120));
});

test('catch-up: end up to 2 s late still rings', () => {
  const s = runningTimer();
  assert.equal(E.dueEvents(s, T0 + sec(122)).end, 'ring');
  assert.equal(E.dueEvents(s, T0 + sec(122) + 1).end, 'silent');
});

test('the end ring replaces a chime that is due at the very end', () => {
  const s = runningTimer({ chimes: [chime({ time: sec(119) })] });
  const due = E.dueEvents(s, T0 + sec(120) + 500);
  assert.equal(due.end, 'ring');
  assert.equal(due.ring.length, 0);
  assert.equal(due.missed.length, 0);
  assert.deepEqual(due.fired, ['c1']);
});

test('state survives a reload (JSON round trip while running)', () => {
  const s = runningTimer();
  simulate(s, 0, sec(10));
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(E.elapsedMs(copy, T0 + sec(45)), sec(45));
  assert.equal(E.remainingMs(copy, T0 + sec(45)), sec(75));
  const log = simulate(copy, sec(45), sec(125));
  assert.deepEqual(log.map((l) => l.type), ['chime', 'end-ring']);
});

test('state survives a reload while paused', () => {
  const s = runningTimer();
  E.pause(s, T0 + sec(20));
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(E.elapsedMs(copy, T0 + sec(9999)), sec(20));
  E.resume(copy, T0 + sec(10000));
  assert.equal(E.remainingMs(copy, T0 + sec(10000)), sec(100));
});

test('maximum 23:59:59 and whole-second rounding', () => {
  assert.equal(E.MAX_MS, 86399000);
  assert.equal(E.cleanConfig({ totalMs: 10 * 86400000 }).totalMs, 86399000);
  assert.equal(E.cleanConfig({ totalMs: -5 }).totalMs, 0);
  assert.equal(E.cleanConfig({ totalMs: 1499 }).totalMs, 1000);
  assert.equal(E.formatDuration(86399000), '23:59:59');
});

test('formatting: countdown uses ceil so 2:00 is shown for the first second', () => {
  assert.equal(E.formatDuration(120000, 'ceil'), '2:00');
  assert.equal(E.formatDuration(119001, 'ceil'), '2:00');
  assert.equal(E.formatDuration(119000, 'ceil'), '1:59');
  assert.equal(E.formatDuration(0, 'ceil'), '0:00');
  assert.equal(E.formatDuration(3600000), '1:00:00');
  assert.equal(E.formatDuration(61000), '1:01');
  assert.equal(E.formatDuration(5000), '0:05');
});

test('chime summary text', () => {
  assert.equal(E.chimeSummary(chime()), '1:00 after start · 3 s · Bell');
  assert.equal(E.chimeSummary(chime({ mode: 'beforeEnd', time: sec(30), sound: 'Pulse', ringSeconds: 10 })),
    '0:30 before end · 10 s · Pulse');
});

test('cleanConfig repairs garbage coming from storage', () => {
  const c = E.cleanConfig({
    totalMs: 'abc', label: 5, endSound: 'Nope', endRingSeconds: 999,
    chimes: [{ mode: 'x', time: 'q', ringSeconds: 0, sound: 'Nope' }, null]
  });
  assert.equal(c.totalMs, 0);
  assert.equal(c.label, '');
  assert.equal(c.endSound, 'Bell');
  assert.equal(c.endRingSeconds, 60);
  assert.equal(c.chimes.length, 2);
  assert.equal(c.chimes[0].mode, 'fromStart');
  assert.equal(c.chimes[0].ringSeconds, 1);
  assert.equal(c.chimes[0].sound, 'Bell');
  assert.ok(c.chimes[0].id);
  assert.equal(E.cleanConfig({ endRingSeconds: 0 }).endRingSeconds, 0, '0 = until I stop it');
});

test('nextChime and chimeState', () => {
  const s = runningTimer({ chimes: [chime({ id: 'a', time: sec(30) }), chime({ id: 'b', time: sec(90) })] });
  assert.equal(E.nextChime(s, T0 + sec(10)).chime.id, 'a');
  assert.equal(E.nextChime(s, T0 + sec(10)).inMs, sec(20));
  simulate(s, 0, sec(40));
  assert.equal(E.nextChime(s, T0 + sec(40)).chime.id, 'b');
  const rc = E.resolveChimes(s.chimes, s.totalMs);
  assert.equal(E.chimeState(s, rc[0]), 'rang');
  assert.equal(E.chimeState(s, rc[1]), 'upcoming');
  simulate(s, sec(40), sec(100));
  assert.equal(E.nextChime(s, T0 + sec(100)), null);
});

test('recents: newest first, no exact duplicates, max 20', () => {
  let list = [];
  const base = { totalMs: sec(120), label: '', endSound: 'Bell', endRingSeconds: 3, chimes: [chime()] };
  list = E.addRecent(list, base, 1);
  list = E.addRecent(list, { ...base, totalMs: sec(60) }, 2);
  assert.equal(list.length, 2);
  assert.equal(list[0].totalMs, sec(60));
  list = E.addRecent(list, { ...base, chimes: [chime({ id: 'other-id' })] }, 3); // same config, different id
  assert.equal(list.length, 2, 'duplicate removed');
  assert.equal(list[0].totalMs, sec(120));
  for (let i = 1; i <= 30; i++) list = E.addRecent(list, { ...base, totalMs: sec(i) }, 10 + i);
  assert.equal(list.length, 20);
  assert.equal(list[0].totalMs, sec(30));
});

test('chimeTimesText for recents', () => {
  const cfg = { totalMs: sec(120), chimes: [chime({ time: sec(60) }), chime({ id: 'd', mode: 'beforeEnd', time: sec(30) })] };
  assert.equal(E.chimeTimesText(cfg), 'rings at 1:00, 1:30');
  assert.equal(E.chimeTimesText({ totalMs: sec(120), chimes: [] }), '');
});

test('restoreState: round-trips a running timer and keeps null as null', () => {
  const s = runningTimer();
  const r = E.restoreState(JSON.parse(JSON.stringify(s)));
  assert.equal(r.status, 'running');
  assert.equal(r.lastResumeAt, T0);
  assert.equal(r.endedAt, null);
  assert.equal(E.remainingMs(r, T0 + sec(30)), sec(90));
});

test('restoreState: rejects junk and broken running state', () => {
  assert.equal(E.restoreState(null), null);
  assert.equal(E.restoreState({ status: 'idle', totalMs: 5000 }), null);
  assert.equal(E.restoreState({ status: 'running', totalMs: 5000 }), null);   // running without lastResumeAt
  assert.equal(E.restoreState({ status: 'paused', totalMs: 0 }), null);
});

test('restoreState: paused keeps its accumulated time', () => {
  const s = runningTimer();
  E.pause(s, T0 + sec(40));
  const r = E.restoreState(JSON.parse(JSON.stringify(s)));
  assert.equal(r.status, 'paused');
  assert.equal(E.remainingMs(r, T0 + sec(9999)), sec(80));
});
