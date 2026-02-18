import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { useAPI } from '../hooks/useIPC';
import { formatDate, formatDuration, formatTimeRange, todayString } from '../lib/format';
import type { TimeFormat, DailySummary, SessionSummary } from '../../../shared/types';
import DrillDown from './DrillDown';

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Props {
  timeFormat: TimeFormat;
}

export default function HistoryView({ timeFormat }: Props) {
  const api = useAPI();
  const [date, setDate] = useState(() => todayString());
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDownRange, setDrillDownRange] = useState<{ start: number; end: number } | null>(null);

  const fetchData = useCallback(() => {
    return Promise.all([api.summary.daily(date), api.summary.sessionList(date)])
      .then(([d, s]) => { setDaily(d); setSessions(s); });
  }, [api, date]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));

    // Auto-refresh every 30s when viewing today so new session reports appear
    const isViewingToday = date === todayString();
    if (isViewingToday) {
      const interval = setInterval(fetchData, 30_000);
      return () => clearInterval(interval);
    }
  }, [date, fetchData]);

  const shiftDate = (days: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setDate(localDateString(d));
  };

  const isToday = date === todayString();

  const getProductivityColor = (productivity: string) => {
    switch (productivity) {
      case 'productive':
        return 'bg-[#7AB88F]/10 text-[#7AB88F] border-[#7AB88F]/20';
      case 'neutral':
        return 'bg-[#D8A86A]/10 text-[#D8A86A] border-[#D8A86A]/20';
      case 'distracted':
        return 'bg-[#CC7878]/10 text-[#CC7878] border-[#CC7878]/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl">Recap</h1>
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between bg-card rounded-xl p-4 border border-border">
          <button
            onClick={() => shiftDate(-1)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
            <span className="text-lg">{formatDate(date)}</span>
            {isToday && (
              <span className="px-2 py-0.5 bg-accent/10 text-accent-foreground rounded-full text-xs">
                Today
              </span>
            )}
          </div>

          <button
            onClick={() => shiftDate(1)}
            disabled={isToday}
            className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : !daily && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CalendarIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg mb-2">No data recorded for this date</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Select a different date or start recording to build your history.
            </p>
          </div>
        ) : (
          <>
            {/* Daily Summary Card */}
            {daily && (
              <div className="bg-card rounded-xl p-8 border border-border space-y-6">
                <h2 className="text-2xl">{daily.headline}</h2>

                <p className="text-muted-foreground leading-relaxed">{daily.summary}</p>

                {/* Stat pills */}
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-muted rounded-full text-sm">
                    <span className="text-muted-foreground">Tracked:</span>{' '}
                    <span>{formatDuration(daily.totalTrackedSecs)}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-[#7AB88F]/10 text-[#7AB88F] rounded-full text-sm border border-[#7AB88F]/20">
                    <span className="opacity-70">Productive:</span>{' '}
                    <span>{formatDuration(daily.totalProductiveSecs)}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-muted rounded-full text-sm">
                    <span className="text-muted-foreground">Idle:</span>{' '}
                    <span>{formatDuration(daily.totalIdleSecs)}</span>
                  </div>
                </div>

                {/* Highlights */}
                {daily.highlights.length > 0 && (
                  <div>
                    <h3 className="text-sm text-muted-foreground mb-3">Highlights</h3>
                    <ul className="space-y-2">
                      {daily.highlights.map((highlight, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#7AB88F] mt-2" />
                          <span className="text-sm">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {daily.improvements.length > 0 && (
                  <div>
                    <h3 className="text-sm text-muted-foreground mb-3">Improvements</h3>
                    <ul className="space-y-2">
                      {daily.improvements.map((improvement, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#D8A86A] mt-2" />
                          <span className="text-sm">{improvement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Sessions List */}
            {sessions.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg">Sessions</h2>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setDrillDownRange({ start: session.startTime, end: session.endTime })}
                    className="w-full bg-card rounded-xl p-6 border border-border hover:border-accent/50 transition-colors text-left"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {formatTimeRange(session.startTime, session.endTime, timeFormat)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${getProductivityColor(session.productivityLabel)}`}>
                          {session.productivityLabel}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">{session.summary}</p>

                    {session.keyActivities.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {session.keyActivities.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {drillDownRange && (
        <DrillDown
          start={drillDownRange.start}
          end={drillDownRange.end}
          timeFormat={timeFormat}
          onClose={() => setDrillDownRange(null)}
        />
      )}
    </div>
  );
}
