import asyncio
import subprocess
import requests
import sys
from videodb.capture import CaptureClient

DEFAULT_BACKEND_URL = "http://localhost:5002"


def get_backend_url():
    """Prompt the user for the backend URL."""
    print(f"  Default backend URL: {DEFAULT_BACKEND_URL}")
    custom = input("  Enter backend URL (press Enter for default): ").strip()
    return custom if custom else DEFAULT_BACKEND_URL


def create_session(backend_url):
    """Creates a capture session via the backend."""
    try:
        print(f"Connecting to backend at {backend_url}...")
        resp = requests.post(f"{backend_url}/init-session", json={}, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.ConnectionError:
        print(f"Cannot connect to backend at {backend_url}")
        print("  Make sure the backend is running: python backend.py")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to create session: {e}")
        sys.exit(1)


async def run_capture(token, session_id):
    """Captures screen and system audio, streaming to VideoDB continuously."""
    print("\n--- Starting Capture Client ---")
    client = CaptureClient(client_token=token)

    # Prevent macOS from sleeping during the capture
    caffeinate_proc = subprocess.Popen(["caffeinate", "-dims"])
    print("caffeinate started (preventing sleep)")

    try:
        print("Requesting Permissions...")
        await client.request_permission("screen_capture")

        print("\nDiscovering Channels...")
        channels = await client.list_channels()
        for ch in channels.all():
            print(f"  - {ch.id} ({ch.type}): {ch.name}")

        display = channels.displays.default
        system_audio = channels.system_audio.default

        # store=True saves the recording to VideoDB after capture stops.
        # Without this, streams are processed in real-time but not persisted.
        display.store = True
        system_audio.store = True
        selected_channels = [c for c in [display, system_audio] if c]
        if not selected_channels:
            print("No channels found.")
            return

        print(f"\nStarting Recording with {len(selected_channels)} channel(s):")
        for ch in selected_channels:
            print(f"  - {ch.type}: {ch.id}")

        await client.start_session(
            capture_session_id=session_id,
            channels=selected_channels,
            primary_video_channel_id=display.id if display else None,
        )

        print("\nStreaming 24/7... (Ctrl+C to stop)")

        # Run indefinitely until interrupted
        while True:
            await asyncio.sleep(3600)
            print("  Still streaming...")

    except Exception as e:
        print(f"Capture error: {e}")
    finally:
        caffeinate_proc.terminate()
        print("caffeinate stopped")


async def main():
    print("=" * 60)
    print("VideoDB Capture Client - Python Quickstart")
    print("=" * 60)

    backend_url = get_backend_url()
    session_data = create_session(backend_url)
    token = session_data["token"]
    session_id = session_data["session_id"]
    print("Session created successfully")
    print(f"  Token: {token[:10]}...")
    print(f"  Session ID: {session_id}\n")

    await run_capture(token, session_id)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nForce quit. The server will detect the disconnect and clean up.")
        sys.exit(1)
