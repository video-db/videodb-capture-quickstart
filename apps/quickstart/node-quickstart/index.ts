import 'dotenv/config';
import {
  connect,
  WebSocketChannel,
  type ChannelConfig,
} from 'videodb';
import { CaptureClient } from 'videodb/capture';

const API_KEY = process.env.VIDEODB_API_KEY;
const COLLECTION_ID = process.env.VIDEODB_COLLECTION_ID || 'default';

if (!API_KEY) {
  throw new Error('VIDEODB_API_KEY is required. Set it in your .env file.');
}

async function main() {
  console.log('============================================================');
  console.log('VideoDB Capture - Node.js Quickstart');
  console.log('============================================================\n');

  // --- Connect ---
  console.log('Connecting to VideoDB...');
  const conn = connect({ apiKey: API_KEY });
  const coll = await conn.getCollection(COLLECTION_ID);
  console.log(`Using collection: ${coll.id}`);

  // --- WebSocket ---
  console.log('Connecting WebSocket...');
  const ws = await conn.connectWebsocket(COLLECTION_ID);
  await ws.connect();
  // Multiple AI pipelines share this WebSocket, so raise the listener limit
  (ws as any).setMaxListeners?.(20);
  console.log(`WebSocket connected: ${ws.connectionId}`);

  // --- Session ---
  console.log('Creating capture session...');
  const session = await coll.createCaptureSession({
    endUserId: 'quickstart-user',
    wsConnectionId: ws.connectionId,
    metadata: { app: 'node-quickstart' },
  });
  console.log(`Session created: ${session.id}`);

  const token = await conn.generateClientToken(3600);
  console.log('Client token generated');

  // --- Capture Client ---
  const client = new CaptureClient({ sessionToken: token });

  console.log('\nRequesting permissions...');
  await client.requestPermission('microphone');
  await client.requestPermission('screen-capture');

  console.log('Discovering channels...');
  const channels = await client.listChannels();
  for (const ch of channels.all()) {
    console.log(`  - ${ch.id} (${ch.type}): ${ch.name}`);
  }

  const micChannel = channels.mics.default;
  const displayChannel = channels.displays.default;
  const systemAudioChannel = channels.systemAudio.default;

  // record: true saves the recording to VideoDB after capture stops.
  // Without this, streams are processed in real-time but not persisted.
  const captureChannels: ChannelConfig[] = [];
  if (micChannel) {
    captureChannels.push({
      channelId: micChannel.id,
      type: 'audio',
      record: true,
      transcript: true,
    });
  }
  if (displayChannel) {
    captureChannels.push({
      channelId: displayChannel.id,
      type: 'video',
      record: true,
    });
  }
  if (systemAudioChannel) {
    captureChannels.push({
      channelId: systemAudioChannel.id,
      type: 'audio',
      record: true,
      transcript: true,
    });
  }

  if (captureChannels.length === 0) {
    console.log('No channels found.');
    return;
  }

  console.log(
    `\nStarting capture with ${captureChannels.length} channel(s):`
  );
  for (const ch of captureChannels) {
    console.log(`  - ${ch.channelId}`);
  }

  await client.startSession({
    sessionId: session.id,
    channels: captureChannels,
  });
  console.log('Capture started!');

  // --- AI Pipelines ---
  console.log('\nWaiting for session to become active...');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await session.refresh();
  console.log(`Session status: ${session.status}`);

  const audioStreams = session.rtstreams.filter((rts) =>
    rts.mediaTypes?.includes('audio')
  );
  const videoStream = session.rtstreams.find((rts) =>
    rts.mediaTypes?.includes('video')
  );

  // Start AI on audio streams (mic + system audio)
  for (const stream of audioStreams) {
    console.log(`  Starting audio indexing on: ${stream.id}`);
    try {
      await stream.indexAudio({
        prompt: 'Summarize what is being discussed',
        batchConfig: { type: 'time', value: 30 },
        socketId: ws.connectionId,
      });
      console.log(`  Audio indexing started: ${stream.id}`);
    } catch (e) {
      console.error(`  Failed to start audio indexing on ${stream.id}:`, e);
    }
  }

  // Start AI on video stream
  if (videoStream) {
    console.log(`  Starting visual indexing on: ${videoStream.id}`);
    try {
      await videoStream.indexVisuals({
        prompt: 'In one sentence, describe what is on screen',
        batchConfig: { type: 'time', value: 3, frameCount: 3 },
        socketId: ws.connectionId,
      });
      console.log(`  Visual indexing started: ${videoStream.id}`);
    } catch (e) {
      console.error('  Failed to start visual indexing:', e);
    }
  }

  // --- Real-time Events ---
  console.log('\n============================================================');
  console.log('Recording... Press Enter to stop (or Ctrl+C to force quit)');
  console.log('============================================================\n');

  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nStopping capture...');
    try {
      await client.stopSession();
    } catch {}
    try {
      await client.shutdown();
    } catch {}
    try {
      await ws.close();
    } catch {}

    console.log('Capture stopped.');
    console.log('\n============================================================');
    console.log("What's next?");
    console.log(
      '  - Try different indexAudio() prompts for richer insights'
    );
    console.log('  - Build alerts with rtstream.createAlert()');
    console.log('  - Explore the full SDK: https://docs.videodb.io');
    console.log('============================================================');
    process.exit(0);
  };

  // Listen for Enter key to stop gracefully
  process.stdin.setRawMode?.(false);
  process.stdin.resume();
  process.stdin.once('data', () => shutdown());

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    for await (const msg of ws.receive()) {
      if (isShuttingDown) break;

      const channel = (msg.channel || msg.type || 'event') as string;
      const data = (msg.data || {}) as Record<string, unknown>;
      // Extract short source label from rtstream_name (e.g., "Capture mic - cap-83e6" → "mic")
      const rawSource = ((msg as Record<string, unknown>).rtstream_name || '') as string;
      const sourceMatch = rawSource.match(/Capture (\w+)/);
      const label = sourceMatch ? `:${sourceMatch[1]}` : (rawSource ? `:${rawSource}` : '');

      if (channel === WebSocketChannel.transcript) {
        const text = data.text || msg.text;
        if (text) console.log(`[Transcript${label}] ${text}`);
      } else if (channel === WebSocketChannel.spokenIndex || channel === 'audio_index') {
        const text = (data.text || msg.text) as string;
        if (text?.trim()) {
          console.log(`\n${'*'.repeat(50)}`);
          console.log(`[Audio Index${label}] ${text}`);
          console.log('*'.repeat(50));
        }
      } else if (channel === WebSocketChannel.sceneIndex || channel === 'visual_index') {
        const text = (data.text || msg.text) as string;
        if (text?.trim()) {
          console.log(`\n${'*'.repeat(50)}`);
          console.log(`[Visual Index${label}] ${text}`);
          console.log('*'.repeat(50));
        }
      } else if (channel === WebSocketChannel.captureSession) {
        const status = data.status as string;
        console.log(`\n[Session] ${status}`);
      }
    }
  } catch (e) {
    if (!isShuttingDown) {
      console.error('WebSocket error:', e);
    }
  }

  if (!isShuttingDown) {
    console.log('WebSocket connection closed unexpectedly');
    await shutdown();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
