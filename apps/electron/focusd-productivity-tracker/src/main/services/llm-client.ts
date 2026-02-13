import OpenAI from 'openai';
import { getConfig } from './config';
import { log, warn, error } from './logger';

const TAG = 'LLM';

let client: OpenAI | null = null;

export function initLLMClient(apiKey: string, baseUrl: string): void {
  log(TAG, `Initializing (baseURL: ${baseUrl}, key: ${apiKey.slice(0, 8)}...)`);
  client = new OpenAI({ apiKey, baseURL: baseUrl });
  log(TAG, 'Client ready');
}

export function isLLMReady(): boolean {
  return client !== null;
}

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return s.trim();
}

export async function callLLM(opts: {
  system: string;
  user: string;
  tag: string;
  json?: boolean;
  maxTokens?: number;
}): Promise<string> {
  if (!client) throw new Error('LLM client not initialized');

  const cfg = getConfig();
  const maxTokens = opts.maxTokens || 400;

  log(TAG, `Request: ${opts.tag}`, {
    model: cfg.llm.model,
    maxTokens,
    systemLen: opts.system.length,
    userLen: opts.user.length,
  });

  const response = await client.chat.completions.create({
    model: cfg.llm.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    max_tokens: maxTokens,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const raw = response.choices[0].message.content || '';
  log(TAG, `Response: ${opts.tag}`, {
    usage: response.usage,
    contentLen: raw.length,
    preview: raw.slice(0, 150),
  });

  return opts.json ? stripCodeFences(raw) : raw;
}

export function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
