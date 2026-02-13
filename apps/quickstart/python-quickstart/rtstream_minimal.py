import asyncio
import signal
import videodb
from dotenv import load_dotenv

load_dotenv()

AUDIO_URL = "rtsp://matrix.videodb.io:8554/audio"
SCREEN_URL = "rtsp://matrix.videodb.io:8554/screen"


async def main():
    conn = videodb.connect()
    coll = conn.get_collection()
    print(f"connected to collection: {coll.id}")

    ws = conn.connect_websocket()
    ws = await ws.connect()

    # Connect streams
    audio = coll.connect_rtstream(url=AUDIO_URL, name="Audio", media_types=["audio"])
    screen = coll.connect_rtstream(url=SCREEN_URL, name="Screen", media_types=["video"])
    print(f"audio stream:  {audio.id} ({audio.status})")
    print(f"screen stream: {screen.id} ({screen.status})")

    # Start pipelines
    audio.start_transcript(ws_connection_id=ws.connection_id)
    print("transcript started")

    audio.index_audio(
        prompt="Summarize what is being said or heard.",
        batch_config={"type": "time", "value": 30},
        ws_connection_id=ws.connection_id,
    )
    print("audio indexing started (30s window)")

    screen.index_visuals(
        prompt="In one sentence, describe the active application and what the agent is doing on screen. Note the current time if a clock is visible.",
        batch_config={"type": "time", "value": 30, "frame_count": 5},
        ws_connection_id=ws.connection_id,
    )
    print("visual indexing started (30s window, 5 frames)")

    # Listen for events — Ctrl+C to stop
    print("\nlistening for events...\n")
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_event_loop().add_signal_handler(sig, stop.set)

    async def listen():
        async for msg in ws.receive():
            ch = msg.get("channel", "?")
            if ch == "capture_session":
                continue
            data = msg.get("data", msg)
            if ch == "transcript" and not data.get("is_final", False):
                continue
            text = data.get("text", "") if isinstance(data, dict) else ""
            print(f"  [{ch}] {text}")

    task = asyncio.create_task(listen())
    await asyncio.wait([task, asyncio.create_task(stop.wait())], return_when=asyncio.FIRST_COMPLETED)
    task.cancel()

    # Cleanup
    print("\nstopping streams...")
    audio.stop()
    screen.stop()
    await ws.close()
    print("done.")


if __name__ == "__main__":
    asyncio.run(main())
