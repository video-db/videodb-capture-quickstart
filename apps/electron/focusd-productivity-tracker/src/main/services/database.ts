import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import type {
  RawEvent,
  ActivitySegment,
  MicroSummary,
  SessionSummary,
  DailySummary,
  CaptureSessionRecord,
  IdlePeriod,
  Settings,
  AppUsageStat,
  ProjectStat,
  DeepDiveResult,
} from '../../shared/types';
import { getConfig } from './config';

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'focusd.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  seedDefaults();
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capture_sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      video_id TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS raw_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      channel TEXT NOT NULL,
      app_name TEXT,
      app_category TEXT,
      summary_text TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_raw_ts ON raw_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_raw_session ON raw_events(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS activity_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      primary_app TEXT,
      app_category TEXT,
      action TEXT,
      project TEXT,
      context TEXT,
      transcript_snippet TEXT,
      event_count INTEGER DEFAULT 0,
      is_idle INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_l1_time ON activity_segments(start_time, end_time);

    CREATE TABLE IF NOT EXISTS micro_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      summary TEXT NOT NULL,
      app_breakdown TEXT NOT NULL DEFAULT '{}',
      primary_activity TEXT,
      productivity_label TEXT NOT NULL DEFAULT 'neutral',
      project TEXT,
      segment_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_l2_time ON micro_summaries(start_time, end_time);

    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      summary TEXT NOT NULL,
      key_activities TEXT NOT NULL DEFAULT '[]',
      projects TEXT NOT NULL DEFAULT '{}',
      app_stats TEXT NOT NULL DEFAULT '{}',
      productivity_label TEXT NOT NULL DEFAULT 'neutral'
    );
    CREATE INDEX IF NOT EXISTS idx_l3_date ON session_summaries(date);

    CREATE TABLE IF NOT EXISTS daily_summaries (
      date TEXT PRIMARY KEY,
      headline TEXT,
      summary TEXT NOT NULL,
      highlights TEXT NOT NULL DEFAULT '[]',
      improvements TEXT NOT NULL DEFAULT '[]',
      drill_down_sections TEXT NOT NULL DEFAULT '[]',
      total_tracked_secs INTEGER DEFAULT 0,
      total_idle_secs INTEGER DEFAULT 0,
      total_productive_secs INTEGER DEFAULT 0,
      total_distracted_secs INTEGER DEFAULT 0,
      top_apps TEXT NOT NULL DEFAULT '{}',
      top_projects TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS deep_dive_cache (
      time_range_key TEXT PRIMARY KEY,
      analysis TEXT NOT NULL,
      video_timestamp_start REAL,
      video_timestamp_end REAL,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idle_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_secs INTEGER NOT NULL
    );
  `);

  // Schema migrations for existing databases
  migrateSchema();
}

function migrateSchema(): void {
  // Add project column to micro_summaries if missing (added for LLM-based project naming)
  const cols = db.prepare("PRAGMA table_info(micro_summaries)").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'project')) {
    db.exec('ALTER TABLE micro_summaries ADD COLUMN project TEXT');
  }
}

function seedDefaults(): void {
  const cfg = getConfig();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );
  const seed = db.transaction(() => {
    insert.run('timeFormat', '12h');
    insert.run('segmentFlushMins', String(cfg.pipeline.segment_flush_mins));
    insert.run('idleThresholdMins', String(cfg.pipeline.idle_threshold_mins));
    insert.run('microSummaryIntervalMins', String(cfg.pipeline.micro_summary_mins));
    insert.run('sessionSummaryIntervalMins', String(cfg.pipeline.session_summary_mins));
    insert.run('recordMic', 'true');
    insert.run('recordScreen', 'true');
    insert.run('recordSystemAudio', 'true');
  });
  seed();
}

// ── Settings ──

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    timeFormat: (map.timeFormat as Settings['timeFormat']) || '12h',
    segmentFlushMins: parseInt(map.segmentFlushMins || '5', 10),
    idleThresholdMins: parseInt(map.idleThresholdMins || '5', 10),
    microSummaryIntervalMins: parseInt(
      map.microSummaryIntervalMins || '15',
      10,
    ),
    sessionSummaryIntervalMins: parseInt(
      map.sessionSummaryIntervalMins || '120',
      10,
    ),
    recordMic: map.recordMic !== 'false',
    recordScreen: map.recordScreen !== 'false',
    recordSystemAudio: map.recordSystemAudio !== 'false',
  };
}

export function updateSettings(partial: Partial<Settings>): void {
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(partial)) {
      upsert.run(key, String(value));
    }
  });
  tx();
}

// ── Capture Sessions ──

export function insertCaptureSession(session: CaptureSessionRecord): void {
  db.prepare(
    'INSERT INTO capture_sessions (id, started_at, status) VALUES (?, ?, ?)',
  ).run(session.id, session.startedAt, session.status);
}

export function updateCaptureSession(
  id: string,
  updates: Partial<CaptureSessionRecord>,
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (updates.endedAt !== undefined) {
    sets.push('ended_at = ?');
    vals.push(updates.endedAt);
  }
  if (updates.videoId !== undefined) {
    sets.push('video_id = ?');
    vals.push(updates.videoId);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    vals.push(updates.status);
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE capture_sessions SET ${sets.join(', ')} WHERE id = ?`).run(
    ...vals,
  );
}

