import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import TodayView from './components/TodayView';
import ReportsView from './components/ReportsView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import Onboarding from './components/Onboarding';
import { useSettings } from './hooks/useIPC';

export type View = 'today' | 'reports' | 'recap' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('today');
  const { settings, update: updateSettings, timeFormat } = useSettings();
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    window.api.onboarding.state().then((s) => {
      setOnboarding(s.needsOnboarding);
    });
  }, []);

  if (onboarding === null) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (onboarding) {
    return <Onboarding onComplete={() => setOnboarding(false)} />;
  }

  return (
    <Layout currentView={view} onViewChange={setView}>
      {view === 'today' && <TodayView timeFormat={timeFormat} />}
      {view === 'reports' && <ReportsView timeFormat={timeFormat} />}
      {view === 'recap' && <HistoryView timeFormat={timeFormat} />}
      {view === 'settings' && settings && (
        <SettingsView settings={settings} onUpdate={updateSettings} />
      )}
    </Layout>
  );
}
