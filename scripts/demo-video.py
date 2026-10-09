#!/usr/bin/env python3
"""Record a real Chromium + local ONNX inference demo, without mock responses.

Uses a loopback-only Vite preview. First run downloads the model from Hugging Face.
Creates an MP4 suitable for an optional public challenge demo. No accounts/posts.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:4178/"


def wait_server(server: subprocess.Popen) -> None:
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError(f"Preview exited early ({server.returncode})")
        try:
            with urlopen(URL, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(.2)
    raise TimeoutError("Local preview failed to start")


def run(timeout: int, output: Path) -> None:
    if not shutil.which("chromium") or not shutil.which("ffmpeg"):
        raise RuntimeError("Chromium and ffmpeg are required")
    output.parent.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        ["npm", "run", "preview", "--", "--port", "4178", "--strictPort"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )
    try:
        wait_server(server)
        with tempfile.TemporaryDirectory(prefix="one-minute-outside-demo-") as temp:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=shutil.which("chromium"), headless=True,
                    args=["--no-sandbox"]
                )
                try:
                    context = browser.new_context(
                        viewport={"width": 1280, "height": 800},
                        record_video_dir=temp,
                        record_video_size={"width": 1280, "height": 800},
                        reduced_motion="reduce",
                    )
                    try:
                        # Prewarm the model in the same browser context. The warmup
                        # page's video is discarded; the public demo is the next page.
                        warmup = context.new_page()
                        warmup.goto(URL)
                        warmup.locator("#mood").fill("I feel tired and want to hear birds")
                        warmup.locator("#access").select_option("seated")
                        warmup.locator("#go").click()
                        warmup.locator("#result").wait_for(state="visible", timeout=timeout)
                        warmup.close()

                        page = context.new_page()
                        video = page.video
                        page.goto(URL)
                        page.wait_for_timeout(1400)
                        page.locator("#mood").fill(
                            "I feel tired and want to hear birds in a peaceful place"
                        )
                        page.locator("#access").select_option("seated")
                        page.wait_for_timeout(900)
                        page.locator("#go").click()
                        page.locator("#result").wait_for(state="visible", timeout=timeout)
                        assert page.locator("#model-status").inner_text().startswith("Ready.")
                        page.wait_for_timeout(1800)
                        page.locator("#journal-open").click()
                        page.locator("#observation").fill(
                            "I heard two birds answer each other behind the leaves."
                        )
                        page.wait_for_timeout(900)
                        page.locator("#journal-form button[type=submit]").click()
                        page.wait_for_timeout(1700)
                        assert "I heard two birds answer" in page.locator("#journal-list").inner_text()
                        page.close()
                        source = Path(video.path())
                    finally:
                        context.close()
                finally:
                    browser.close()

            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-i", str(source), "-c:v", "libx264", "-crf", "23",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)],
                check=True
            )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=120000)
    parser.add_argument("--output", type=Path,
                        default=ROOT / "artifacts" / "one-minute-outside-demo.mp4")
    args = parser.parse_args()
    run(args.timeout, args.output)
    print(f"Real-model Chromium demo saved to {args.output} ({args.output.stat().st_size} bytes)")
