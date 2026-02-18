/// <reference types="vite/client" />

import type { FocusdAPI } from '../../shared/types';

declare global {
  interface Window {
    api: FocusdAPI;
  }
}