export function getActiveCaptureSession(): CaptureSessionRecord | null {
  const row = db
    .prepare("SELECT * FROM capture_sessions WHERE status = 'active' LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    startedAt: row.started_at as number,
    endedAt: row.ended_at as number | undefined,
    videoId: row.video_id as string | undefined,
    status: row.status as CaptureSessionRecord['status'],
  };
}

// ── L0: Raw Events ──

const insertRawStmt = () =>
  db.prepare(`
  INSERT INTO raw_events (session_id, timestamp, channel, app_name, app_category, summary_text, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let _insertRaw: Database.Statement | null = null;

export function insertRawEvent(event: RawEvent): number {
  if (!_insertRaw) _insertRaw = insertRawStmt();
  const result = _insertRaw.run(
    event.sessionId,
    event.timestamp,
    event.channel,
    event.appName || null,
    event.appCategory || null,
    event.summaryText || null,
    event.rawJson,
  );
  return Number(result.lastInsertRowid);
}

export function getRawEvents(start: number, end: number): RawEvent[] {
  return (
    db
      .prepare(
        'SELECT * FROM raw_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp',
      )
      .all(start, end) as Record<string, unknown>[]
  ).map(mapRawEvent);
}

export function getRawEventsBySession(
  sessionId: string,
  start?: number,
  end?: number,
): RawEvent[] {
  if (start !== undefined && end !== undefined) {
    return (
      db
        .prepare(
          'SELECT * FROM raw_events WHERE session_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp',
        )
        .all(sessionId, start, end) as Record<string, unknown>[]
    ).map(mapRawEvent);
  }
  return (
    db
      .prepare(
        'SELECT * FROM raw_events WHERE session_id = ? ORDER BY timestamp',
      )
      .all(sessionId) as Record<string, unknown>[]
  ).map(mapRawEvent);
}

function mapRawEvent(row: Record<string, unknown>): RawEvent {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    timestamp: row.timestamp as number,
    channel: row.channel as RawEvent['channel'],
    appName: row.app_name as string | undefined,
    appCategory: row.app_category as RawEvent['appCategory'],
    summaryText: row.summary_text as string | undefined,
    rawJson: row.raw_json as string,
  };
}

// ── L1: Activity Segments ──

export function insertActivitySegment(segment: ActivitySegment): number {
  const result = db
    .prepare(
      `INSERT INTO activity_segments
    (session_id, start_time, end_time, primary_app, app_category, action, project, context, transcript_snippet, event_count, is_idle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      segment.sessionId,
      segment.startTime,
      segment.endTime,
      segment.primaryApp || null,
      segment.appCategory || null,
      segment.action || null,
      segment.project || null,
      segment.context || null,
      segment.transcriptSnippet || null,
      segment.eventCount,
      segment.isIdle ? 1 : 0,
    );
  return Number(result.lastInsertRowid);
}

