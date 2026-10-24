import assert from 'node:assert';
import {
  Status,
  createTimerState,
  startTimer,
  pauseTimer,
  resumeTimer,
  elapsedMs,
  resolveChimes,
  dueEvents
} from '../js/timer-engine.js';

// Helper to simulate time passing
const wait = (ms) => new Promise(res => setTimeout(res, ms));

// Test 1: Basic Example from SPEC
// total 2:00, chime 1:00 fromStart 3s, end ring 3s
{
  console.log('Test 1: Basic Example');
  const total = 120 * 1000;
  const chimes = [{ id: 'c1', mode: 'fromStart', time: 60 * 1000, ringSeconds: 3 }];
  let state = createTimerState(total, 'Test', chimes);
  let now = Date.now();

  state = startTimer(state, now);

  // At 60s
  let tick1 = dueEvents(state, now + 60000);
  assert.strictEqual(tick1.chimes.length, 1, 'Should have 1 chime at 60s');
  assert.strictEqual(tick1.chimes[0].id, 'c1');

  // Mark as fired
  state.firedChimeIds = ['c1'];

  // At 120s
  let tick2 = dueEvents(state, now + 120000);
  assert.strictEqual(tick2.end, true, 'Should end at 120s');
}

// Test 2: beforeEnd mode
{
  console.log('Test 2: beforeEnd mode');
  const total = 100 * 1000;
  const chimes = [{ id: 'c1', mode: 'beforeEnd', time: 20 * 1000, ringSeconds: 3 }];
  let state = createTimerState(total, 'Test', chimes);
  let now = Date.now();
  state = startTimer(state, now);

  // Should ring when elapsed is 80s (100 - 20)
  let tick = dueEvents(state, now + 80000);
  assert.strictEqual(tick.chimes.length, 1, 'Should ring 20s before end');
}

// Test 3: Pause/Resume shifting
{
  console.log('Test 3: Pause/Resume shifting');
  const total = 100 * 1000;
  let state = createTimerState(total);
  let now = Date.now();

  state = startTimer(state, now);
  // Run for 30s
  state = pauseTimer(state, now + 30000);
  assert.strictEqual(state.accumulatedMs, 30000);

  // Resume at T+50s (gap of 20s)
  state = resumeTimer(state, now + 50000);

  // At T+80s (which is 30s actual elapsed + 30s since resume)
  let elapsed = elapsedMs(state, now + 80000);
  assert.strictEqual(elapsed, 60000, 'Elapsed should be 60s');
}

// Test 4: Invalid chime outside total
{
  console.log('Test 4: Invalid chime');
  const total = 60 * 1000;
  const chimes = [{ id: 'c1', mode: 'fromStart', time: 70 * 1000, ringSeconds: 3 }];
  const resolved = resolveChimes(chimes, total);
  assert.strictEqual(resolved[0].valid, false, 'Chime at 70s in 60s timer should be invalid');
}

// Test 5: Duplicate merge
{
  console.log('Test 5: Duplicate merge');
  const total = 100 * 1000;
  const chimes = [
    { id: 'c1', mode: 'fromStart', time: 50 * 1000, ringSeconds: 2 },
    { id: 'c2', mode: 'fromStart', time: 50 * 1000, ringSeconds: 5 },
  ];
  const resolved = resolveChimes(chimes, total);
  assert.strictEqual(resolved.length, 1, 'Two chimes at same time should merge');
  assert.strictEqual(resolved[0].ringSeconds, 5, 'Should take longer ring duration');
}

// Test 6: Catch-up (late rings)
{
  console.log('Test 6: Catch-up logic');
  const total = 100 * 1000;
  const chimes = [{ id: 'c1', mode: 'fromStart', time: 10 * 1000, ringSeconds: 3 }];
  let state = createTimerState(total, '', chimes);
  let now = Date.now();
  state = startTimer(state, now);

  // 1.s late: should ring
  let tick1 = dueEvents(state, now + 11000);
  assert.strictEqual(tick1.chimes.length, 1, '1s late should ring');

  // 3s late: should be missed
  let tick2 = dueEvents(state, now + 13000);
  assert.strictEqual(tick2.chimes.length, 0, '3s late should not ring');
  assert.strictEqual(tick2.missed.length, 1, '3s late should be marked missed');
}

// Test 7: State restored after reload
{
  console.log('Test 7: State restoration');
  const total = 100 * 1000;
  const state = {
    status: Status.RUNNING,
    totalMs: total,
    accumulatedMs: 20000,
    lastResumeAt: Date.now() - 10000, // started 10s ago
  };
  const elapsed = elapsedMs(state, Date.now());
  assert.ok(elapsed >= 30000 && elapsed <= 31000, 'Elapsed should be ~30s');
}

// Test 8: Max duration
{
  console.log('Test 8: Max duration');
  const maxMs = (23 * 3600 + 59 * 60 + 59) * 1000;
  const state = createTimerState(maxMs);
  assert.strictEqual(state.totalMs, maxMs);
}

console.log('All engine tests passed!');
