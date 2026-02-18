import { useState, useEffect } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check, Key, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { Settings, ApiKeyInfo } from '../../../shared/types';

interface Props {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => Promise<void>;
}

export default function SettingsView({ settings, onUpdate }: Props) {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const [keyInfo, setKeyInfo] = useState<ApiKeyInfo | null>(null);

  useEffect(() => {
    window.api.onboarding.getKeyInfo().then(setKeyInfo);
  }, []);

  const handleSaveKey = async () => {
    if (!newKey.trim()) return;
    setKeyValidating(true);
    setKeyError(null);

    const result = await window.api.onboarding.validateKey(newKey.trim());
    if (result.valid) {
      await window.api.onboarding.saveKey(newKey.trim());
      setKeySuccess(true);
      setKeyValidating(false);
      const updated = await window.api.onboarding.getKeyInfo();
      setKeyInfo(updated);
      setTimeout(() => {
        setShowKeyInput(false);
        setNewKey('');
        setKeySuccess(false);
      }, 1500);
    } else {
      setKeyError(result.error || 'Invalid API key');
      setKeyValidating(false);
    }
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl">Settings</h1>
          </div>
          <div className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">
            Preferences
          </div>
        </div>

        {/* API Key Section */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg">API Key</h2>
          </div>
          <div className="p-6">
            {showKeyInput ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">New API Key</label>
                  <input
                    type="password"
                    value={newKey}
                    onChange={(e) => { setNewKey(e.target.value); setKeyError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                    placeholder="Enter your VideoDB API key"
                    className="w-full px-4 py-3 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
                    autoFocus
                  />
                </div>
                {keyError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4" />
                    <span>{keyError}</span>
                  </div>
                )}
                {keySuccess && (
                  <div className="flex items-center gap-2 text-sm text-[#7AB88F]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>API key updated successfully</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveKey}
                    disabled={!newKey.trim() || keyValidating}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 disabled:opacity-50"
                  >
                    {keyValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{keyValidating ? 'Validating...' : 'Save'}</span>
                  </button>
                  <button
                    onClick={() => { setShowKeyInput(false); setNewKey(''); setKeyError(null); }}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm">VideoDB API Key</p>
                    {keyInfo && keyInfo.source !== 'none' ? (
                      <p className="text-xs text-muted-foreground font-mono">{keyInfo.preview}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No key configured</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowKeyInput(true)}
                  className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                >
                  Change Key
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Display Section */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg">Display</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="block mb-1">Time Format</label>
                <p className="text-sm text-muted-foreground">
                  Choose between 12-hour or 24-hour time display
                </p>
              </div>
              <SelectDropdown
                value={settings.timeFormat}
                onValueChange={(v) => onUpdate({ timeFormat: v as Settings['timeFormat'] })}
                options={[
                  { value: '12h', label: '12-hour' },
                  { value: '24h', label: '24-hour' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Recording Section */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg">Recording</h2>
          </div>
          <div className="divide-y divide-border">
            <ToggleSetting
              label="Microphone"
              description="Record audio from your microphone"
              checked={settings.recordMic}
              onCheckedChange={(v) => onUpdate({ recordMic: v })}
            />
            <ToggleSetting
              label="Screen Capture"
              description="Capture screenshots of your screen activity"
              checked={settings.recordScreen}
              onCheckedChange={(v) => onUpdate({ recordScreen: v })}
            />
            <ToggleSetting
              label="System Audio"
              description="Record system audio and application sounds"
              checked={settings.recordSystemAudio}
              onCheckedChange={(v) => onUpdate({ recordSystemAudio: v })}
            />
          </div>
        </div>

        {/* Analysis Frequency */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg">Analysis Frequency</h2>
          </div>
          <div className="divide-y divide-border">
            <SelectSetting
              label="Processing Interval"
              description="How often your activity is checked and organized for summaries"
              value={String(settings.segmentFlushMins)}
              options={buildOptions(settings.segmentFlushMins, [1, 2, 3, 5])}
              onValueChange={(v) => onUpdate({ segmentFlushMins: parseInt(v) })}
            />
            <SelectSetting
              label="Quick Insights"
              description="How often you get short AI summaries of what you've been doing"
              value={String(settings.microSummaryIntervalMins)}
              options={buildOptions(settings.microSummaryIntervalMins, [2, 3, 5, 10])}
              onValueChange={(v) => onUpdate({ microSummaryIntervalMins: parseInt(v) })}
            />
            <SelectSetting
              label="Session Report"
              description="How often a detailed session report is generated"
              value={String(settings.sessionSummaryIntervalMins)}
              options={buildOptions(settings.sessionSummaryIntervalMins, [3, 5, 10, 15])}
              onValueChange={(v) => onUpdate({ sessionSummaryIntervalMins: parseInt(v) })}
            />
          </div>
        </div>

        {/* Break Detection */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg">Break Detection</h2>
          </div>
          <div className="p-6">
            <SelectSetting
              label="Away Timeout"
              description="How long you need to be inactive before it counts as a break"
              value={String(settings.idleThresholdMins)}
              options={buildOptions(settings.idleThresholdMins, [2, 3, 5, 10])}
              onValueChange={(v) => onUpdate({ idleThresholdMins: parseInt(v) })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildOptions(currentValue: number, presets: number[]): { value: string; label: string }[] {
  const allValues = new Set(presets);
  allValues.add(currentValue);
  const sorted = [...allValues].sort((a, b) => a - b);
  return sorted.map((v) => {
    let label: string;
    if (v >= 60) {
      const hrs = v / 60;
      label = hrs === 1 ? '1 hour' : `${hrs} hours`;
    } else {
      label = v === 1 ? '1 minute' : `${v} minutes`;
    }
    if (v === currentValue && !presets.includes(v)) label += ' (config default)';
    return { value: String(v), label };
  });
}

function ToggleSetting({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="p-6 flex items-center justify-between">
      <div className="flex-1">
        <label className="block mb-1">{label}</label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="w-11 h-6 bg-switch-background rounded-full relative transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform transform translate-x-0.5 data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}

function SelectSetting({
  label,
  description,
  value,
  options,
  onValueChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="p-6 flex items-center justify-between">
      <div className="flex-1">
        <label className="block mb-1">{label}</label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <SelectDropdown value={value} onValueChange={onValueChange} options={options} />
    </div>
  );
}

function SelectDropdown({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="flex items-center gap-2 px-4 py-2 bg-input-background rounded-lg border border-border hover:bg-muted transition-colors min-w-[150px] justify-between">
        <Select.Value />
        <ChevronDown className="w-4 h-4" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="px-4 py-2 hover:bg-muted cursor-pointer flex items-center justify-between text-sm"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="w-4 h-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
