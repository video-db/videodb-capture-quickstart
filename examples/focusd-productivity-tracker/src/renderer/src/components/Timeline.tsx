import { useState } from 'react';
import type { ActivitySegment, TimeFormat } from '../../../shared/types';
import { categoryColor, formatTime, formatDuration } from '../lib/format';

const GAP_THRESHOLD = 30 * 60; // 30 minutes — gaps larger than this get a labeled break
const GAP_VISUAL_PERCENT = 12; // percentage width for each gap section

interface Props {
  segments: ActivitySegment[];
  timeFormat: TimeFormat;
  onSegmentClick: (seg: ActivitySegment) => void;
}

interface TimelineBlock extends ActivitySegment {}

interface ActivityCluster {
  blocks: TimelineBlock[];
  startTime: number;
  endTime: number;
  duration: number;
}

export default function Timeline({ segments, timeFormat, onSegmentClick }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (segments.length === 0) return null;

  const blocks = mergeConsecutive(segments);
  if (blocks.length === 0) return null;

  const clusters = buildClusters(blocks);

  // No large gaps — simple flat timeline
  if (clusters.length <= 1) {
    return (
      <div className="space-y-3">
        <FlatTimeline
          blocks={blocks}
          timeFormat={timeFormat}
          onSegmentClick={onSegmentClick}
          hovered={hovered}
          setHovered={setHovered}
        />
        <Legend blocks={blocks} />
      </div>
    );
  }

  // Multiple clusters with gaps
  const gapCount = clusters.length - 1;
  const totalGapPercent = gapCount * GAP_VISUAL_PERCENT;
  const activityPercent = 100 - totalGapPercent;
  const totalActivityDuration = clusters.reduce((s, c) => s + c.duration, 0);

  let globalIndex = 0;

  return (
    <div className="space-y-3">
      {/* Timeline row */}
      <div className="flex items-stretch h-12 gap-0">
        {clusters.map((cluster, ci) => {
          const clusterWidthPercent = totalActivityDuration > 0
            ? (cluster.duration / totalActivityDuration) * activityPercent
            : activityPercent / clusters.length;

          const clusterDuration = cluster.endTime - cluster.startTime;
          const gap = ci < clusters.length - 1
            ? clusters[ci + 1].startTime - cluster.endTime
            : 0;

          const clusterEl = (
            <div
              key={`c${ci}`}
              className="relative rounded-lg overflow-hidden bg-muted shrink-0"
              style={{ width: `${clusterWidthPercent}%` }}
            >
              {cluster.blocks.map((block) => {
                const idx = globalIndex++;
                const left = clusterDuration > 0
                  ? ((block.startTime - cluster.startTime) / clusterDuration) * 100
                  : 0;
                const width = clusterDuration > 0
                  ? ((block.endTime - block.startTime) / clusterDuration) * 100
                  : 100;

                return (
                  <BlockButton
                    key={idx}
                    block={block}
                    index={idx}
                    left={left}
                    width={width}
                    hovered={hovered}
                    setHovered={setHovered}
                    onClick={onSegmentClick}
                  />
                );
              })}
            </div>
          );

          if (ci >= clusters.length - 1) return clusterEl;

          // Gap indicator between clusters
          const gapEl = (
            <div
              key={`g${ci}`}
              className="flex flex-col items-center justify-center shrink-0 relative"
              style={{ width: `${GAP_VISUAL_PERCENT}%` }}
            >
              {/* Dashed line */}
              <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-muted-foreground/25" />
              {/* Label */}
              <div className="relative bg-background px-2 py-0.5 rounded-full">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatGapDuration(gap)}
                </span>
              </div>
            </div>
          );

          return (
            <span key={`pair${ci}`} className="contents">
              {clusterEl}
              {gapEl}
            </span>
          );
        })}
      </div>

      {/* Time labels row */}
      <div className="flex items-center gap-0">
        {clusters.map((cluster, ci) => {
          const clusterWidthPercent = totalActivityDuration > 0
            ? (cluster.duration / totalActivityDuration) * activityPercent
            : activityPercent / clusters.length;

          const clusterLabel = (
            <div
              key={`tl${ci}`}
              className="flex justify-between text-xs text-muted-foreground shrink-0 px-0.5"
              style={{ width: `${clusterWidthPercent}%` }}
            >
              <span>{formatTime(cluster.startTime, timeFormat)}</span>
              <span>{formatTime(cluster.endTime, timeFormat)}</span>
            </div>
          );

          if (ci >= clusters.length - 1) return clusterLabel;

          const spacer = (
            <div
              key={`ts${ci}`}
              className="shrink-0"
              style={{ width: `${GAP_VISUAL_PERCENT}%` }}
            />
          );

          return (
            <span key={`tp${ci}`} className="contents">
              {clusterLabel}
              {spacer}
            </span>
          );
        })}
      </div>

      <Legend blocks={blocks} />
    </div>
  );
}

// ── Flat timeline (no gaps) ──

