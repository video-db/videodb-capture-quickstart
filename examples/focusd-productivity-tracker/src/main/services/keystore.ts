import { safeStorage } from 'electron';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { log, warn, error } from './logger';

const TAG = 'KEYSTORE';
const KEY_FILE = 'api-key.enc';

function keyFilePath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

export function hasApiKey(): boolean {
  return fs.existsSync(keyFilePath());
}

export function storeApiKey(apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    warn(TAG, 'Encryption not available, storing key in plaintext');
    fs.writeFileSync(keyFilePath(), apiKey, 'utf8');
    return;
  }
  const encrypted = safeStorage.encryptString(apiKey);
  fs.writeFileSync(keyFilePath(), encrypted);
  log(TAG, 'API key stored securely');
}

export function loadApiKey(): string | null {
  const filePath = keyFilePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = fs.readFileSync(filePath);
    if (!safeStorage.isEncryptionAvailable()) {
      return data.toString('utf8');
    }
    const decrypted = safeStorage.decryptString(data);
    log(TAG, `API key loaded (${decrypted.slice(0, 8)}...)`);
    return decrypted;
  } catch (e) {
    error(TAG, 'Failed to decrypt API key', e);
    return null;
  }
}

export function clearApiKey(): void {
  const filePath = keyFilePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    log(TAG, 'API key cleared');
  }
}

const ONBOARDING_FLAG = 'onboarding-complete';

function onboardingFlagPath(): string {
  return path.join(app.getPath('userData'), ONBOARDING_FLAG);
}

export function isOnboardingComplete(): boolean {
  return fs.existsSync(onboardingFlagPath());
}

export function markOnboardingComplete(): void {
  fs.writeFileSync(onboardingFlagPath(), '1', 'utf8');
  log(TAG, 'Onboarding marked complete');
}

export function resetOnboarding(): void {
  const fp = onboardingFlagPath();
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  log(TAG, 'Onboarding reset');
}
