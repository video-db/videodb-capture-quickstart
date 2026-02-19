"""
Try Without Setup - Monitor a Live OpenClaw Agent Instantly

VideoDB hosts a live OpenClaw agent at matrix.videodb.io. This script connects
directly to its RTSP streams (audio + screen), starts real-time transcription,
audio/visual indexing, then prints all events via WebSocket.
Automatically stops after 5 minutes.

No EC2 instance, no OpenClaw installation, no Capture SDK needed — just a
VIDEO_DB_API_KEY in your .env file.

Usage:
    uv run try_without_setup.py
"""

import os
import json
import signal
import asyncio
import traceback
from datetime import datetime
from dotenv import load_dotenv
import videodb

load_dotenv()

# --- Config ---
VIDEO_DB_API_KEY = os.getenv("VIDEO_DB_API_KEY")
AUDIO_RTSP_URL = "rtsp://matrix.videodb.io:8554/audio"
SCREEN_RTSP_URL = "rtsp://matrix.videodb.io:8554/screen"

DEFAULT_AUDIO_INDEX_PROMPT = "Summarize the audio content. Extract any speech verbatim."

DEFAULT_VISUAL_INDEX_PROMPT = "In one sentence, describe the active application and what the agent is doing on screen. Note the current time if a clock is visible."

HARD_STOP_SECONDS = 5 * 60  # 5 minutes

if not VIDEO_DB_API_KEY:
    raise ValueError("VIDEO_DB_API_KEY not set in .env")

# --- Pretty printing helpers ---
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
MAGENTA = "\033[35m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"

ICONS = {
    "transcript": f"{CYAN}🎙 ",
    "audio_index": f"{MAGENTA}🔊",
    "visual_index": f"{GREEN}👁 ",
    "unknown": f"{DIM}📡",
}


def ts():
    return datetime.now().strftime("%H:%M:%S")


def header(title):
    width = 60
    print(f"\n{BOLD}{CYAN}{'─' * width}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─' * width}{RESET}")


def step(label, value="", ok=True):
    icon = f"{GREEN}✓{RESET}" if ok else f"{YELLOW}…{RESET}"
    print(f"  {icon} {BOLD}{label}{RESET}  {DIM}{value}{RESET}")



async def listen_ws(ws):
    """Listen for all WebSocket events on a single connection and print them."""
    try:
        async for msg in ws.receive():
            channel = msg.get("channel", "unknown")
            if channel == "capture_session":
                continue
            data = msg.get("data", msg)
            text = data.get("text", "") if isinstance(data, dict) else ""
            icon = ICONS.get(channel, ICONS["unknown"])
            time = f"{DIM}{ts()}{RESET}"

            if channel == "transcript":
                if not data.get("is_final", False):
                    continue
                print(f"  {time}  {icon} TRANSCRIPT{RESET}  {text}")

            elif channel == "audio_index":
                print(f"  {time}  {icon} AUDIO INDEX{RESET}  {text}")

            elif channel in ("scene_index", "visual_index"):
                print(f"  {time}  {icon} VISUAL INDEX{RESET}  {text}")

            else:
                raw = json.dumps(msg, indent=2, default=str)
                if len(raw) > 300:
                    raw = raw[:300] + "..."
                print(f"  {time}  {icon} {channel}{RESET}  {raw}")

    except Exception as e:
        print(f"\n  {RED}WebSocket error: {e}{RESET}")
        traceback.print_exc()


def interactive_search(screen_stream):
    """Interactive search over indexed visual content."""
    header("Search Indexed Content")
    print(f"  {DIM}Search the visual index built during this session.{RESET}")
    while True:
        try:
            query = input(f"  {CYAN}search (empty to exit):{RESET} ").strip()
            if not query:
                break

            print(f"\n  {DIM}Searching...{RESET}")
            results = screen_stream.search(query=query, result_threshold=5)
            shots = results.get_shots()

            if shots:
                print(f"  {GREEN}{BOLD}Found {len(shots)} result(s):{RESET}\n")
                for i, shot in enumerate(shots, 1):
                    score = f"score={shot.search_score:.2f}" if shot.search_score else ""
                    print(f"  {BOLD}{i}.{RESET} [{shot.start:.0f}s - {shot.end:.0f}s]  {DIM}{score}{RESET}")
                    print(f"     {shot.text}")
                    shot.generate_stream()
                    if shot.stream_url:
                        print(f"     {DIM}player: http://console.videodb.io/player?url={shot.stream_url}{RESET}")
                    print()
            else:
                print(f"  {DIM}No results.{RESET}\n")

        except Exception as e:
            print(f"  {RED}Search error: {e}{RESET}\n")


