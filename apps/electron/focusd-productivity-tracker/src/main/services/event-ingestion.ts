import type { RawEvent, ActivitySegment, AppCategory } from '../../shared/types';
import * as db from './database';
import { isCurrentlyIdle } from './idle-detector';
import { isLLMReady, callLLM } from './llm-client';
import { getConfig, getPrompt } from './config';
import { log, warn, error } from './logger';

const TAG = 'INGEST';

let buffer: RawEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let activeSessionId: string | null = null;
let totalIngested = 0;
let totalFlushed = 0;

export function startIngestion(sessionId: string, segmentFlushMins?: number): void {
  activeSessionId = sessionId;
  buffer = [];
  totalIngested = 0;
  totalFlushed = 0;

  const flushMins = segmentFlushMins || 5;
  const intervalMs = flushMins * 60 * 1000;
  log(TAG, `Ingestion started (session: ${sessionId}, flush every ${flushMins}m)`);

  flushTimer = setInterval(() => flushToSegments(), intervalMs);
}

export async function stopIngestion(): Promise<void> {
  log(TAG, `Stopping ingestion (buffered: ${buffer.length}, total ingested: ${totalIngested}, total flushed: ${totalFlushed})`);
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (buffer.length > 0) {
    log(TAG, `Flushing remaining ${buffer.length} events before stop`);
    await flushToSegments();
  }
  activeSessionId = null;
}

export function ingestEvent(msg: Record<string, unknown>): void {
  if (!activeSessionId) {
    warn(TAG, 'Event received but no active session');
    return;
  }

  const channel = (msg.channel || msg.type || msg.event_type) as string;
  if (!channel) {
    warn(TAG, 'Event has no channel/type', { keys: Object.keys(msg) });
    return;
  }

  let summaryText: string | undefined;
  const data = (msg.data || {}) as Record<string, unknown>;

  switch (channel) {
    case 'scene_index':
    case 'visual_index': {
      const text = (data.text || msg.text || '') as string;
      if (!text.trim()) {
        warn(TAG, `${channel} event with empty text`);
        return;
      }
      summaryText = text;
      break;
    }
    case 'transcript': {
      const text = (msg.text || data.text || '') as string;
      if (!text.trim()) return;
      summaryText = text;
      break;
    }
    case 'spoken_index': {
      summaryText =
        ((msg.summary || data.summary || data.text || '') as string) || undefined;
      break;
    }
    case 'alert': {
      const label = (msg.label || data.label || '') as string;
      summaryText = label || undefined;
      break;
    }
    default:
      if (totalIngested < 20) {
        log(TAG, `Skipping unknown channel: "${channel}"`, { keys: Object.keys(msg) });
      }
      return;
  }

  totalIngested++;

  const event: RawEvent = {
    sessionId: activeSessionId,
    timestamp: Math.floor(Date.now() / 1000),
    channel: channel as RawEvent['channel'],
    appName: undefined,
    appCategory: undefined,
    summaryText,
    rawJson: JSON.stringify(msg),
  };

  if (totalIngested <= 20 || totalIngested % 25 === 0) {
    log(TAG, `Event #${totalIngested} [${channel}]`, {
      textPreview: summaryText?.slice(0, 120) || '(empty)',
    });
  }

  db.insertRawEvent(event);
  buffer.push(event);
}

export async function flushToSegments(): Promise<void> {
  if (!activeSessionId || buffer.length === 0) {
    if (activeSessionId) log(TAG, 'Flush called but buffer is empty');
    return;
  }

  const events = buffer.splice(0);
  const idle = isCurrentlyIdle();

  log(TAG, `Flushing ${events.length} events (idle: ${idle})`);

  const sceneTexts = events
    .filter(e => (e.channel === 'scene_index' || e.channel === 'visual_index') && e.summaryText)
    .map(e => e.summaryText!);

  const transcriptParts = events
    .filter(e => e.channel === 'transcript' && e.summaryText)
    .map(e => e.summaryText!);

  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  const context = sceneTexts[0]?.slice(0, 200);
  const transcriptSnippet = transcriptParts.join(' ').slice(0, 300) || undefined;

  if (!isLLMReady()) {
    log(TAG, 'LLM not ready, creating single fallback segment');
    const fallbackApp = extractFirstPhrase(sceneTexts[0] || '');
    const seg: ActivitySegment = {
      sessionId: activeSessionId,
      startTime,
      endTime,
      primaryApp: fallbackApp || 'Unknown',
      appCategory: 'other',
      action: 'working',
      project: undefined,
      context,
      transcriptSnippet,
      eventCount: events.length,
      isIdle: idle,
    };
    const id = db.insertActivitySegment(seg);
    totalFlushed++;
    log(TAG, `Fallback segment #${id} created (app: ${seg.primaryApp})`);
    return;
  }

  await classifyAndStore(activeSessionId, events, sceneTexts, transcriptParts, startTime, endTime, context, transcriptSnippet, idle);
}

