/**
 * timer-engine.js
 * Pure logic for the Chime Timer. No DOM dependencies.
 */

export const Status = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended'
};

/**
 * Calculates elapsed time in milliseconds.
 * @param {Object} state - Current timer state.
 * @param {number} now - Current timestamp (Date.now()).
 * @returns {number} Elapsed time in ms, clamped to [0, totalMs].
 */
export function elapsedMs(state, now) {
  let elapsed = state.accumulatedMs || 0;
  if (state.status === Status.RUNNING && state.lastResumeAt) {
    elapsed += (now - state.lastResumeAt);
  }
  return Math.max(0, Math.min(elapsed, state.totalMs || 0));
}

/**
 * Resolves chimes to their absolute elapsed time.
 * @param {Array} chimes - List of chime configurations.
 * @param {number} totalMs - Total timer duration.
 * @returns {Array} Sorted list of resolved chimes.
 */
export function resolveChimes(chimes, totalMs) {
  if (!chimes) return [];

  const resolved = chimes.map(chime => {
    let atElapsedMs = 0;
    if (chime.mode === 'fromStart') {
      atElapsedMs = chime.time;
    } else if (chime.mode === 'beforeEnd') {
      atElapsedMs = totalMs - chime.time;
    }

    const valid = atElapsedMs > 0 && atElapsedMs < totalMs;

    return {
      ...chime,
      atElapsedMs,
      valid
    };
  });

  // Sort by time
  resolved.sort((a, b) => a.atElapsedMs - b.atElapsedMs);

  // Merge duplicates (same time)
  const merged = [];
  for (const chime of resolved) {
    if (merged.length > 0 && merged[merged.length - 1].atElapsedMs === chime.atElapsedMs) {
      const last = merged[merged.length - 1];
      last.ringSeconds = Math.max(last.ringSeconds, chime.ringSeconds);
      // Prefer non-invalid or specific sound if needed, but basically just merge
    } else {
      merged.push({ ...chime });
    }
  }

  return merged;
}

/**
 * Determines which events are due to fire.
 * @param {Object} state - Current timer state.
 * @param {number} now - Current timestamp (Date.now()).
 * @returns {Object} { chimes: [], end: boolean, missed: [] }
 */
export function dueEvents(state, now) {
  const elapsed = elapsedMs(state, now);
  const due = { chimes: [], end: false, missed: [] };

  const resolved = resolveChimes(state.chimes, state.totalMs);

  // Check chimes
  for (const chime of resolved) {
    if (!chime.valid) continue;
    if (state.firedChimeIds && state.firedChimeIds.includes(chime.id)) continue;

    if (elapsed >= chime.atElapsedMs) {
      // Catch-up rule: if more than 2s late, mark as missed
      // Note: we need to know when it SHOULD have fired.
      // Since we don't track exact firing time in state, we can estimate
      // based on the current elapsed vs the target.
      // However, "late" usually means it happened while the app was hidden.
      // In a pure engine, we can't know the exact "hidden" window unless passed in.
      // But we can check if elapsed is significantly past the target.
      // Wait: the SPEC says "if an event is at most 2s late, ring it".
      // This implies we check (elapsed - target) <= 2000.

      if (elapsed - chime.atElapsedMs <= 2000) {
        due.chimes.push(chime);
      } else {
        due.missed.push(chime.id);
      }
    }
  }

  // Check end event
  if (elapsed >= state.totalMs && state.status !== Status.ENDED) {
    due.end = true;
  }

  return due;
}

/**
 * Pure state transitions.
 */
export function createTimerState(totalMs, label = '', chimes = []) {
  return {
    status: Status.IDLE,
    totalMs,
    accumulatedMs: 0,
    lastResumeAt: null,
    chimes,
    endRingSeconds: 3,
    firedChimeIds: [],
    missedIds: [],
    label
  };
}

export function startTimer(state, now) {
  return {
    ...state,
    status: Status.RUNNING,
    lastResumeAt: now,
    firedChimeIds: [],
    missedIds: []
  };
}

export function pauseTimer(state, now) {
  return {
    ...state,
    status: Status.PAUSED,
    accumulatedMs: elapsedMs(state, now),
    lastResumeAt: null
  };
}

export function resumeTimer(state, now) {
  return {
    ...state,
    status: Status.RUNNING,
    lastResumeAt: now
  };
}

export function cancelTimer(state) {
  return {
    ...state,
    status: Status.IDLE,
    accumulatedMs: 0,
    lastResumeAt: null,
    firedChimeIds: [],
    missedIds: []
  };
}