export function getActivitySegments(
  start: number,
  end: number,
): ActivitySegment[] {
  return (
    db
      .prepare(
        'SELECT * FROM activity_segments WHERE start_time >= ? AND end_time <= ? ORDER BY start_time',
      )
      .all(start, end) as Record<string, unknown>[]
  ).map(mapSegment);
}

export function getSegmentsForDate(date: string): ActivitySegment[] {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  return getActivitySegments(dayStart, dayEnd);
}

function mapSegment(row: Record<string, unknown>): ActivitySegment {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number,
    primaryApp: row.primary_app as string | undefined,
    appCategory: row.app_category as ActivitySegment['appCategory'],
    action: row.action as string | undefined,
    project: row.project as string | undefined,
    context: row.context as string | undefined,
    transcriptSnippet: row.transcript_snippet as string | undefined,
    eventCount: row.event_count as number,
    isIdle: Boolean(row.is_idle),
  };
}

// ── L2: Micro Summaries ──

export function insertMicroSummary(ms: MicroSummary): number {
  const result = db
    .prepare(
      `INSERT INTO micro_summaries
    (session_id, start_time, end_time, summary, app_breakdown, primary_activity, productivity_label, project, segment_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ms.sessionId,
      ms.startTime,
      ms.endTime,
      ms.summary,
      JSON.stringify(ms.appBreakdown),
      ms.primaryActivity || null,
      ms.productivityLabel,
      ms.project || null,
      JSON.stringify(ms.segmentIds),
    );
  return Number(result.lastInsertRowid);
}

export function getMicroSummaries(
  start: number,
  end: number,
): MicroSummary[] {
  return (
    db
      .prepare(
        'SELECT * FROM micro_summaries WHERE start_time >= ? AND end_time <= ? ORDER BY start_time',
      )
      .all(start, end) as Record<string, unknown>[]
  ).map(mapMicro);
}

export function getUnprocessedSegmentsForMicro(
  sessionId: string,
  afterTime: number,
): ActivitySegment[] {
  return (
    db
      .prepare(
        `SELECT * FROM activity_segments
     WHERE session_id = ? AND start_time >= ?
     AND id NOT IN (
       SELECT value FROM micro_summaries, json_each(micro_summaries.segment_ids)
       WHERE micro_summaries.session_id = ?
     )
     ORDER BY start_time`,
      )
      .all(sessionId, afterTime, sessionId) as Record<string, unknown>[]
  ).map(mapSegment);
}

function mapMicro(row: Record<string, unknown>): MicroSummary {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number,
    summary: row.summary as string,
    appBreakdown: JSON.parse(row.app_breakdown as string),
    primaryActivity: row.primary_activity as string | undefined,
    productivityLabel: row.productivity_label as MicroSummary['productivityLabel'],
    project: (row.project as string) || undefined,
    segmentIds: JSON.parse(row.segment_ids as string),
  };
}

// ── L3: Session Summaries ──

export function insertSessionSummary(ss: SessionSummary): number {
  const result = db
    .prepare(
      `INSERT INTO session_summaries
    (session_id, date, start_time, end_time, summary, key_activities, projects, app_stats, productivity_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ss.sessionId,
      ss.date,
      ss.startTime,
      ss.endTime,
      ss.summary,
      JSON.stringify(ss.keyActivities),
      JSON.stringify(ss.projects),
      JSON.stringify(ss.appStats),
      ss.productivityLabel,
    );
  return Number(result.lastInsertRowid);
}

export function getSessionSummaries(date: string): SessionSummary[] {
  return (
    db
      .prepare(
        'SELECT * FROM session_summaries WHERE date = ? ORDER BY start_time',
      )
      .all(date) as Record<string, unknown>[]
  ).map(mapSession);
}

function mapSession(row: Record<string, unknown>): SessionSummary {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    date: row.date as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number,
    summary: row.summary as string,
    keyActivities: JSON.parse(row.key_activities as string),
    projects: JSON.parse(row.projects as string),
    appStats: JSON.parse(row.app_stats as string),
    productivityLabel: row.productivity_label as SessionSummary['productivityLabel'],
  };
}