async def main():
    header("OpenClaw Live Monitor")

    # --- Connect ---
    print(f"\n  {DIM}Connecting to VideoDB...{RESET}")
    conn = videodb.connect(api_key=VIDEO_DB_API_KEY)
    coll = conn.get_collection()
    step("Connected", f"Collection: {coll.id}")

    # --- WebSocket ---
    ws = conn.connect_websocket()
    ws = await ws.connect()
    step("WebSocket", ws.connection_id)

    # --- RTSP Streams: reuse existing or create new ---
    header("Connecting RTSP Streams")

    audio_stream = coll.connect_rtstream(
        url=AUDIO_RTSP_URL,
        name="Matrix Agent Audio",
        media_types=["audio"],
    )
    step("Audio stream", f"{audio_stream.id}  status={audio_stream.status}")

    screen_stream = coll.connect_rtstream(
        url=SCREEN_RTSP_URL,
        name="Matrix Agent Screen",
        media_types=["video"],
    )
    step("Screen stream", f"{screen_stream.id}  status={screen_stream.status}")

    # --- Customize prompts ---
    header("AI Pipeline Prompts")
    print(f"  {DIM}Press Enter to keep defaults, or type a custom prompt.{RESET}\n")

    print(f"  {BOLD}Audio Indexing{RESET} — interprets system audio (speech, music, media)")
    print(f"  {DIM}Default: {DEFAULT_AUDIO_INDEX_PROMPT}{RESET}")
    custom = input(f"  {CYAN}▸{RESET} Custom prompt: ").strip()
    audio_index_prompt = custom if custom else DEFAULT_AUDIO_INDEX_PROMPT
    print()

    print(f"  {BOLD}Visual Indexing{RESET} — describes agent screen activity")
    print(f"  {DIM}Default: {DEFAULT_VISUAL_INDEX_PROMPT}{RESET}")
    custom = input(f"  {CYAN}▸{RESET} Custom prompt: ").strip()
    visual_index_prompt = custom if custom else DEFAULT_VISUAL_INDEX_PROMPT
    print()

    # --- Start pipelines ---
    header("Starting AI Pipelines")

    audio_stream.start_transcript(ws_connection_id=ws.connection_id)
    step("Transcript started")

    audio_stream.index_audio(
        prompt=audio_index_prompt,
        batch_config={"type": "time", "value": 5},
        ws_connection_id=ws.connection_id,
    )
    step("Audio indexing started", "5s window")

    screen_stream.index_visuals(
        prompt=visual_index_prompt,
        batch_config={"type": "time", "value": 5, "frame_count": 1},
        ws_connection_id=ws.connection_id,
    )
    step("Visual indexing started", "5s window, 1 frames")

    # --- Live events ---
    header("Live Events")
    print(f"  {DIM}Listening for real-time events... (Ctrl+C or auto-stop in {HARD_STOP_SECONDS // 60} min){RESET}\n")

    # Graceful shutdown
    stop_event = asyncio.Event()

    def on_signal():
        print(f"\n  {YELLOW}Shutting down...{RESET}")
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, on_signal)

    ws_task = asyncio.create_task(listen_ws(ws))
    stop_task = asyncio.create_task(stop_event.wait())
    timeout_task = asyncio.create_task(asyncio.sleep(HARD_STOP_SECONDS))

    done, pending = await asyncio.wait(
        [ws_task, stop_task, timeout_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    if timeout_task in done:
        print(f"\n  {YELLOW}Hard stop: {HARD_STOP_SECONDS // 60} minute limit reached.{RESET}")

    for task in pending:
        task.cancel()

    # Interactive search over indexed content
    interactive_search(screen_stream)

    # Cleanup
    header("Cleanup")
    for name, stream in [("Audio", audio_stream), ("Screen", screen_stream)]:
        try:
            stream.stop()
            step(f"{name} stream stopped")
        except Exception as e:
            step(f"{name} stream error", str(e), ok=False)

    try:
        await ws.close()
    except Exception:
        pass

    print(f"\n  {GREEN}Done.{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main())
