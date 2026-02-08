import os
import logging
import threading
import queue
import asyncio
import traceback
from flask import Flask, request, jsonify
from pycloudflared import try_cloudflare
from dotenv import load_dotenv
import videodb
from videodb._constants import RTStreamChannelType

# Load environment variables
load_dotenv()

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
VIDEO_DB_API_KEY = os.getenv("VIDEO_DB_API_KEY")
PORT = 5002

if not VIDEO_DB_API_KEY:
    raise ValueError("VIDEO_DB_API_KEY environment variable not set")

conn = None
public_url = None


def init_app():
    global conn, public_url
    print("🔌 Connecting to VideoDB...")
    conn = videodb.connect(api_key=VIDEO_DB_API_KEY)

    # Start Cloudflare Tunnel
    print(f"🚇 Starting Cloudflare Tunnel on port {PORT}...")
    tunnel = try_cloudflare(port=PORT)
    public_url = tunnel.tunnel
    print(f"✅ Cloudflare Tunnel Started: {public_url}")


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "tunnel": public_url})


@app.route("/init-session", methods=["POST"])
def init_session():
    """Creates a session and returns a token."""
    try:
        # Generate a callback URL for this session
        callback_url = f"{public_url}/callback"
        print(f"✨ Creating session with Callback: {callback_url}")

        # Create capture session
        session = conn.create_capture_session(
            end_user_id="user_quickstart_demo",
            collection_id="default",
            callback_url=callback_url,
            metadata={"app": "python-quickstart-demo"},
        )

        # Generate a token for the desktop client
        token = conn.generate_client_token()

        return jsonify(
            {"session_id": session.id, "token": token, "callback_url": callback_url}
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        return jsonify({"error": str(e)}), 500


def start_ws_listener(result_queue, name="Listener"):
    """Starts a background thread that connects to WS and listens for events."""

    def run():
        async def listen():
            try:
                print(f"[{name}] Connecting to WebSocket...")
                ws_wrapper = conn.connect_websocket()
                ws = await ws_wrapper.connect()
                ws_id = ws.connection_id
                print(f"[{name}] ✅ Connected! ID: {ws_id}")

                # Send ID back to main thread
                result_queue.put(ws_id)

                # Listen for messages
                async for msg in ws.receive():
                    channel = msg.get("channel")
                    data = msg.get("data", {})

                    if channel == "transcript":
                        text = data.get("text", "")
                        if text.strip():
                            print(f"\n[{name}] 📝 Transcript: {text}")
                    elif channel == "audio_index":
                        text = data.get("text", "")
                        if text.strip():
                            print(f"\n[{name}] 🧠 Audio Index: {text}")
                    elif channel in ["scene_index", "visual_index"]:
                        text = data.get("text", "")
                        if text.strip():
                            print(f"\n[{name}] 👁️ Visual Index: {text}")

            except Exception as e:
                print(f"[{name}] ❌ Error: {e}")
                traceback.print_exc()

        # Each thread needs its own loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(listen())

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


@app.route("/callback", methods=["POST"])
def callback():
    """Receives and logs callbacks."""
    data = request.json
    event = data.get("event")

    # Handle None or missing event
    if event is None:
        print("\n🔔 [WEBHOOK] Received webhook with no event field")
        print(f"   Full payload: {data}")
        return jsonify({"received": True})

    # Log ALL events for debugging
    print(f"\n🔔 [WEBHOOK] Event: {event}")

    # Filter for AI pipeline processing and cleanup tracking
    if event not in [
        "capture_session.active",
        "capture_session.stopping",
        "capture_session.stopped",
        "capture_session.exported",
    ]:
        return jsonify({"received": True})

    if event == "capture_session.active":
        print("⚡️ Capture Session Active! Starting AI pipelines...")
        cap_id = data.get("capture_session_id")

        try:
            # 1. Get the session
            cap = conn.get_capture_session(cap_id)
            print(f"📄 Retrieved Session: {cap.id}")

            # 2. Get streams by category
            mics = cap.get_rtstream(RTStreamChannelType.mic)
            displays = cap.get_rtstream(RTStreamChannelType.screen)
            system_audios = cap.get_rtstream(RTStreamChannelType.system_audio)

            print(
                f"   🎤 Mics: {len(mics)} | 🔊 System Audio: {len(system_audios)} | 📺 Displays: {len(displays)}"
            )

            # 3. Start AI on Microphone (Prioritized for Voice Interaction)
            if mics:
                mic = mics[0]
                print(f"   🎤 Indexing microphone: {mic.id}")

                # Start a WS listener for this stream
                q = queue.Queue()
                start_ws_listener(q, name="AudioWatcher")
                ws_id = q.get(timeout=10)

                mic.start_transcript(ws_connection_id=ws_id)
                mic.index_audio(
                    prompt="Extract key decisions and action items",
                    ws_connection_id=ws_id,
                )
                print(f"   ✅ Mic indexing started (socket: {ws_id})")

            # 4. Start AI on System Audio (Fallback)
            elif system_audios:
                sys_audio = system_audios[0]
                print(f"   🔊 Indexing system audio: {sys_audio.id}")

                # Start a WS listener for this stream
                q = queue.Queue()
                start_ws_listener(q, name="SysAudioWatcher")
                ws_id = q.get(timeout=10)

                sys_audio.start_transcript(ws_connection_id=ws_id)
                sys_audio.index_audio(
                    prompt="Extract key decisions and action items",
                    ws_connection_id=ws_id,
                )
                print(f"   ✅ System Audio indexing started (socket: {ws_id})")

            # 4. Start AI on Displays
            if displays:
                display = displays[0]
                print(f"   📺 Indexing display: {display.id}")

                # Start a WS listener for this stream
                q = queue.Queue()
                start_ws_listener(q, name="VisualWatcher")
                ws_id = q.get(timeout=10)

                display.index_visuals(
                    prompt="Describe what the user is doing on screen",
                    ws_connection_id=ws_id,
                )
                print(f"   ✅ Visual indexing started (socket: {ws_id})")

        except Exception as e:
            print(f"❌ Error in callback processing: {e}")
            traceback.print_exc()

    elif event == "capture_session.stopping":
        print("⏸️  Session stopping... (client initiated shutdown)")

    elif event == "capture_session.stopped":
        print("🛑 Session stopped successfully!")
        print("   All streams have been finalized.")

    elif event == "capture_session.exported":
        video_id = data.get("data", {}).get("exported_video_id")
        print(f"✅ Recording Exported! Video ID: {video_id}")
        print(f"   View at: https://console.videodb.io/player?video={video_id}")

    return jsonify({"received": True})


if __name__ == "__main__":
    init_app()
    app.run(port=PORT)
