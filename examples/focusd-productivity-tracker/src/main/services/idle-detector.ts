import { powerMonitor } from 'electron';
import * as db from './database';
import { log } from './logger';

const TAG = 'IDLE';
const POLL_INTERVAL_MS = 30_000;

interface IdleState {
  isIdle: boolean;
  idleStartTime: number | null;
  sessionId: string | null;
  thresholdSecs: number;
}

let state: IdleState = {
  isIdle: false,
  idleStartTime: null,
  sessionId: null,
  thresholdSecs: 300,
};

let pollTimer: NodeJS.Timeout | null = null;
let onIdleChange: ((idle: boolean) => void) | null = null;

export function startIdleDetection(
  sessionId: string,
  thresholdMins: number,
  onChange?: (idle: boolean) => void,
): void {
  state = {
    isIdle: false,
    idleStartTime: null,
    sessionId,
    thresholdSecs: thresholdMins * 60,
  };
  onIdleChange = onChange || null;

  log(TAG, `Idle detection started (threshold: ${thresholdMins}m, poll: ${POLL_INTERVAL_MS / 1000}s)`);

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopIdleDetection(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (state.isIdle && state.idleStartTime) {
    recordIdlePeriod();
  }
  log(TAG, 'Idle detection stopped');
  state = {
    isIdle: false,
    idleStartTime: null,
    sessionId: null,
    thresholdSecs: 300,
  };
  onIdleChange = null;
}

export function isCurrentlyIdle(): boolean {
  return state.isIdle;
}

function poll(): void {
  const idleSecs = powerMonitor.getSystemIdleTime();

  if (idleSecs >= state.thresholdSecs && !state.isIdle) {
    state.isIdle = true;
    state.idleStartTime = Math.floor(Date.now() / 1000) - idleSecs;
    log(TAG, `User went IDLE (idle for ${idleSecs}s, threshold: ${state.thresholdSecs}s)`);
    onIdleChange?.(true);
  } else if (idleSecs < state.thresholdSecs && state.isIdle) {
    const duration = state.idleStartTime
      ? Math.floor(Date.now() / 1000) - state.idleStartTime
      : 0;
    log(TAG, `User RETURNED (was idle for ${duration}s)`);
    recordIdlePeriod();
    state.isIdle = false;
    state.idleStartTime = null;
    onIdleChange?.(false);
  }
}

function recordIdlePeriod(): void {
  if (!state.idleStartTime) return;
  const now = Math.floor(Date.now() / 1000);
  const duration = now - state.idleStartTime;

  if (duration > 0) {
    db.insertIdlePeriod({
      sessionId: state.sessionId || undefined,
      startTime: state.idleStartTime,
      endTime: now,
      durationSecs: duration,
    });
    log(TAG, `Idle period recorded: ${duration}s`);
  }
}
