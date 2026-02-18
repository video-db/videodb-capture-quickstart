import { useState, useEffect } from 'react';
import { X, ChevronRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAPI } from '../hooks/useIPC';
import { formatTimeRange, categoryColor, productivityColor } from '../lib/format';
import type { TimeFormat, MicroSummary, ActivitySegment, DeepDiveResult } from '../../../shared/types';

interface Props {
  start: number;
  end: number;
  timeFormat: TimeFormat;
  onClose: () => void;
}

type Level = 'summaries' | 'activities' | 'deepdive';

export default function DrillDown({ start, end, timeFormat, onClose }: Props) {
  const api = useAPI();
  const [level, setLevel] = useState<Level>('summaries');
  const [micros, setMicros] = useState<MicroSummary[]>([]);
  const [segments, setSegments] = useState<ActivitySegment[]>([]);
  const [deepDive, setDeepDive] = useState<DeepDiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState({ start, end });

  useEffect(() => {
    loadMicros();
  }, [start, end]);

  const loadMicros = async () => {
    setLoading(true);
    setLevel('summaries');
    try {
      const data = await api.summary.microList(start, end);
      setMicros([...data].reverse());
      if (data.length === 0) {
        const segs = await api.summary.segments(start, end);
        setSegments([...segs].reverse());
        setLevel('activities');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSegments = async (s: number, e: number) => {
    setLoading(true);
    setSelectedRange({ start: s, end: e });
    try {
      const segs = await api.summary.segments(s, e);
      setSegments([...segs].reverse());
      setLevel('activities');
    } finally {
      setLoading(false);
    }
  };

  const loadDeepDive = async (s: number, e: number) => {
    setLoading(true);
    setSelectedRange({ start: s, end: e });
    try {
      const result = await api.summary.deepDive(s, e);
      setDeepDive(result);
      setLevel('deepdive');
    } finally {
      setLoading(false);
    }
  };

  const getProductivityBadgeClass = (label: string) => {
    switch (label) {
      case 'productive':
        return 'bg-[#7AB88F]/10 text-[#7AB88F] border-[#7AB88F]/20';
      case 'distracted':
        return 'bg-[#CC7878]/10 text-[#CC7878] border-[#CC7878]/20';
      default:
        return 'bg-[#D8A86A]/10 text-[#D8A86A] border-[#D8A86A]/20';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        />

        {/* Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="ml-auto w-full max-w-2xl bg-card border-l border-border flex flex-col h-full relative shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-xl mb-1">Activity Details</h2>
                <p className="text-sm text-muted-foreground">
                  {formatTimeRange(selectedRange.start, selectedRange.end, timeFormat)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadMicros}
                className={`hover:text-foreground transition-colors ${
                  level === 'summaries' ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                Summaries
              </button>
              {(level === 'activities' || level === 'deepdive') && (
                <>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <button
                    onClick={() => loadSegments(selectedRange.start, selectedRange.end)}
                    className={`hover:text-foreground transition-colors ${
                      level === 'activities' ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Activities
                  </button>
                </>
              )}
              {level === 'deepdive' && (
                <>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">Deep Dive</span>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Level 1: Micro Summaries */}
                {level === 'summaries' && (
                  micros.length > 0 ? (
                    <div className="space-y-4">
                      {micros.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => loadSegments(m.startTime, m.endTime)}
                          className="w-full bg-muted/30 rounded-xl p-5 border border-border hover:border-accent/50 transition-colors text-left"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-sm text-muted-foreground">
                              {formatTimeRange(m.startTime, m.endTime, timeFormat)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${getProductivityBadgeClass(m.productivityLabel)}`}>
                              {m.productivityLabel}
                            </span>
                          </div>
                          <p className="text-sm">{m.summary}</p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-accent">
                            <span>View activities</span>
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptySlot message="No summaries for this time range" />
                  )
                )}

                {/* Level 2: Activity Segments */}
                {level === 'activities' && (
                  segments.length > 0 ? (
                    <div className="space-y-4">
                      {segments.map((seg) => {
                        const color = seg.isIdle ? '#B3ADA5' : categoryColor(seg.appCategory || 'other');
                        return (
                          <button
                            key={seg.id}
                            onClick={() => loadDeepDive(seg.startTime, seg.endTime)}
                            className="w-full bg-muted/30 rounded-xl p-5 border border-border hover:border-accent/50 transition-colors text-left"
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div
                                className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span>{seg.primaryApp || 'Unknown'}</span>
                                  <span className="text-xs text-muted-foreground">
                                    · {seg.appCategory || 'other'}
                                  </span>
                                </div>
                                {seg.action && (
                                  <p className="text-sm text-muted-foreground capitalize">{seg.action}</p>
                                )}
                              </div>
                            </div>

                            {seg.project && (
                              <div className="mb-2 text-xs text-muted-foreground">
                                <span className="opacity-70">Project:</span>{' '}
                                <span className="font-mono">{seg.project}</span>
                              </div>
                            )}

                            {seg.context && (
                              <div className="mb-3 text-sm bg-muted/50 rounded-lg p-3 font-mono text-xs">
                                {seg.context}
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {formatTimeRange(seg.startTime, seg.endTime, timeFormat)}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-accent">
                                <span>View details</span>
                                <ChevronRight className="w-3 h-3" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptySlot message="No activity segments for this range" />
                  )
                )}

                {/* Level 3: Deep Dive */}
                {level === 'deepdive' && deepDive && (
                  <div className="prose prose-sm max-w-none">
                    <div className="bg-muted/30 rounded-xl p-6 border border-border">
                      <div className="space-y-4 text-foreground leading-relaxed whitespace-pre-wrap">
                        {deepDive.analysis}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function EmptySlot({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
