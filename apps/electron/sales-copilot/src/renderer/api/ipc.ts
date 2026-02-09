import type { IpcApi } from '../../shared/types/ipc.types';

export function getElectronAPI(): IpcApi | null {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}

export const electronAPI = getElectronAPI();
