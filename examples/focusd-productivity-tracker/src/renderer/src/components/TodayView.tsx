import { useState } from 'react';
import { Clock, Zap, AlertTriangle, Coffee, Sparkles, ChevronRight, Monitor, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useDashboard, useAPI } from '../hooks/useIPC';
import { formatDuration, formatDate, percentOf, categoryColors } from '../lib/format';
import type { TimeFormat } from '../../../shared/types';
import Timeline from './Timeline';
import AppUsageChart from './AppUsageChart';
import DrillDown from './DrillDown';

interface Props {
  timeFormat: TimeFormat;
}

export default function TodayView({ timeFormat }: Props) {
  const { data, loading, refresh } = useDashboard();
  const api = useAPI();
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [onDemandSummary, setOnDemandSummary] = useState<string | null>(null);
  const [drillDownRange, setDrillDownRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const summary = await api.summary.generateNow();
      setOnDemandSummary(summary);
      refresh();
    } finally {
      setGeneratingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-muted-foreground text-sm">Loading your day...</span>
        </div>
      </div>
    );
  }

  if (!data) return <EmptyState />;

  const activeSecs = data.totalTrackedSecs - data.totalIdleSecs;
  const prodPercent = percentOf(data.totalProductiveSecs, activeSecs);
  const distractedPercent = percentOf(data.totalDistractedSecs, activeSecs);
  const neutralPercent = Math.max(0, 100 - prodPercent - distractedPercent);

  const stats = [
    {
      icon: Clock,
      label: 'Tracked',
      value: formatDuration(data.totalTrackedSecs),
      percentage: null,
      color: 'text-foreground',
    },
    {
      icon: Zap,
      label: 'Productive',
      value: formatDuration(data.totalProductiveSecs),
      percentage: prodPercent,
      color: 'text-[#7AB88F]',
    },
    {
      icon: AlertTriangle,
      label: 'Distracted',
      value: formatDuration(data.totalDistractedSecs),
      percentage: distractedPercent,
      color: 'text-[#CC7878]',
    },
    {
      icon: Coffee,
      label: 'Idle',
      value: formatDuration(data.totalIdleSecs),
      percentage: data.totalTrackedSecs > 0 ? percentOf(data.totalIdleSecs, data.totalTrackedSecs) : 0,
      color: 'text-[#B3ADA5]',
    },
  ];

  const summaryText = onDemandSummary || data.latestSummary;

  const openDrillDown = () => {
    if (data.segments.length > 0) {
      setDrillDownRange({
        start: data.segments[0].startTime,
        end: data.segments[data.segments.length - 1].endTime,
      });
    } else {
      const now = Math.floor(Date.now() / 1000);
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      const dayStart = Math.floor(d.getTime() / 1000);
      setDrillDownRange({ start: dayStart, end: now });
    }
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl">{formatDate(data.date)}</h1>
          </div>
          <div>
            {data.isRecording ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm">
                <motion.div
                  className="w-2 h-2 rounded-full bg-destructive"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span>Live</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">
                Dashboard
              </div>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-card rounded-xl p-6 border border-border"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl">{stat.value}</div>
                  {stat.percentage !== null && (
                    <div className="text-sm text-muted-foreground">{stat.percentage}%</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Productivity bar */}
        {data.totalTrackedSecs > 0 && (
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="space-y-3">
              <div className="flex rounded-full overflow-hidden h-3">
                <div style={{ width: `${prodPercent}%` }} className="bg-[#7AB88F]" />
                <div style={{ width: `${neutralPercent}%` }} className="bg-[#D8A86A]" />
                <div style={{ width: `${distractedPercent}%` }} className="bg-[#CC7878]" />
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#7AB88F]" />
                  <span className="text-muted-foreground">Productive</span>
                  <span>{prodPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#D8A86A]" />
                  <span className="text-muted-foreground">Neutral</span>
                  <span>{neutralPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#CC7878]" />
                  <span className="text-muted-foreground">Distracted</span>
                  <span>{distractedPercent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg">AI Insights</h2>
            <button
              onClick={handleGenerateSummary}
              disabled={generatingSummary}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${generatingSummary ? 'animate-spin' : ''}`} />
              <span>{generatingSummary ? 'Generating...' : 'Generate Now'}</span>
            </button>
          </div>

          {summaryText ? (
            <div className="space-y-3">
              <p className="text-muted-foreground leading-relaxed">{summaryText}</p>
              <button
                onClick={openDrillDown}
                className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
              >
                <span>View detailed breakdown</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Start recording to generate AI insights.
            </p>
          )}
        </div>

        {/* Activity Timeline */}
        {data.segments.length > 0 && (
          <div className="bg-card rounded-xl p-6 border border-border">
            <h2 className="text-lg mb-6">Activity Timeline</h2>
            <Timeline
              segments={data.segments}
              timeFormat={timeFormat}
              onSegmentClick={(seg) =>
                setDrillDownRange({ start: seg.startTime, end: seg.endTime })
              }
            />
          </div>
        )}

        {/* Top Apps and Projects */}
        {(data.appUsage.length > 0 || data.topProjects.length > 0) && (
          <div className="grid grid-cols-2 gap-6">
            {/* Top Apps */}
            {data.appUsage.length > 0 && (
              <div className="bg-card rounded-xl p-6 border border-border">
                <h2 className="text-lg mb-4">Top Apps</h2>
                <AppUsageChart usage={data.appUsage} totalTracked={data.totalTrackedSecs} />
              </div>
            )}

            {/* Projects */}
            {data.topProjects.length > 0 && (
              <div className="bg-card rounded-xl p-6 border border-border">
                <h2 className="text-lg mb-4">Projects</h2>
                <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                  {data.topProjects.map((p, i) => (
                    <div key={p.project} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <span className="font-mono text-sm capitalize">{p.project}</span>
                      </div>
                      <span className="text-muted-foreground">{formatDuration(p.seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drill-down */}
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

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-muted flex items-center justify-center">
          <Monitor size={36} className="text-muted-foreground" />
        </div>
        <h3 className="text-xl mb-3 tracking-tight">Ready to focus?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          Start a recording session to track your productivity and get AI-powered insights.
        </p>
        <div className="inline-flex items-center gap-2 text-sm text-accent bg-accent/10 px-5 py-2.5 rounded-full">
          Click "Start Recording" in the sidebar
          <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
}
