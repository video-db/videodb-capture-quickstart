import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// ── Types ──

export interface FocusdConfig {
  app: {
    name: string;
    short_name: string;
    author: string;
  };
  llm: {
    model: string;
    max_tokens: {
      segment_classification: number;
      micro_summary: number;
      session_summary: number;
      daily_summary: number;
      deep_dive: number;
    };
  };
  pipeline: {
    segment_flush_mins: number;
    micro_summary_mins: number;
    session_summary_mins: number;
    idle_threshold_mins: number;
  };
  indexing: {
    model_name?: string;
    visual: { batch_type: string; batch_value: number; frame_count: number };
    audio: { batch_type: string; batch_value: number };
  };
  prompts: {
    visual_indexing: string;
    audio_indexing: string;
    segment_classification: { system: string; user: string };
    micro_summary: { system: string; user: string };
    session_summary: { system: string; user: string };
    daily_summary: { system: string; user: string };
    deep_dive: { system: string; user: string };
  };
}

// ── Singleton ──

let _config: FocusdConfig | null = null;

export function loadConfig(): FocusdConfig {
  const configPath = resolveConfigPath();
  console.log(`[CONFIG] Loading config from: ${configPath}`);
  const raw = fs.readFileSync(configPath, 'utf8');

  _config = parseYaml(raw) as FocusdConfig;
  console.log(`[CONFIG] Parsed successfully:`, {
    app: _config.app?.name,
    model: _config.llm?.model,
    pipeline: _config.pipeline,
    promptKeys: Object.keys(_config.prompts || {}),
  });
  return _config;
}

export function getConfig(): FocusdConfig {
  if (!_config) return loadConfig();
  return _config;
}

// ── Template Engine ──
// Replaces {{var}} placeholders in a prompt string.

export function render(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// Convenience: get a rendered prompt pair (system + user) for a given key.
export function getPrompt(
  key: 'segment_classification' | 'micro_summary' | 'session_summary' | 'daily_summary' | 'deep_dive',
  vars: Record<string, string | number>,
): { system: string; user: string } {
  const cfg = getConfig();
  const raw = cfg.prompts[key];
  return {
    system: render(raw.system, { app_name: cfg.app.name, ...vars }),
    user: render(raw.user, { app_name: cfg.app.name, ...vars }),
  };
}

export function getIndexingPrompt(
  key: 'visual_indexing' | 'audio_indexing',
): string {
  return getConfig().prompts[key].trim();
}

// ── Path Resolution ──

function resolveConfigPath(): string {
  // Production: config.yaml is in extraResources
  const prodPath = path.join(process.resourcesPath || '', 'config.yaml');
  if (fs.existsSync(prodPath)) return prodPath;

  // Dev: project root
  const devPath = path.join(__dirname, '../../../config.yaml');
  if (fs.existsSync(devPath)) return devPath;

  // Fallback: cwd
  const cwdPath = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(cwdPath)) return cwdPath;

  throw new Error(
    'config.yaml not found. Searched:\n' +
      `  ${prodPath}\n  ${devPath}\n  ${cwdPath}`,
  );
}

// ── Minimal YAML Parser ──
// Handles the subset we use: nested objects, scalars, multiline literal blocks (|).
// No dependency on js-yaml.

function parseYaml(raw: string): Record<string, unknown> {
  const lines = raw.split('\n');
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: -1, obj: root },
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }

    const indent = line.search(/\S/);
    const content = line.trimStart();

    // Pop stack to correct parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    // Key: value or Key:
    const kvMatch = content.match(/^([\w.]+)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    let value = kvMatch[2].trim();

    if (value === '' || value === '|') {
      // Check if next non-empty line is indented further → nested object or block
      const nextIdx = findNextContentLine(lines, i + 1);
      if (nextIdx === -1) {
        parent[key] = '';
        i++;
        continue;
      }
      const nextIndent = lines[nextIdx].search(/\S/);

      if (value === '|') {
        // Multiline literal block
        const blockLines: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const bl = lines[j];
          if (/^\s*$/.test(bl)) {
            blockLines.push('');
            j++;
            continue;
          }
          const bi = bl.search(/\S/);
          if (bi <= indent) break;
          blockLines.push(bl.slice(nextIndent));
          j++;
        }
        parent[key] = blockLines.join('\n').trimEnd() + '\n';
        i = j;
        continue;
      }

      // Nested object
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
      i++;
      continue;
    }

    // Inline value
    parent[key] = parseScalar(value);
    i++;
  }

  return root;
}

function parseScalar(value: string): string | number | boolean {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  // Strip inline comments
  const commentIdx = value.indexOf(' #');
  if (commentIdx > 0) return parseScalar(value.slice(0, commentIdx).trim());
  return value;
}

function findNextContentLine(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (!/^\s*$/.test(lines[i]) && !/^\s*#/.test(lines[i])) return i;
  }
  return -1;
}
