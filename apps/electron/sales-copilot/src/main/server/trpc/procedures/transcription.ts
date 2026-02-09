import { router, protectedProcedure } from '../trpc';
import {
  StartTranscriptionInputSchema,
  StartTranscriptionOutputSchema,
} from '../../../../shared/schemas/capture.schema';
import { createChildLogger } from '../../../lib/logger';
import { loadRuntimeConfig } from '../../../lib/config';
import { connect } from 'videodb';
import type { CaptureSessionFull, RTStream } from 'videodb';

const logger = createChildLogger('transcription-procedure');

// Polling configuration (like Python meeting-copilot)
const MAX_RETRIES = 150;
const RETRY_DELAY_MS = 2000;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Background task to start real-time transcription for a capture session.
 * Polls for RTStreams to exist (they're created after capture_session.active),
 * then calls startTranscript with the provided WebSocket connection IDs.
 *
 * This mirrors the Python meeting-copilot's start_realtime_transcription_with_ws function.
 */
async function startRealtimeTranscriptionWithWs(
  captureSessionId: string,
  apiKey: string,
  micWsConnectionId?: string,
  sysAudioWsConnectionId?: string,
  apiUrl?: string
): Promise<void> {
  try {
    logger.info(
      { sessionId: captureSessionId, micWsConnectionId, sysAudioWsConnectionId },
      '[Transcript] Starting transcription for session'
    );

    // Connect to VideoDB with API key (like Python version)
    const connectOptions: { apiKey: string; baseUrl?: string } = { apiKey };
    if (apiUrl) {
      connectOptions.baseUrl = apiUrl;
    }
    const conn = connect(connectOptions);

    // Poll for capture session to have RTStreams
    let mics: RTStream[] = [];
    let systemAudios: RTStream[] = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const session: CaptureSessionFull = await conn.getCaptureSession(captureSessionId);

        if (!session) {
          logger.warn(
            { attempt: attempt + 1 },
            '[Transcript] Session not found yet'
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        logger.info(
          { attempt: attempt + 1, status: session.status },
          '[Transcript] Session status'
        );

        // Refresh to get RTStreams
        await session.refresh();

        // Try to get RTStreams by category (like Python's get_rtstream)
        mics = session.getRTStream('mics');
        systemAudios = session.getRTStream('system_audio');

        if (mics.length > 0 || systemAudios.length > 0) {
          logger.info(
            { mics: mics.length, systemAudios: systemAudios.length },
            '[Transcript] Found RTStreams'
          );
          break;
        } else {
          logger.info(
            { attempt: attempt + 1 },
            '[Transcript] No RTStreams yet, waiting...'
          );
          await sleep(RETRY_DELAY_MS);
        }
      } catch (error) {
        logger.warn(
          { attempt: attempt + 1, error },
          '[Transcript] Attempt error'
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    if (mics.length === 0 && systemAudios.length === 0) {
      logger.error(
        { maxRetries: MAX_RETRIES },
        '[Transcript] Failed to find RTStreams after max retries'
      );
      return;
    }

    // Start transcription on mic stream with WebSocket connection ID
    if (mics.length > 0 && micWsConnectionId) {
      const micStream = mics[0];
      logger.info(
        { rtstreamId: micStream.id, wsConnectionId: micWsConnectionId },
        '[Transcript] Starting transcript on mic'
      );
      await micStream.startTranscript(micWsConnectionId);
      logger.info('[Transcript] Mic transcription started');
    } else if (mics.length > 0) {
      logger.info('[Transcript] Mic stream found but no ws_connection_id provided, skipping');
    }

    // Start transcription on system audio stream with WebSocket connection ID
    if (systemAudios.length > 0 && sysAudioWsConnectionId) {
      const sysStream = systemAudios[0];
      logger.info(
        { rtstreamId: sysStream.id, wsConnectionId: sysAudioWsConnectionId },
        '[Transcript] Starting transcript on sys_audio'
      );
      await sysStream.startTranscript(sysAudioWsConnectionId);
      logger.info('[Transcript] System audio transcription started');
    } else if (systemAudios.length > 0) {
      logger.info('[Transcript] System audio stream found but no ws_connection_id provided, skipping');
    }
  } catch (error) {
    logger.error(
      { error, sessionId: captureSessionId },
      '[Transcript] Failed to start transcription'
    );
  }
}

export const transcriptionRouter = router({
  start: protectedProcedure
    .input(StartTranscriptionInputSchema)
    .output(StartTranscriptionOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const { sessionId, micWsConnectionId, sysAudioWsConnectionId } = input;

      logger.info(
        { sessionId, micWsConnectionId, sysAudioWsConnectionId },
        'Starting transcription'
      );

      // Validate that at least one WebSocket connection ID is provided
      if (!micWsConnectionId && !sysAudioWsConnectionId) {
        logger.warn({ sessionId }, 'No WebSocket connection IDs provided');
        return {
          status: 'skipped',
          sessionId,
          message: 'No WebSocket connection IDs provided, skipping transcription setup',
        };
      }

      // Get user's API key from context
      const apiKey = ctx.user?.apiKey;
      if (!apiKey) {
        logger.error({ sessionId }, 'No API key available');
        return {
          status: 'error',
          sessionId,
          message: 'No API key available for transcription',
        };
      }

      // Get apiUrl from runtime config if available
      const runtimeConfig = loadRuntimeConfig();
      const apiUrl = runtimeConfig.apiUrl;

      // Start transcription in background (like Python's background_tasks.add_task)
      // We don't await this - it runs in the background
      startRealtimeTranscriptionWithWs(
        sessionId,
        apiKey,
        micWsConnectionId,
        sysAudioWsConnectionId,
        apiUrl
      ).catch((error) => {
        logger.error({ error, sessionId }, 'Background transcription task failed');
      });

      return {
        status: 'started',
        sessionId,
        message: 'Transcription startup initiated. Will poll for RTStreams and start when ready.',
      };
    }),
});
