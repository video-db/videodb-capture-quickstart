import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Monitor,
  Mic,
  Sparkles,
} from 'lucide-react';
import type { PermissionsState } from '../../../shared/types';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'api-key' | 'permissions' | 'ready';

const STEPS: Step[] = ['welcome', 'api-key', 'permissions', 'ready'];

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [ready, setReady] = useState(false);
  const api = window.api;

  useEffect(() => {
    api.onboarding.state().then((s: { hasApiKey: boolean }) => {
      if (s.hasApiKey) setStep('permissions');
      setReady(true);
    });
  }, [api]);

  const stepIndex = STEPS.indexOf(step);
  const next = () => setStep(STEPS[stepIndex + 1]);
  const back = () => setStep(STEPS[stepIndex - 1]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Left panel — branding */}
      <div className="w-[400px] bg-sidebar border-r border-sidebar-border flex flex-col justify-between p-10 shrink-0">
        <div className="pt-8">
          <h1 className="text-3xl tracking-tight mb-2">Focusd</h1>
          <p className="text-muted-foreground text-sm">by VideoDB</p>
        </div>

        {/* Step indicators */}
        <div className="space-y-4">
          {STEPS.map((s, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                  done ? 'bg-accent text-accent-foreground' :
                  active ? 'bg-accent text-accent-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s === 'welcome' && 'Welcome'}
                  {s === 'api-key' && 'API Key'}
                  {s === 'permissions' && 'Permissions'}
                  {s === 'ready' && 'Ready'}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          AI-powered productivity tracking
        </p>
      </div>

      {/* Right panel — content */}
      <div className="flex-1 flex items-center justify-center p-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg"
          >
            {step === 'welcome' && <WelcomeStep onNext={next} />}
            {step === 'api-key' && <ApiKeyStep api={api} onNext={next} onBack={back} />}
            {step === 'permissions' && <PermissionsStep api={api} onNext={next} onBack={back} />}
            {step === 'ready' && <ReadyStep onComplete={onComplete} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-accent" />
      </div>

      <div className="space-y-3">
        <h2 className="text-3xl tracking-tight">Welcome to Focusd</h2>
        <p className="text-muted-foreground leading-relaxed text-lg">
          Track your screen activity, get AI-powered productivity insights,
          and understand how you spend your time — all privately on your machine.
        </p>
      </div>

      <div className="space-y-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <Monitor className="w-5 h-5 mt-0.5 text-accent shrink-0" />
          <span>Records your screen to understand what apps and content you use</span>
        </div>
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 mt-0.5 text-accent shrink-0" />
          <span>AI generates summaries, productivity breakdowns, and actionable insights</span>
        </div>
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 mt-0.5 text-accent shrink-0" />
          <span>Everything stays local — your data never leaves your machine</span>
        </div>
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
      >
        <span>Get Started</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function ApiKeyStep({ api, onNext, onBack }: { api: any; onNext: () => void; onBack: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);

  const handleValidate = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError(null);

    const result = await api.onboarding.validateKey(apiKey.trim());
    setValidating(false);

    if (result.valid) {
      setValidated(true);
      await api.onboarding.saveKey(apiKey.trim());
    } else {
      setError(result.error || 'Invalid API key. Please check and try again.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
        <Key className="w-10 h-10 text-accent" />
      </div>

      <div className="space-y-3">
        <h2 className="text-3xl tracking-tight">Connect VideoDB</h2>
        <p className="text-muted-foreground leading-relaxed">
          Enter your VideoDB API key to enable screen capture and AI analysis.
          Your key is encrypted and stored securely on your machine.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setError(null); setValidated(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
            placeholder="Enter your VideoDB API key"
            className="w-full px-4 py-3 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
            autoFocus
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {validated && (
          <div className="flex items-center gap-2 text-sm text-[#7AB88F]">
            <CheckCircle2 className="w-4 h-4" />
            <span>API key validated successfully</span>
          </div>
        )}

        <a
          href="https://console.videodb.io"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            window.open('https://console.videodb.io', '_blank');
          }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Get your API key from VideoDB Console</span>
        </a>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={validated ? onNext : handleValidate}
          disabled={!apiKey.trim() || validating}
          className="flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Validating...</span>
            </>
          ) : validated ? (
            <>
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <span>Validate & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PermissionsStep({ api, onNext, onBack }: { api: any; onNext: () => void; onBack: () => void }) {
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    const p = await api.onboarding.getPermissions();
    setPermissions(p);
  }, [api]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRequestMic = async () => {
    setRequesting(true);
    await api.onboarding.requestMicPermission();
    await refresh();
    setRequesting(false);
  };

  const handleOpenScreenSettings = () => {
    api.onboarding.openScreenPermissions();
  };

  const screenGranted = permissions?.screen === 'granted';
  const micGranted = permissions?.microphone === 'granted';
  const micDenied = permissions?.microphone === 'denied';

  return (
    <div className="space-y-8">
      <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
        <Shield className="w-10 h-10 text-accent" />
      </div>

      <div className="space-y-3">
        <h2 className="text-3xl tracking-tight">Grant Permissions</h2>
        <p className="text-muted-foreground leading-relaxed">
          Focusd needs access to your screen and microphone to record and analyze your activity.
          These can be changed later in System Settings.
        </p>
      </div>

      <div className="space-y-3">
        {/* Screen Recording */}
        <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              screenGranted ? 'bg-[#7AB88F]/10' : 'bg-muted'
            }`}>
              <Monitor className={`w-5 h-5 ${screenGranted ? 'text-[#7AB88F]' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="font-medium text-sm">Screen Recording</div>
              <div className="text-xs text-muted-foreground">Required for screen capture</div>
            </div>
          </div>
          {screenGranted ? (
            <div className="flex items-center gap-1.5 text-sm text-[#7AB88F]">
              <CheckCircle2 className="w-4 h-4" />
              <span>Granted</span>
            </div>
          ) : (
            <button
              onClick={handleOpenScreenSettings}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
            >
              Open Settings
            </button>
          )}
        </div>

        {/* Microphone */}
        <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              micGranted ? 'bg-[#7AB88F]/10' : 'bg-muted'
            }`}>
              <Mic className={`w-5 h-5 ${micGranted ? 'text-[#7AB88F]' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="font-medium text-sm">Microphone</div>
              <div className="text-xs text-muted-foreground">Optional — for audio transcription</div>
            </div>
          </div>
          {micGranted ? (
            <div className="flex items-center gap-1.5 text-sm text-[#7AB88F]">
              <CheckCircle2 className="w-4 h-4" />
              <span>Granted</span>
            </div>
          ) : micDenied ? (
            <button
              onClick={() => api.onboarding.openMicPermissions()}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
            >
              Open Settings
            </button>
          ) : (
            <button
              onClick={handleRequestMic}
              disabled={requesting}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {requesting ? 'Requesting...' : 'Allow'}
            </button>
          )}
        </div>
      </div>

      {!screenGranted && (
        <p className="text-xs text-muted-foreground">
          After enabling Screen Recording in System Settings, macOS will restart the app automatically.
          You'll return to this step to continue setup.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        {screenGranted && (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ReadyStep({ onComplete }: { onComplete: () => void }) {
  const handleComplete = async () => {
    await window.api.onboarding.complete();
    onComplete();
  };

  return (
    <div className="space-y-8">
      <div className="w-20 h-20 rounded-2xl bg-[#7AB88F]/10 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-[#7AB88F]" />
      </div>

      <div className="space-y-3">
        <h2 className="text-3xl tracking-tight">You're all set</h2>
        <p className="text-muted-foreground leading-relaxed text-lg">
          Focusd is ready to help you understand and improve your productivity.
          Hit "Start Recording" in the sidebar to begin your first session.
        </p>
      </div>

      <div className="space-y-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs shrink-0 mt-0.5">1</div>
          <span>Click <strong className="text-foreground">Start Recording</strong> to begin tracking</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs shrink-0 mt-0.5">2</div>
          <span>AI will generate insights about your activity every few minutes</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs shrink-0 mt-0.5">3</div>
          <span>Check the dashboard for summaries, timelines, and productivity breakdowns</span>
        </div>
      </div>

      <button
        onClick={handleComplete}
        className="flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
      >
        <span>Start Using Focusd</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
