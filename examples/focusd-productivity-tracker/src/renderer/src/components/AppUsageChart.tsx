import type { AppUsageStat } from '../../../shared/types';
import { categoryColor, formatDuration } from '../lib/format';

interface Props {
  usage: AppUsageStat[];
  totalTracked?: number;
}

export default function AppUsageChart({ usage, totalTracked }: Props) {
  if (usage.length === 0) return null;

  const total = totalTracked || usage.reduce((sum, u) => sum + u.seconds, 0);

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
      {usage.map((item, i) => {
        const percentage = total > 0 ? Math.round((item.seconds / total) * 100) : 0;
        const color = categoryColor(item.category);

        return (
          <div key={item.app} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-4">{i + 1}.</span>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{item.app}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{formatDuration(item.seconds)}</span>
                <span className="text-muted-foreground">({percentage}%)</span>
              </div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
