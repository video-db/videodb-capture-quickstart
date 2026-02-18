import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Calendar,
  Settings,
  Circle,
  Square,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { View } from '../App';
import { useRecordingState, useAPI } from '../hooks/useIPC';
import type { AppInfo, ScreenSource } from '../../../shared/types';
import ScreenSelector from './ScreenSelector';

interface Props {
  currentView: View;
  onViewChange: (view: View) => void;
}

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'recap', label: 'Recap', icon: Calendar },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ currentView, onViewChange }: Props) {
  const { state, error: recordingError, startRecording, stopRecording, clearError } = useRecordingState();
  const api = useAPI();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [showScreenPicker, setShowScreenPicker] = useState(false);

  useEffect(() => {
    api.app.info().then(setAppInfo);
  }, [api]);

  const isRecording = state === 'recording';
  const isTransitioning = state === 'starting' || state === 'stopping';

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      setShowScreenPicker(true);
    }
  };

  const handleScreenSelected = (screen: ScreenSource) => {
    setShowScreenPicker(false);
    startRecording(screen.display_id);
  };

  const getRecordButtonContent = () => {
    switch (state) {
      case 'idle':
        return {
          icon: <Circle className="w-4 h-4 fill-current" />,
          text: 'Start Recording',
          className: 'bg-accent text-accent-foreground hover:bg-accent/90',
        };
      case 'starting':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Starting...',
          className: 'bg-accent/50 text-accent-foreground cursor-not-allowed',
        };
      case 'recording':
        return {
          icon: <Square className="w-4 h-4 fill-current" />,
          text: 'Stop Recording',
          className: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
        };
      case 'stopping':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Stopping...',
          className: 'bg-destructive/10 text-destructive cursor-not-allowed',
        };
    }
  };

  const buttonContent = getRecordButtonContent();

  return (
    <>
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full shrink-0 titlebar-no-drag">
        {/* Brand area */}
        <div className="p-6 pb-4 pt-10">
          <h1 className="text-xl tracking-tight">{appInfo?.shortName || 'Focusd'}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">by {appInfo?.author || 'VideoDB'}</p>
        </div>

        {/* Record button */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleRecordClick}
            disabled={isTransitioning}
            className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors titlebar-no-drag ${buttonContent.className}`}
          >
            {buttonContent.icon}
            <span>{buttonContent.text}</span>
          </button>

          {recordingError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 relative">
              <button
                onClick={clearError}
                className="absolute top-2 right-2 text-destructive/60 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="flex items-start gap-2 pr-4">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive leading-relaxed">{recordingError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="px-6 pb-4">
          <div className="h-px bg-sidebar-border" />
        </div>

        {/* Navigation items */}
        <nav className="px-3 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = currentView === id;
            return (
              <button
                key={id}
                onClick={() => onViewChange(id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors relative titlebar-no-drag ${
                  active
                    ? 'text-sidebar-foreground bg-sidebar-accent'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r-full" />
                )}
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-6 pt-4 space-y-4">
          {/* Recording indicator */}
          {isRecording && (
            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-destructive"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm text-destructive">Recording active</span>
              </div>
            </div>
          )}

        </div>
      </aside>

      <ScreenSelector
        open={showScreenPicker}
        onSelect={handleScreenSelected}
        onClose={() => setShowScreenPicker(false)}
      />
    </>
  );
}
