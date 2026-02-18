import { useState, useEffect } from 'react';
import { Monitor, X, Loader2, Check } from 'lucide-react';
import { useAPI } from '../hooks/useIPC';
import type { ScreenSource } from '../../../shared/types';

interface Props {
  open: boolean;
  onSelect: (screen: ScreenSource) => void;
  onClose: () => void;
}

export default function ScreenSelector({ open, onSelect, onClose }: Props) {
  const api = useAPI();
  const [screens, setScreens] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    api.capture.listScreens().then((sources) => {
      setScreens(sources);
      if (sources.length === 1) setSelectedId(sources[0].id);
      setLoading(false);
    });
  }, [open, api]);

  if (!open) return null;

  const handleConfirm = () => {
    const screen = screens.find((s) => s.id === selectedId);
    if (screen) onSelect(screen);
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl">Select Screen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which display to record
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Screen grid */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : screens.length === 0 ? (
            <div className="text-center py-14">
              <Monitor size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No screens detected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Grant screen recording permission in System Settings
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {screens.map((screen) => {
                const isSelected = selectedId === screen.id;
                return (
                  <button
                    key={screen.id}
                    onClick={() => setSelectedId(screen.id)}
                    className={`relative aspect-video rounded-lg border-2 transition-all overflow-hidden group ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/50 bg-muted/30'
                    }`}
                  >
                    {/* Preview */}
                    <div className="w-full h-full flex items-center justify-center">
                      {screen.thumbnail ? (
                        <img
                          src={screen.thumbnail}
                          alt={screen.name}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <Monitor className="w-12 h-12 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-accent-foreground" />
                      </div>
                    )}

                    {/* Screen name */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <p className="text-white text-sm">{screen.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className={`px-6 py-2 rounded-lg transition-colors ${
              !selectedId
                ? 'bg-accent/50 text-accent-foreground/50 cursor-not-allowed'
                : 'bg-accent text-accent-foreground hover:bg-accent/90'
            }`}
          >
            Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}
