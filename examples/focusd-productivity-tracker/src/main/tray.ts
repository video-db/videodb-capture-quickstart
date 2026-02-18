import { Tray, Menu, nativeImage } from 'electron';
import { deflateSync } from 'zlib';
import { getConfig } from './services/config';

let tray: Tray | null = null;

interface TrayActions {
  onStartRecording: () => void;
  onStopRecording: () => void;
  onOpenDashboard: () => void;
  onQuit: () => void;
}

let actions: TrayActions;
let recording = false;

export function createTray(trayActions: TrayActions): Tray {
  actions = trayActions;
  const cfg = getConfig();

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip(cfg.app.name);
  updateMenu();

  tray.on('click', () => {
    actions.onOpenDashboard();
  });

  return tray;
}

export function setRecordingState(isRecording: boolean): void {
  recording = isRecording;
  updateMenu();
  if (tray) {
    const cfg = getConfig();
    tray.setToolTip(
      isRecording ? `${cfg.app.short_name} - Recording` : cfg.app.name,
    );
  }
}

function updateMenu(): void {
  if (!tray) return;
  const cfg = getConfig();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: cfg.app.name,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: recording ? '⏹ Stop Recording' : '⏺ Start Recording',
      click: () => {
        if (recording) {
          actions.onStopRecording();
        } else {
          actions.onStartRecording();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => actions.onOpenDashboard(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => actions.onQuit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// ── Programmatic tray icon generator ──
// Creates a 32x32 (16pt @2x) monochrome template icon.
// Shape: ring with center dot (focus/lens metaphor).

function createTrayIcon(): Electron.NativeImage {
  const size = 32;
  const rgba = Buffer.alloc(size * size * 4, 0);

  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const off = (y * size + x) * 4;

      const ringOuter = 14.5;
      const ringInner = 12;
      const dotR = 3.5;

      // Anti-aliased edges
      let alpha = 0;

      // Ring
      if (dist >= ringInner && dist <= ringOuter) {
        const edgeOuter = Math.max(0, 1 - Math.abs(dist - ringOuter));
        const edgeInner = Math.max(0, 1 - Math.abs(dist - ringInner));
        alpha = Math.min(1, Math.max(edgeOuter, edgeInner, dist < ringOuter && dist > ringInner ? 1 : 0));
      }

      // Dot
      if (dist <= dotR) {
        const edgeDot = Math.min(1, dotR - dist);
        alpha = Math.max(alpha, edgeDot);
      }

      if (alpha > 0) {
        rgba[off] = 0;       // R
        rgba[off + 1] = 0;   // G
        rgba[off + 2] = 0;   // B
        rgba[off + 3] = Math.round(alpha * 255); // A
      }
    }
  }

  const pngBuf = encodePNG(size, size, rgba);
  const icon = nativeImage.createFromBuffer(pngBuf, { width: size, height: size, scaleFactor: 2.0 });
  icon.setTemplateImage(true);
  return icon;
}

// ── Minimal PNG encoder ──

function encodePNG(w: number, h: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * w * 4, (y + 1) * w * 4);
  }

  const compressed = deflateSync(raw);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Standard CRC-32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
