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
        print(f"📡 Connecting to backend at {BACKEND_URL}...")
        resp = requests.post(f"{BACKEND_URL}/init-session", json={}, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to backend at {BACKEND_URL}")
        print("   Make sure the backend is running: python backend.py")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to init session: {e}")
        sys.exit(1)


async def run_capture(token, session_id):
    """Runs the CaptureClient with the provided token and session_id."""
    print("\n🎥 --- Starting Capture Client ---")

    # Initialize Client
    client = CaptureClient(client_token=token)

    # Stop event for graceful shutdown
    stop_event = asyncio.Event()
    cleanup_done = asyncio.Event()

    def handle_signal():
        logger.debug("Signal handler triggered (SIGINT/SIGTERM)")
        print("\n⚠️ Signal received, initiating graceful shutdown...")
        stop_event.set()
        logger.debug("Stop event set, will proceed to cleanup")

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
        channels = await client.list_channels()

        # Select sources
        mic = channels.mics.default
        display = channels.displays.default
        system_audio = channels.system_audio.default

        selected_channels = [c for c in [mic, display, system_audio] if c]
        if not selected_channels:
            print("❌ No channels found.")
            return

        print(f"\n🔴 Starting Recording with {len(selected_channels)} channel(s):")
        for ch in selected_channels:
            print(f"   • {ch.type}: {ch.id}")

        # Start Capture
        await client.start_capture_session(
            capture_session_id=session_id,
            channels=selected_channels,
            primary_video_channel_id=display.id if display else None,
        )

        print("⏳ Recording... Press Ctrl+C to stop.")

        # Wait for stop signal
        await stop_event.wait()

    except asyncio.CancelledError:
        print("\n⏹️  Capture Cancelled")
    except KeyboardInterrupt:
        print("\n⏹️  Capture stopped by user")
    except Exception as e:
        print(f"❌ Capture Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Robust cleanup sequence
        if client:
            print("\n⏹️ Stopping Capture...")
            binary_already_exited = False

            try:
                # Step 1: Stop capture with timeout
                # The binary might have already received SIGINT, so we use a timeout
                print("   📤 Sending stop signal to server...")
                logger.debug("Calling client.stop_capture()...")
                await asyncio.wait_for(client.stop_capture(), timeout=5.0)
                logger.debug("client.stop_capture() completed successfully")
                print("   ✅ Stop signal sent successfully")

                # Step 2: Wait briefly for the server to finalize
                # This ensures the server receives the stop command and processes it
                print("   ⏳ Waiting for server to finalize...")
                await asyncio.sleep(3)

                print("   ✅ Capture stopped successfully")
            except asyncio.TimeoutError:
                logger.warning("client.stop_capture() timed out - binary likely died from SIGINT")
                print("   ⚠️ Stop command timed out (binary may have already exited)")
                print("   ⏳ Giving server extra time to detect disconnect...")
                binary_already_exited = True
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"Exception during stop_capture(): {e}", exc_info=True)
                print(f"   ⚠️ Error during stop: {e}")
                print("   ⏳ Giving server time to clean up...")
                await asyncio.sleep(3)
            finally:
                # Step 3: Shutdown client (releases resources, closes IPC)
                # Skip shutdown if binary already exited to prevent SDK from restarting it
                if binary_already_exited:
                    logger.info("Skipping client.shutdown() to prevent binary restart")
                    print("   ⚠️ Skipping shutdown call (binary already terminated)")
                else:
                    try:
                        print("   🔌 Shutting down client...")
                        logger.debug("Calling client.shutdown()...")
                        await asyncio.wait_for(client.shutdown(), timeout=3.0)
                        logger.debug("client.shutdown() completed successfully")
                        print("   👋 Client shutdown complete")
                    except asyncio.TimeoutError:
                        logger.warning("client.shutdown() timed out after 3 seconds")
                        print("   ⚠️ Shutdown timed out (binary already terminated)")
                    except Exception as e:
                        logger.error(f"Exception during shutdown(): {e}", exc_info=True)
                        print(f"   ⚠️ Error during shutdown: {e}")

        cleanup_done.set()
        logger.info("Cleanup sequence complete")
        print("\n✅ Cleanup complete. Session should be stopped on server.")


async def main():
    # 1. Create Session via Backend
    print("=" * 60)
    print("🚀 VideoDB Capture Client - Python Quickstart")
    print("=" * 60)

    session_data = await init_session()
    token = session_data["token"]
    session_id = session_data["session_id"]
    print("✅ Session created successfully")
    print(f"   🔑 Token: {token[:10]}...")
    print(f"   📋 Session ID: {session_id}\n")

    # 2. Start Capture
    try:
        await run_capture(token, session_id)
    except KeyboardInterrupt:
        print("\n⏹️  Interrupted, cleaning up...")
        # The finally block in run_capture will handle cleanup
        pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        # Double Ctrl+C protection - if user is really impatient
        print("\n⚠️  Force quit detected. Session may be left orphaned.")
        sys.exit(1)
