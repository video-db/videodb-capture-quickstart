import { useState, useEffect, useCallback } from 'react';
import type {
  DashboardData,
  RecordingState,
  Settings,
  MicroSummary,
  TimeFormat,
} from '../../../shared/types';

export function useAPI() {
  return window.api;
}

export function useRecordingState() {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const api = useAPI();

  useEffect(() => {
    api.capture.status().then((s) => {
      setState(s.recording ? 'recording' : 'idle');
    });
    const unsub = api.onRecordingStateChange(setState);
    return unsub;
  }, [api]);

  const startRecording = useCallback(async (screenId?: string) => {
    setState('starting');
    setError(null);
    try {
      await api.capture.start(screenId);
    } catch (e: any) {
      setState('idle');
      const msg = e?.message || String(e);
      if (/credit.*low|payment\s*required/i.test(msg)) {
        setError('VideoDB credit balance is low. Please add credits at videodb.io to continue.');
      } else if (/api.*key|unauthorized|401/i.test(msg)) {
        setError('Invalid API key. Please check your key in Settings.');
      } else if (/permission|screen.*recording/i.test(msg)) {
        setError('Screen recording permission is required. Please enable it in System Settings.');
      } else {
        setError(msg.length > 200 ? msg.slice(0, 200) + '...' : msg);
      }
    }
  }, [api]);

  const stopRecording = useCallback(async () => {
    setState('stopping');
    try {
      await api.capture.stop();
    } catch {
      setState('recording');
    }
  }, [api]);

  const clearError = useCallback(() => setError(null), []);

  return { state, error, startRecording, stopRecording, clearError };
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const api = useAPI();

  const refresh = useCallback(async () => {
    try {
      const d = await api.dashboard.today();
      setData(d);
    } catch (e) {
      console.error('Failed to fetch dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    // Also refresh immediately when recording state changes (e.g. stops)
    const unsub = api.onRecordingStateChange((state) => {
      if (state === 'idle') {
        setTimeout(refresh, 500); // small delay for DB writes to settle
      }
    });
    return () => { clearInterval(interval); unsub(); };
  }, [refresh, api]);

  return { data, loading, refresh };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const api = useAPI();

  useEffect(() => {
    api.settings.get().then(setSettings);
  }, [api]);

  const update = useCallback(
    async (partial: Partial<Settings>) => {
      await api.settings.update(partial);
      const updated = await api.settings.get();
      setSettings(updated);
    },
    [api],
  );

  const timeFormat: TimeFormat = settings?.timeFormat || '12h';

  return { settings, update, timeFormat };
}

export function useNewSummaries() {
  const [latest, setLatest] = useState<MicroSummary | null>(null);
  const api = useAPI();

  useEffect(() => {
    const unsub = api.onNewSummary(setLatest);
    return unsub;
  }, [api]);

  return latest;
}