function FlatTimeline({
  blocks,
  timeFormat,
  onSegmentClick,
  hovered,
  setHovered,
}: {
  blocks: TimelineBlock[];
  timeFormat: TimeFormat;
  onSegmentClick: (seg: ActivitySegment) => void;
  hovered: number | null;
  setHovered: (i: number | null) => void;
}) {
  const start = blocks[0].startTime;
  const end = blocks[blocks.length - 1].endTime;
  const totalDuration = end - start;
  if (totalDuration <= 0) return null;

  const markers = buildHourMarkers(start, end, totalDuration);

  return (
    <>
      <div className="relative h-12 rounded-lg overflow-hidden bg-muted">
        {blocks.map((block, i) => {
          const left = ((block.startTime - start) / totalDuration) * 100;
          const width = ((block.endTime - block.startTime) / totalDuration) * 100;
          return (
            <BlockButton
              key={i}
              block={block}
              index={i}
              left={left}
              width={width}
              hovered={hovered}
              setHovered={setHovered}
              onClick={onSegmentClick}
            />
          );
        })}
      </div>
      <div className="relative h-5">
        {/* Always show start and end times */}
        <span className="absolute left-0 text-xs text-muted-foreground">
          {formatTime(start, timeFormat)}
        </span>
        <span className="absolute right-0 text-xs text-muted-foreground">
          {formatTime(end, timeFormat)}
        </span>
        {/* Hour markers in between */}
        {markers
          .filter(({ position }) => position > 8 && position < 92)
          .map(({ hour, position, epoch }) => (
            <span
              key={hour}
              className="absolute text-xs text-muted-foreground -translate-x-1/2"
              style={{ left: `${position}%` }}
            >
              {formatTime(epoch, timeFormat)}
            </span>
          ))}
      </div>
    </>
  );
}

// ── Shared sub-components ──

function BlockButton({
  block,
  index,
  left,
  width,
  hovered,
  setHovered,
  onClick,
}: {
  block: TimelineBlock;
  index: number;
  left: number;
  width: number;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  onClick: (seg: ActivitySegment) => void;
}) {
  const color = block.isIdle ? '#B3ADA5' : categoryColor(block.appCategory || 'other');

  return (
    <button
      onClick={() => onClick(block)}
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
      className="absolute top-0 h-full hover:opacity-80 transition-opacity group"
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
        backgroundColor: color,
        opacity: hovered !== null && hovered !== index ? 0.4 : 1,
      }}
      title={block.primaryApp || block.appCategory || 'Unknown'}
    >
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
        <div>{block.primaryApp || block.appCategory || 'Unknown'}</div>
        <div className="text-background/70">{formatDuration(block.endTime - block.startTime)}</div>
      </div>
    </button>
  );
}

function Legend({ blocks }: { blocks: TimelineBlock[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 border-t border-border">
      {getUniqueCategoriesFromBlocks(blocks).map(({ category, color }) => (
        <div key={category} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          <span className="text-muted-foreground capitalize">{category}</span>
        </div>
      ))}
    </div>
  );
}

// ── Utilities ──

function formatGapDuration(secs: number): string {
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function buildClusters(blocks: TimelineBlock[]): ActivityCluster[] {
  if (blocks.length === 0) return [];

  const clusters: ActivityCluster[] = [];
  let current: ActivityCluster = {
    blocks: [blocks[0]],
    startTime: blocks[0].startTime,
    endTime: blocks[0].endTime,
    duration: blocks[0].endTime - blocks[0].startTime,
  };

  for (let i = 1; i < blocks.length; i++) {
    const gap = blocks[i].startTime - current.endTime;

    if (gap > GAP_THRESHOLD) {
      clusters.push(current);
      current = {
        blocks: [blocks[i]],
        startTime: blocks[i].startTime,
        endTime: blocks[i].endTime,
        duration: blocks[i].endTime - blocks[i].startTime,
      };
    } else {
      current.blocks.push(blocks[i]);
      current.endTime = blocks[i].endTime;
      current.duration = current.endTime - current.startTime;
    }
  }

  clusters.push(current);
  return clusters;
}

function buildHourMarkers(start: number, end: number, totalDuration: number) {
  const startHour = new Date(start * 1000).getHours();
  const endHour = new Date(end * 1000).getHours();
  const markers: { hour: number; position: number; epoch: number }[] = [];
  for (let h = startHour; h <= endHour; h++) {
    const d = new Date(start * 1000);
    d.setHours(h, 0, 0, 0);
    const epoch = Math.floor(d.getTime() / 1000);
    if (epoch >= start && epoch <= end) {
      markers.push({ hour: h, position: ((epoch - start) / totalDuration) * 100, epoch });
    }
  }
  return markers;
}

function mergeConsecutive(segments: ActivitySegment[]): TimelineBlock[] {
  if (segments.length === 0) return [];
  const merged: TimelineBlock[] = [];
  let current = { ...segments[0] };
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const sameCategory = seg.appCategory === current.appCategory && seg.isIdle === current.isIdle;
    const contiguous = seg.startTime - current.endTime < 60;
    if (sameCategory && contiguous) {
      current.endTime = seg.endTime;
      current.eventCount += seg.eventCount;
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);
  return merged;
}

function getUniqueCategoriesFromBlocks(blocks: TimelineBlock[]): { category: string; color: string }[] {
  const seen = new Set<string>();
  const result: { category: string; color: string }[] = [];
  for (const block of blocks) {
    const cat = block.isIdle ? 'idle' : block.appCategory || 'other';
    if (!seen.has(cat)) {
      seen.add(cat);
      result.push({ category: cat, color: block.isIdle ? '#B3ADA5' : categoryColor(cat) });
    }
  }
  return result;
}
