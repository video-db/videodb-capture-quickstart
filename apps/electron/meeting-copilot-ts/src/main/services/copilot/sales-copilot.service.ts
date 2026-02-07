/**
 * Sales Co-Pilot Agent Orchestrator
 *
 * Central coordinator that receives transcript segments, manages context,
 * and triggers all agent processing pipelines. Emits events for UI updates.
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { logger } from '../../lib/logger';
import { initLLMService } from '../llm.service';
import {
  updateRecording,
  createCallMetricsSnapshot,
  createNudge,
} from '../../db';

import {
  TranscriptBufferService,
  getTranscriptBuffer,
  type RawTranscriptData,
  type TranscriptSegmentData,
} from './transcript-buffer.service';

import {
  ContextManagerService,
  getContextManager,
} from './context-manager.service';

import {
  ConversationMetricsService,
  getMetricsService,
  type ConversationMetrics,
} from './conversation-metrics.service';

import {
  SentimentAnalyzerService,
  getSentimentAnalyzer,
  type SentimentTrend,
} from './sentiment-analyzer.service';

import {
  NudgeEngineService,
  getNudgeEngine,
  type Nudge,
} from './nudge-engine.service';

import {
  CueCardEngineService,
  getCueCardEngine,
  type CueCardTriggerData,
} from './cue-card-engine.service';

import {
  PlaybookTrackerService,
  getPlaybookTracker,
  type PlaybookSnapshot,
  type PlaybookItem,
} from './playbook-tracker.service';

import {
  SummaryGeneratorService,
  getSummaryGenerator,
  type CallSummary,
} from './summary-generator.service';

const log = logger.child({ module: 'sales-copilot' });

// Types

export interface CopilotConfig {
  enableTranscription: boolean;
  enableMetrics: boolean;
  enableSentiment: boolean;
  enableNudges: boolean;
  enableCueCards: boolean;
  enablePlaybook: boolean;
  playbookId?: string;
  useLLMForDetection: boolean;
  metricsUpdateInterval: number; // ms
  compressionInterval: number; // ms
}

export interface CopilotEvents {
  'call-started': { recordingId: number; sessionId: string };
  'transcript-segment': TranscriptSegmentData;
  'metrics-update': { metrics: ConversationMetrics; health: number };
  'sentiment-update': { sentiment: SentimentTrend };
  'nudge': { nudge: Nudge };
  'cue-card': { cueCard: CueCardTriggerData };
  'playbook-update': { item: PlaybookItem; snapshot: PlaybookSnapshot };
  'call-ended': {
    summary: CallSummary;
    playbook?: PlaybookSnapshot;
    metrics: ConversationMetrics;
    duration: number;
  };
  'error': { error: string; context?: string };
}

export interface CallState {
  recordingId: number;
  sessionId: string;
  startTime: number;
  isActive: boolean;
}

// Sales Co-Pilot Service

export class SalesCopilotService extends EventEmitter {
  private transcriptBuffer: TranscriptBufferService;
  private contextManager: ContextManagerService;
  private metricsService: ConversationMetricsService;
  private sentimentAnalyzer: SentimentAnalyzerService;
  private nudgeEngine: NudgeEngineService;
  private cueCardEngine: CueCardEngineService;
  private playbookTracker: PlaybookTrackerService;
  private summaryGenerator: SummaryGeneratorService;

  private config: CopilotConfig;
  private callState: CallState | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private compressionTimer: NodeJS.Timeout | null = null;
  private processingQueue: TranscriptSegmentData[] = [];
  private isProcessing: boolean = false;

  private readonly DEFAULT_CONFIG: CopilotConfig = {
    enableTranscription: true,
    enableMetrics: true,
    enableSentiment: true,
    enableNudges: true,
    enableCueCards: true,
    enablePlaybook: true,
    useLLMForDetection: false, // Start with fast detection
    metricsUpdateInterval: 10000, // 10 seconds
    compressionInterval: 300000, // 5 minutes
  };

  constructor(config?: Partial<CopilotConfig>) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    // Initialize services
    this.transcriptBuffer = getTranscriptBuffer();
    this.contextManager = getContextManager();
    this.metricsService = getMetricsService();
    this.sentimentAnalyzer = getSentimentAnalyzer();
    this.nudgeEngine = getNudgeEngine();
    this.cueCardEngine = getCueCardEngine();
    this.playbookTracker = getPlaybookTracker();
    this.summaryGenerator = getSummaryGenerator();

    // Listen for transcript segments ready for processing
    this.transcriptBuffer.on('segment-ready', this.onSegmentReady.bind(this));
  }

  /**
   * Initialize with API key
   */
  initialize(apiKey: string): void {
    initLLMService(apiKey);
    log.info('Sales Co-Pilot initialized with API key');
  }

  /**
   * Start tracking a call
   */
  async startCall(recordingId: number, sessionId: string): Promise<void> {
    if (this.callState?.isActive) {
      log.warn('Call already in progress, ending previous call');
      await this.endCall();
    }

    this.callState = {
      recordingId,
      sessionId,
      startTime: Date.now(),
      isActive: true,
    };

    // Initialize services
    this.transcriptBuffer.startCall(sessionId, recordingId);
    this.nudgeEngine.reset();
    this.cueCardEngine.reset();
    this.sentimentAnalyzer.clear();
    this.metricsService.clear(sessionId);

    // Initialize playbook if enabled
    if (this.config.enablePlaybook) {
      await this.playbookTracker.initialize(this.config.playbookId || null, recordingId);
    }

    // Start periodic metrics updates
    if (this.config.enableMetrics) {
      this.startMetricsTimer();
    }

    // Start context compression timer
    this.startCompressionTimer();

    this.emit('call-started', { recordingId, sessionId });
    log.info({ recordingId, sessionId }, 'Call tracking started');
  }

  /**
   * Process incoming transcript from WebSocket
   */
  async onTranscriptReceived(
    channel: 'me' | 'them',
    data: RawTranscriptData
  ): Promise<void> {
    if (!this.callState?.isActive) {
      log.warn('Received transcript but no active call');
      return;
    }

    // Add to buffer
    const segment = await this.transcriptBuffer.addRawSegment(
      this.callState.sessionId,
      this.callState.recordingId,
      channel,
      data
    );

    if (segment) {
      this.emit('transcript-segment', segment);
    }
  }

  /**
   * Handle segment ready for agent processing
   */
  private async onSegmentReady(segment: TranscriptSegmentData): Promise<void> {
    if (!this.callState?.isActive) return;

    // Add to processing queue
    this.processingQueue.push(segment);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Process the segment queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const segment = this.processingQueue.shift()!;

      try {
        await this.processSegment(segment);
      } catch (error) {
        log.error({ error, segmentId: segment.id }, 'Error processing segment');
        this.emit('error', { error: 'Segment processing failed', context: segment.id });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a single segment through all pipelines
   */
  private async processSegment(segment: TranscriptSegmentData): Promise<void> {
    if (!this.callState) return;

    const recentSegments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);
    const context = this.contextManager.buildAnalysisContext(
      this.callState.sessionId,
      recentSegments,
      5
    );

    // Run processing in parallel where possible
    const promises: Promise<void>[] = [];

    // Cue card detection (only for customer statements)
    if (this.config.enableCueCards && segment.channel === 'them') {
      promises.push(this.processCueCards(segment, context));
    }

    // Playbook tracking
    if (this.config.enablePlaybook) {
      promises.push(this.processPlaybook(segment, context));
    }

    // Sentiment update (only for customer statements)
    if (this.config.enableSentiment && segment.channel === 'them') {
      this.processSentiment();
    }

    await Promise.all(promises);

    // Mark segment as processed
    this.transcriptBuffer.markProcessed(segment.id, this.callState.sessionId);
  }

  /**
   * Process cue card detection
   */
  private async processCueCards(segment: TranscriptSegmentData, context: string): Promise<void> {
    if (!this.callState) return;

    const cueCard = await this.cueCardEngine.processSegment(
      segment,
      context,
      this.callState.recordingId,
      this.config.useLLMForDetection
    );

    if (cueCard) {
      this.emit('cue-card', { cueCard });
    }
  }

  /**
   * Process playbook tracking
   */
  private async processPlaybook(segment: TranscriptSegmentData, context: string): Promise<void> {
    let updatedItem: PlaybookItem | null = null;

    if (this.config.useLLMForDetection) {
      updatedItem = await this.playbookTracker.checkCoverageWithLLM(segment, context);
    } else {
      updatedItem = this.playbookTracker.checkCoverageFast(segment);
    }

    if (updatedItem) {
      const snapshot = this.playbookTracker.getSnapshot();
      if (snapshot) {
        this.emit('playbook-update', { item: updatedItem, snapshot });
      }
    }
  }

  /**
   * Process sentiment update
   */
  private processSentiment(): void {
    if (!this.callState) return;

    const recentSegments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);
    const sentiment = this.sentimentAnalyzer.getSentimentTrend(recentSegments);

    this.emit('sentiment-update', { sentiment });
  }

  /**
   * Start periodic metrics updates
   */
  private startMetricsTimer(): void {
    if (this.metricsTimer) return;

    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, this.config.metricsUpdateInterval);
  }

  /**
   * Update metrics and check for nudges
   */
  private updateMetrics(): void {
    if (!this.callState?.isActive) return;

    const segments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);
    const callDuration = (Date.now() - this.callState.startTime) / 1000;
    const metrics = this.metricsService.calculate(segments, callDuration);
    const health = this.metricsService.getConversationHealthScore(metrics);
    const sentiment = this.sentimentAnalyzer.getSentimentTrend(segments);
    const playbookSnapshot = this.playbookTracker.getSnapshot();

    // Emit metrics update
    this.emit('metrics-update', { metrics, health });

    // Check for nudges
    if (this.config.enableNudges) {
      const nudge = this.nudgeEngine.evaluate(
        metrics,
        sentiment,
        callDuration,
        playbookSnapshot?.coveragePercentage
      );

      if (nudge) {
        // Save nudge to database
        try {
          createNudge({
            id: nudge.id,
            recordingId: this.callState.recordingId,
            type: nudge.type,
            message: nudge.message,
            severity: nudge.severity,
            timestamp: callDuration,
          });
        } catch (error) {
          log.error({ error }, 'Failed to save nudge');
        }

        this.emit('nudge', { nudge });
      }
    }

    // Save metrics snapshot periodically (every minute)
    if (Math.floor(callDuration) % 60 < 10) {
      try {
        createCallMetricsSnapshot({
          id: uuid(),
          recordingId: this.callState.recordingId,
          timestamp: callDuration,
          talkRatioMe: metrics.talkRatio.me,
          talkRatioThem: metrics.talkRatio.them,
          paceWpm: metrics.pace,
          questionsAsked: metrics.questionsAsked,
          monologueDetected: metrics.monologueDetected,
          sentimentTrend: sentiment.trend,
        });
      } catch (error) {
        log.error({ error }, 'Failed to save metrics snapshot');
      }
    }
  }

  /**
   * Start context compression timer
   */
  private startCompressionTimer(): void {
    if (this.compressionTimer) return;

    this.compressionTimer = setInterval(async () => {
      await this.compressContext();
    }, this.config.compressionInterval);
  }

  /**
   * Compress older context
   */
  private async compressContext(): Promise<void> {
    if (!this.callState?.isActive) return;

    const segments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);

    // Compress segments older than 5 minutes
    const cutoffTime = (Date.now() - this.callState.startTime) / 1000 - 300;
    const oldSegments = segments.filter(s => s.endTime < cutoffTime);

    if (oldSegments.length > 20) {
      await this.contextManager.compressSegments(this.callState.sessionId, oldSegments);
    }
  }

  /**
   * End call and generate summary
   */
  async endCall(): Promise<CallSummary | null> {
    if (!this.callState) {
      log.warn('No active call to end');
      return null;
    }

    const { recordingId, sessionId, startTime } = this.callState;
    const duration = (Date.now() - startTime) / 1000;

    log.info({ recordingId, sessionId, duration }, 'Ending call');

    // Stop timers
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.compressionTimer) {
      clearInterval(this.compressionTimer);
      this.compressionTimer = null;
    }

    // Mark call as inactive
    this.callState.isActive = false;

    // Get final segments
    const segments = this.transcriptBuffer.getFinalSegments(sessionId);

    // Calculate final metrics
    const metrics = this.metricsService.calculate(segments, duration);

    // Finalize playbook
    const playbookSnapshot = await this.playbookTracker.finalize();

    // Generate summary
    let summary: CallSummary;
    try {
      summary = await this.summaryGenerator.generate(segments);
    } catch (error) {
      log.error({ error }, 'Failed to generate summary');
      summary = {
        bullets: [],
        customerPain: [],
        customerGoals: [],
        objections: [],
        commitments: [],
        nextSteps: [],
        keyDecisions: [],
        riskFlags: ['Summary generation failed'],
        generatedAt: Date.now(),
      };
    }

    // Save to database
    try {
      updateRecording(recordingId, {
        callSummary: JSON.stringify(summary),
        playbookSnapshot: playbookSnapshot ? JSON.stringify(playbookSnapshot) : undefined,
        metricsSnapshot: JSON.stringify(metrics),
        duration: Math.round(duration),
      });
    } catch (error) {
      log.error({ error }, 'Failed to save call data');
    }

    // Emit end event
    this.emit('call-ended', {
      summary,
      playbook: playbookSnapshot || undefined,
      metrics,
      duration,
    });

    // Cleanup
    this.transcriptBuffer.clear(sessionId);
    this.contextManager.clear(sessionId);
    this.playbookTracker.reset();
    this.callState = null;

    return summary;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CopilotConfig>): void {
    this.config = { ...this.config, ...config };

    // Update nudge engine
    this.nudgeEngine.setEnabled(this.config.enableNudges);
  }

  /**
   * Get current call state
   */
  getCallState(): CallState | null {
    return this.callState;
  }

  /**
   * Check if call is active
   */
  isCallActive(): boolean {
    return this.callState?.isActive ?? false;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): ConversationMetrics | null {
    if (!this.callState?.isActive) return null;

    const segments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);
    const callDuration = (Date.now() - this.callState.startTime) / 1000;
    return this.metricsService.calculate(segments, callDuration);
  }

  /**
   * Get current playbook snapshot
   */
  getPlaybookSnapshot(): PlaybookSnapshot | null {
    return this.playbookTracker.getSnapshot();
  }

  /**
   * Get current sentiment
   */
  getCurrentSentiment(): SentimentTrend | null {
    if (!this.callState?.isActive) return null;

    const segments = this.transcriptBuffer.getFinalSegments(this.callState.sessionId);
    return this.sentimentAnalyzer.getSentimentTrend(segments);
  }

  /**
   * Dismiss a cue card
   */
  dismissCueCard(triggerId: string): void {
    this.cueCardEngine.updateTriggerStatus(triggerId, 'dismissed');
  }

  /**
   * Pin a cue card
   */
  pinCueCard(triggerId: string): void {
    this.cueCardEngine.updateTriggerStatus(triggerId, 'pinned');
  }

  /**
   * Submit cue card feedback
   */
  submitCueCardFeedback(triggerId: string, feedback: 'helpful' | 'wrong' | 'irrelevant'): void {
    this.cueCardEngine.submitFeedback(triggerId, feedback);
  }

  /**
   * Dismiss a nudge
   */
  dismissNudge(nudgeId: string): void {
    // Nudges are already tracked in history, nothing to update
    log.info({ nudgeId }, 'Nudge dismissed');
  }
}

// Singleton Instance

let instance: SalesCopilotService | null = null;

export function getSalesCopilot(config?: Partial<CopilotConfig>): SalesCopilotService {
  if (!instance) {
    instance = new SalesCopilotService(config);
  }
  return instance;
}

export function resetSalesCopilot(): void {
  instance = null;
}

export default SalesCopilotService;
