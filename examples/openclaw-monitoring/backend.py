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

load_dotenv()

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---

VIDEO_DB_API_KEY = os.getenv("VIDEO_DB_API_KEY")
PORT = 5002

if not VIDEO_DB_API_KEY:
    raise ValueError("VIDEO_DB_API_KEY environment variable not set")

conn = None
public_url = None

# --- Alert Configuration ---
# Customize these alerts for your OpenClaw monitoring use case.
# Each alert defines a condition to watch for on the agent's screen.

ALERTS = [
    {
        "label": "agent-error",
        "prompt": (
            "The screen is showing an error dialog, crash report, exception traceback, "
            "or any kind of failure message. This includes application errors, system alerts "
            "about an app not responding, or terminal output with error messages."
        ),
    },
    {
        "label": "browser-open",
        "prompt": (
            "A web browser window (such as Chrome, Firefox, Safari, or Edge) is open "
            "and visible on screen. The browser could be showing any webpage, search "
            "results, documentation, or any other web content."
        ),
    },
]


# --- Initialization ---

def setup():
    global conn, public_url
    print("Connecting to VideoDB...")
    conn = videodb.connect(api_key=VIDEO_DB_API_KEY)

    print(f"Starting Cloudflare Tunnel on port {PORT}...")
    tunnel = try_cloudflare(port=PORT)
    public_url = tunnel.tunnel
    print(f"Cloudflare Tunnel Started: {public_url}")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "tunnel": public_url})


