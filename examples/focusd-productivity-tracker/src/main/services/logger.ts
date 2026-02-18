import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const TAG_COLORS: Record<string, string> = {
  CAPTURE: '\x1b[36m',   // cyan
  INGEST: '\x1b[33m',    // yellow
  PARSE: '\x1b[35m',     // magenta
  SUMMARY: '\x1b[32m',   // green
  IPC: '\x1b[34m',       // blue
  IDLE: '\x1b[90m',      // gray
  CONFIG: '\x1b[33m',    // yellow
  DB: '\x1b[34m',        // blue
  KEYSTORE: '\x1b[35m',  // magenta
  MAIN: '\x1b[36m',      // cyan
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

let logStream: fs.WriteStream | null = null;
let logFilePath: string | null = null;

function initLogFile(): void {
  if (logStream) return;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    logFilePath = path.join(logDir, `focusd-${date}.log`);
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Retain only the last 7 log files
    try {
      const files = fs.readdirSync(logDir).filter(f => f.startsWith('focusd-') && f.endsWith('.log')).sort();
      while (files.length > 7) {
        const old = files.shift()!;
        fs.unlinkSync(path.join(logDir, old));
      }
    } catch { /* non-critical — cleanup is best-effort */ }
  } catch { /* logging is non-critical — app continues without file logs */ }
}

function writeToFile(level: string, tag: string, msg: string, extra?: string): void {
  initLogFile();
  if (!logStream) return;
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] [${tag}] ${msg}${extra ? ' ' + extra : ''}\n`;
  logStream.write(line);
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function fmt(tag: string, level: string, msg: string, data?: unknown): string {
  const color = TAG_COLORS[tag] || '';
  const prefix = `${DIM}${ts()}${RESET} ${color}[${tag}]${RESET}`;
  const extra = data !== undefined ? ` ${JSON.stringify(data, null, 0)}` : '';
  return `${prefix} ${level === 'ERROR' ? RED : level === 'WARN' ? YELLOW : ''}${msg}${RESET}${extra}`;
}

export function log(tag: string, msg: string, data?: unknown): void {
  console.log(fmt(tag, 'INFO', msg, data));
  writeToFile('INFO', tag, msg, data !== undefined ? JSON.stringify(data) : undefined);
}

export function warn(tag: string, msg: string, data?: unknown): void {
  console.warn(fmt(tag, 'WARN', msg, data));
  writeToFile('WARN', tag, msg, data !== undefined ? JSON.stringify(data) : undefined);
}

export function error(tag: string, msg: string, err?: unknown): void {
  const errMsg = err instanceof Error ? err.message : err !== undefined ? String(err) : '';
  console.error(fmt(tag, 'ERROR', `${msg}${errMsg ? ': ' + errMsg : ''}`));
  if (err instanceof Error && err.stack) {
    console.error(`${DIM}${err.stack.split('\n').slice(1, 4).join('\n')}${RESET}`);
  }
  const stackStr = err instanceof Error && err.stack ? '\n' + err.stack.split('\n').slice(1, 6).join('\n') : '';
  writeToFile('ERROR', tag, `${msg}${errMsg ? ': ' + errMsg : ''}`, stackStr || undefined);
}

export function getLogPath(): string | null {
  initLogFile();
  return logFilePath;
}

export function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

// Intercept console.error to capture SDK/binary logs in the file
const _origConsoleError = console.error;
console.error = (...args: any[]) => {
  _origConsoleError(...args);
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  // Strip ANSI codes for the log file
  const clean = msg.replace(/\x1b\[[0-9;]*m/g, '');
  writeToFile('ERROR', 'STDERR', clean);
};

const _origConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  _origConsoleWarn(...args);
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const clean = msg.replace(/\x1b\[[0-9;]*m/g, '');
  writeToFile('WARN', 'STDERR', clean);
};
