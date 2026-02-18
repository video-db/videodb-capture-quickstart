import { ChevronRight } from 'lucide-react';

interface Props {
  summary: string;
  onDrillDown?: () => void;
}

export default function SummaryCard({ summary, onDrillDown }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground leading-relaxed">{summary}</p>
      {onDrillDown && (
        <button
          onClick={onDrillDown}
          className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
        >
          <span>View detailed breakdown</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