@app.route("/init-session", methods=["POST"])
def init_session():
    """Creates a capture session and returns a client token."""
    try:
        webhook_url = f"{public_url}/webhook"
        print(f"Creating session with webhook: {webhook_url}")

        session = conn.create_capture_session(
            end_user_id="quickstart-user",
            collection_id="default",
            callback_url=webhook_url,
            metadata={"app": "openclaw-monitoring"},
        )

        token = conn.generate_client_token()

        return jsonify(
            {"session_id": session.id, "token": token, "webhook_url": webhook_url}
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        return jsonify({"error": str(e)}), 500


# --- WebSocket Listener ---
# Each WebSocket needs its own asyncio event loop for receiving messages.
# We run each in a daemon thread so the Flask request handler doesn't block.

def start_ws_listener(ws_id_queue, name="Listener"):
    """Starts a background thread that listens for real-time AI results via WebSocket."""

    def run():
        async def listen():
            try:
                print(f"[{name}] Connecting to WebSocket...")
                ws_wrapper = conn.connect_websocket()
                ws = await ws_wrapper.connect()
                ws_id = ws.connection_id
                print(f"[{name}] Connected! ID: {ws_id}")

                ws_id_queue.put(ws_id)

                async for msg in ws.receive():
                    channel = msg.get("channel")
                    if channel == "capture_session":
                        continue
                    data = msg.get("data", {})

                    # Only show final transcript segments
                    if channel == "transcript":
                        if not data.get("is_final", False):
                            continue
                        text = data.get("text", "")
                        if text.strip():
                            print(f"[{name}] Transcript: {text}")

                    elif channel == "audio_index":
                        text = data.get("text", "")
                        if text.strip():
                            print(f"\n{'*' * 50}")
                            print(f"[{name}] Audio Index: {text}")
                            print(f"{'*' * 50}")

                    elif channel in ["scene_index", "visual_index"]:
                        text = data.get("text", "")
                        if text.strip():
                            print(f"\n{'*' * 50}")
                            print(f"[{name}] Visual Index: {text}")
                            print(f"{'*' * 50}")

                    elif channel == "alert":
                        label = data.get("label", "")
                        confidence = data.get("confidence", "")
                        text = data.get("text", "")
                        print(f"\n{'!' * 50}")
                        print(f"[{name}] ALERT [{label}] confidence={confidence}")
                        if text:
                            print(f"  {text}")
                        print(f"{'!' * 50}")

            except Exception as e:
                print(f"[{name}] Error: {e}")
                traceback.print_exc()

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(listen())

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


def setup_alerts(visual_index, ws_id):
    """Creates alert events and attaches them to the visual index."""
    for alert_config in ALERTS:
        label = alert_config["label"]
        prompt = alert_config["prompt"]

        # Reuse existing event if one with the same label exists
        existing_events = conn.list_events()
        event_id = None
        for ev in existing_events:
            if ev.get("label") == label:
                event_id = ev.get("event_id")
                print(f"  Reusing event: {label} (id={event_id})")
                break

        if not event_id:
            event_id = conn.create_event(event_prompt=prompt, label=label)
            print(f"  Created event: {label} (id={event_id})")

        alert_id = visual_index.create_alert(
            event_id=event_id,
            callback_url=f"{public_url}/webhook",
            ws_connection_id=ws_id,
        )
        print(f"  Alert attached: {label} (alert_id={alert_id})")


# --- Webhook Handler & AI Pipelines ---

@app.route("/webhook", methods=["POST"])
def webhook():
    """Receives webhook events from VideoDB and starts AI pipelines."""
    data = request.json
    event = data.get("event")

    if event is None:
        print("\n[WEBHOOK] Received event with no type")
        print(f"  Payload: {data}")
        return jsonify({"received": True})

    print(f"\n[WEBHOOK] Event: {event}")

    if event not in [
        "capture_session.active",
        "capture_session.stopping",
        "capture_session.stopped",
        "capture_session.exported",
    ]:
        return jsonify({"received": True})

    if event == "capture_session.active":
        print("Capture Session Active! Starting AI pipelines...")
        capture_session_id = data.get("capture_session_id")

        try:
            session = conn.get_capture_session(capture_session_id)
            print(f"Retrieved Session: {session.id}")

            displays = session.get_rtstream("screen")
            system_audios = session.get_rtstream("system_audio")

            print(
                f"  System Audio: {len(system_audios)} | Displays: {len(displays)}"
            )

            # Start AI on System Audio
            if system_audios:
                sys_audio = system_audios[0]
                print(f"  Indexing system audio: {sys_audio.id}")

                q = queue.Queue()
                start_ws_listener(q, name="SystemAudioWatcher")
                ws_id = q.get(timeout=10)

                sys_audio.start_transcript(ws_connection_id=ws_id)
                sys_audio.index_audio(
                    prompt="Summarize the audio content.",
                    ws_connection_id=ws_id,
                    batch_config={"type": "time", "value": 30},
                )
                print(f"  System Audio indexing started (socket: {ws_id})")

            # Start AI on Displays
            if displays:
                display = displays[0]
                print(f"  Indexing display: {display.id}")

                q = queue.Queue()
                start_ws_listener(q, name="VisualWatcher")
                ws_id = q.get(timeout=10)

                visual_index = display.index_visuals(
                    prompt="In one sentence, describe the active application and what the agent is doing on screen. Note the current time if a clock is visible.",
                    ws_connection_id=ws_id,
                )
                print(f"  Visual indexing started (socket: {ws_id})")

                # Set up OpenClaw-specific alerts
                print("  Setting up alerts...")
                setup_alerts(visual_index, ws_id)

        except Exception as e:
            print(f"Error in webhook processing: {e}")
            traceback.print_exc()

    elif event == "capture_session.stopping":
        print("Session stopping...")

    elif event == "capture_session.stopped":
        print("Session stopped. All streams finalized.")

    elif event == "capture_session.exported":
        export_data = data.get("data", {})
        video_id = export_data.get("exported_video_id")
        stream_url = export_data.get("stream_url")
        player_url = export_data.get("player_url")

        print(f"\nRecording Exported! Video ID: {video_id}")
        if stream_url:
            print(f"  Stream URL: {stream_url}")
        if player_url:
            print(f"  Player URL: {player_url}")

    return jsonify({"received": True})


if __name__ == "__main__":
    setup()
    app.run(port=PORT)