// ── L4: Daily Summaries ──

export function upsertDailySummary(ds: DailySummary): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_summaries
    (date, headline, summary, highlights, improvements, drill_down_sections,
     total_tracked_secs, total_idle_secs, total_productive_secs, total_distracted_secs,
     top_apps, top_projects)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ds.date,
    ds.headline,
    ds.summary,
    JSON.stringify(ds.highlights),
    JSON.stringify(ds.improvements),
    JSON.stringify(ds.drillDownSections),
    ds.totalTrackedSecs,
    ds.totalIdleSecs,
    ds.totalProductiveSecs,
    ds.totalDistractedSecs,
    JSON.stringify(ds.topApps),
    JSON.stringify(ds.topProjects),
  );
}

export function getDailySummary(date: string): DailySummary | null {
  const row = db
    .prepare('SELECT * FROM daily_summaries WHERE date = ?')
    .get(date) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    date: row.date as string,
    headline: row.headline as string,
    summary: row.summary as string,
    highlights: JSON.parse(row.highlights as string),
    improvements: JSON.parse(row.improvements as string),
    drillDownSections: JSON.parse(row.drill_down_sections as string),
    totalTrackedSecs: row.total_tracked_secs as number,
    totalIdleSecs: row.total_idle_secs as number,
    totalProductiveSecs: row.total_productive_secs as number,
    totalDistractedSecs: row.total_distracted_secs as number,
    topApps: JSON.parse(row.top_apps as string),
    topProjects: JSON.parse(row.top_projects as string),
  };
}

// ── Deep Dive Cache ──

export function getCachedDeepDive(key: string): DeepDiveResult | null {
  const row = db
    .prepare('SELECT * FROM deep_dive_cache WHERE time_range_key = ?')
    .get(key) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    analysis: row.analysis as string,
    videoTimestampStart: row.video_timestamp_start as number | undefined,
    videoTimestampEnd: row.video_timestamp_end as number | undefined,
  };
}

export function cacheDeepDive(key: string, result: DeepDiveResult): void {
  db.prepare(
    `INSERT OR REPLACE INTO deep_dive_cache (time_range_key, analysis, video_timestamp_start, video_timestamp_end, generated_at)
    VALUES (?, ?, ?, ?, ?)`,
  ).run(
    key,
    result.analysis,
    result.videoTimestampStart || null,
    result.videoTimestampEnd || null,
    Math.floor(Date.now() / 1000),
  );
}

// ── Idle Periods ──

export function insertIdlePeriod(idle: IdlePeriod): void {
  db.prepare(
    'INSERT INTO idle_periods (session_id, start_time, end_time, duration_secs) VALUES (?, ?, ?, ?)',
  ).run(idle.sessionId || null, idle.startTime, idle.endTime, idle.durationSecs);
}

export function getIdleSecsForDate(date: string): number {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(duration_secs), 0) as total FROM idle_periods WHERE start_time >= ? AND end_time <= ?',
    )
    .get(dayStart, dayEnd) as { total: number };
  return row.total;
}

// ── Dashboard Aggregation Queries ──

export function getAppUsageForDate(date: string): AppUsageStat[] {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  return (
    db
      .prepare(
        `SELECT primary_app as app, app_category as category,
      SUM(end_time - start_time) as seconds
     FROM activity_segments
     WHERE start_time >= ? AND end_time <= ? AND is_idle = 0 AND primary_app IS NOT NULL
     GROUP BY LOWER(primary_app)
     HAVING seconds > 0
     ORDER BY seconds DESC`,
      )
      .all(dayStart, dayEnd) as { app: string; category: string; seconds: number }[]
  ).map((r) => ({
    app: r.app,
    category: (r.category || 'other') as AppUsageStat['category'],
    seconds: r.seconds,
  }));
}

