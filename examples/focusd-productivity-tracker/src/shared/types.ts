export type AppCategory =
  | 'development'
  | 'communication'
  | 'browsing'
  | 'documents'
  | 'design'
  | 'email'
  | 'entertainment'
  | 'other';

export type ProductivityLabel = 'productive' | 'neutral' | 'distracted';
export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping';
export type TimeFormat = '12h' | '24h';

// L0: Raw WebSocket events stored verbatim
export interface RawEvent {
  id?: number;
  sessionId: string;
  timestamp: number;
  channel: 'scene_index' | 'visual_index' | 'transcript' | 'spoken_index' | 'alert';
  appName?: string;
  appCategory?: AppCategory;
  summaryText?: string;
  rawJson: string;
}

// L1: 5-minute activity blocks (no LLM, pure logic)
export interface ActivitySegment {
  id?: number;
  sessionId: string;
  startTime: number;
  endTime: number;
  primaryApp?: string;
  appCategory?: AppCategory;
  action?: string;
  project?: string;
  context?: string;
  transcriptSnippet?: string;
  eventCount: number;
  isIdle: boolean;
}

// L2: 15-minute summaries (LLM generated)
export interface MicroSummary {
  id?: number;
  sessionId: string;
  startTime: number;
  endTime: number;
  summary: string;
  appBreakdown: Record<string, number>;
  primaryActivity?: string;
  productivityLabel: ProductivityLabel;
  project?: string;
  segmentIds: number[];
}

// L3: 2-3 hour session summaries (LLM generated)
export interface SessionSummary {
  id?: number;
  sessionId: string;
  date: string;
  startTime: number;
  endTime: number;
  summary: string;
  keyActivities: string[];
  projects: Record<string, number>;
  appStats: Record<string, number>;
  productivityLabel: ProductivityLabel;
}

// L4: End-of-day summary (LLM generated)
export interface DailySummary {
  date: string;
  headline: string;
  summary: string;
  highlights: string[];
  improvements: string[];
  drillDownSections: DrillDownSection[];
  totalTrackedSecs: number;
  totalIdleSecs: number;
  totalProductiveSecs: number;
  totalDistractedSecs: number;
  topApps: Record<string, number>;
  topProjects: Record<string, number>;
}

export interface DrillDownSection {
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
}

export interface DeepDiveResult {
  analysis: string;
  videoTimestampStart?: number;
  videoTimestampEnd?: number;
}

export interface CaptureSessionRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  videoId?: string;
  status: 'active' | 'stopped' | 'exported';
}

export interface IdlePeriod {
  id?: number;
  sessionId?: string;
  startTime: number;
  endTime: number;
  durationSecs: number;
}

export interface Settings {
  timeFormat: TimeFormat;
  segmentFlushMins: number;
  idleThresholdMins: number;
  microSummaryIntervalMins: number;
  sessionSummaryIntervalMins: number;
  recordMic: boolean;
  recordScreen: boolean;
  recordSystemAudio: boolean;
}

export interface DashboardData {
  date: string;
  totalTrackedSecs: number;
  totalIdleSecs: number;
  totalProductiveSecs: number;
  totalDistractedSecs: number;
  isRecording: boolean;
  currentSessionId?: string;
  latestSummary?: string;
  segments: ActivitySegment[];
  appUsage: AppUsageStat[];
  topProjects: ProjectStat[];
}

export interface AppUsageStat {
  app: string;
  category: AppCategory;
  seconds: number;
}

export interface ProjectStat {
  project: string;
  seconds: number;
}

// Category color mapping for UI
export const APP_CATEGORY_COLORS: Record<AppCategory, string> = {
  development: '#7BA6C2',
  communication: '#9E88B8',
  browsing: '#6CAAA4',
  documents: '#D8A86A',
  design: '#CC8BA5',
  email: '#8E93C7',
  entertainment: '#CC7878',
  other: '#9E9890',
};

export const PRODUCTIVITY_COLORS: Record<ProductivityLabel, string> = {
  productive: '#7AB88F',
  neutral: '#D8A86A',
  distracted: '#CC7878',
};

export interface AppInfo {
  name: string;
  shortName: string;
  author: string;
  model: string;
}

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface PermissionsState {
  screen: PermissionStatus;
  microphone: PermissionStatus;
}

export interface OnboardingState {
  hasApiKey: boolean;
  needsOnboarding: boolean;
}

export interface ApiKeyInfo {
  preview: string; // e.g. "sk-dev-abc1..."
  source: 'keystore' | 'env' | 'none';
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
  display_id: string;
}

// IPC API surface exposed to renderer
export interface FocusdAPI {
  app: {
    info: () => Promise<AppInfo>;
  };
  onboarding: {
    state: () => Promise<OnboardingState>;
    validateKey: (apiKey: string) => Promise<{ valid: boolean; error?: string }>;
    saveKey: (apiKey: string) => Promise<void>;
    clearKey: () => Promise<void>;
    complete: () => Promise<void>;
    getPermissions: () => Promise<PermissionsState>;
    requestMicPermission: () => Promise<boolean>;
    openScreenPermissions: () => Promise<void>;
    openMicPermissions: () => Promise<void>;
    getKeyInfo: () => Promise<ApiKeyInfo>;
  };
  capture: {
    start: (screenId?: string) => Promise<{ sessionId: string }>;
    stop: () => Promise<void>;
    status: () => Promise<{
      recording: boolean;
      sessionId?: string;
      startedAt?: number;
    }>;
    listScreens: () => Promise<ScreenSource[]>;
  };
  summary: {
    generateNow: () => Promise<string>;
    daily: (date: string) => Promise<DailySummary | null>;
    sessionList: (date: string) => Promise<SessionSummary[]>;
    microList: (start: number, end: number) => Promise<MicroSummary[]>;
    segments: (start: number, end: number) => Promise<ActivitySegment[]>;
    deepDive: (start: number, end: number) => Promise<DeepDiveResult>;
  };
  dashboard: {
    today: () => Promise<DashboardData>;
    appUsage: (date: string) => Promise<AppUsageStat[]>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (s: Partial<Settings>) => Promise<void>;
  };
  onRecordingStateChange: (cb: (state: RecordingState) => void) => () => void;
  onNewSummary: (cb: (summary: MicroSummary) => void) => () => void;
}
