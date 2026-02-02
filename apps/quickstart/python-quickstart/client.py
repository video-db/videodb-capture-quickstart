import asyncio
import logging
import requests
import signal
import sys
from videodb.capture import CaptureClient

# Config
BACKEND_URL = "http://localhost:5002"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def init_session():
    """Requests backend to create a session."""
    try:
        resp = requests.post(f"{BACKEND_URL}/init-session", json={})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to init session. Is backend running? Error: {e}")
        sys.exit(1)


async def run_capture(token, session_id):
    """Runs the CaptureClient with the provided token and session_id."""
    print("\n🎥 --- Starting Capture Client ---")

    # Initialize Client
    client = CaptureClient(client_token=token)

    # Stop event for graceful shutdown
    stop_event = asyncio.Event()

    def handle_signal():
        print("\n⚠️ Signal received, stopping...")
        stop_event.set()

    # Register signal handlers
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            # Signal handlers not supported on Windows loop
            pass

    try:
        print("🔒 Requesting Permissions...")
        await client.request_permission("microphone")
        await client.request_permission("screen_capture")

        print("\n📡 Discovering Channels...")
        channels = await client.channels()

        # Select sources
        mic = channels.mics.default
        display = channels.displays.primary
        system_audio = channels.system_audio.default

        selected_channels = [c for c in [mic, display, system_audio] if c]
        if not selected_channels:
            print("❌ No channels found.")
            return

        print(f"\n🔴 Starting Recording with {len(selected_channels)} channels...")
        for ch in selected_channels:
            print(f"   - {ch.name} ({ch.kind})")

        # Start Capture
        await client.start_capture_session(
            capture_session_id=session_id,
            channels=selected_channels,
            primary_video_channel_id=display.name if display else None,
        )

        print("⏳ Recording... Press Ctrl+C to stop.")

        # Wait for stop signal
        await stop_event.wait()

    except asyncio.CancelledError:
        print("\n⏹️ Capture Cancelled")
    except Exception as e:
        print(f"❌ Capture Error: {e}")
    finally:
        # Cleanup
        if client:
            print("\n⏹️ Stopping Capture...")
            try:
                await client.stop_capture()
                print("✅ Capture STOPPED")
            except Exception as e:
                print(f"⚠️ Error stopping capture: {e}")

            await client.shutdown()
            print("👋 Client Shutdown")


async def main():
    # 1. Create Session via Backend
    print("✨ Requesting Session from Backend...")
    session_data = await init_session()
    token = session_data["token"]
    session_id = session_data["session_id"]
    print(f"🔑 Received Token: {token[:10]}...")
    print(f"📋 Session ID: {session_id}")

    # 2. Start Capture
    await run_capture(token, session_id)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
