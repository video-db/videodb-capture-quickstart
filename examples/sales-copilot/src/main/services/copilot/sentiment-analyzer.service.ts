/**
 * Sentiment Analyzer Service
 *
 * Analyzes sentiment of customer ("them") statements to track mood trends.
 * Uses pattern-based detection for speed with optional LLM fallback.
 */

import { logger } from '../../lib/logger';
import { getLLMService } from '../llm.service';
import type { TranscriptSegmentData } from './transcript-buffer.service';

const log = logger.child({ module: 'sentiment-analyzer' });

// Types

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: number;
  signals: string[]; // Words/phrases that triggered the sentiment
}

export interface SentimentTrend {
  current: Sentiment;
  trend: 'improving' | 'stable' | 'declining';
  history: Array<{
    time: number;
    sentiment: Sentiment;
    text: string;
  }>;
  averageScore: number; // -1 to 1
}

// Sentiment Patterns

const POSITIVE_PATTERNS = [
  // Strong positive
  /\b(love|excellent|perfect|amazing|fantastic|wonderful|great|awesome|outstanding)\b/i,
  // Agreement
  /\b(yes|agree|absolutely|definitely|certainly|exactly|right|correct)\b/i,
  // Interest
  /\b(interested|exciting|impressive|sounds good|makes sense|like that|appreciate)\b/i,
  // Progress indicators
  /\b(moving forward|next step|let's do|ready to|looking forward)\b/i,
];

const NEGATIVE_PATTERNS = [
  // Strong negative
  /\b(hate|terrible|awful|horrible|worst|disappointed|frustrated|annoyed)\b/i,
  // Concerns
  /\b(concern|worried|issue|problem|difficult|complicated|expensive|costly)\b/i,
  // Disagreement
  /\b(no|disagree|don't think|not sure|doubt|skeptical|hesitant)\b/i,
  // Objections
  /\b(but|however|although|unfortunately|can't|won't|impossible)\b/i,
  // Delays
  /\b(not now|later|maybe|perhaps|need to think|not ready|busy)\b/i,
];

const QUESTION_WEIGHT = -0.1; // Questions are slightly negative (indicate uncertainty)

// Sentiment Analyzer Service

export class SentimentAnalyzerService {
  private cache: Map<string, Sentiment> = new Map(); // segmentId -> sentiment
  private useLLMFallback: boolean = true;

  constructor(useLLMFallback: boolean = true) {
    this.useLLMFallback = useLLMFallback;
  }

  /**
   * Analyze sentiment of a single text (fast, pattern-based)
   */
  analyze(text: string): SentimentResult {
    const signals: string[] = [];
    let score = 0;

    // Check positive patterns
    for (const pattern of POSITIVE_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        score += 0.3;
        signals.push(matches[0]);
      }
    }

    // Check negative patterns
    for (const pattern of NEGATIVE_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        score -= 0.3;
        signals.push(matches[0]);
      }
    }

    // Questions indicate uncertainty
    if (/\?/.test(text)) {
      score += QUESTION_WEIGHT;
    }

    // Normalize score to -1 to 1
    score = Math.max(-1, Math.min(1, score));

    // Determine sentiment
    let sentiment: Sentiment;
    if (score > 0.15) {
      sentiment = 'positive';
    } else if (score < -0.15) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }

    return {
      sentiment,
      confidence: Math.abs(score),
      signals,
    };
  }

  /**
   * Analyze sentiment using LLM for ambiguous cases
   */
  async analyzeWithLLM(text: string): Promise<SentimentResult> {
    const llm = getLLMService();

    const prompt = `Analyze the sentiment of this customer statement in a sales call.

Statement: "${text}"

Respond with JSON:
{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "signals": ["key words or phrases"]
}`;

    try {
      const response = await llm.completeJSON<{
        sentiment: Sentiment;
        confidence: number;
        reasoning: string;
        signals: string[];
      }>(prompt, 'You are a sentiment analysis expert. Return valid JSON only.');

      if (response.success && response.data) {
        return {
          sentiment: response.data.sentiment || 'neutral',
          confidence: response.data.confidence || 0.5,
          signals: response.data.signals || [],
        };
      }
    } catch (error) {
      log.warn({ error }, 'LLM sentiment analysis failed, using pattern-based');
    }

    // Fallback to pattern-based
    return this.analyze(text);
  }

  /**
   * Analyze a segment with caching
   */
  analyzeSegment(segment: TranscriptSegmentData): SentimentResult {
    // Check cache
    const cached = this.cache.get(segment.id);
    if (cached) {
      return { sentiment: cached, confidence: 0.8, signals: [] };
    }

    const result = this.analyze(segment.text);

    // Cache result
    this.cache.set(segment.id, result.sentiment);

    return result;
  }

  /**
   * Get sentiment trend from recent customer segments
   */
  getSentimentTrend(segments: TranscriptSegmentData[]): SentimentTrend {
    // Filter to customer ("them") segments only
    const themSegments = segments
      .filter(s => s.isFinal && s.channel === 'them')
      .slice(-15); // Last 15 customer statements

    if (themSegments.length === 0) {
      return {
        current: 'neutral',
        trend: 'stable',
        history: [],
        averageScore: 0,
      };
    }

    // Build history
    const history: SentimentTrend['history'] = [];
    let totalScore = 0;

    for (const segment of themSegments) {
      const result = this.analyzeSegment(segment);
      history.push({
        time: segment.startTime,
        sentiment: result.sentiment,
        text: segment.text.substring(0, 100),
      });

      // Convert to score
      if (result.sentiment === 'positive') totalScore += 1;
      else if (result.sentiment === 'negative') totalScore -= 1;
    }

    const averageScore = totalScore / themSegments.length;

    // Compare recent vs earlier
    const recentCount = Math.min(5, history.length);
    const recent = history.slice(-recentCount);
    const earlier = history.slice(0, recentCount);

    const recentScore = this.calculateAverageScore(recent.map(h => h.sentiment));
    const earlierScore = this.calculateAverageScore(earlier.map(h => h.sentiment));

    // Determine trend
    let trend: SentimentTrend['trend'] = 'stable';
    if (recentScore > earlierScore + 0.3) {
      trend = 'improving';
    } else if (recentScore < earlierScore - 0.3) {
      trend = 'declining';
    }

    // Current sentiment is the most recent
    const current = history.length > 0
      ? history[history.length - 1].sentiment
      : 'neutral';

    return {
      current,
      trend,
      history,
      averageScore,
    };
  }

  /**
   * Calculate average sentiment score from sentiment values
   */
  private calculateAverageScore(sentiments: Sentiment[]): number {
    if (sentiments.length === 0) return 0;

    const scores: number[] = sentiments.map(s => {
      if (s === 'positive') return 1;
      if (s === 'negative') return -1;
      return 0;
    });

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Check if sentiment is concerning (needs attention)
   */
  isConcerning(trend: SentimentTrend): boolean {
    return (
      trend.current === 'negative' ||
      trend.trend === 'declining' ||
      trend.averageScore < -0.3
    );
  }

  /**
   * Get a human-readable summary
   */
  getSentimentSummary(trend: SentimentTrend): string {
    if (trend.history.length === 0) {
      return 'Not enough data';
    }

    const trendText = {
      improving: 'improving',
      stable: 'stable',
      declining: 'declining',
    }[trend.trend];

    const currentText = {
      positive: 'positive',
      neutral: 'neutral',
      negative: 'concerned',
    }[trend.current];

    return `Customer sentiment is ${currentText} and ${trendText}`;
  }

  /**
   * Clear cache for a session
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton Instance

let instance: SentimentAnalyzerService | null = null;

export function getSentimentAnalyzer(): SentimentAnalyzerService {
  if (!instance) {
    instance = new SentimentAnalyzerService();
  }
  return instance;
}

export function resetSentimentAnalyzer(): void {
  instance = null;
}

export default SentimentAnalyzerService;