async function classifyAndStore(
  sessionId: string,
  events: RawEvent[],
  sceneTexts: string[],
  transcriptParts: string[],
  startTime: number,
  endTime: number,
  context: string | undefined,
  transcriptSnippet: string | undefined,
  idle: boolean,
): Promise<void> {
  try {
    const existingApps = db.getDistinctAppsForDate(db.todayDateString());
    const existingProjects = db.getDistinctProjectsForSession(sessionId);

    let existingContext = '';
    if (existingApps.length > 0 || existingProjects.length > 0) {
      const parts: string[] = [];
      if (existingApps.length > 0) parts.push(`Known apps today: ${existingApps.join(', ')}`);
      if (existingProjects.length > 0) parts.push(`Known projects this session: ${existingProjects.join(', ')}`);
      existingContext = parts.join('\n') + '\nReuse these exact names if the activity matches.\n\n';
    }

    const eventsPayload = sceneTexts
      .slice(0, 20)
      .map((t, i) => `[${i + 1}] ${t.slice(0, 200)}`)
      .join('\n');
    const transcriptPayload = transcriptParts.length > 0
      ? `\nAudio transcripts:\n${transcriptParts.slice(0, 5).map((t, i) => `[T${i + 1}] ${t.slice(0, 200)}`).join('\n')}`
      : '';

    const cfg = getConfig();
    const prompt = getPrompt('segment_classification', {
      existing_context: existingContext,
      events: eventsPayload + transcriptPayload,
    });

    const raw = await callLLM({
      system: prompt.system,
      user: prompt.user,
      tag: 'segment_classification',
      json: true,
      maxTokens: cfg.llm.max_tokens.segment_classification,
    });

    const parsed = JSON.parse(raw);
    const classified: Array<{ app: string; category: string; action: string; project: string | null }> =
      Array.isArray(parsed.segments) ? parsed.segments : [];

    if (classified.length === 0) throw new Error('LLM returned no segments');

    // Split the time window proportionally so segments don't overlap.
    // Without this, N segments from the same flush each get the full duration,
    // inflating totals by Nx.
    const totalDuration = endTime - startTime;
    const n = classified.length;

    for (let i = 0; i < n; i++) {
      const cls = classified[i];
      const segStart = startTime + Math.floor(i * totalDuration / n);
      const segEnd = i === n - 1 ? endTime : startTime + Math.floor((i + 1) * totalDuration / n);

      const seg: ActivitySegment = {
        sessionId,
        startTime: segStart,
        endTime: segEnd,
        primaryApp: cls.app || 'Unknown',
        appCategory: (cls.category || 'other') as AppCategory,
        action: cls.action || 'working',
        project: cls.project || undefined,
        context,
        transcriptSnippet,
        eventCount: Math.ceil(events.length / n),
        isIdle: idle,
      };
      const id = db.insertActivitySegment(seg);
      totalFlushed++;
      log(TAG, `Segment #${id} (LLM)`, {
        app: seg.primaryApp,
        category: seg.appCategory,
        action: seg.action,
        project: seg.project || '(none)',
        time: `${segStart}-${segEnd} (${segEnd - segStart}s)`,
      });
    }

    log(TAG, `LLM classified ${events.length} events → ${classified.length} segment(s)`);
  } catch (e) {
    error(TAG, 'LLM classification failed, creating fallback segment', e);
    const fallbackApp = extractFirstPhrase(sceneTexts[0] || '');
    const seg: ActivitySegment = {
      sessionId,
      startTime,
      endTime,
      primaryApp: fallbackApp || 'Unknown',
      appCategory: 'other',
      action: 'working',
      project: undefined,
      context,
      transcriptSnippet,
      eventCount: events.length,
      isIdle: idle,
    };
    const id = db.insertActivitySegment(seg);
    totalFlushed++;
    log(TAG, `Fallback segment #${id} created after LLM failure (app: ${seg.primaryApp})`);
  }
}

function extractFirstPhrase(text: string): string {
  if (!text) return 'Unknown';
  const pipeIdx = text.indexOf('|');
  const phrase = pipeIdx > 0 ? text.slice(0, pipeIdx).trim() : text.slice(0, 30).trim();
  const cleaned = phrase.replace(/[\[\]]/g, '').trim();
  return cleaned || 'Unknown';
}

export function getBufferSize(): number {
  return buffer.length;
}
