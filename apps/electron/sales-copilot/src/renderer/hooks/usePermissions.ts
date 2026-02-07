import { useState, useEffect, useCallback } from 'react';
import { electronAPI } from '../api/ipc';
import type { PermissionStatus } from '../../shared/types/ipc.types';

export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus>({
    microphone: false,
    screen: false,
    accessibility: false,
  });
  const [loading, setLoading] = useState(true);

  const checkPermissions = useCallback(async () => {
    if (!electronAPI) {
      setLoading(false);
      return;
    }

    try {
      const permStatus = await electronAPI.permissions.getStatus();
      setStatus(permStatus);
    } catch (error) {
      console.error('Failed to check permissions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const requestMicPermission = useCallback(async () => {
    if (!electronAPI) return false;

    const granted = await electronAPI.permissions.requestMicPermission();
    if (granted) {
      setStatus((prev) => ({ ...prev, microphone: true }));
    }
    return granted;
  }, []);

  const requestScreenPermission = useCallback(async () => {
    if (!electronAPI) return false;

    const granted = await electronAPI.permissions.requestScreenPermission();
    await checkPermissions(); // Re-check since user needs to grant manually
    return granted;
  }, [checkPermissions]);

  const openSettings = useCallback(async (pane: string) => {
    if (!electronAPI) return;
    await electronAPI.permissions.openSystemSettings(pane);
  }, []);

  const allGranted = status.microphone && status.screen;

  return {
    status,
    loading,
    allGranted,
    checkPermissions,
    requestMicPermission,
    requestScreenPermission,
    openSettings,
  };
}