export function getProjectsForDate(date: string): ProjectStat[] {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  return db
    .prepare(
      `SELECT project, SUM(end_time - start_time) as seconds
     FROM activity_segments
     WHERE start_time >= ? AND end_time <= ? AND project IS NOT NULL AND project != '' AND is_idle = 0
     GROUP BY LOWER(project)
     HAVING seconds > 0
     ORDER BY seconds DESC`,
    )
    .all(dayStart, dayEnd) as ProjectStat[];
}

export function getDistinctAppsForDate(date: string): string[] {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  const rows = db
    .prepare(
      `SELECT DISTINCT primary_app FROM activity_segments
       WHERE start_time >= ? AND end_time <= ? AND primary_app IS NOT NULL AND primary_app != ''
       ORDER BY start_time DESC`,
    )
    .all(dayStart, dayEnd) as { primary_app: string }[];
  return rows.map((r) => r.primary_app);
}

export function getDistinctProjectsForSession(sessionId: string): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT project FROM activity_segments
       WHERE session_id = ? AND project IS NOT NULL AND project != ''
       ORDER BY start_time DESC`,
    )
    .all(sessionId) as { project: string }[];
  return rows.map((r) => r.project);
}

export function updateSegmentProjects(segmentIds: number[], project: string): void {
  if (segmentIds.length === 0) return;
  const placeholders = segmentIds.map(() => '?').join(',');
  db.prepare(
    `UPDATE activity_segments SET project = ? WHERE id IN (${placeholders})`,
  ).run(project, ...segmentIds);
}

export function getTotalTrackedForDate(date: string): number {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  const now = Math.floor(Date.now() / 1000);

  // "Tracked" = total recording session duration today, not just segments with events.
  // For active sessions, use current time as the end.
  const rows = db
    .prepare(
      `SELECT started_at, ended_at, status FROM capture_sessions
       WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?)`,
    )
    .all(dayEnd, dayStart) as { started_at: number; ended_at: number | null; status: string }[];

  let total = 0;
  for (const row of rows) {
    const start = Math.max(row.started_at, dayStart);
    const end = Math.min(row.ended_at ?? (row.status === 'active' ? now : row.started_at), dayEnd);
    if (end > start) total += end - start;
  }
  return total;
}

export function getProductiveSecsForDate(date: string): {
  productive: number;
  distracted: number;
} {
  const dayStart = dateToEpoch(date);
  const dayEnd = dayStart + 86400;
  // Derive productivity from activity_segments (same source as tracked time)
  // using micro_summaries only as a label lookup via the segment's midpoint.
  const rows = db
    .prepare(
      `SELECT
        COALESCE(
          (SELECT m.productivity_label FROM micro_summaries m
           WHERE m.start_time <= (s.start_time + s.end_time) / 2
             AND m.end_time >= (s.start_time + s.end_time) / 2
           LIMIT 1),
          'neutral'
        ) as label,
        SUM(s.end_time - s.start_time) as seconds
      FROM activity_segments s
      WHERE s.start_time >= ? AND s.end_time <= ? AND s.is_idle = 0
      GROUP BY label`,
    )
    .all(dayStart, dayEnd) as { label: string; seconds: number }[];

  let productive = 0;
  let distracted = 0;
  for (const r of rows) {
    if (r.label === 'productive') productive = r.seconds;
    if (r.label === 'distracted') distracted = r.seconds;
  }
  return { productive, distracted };
}

export function getLatestMicroSummary(sessionId: string): MicroSummary | null {
  const row = db
    .prepare(
      'SELECT * FROM micro_summaries WHERE session_id = ? ORDER BY end_time DESC LIMIT 1',
    )
    .get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapMicro(row);
}

// ── Helpers ──

function dateToEpoch(date: string): number {
  return Math.floor(new Date(date + 'T00:00:00').getTime() / 1000);
}

export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDb(): Database.Database {
  return db;
}
